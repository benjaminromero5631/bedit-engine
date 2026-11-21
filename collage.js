// Formato "Talking head + collage de imágenes": aislado de Talking Head y de los
// demás formatos (no comparte almacenamiento ni código con pipeline.js/render.js
// de Talking Head, ni con phraseBroll.js). Usa su propia biblioteca de imágenes
// (collageImages.js) y su propio render (collageRender.js).
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { probe, extractAudio16k } from './media.js';
import { transcribe } from './transcribe.js';
import { makePlan, replan } from './core/plan.js';
import { renderCollageVideo } from './collageRender.js';
import { listCollageImages, collageImageFile } from './collageImages.js';
import { chooseCollageMode, chooseCollageImages, buildDynamicSchedule, chooseSubtitleStyles } from './collageSelect.js';

const ROOT = path.join(process.env.DATA_DIR || '/data', 'collage');
const DRAFTS = path.join(ROOT, 'drafts');
const active = new Map();
const renderQueue = [];
let rendering = false;
const safeId = (id) => /^[a-f0-9]{16}$/.test(id);
const draftDir = (id) => path.join(DRAFTS, id);
const round = (x) => Math.round(x * 1000) / 1000;

async function readJson(file, fallback) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; } }
async function readDraftRaw(id) { return safeId(id) ? readJson(path.join(draftDir(id), 'draft.json'), null) : null; }
async function saveDraft(draft) {
  const file = path.join(draftDir(draft.id), 'draft.json');
  const tmp = file + '.tmp-' + crypto.randomBytes(4).toString('hex');
  await fs.writeFile(tmp, JSON.stringify(draft, (k, v) => (typeof v === 'number' ? round(v) : v), 1));
  await fs.rename(tmp, file);
}
function publicDraft(d) {
  return { id: d.id, status: d.status, progress: d.progress, error: d.error, title: d.title, count: d.count, mode: d.mode, position: d.position,
    duration: d.duration, warning: d.warning, approved: !!d.approved, published: !!d.published, createdAt: d.createdAt };
}

export async function initCollage() {
  await fs.mkdir(DRAFTS, { recursive: true });
  const pending = [];
  for (const id of await fs.readdir(DRAFTS).catch(() => [])) {
    const draft = await readDraftRaw(id);
    if (draft && ['renderizando', 'en_cola'].includes(draft.status)) pending.push(draft);
  }
  pending.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  for (const draft of pending) startRender(draft);
}

