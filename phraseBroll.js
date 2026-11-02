import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createCanvas } from '@napi-rs/canvas';
import { run, probe } from './media.js';
import { registerFonts } from './fonts.js';
import { listMusic, musicByName } from './jobs.js';

const ROOT = path.join(process.env.DATA_DIR || '/data', 'phrase-broll');
const LIB = path.join(ROOT, 'library');
const CLIPS = path.join(LIB, 'clips');
const DRAFTS = path.join(ROOT, 'drafts');
const INDEX = path.join(LIB, 'index.json');
const STATE = path.join(ROOT, 'state.json');
const W = 1080, H = 1920, FPS = 30;
const active = new Map();
const renderQueue = [];
let rendering = false;
const clean = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const rand = (n) => crypto.randomInt(Math.max(1, n));
const shuffle = (items) => { const a = [...items]; for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const draftDir = (id) => path.join(DRAFTS, id);
const safeId = (id) => /^[a-f0-9]{16}$/.test(id);

const ALIASES = [
  ['negocio', 'empresa', 'emprender', 'emprendimiento', 'ventas', 'vender', 'clientes', 'local', 'pyme', 'emprendedor'],
  ['trabajo', 'trabajar', 'oficina', 'computador', 'ordenador', 'pc', 'productividad', 'tarea', 'reunion', 'reunión'],
  ['estudio', 'estudiar', 'clases', 'universidad', 'colegio', 'aprendizaje', 'aprender', 'libro'],
  ['gym', 'gimnasio', 'entrenar', 'entrenamiento', 'ejercicio', 'pesas', 'fitness', 'deporte'],
  ['miedo', 'temor', 'ansiedad', 'inseguridad', 'nervios', 'duda', 'dudar'],
  ['viaje', 'viajar', 'avion', 'avión', 'aeropuerto', 'vacaciones', 'turismo', 'avioneta'],
  ['ia', 'inteligencia', 'artificial', 'claude', 'codex', 'programacion', 'programación', 'software', 'tecnologia', 'tecnología', 'aplicacion', 'aplicación'],
  ['redes', 'instagram', 'social', 'contenido', 'creador', 'creacion', 'creación', 'reel', 'reels', 'video'],
  ['descanso', 'dormir', 'sueño', 'sueno', 'cansancio', 'agotado', 'agotamiento'],
  ['auto', 'coche', 'vehiculo', 'vehículo', 'manejar', 'conducir', 'carro'],
  ['amigos', 'amistad', 'socializar', 'personas', 'gente', 'conversar', 'conversacion', 'conversación'],
];
const STOP = new Set('a al algo ante bajo con contra como de del desde donde durante e el ella ellas ellos en entre era es esa ese eso esta este esto fue ha hacia hasta la las le les lo los mas más me mi mis mucho muy ni no o para pero por que se sin sobre su sus te tu tus un una uno unas unos y ya'.split(' '));

async function readJson(file, fallback) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; } }
async function writeJson(file, value) {
  const tmp = file + '.tmp-' + crypto.randomBytes(4).toString('hex');
  await fs.writeFile(tmp, JSON.stringify(value, null, 2));
  await fs.rename(tmp, file);
}
async function libraryIndex() { const x = await readJson(INDEX, []); return Array.isArray(x) ? x : []; }
async function readState() { const x = await readJson(STATE, {}); return x && typeof x === 'object' ? x : {}; }
async function readDraftRaw(id) { return safeId(id) ? readJson(path.join(draftDir(id), 'draft.json'), null) : null; }
async function saveDraft(draft) { await writeJson(path.join(draftDir(draft.id), 'draft.json'), draft); }

export async function initPhraseBroll() {
  await Promise.all([fs.mkdir(CLIPS, { recursive: true }), fs.mkdir(DRAFTS, { recursive: true })]);
  if (!await fs.stat(INDEX).catch(() => null)) await writeJson(INDEX, []);
  for (const id of await fs.readdir(DRAFTS).catch(() => [])) {
    const draft = await readDraftRaw(id);
    if (draft?.status === 'renderizando') startRender(draft);
  }
}

