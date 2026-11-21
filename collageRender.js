// Render del formato "Talking head + collage de imágenes": reusa los módulos puros
// compartidos (core/config.js, core/draw.js, core/cuts.js) y la misma técnica de
// cortes+zoom+overlay-por-cuadro que ya usa Talking Head (render.js), pero en su
// propio archivo para no tocar el render de Talking Head.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { PRESET } from './core/config.js';
import { drawSubtitle } from './core/draw.js';
import { outToSrc } from './core/cuts.js';
import { registerFonts } from './fonts.js';
import { run, lowPriority, alignFilter, measureLoudnorm, integratedLufs } from './media.js';
import { quantizeKeep } from './render.js';
import { windowAt } from './collageSelect.js';

const FPS = PRESET.output.fps;
const W = PRESET.output.width, H = PRESET.output.height;
const f4 = (x) => Number(x).toFixed(5);

const KARAOKE_STYLE = { fontFamily: 'Inter', fontWeight: 900, sizePct: 0.05, tracking: -0.02, maxLines: 1, maxWidthPct: 0.86, lineHeight: 1.18, fill: '#ffffff', shadow: { color: 'rgba(0,0,0,0.55)', blur: 0.32, offsetY: 0.06 } };
const TITLE_STYLE = { fontFamily: 'Inter', fontWeight: 800, sizePct: 0.034, tracking: -0.02, maxLines: 2, maxWidthPct: 0.84, lineHeight: 1.16, fill: '#ffffff', shadow: { color: 'rgba(0,0,0,0.55)', blur: 0.3, offsetY: 0.05 } };

function zoomExpr(events) {
  if (!events.length) return '1';
  const terms = events.map((e) => {
    const d = e.t1 - e.t0, dz = f4(e.to - e.from);
    const p = `(t-${f4(e.t0)})/${f4(d)}`;
    const k = e.ease === 'out' ? `(1-pow(1-${p},3))` : `(0.5-0.5*cos(PI*${p}))`;
    return `if(lt(t,${f4(e.t0)}),0,if(lt(t,${f4(e.t1)}),${dz}*${k},${dz}))`;
  });
  return `(1+${terms.join('+')})`;
}
function videoGraph(info, q, zooms) {
  const base = Math.max(W / info.width, H / info.height);
  const W0 = info.width * base, H0 = info.height * base;
  const z = zoomExpr(zooms);
  const sel = q.segs.map((s) => `between(n,${s.sf},${s.ef - 1})`).join('+');
  return [
    `[0:v]setpts=PTS-STARTPTS,fps=${FPS},select='${sel}',setpts=N/(${FPS}*TB),`
    + `scale=w='trunc(${f4(W0)}*${z}/2)*2':h='trunc(${f4(H0)}*${z}/2)*2':eval=frame:flags=bicubic,`
    + `crop=${W}:${H}:'(trunc(${f4(W0)}*${z}/2)*2-${W})/2':'(trunc(${f4(H0)}*${z}/2)*2-${H})/2',format=yuv420p[vz]`,
    `[vz][1:v]overlay=0:0:format=auto:eof_action=repeat,format=yuv420p[vout]`,
  ];
}

