import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './media.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Docker guarda el script en ../python; en el checkout local vive junto a este módulo. */
export async function resolveTranscriberScript(baseDir = here) {
  const candidates = [
    path.join(baseDir, '..', 'python', 'transcribe.py'),
    path.join(baseDir, 'transcribe.py'),
  ];
  for (const candidate of candidates) {
    try { await fs.access(candidate); return candidate; } catch {}
  }
  throw new Error(`No se encontró transcribe.py en: ${candidates.join(' ni ')}`);
}

/** Devuelve chunks [{text, timestamp:[a,b]}]. Si existe `transcript.json` en la carpeta del job (pruebas), lo usa. */
export async function transcribe(wav, dir, given = null) {
  if (Array.isArray(given) && given.length) return given;   // transcripción ya hecha (pruebas / reuso)
  const injected = path.join(dir, 'transcript.json');
  try { return JSON.parse(await fs.readFile(injected, 'utf8')).chunks; } catch {}
  const out = path.join(dir, 'whisper.json');
  await run(process.env.PYTHON || 'python3', [await resolveTranscriberScript(), wav, out]);
  return JSON.parse(await fs.readFile(out, 'utf8')).chunks;
}
