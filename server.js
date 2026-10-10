import { keepFromCuts, srcToOut, frameDb } from './core/cuts.js';
import { editJob } from './pipeline.js';
import { applyMusicOnly } from './render.js';
import { run } from './media.js';
import { REVIEW_HTML } from './review.js';
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import Busboy from 'busboy';
import { initDirs, createJob, updateJob, enqueue, readJob, recover, cleanup, listMusic, musicByName, getDefaultMusic, setDefaultMusic, JOBS, MUSIC } from './jobs.js';

const TOKEN = process.env.BEDIT_TOKEN;
if (!TOKEN || TOKEN.length < 16) { console.error('Falta BEDIT_TOKEN (mínimo 16 caracteres)'); process.exit(1); }
const PORT = Number(process.env.PORT || 8080);

const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
const authed = (req) => {
  const h = req.headers.authorization || '';
  let t = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!t) { try { t = new URL(req.url, 'http://x').searchParams.get('t') || ''; } catch {} }
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

async function fireApproveHook(id, job) {
  const hook = process.env.APPROVE_WEBHOOK;
  if (!hook) return;
  try { await fetch(hook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, name: job.name, resultUrl: `/jobs/${id}/result` }), signal: AbortSignal.timeout(15000) }); }
  catch (e) { console.error('approve webhook falló', e.message); }
}

