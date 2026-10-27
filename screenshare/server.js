import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Busboy from 'busboy';
import { probe, extractAudio16k } from '../media.js';
import { transcribe } from '../transcribe.js';
import { makePlan } from '../plan.js';
import { renderScreenShare } from './render.js';

const PORT = Number(process.env.PORT || 8080), DATA = process.env.DATA_DIR || '/data/screenshare';
const TOKEN = process.env.SCREENSHARE_TOKEN;
if (!TOKEN || TOKEN.length < 24) { console.error('Falta SCREENSHARE_TOKEN (mínimo 24 caracteres)'); process.exit(1); }
const jobs = new Map(); let active = false; const queue = [];
const send = (res, status, data) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
const authorized = (req) => { const a = Buffer.from((req.headers.authorization || '').replace(/^Bearer\s+/i, '')), b = Buffer.from(TOKEN); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const safe = (s) => String(s || 'archivo').replace(/[^\w. -áéíóúñÁÉÍÓÚÑ]/g, '_').slice(0, 90);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv']);

async function receive(req, dir) {
  await fs.mkdir(dir, { recursive: true });
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { files: 2, fileSize: 2 * 1024 * 1024 * 1024 } }), files = [], fields = {};
    let pending = [], tooBig = false, invalid = null;
    bb.on('field', (n, v) => fields[n] = v);
    bb.on('file', (field, stream, info) => {
      const ext = path.extname(info.filename || '').toLowerCase();
      if (field !== 'camera' && field !== 'screen') { stream.resume(); return; }
      if (!VIDEO_EXTS.has(ext)) { stream.resume(); invalid = new Error('Cada archivo debe ser MP4, MOV, M4V, WebM o MKV.'); return; }
      if (files.some((x) => x.field === field)) { stream.resume(); invalid = new Error(`Ya se recibió un archivo de "${field}"; envía solo uno por trabajo.`); return; }
      const name = `${field}-original${ext}`, target = path.join(dir, name);
      const ws = createWriteStream(target);
      const p = new Promise((r, j) => { ws.on('finish', r); ws.on('error', j); stream.on('error', j); });
      stream.on('limit', () => { tooBig = true; });
      stream.pipe(ws); files.push({ field, name, sourceName: info.filename }); pending.push(p);
    });
    bb.on('close', async () => {
      try {
        await Promise.all(pending);
        if (invalid) throw invalid;
        if (tooBig) throw new Error('Un archivo supera el límite de 2 GB.');
        const camera = files.find((x) => x.field === 'camera'), screen = files.find((x) => x.field === 'screen');
        if (!camera) throw new Error('Falta el archivo de cámara.');
        if (!screen) throw new Error('Falta el archivo de pantalla.');
        resolve({ camera: path.join(dir, camera.name), screen: path.join(dir, screen.name), fields, files });
      } catch (e) { reject(e); }
    });
    bb.on('error', reject); req.pipe(bb);
  });
}
const BEDIT_URL = process.env.BEDIT_INTERNAL_URL || 'http://godkeys_bedit-engine:8080';
const BEDIT_TOKEN = process.env.BEDIT_TOKEN || '';

/** Descarga la pista de música por defecto desde bedit-engine por HTTP (no comparten disco/volumen).
 * Se guarda una copia por trabajo en su propia carpeta, así que no hay conflicto entre trabajos simultáneos. */
