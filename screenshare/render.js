// Render de "Pantalla Compartida": cámara arriba, franja de subtítulos al medio, pantalla abajo.
// Mismos cortes de B Edit (silencios/muletillas, sensibilidad "fuerte") aplicados a ambos videos
// a la vez; sin zooms; audio solo de la cámara; música igual que B Edit. Servicio aislado:
// no comparte cola ni almacenamiento con el motor principal ni con Green Screen.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { PRESET } from '../config.js';
import { drawSubtitle, plainText } from '../draw.js';
import { outToSrc } from '../cuts.js';
import { registerFonts } from './fonts.js';
import { run, lowPriority, alignFilter, measureLoudnorm, integratedLufs } from '../media.js';

const FPS = 30, W = 1080, H = 1920;
// Plantilla fija: cámara arriba, franja central para subtítulos, pantalla abajo.
// Franja más angosta y paneles más grandes (ambos del mismo tamaño, siempre en la misma posición).
const CAM_H = 865, BAR_H = 190, SCREEN_H = 865; // 865 + 190 + 865 = 1920
const BAR_Y = CAM_H; // y donde empieza la franja
const f4 = (x) => Number(x).toFixed(5);

/** Tramos que se quedan, alineados a 30 fps (igual criterio que el motor principal). */
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

function contain(info) {
  // Ajusta "conteniendo" el panel (sin recortar nada del encuadre original);
  // lo que sobra de espacio se rellena en negro.
  return (panelW, panelH) => {
    const base = Math.min(panelW / info.width, panelH / info.height);
    return { W0: info.width * base, H0: info.height * base };
  };
}

/** [idx:v] → panel WxpanelH, respetando los mismos cortes `sel`. Respeta el encuadre
 * original del video (sin zoom/recorte); rellena en negro lo que sobre del panel. */
function panelGraph(idx, info, sel, panelW, panelH, label) {
  const { W0, H0 } = contain(info)(panelW, panelH);
  const w2 = Math.round(W0 / 2) * 2, h2 = Math.round(H0 / 2) * 2;
  return `[${idx}:v]setpts=PTS-STARTPTS,fps=${FPS},select='${sel}',setpts=N/(${FPS}*TB),`
    + `scale=w=${w2}:h=${h2}:flags=bicubic,`
    + `pad=${panelW}:${panelH}:(${panelW}-${w2})/2:(${panelH}-${h2})/2:color=black,`
    + `setsar=1,format=yuv420p[${label}]`;
}

