// Biblioteca de imágenes para el formato "Talking head + collage de imágenes".
// Aislada a propósito: no comparte almacenamiento, índice ni código con
// phraseBroll.js (Frase + B-roll) ni con broll.js (cutaways de Talking Head).
// Por ahora solo guarda y etiqueta imágenes; el emparejamiento con el guion
// y el render del collage se agregan en una fase posterior.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadImage } from '@napi-rs/canvas';

const ROOT = path.join(process.env.DATA_DIR || '/data', 'collage-images');
const FILES = path.join(ROOT, 'files');
const INDEX = path.join(ROOT, 'index.json');
let libraryMutation = Promise.resolve();
const safeId = (id) => /^[a-f0-9]{16}$/.test(id);

async function readJson(file, fallback) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; } }
async function writeJson(file, value) {
  const tmp = file + '.tmp-' + crypto.randomBytes(4).toString('hex');
  await fs.writeFile(tmp, JSON.stringify(value, null, 2));
  await fs.rename(tmp, file);
}
function serializeLibraryMutation(fn) {
  const task = libraryMutation.then(fn, fn);
  libraryMutation = task.catch(() => {});
  return task;
}
async function libraryIndex() { const x = await readJson(INDEX, []); return Array.isArray(x) ? x : []; }
const normalizeTags = (tags) => [...new Set((Array.isArray(tags) ? tags : []).map((x) => String(x).trim().slice(0, 40)).filter(Boolean))].slice(0, 16);

export async function initCollageImages() {
  await Promise.all([fs.mkdir(FILES, { recursive: true })]);
  if (!await fs.stat(INDEX).catch(() => null)) await writeJson(INDEX, []);
}

export async function listCollageImages() {
  return (await libraryIndex()).map(({ id, tags, width, height, createdAt }) => ({ id, tags, width, height, createdAt }));
}
export async function collageImage(id) { return (await libraryIndex()).find((x) => x.id === id) || null; }
export async function collageImageFile(id) {
  const item = await collageImage(id);
  return item ? path.join(FILES, path.basename(item.file)) : null;
}

export async function addCollageImage({ filename, tags, ext }) {
  return serializeLibraryMutation(async () => {
    const labels = normalizeTags(tags);
    if (!labels.length) throw new Error('Agrega al menos una etiqueta para que el sistema pueda relacionar la imagen con el guion');
    const info = await loadImage(filename).catch(() => { throw new Error('No se pudo leer la imagen. Sube un JPG, PNG o WebP válido.'); });
    const id = crypto.randomBytes(8).toString('hex');
    const file = `${id}.${ext}`;
    const finalPath = path.join(FILES, file);
    await fs.rename(filename, finalPath);
    const item = { id, file, tags: labels, width: info.width, height: info.height, createdAt: new Date().toISOString() };
    const entries = await libraryIndex();
    entries.push(item);
    try { await writeJson(INDEX, entries); } catch (error) { await fs.rm(finalPath, { force: true }); throw error; }
    return { id: item.id, tags: item.tags, width: item.width, height: item.height, createdAt: item.createdAt };
  });
}

export async function updateCollageImageTags(id, tags) {
  return serializeLibraryMutation(async () => {
    const entries = await libraryIndex();
    const item = entries.find((x) => x.id === id);
    if (!item) return null;
    const labels = normalizeTags(tags);
    if (!labels.length) throw new Error('Cada imagen necesita al menos una etiqueta');
    item.tags = labels;
    await writeJson(INDEX, entries);
    return { id, tags: labels };
  });
}

export async function updateCollageImageTagsBatch(updates) {
  if (!Array.isArray(updates) || !updates.length) throw new Error('No hay etiquetas para guardar');
  return serializeLibraryMutation(async () => {
    const entries = await libraryIndex();
    const seen = new Set();
    const normalized = updates.map((update) => {
      const id = String(update?.id || '');
      if (!id || seen.has(id)) throw new Error('La selección de imágenes no es válida');
      seen.add(id);
      const item = entries.find((x) => x.id === id);
      if (!item) throw new Error('Una de las imágenes ya no existe. Actualiza la biblioteca e inténtalo de nuevo.');
      const tags = normalizeTags(update.tags);
      if (!tags.length) throw new Error('Cada imagen necesita al menos una etiqueta');
      return { item, tags };
    });
    for (const { item, tags } of normalized) item.tags = tags;
    await writeJson(INDEX, entries);
    return { ok: true, count: normalized.length };
  });
}

export async function deleteCollageImage(id) {
  const entries = await libraryIndex();
  const item = entries.find((x) => x.id === id);
  if (!item) return false;
  await fs.rm(path.join(FILES, path.basename(item.file)), { force: true });
  await writeJson(INDEX, entries.filter((x) => x.id !== id));
  return true;
}
