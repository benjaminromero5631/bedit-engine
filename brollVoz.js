// Formato "B-roll + voz en off": subes varias tomas de B-roll (mudas, en
// movimiento) + tu voz en off, y el sistema arma el video solo. Vive aparte
// de Talking Head y de Frase + B-roll (no los toca).
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { probe, extractAudio16k, run } from './media.js';
import { transcribe } from './transcribe.js';
import { buildPhrases } from './core/plan.js';
import { planVoiceover } from './core/brollVozPlan.js';
import { buildPool, buildSequence, remixSequence, replaceClip } from './core/brollVozSelect.js';
import { renderBrollBase, renderVoiceWithPauses, composeBrollVoz } from './brollVozRender.js';

const ROOT = path.join(process.env.DATA_DIR || '/data', 'broll-voz');
const DRAFTS = path.join(ROOT, 'drafts');
const renderQueue = [];
const active = new Map();
let rendering = false;

const safeId = (id) => /^[a-f0-9]{16}$/.test(id);
const draftDir = (id) => path.join(DRAFTS, id);
const takesDir = (id) => path.join(draftDir(id), 'takes');

async function readJson(file, fallback) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; } }
async function writeJson(file, value) {
  const tmp = `${file}.tmp-${crypto.randomBytes(4).toString('hex')}`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2));
  await fs.rename(tmp, file);
}
async function readDraftRaw(id) { return safeId(id) ? readJson(path.join(draftDir(id), 'draft.json'), null) : null; }
async function saveDraft(d) { await writeJson(path.join(draftDir(d.id), 'draft.json'), d); }

export async function initBrollVoz() {
  await fs.mkdir(DRAFTS, { recursive: true });
  const pending = [];
  for (const id of await fs.readdir(DRAFTS).catch(() => [])) {
    const d = await readDraftRaw(id);
    if (d && ['en_cola', 'transcribiendo', 'renderizando'].includes(d.status)) pending.push(d);
  }
  pending.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  for (const d of pending) startRender(d, 'full');
}

