// Render final: cortes + zoom + subtítulos + audio parejo + música, todo con ffmpeg (CPU, calidad alta).
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createCanvas } from '@napi-rs/canvas';
import { PRESET } from './core/config.js';
import { drawOverlay } from './core/draw.js';
import { outToSrc } from './core/cuts.js';
import { registerFonts } from './fonts.js';
import { run, lowPriority, alignFilter, measureLoudnorm, integratedLufs } from './media.js';

const FPS = 30;
const W = PRESET.output.width, H = PRESET.output.height;
const MUSIC_BELOW_DB = Number(process.env.MUSIC_BELOW_DB || 18);   // la música queda así de dB bajo la voz
const f4 = (x) => Number(x).toFixed(5);

/** Tramos que se quedan, alineados a la grilla de 30 fps (video y audio quedan con el mismo largo exacto). */
export function quantizeKeep(keep, duration) {
  const maxF = Math.floor(duration * FPS + 1e-6);
  const segs = [];
  for (const k of keep) {
    const sf = Math.max(0, Math.round(k.s * FPS));
    const ef = Math.min(maxF, Math.round(k.e * FPS));
    if (ef <= sf) continue;
    const last = segs[segs.length - 1];
    if (last && sf <= last.ef) last.ef = Math.max(last.ef, ef); else segs.push({ sf, ef });
  }
  let o = 0;
  for (const s of segs) { s.of = o; o += s.ef - s.sf; }
  return { segs, frames: o, keep: segs.map((s) => ({ s: s.sf / FPS, e: s.ef / FPS, o: s.of / FPS })) };
}

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
  const hdr = info.hdr && (process.env.HDR_MODE || 'tonemap') === 'tonemap';
  const tm = hdr
    ? ',zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p'
    : '';
  return [
    `[0:v]setpts=PTS-STARTPTS,fps=${FPS},select='${sel}',setpts=N/(${FPS}*TB),`
    + `scale=w='trunc(${f4(W0)}*${z}/2)*2':h='trunc(${f4(H0)}*${z}/2)*2':eval=frame:flags=bicubic,`
    + `crop=${W}:${H}:'(trunc(${f4(W0)}*${z}/2)*2-${W})/2':'(trunc(${f4(H0)}*${z}/2)*2-${H})/2',format=yuv420p${tm}[vz]`,
    `[vz][1:v]overlay=0:0:format=auto:eof_action=repeat,format=yuv420p[vout]`,
  ];
}

