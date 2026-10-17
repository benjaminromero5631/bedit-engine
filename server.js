import { keepFromCuts, frameDb } from './core/cuts.js';
import { editJob } from './pipeline.js';
import { applyMusicOnly, quantizeKeep } from './render.js';
import { probe, run } from './media.js';
import { REVIEW_HTML } from './review.js';
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import Busboy from 'busboy';
import { initDirs, createJob, updateJob, enqueue, readJob, recover, cleanup, listMusic, musicByName, getDefaultMusic, setDefaultMusic, JOBS, MUSIC, BROLL } from './jobs.js';
import { addBroll, brollFile, deleteBroll, listBroll, suggestBroll } from './broll.js';

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
function receiveFile(req, target, field, maxFileSize = 3e9) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { fileSize: maxFileSize, files: 1 } });
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

function streamFile(req, res, file, type, name, disposition = 'attachment') {
  let st;
  try { st = fs.statSync(file); } catch { return send(res, 404, { error: 'No existe' }); }
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  const head = { 'content-type': type, 'accept-ranges': 'bytes', 'content-disposition': `${disposition}; filename="${name}"` };
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
    // ── biblioteca B-roll ──
    if (p === '/broll' && req.method === 'GET') return send(res, 200, { clips: await listBroll() });
    if (p === '/broll' && req.method === 'POST') {
      const tmp = path.join(BROLL, `.upload-${crypto.randomBytes(6).toString('hex')}`);
      let uploaded, converted;
      try {
        uploaded = await receiveFile(req, tmp, 'file', 150 * 1024 * 1024);
        const sourceName = uploaded.filename || '';
        if (!/\.(mp4|mov|m4v|webm)$/i.test(sourceName)) throw new Error('Sube un video MP4, MOV o WebM');
        const sourceInfo = await probe(tmp);
        if (!sourceInfo.hasVideo) throw new Error('El archivo no contiene una pista de video');
        const id = crypto.randomBytes(8).toString('hex');
        converted = path.join(BROLL, 'clips', `${id}.mp4`);
        await run('ffmpeg', ['-y', '-v', 'error', '-i', tmp, '-an', '-vf', 'scale=540:960:force_original_aspect_ratio=increase,crop=540:960,setsar=1,fps=30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', converted]);
        // Some phone/MOV files report an incorrect container duration. Validate
        // the normalized MP4 that B Edit will actually store and play instead.
        const info = await probe(converted);
        if (!info.hasVideo || info.duration < 0.4 || info.duration > 15) throw new Error('El clip convertido debe durar entre 0,4 y 15 segundos');
        const tags = String(uploaded.fields.tags || '').split(',').map((x) => x.trim()).filter(Boolean);
        const saved = await addBroll({ name: (uploaded.fields.name || sourceName).replace(/\.[^.]+$/, ''), tags, filename: converted, duration: info.duration });
        await fsp.rm(tmp, { force: true });
        return send(res, 201, { ok: true, clip: { ...saved, duration: info.duration } });
      } catch (e) {
        await fsp.rm(tmp, { force: true });
        if (converted) await fsp.rm(converted, { force: true });
        return send(res, 400, { error: e.message });
      }
    }
    let bm = p.match(/^\/broll\/([a-f0-9]{16})(?:\/(file))?$/);
    if (bm && bm[2] === 'file' && req.method === 'GET') {
      const file = await brollFile(bm[1]);
      if (!file) return send(res, 404, { error: 'No existe ese clip B-roll' });
      return streamFile(req, res, file, 'video/mp4', `${bm[1]}.mp4`, 'inline');
    }
    if (bm && !bm[2] && req.method === 'DELETE') {
      for (const jobId of await fsp.readdir(JOBS)) {
        for (const fileName of ['project.json', 'project_in.json']) {
          let project;
          try { project = JSON.parse(await fsp.readFile(path.join(JOBS, jobId, fileName), 'utf8')); } catch { continue; }
          if ((project.brollEvents || []).some((event) => event.clipId === bm[1])) return send(res, 409, { error: 'Este clip está aplicado o en proceso de render. Quítalo de la edición antes de borrarlo de la biblioteca.' });
        }
      }
      const deleted = await deleteBroll(bm[1]);
      return send(res, deleted ? 200 : 404, deleted ? { ok: true } : { error: 'No existe ese clip' });
    }

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
      for (const id of (await fsp.readdir(JOBS)).slice(-50)) { const j = await readJob(id); if (j) out.push({ id, status: j.status, progress: j.progress, name: j.name, approved: !!j.approved, published: !!j.published, deleted: !!j.deleted, createdAt: j.createdAt }); }
      return send(res, 200, { jobs: out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)) });
    }
    if (p === '/jobs/clear-deleted' && req.method === 'POST') {
      let removed = 0, skipped = 0;
      for (const id of await fsp.readdir(JOBS)) {
        const job = await readJob(id);
        if (!job?.deleted) continue;
        // No borrar una carpeta que el worker todavía pueda estar usando.
        if (!['listo', 'error'].includes(job.status)) { skipped++; continue; }
        await fsp.rm(path.join(JOBS, id), { recursive: true, force: true });
        removed++;
      }
      return send(res, 200, { ok: true, removed, skipped });
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
        const out = { id, name: pub.name, status: pub.status, progress: pub.progress, error: pub.error, approved: !!pub.approved, published: !!pub.published, deleted: !!pub.deleted, editable: false, words: [], duration: 0, manualCuts: [],
          musicOff: pub.options?.music === false, musicName: pub.options?.musicName ?? (pub.stats?.musicName ?? null), brollEvents: [], brollClips: [], brollSuggestions: [] };
        if (project) {
          out.duration = project.info.duration;
          out.manualCuts = project.manualCuts || [];
          const { keep: rawKeep } = keepFromCuts(project.cuts || [], project.info.duration);
          // La revisión debe usar los mismos límites por cuadro que el MP4 final.
          const { keep } = quantizeKeep(rawKeep, project.info.duration);
          out.cuts = project.cuts || [];
          out.keep = keep;
          out.outputDuration = keep.reduce((sum, k) => sum + k.e - k.s, 0);
          out.brollEvents = project.brollEvents || [];
          out.brollClips = await listBroll();
          out.brollSuggestions = suggestBroll(project.words || [], out.brollClips, keep, 3);
          const mapWord = (w) => {
            const parts = keep.map((k) => ({ k, s: Math.max(w.start, k.s), e: Math.min(w.end, k.e) }))
              .filter((x) => x.e - x.s > 0.005);
            const retained = parts.reduce((sum, x) => sum + x.e - x.s, 0);
            // Si un corte atraviesa una palabra, no la anclamos a otro instante.
            if (!parts.length || retained < (w.end - w.start) - 1 / 30) return { o: -1, oe: -1 };
            return {
              o: parts[0].k.o + parts[0].s - parts[0].k.s,
              oe: parts[parts.length - 1].k.o + parts[parts.length - 1].e - parts[parts.length - 1].k.s,
            };
          };
          const toks = [];
          (project.words || []).forEach((w, i) => {
            const mapped = mapWord(w);
            toks.push({ t: w.text || '?', start: w.start, end: w.end, i, x: w.x || 0, k: w.k ? 1 : 0, s: w.s ? 1 : 0, e: w.e ? 1 : 0, c: w.confidence ?? null,
              o: Math.round(mapped.o * 100) / 100, oe: Math.round(mapped.oe * 100) / 100 });
          });
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
        const restored = (Array.isArray(body.restored) ? body.restored : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < project.words.length);
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
        const brollEvents = [];
        if (Array.isArray(body.brollEvents)) {
          if (body.brollEvents.length > 3) return send(res, 400, { error: 'Puedes usar como máximo 3 clips B-roll por reel' });
          const outDur = (project.cuts || []).length ? quantizeKeep(keepFromCuts(project.cuts, project.info.duration).keep, project.info.duration).frames / 30 : project.info.duration;
          for (const event of body.brollEvents) {
            if (!event || typeof event.clipId !== 'string' || !Number.isFinite(event.at) || !Number.isFinite(event.duration) || event.duration < 1 || event.duration > 2 || event.at < 0 || (event.sourceAt == null && event.at + event.duration > outDur) || (event.sourceAt != null && (!Number.isFinite(event.sourceAt) || event.sourceAt < 0 || event.sourceAt >= project.info.duration))) return send(res, 400, { error: 'Cada B-roll debe durar 1–2 segundos y quedar dentro del video final' });
            if (!await brollFile(event.clipId)) return send(res, 400, { error: 'Uno de los clips B-roll ya no está en la biblioteca' });
            brollEvents.push({ clipId: event.clipId, at: Math.round(event.at * 30) / 30, sourceAt: event.sourceAt == null ? null : Math.round(event.sourceAt * 30) / 30, duration: Math.round(event.duration * 30) / 30 });
          }
        }
        const next = await editJob({ dir, project, removed, restored, edits, times, manualCuts, brollEvents });
        if (brollEvents.length) {
          const { keep: rawKeep } = keepFromCuts(next.cuts || [], project.info.duration);
          const nextKeep = quantizeKeep(rawKeep, project.info.duration).keep;
          for (const event of next.brollEvents) {
            if (event.sourceAt == null) continue;
            const segment = nextKeep.find((k) => event.sourceAt >= k.s && event.sourceAt < k.e);
            if (!segment) return send(res, 400, { error: 'Un B-roll quedó dentro de un tramo eliminado; mueve su punto en el clip fuente antes de aplicar' });
            event.at = Math.round((segment.o + event.sourceAt - segment.s) * 30) / 30;
            if (event.at + event.duration > nextKeep.reduce((sum, k) => sum + k.e - k.s, 0)) return send(res, 400, { error: 'Un B-roll quedó demasiado cerca del final después de los cortes' });
          }
          next.brollEvents.sort((a, b) => a.at - b.at);
          for (let i = 1; i < next.brollEvents.length; i++) if (next.brollEvents[i].at < next.brollEvents[i - 1].at + next.brollEvents[i - 1].duration) return send(res, 400, { error: 'Los B-roll se superponen después de los cortes; ajusta los momentos y vuelve a aplicar' });
        }
        await updateJob(id, { approved: false, published: false });
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
        if (!['pendiente', 'aprobado', 'publicado', 'eliminado'].includes(st)) return send(res, 400, { error: 'Estado no válido' });
        if (['aprobado', 'publicado'].includes(st) && job.status !== 'listo') return send(res, 409, { error: 'Aún no está listo' });
        await updateJob(id, { approved: ['aprobado', 'publicado'].includes(st), published: st === 'publicado', deleted: st === 'eliminado' });
        if (st === 'aprobado') await fireApproveHook(id, job);
        return send(res, 200, { ok: true, state: st });
      }
      if (sub === 'approve' && req.method === 'POST') {
        if (job.status !== 'listo') return send(res, 409, { error: 'Aún no está listo' });
        await updateJob(id, { approved: true, published: false });
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
