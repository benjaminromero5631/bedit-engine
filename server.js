import { frameDb } from './core/cuts.js';
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import Busboy from 'busboy';
import { initDirs, createJob, updateJob, enqueue, readJob, recover, cleanup, listMusic, JOBS, MUSIC } from './jobs.js';

const TOKEN = process.env.BEDIT_TOKEN;
if (!TOKEN || TOKEN.length < 16) { console.error('Falta BEDIT_TOKEN (mínimo 16 caracteres)'); process.exit(1); }
const PORT = Number(process.env.PORT || 8080);

const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
const authed = (req) => {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const a = Buffer.from(t), b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const readBody = (req, max = 20e6) => new Promise((resolve, reject) => {
  const parts = []; let n = 0;
  req.on('data', (d) => { n += d.length; if (n > max) { reject(new Error('Cuerpo demasiado grande')); req.destroy(); } else parts.push(d); });
  req.on('end', () => resolve(Buffer.concat(parts)));
  req.on('error', reject);
});

/** Recibe un multipart: guarda el archivo del campo `field` en `target` y devuelve los demás campos. */
function receiveFile(req, target, field) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { fileSize: 3e9, files: 1 } });
    const fields = {}; let pending = null; let filename = null; let tooBig = false;
    bb.on('field', (k, v) => { fields[k] = v; });
    bb.on('file', (name, stream, info) => {
      if (name !== field) { stream.resume(); return; }
      filename = info.filename;
      const ws = fs.createWriteStream(target);
      stream.on('limit', () => { tooBig = true; });
      stream.pipe(ws);
      pending = new Promise((r, j) => { ws.on('finish', r); ws.on('error', j); });
    });
    bb.on('close', async () => {
      try { await pending; if (!pending) throw new Error(`Falta el archivo (campo "${field}")`); if (tooBig) throw new Error('Archivo demasiado grande'); resolve({ fields, filename }); }
      catch (e) { reject(e); }
    });
    bb.on('error', reject);
    req.pipe(bb);
  });
}

function streamFile(req, res, file, type, name) {
  let st;
  try { st = fs.statSync(file); } catch { return send(res, 404, { error: 'No existe' }); }
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  const head = { 'content-type': type, 'accept-ranges': 'bytes', 'content-disposition': `attachment; filename="${name}"` };
  if (range) {
    const a = range[1] ? Number(range[1]) : 0, b = range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
    res.writeHead(206, { ...head, 'content-range': `bytes ${a}-${b}/${st.size}`, 'content-length': b - a + 1 });
    fs.createReadStream(file, { start: a, end: b }).pipe(res);
  } else {
    res.writeHead(200, { ...head, 'content-length': st.size });
    fs.createReadStream(file).pipe(res);
  }
}