/** Corta los silencios (igual que Talking Head) y normaliza el audio; sin música en este formato. */
async function buildVoice(dir, input, info, q) {
  const outDur = q.frames / FPS;
  const align = alignFilter(info);
  const pre = path.join(dir, `collage_voice_pre_${crypto.randomBytes(4).toString('hex')}.wav`);
  const comp = 'acompressor=threshold=0.0501:ratio=3:attack=5:release=150:makeup=1:knee=2.8';
  const args = ['-y', '-v', 'error', '-nostats'];
  let graph;
  if (!info.hasAudio) {
    graph = `anullsrc=r=48000:cl=stereo,atrim=0:${f4(outDur)}[a]`;
  } else {
    const N = q.segs.length;
    const fade = 0.006;
    const parts = [`[0:a]${align},aresample=48000,aformat=channel_layouts=stereo,${N > 1 ? `asplit=${N}` : 'anull'}${q.segs.map((_, i) => `[a${i}]`).join('')}`];
    q.segs.forEach((s, i) => {
      const len = (s.ef - s.sf) / FPS;
      let f = `[a${i}]atrim=start=${f4(s.sf / FPS)}:end=${f4(s.ef / FPS)},asetpts=PTS-STARTPTS`;
      if (i > 0) f += `,afade=t=in:st=0:d=${fade}`;
      if (i < N - 1) f += `,afade=t=out:st=${f4(Math.max(0, len - fade))}:d=${fade}`;
      parts.push(`${f}[s${i}]`);
    });
    parts.push(`${q.segs.map((_, i) => `[s${i}]`).join('')}concat=n=${N}:v=0:a=1,apad=whole_dur=${f4(outDur)},atrim=end=${f4(outDur)},${comp}[a]`);
    graph = parts.join(';');
  }
  if (info.hasAudio) args.push('-i', input);
  args.push('-filter_complex', graph, '-map', '[a]', '-ar', '48000', '-c:a', 'pcm_f32le', pre);
  await run('ffmpeg', args);
  const m = await measureLoudnorm(pre);
  const ln = `loudnorm=I=-14:TP=-1:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  const voice = path.join(dir, `collage_voice_${crypto.randomBytes(4).toString('hex')}.wav`);
  await run('ffmpeg', ['-y', '-v', 'error', '-nostats', '-i', pre, '-af', `${ln},aresample=48000,aformat=channel_layouts=stereo,alimiter=limit=0.89:level=disabled`, '-ar', '48000', '-c:a', 'pcm_f32le', voice]);
  await fs.rm(pre, { force: true });
  return { voice, outDur };
}

function gridLayout(count) { return count === 6 ? { cols: 3, rows: 2 } : { cols: count, rows: 1 }; }
function bandRect(position, rows) {
  const marginX = W * 0.045, gap = W * 0.018;
  if (position === 'arriba') {
    const bandH = rows === 1 ? H * 0.27 : H * 0.40;
    return { x: marginX, y: H * 0.055, w: W - marginX * 2, h: bandH, gap };
  }
  const bandH = rows === 1 ? H * 0.17 : H * 0.29;
  return { x: marginX, y: H - bandH - H * 0.05, w: W - marginX * 2, h: bandH, gap };
}
function drawCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale, sh = h / scale;
  const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}
function drawCollage(ctx, images, position, count, title) {
  const { cols, rows } = gridLayout(count);
  const band = bandRect(position, rows);
  const cellW = (band.w - band.gap * (cols - 1)) / cols;
  const cellH = (band.h - band.gap * (rows - 1)) / rows;
  images.forEach((img, i) => {
    if (!img) return;
    const col = i % cols, row = Math.floor(i / cols);
    const x = band.x + col * (cellW + band.gap), y = band.y + row * (cellH + band.gap);
    drawCover(ctx, img, x, y, cellW, cellH);
  });
  if (title) {
    const yFrac = position === 'arriba' ? (band.y + band.h) / H + 0.035 : 0.065;
    drawSubtitle(ctx, W, H, title, TITLE_STYLE, { x: 0.5, y: yFrac });
  }
}

export async function renderCollageVideo({ dir, input, info, plan, collagePlan, onProgress, signal }) {
  registerFonts();
  const q = quantizeKeep(plan.keep, info.duration);
  if (!q.frames) throw new Error('No quedó nada de video después de los cortes');
  const renderId = crypto.randomUUID();
  const out = path.join(dir, `collage_final_${renderId}.mp4`);
  const { voice, outDur } = await buildVoice(dir, input, info, q);
  onProgress?.(0.08);

  const images = await Promise.all(collagePlan.images.map((item) => loadImage(item.file).catch(() => null)));
  const poolLen = images.length;
  const schedule = collagePlan.mode === 'dinamico' ? collagePlan.schedule : [0];

  const graph = [...videoGraph(info, q, plan.zoomEvents), `[2:a]anull[aout]`].join(';');
  const args = [
    '-y', '-v', 'error', '-nostats', '-progress', 'pipe:1',
    '-i', input,
    '-thread_queue_size', '64', '-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', `${W}x${H}`, '-framerate', String(FPS), '-i', 'pipe:0',
    '-i', voice,
    '-filter_complex', graph,
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', process.env.X264_PRESET || 'slow', '-crf', process.env.X264_CRF || '17',
    '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-g', '60',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-t', f4(outDur), '-movflags', '+faststart', out,
  ];
  const [c0, a0] = lowPriority('ffmpeg', args);
  const ff = spawn(c0, a0, { stdio: ['pipe', 'pipe', 'pipe'] });
  const abortRender = () => ff.kill('SIGTERM');
  if (signal?.aborted) abortRender();
  else signal?.addEventListener('abort', abortRender, { once: true });
  let err = '';
  ff.stderr.on('data', (d) => { err = (err + d).slice(-8000); });
  ff.stdout.on('data', (d) => {
    const m = String(d).match(/out_time_us=(\d+)/g);
    if (m) onProgress?.(0.08 + 0.92 * Math.min(1, Number(m[m.length - 1].split('=')[1]) / 1e6 / outDur));
  });
  const done = new Promise((res, rej) => {
    ff.on('error', rej);
    ff.on('close', (c) => (c === 0 && !signal?.aborted ? res() : rej(Object.assign(new Error(signal?.aborted ? 'Render cancelado' : `ffmpeg falló (${c})\n${err}`), { name: signal?.aborted ? 'AbortError' : 'Error' }))));
  });
  done.catch(() => {});
  let stdinErr = null;
  ff.stdin.on('error', (e) => { stdinErr = e; });

  const cv = createCanvas(W, H);
  const g = cv.getContext('2d');
  const blank = Buffer.alloc(W * H * 4);
  const ps = plan.phrases;
  for (let i = 0; i < q.frames; i++) {
    if (stdinErr) break;
    const tSrc = outToSrc(q.keep, (i + 0.5) / FPS);
    g.clearRect(0, 0, W, H);
    let drew = false;
    let phraseIdx = -1;
    for (let k = 0; k < ps.length; k++) if (tSrc >= ps[k].start && tSrc < ps[k].end) { phraseIdx = k; break; }
    if (phraseIdx >= 0) {
      const style = collagePlan.subtitleStyles[phraseIdx] || 'normal';
      const phrase = ps[phraseIdx];
      if (style === 'karaoke') {
        const word = (plan.words || []).find((w) => tSrc >= w.start - 1e-3 && tSrc < w.end + 1e-3 && w.start >= phrase.start - 0.05 && w.end <= phrase.end + 0.05);
        if (word) { drawSubtitle(g, W, H, (word.clean || '').toUpperCase(), KARAOKE_STYLE); drew = true; }
      } else {
        drawSubtitle(g, W, H, phrase.text, PRESET.subtitle);
        drew = true;
      }
    }
    const win = windowAt(tSrc, schedule, poolLen, collagePlan.count);
    drawCollage(g, win.map((idx) => images[idx]), collagePlan.position, collagePlan.count, collagePlan.title);
    drew = true;
    const d = g.getImageData(0, 0, W, H).data;
    const buf = drew ? Buffer.from(d.buffer, d.byteOffset, d.byteLength) : blank;
    if (!ff.stdin.write(buf)) await Promise.race([new Promise((r) => ff.stdin.once('drain', r)), done]);
  }
  ff.stdin.end();
  try {
    await done;
    if (signal?.aborted) throw Object.assign(new Error('Render cancelado'), { name: 'AbortError' });
    const ln = await integratedLufs(out);
    await fs.rm(voice, { force: true });
    await fs.rename(out, path.join(dir, 'final.mp4'));
    return { file: path.join(dir, 'final.mp4'), frames: q.frames, duration: outDur, lufs: ln.lufs, peak: ln.peak };
  } catch (error) {
    await Promise.all([fs.rm(out, { force: true }), fs.rm(voice, { force: true })]);
    throw error;
  } finally {
    signal?.removeEventListener('abort', abortRender);
  }
}