async function defaultMusic(dir) {
  if (!BEDIT_TOKEN) return null;
  try {
    const r = await fetch(`${BEDIT_URL}/music/default/file`, { headers: { authorization: `Bearer ${BEDIT_TOKEN}` }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const type = r.headers.get('content-type') || '';
    const ext = { 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/wav': '.wav', 'audio/aac': '.aac', 'audio/ogg': '.ogg', 'audio/flac': '.flac' }[type] || '.mp3';
    const target = path.join(dir, `music-default${ext}`);
    await fs.writeFile(target, Buffer.from(await r.arrayBuffer()));
    return target;
  } catch { return null; }
}
async function saveJob(job) { await fs.writeFile(path.join(job.dir, 'job.json'), JSON.stringify(job)); }

async function work(job) {
  job.status = 'analizando'; job.updatedAt = new Date().toISOString(); await saveJob(job);
  try {
    const camInfo = await probe(job.camera), scrInfo = await probe(job.screen);
    if (camInfo.duration > 125) throw new Error('El video de cámara no puede durar más de 2 minutos.');
    if (!camInfo.hasAudio) throw new Error('El video de cámara debe tener audio.');
    const duration = Math.min(camInfo.duration, scrInfo.duration);
    const durationMismatch = Math.abs(camInfo.duration - scrInfo.duration) > 1;
    const wav = path.join(job.dir, 'audio16k.wav');
    const audio = await extractAudio16k(job.camera, camInfo, wav);
    job.status = 'transcribiendo'; job.updatedAt = new Date().toISOString(); await saveJob(job);
    const chunks = await transcribe(wav, job.dir);
    const plan = makePlan({ audio16k: audio, chunks, duration, sensitivity: 'fuerte' });
    job.status = 'renderizando'; job.updatedAt = new Date().toISOString(); await saveJob(job);
    const musicPath = await defaultMusic(job.dir);
    const stats = await renderScreenShare({ cameraInput: job.camera, screenInput: job.screen, dir: job.dir, cameraInfo: camInfo, screenInfo: scrInfo, plan, musicPath });
    const uncertain = (plan.words || []).filter((w) => Number.isFinite(w.confidence) && w.confidence < 0.55).length;
    job.status = 'listo';
    job.stats = {
      ...stats,
      words: plan.words.length,
      music: musicPath ? path.basename(musicPath) : null,
      musicWarning: !musicPath ? 'No se encontró la pista predeterminada; el borrador quedó sin música.' : null,
      durationWarning: durationMismatch ? `Cámara y pantalla duran distinto (cámara ${camInfo.duration.toFixed(1)}s, pantalla ${scrInfo.duration.toFixed(1)}s); se usó la parte en común (${duration.toFixed(1)}s). Revisa el borrador.` : null,
      review: uncertain > 0 ? `${uncertain} palabras con confianza baja; revisa que los cortes no afecten el guion.` : null,
    };
    await fs.writeFile(path.join(job.dir, 'plan.json'), JSON.stringify({ duration, words: plan.words, cuts: plan.cuts, stats: job.stats }, null, 2));
  } catch (e) { job.status = 'error'; job.error = String(e.message || e).slice(0, 500); }
  job.updatedAt = new Date().toISOString(); await saveJob(job);
  if (job.callbackUrl) {
    for (let i = 0; i < 5; i++) {
      try {
        const r = await fetch(job.callbackUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: job.id, name: job.name, meta: job.meta || {}, status: job.status, error: job.error || null, stats: job.stats || null, resultUrl: `/jobs/${job.id}/result` }), signal: AbortSignal.timeout(20000) });
        if (r.ok) break; throw new Error(`HTTP ${r.status}`);
      } catch (e) { console.error('callback falló', e.message); if (i < 4) await new Promise((r) => setTimeout(r, 5000 * (i + 1))); }
    }
  }
}
async function pump() { if (active) return; active = true; while (queue.length) { const j = queue.shift(); await work(j); } active = false; }

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost'), p = u.pathname;
    if (p === '/health') return send(res, 200, { ok: true, service: 'screenshare', isolated: true });
    if (!authorized(req)) return send(res, 401, { error: 'No autorizado' });
    if (p === '/jobs' && req.method === 'POST') {
      const id = crypto.randomBytes(8).toString('hex'), dir = path.join(DATA, 'jobs', id);
      await fs.mkdir(dir, { recursive: true });
      const received = await receive(req, dir);
      let meta = {}; try { meta = JSON.parse(received.fields.meta || '{}'); } catch {}
      const camFile = received.files.find((x) => x.field === 'camera');
      const job = { id, dir, camera: received.camera, screen: received.screen, meta, name: safe(received.fields.name || path.basename(camFile.sourceName, path.extname(camFile.sourceName))), callbackUrl: received.fields.callbackUrl || null, status: 'en cola', createdAt: new Date().toISOString() };
      jobs.set(id, job); await fs.writeFile(path.join(dir, 'job.json'), JSON.stringify(job)); queue.push(job); pump();
      return send(res, 202, { id, status: job.status, name: job.name });
    }
    const m = p.match(/^\/jobs\/([a-f0-9]{16})(?:\/(result|plan|rerender))?$/);
    if (m) {
      let j = jobs.get(m[1]);
      if (!j) { try { j = JSON.parse(await fs.readFile(path.join(DATA, 'jobs', m[1], 'job.json'), 'utf8')); jobs.set(m[1], j); } catch { return send(res, 404, { error: 'No existe el trabajo' }); } }
      if (req.method === 'POST' && m[2] === 'rerender') {
        // Vuelve a procesar el mismo trabajo desde los archivos originales ya guardados
        // (camera-original.*/screen-original.*), sin pedirle al usuario que los suba de nuevo.
        try { await fs.access(j.camera); await fs.access(j.screen); }
        catch { return send(res, 409, { error: 'Ya no están los archivos originales de este trabajo; hay que subirlos de nuevo.' }); }
        if (j.status === 'en cola' || j.status === 'analizando' || j.status === 'transcribiendo' || j.status === 'renderizando') {
          return send(res, 409, { error: 'Este trabajo ya se está procesando.' });
        }
        j.status = 'en cola'; j.error = null; j.stats = null;
        jobs.set(j.id, j); await saveJob(j); queue.push(j); pump();
        return send(res, 202, { id: j.id, status: j.status });
      }
      if (req.method === 'GET' && !m[2]) return send(res, 200, { id: j.id, name: j.name, status: j.status, error: j.error || null, stats: j.stats || null });
      if (req.method === 'GET' && m[2] === 'plan') { try { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(await fs.readFile(path.join(j.dir, 'plan.json'))); } catch { return send(res, 409, { error: 'El plan aún no está disponible' }); } }
      if (req.method === 'GET' && m[2] === 'result' && j.status === 'listo') { res.writeHead(200, { 'content-type': 'video/mp4', 'content-disposition': `attachment; filename="${j.name}_screenshare.mp4"` }); return createReadStream(path.join(j.dir, 'result.mp4')).pipe(res); }
      return send(res, 409, { error: 'El resultado aún no está disponible' });
    }
    return send(res, 404, { error: 'Ruta no encontrada' });
  } catch (e) { console.error(e); return send(res, 400, { error: String(e.message || e).slice(0, 500) }); }
});
await fs.mkdir(path.join(DATA, 'jobs'), { recursive: true });
const retention = Number(process.env.RETENTION_DAYS || 7) * 86400000;
const prune = async () => {
  try {
    for (const id of await fs.readdir(path.join(DATA, 'jobs'))) {
      const dir = path.join(DATA, 'jobs', id);
      const st = await fs.stat(dir);
      if (Date.now() - st.mtimeMs > retention) { await fs.rm(dir, { recursive: true, force: true }); jobs.delete(id); }
    }
  } catch (e) { console.error('limpieza de trabajos falló', e.message); }
};
await prune(); setInterval(prune, 24 * 60 * 60 * 1000).unref();
server.listen(PORT, '0.0.0.0', () => console.log(`Screenshare engine escuchando en ${PORT}`));