export async function listPhraseClips() {
  return (await libraryIndex()).map(({ id, tags, duration, width, height, createdAt }) => ({ id, tags, duration, width, height, createdAt }));
}
export async function phraseClip(id) { return (await libraryIndex()).find((x) => x.id === id) || null; }
export async function phraseClipFile(id) {
  const item = await phraseClip(id);
  return item ? path.join(CLIPS, path.basename(item.file)) : null;
}
export async function addPhraseClip({ filename, tags, info }) {
  const labels = [...new Set((Array.isArray(tags) ? tags : []).map((x) => String(x).trim().slice(0, 40)).filter(Boolean))].slice(0, 16);
  if (!labels.length) throw new Error('Agrega al menos una etiqueta para que el sistema pueda relacionar el clip con una frase');
  const id = crypto.randomBytes(8).toString('hex');
  const file = `${id}.mp4`;
  const finalPath = path.join(CLIPS, file);
  const entries = await libraryIndex();
  await fs.rename(filename, finalPath);
  const item = { id, file, tags: labels, duration: Math.round(info.duration * 1000) / 1000, width: info.width, height: info.height, createdAt: new Date().toISOString() };
  entries.push(item);
  try { await writeJson(INDEX, entries); } catch (error) { await fs.rm(finalPath, { force: true }); throw error; }
  return { id: item.id, tags: item.tags, duration: item.duration, width: item.width, height: item.height, createdAt: item.createdAt };
}
export async function updatePhraseClipTags(id, tags) {
  const entries = await libraryIndex();
  const item = entries.find((x) => x.id === id);
  if (!item) return null;
  const labels = [...new Set((Array.isArray(tags) ? tags : []).map((x) => String(x).trim().slice(0, 40)).filter(Boolean))].slice(0, 16);
  if (!labels.length) throw new Error('Cada clip necesita al menos una etiqueta');
  item.tags = labels;
  await writeJson(INDEX, entries);
  return { id, tags: labels };
}
export async function phraseClipIsUsed(id) {
  for (const draft of await listPhraseDrafts()) if ((draft.events || []).some((event) => event.clipId === id)) return true;
  return false;
}
export async function deletePhraseClip(id) {
  const entries = await libraryIndex();
  const item = entries.find((x) => x.id === id);
  if (!item) return false;
  if (await phraseClipIsUsed(id)) throw new Error('Este clip aparece en un borrador. Elimina o cambia ese borrador antes de borrar el clip.');
  await fs.rm(path.join(CLIPS, path.basename(item.file)), { force: true });
  await writeJson(INDEX, entries.filter((x) => x.id !== id));
  return true;
}

function phraseTerms(phrase) {
  const tokens = clean(phrase).replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/).filter((x) => x.length > 2 && !STOP.has(x));
  const expanded = new Set(tokens);
  for (const group of ALIASES) if (tokens.some((x) => group.includes(x))) group.forEach((x) => expanded.add(x));
  return expanded;
}
function scoreTags(phrase, tags) {
  const terms = phraseTerms(phrase);
  let score = 0;
  const matched = [];
  for (const raw of tags || []) {
    const tag = clean(raw).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (!tag) continue;
    const parts = tag.split(/\s+/);
    let hit = parts.some((part) => terms.has(part) || [...terms].some((t) => t.length > 4 && (t.startsWith(part) || part.startsWith(t))));
    if (!hit) {
      const tagAliases = ALIASES.find((group) => parts.some((part) => group.includes(part)));
      hit = !!tagAliases && tagAliases.some((term) => terms.has(term));
    }
    if (hit) { score += parts.length > 1 ? 2 : 1; matched.push(raw); }
  }
  return { score, matched };
}
function weightedPick(items) {
  const total = items.reduce((s, x) => s + Math.max(1, x.score || 1), 0);
  let n = Math.random() * total;
  for (const x of items) { n -= Math.max(1, x.score || 1); if (n <= 0) return x; }
  return items[items.length - 1];
}
function splitFrames(total, mins, maxs) {
  const out = [];
  function go(i, rem) {
    if (i === mins.length) return rem === 0;
    const min = Math.max(mins[i], rem - maxs.slice(i + 1).reduce((a, b) => a + b, 0));
    const max = Math.min(maxs[i], rem - mins.slice(i + 1).reduce((a, b) => a + b, 0));
    const choices = [];
    for (let f = Math.ceil(min / (FPS / 2)) * (FPS / 2); f <= max; f += FPS / 2) choices.push(f);
    if (!choices.length) return false;
    for (const f of shuffle(choices)) { out[i] = f; if (go(i + 1, rem - f)) return true; }
    return false;
  }
  return go(0, total) ? out : null;
}

