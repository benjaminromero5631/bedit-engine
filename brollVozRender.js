// Render del formato "B-roll + voz en off": video de B-roll mudo (sin zoom,
// sin transición) + tu voz en off (con pausas de 0.2-0.3s) + subtítulo de
// una palabra centrado. Reutiliza ffmpeg/canvas igual que el resto del
// motor, pero vive aparte para no tocar Talking Head.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createCanvas } from '@napi-rs/canvas';
import { run, measureLoudnorm, lowPriority } from './media.js';
import { registerFonts } from './fonts.js';
import { drawSubtitle } from './core/draw.js';
import { PRESET } from './core/config.js';

const FPS = 30, W = PRESET.output.width, H = PRESET.output.height;
// Estilo propio de este formato (una palabra, más grande, centrada en la pantalla).
// No se toca PRESET.subtitle: ese es el de Talking Head.
const WORD_STYLE = { ...PRESET.subtitle, sizePct: 0.05, maxWords: 1, maxLines: 1 };
const CENTER = { x: 0.5, y: 0.5 };

/** Video base: concatena los pedacitos de B-roll elegidos. Mudo, sin zoom, sin transición. */
export async function renderBrollBase({ sequence, takeFiles, outputFile }) {
  if (!sequence.length) throw new Error('La secuencia de B-roll está vacía');
  const inputs = [];
  const filters = [];
  sequence.forEach((seg, i) => {
    const file = takeFiles[seg.takeId];
    if (!file) throw new Error(`No se encontró el archivo de la toma ${seg.takeId}`);
    inputs.push('-i', file);
    filters.push(
      `[${i}:v]trim=start=${seg.start.toFixed(3)}:duration=${seg.duration.toFixed(3)},setpts=PTS-STARTPTS,` +
      `fps=${FPS},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,format=yuv420p[v${i}]`
    );
  });
  const total = sequence.reduce((s, x) => s + x.duration, 0);
  filters.push(`${sequence.map((_, i) => `[v${i}]`).join('')}concat=n=${sequence.length}:v=1:a=0[base]`);
  await run('ffmpeg', [
    '-y', '-v', 'error', '-nostats', ...inputs,
    '-filter_complex', filters.join(';'), '-map', '[base]', '-an',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p',
    '-r', String(FPS), '-t', total.toFixed(3), '-movflags', '+faststart', outputFile,
  ]);
  return total;
}

/** Audio: pega los tramos de voz que se conservan con silencio real en las pausas (0.2-0.3s, nunca 0). */
export async function renderVoiceWithPauses({ input, keep, outDuration, outputFile }) {
  if (!keep.length) throw new Error('No quedó voz en off después de cortar silencios');
  const pre = `${outputFile}.pre.wav`;
  const parts = [];
  const labels = [];
  keep.forEach((k, i) => {
    parts.push(`[0:a]atrim=start=${k.s.toFixed(3)}:end=${k.e.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo[sp${i}]`);
    labels.push(`[sp${i}]`);
    if (i < keep.length - 1) {
      const gap = Math.max(0, (keep[i + 1].o - (k.o + (k.e - k.s)))).toFixed(3);
      parts.push(`anullsrc=r=48000:cl=stereo,atrim=0:${gap}[gap${i}]`);
      labels.push(`[gap${i}]`);
    }
  });
  parts.push(`${labels.join('')}concat=n=${labels.length}:v=0:a=1[a]`);
  await run('ffmpeg', ['-y', '-v', 'error', '-nostats', '-i', input, '-filter_complex', parts.join(';'), '-map', '[a]', '-ar', '48000', '-c:a', 'pcm_f32le', '-t', outDuration.toFixed(3), pre]);
  const m = await measureLoudnorm(pre);
  const ln = `loudnorm=I=-14:TP=-1:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  await run('ffmpeg', ['-y', '-v', 'error', '-i', pre, '-af', `${ln},aresample=48000,aformat=channel_layouts=stereo,alimiter=limit=0.89:level=disabled`, '-ar', '48000', '-c:a', 'pcm_f32le', outputFile]);
  await fs.rm(pre, { force: true });
}

/** Junta B-roll mudo + voz + subtítulo de una palabra (quemado cuadro por cuadro, como Talking Head). */
export async function composeBrollVoz({ dir, baseVideo, voiceAudio, phrases, outDuration, outputFile }) {
  registerFonts();
  const renderId = crypto.randomBytes(4).toString('hex');
  const tmp = path.join(dir, `final_${renderId}.mp4`);
  const frames = Math.round(outDuration * FPS);
  const args = [
    '-y', '-v', 'error', '-nostats',
    '-i', baseVideo,
    '-thread_queue_size', '64', '-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', `${W}x${H}`, '-framerate', String(FPS), '-i', 'pipe:0',
    '-i', voiceAudio,
    '-filter_complex', '[0:v]format=yuv420p[vb];[1:v]format=rgba[text];[vb][text]overlay=0:0:format=auto:eof_action=repeat,format=yuv420p[vout]',
    '-map', '[vout]', '-map', '2:a',
    '-c:v', 'libx264', '-preset', process.env.X264_PRESET || 'veryfast', '-crf', process.env.X264_CRF || '18', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-t', outDuration.toFixed(3), '-movflags', '+faststart', tmp,
  ];
  const [c0, a0] = lowPriority('ffmpeg', args);
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
  let stdinErr = null;
  ff.stdin.on('error', (e) => { stdinErr = e; });
  for (let i = 0; i < frames; i++) {
    if (stdinErr) break;
    const t = (i + 0.5) / FPS;
    const active = phrases.find((p) => t >= p.start && t < p.end);
    let buf = blank;
    if (active) {
      g.clearRect(0, 0, W, H);
      drawSubtitle(g, W, H, active.text, WORD_STYLE, CENTER);
      const d = g.getImageData(0, 0, W, H).data;
      buf = Buffer.from(d.buffer, d.byteOffset, d.byteLength);
    }
    if (!ff.stdin.write(buf)) await Promise.race([new Promise((r) => ff.stdin.once('drain', r)), done]);
  }
  ff.stdin.end();
  await done;
  await fs.rename(tmp, outputFile);
}
