import { GlobalFonts } from '@napi-rs/canvas';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fonts');
let done = false;
export function registerFonts() {
  if (done) return;
  done = true;
  const list = [['inter-latin-600-normal.woff2', 'Inter'], ['inter-latin-800-normal.woff2', 'Inter'], ['inter-latin-900-normal.woff2', 'Inter'], ['playfair-display-latin-400-italic.woff2', 'Playfair Display']];
  for (const [f, fam] of list) if (!GlobalFonts.registerFromPath(path.join(dir, f), fam)) throw new Error('No se pudo cargar la fuente ' + f);
}