async function chooseComposition(phrase) {
  const clips = await libraryIndex();
  if (!clips.length) throw new Error('Primero carga algunos videos en la biblioteca Frase + B-roll');
  const scored = clips.map((clip) => ({ clip, ...scoreTags(phrase, clip.tags) }));
  const relevant = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  const recent = (await readState()).recentClipIds || [];
  let order = [...shuffle(relevant), ...shuffle(scored.filter((x) => !x.score))];
  const fresh = order.filter((x) => !recent.slice(-12).includes(x.clip.id));
  if (fresh.length >= Math.min(4, order.length)) order = fresh;
  if (!order.length) order = shuffle(scored);
  const unique = order.slice(0, Math.min(6, order.length));
  const warning = relevant.length < 4
    ? (relevant.length ? 'Había pocos clips con etiquetas relacionadas; completé la mezcla con otros clips disponibles. Revisa el contexto antes de aprobar.' : 'No encontré etiquetas relacionadas con la frase; usé clips disponibles al azar. Revisa el contexto antes de aprobar.')
    : '';

  if (unique.length === 1) {
    const target = (8 + rand(3)) * FPS;
    const clip = unique[0].clip;
    return { duration: target / FPS, events: [{ clipId: clip.id, sourceAt: 0, duration: target / FPS }], warning: warning || 'La biblioteca solo tiene un clip disponible; lo mantuve continuo para no repetir tomas pegadas.' };
  }

  let count = unique.length >= 4 ? 4 + rand(3) : Math.min(6, unique.length * 2);
  count = Math.max(4, count);
  const choices = unique.map((x) => x.clip);
  let sequence = [];
  for (let i = 0; i < count; i++) {
    let candidates = choices.filter((c) => !sequence.length || sequence[sequence.length - 1].clip.id !== c.id);
    if (i < choices.length) candidates = candidates.filter((c) => !sequence.some((s) => s.clip.id === c.id));
    if (!candidates.length) candidates = choices.filter((c) => sequence.slice(-2).every((s) => s.clip.id !== c.id));
    if (!candidates.length) candidates = choices.filter((c) => sequence[sequence.length - 1]?.clip.id !== c.id);
    if (!candidates.length) candidates = choices;
    const picked = weightedPick(candidates.map((clip) => ({ clip, score: scored.find((x) => x.clip.id === clip.id)?.score || 1 })));
    sequence.push({ clip: picked.clip, repeated: sequence.some((x) => x.clip.id === picked.clip.id) });
  }

  let allocation = null, targetFrames = null;
  for (const target of shuffle([8, 9, 10]).map((x) => x * FPS)) {
    const min = sequence.map(() => FPS), max = sequence.map((x) => Math.max(FPS, Math.min(x.repeated ? FPS : 3 * FPS, Math.floor(x.clip.duration * FPS))));
    allocation = splitFrames(target, min, max);
    if (allocation) { targetFrames = target; break; }
  }
  if (!allocation) throw new Error('No pude distribuir las tomas entre 8 y 10 segundos. Prueba con más clips en la biblioteca.');
  const events = sequence.map((item, i) => {
    const maxStart = Math.max(0, item.clip.duration - allocation[i] / FPS);
    const sourceAt = maxStart > 0.15 ? Math.random() * maxStart : 0;
    return { clipId: item.clip.id, sourceAt: Math.round(sourceAt * FPS) / FPS, duration: allocation[i] / FPS };
  });
  return { duration: targetFrames / FPS, events, warning };
}

