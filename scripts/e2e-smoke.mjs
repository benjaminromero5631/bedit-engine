import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bedit-smoke-'));
const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${cmd} salió con código ${result.status}\n${result.stderr}`);
  return result.stdout;
};

try {
  const src = path.join(root, 'src');
  const core = path.join(src, 'core');
  const fonts = path.join(root, 'fonts');
  const dir = path.join(root, 'job');
  await Promise.all([fs.mkdir(core, { recursive: true }), fs.mkdir(fonts), fs.mkdir(dir)]);
  await fs.symlink(path.join(repo, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  for (const file of ['pipeline.js', 'render.js', 'media.js', 'transcribe.js', 'fonts.js']) {
    await fs.copyFile(path.join(repo, file), path.join(src, file));
  }
  for (const file of ['config.js', 'draw.js', 'cuts.js', 'plan.js']) {
    await fs.copyFile(path.join(repo, file), path.join(core, file));
  }
  for (const file of ['inter-latin-600-normal.woff2', 'inter-latin-800-normal.woff2', 'inter-latin-900-normal.woff2', 'playfair-display-latin-400-italic.woff2']) {
    await fs.copyFile(path.join(repo, file), path.join(fonts, file));
  }

  const [{ processJob }, { probe }, { keepFromCuts }, { quantizeKeep }] = await Promise.all([
    import(pathToFileURL(path.join(src, 'pipeline.js'))),
    import(pathToFileURL(path.join(src, 'media.js'))),
    import(pathToFileURL(path.join(core, 'cuts.js'))),
    import(pathToFileURL(path.join(src, 'render.js'))),
  ]);

  const sampleRate = 48000, sourceDuration = 5, sampleCount = sampleRate * sourceDuration;
  const samples = Buffer.alloc(sampleCount * 2);
  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleRate;
    let value = 0;
    if ((t >= 0.5 && t < 1.5) || (t >= 3 && t < 4)) value = 0.1 * Math.sin(2 * Math.PI * 180 * t);
    else if (t >= 2.05 && t < 2.25) value = 0.4 * Math.sin(2 * Math.PI * 900 * t);
    samples.writeInt16LE(Math.round(value * 32767), i * 2);
  }
  const wavHeader = Buffer.alloc(44);
  wavHeader.write('RIFF', 0); wavHeader.writeUInt32LE(36 + samples.length, 4); wavHeader.write('WAVE', 8);
  wavHeader.write('fmt ', 12); wavHeader.writeUInt32LE(16, 16); wavHeader.writeUInt16LE(1, 20);
  wavHeader.writeUInt16LE(1, 22); wavHeader.writeUInt32LE(sampleRate, 24); wavHeader.writeUInt32LE(sampleRate * 2, 28);
  wavHeader.writeUInt16LE(2, 32); wavHeader.writeUInt16LE(16, 34); wavHeader.write('data', 36); wavHeader.writeUInt32LE(samples.length, 40);
  const inputWav = path.join(dir, 'source.wav'), input = path.join(dir, 'input.mp4'), musicPath = path.join(dir, 'music.wav');
  await fs.writeFile(inputWav, Buffer.concat([wavHeader, samples]));
  run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=540x960:rate=30:duration=5', '-i', inputWav,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', input]);
  run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=1', '-c:a', 'pcm_s16le', musicPath]);

  const transcript = [
    { text: 'Hola', timestamp: [0.55, 0.85], confidence: 0.92 },
    { text: 'a', timestamp: [0.9, 1.05], confidence: 0.89 },
    { text: 'todos', timestamp: [1.1, 1.45], confidence: 0.93 },
    { text: 'Seguimos', timestamp: [3.05, 3.4], confidence: 0.88 },
    { text: 'ahora', timestamp: [3.5, 3.95], confidence: 0.91 },
  ];
  const sourceInfo = await probe(input);
  const stats = await processJob({ dir, input, options: { transcript, sensitivity: 'normal', seed: 123 },
    music: { path: musicPath, name: 'smoke.wav' }, setStatus() {} });
  const project = JSON.parse(await fs.readFile(path.join(dir, 'project.json'), 'utf8'));
  const outputInfo = await probe(path.join(dir, 'final.mp4'));
  const hasNoiseCut = project.cuts.some((cut) => cut.s <= 2.05 && cut.e >= 2.25);
  const allSpeechRetained = project.words.every((word) => project.cuts.every((cut) =>
    Math.min(cut.e, word.end) - Math.max(cut.s, word.start) < 1 / 60));
  const { keep: rawKeep } = keepFromCuts(project.cuts, project.info.duration);
  const expected = quantizeKeep(rawKeep, project.info.duration);

  assert.ok(hasNoiseCut, 'el ruido de la pausa debe quedar dentro de un corte');
  assert.ok(allSpeechRetained, 'los cortes no deben atravesar palabras reconocidas');
  assert.equal(project.phrases.length, 2, 'la transcripción debe reconstruir dos subtítulos');
  assert.equal(stats.musicName, 'smoke.wav', 'debe incluir la pista de música');
  assert.equal(outputInfo.codec, 'h264');
  assert.equal(outputInfo.width, 1080); assert.equal(outputInfo.height, 1920);
  assert.equal(outputInfo.fps, 30); assert.ok(outputInfo.hasAudio);
  assert.equal(stats.frames, expected.frames, 'duración/cortes deben coincidir con la cuantización del render');
  assert.ok(Math.abs(stats.lufs + 14) < 1, `loudness inesperado: ${stats.lufs} LUFS`);
  console.log(JSON.stringify({ ok: true, input: sourceInfo.codec, output: `${outputInfo.codec} ${outputInfo.width}x${outputInfo.height} ${outputInfo.fps}fps`,
    duration: stats.duration, segments: stats.segments, captions: project.phrases.length, noiseCut: hasNoiseCut,
    music: stats.musicName, loudnessLUFS: stats.lufs }, null, 2));
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
