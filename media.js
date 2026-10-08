// Utilidades de ffmpeg/ffprobe.
import { spawn } from 'node:child_process';

/** Corre los procesos pesados con prioridad baja para no molestar a los otros servicios del servidor. */
export function lowPriority(cmd, args) {
  const n = process.env.NICE ?? '10';
  return n === '0' ? [cmd, args] : ['nice', ['-n', n, cmd, ...args]];
}

export function run(cmd, args, { onStderr, input } = {}) {
  return new Promise((resolve, reject) => {
    const [c, a] = lowPriority(cmd, args);
    const p = spawn(c, a, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    let err = '';
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => { const s = d.toString(); err = (err + s).slice(-20000); onStderr?.(s); });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve({ stdout: Buffer.concat(out), stderr: err });
      else reject(new Error(`${cmd} salió con código ${code}\n${err.slice(-3000)}`));
    });
    if (input) p.stdin.end(input); else p.stdin.end();
  });
}

export async function probe(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]);
  const j = JSON.parse(stdout.toString());
  const v = j.streams.find((s) => s.codec_type === 'video');
  const a = j.streams.find((s) => s.codec_type === 'audio');
  if (!v) throw new Error('El archivo no tiene video');
  let rot = 0;
  for (const sd of v.side_data_list || []) if (sd.rotation !== undefined) rot = Number(sd.rotation);
  if (v.tags?.rotate) rot = -Number(v.tags.rotate);
  rot = ((Math.round(rot / 90) * 90) % 360 + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const [fn, fd] = String(v.avg_frame_rate || v.r_frame_rate || '30/1').split('/').map(Number);
  const duration = Number(v.duration) || Number(j.format.duration) || 0;
  const trc = v.color_transfer || '';
  return {
    width: swap ? v.height : v.width, height: swap ? v.width : v.height, rotation: rot,
    fps: fd ? fn / fd : 30, duration,
    vStart: Number(v.start_time) || 0,
    hasAudio: !!a, aStart: a ? Number(a.start_time) || 0 : 0,
    hdr: trc === 'arib-std-b67' || trc === 'smpte2084',
    codec: v.codec_name, pixFmt: v.pix_fmt,
  };
}

/** Filtro que alinea el audio con la línea de tiempo del video (el 0 del video es el 0 de todo). */
export function alignFilter(info) {
  const d = info.aStart - info.vStart;
  if (Math.abs(d) < 0.002) return 'asetpts=PTS-STARTPTS';
  if (d > 0) return `asetpts=PTS-STARTPTS,adelay=${Math.round(d * 1000)}:all=1`;
  return `atrim=start=${(-d).toFixed(4)},asetpts=PTS-STARTPTS`;
}

/** Audio mono 16 kHz alineado → archivo wav + Float32Array. */
export async function extractAudio16k(input, info, outWav) {
  if (!info.hasAudio) throw new Error('El video no tiene audio');
  await run('ffmpeg', ['-y', '-v', 'error', '-i', input, '-vn', '-af', alignFilter(info), '-ac', '1', '-ar', '16000', '-c:a', 'pcm_f32le', outWav]);
  const { stdout } = await run('ffmpeg', ['-v', 'error', '-i', outWav, '-f', 'f32le', '-ac', '1', 'pipe:1']);
  const ab = stdout.buffer.slice(stdout.byteOffset, stdout.byteOffset + stdout.byteLength - (stdout.byteLength % 4));
  return new Float32Array(ab);
}

/** Mide loudnorm (primer paso) y devuelve el JSON. */
export async function measureLoudnorm(file, pre = '') {
  const af = `${pre ? pre + ',' : ''}loudnorm=I=-14:TP=-1:LRA=11:print_format=json`;
  const { stderr } = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', af, '-f', 'null', '-']);
  const m = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/s);
  if (!m) throw new Error('No se pudo medir el volumen');
  return JSON.parse(m[0]);
}

export async function integratedLufs(file) {
  const { stderr } = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const i = stderr.lastIndexOf('Integrated loudness');
  const t = stderr.slice(i);
  const lufs = Number((t.match(/I:\s+(-?[\d.]+)\s+LUFS/) || [])[1]);
  const peak = Number((t.match(/Peak:\s+(-?[\d.]+)\s+dBFS/) || [])[1]);
  return { lufs, peak };
}