async function chooseMusic(exclude = []) {
  const tracks = await listMusic();
  if (!tracks.length) return null;
  const history = await readState();
  const recent = [...(history.recentMusic || []), ...exclude];
  const options = tracks.filter((x) => !recent.slice(-3).includes(x));
  const name = shuffle(options.length ? options : tracks)[0];
  return musicByName(name);
}
async function chooseFreshMix(phrase, avoidMusic = []) {
  const state = await readState();
  const previous = new Set(state.recentCombos || []);
  let plan, music;
  for (let attempt = 0; attempt < 8; attempt++) {
    plan = await chooseComposition(phrase);
    music = await chooseMusic(avoidMusic.concat(attempt ? [music?.name].filter(Boolean) : []));
    if (!music) break;
    const key = plan.events.map((x) => x.clipId).join(',') + '|' + music.name;
    if (!previous.has(key)) return { plan, music };
  }
  return { plan, music };
}
async function remember(draft) {
  const state = await readState();
  state.recentClipIds = [...(state.recentClipIds || []), ...(draft.events || []).map((x) => x.clipId)].slice(-60);
  const combo = (draft.events || []).map((x) => x.clipId).join(',') + '|' + (draft.musicName || '');
  state.recentCombos = [...(state.recentCombos || []), combo].slice(-30);
  if (draft.musicName) state.recentMusic = [...(state.recentMusic || []), draft.musicName].slice(-12);
  await writeJson(STATE, state);
}

