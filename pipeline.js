import fs from 'node:fs/promises';
import path from 'node:path';
import { probe, extractAudio16k } from './media.js';
import { transcribe } from './transcribe.js';
import { makePlan, replan, editPlan } from './core/plan.js';
import { renderVideo } from './render.js';

const round = (x) => Math.round(x * 1000) / 1000;

/** Edición automática completa: transcribir → plan → project.json → render. */
export async function processJob({ dir, input, options = {}, music, setStatus }) {
  const info = await probe(input);
  if (info.duration > 125) throw new Error('El video dura más de 2 minutos');
  setStatus('analizando', 0.02);
  const wav = path.join(dir, 'audio16k.wav');
  const audio = await extractAudio16k(input, info, wav);
  setStatus('transcribiendo', 0.05);
  const chunks = await transcribe(wav, dir, options.transcript);
  const plan = makePlan({ audio16k: audio, chunks, duration: info.duration, sensitivity: options.sensitivity || 'normal', seed: options.seed || 1 });
  const project = {
    version: 1, info, options, createdAt: new Date().toISOString(),
    words: plan.words, fillers: plan.fillers, phrases: plan.phrases, cuts: plan.cuts, zoomEvents: plan.zoomEvents, seed: plan.seed,
  };
  await fs.writeFile(path.join(dir, 'project.json'), JSON.stringify(project, (k, v) => (typeof v === 'number' ? round(v) : v), 1));
  setStatus('renderizando', 0.1);
  const stats = await renderVideo({ dir, input, info, plan, music, onProgress: (p) => setStatus('renderizando', 0.1 + 0.9 * p) });
  return { ...stats, phrases: plan.phrases.length, cuts: plan.cuts.length, zooms: plan.zoomEvents.length, musicName: music?.name || null };
}

/** Re-render con un project.json revisado (textos, cortes, zooms editados). */
export async function rerenderJob({ dir, input, project, music, setStatus }) {
  const info = project.info || (await probe(input));
  setStatus('renderizando', 0.02);
  const plan = replan({ phrases: project.phrases, words: project.words, fillers: project.fillers, cuts: project.cuts, duration: info.duration, seed: project.seed || 1, zoomEvents: project.zoomEvents || null });
  const merged = { ...project, phrases: plan.phrases, zoomEvents: plan.zoomEvents };
  await fs.writeFile(path.join(dir, 'project.json'), JSON.stringify(merged, (k, v) => (typeof v === 'number' ? round(v) : v), 1));
  const stats = await renderVideo({ dir, input, info, plan, music, onProgress: (p) => setStatus('renderizando', 0.02 + 0.98 * p) });
  return { ...stats, phrases: plan.phrases.length, cuts: plan.cuts.length, zooms: plan.zoomEvents.length, musicName: music?.name || null };
}

/** Aplica las palabras que Benjamin quitó/recuperó en la revisión y devuelve el project.json nuevo (sin renderizar). */
export async function editJob({ dir, project, removed }) {
  const buf = await fs.readFile(path.join(dir, 'audio16k.wav'));
  const at = buf.indexOf('data');
  const pcm = buf.subarray(at + 8);
  const n = Math.floor(pcm.length / 4);
  const audio = new Float32Array(n);
  for (let i = 0; i < n; i++) audio[i] = pcm.readFloatLE(i * 4);
  const plan = editPlan({
    audio16k: audio, words: project.words, fillers: project.fillers || [], duration: project.info.duration,
    sensitivity: project.options?.sensitivity || 'normal', seed: project.seed || 1, removed: new Set(removed),
  });
  return { ...project, words: plan.words, phrases: plan.phrases, cuts: plan.cuts, zoomEvents: plan.zoomEvents };
}