export async function listBrollVozDrafts() {
  const out = [];
  for (const id of await fs.readdir(DRAFTS).catch(() => [])) {
    const d = await readDraftRaw(id);
    if (d && !d.deleted) out.push(summarize(d));
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
function summarize(d) {
  return { id: d.id, status: d.status, progress: d.progress, approved: !!d.approved, published: !!d.published,
    createdAt: d.createdAt, updatedAt: d.updatedAt, outDuration: d.outDuration, error: d.error,
    takes: (d.takes || []).map((t) => ({ id: t.id, name: t.name, duration: t.duration })),
    sequence: d.sequence || [] };
}
export async function getBrollVozDraft(id) {
  const d = await readDraftRaw(id);
  return d && !d.deleted ? summarize(d) : null;
}
export async function brollVozDraftFile(id) {
  const d = await readDraftRaw(id);
  if (!d || d.deleted || d.status !== 'listo') return null;
  const file = path.join(draftDir(id), 'final.mp4');
  return (await fs.stat(file).catch(() => null)) ? file : null;
}

/**
 * Crea un borrador nuevo. `takeFiles`: [{tmpPath, name}] (archivos ya guardados en disco,
 * sin mover). `voiceTmpPath`: archivo de la voz en off (puede ser audio o video).
 */
export async function createBrollVozDraft({ takeFiles, voiceTmpPath }) {
  if (!Array.isArray(takeFiles) || takeFiles.length < 2) throw new Error('Sube al menos 2 tomas de B-roll');
  const id = crypto.randomBytes(8).toString('hex');
  const dir = draftDir(id);
  await fs.mkdir(takesDir(id), { recursive: true });
  const takes = [];
  for (const { tmpPath, name } of takeFiles) {
    const takeId = crypto.randomBytes(6).toString('hex');
    const file = path.join(takesDir(id), `${takeId}.mp4`);
    await fs.rename(tmpPath, file);
    const info = await probe(file);
    takes.push({ id: takeId, file, name: name || `${takeId}.mp4`, duration: info.duration });
  }
  const voiceFile = path.join(dir, 'voice-input.mp4');
  await fs.rename(voiceTmpPath, voiceFile);
  const draft = {
    id, status: 'en_cola', progress: 0, approved: false, published: false, deleted: false,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    takes: takes.map((t) => ({ id: t.id, name: t.name, duration: t.duration })),
    voiceFile, error: null,
  };
  await saveDraft(draft);
  startRender(draft, 'full');
  return summarize(draft);
}

function takeFilesMap(d) {
  const map = {};
  for (const t of d.takes) map[t.id] = path.join(takesDir(d.id), `${t.id}.mp4`);
  return map;
}

function startRender(draft, mode) {
  if (active.has(draft.id)) return;
  draft.status = rendering || renderQueue.length ? 'en_cola' : 'transcribiendo';
  draft.progress = 0;
  active.set(draft.id, true);
  renderQueue.push({ draft, mode });
  void saveDraft(draft).then(pumpQueue).catch((e) => { active.delete(draft.id); console.error('No se pudo encolar', e); });
}

async function pumpQueue() {
  if (rendering) return;
  rendering = true;
  while (renderQueue.length) {
    const { draft, mode } = renderQueue.shift();
    try {
      draft.status = mode === 'full' ? 'transcribiendo' : 'renderizando';
      draft.progress = 0.03; draft.updatedAt = new Date().toISOString();
      await saveDraft(draft);
      const stats = mode === 'full' ? await renderFull(draft) : await renderSequenceOnly(draft);
      const latest = await readDraftRaw(draft.id);
      if (latest) {
        Object.assign(latest, stats, { status: 'listo', progress: 1, error: null, approved: false, published: false });
        await saveDraft(latest);
      }
    } catch (error) {
      const latest = await readDraftRaw(draft.id);
      if (latest) { latest.status = 'error'; latest.progress = 0; latest.error = String(error.message || error).slice(0, 1200); await saveDraft(latest); }
    } finally { active.delete(draft.id); }
  }
  rendering = false;
}

/** Primer render completo: transcribe, corta silencios con piso de pausa, arma secuencia y compone. */
async function renderFull(draft) {
  const dir = draftDir(draft.id);
  const wav = path.join(dir, 'voice16k.wav');
  const info = await probe(draft.voiceFile);
  const audio = await extractAudio16k(draft.voiceFile, info, wav);
  const chunks = await transcribe(wav, dir);
  const { words, fillers } = buildPhrases(chunks);
  const { keep, outDuration, phrases } = planVoiceover({ audio16k: audio, words, fillers, duration: info.duration });
  const pool = buildPool(draft.takes.map((t) => ({ id: t.id, duration: t.duration })));
  const sequence = buildSequence(pool, outDuration);
  const voiceAudio = path.join(dir, 'voice.wav');
  await renderVoiceWithPauses({ input: draft.voiceFile, keep, outDuration, outputFile: voiceAudio });
  const baseVideo = path.join(dir, 'base.mp4');
  await renderBrollBase({ sequence, takeFiles: takeFilesMap(draft), outputFile: baseVideo });
  const finalFile = path.join(dir, 'final.mp4');
  await composeBrollVoz({ dir, baseVideo, voiceAudio, phrases, outDuration, outputFile: finalFile });
  return { pool, sequence, outDuration, phrases };
}

/** Re-render rápido: solo cambia qué pedacitos de B-roll se muestran (reemplazo o "remix all").
 * No vuelve a transcribir ni a cortar silencios: reusa voice.wav y los subtítulos ya calculados. */
async function renderSequenceOnly(draft) {
  const dir = draftDir(draft.id);
  const voiceAudio = path.join(dir, 'voice.wav');
  const baseVideo = path.join(dir, 'base.mp4');
  await renderBrollBase({ sequence: draft.sequence, takeFiles: takeFilesMap(draft), outputFile: baseVideo });
  const finalFile = path.join(dir, 'final.mp4');
  await composeBrollVoz({ dir, baseVideo, voiceAudio, phrases: draft.phrases, outDuration: draft.outDuration, outputFile: finalFile });
  return { sequence: draft.sequence };
}

export async function remixBrollVozDraft(id) {
  const d = await readDraftRaw(id);
  if (!d || d.deleted) return null;
  if (active.has(id)) throw new Error('El video todavía se está renderizando');
  d.sequence = remixSequence(d.pool, d.outDuration);
  d.status = 'renderizando'; d.progress = 0.05; d.updatedAt = new Date().toISOString();
  await saveDraft(d);
  startRender(d, 'sequence');
  return summarize(d);
}

export async function replaceBrollVozClip(id, index) {
  const d = await readDraftRaw(id);
  if (!d || d.deleted) return null;
  if (active.has(id)) throw new Error('El video todavía se está renderizando');
  if (!Number.isInteger(index) || index < 0 || index >= (d.sequence || []).length) throw new Error('Índice de pedacito inválido');
  d.sequence = replaceClip(d.sequence, d.pool, index);
  d.status = 'renderizando'; d.progress = 0.05; d.updatedAt = new Date().toISOString();
  await saveDraft(d);
  startRender(d, 'sequence');
  return summarize(d);
}

export async function setBrollVozState(id, state) {
  const d = await readDraftRaw(id);
  if (!d || d.deleted) return null;
  if (!['pendiente', 'aprobado', 'publicado'].includes(state)) throw new Error('Estado no válido');
  if (state !== 'pendiente' && d.status !== 'listo') throw new Error('El render todavía no está listo');
  d.approved = state === 'aprobado' || state === 'publicado'; d.published = state === 'publicado'; d.updatedAt = new Date().toISOString();
  await saveDraft(d); return summarize(d);
}

export async function removeBrollVozDraft(id) {
  const d = await readDraftRaw(id);
  if (!d) return false;
  if (active.has(id)) throw new Error('Espera a que termine el render antes de eliminar este borrador');
  await fs.rm(draftDir(id), { recursive: true, force: true });
  return true;
}