async function buildVoice(dir, cameraInput, info, q) {
  registerFontsOnce();
  const outDur = q.frames / FPS;
  const voice = path.join(dir, 'voice.wav');
  const pre = path.join(dir, 'voice_pre.wav');
  const align = alignFilter(info);
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
  parts.push(`${q.segs.map((_, i) => `[s${i}]`).join('')}concat=n=${N}:v=0:a=1,apad=whole_dur=${f4(outDur)},atrim=end=${f4(outDur)},acompressor=threshold=0.0501:ratio=3:attack=5:release=150:makeup=1:knee=2.8[a]`);
  const graph = parts.join(';');
  await run('ffmpeg', ['-y', '-v', 'error', '-nostats', '-i', cameraInput, '-filter_complex', graph, '-map', '[a]', '-ar', '48000', '-c:a', 'pcm_f32le', pre]);
  const m = await measureLoudnorm(pre);
  const ln = `loudnorm=I=-14:TP=-1:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  await run('ffmpeg', ['-y', '-v', 'error', '-i', pre, '-af', `${ln},aresample=48000,aformat=channel_layouts=stereo,alimiter=limit=0.89:level=disabled`, '-ar', '48000', '-c:a', 'pcm_f32le', voice]);
  return { voice, outDur };
}

let fontsRegistered = false;
function registerFontsOnce() { if (!fontsRegistered) { fontsRegistered = true; registerFonts(); } }

export async function renderScreenShare({ cameraInput, screenInput, dir, cameraInfo, screenInfo, plan, musicPath = null }) {
  registerFontsOnce();
  const q = quantizeKeep(plan.keep, plan.duration);
  if (!q.frames) throw new Error('Los cortes dejaron menos de medio segundo de video.');
  const outDur = q.frames / FPS;
  const { voice } = await buildVoice(dir, cameraInput, cameraInfo, q);

  const sel = q.segs.map((s) => `between(n,${s.sf},${s.ef - 1})`).join('+');
  const camGraph = panelGraph(0, cameraInfo, sel, W, CAM_H, 'cam');
  const scrGraph = panelGraph(1, screenInfo, sel, W, SCREEN_H, 'scr');
  const stackGraph = `color=c=black:s=${W}x${BAR_H}:r=${FPS}[bar];[cam][bar][scr]vstack=inputs=3,format=yuv420p[base]`;

  // overlay de subtítulos (RGBA, un cuadro por cuadro de salida, igual técnica que el motor principal)
  // orden de entradas ffmpeg: 0=cámara, 1=pantalla, 2=overlay rgba (stdin), 3=voz, 4=música (si hay)
  let audioFilter, musicArgs = [];
  if (musicPath) {
    const mm = await measureLoudnorm(musicPath);
    const gain = Math.max(-30, Math.min(30, -14 - 15 - Number(mm.input_i)));
    musicArgs = ['-stream_loop', '-1', '-i', musicPath];
    audioFilter = `[4:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${f4(outDur)},asetpts=PTS-STARTPTS,volume=${gain.toFixed(2)}dB,`
      + `afade=t=in:st=0:d=0.01,afade=t=out:st=${f4(Math.max(0, outDur - 1))}:d=1[m];`
      + `[3:a]aresample=48000,aformat=channel_layouts=stereo[v];[v][m]amix=inputs=2:duration=first:dropout_transition=0,volume=2,alimiter=limit=0.89:level=disabled[aout]`;
  } else {
    audioFilter = `[3:a]aresample=48000,aformat=channel_layouts=stereo,anull[aout]`;
  }

  const graph = [camGraph, scrGraph, stackGraph, `[base][2:v]overlay=0:0:format=auto:eof_action=repeat,format=yuv420p[vout]`, audioFilter].join(';');
  const out = path.join(dir, 'result.mp4');
  const args = [
    '-y', '-v', 'error', '-nostats', '-progress', 'pipe:1',
    '-i', cameraInput, '-i', screenInput,
    '-thread_queue_size', '64', '-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', `${W}x${H}`, '-framerate', String(FPS), '-i', 'pipe:0',
    '-i', voice, ...musicArgs,
    '-filter_complex', graph,
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', process.env.X264_PRESET || 'veryfast', '-crf', process.env.X264_CRF || '19',
    '-pix_fmt', 'yuv420p', '-r', String(FPS), '-g', '60',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-t', f4(outDur), '-movflags', '+faststart', out,
  ];
  const [c0, a0] = lowPriority('ffmpeg', args);
  const { spawn } = await import('node:child_process');
  const ff = spawn(c0, a0, { stdio: ['pipe', 'pipe', 'pipe'] });
  let err = '';
  ff.stderr.on('data', (d) => { err = (err + d).slice(-8000); });
  const done = new Promise((res, rej) => {
    ff.on('error', rej);
    ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg falló (${c})\n${err}`))));
  });
  done.catch(() => {});

  const cv = createCanvas(W, H);
  const g = cv.getContext('2d');
  const blank = Buffer.alloc(W * H * 4);
  const S = { ...PRESET.subtitle, centerYPct: (BAR_Y + BAR_H / 2) / H };
  const ps = plan.phrases;
  let lastSig = null, lastBuf = blank;
  for (let i = 0; i < q.frames; i++) {
    const tSrc = outToSrc(q.keep, (i + 0.5) / FPS);
    let active = -1;
    for (let k = 0; k < ps.length; k++) { if (tSrc >= ps[k].start && tSrc < ps[k].end) { active = k; break; } }
    const sig = active >= 0 ? String(active) : '';
    if (sig !== lastSig) {
      lastSig = sig;
      if (active < 0) lastBuf = blank;
      else {
        g.clearRect(0, 0, W, H);
        drawSubtitle(g, W, H, plainText(ps[active].text), S, { x: 0.5, y: S.centerYPct });
        const d = g.getImageData(0, 0, W, H).data;
        lastBuf = Buffer.from(d.buffer, d.byteOffset, d.byteLength);
      }
    }
    if (!ff.stdin.write(lastBuf)) await Promise.race([new Promise((r) => ff.stdin.once('drain', r)), done]);
  }
  ff.stdin.end();
  await done;
  const ln = await integratedLufs(out);
  return { file: out, duration: outDur, lufs: ln.lufs, peak: ln.peak, cuts: q.segs.length - 1 };
}
