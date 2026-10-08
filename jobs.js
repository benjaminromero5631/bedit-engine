import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { processJob, rerenderJob } from './pipeline.js';

export const DATA = process.env.DATA_DIR || '/data';
export const JOBS = path.join(DATA, 'jobs');
export const MUSIC = path.join(DATA, 'music');
const STATE = path.join(DATA, 'state.json');
const RETENTION_DAYS = Number(process.env.RETENTION_DAYS || 7);

export async function initDirs() { await fs.mkdir(JOBS, { recursive: true }); await fs.mkdir(MUSIC, { recursive: true }); }

const queue = [];
let running = false;

const jobFile = (id) => path.join(JOBS, id, 'job.json');
export async function readJob(id) {
  if (!/^[a-f0-9]{16}$/.test(id)) return null;
  try { return JSON.parse(await fs.readFile(jobFile(id), 'utf8')); } catch { return null; }
}
async function saveJob(job) { job.updatedAt = new Date().toISOString(); await fs.writeFile(jobFile(job.id), JSON.stringify(job)); }

export async function createJob({ ext, meta, options, callbackUrl }) {
  const id = crypto.randomBytes(8).toString('hex');
  const dir = path.join(JOBS, id);
  await fs.mkdir(dir, { recursive: true });
  const job = { id, status: 'subiendo', progress: 0, input: `input${ext}`, meta: meta ?? null, options: options || {}, callbackUrl: callbackUrl || null, createdAt: new Date().toISOString() };
  await saveJob(job);
  return { job, dir };
}

export async function updateJob(id, patch) {
  const job = await readJob(id);
  Object.assign(job, patch);
  await saveJob(job);
  return job;
}

export async function enqueue(id, kind = 'process', project = null) {
  const job = await readJob(id);
  job.status = 'en cola'; job.progress = 0; job.error = null; job.kind = kind;
  if (project) await fs.writeFile(path.join(JOBS, id, 'project_in.json'), JSON.stringify(project));
  await saveJob(job);
  queue.push(id);
  pump();
  return job;
}

// ── música: rota las pistas en orden ──
export async function listMusic() {
  const names = (await fs.readdir(MUSIC)).filter((n) => /\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(n)).sort();
  return names;
}
async function pickMusic() {
  if (process.env.MUSIC === 'off') return null;
  const names = await listMusic();
  if (!names.length) return null;
  let st = {};
  try { st = JSON.parse(await fs.readFile(STATE, 'utf8')); } catch {}
  const next = ((st.musicIndex ?? -1) + 1) % names.length;
  await fs.writeFile(STATE, JSON.stringify({ ...st, musicIndex: next }));
  return { path: path.join(MUSIC, names[next]), name: names[next] };
}
async function musicByName(name) {
  if (!name) return null;
  const f = path.join(MUSIC, path.basename(name));
  return fssync.existsSync(f) ? { path: f, name: path.basename(name) } : null;
}

async function notify(job) {
  if (!job.callbackUrl) return;
  const body = JSON.stringify({ id: job.id, status: job.status, error: job.error || null, meta: job.meta, stats: job.stats || null,
    resultUrl: `/jobs/${job.id}/result`, projectUrl: `/jobs/${job.id}/project` });
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(job.callbackUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(20000) });
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 5000 * (i + 1)));
  }
  console.error('No se pudo avisar al callback de', job.id);
}

async function pump() {
  if (running) return;
  running = true;
  while (queue.length) {
    const id = queue.shift();
    const job = await readJob(id);
    if (!job) continue;
    const dir = path.join(JOBS, id);
    const setStatus = (status, progress) => { job.status = status; job.progress = Math.round(progress * 1000) / 1000; saveJob(job).catch(() => {}); };
    try {
      setStatus('analizando', 0.01);
      const input = path.join(dir, job.input);
      const music = job.options.music === false ? null : (await musicByName(job.options.musicName)) || (await pickMusic());
      let stats;
      if (job.kind === 'rerender') {
        const project = JSON.parse(await fs.readFile(path.join(dir, 'project_in.json'), 'utf8'));
        stats = await rerenderJob({ dir, input, project, music, setStatus });
      } else {
        stats = await processJob({ dir, input, options: job.options, music, setStatus });
      }
      job.stats = stats; job.status = 'listo'; job.progress = 1; job.error = null;
      delete job.stats.file;
    } catch (e) {
      console.error('Job', id, 'falló:', e.message);
      job.status = 'error'; job.error = String(e.message).slice(0, 1500);
    }
    await saveJob(job);
    await notify(job);
  }
  running = false;
}

/** Al reiniciar: re-encola lo que quedó a medias. */
export async function recover() {
  for (const id of await fs.readdir(JOBS)) {
    const job = await readJob(id);
    if (!job) continue;
    if (['en cola', 'analizando', 'transcribiendo', 'renderizando'].includes(job.status)) { queue.push(id); }
  }
  pump();
}

export async function cleanup() {
  const limit = Date.now() - RETENTION_DAYS * 86400000;
  for (const id of await fs.readdir(JOBS)) {
    try {
      const st = await fs.stat(path.join(JOBS, id));
      if (st.mtimeMs < limit) await fs.rm(path.join(JOBS, id), { recursive: true, force: true });
    } catch {}
  }
}
