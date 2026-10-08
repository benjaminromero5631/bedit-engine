import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './media.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Devuelve chunks [{text, timestamp:[a,b]}]. Si existe `transcript.json` en la carpeta del job (pruebas), lo usa. */
export async function transcribe(wav, dir, given = null) {
  if (Array.isArray(given) && given.length) return given;   // transcripción ya hecha (pruebas / reuso)
  const injected = path.join(dir, 'transcript.json');
  try { return JSON.parse(await fs.readFile(injected, 'utf8')).chunks; } catch {}
  const out = path.join(dir, 'whisper.json');
  await run(process.env.PYTHON || 'python3', [path.join(here, '..', 'python', 'transcribe.py'), wav, out]);
  return JSON.parse(await fs.readFile(out, 'utf8')).chunks;
}