export async function listCollageDrafts() {
  const out = [];
  for (const id of await fs.readdir(DRAFTS).catch(() => [])) {
    const d = await readDraftRaw(id);
    if (d) out.push(publicDraft(d));
  }
  return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
export async function getCollageDraft(id) {
  const d = await readDraftRaw(id);
  if (!d) return null;
  return { ...publicDraft(d), subtitleStyles: d.subtitleStyles, images: d.images };
}
export async function collageDraftFile(id) {
  const d = await readDraftRaw(id);
  if (!d || d.status !== 'listo') return null;
  return path.join(draftDir(id), 'final.mp4');
}

async function buildPlanFor(dir, input, info) {
  const wav = path.join(dir, 'audio16k.wav');
  const audio = await extractAudio16k(input, info, wav);
  const chunks = await transcribe(wav, dir, null);
  const plan = makePlan({ audio16k: audio, chunks, duration: info.duration, sensitivity: 'normal', seed: 1 });
  return plan;
}

export async function createCollageDraft({ filename, ext, title }) {
  const id = crypto.randomBytes(8).toString('hex');
  const dir = draftDir(id);
  await fs.mkdir(dir, { recursive: true });
  const input = path.join(dir, `input.${ext}`);
  await fs.rename(filename, input);
  let info;
  try {
    info = await probe(input);
    if (info.duration > 125) throw new Error('El video dura más de 2 minutos');
    const plan = await buildPlanFor(dir, input, info);
    const library = await listCollageImages();
    const { count, mode, position } = chooseCollageMode();
    const { imageIds, warning } = chooseCollageImages({ library, words: plan.words, count, mode });
    const subtitleStyles = chooseSubtitleStyles(plan.phrases.length);
    const schedule = mode === 'dinamico' ? buildDynamicSchedule(info.duration) : null;
    const draft = {
      id, status: 'en_cola', progress: 0, error: null, title: String(title || '').slice(0, 120) || null,
      count, mode, position, images: imageIds, subtitleStyles, schedule, warning,
      words: plan.words, phrases: plan.phrases, cuts: plan.cuts, zoomEvents: plan.zoomEvents, seed: plan.seed,
      duration: null, approved: false, published: false, createdAt: new Date().toISOString(),
    };
    await saveDraft(draft);
    startRender(draft);
    return publicDraft(draft);
  } catch (error) {
    await fs.rm(dir, { recursive: true, force: true });
    throw error;
  }
}

function startRender(draft) {
  if (active.has(draft.id)) return;
  const queued = rendering || renderQueue.length > 0;
  draft.status = queued ? 'en_cola' : 'renderizando';
  draft.progress = queued ? 0 : 0.03;
  active.set(draft.id, true);
  renderQueue.push(draft);
  void saveDraft(draft).then(() => pumpCollageRenders()).catch((error) => {
    active.delete(draft.id);
    const index = renderQueue.findIndex((item) => item.id === draft.id);
    if (index >= 0) renderQueue.splice(index, 1);
    console.error('No se pudo guardar el trabajo de collage en cola', error);
  });
}

async function renderDraftFile(draft) {
  const dir = draftDir(draft.id);
  const ext = (await fs.readdir(dir)).find((f) => f.startsWith('input.'))?.split('.').pop() || 'mp4';
  const input = path.join(dir, `input.${ext}`);
  const info = await probe(input);
  const plan = { words: draft.words, phrases: draft.phrases, zoomEvents: draft.zoomEvents, keep: replan({ phrases: draft.phrases, words: draft.words, fillers: [], cuts: draft.cuts, duration: info.duration, seed: draft.seed || 1, zoomEvents: draft.zoomEvents }).keep };
  const images = [];
  for (const imgId of draft.images) {
    const file = await collageImageFile(imgId);
    if (!file) throw new Error('Una de las imágenes elegidas ya no está en la biblioteca. Vuelve a mezclar.');
    images.push({ id: imgId, file });
  }
  const collagePlan = { count: draft.count, mode: draft.mode, position: draft.position, title: draft.title, images, subtitleStyles: draft.subtitleStyles, schedule: draft.schedule || [0] };
  const onProgress = (p) => { draft.progress = p; void saveDraft(draft).catch(() => {}); };
  const stats = await renderCollageVideo({ dir, input, info, plan, collagePlan, onProgress });
  return stats;
}

async function pumpCollageRenders() {
  if (rendering) return;
  rendering = true;
  while (renderQueue.length) {
    const draft = renderQueue.shift();
    try {
      draft.status = 'renderizando'; draft.progress = 0.03; await saveDraft(draft);
      const stats = await renderDraftFile(draft);
      const latest = await readDraftRaw(draft.id);
      if (latest) { latest.status = 'listo'; latest.progress = 1; latest.error = null; latest.duration = stats.duration; await saveDraft(latest); }
    } catch (error) {
      const latest = await readDraftRaw(draft.id);
      if (latest) { latest.status = 'error'; latest.progress = 0; latest.error = String(error.message || error).slice(0, 1200); await saveDraft(latest); }
    } finally { active.delete(draft.id); }
  }
  rendering = false;
}

export async function regenerateCollageDraft(id) {
  const draft = await readDraftRaw(id);
  if (!draft) throw new Error('No existe ese borrador');
  if (['renderizando', 'en_cola'].includes(draft.status)) throw new Error('Este video se está procesando; espera a que termine.');
  const library = await listCollageImages();
  const { count, mode, position } = chooseCollageMode();
  const { imageIds, warning } = chooseCollageImages({ library, words: draft.words, count, mode });
  draft.count = count; draft.mode = mode; draft.position = position; draft.images = imageIds; draft.warning = warning;
  draft.schedule = mode === 'dinamico' ? buildDynamicSchedule(draft.phrases.length ? draft.phrases[draft.phrases.length - 1].end : 20) : null;
  draft.subtitleStyles = chooseSubtitleStyles(draft.phrases.length);
  startRender(draft);
  return publicDraft(draft);
}

export async function editCollageDraft(id, { title, position, mode, images } = {}) {
  const draft = await readDraftRaw(id);
  if (!draft) throw new Error('No existe ese borrador');
  if (['renderizando', 'en_cola'].includes(draft.status)) throw new Error('Este video se está procesando; espera a que termine.');
  if (title !== undefined) draft.title = String(title || '').slice(0, 120) || null;
  if (position && ['arriba', 'abajo'].includes(position)) draft.position = position;
  if (mode && ['fijo', 'dinamico'].includes(mode)) draft.mode = mode;
  if (Array.isArray(images) && images.length) { draft.images = images.slice(0, 24); draft.count = Math.min(draft.count, draft.images.length) || draft.count; }
  if (draft.mode === 'dinamico' && !draft.schedule) draft.schedule = buildDynamicSchedule(draft.phrases.length ? draft.phrases[draft.phrases.length - 1].end : 20);
  startRender(draft);
  return publicDraft(draft);
}

export async function setCollageDraftState(id, state) {
  const draft = await readDraftRaw(id);
  if (!draft) throw new Error('No existe ese borrador');
  if (!['pendiente', 'aprobado', 'publicado'].includes(state)) throw new Error('Estado inválido');
  draft.approved = state === 'aprobado' || state === 'publicado';
  draft.published = state === 'publicado';
  await saveDraft(draft);
  return { approved: draft.approved, published: draft.published };
}

export async function removeCollageDraft(id) {
  if (!safeId(id)) return false;
  const dir = draftDir(id);
  const exists = await fs.stat(dir).catch(() => null);
  if (!exists) return false;
  await fs.rm(dir, { recursive: true, force: true });
  return true;
}