async function buildVoice(dir, input, info, q) {
  const outDur = q.frames / FPS;
  const align = alignFilter(info);
  const pre = path.join(dir, 'voice_pre.wav');
  const voice = path.join(dir, 'voice.wav');
  const comp = 'acompressor=threshold=0.0501:ratio=3:attack=5:release=150:makeup=1:knee=2.8';
  let graph;
  const args = ['-y', '-v', 'error', '-nostats'];
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
  const script = path.join(dir, 'audio.graph');
  await fs.writeFile(script, graph);
  if (info.hasAudio) args.push('-i', input);
  args.push('-filter_complex_script', script, '-map', '[a]', '-ar', '48000', '-c:a', 'pcm_f32le', pre);
  await run('ffmpeg', args);
  const m = await measureLoudnorm(pre);
  const ln = `loudnorm=I=-14:TP=-1:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  await run('ffmpeg', ['-y', '-v', 'error', '-i', pre, '-af', `${ln},aresample=48000,aformat=channel_layouts=stereo,alimiter=limit=0.89:level=disabled`, '-ar', '48000', '-c:a', 'pcm_f32le', voice]);
  return { voice, outDur, measured: m };
}

export async function renderVideo({ dir, input, info, plan, music, onProgress }) {
  registerFonts();
  const q = quantizeKeep(plan.keep, info.duration);
  if (!q.frames) throw new Error('No quedó nada de video después de los cortes');
  const { voice, outDur } = await buildVoice(dir, input, info, q);
  onProgress?.(0.05);

  // música
  let musicArgs = [], audioFilter;
  if (music) {
    const mm = await measureLoudnorm(music.path);
    const gain = Math.max(-30, Math.min(30, -14 - MUSIC_BELOW_DB - Number(mm.input_i)));
    musicArgs = ['-stream_loop', '-1', '-i', music.path];
    audioFilter = `[3:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${f4(outDur)},asetpts=PTS-STARTPTS,volume=${gain.toFixed(2)}dB,`
      + `afade=t=in:st=0:d=0.05,afade=t=out:st=${f4(Math.max(0, outDur - 1))}:d=1[m];`
      + `[2:a]aresample=48000,aformat=channel_layouts=stereo[v];[v][m]amix=inputs=2:duration=first:dropout_transition=0,volume=2,alimiter=limit=0.89:level=disabled[aout]`;
  } else {
    audioFilter = `[2:a]aresample=48000,aformat=channel_layouts=stereo,anull[aout]`;
  }
  const graph = [...videoGraph(info, q, plan.zoomEvents), audioFilter].join(';');
  const script = path.join(dir, 'video.graph');
  await fs.writeFile(script, graph);

  const out = path.join(dir, 'final.mp4');
  const args = [
    '-y', '-v', 'error', '-nostats', '-progress', 'pipe:1',
    '-i', input,
    '-thread_queue_size', '64', '-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', `${W}x${H}`, '-framerate', String(FPS), '-i', 'pipe:0',
    '-i', voice, ...musicArgs,
    '-filter_complex_script', script,
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', process.env.X264_PRESET || 'slow', '-crf', process.env.X264_CRF || '17',
    '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-g', '60',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-t', f4(outDur), '-movflags', '+faststart', out,
  ];
  const thr = process.env.THREADS ? ['-filter_complex_threads', process.env.THREADS] : [];
  args.splice(1, 0, ...thr);
  if (process.env.THREADS) args.splice(args.indexOf('-movflags'), 0, '-threads', process.env.THREADS);
  const [c0, a0] = lowPriority('ffmpeg', args);
  const ff = spawn(c0, a0, { stdio: ['pipe', 'pipe', 'pipe'] });
  let err = '';
  ff.stderr.on('data', (d) => { err = (err + d).slice(-8000); });
  ff.stdout.on('data', (d) => {
    const m = String(d).match(/out_time_us=(\d+)/g);
    if (m) onProgress?.(0.05 + 0.95 * Math.min(1, Number(m[m.length - 1].split('=')[1]) / 1e6 / outDur));
  });
  const done = new Promise((res, rej) => {
    ff.on('error', rej);
    ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg falló (${c})\n${err}`))));
  });
  done.catch(() => {});
  let stdinErr = null;
  ff.stdin.on('error', (e) => { stdinErr = e; });

  // overlay: un cuadro RGBA por cuadro de salida (se reutiliza mientras no cambie nada)
  const cv = createCanvas(W, H);
  const g = cv.getContext('2d');
  const blank = Buffer.alloc(W * H * 4);
  let lastSig = null, lastBuf = blank;
  const ps = plan.phrases;
  const pop = PRESET.highlight.popSec + 0.05;
  for (let i = 0; i < q.frames; i++) {
    if (stdinErr) break;
    const tSrc = outToSrc(q.keep, (i + 0.5) / FPS);
    const act = [];
    let anim = '';
    for (let k = 0; k < ps.length; k++) {
      if (tSrc >= ps[k].start && tSrc < ps[k].end) { act.push(k); if (ps[k].kind === 'dest' && tSrc - ps[k].start < pop) anim = i; }
    }
    const sig = act.length ? act.join(',') + '|' + anim : '';
    if (sig !== lastSig) {
      lastSig = sig;
      if (!act.length) lastBuf = blank;
      else {
        drawOverlay(g, W, H, tSrc, ps);
        const d = g.getImageData(0, 0, W, H).data;
        lastBuf = Buffer.from(d.buffer, d.byteOffset, d.byteLength);
      }
    }
    if (!ff.stdin.write(lastBuf)) await Promise.race([new Promise((r) => ff.stdin.once('drain', r)), done]);
  }
  ff.stdin.end();
  await done;
  const ln = await integratedLufs(out);
  return { file: out, frames: q.frames, duration: outDur, lufs: ln.lufs, peak: ln.peak, segments: q.segs.length };
}