const safeName = (s) => String(s || 'video').replace(/\.[^.]+$/, '').replace(/[^\w\-. áéíóúñÁÉÍÓÚÑ]/g, '_').slice(0, 80);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    if (p === '/health') return send(res, 200, { ok: true });
    if (p === '/review' && req.method === 'GET') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(REVIEW_HTML); }
    if (!authed(req)) return send(res, 401, { error: 'No autorizado' });

    // ── música ──
    if (p === '/music' && req.method === 'GET') return send(res, 200, { tracks: await listMusic(), default: await getDefaultMusic() });
    if (p === '/music' && req.method === 'POST') {
      const tmp = path.join(MUSIC, `.up-${crypto.randomBytes(4).toString('hex')}`);
      const { fields, filename } = await receiveFile(req, tmp, 'file');
      const srcName = fields.name || filename || 'pista.mp3';
      const isVideo = /\.(mp4|mov|m4v|webm)$/i.test(srcName);
      if (isVideo) {
        const name = path.basename(srcName).replace(/\.[^.]+$/, '').replace(/[^\w\-. ()áéíóúñÁÉÍÓÚÑ]/g, '_').slice(0, 80) + '.m4a';
        const dest = path.join(MUSIC, name);
        try { await run('ffmpeg', ['-y', '-v', 'error', '-i', tmp, '-vn', '-acodec', 'aac', '-b:a', '192k', dest]); }
        catch (e) { await fsp.rm(tmp, { force: true }); return send(res, 400, { error: 'No se pudo sacar el audio de ese video' }); }
        await fsp.rm(tmp, { force: true });
        return send(res, 200, { ok: true, name });
      }
      const name = path.basename(srcName).replace(/[^\w\-. ()áéíóúñÁÉÍÓÚÑ]/g, '_');
      if (!/\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(name)) { await fsp.rm(tmp, { force: true }); return send(res, 400, { error: 'Formato de música no soportado' }); }
      await fsp.rename(tmp, path.join(MUSIC, name));
      return send(res, 200, { ok: true, name });
    }
    if (p === '/music/default' && req.method === 'POST') {
      let body;
      try { body = JSON.parse((await readBody(req)).toString('utf8')); } catch { return send(res, 400, { error: 'Cuerpo no es JSON' }); }
      if (body.name) { const t = await musicByName(body.name); if (!t) return send(res, 404, { error: 'Esa pista no existe' }); }
      const def = await setDefaultMusic(body.name || null);
      return send(res, 200, { ok: true, default: def });
    }
    let m = p.match(/^\/music\/(.+)$/);
    if (m && req.method === 'DELETE') {
      const name = path.basename(decodeURIComponent(m[1]));
      await fsp.rm(path.join(MUSIC, name), { force: true });
      if ((await getDefaultMusic()) === name) await setDefaultMusic(null);
      return send(res, 200, { ok: true });
    }

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
      for (const id of (await fsp.readdir(JOBS)).slice(-50)) { const j = await readJob(id); if (j) out.push({ id, status: j.status, progress: j.progress, name: j.name, approved: !!j.approved, deleted: !!j.deleted, createdAt: j.createdAt }); }
      return send(res, 200, { jobs: out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)) });
    }
    m = p.match(/^\/jobs\/([a-f0-9]{16})(?:\/(result|project|rerender|input|envelope|review|edit|approve|state|music))?$/);
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
      if (sub === 'review' && req.method === 'GET') {
        const { callbackUrl, ...pub } = job;
        let project = null;
        try { project = JSON.parse(await fsp.readFile(path.join(dir, 'project.json'), 'utf8')); } catch {}
        const out = { id, name: pub.name, status: pub.status, progress: pub.progress, error: pub.error, approved: !!pub.approved, deleted: !!pub.deleted, editable: false, words: [], duration: 0, manualCuts: [],
          musicOff: pub.options?.music === false, musicName: pub.options?.musicName ?? (pub.stats?.musicName ?? null) };
        if (project) {
          out.duration = project.info.duration;
          out.manualCuts = project.manualCuts || [];
          const { keep } = keepFromCuts(project.cuts || [], project.info.duration);
          const inKeep = (t) => keep.some((k) => t >= k.s && t < k.e);
          const toks = [];
          (project.words || []).forEach((w, i) => toks.push({ t: w.text || '?', start: w.start, end: w.end, i, x: w.x || 0, s: w.s ? 1 : 0, e: w.e ? 1 : 0, o: inKeep(w.start) ? Math.round(srcToOut(keep, w.start) * 100) / 100 : -1 }));
          (project.fillers || []).forEach((f) => toks.push({ t: 'eh', start: f.start, end: f.end, f: 1, i: -1, x: 0, s: 0, o: -1 }));
          toks.sort((a, b) => a.start - b.start);
          out.words = toks;
          out.editable = !!(project.words && project.words.length && project.words[0].raw);
        }
        return send(res, 200, out);
      }
      if (sub === 'edit' && req.method === 'POST') {
        if (['en cola', 'analizando', 'transcribiendo', 'renderizando'].includes(job.status)) return send(res, 409, { error: 'Todavía se está procesando' });
        let body;
        try { body = JSON.parse((await readBody(req)).toString('utf8')); } catch { return send(res, 400, { error: 'Cuerpo no es JSON' }); }
        const project = JSON.parse(await fsp.readFile(path.join(dir, 'project.json'), 'utf8'));
        if (!project.words?.length || !project.words[0].raw) return send(res, 400, { error: 'Este video es de una versión anterior y no se puede editar por palabras' });
        const removed = (Array.isArray(body.removed) ? body.removed : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < project.words.length);
        const edits = {};
        if (body.edits && typeof body.edits === 'object') for (const [k, v] of Object.entries(body.edits)) { const n = Number(k); if (Number.isInteger(n) && n >= 0 && n < project.words.length && typeof v === 'string') edits[n] = v.slice(0, 80); }
        const times = {};
        if (body.times && typeof body.times === 'object') for (const [k, v] of Object.entries(body.times)) {
          const n = Number(k);
          if (Number.isInteger(n) && n >= 0 && n < project.words.length && v && Number.isFinite(v.start) && Number.isFinite(v.end) && v.end > v.start) {
            times[n] = { start: Math.max(0, Number(v.start)), end: Math.min(project.info.duration, Number(v.end)) };
          }
        }
        const manualCuts = [];
        if (Array.isArray(body.manualCuts)) for (const c of body.manualCuts) {
          if (c && Number.isFinite(c.s) && Number.isFinite(c.e) && c.e > c.s) {
            manualCuts.push({ s: Math.max(0, Number(c.s)), e: Math.min(project.info.duration, Number(c.e)) });
          }
        }
        const next = await editJob({ dir, project, removed, edits, times, manualCuts });
        await updateJob(id, { approved: false });
        await enqueue(id, 'rerender', next);
        return send(res, 202, { id, status: 'en cola' });
      }
      if (sub === 'music' && req.method === 'POST') {
        if (job.status !== 'listo') return send(res, 409, { error: 'Aún no está listo' });
        let body;
        try { body = JSON.parse((await readBody(req)).toString('utf8')); } catch { return send(res, 400, { error: 'Cuerpo no es JSON' }); }
        const outDur = job.stats?.duration;
        if (!Number.isFinite(outDur)) return send(res, 409, { error: 'Falta la duración del render anterior' });
        let music = null;
        const name = body.musicName === undefined ? undefined : (body.musicName || null);
        if (name) { music = await musicByName(name); if (!music) return send(res, 404, { error: 'Esa pista no existe' }); }
        try { await applyMusicOnly({ dir, outDur, music }); }
        catch (e) { return send(res, 500, { error: e.message }); }
        const nextOptions = { ...job.options, musicName: name || undefined, music: name ? true : false };
        if (!name) delete nextOptions.musicName;
        await updateJob(id, { options: nextOptions, stats: { ...job.stats, musicName: music?.name || null } });
        return send(res, 200, { ok: true, musicName: music?.name || null });
      }
      if (sub === 'state' && req.method === 'POST') {
        let body;
        try { body = JSON.parse((await readBody(req)).toString('utf8')); } catch { return send(res, 400, { error: 'Cuerpo no es JSON' }); }
        const st = body.state;
        if (!['pendiente', 'aprobado', 'eliminado'].includes(st)) return send(res, 400, { error: 'Estado no válido' });
        if (st === 'aprobado' && job.status !== 'listo') return send(res, 409, { error: 'Aún no está listo' });
        await updateJob(id, { approved: st === 'aprobado', deleted: st === 'eliminado' });
        if (st === 'aprobado') await fireApproveHook(id, job);
        return send(res, 200, { ok: true, state: st });
      }
      if (sub === 'approve' && req.method === 'POST') {
        if (job.status !== 'listo') return send(res, 409, { error: 'Aún no está listo' });
        await updateJob(id, { approved: true });
        await fireApproveHook(id, job);
        return send(res, 200, { ok: true });
      }
      if (sub === 'envelope' && req.method === 'GET') {
        let buf;
        try { buf = await fsp.readFile(path.join(dir, 'audio16k.wav')); } catch { return send(res, 404, { error: 'No hay audio para este video' }); }
        const at = buf.indexOf('data');
        const pcm = buf.subarray(at + 8);
        const n = Math.floor(pcm.length / 4);
        const audio = new Float32Array(n);
        for (let i = 0; i < n; i++) audio[i] = pcm.readFloatLE(i * 4);
        const hop = 0.05;
        const db = frameDb(audio, 16000, hop);
        const values = Array.from(db, (d) => Math.round(Math.max(0, Math.min(1, (d + 60) / 54)) * 100) / 100);
        return send(res, 200, { hop, values });
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
