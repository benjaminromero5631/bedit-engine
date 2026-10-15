import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const BROLL = path.join(process.env.DATA_DIR || '/data', 'broll');
const INDEX = path.join(BROLL, 'index.json');
const CLIPS = path.join(BROLL, 'clips');
const clean = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

async function readIndex() {
  try { const value = JSON.parse(await fs.readFile(INDEX, 'utf8')); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
async function writeIndex(value) { await fs.writeFile(INDEX, JSON.stringify(value, null, 2)); }

export async function listBroll() {
  return (await readIndex()).map(({ id, name, tags, duration, createdAt }) => ({ id, name, tags, duration, createdAt }));
}
export async function addBroll({ name, tags, filename, duration = 0 }) {
  const entries = await readIndex();
  const id = crypto.randomBytes(8).toString('hex');
  const safeFile = `${id}.mp4`;
  await fs.rename(filename, path.join(CLIPS, safeFile));
  const entry = { id, name: String(name || 'Clip B-roll').slice(0, 80), tags: [...new Set((Array.isArray(tags) ? tags : []).map((v) => String(v).trim().slice(0, 40)).filter(Boolean))].slice(0, 12), file: safeFile, duration: Math.round(duration * 1000) / 1000, createdAt: new Date().toISOString() };
  entries.push(entry);
  try { await writeIndex(entries); } catch (error) { await fs.rm(path.join(CLIPS, safeFile), { force: true }); throw error; }
  return { id: entry.id, name: entry.name, tags: entry.tags, duration: entry.duration, createdAt: entry.createdAt };
}
export async function deleteBroll(id) {
  const entries = await readIndex();
  const entry = entries.find((x) => x.id === id);
  if (!entry) return false;
  await fs.rm(path.join(CLIPS, path.basename(entry.file)), { force: true });
  await writeIndex(entries.filter((x) => x.id !== id));
  return true;
}
export async function brollFile(id) {
  const entry = (await readIndex()).find((x) => x.id === id);
  return entry ? path.join(CLIPS, path.basename(entry.file)) : null;
}

// Propuestas conservadoras y transparentes: solo coincidencia de etiquetas y palabras habladas.
// Nunca inserta los clips; el usuario debe añadir cada propuesta y pulsar «Aplicar cambios».
export function suggestBroll(words, clips, keep, max = 3) {
  const outputDuration = (keep || []).reduce((sum, k) => sum + Math.max(0, k.e - k.s), 0);
  const normalized = (words || []).filter((w) => w && w.start >= 0 && w.end > w.start);
  const mappedTime = (source) => {
    for (const k of keep || []) if (source >= k.s && source < k.e) return k.o + source - k.s;
    return null;
  };
  const suggestions = [];
  for (const clip of clips || []) {
    let best = null;
    const tags = (clip.tags || []).map(clean).filter(Boolean);
    for (let i = 0; i < normalized.length; i++) {
      const start = normalized[i].start;
      const mapped = mappedTime(start);
      if (mapped == null || mapped + 1 > outputDuration) continue;
      const context = clean(normalized.slice(i, Math.min(normalized.length, i + 9)).map((w) => w.text).join(' '));
      const matches = tags.filter((tag) => context.split(/\s+/).includes(tag) || context.includes(tag));
      if (matches.length && (!best || matches.length > best.score)) best = { at: mapped, sourceAt: start, matched: matches, score: matches.length };
    }
    if (best) suggestions.push({ clipId: clip.id, clipName: clip.name, tags: clip.tags, at: best.at, sourceAt: best.sourceAt, duration: 1, reason: `Coincide con: ${best.matched.join(', ')}`, score: best.score });
  }
  suggestions.sort((a, b) => a.at - b.at || b.score - a.score);
  const selected = [];
  for (const item of suggestions) {
    if (selected.length >= max) break;
    if (selected.some((x) => Math.abs(x.at - item.at) < 4)) continue;
    selected.push(item);
  }
  return selected;
}