function drawPhrase(phrase, outPath) {
  registerFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const words = String(phrase || '').trim().split(/\s+/).filter(Boolean);
  let px = 46;
  let lines = [];
  const wrap = (size) => {
    ctx.font = `600 ${size}px Inter, sans-serif`;
    const result = [];
    let line = '';
    for (const word of words) {
      const next = line ? line + ' ' + word : word;
      if (line && ctx.measureText(next).width > W * 0.84) { result.push(line); line = word; }
      else line = next;
    }
    if (line) result.push(line);
    return result;
  };
  lines = wrap(px);
  while (lines.length > 3 && px > 30) { px -= 2; lines = wrap(px); }
  const lineH = px * 1.18, y0 = H / 2 - ((lines.length - 1) * lineH) / 2;
  ctx.save(); ctx.font = `600 ${px}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.72)'; ctx.shadowBlur = 5; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 2;
  lines.forEach((line, i) => ctx.fillText(line, W / 2, y0 + i * lineH, W * 0.88));
  ctx.restore();
  return fs.writeFile(outPath, canvas.toBuffer('image/png'));
}

async function renderDraftFile(draft) {
  const dir = draftDir(draft.id);
  const index = await libraryIndex();
  const filters = [];
  const inputs = [];
  for (let i = 0; i < draft.events.length; i++) {
    const event = draft.events[i];
    const clip = index.find((x) => x.id === event.clipId);
    if (!clip) throw new Error('Un clip de la mezcla ya no está en la biblioteca');
    const clipPath = path.join(CLIPS, path.basename(clip.file));
    inputs.push('-i', clipPath);
    const start = Math.max(0, Number(event.sourceAt) || 0).toFixed(3);
    const duration = Number(event.duration).toFixed(3);
    filters.push(`[${i}:v]trim=start=${start}:duration=${duration},setpts=PTS-STARTPTS,fps=${FPS},scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p[v${i}]`);
  }
  const music = draft.musicName ? await musicByName(draft.musicName) : null;
  if (!music) throw new Error('No pude acceder a la canción elegida; regenera para probar otra pista');
  const musicIdx = draft.events.length;
  inputs.push('-stream_loop', '-1', '-i', music.path);
  const overlayPath = path.join(dir, 'phrase-overlay.png');
  await drawPhrase(draft.phrase, overlayPath);
  const overlayIdx = musicIdx + 1;
  inputs.push('-loop', '1', '-framerate', String(FPS), '-i', overlayPath);
  const duration = draft.events.reduce((sum, event) => sum + Number(event.duration), 0);
  filters.push(`${draft.events.map((_, i) => `[v${i}]`).join('')}concat=n=${draft.events.length}:v=1:a=0[base]`);
  filters.push(`[${overlayIdx}:v]format=rgba[text]`);
  filters.push(`[base][text]overlay=0:0:format=auto:shortest=1,format=yuv420p[vout]`);
  const fade = Math.min(0.8, Math.max(0.15, duration / 12));
  filters.push(`[${musicIdx}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=duration=${duration.toFixed(3)},asetpts=PTS-STARTPTS,loudnorm=I=-14:TP=-1.0:LRA=11,afade=t=out:st=${Math.max(0, duration - fade).toFixed(3)}:d=${fade.toFixed(3)},alimiter=limit=0.95:level=disabled[aout]`);
  const tmp = path.join(dir, 'final.next.mp4');
  await fs.rm(tmp, { force: true });
  const args = ['-y', '-v', 'error', '-nostats', '-filter_complex_threads', process.env.THREADS || '2', ...inputs, '-filter_complex', filters.join(';'), '-map', '[vout]', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-threads', process.env.THREADS || '2', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', duration.toFixed(3), '-movflags', '+faststart', tmp];
  await run('ffmpeg', args);
  const info = await probe(tmp);
  if (Math.abs(info.duration - duration) > 0.12) { await fs.rm(tmp, { force: true }); throw new Error('El MP4 salió con una duración distinta a la mezcla'); }
  await fs.rename(tmp, path.join(dir, 'final.mp4'));
  return { duration: info.duration, width: info.width, height: info.height, fileSize: (await fs.stat(path.join(dir, 'final.mp4'))).size };
}

function startRender(draft) {
  if (active.has(draft.id)) return;
  active.set(draft.id, true); renderQueue.push(draft); pumpPhraseRenders();
}
async function pumpPhraseRenders() {
  if (rendering) return;
  rendering = true;
  while (renderQueue.length) {
    const draft = renderQueue.shift();
    try {
      const stats = await renderDraftFile(draft);
      const latest = await readDraftRaw(draft.id);
      if (latest) { latest.status = 'listo'; latest.progress = 1; latest.error = null; latest.stats = stats; await saveDraft(latest); await remember(latest); }
    } catch (error) {
      const latest = await readDraftRaw(draft.id);
      if (latest) {
        latest.status = 'error'; latest.progress = 0;
        latest.error = String(error.message || error).slice(0, 1200);
        await saveDraft(latest);
      }
    } finally { active.delete(draft.id); }
  }
  rendering = false;
}

export async function createPhraseDraft(phrase) {
  const text = String(phrase || '').trim();
  if (!text || text.length > 120) throw new Error('Escribe una frase de hasta 120 caracteres');
  const tracks = await listMusic();
  if (!tracks.length) throw new Error('No hay canciones en la biblioteca de B‑Edit; agrega música antes de crear un video');
  const { plan, music } = await chooseFreshMix(text);
  if (!music) throw new Error('No pude seleccionar música de la biblioteca de B‑Edit');
  const id = crypto.randomBytes(8).toString('hex');
  const draft = { id, phrase: text, status: 'renderizando', progress: 0.03, approved: false, published: false, deleted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), duration: plan.duration, events: plan.events, musicName: music.name, warning: plan.warning, error: null };
  await fs.mkdir(draftDir(id), { recursive: true }); await saveDraft(draft); startRender(draft);
  return draft;
}
export async function listPhraseDrafts() {
  const out = [];
  for (const id of await fs.readdir(DRAFTS).catch(() => [])) {
    const d = await readDraftRaw(id);
    if (d && !d.deleted) out.push({ id: d.id, phrase: d.phrase, status: d.status, progress: d.progress, approved: !!d.approved, published: !!d.published, createdAt: d.createdAt, updatedAt: d.updatedAt, duration: d.duration, warning: d.warning, error: d.error, musicName: d.musicName, events: d.events });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function getPhraseDraft(id) {
  const draft = await readDraftRaw(id);
  if (!draft || draft.deleted) return null;
  return draft;
}
export async function editPhraseDraft(id, input) {
  const draft = await readDraftRaw(id);
  if (!draft || draft.deleted) return null;
  if (active.has(id)) throw new Error('El video todavía se está renderizando');
  const phrase = String(input.phrase ?? draft.phrase).trim();
  if (!phrase || phrase.length > 120) throw new Error('La frase debe tener entre 1 y 120 caracteres');
  if (!Array.isArray(input.events) || input.events.length < 1 || input.events.length > 8) throw new Error('La mezcla debe tener entre 1 y 8 tomas');
  const index = await libraryIndex();
  const events = input.events.map((event) => {
    const clip = index.find((x) => x.id === event.clipId);
    const dur = Number(event.duration);
    if (!clip || !Number.isFinite(dur) || dur < 1 || dur > 10 || dur > clip.duration) throw new Error('Cada toma debe durar al menos 1 segundo y no puede superar la duración de su clip');
    const src = Math.max(0, Math.min(Number(event.sourceAt) || 0, Math.max(0, clip.duration - dur)));
    return { clipId: clip.id, sourceAt: src, duration: Math.round(dur * FPS) / FPS };
  });
  for (let i = 0; i < events.length; i++) for (let j = 0; j < i; j++) {
    if (events[i].clipId === events[j].clipId) {
      if (i - j < 2) throw new Error('Si repites un clip, deja al menos otra toma distinta entre medio');
      if (events[i].duration > 1 || events[j].duration > 1) throw new Error('Las apariciones repetidas deben durar máximo 1 segundo');
    }
  }
  const duration = events.reduce((sum, e) => sum + e.duration, 0);
  if (duration < 8 || duration > 10) throw new Error('La duración final debe quedar entre 8 y 10 segundos');
  let musicName = input.musicName === undefined ? draft.musicName : String(input.musicName || '');
  if (!musicName || !await musicByName(musicName)) throw new Error('Elige una canción disponible');
  draft.phrase = phrase; draft.events = events; draft.duration = duration; draft.musicName = musicName;
  draft.status = 'renderizando'; draft.progress = 0.03; draft.error = null; draft.approved = false; draft.published = false; draft.updatedAt = new Date().toISOString();
  await saveDraft(draft); startRender(draft);
  return draft;
}
export async function regeneratePhraseDraft(id) {
  const draft = await readDraftRaw(id);
  if (!draft || draft.deleted) return null;
  if (active.has(id)) throw new Error('El video todavía se está renderizando');
  const { plan, music } = await chooseFreshMix(draft.phrase, [draft.musicName]);
  if (!music) throw new Error('No hay música disponible en B‑Edit');
  draft.events = plan.events; draft.duration = plan.duration; draft.musicName = music.name; draft.warning = plan.warning;
  draft.status = 'renderizando'; draft.progress = 0.03; draft.error = null; draft.approved = false; draft.published = false; draft.updatedAt = new Date().toISOString();
  await saveDraft(draft); startRender(draft);
  return draft;
}
export async function setPhraseDraftState(id, state) {
  const draft = await readDraftRaw(id);
  if (!draft || draft.deleted) return null;
  if (!['pendiente', 'aprobado', 'publicado'].includes(state)) throw new Error('Estado no válido');
  if (state !== 'pendiente' && draft.status !== 'listo') throw new Error('El render todavía no está listo');
  draft.approved = state === 'aprobado' || state === 'publicado'; draft.published = state === 'publicado'; draft.updatedAt = new Date().toISOString();
  await saveDraft(draft); return draft;
}
export async function removePhraseDraft(id) {
  const draft = await readDraftRaw(id);
  if (!draft) return false;
  if (active.has(id)) throw new Error('Espera a que termine el render antes de eliminar este borrador');
  await fs.rm(draftDir(id), { recursive: true, force: true });
  return true;
}
export async function phraseDraftFile(id) {
  const draft = await readDraftRaw(id);
  if (!draft || draft.status !== 'listo') return null;
  const file = path.join(draftDir(id), 'final.mp4');
  return await fs.stat(file).catch(() => null) ? file : null;
}