const safeName = (s) => String(s || 'video').replace(/\.[^.]+$/, '').replace(/[^\w\-. áéíóúñÁÉÍÓÚÑ]/g, '_').slice(0, 80);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    if (p === '/health') return send(res, 200, { ok: true });
    if (!authed(req)) return send(res, 401, { error: 'No autorizado' });

    // ── música ──
    if (p === '/music' && req.method === 'GET') return send(res, 200, { tracks: await listMusic() });
    if (p === '/music' && req.method === 'POST') {
      const tmp = path.join(MUSIC, `.up-${crypto.randomBytes(4).toString('hex')}`);
      const { fields, filename } = await receiveFile(req, tmp, 'file');
      const name = path.basename(fields.name || filename || 'pista.mp3').replace(/[^\w\-. ()áéíóúñÁÉÍÓÚÑ]/g, '_');
      if (!/\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(name)) { await fsp.rm(tmp, { force: true }); return send(res, 400, { error: 'Formato de música no soportado' }); }
      await fsp.rename(tmp, path.join(MUSIC, name));
      return send(res, 200, { ok: true, name });
    }
    let m = p.match(/^\/music\/(.+)$/);
    if (m && req.method === 'DELETE') { await fsp.rm(path.join(MUSIC, path.basename(decodeURIComponent(m[1]))), { force: true }); return send(res, 200, { ok: true }); }

    // ── trabajos ──
    if (p === '/jobs' && req.method === 'POST') {
      const { job, dir } = await createJob({ ext: '.mov' });
      try {
        const { fields, filename } = await receiveFile(req, path.join(dir, job.input), 'video');
        let options = {};
        try { options = fields.options ? JSON.parse(fields.options) : {}; } catch { throw new Error('"options" no es JSON válido'); }
        let meta = null;
        if (fields.meta) { try { meta = JSON.parse(fields.meta); } catch { meta = fields.meta; } }
        await updateJob(job.id, { options, meta, callbackUrl: fields.callbackUrl || null, name: safeName(fields.name || filename) });
        await enqueue(job.id);
        return send(res, 202, { id: job.id, status: 'en cola' });
      } catch (e) {
        await fsp.rm(dir, { recursive: true, force: true });
        return send(res, 400, { error: e.message });
      }
    }
    if (p === '/jobs' && req.method === 'GET') {
      const out = [];
      for (const id of (await fsp.readdir(JOBS)).slice(-50)) { const j = await readJob(id); if (j) out.push({ id, status: j.status, progress: j.progress, name: j.name, createdAt: j.createdAt }); }
      return send(res, 200, { jobs: out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)) });
    }
    m = p.match(/^\/jobs\/([a-f0-9]{16})(?:\/(result|project|rerender|input|envelope))?$/);
    if (m) {
      const [, id, sub] = m;
      const job = await readJob(id);
      if (!job) return send(res, 404, { error: 'No existe ese trabajo' });
      const dir = path.join(JOBS, id);
      if (!sub && req.method === 'GET') { const { callbackUrl, ...pub } = job; return send(res, 200, pub); }
      if (!sub && req.method === 'DELETE') { await fsp.rm(dir, { recursive: true, force: true }); return send(res, 200, { ok: true }); }
      if (sub === 'result' && req.method === 'GET') {
        if (job.status !== 'listo') return send(res, 409, { error: `Aún no está listo (${job.status})` });
        return streamFile(req, res, path.join(dir, 'final.mp4'), 'video/mp4', `${job.name || id}_bedit.mp4`);
      }
      if (sub === 'envelope' && req.method === 'GET') {
        // diagnóstico: energía del audio cada 10 ms (dB) para afinar cortes
        const buf = await fsp.readFile(path.join(dir, 'audio16k.wav'));
        const at = buf.indexOf('data');
        const pcm = buf.subarray(at + 8);
        const n = Math.floor(pcm.length / 4); const f = new Float32Array(n);
        for (let i = 0; i < n; i++) f[i] = pcm.readFloatLE(i * 4);
        const db = Array.from(frameDb(f, 16000, 0.01)).map((x) => Math.round(x * 10) / 10);
        return send(res, 200, { hop: 0.01, db });
      }
      if (sub === 'project' && req.method === 'GET') return streamFile(req, res, path.join(dir, 'project.json'), 'application/json', `${job.name || id}.project.json`);
      if (sub === 'input' && req.method === 'GET') return streamFile(req, res, path.join(dir, job.input), 'video/quicktime', `${job.name || id}.mov`);
      if (sub === 'rerender' && req.method === 'POST') {
        if (['en cola', 'analizando', 'transcribiendo', 'renderizando'].includes(job.status)) return send(res, 409, { error: 'Todavía se está procesando' });
        let project;
        try { project = JSON.parse((await readBody(req)).toString('utf8')); } catch { return send(res, 400, { error: 'Cuerpo no es JSON' }); }
        if (!Array.isArray(project.phrases) || !Array.isArray(project.cuts)) return send(res, 400, { error: 'project.json inválido' });
        if (url.searchParams.get('callbackUrl')) await updateJob(id, { callbackUrl: url.searchParams.get('callbackUrl') });
        await enqueue(id, 'rerender', project);
        return send(res, 202, { id, status: 'en cola' });
      }
    }
    send(res, 404, { error: 'Ruta no encontrada' });
  } catch (e) { console.error(e); if (!res.headersSent) send(res, 500, { error: e.message }); else res.end(); }
});

await initDirs();
await cleanup();
setInterval(() => cleanup().catch(() => {}), 6 * 3600 * 1000);
server.listen(PORT, () => console.log(`bedit-engine escuchando en :${PORT}`));
server.headersTimeout = 0; server.requestTimeout = 0;    // subidas grandes
recover();
