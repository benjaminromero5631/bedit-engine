// Lógica pura (sin I/O) para el formato "Talking head + collage de imágenes":
// decide cantidad/modo/posición del collage, elige imágenes de la biblioteca por
// etiquetas relacionadas al guion, y arma el calendario de cambio en modo dinámico.
// Aislado a propósito: no importa nada de phraseBroll.js ni de broll.js.
import crypto from 'node:crypto';

const rand = (n) => crypto.randomInt(Math.max(1, n));
const shuffle = (items) => { const a = [...items]; for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clean = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const STOP = new Set('a al algo ante bajo con contra como de del desde donde durante e el ella ellas ellos en entre era es esa ese eso esta este esto fue ha hacia hasta la las le les lo los mas más me mi mis mucho muy ni no o para pero por que se sin sobre su sus te tu tus un una uno unas unos y ya'.split(' '));

function scriptTerms(words) {
  const text = (Array.isArray(words) ? words.map((w) => w.clean || w.text || '') : [String(words || '')]).join(' ');
  return new Set(clean(text).replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/).filter((x) => x.length > 2 && !STOP.has(x)));
}
function scoreImage(terms, tags) {
  let score = 0;
  for (const raw of tags || []) {
    const tag = clean(raw).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (!tag) continue;
    const hit = tag.split(/\s+/).some((part) => terms.has(part) || [...terms].some((t) => t.length > 4 && (t.startsWith(part) || part.startsWith(t))));
    if (hit) score += 1;
  }
  return score;
}

/** Elige cuántas imágenes van, si el collage es fijo o dinámico, y si va arriba o abajo. */
export function chooseCollageMode() {
  const count = [2, 3, 6][rand(3)];
  const mode = rand(2) ? 'dinamico' : 'fijo';
  const position = rand(2) ? 'arriba' : 'abajo';
  return { count, mode, position };
}

/** Elige el pool de imágenes para el video a partir de la biblioteca y el guion transcrito. */
export function chooseCollageImages({ library, words, count, mode }) {
  if (!library.length) throw new Error('Primero carga algunas imágenes en la biblioteca de Collage');
  const poolSize = Math.min(library.length, mode === 'dinamico' ? Math.max(count * 2, count + 3) : count);
  if (library.length < count) throw new Error(`Necesitas al menos ${count} imágenes en la biblioteca para este video`);
  const terms = scriptTerms(words);
  const scored = library.map((img) => ({ img, score: scoreImage(terms, img.tags) }));
  const relevant = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  const rest = shuffle(scored.filter((x) => x.score === 0));
  const ordered = [...relevant.map((x) => x.img), ...rest.map((x) => x.img)];
  const warning = relevant.length < count
    ? (relevant.length ? 'Había pocas imágenes con etiquetas relacionadas con el guion; completé con otras de la biblioteca. Revisa el contexto antes de aprobar.' : 'No encontré etiquetas relacionadas con el guion; usé imágenes al azar. Revisa el contexto antes de aprobar.')
    : '';
  return { imageIds: ordered.slice(0, poolSize).map((x) => x.id), warning };
}

/** Calendario de cambio para modo dinámico: rápido (1.5-3s) en los primeros ~10s, más espaciado después. */
export function buildDynamicSchedule(duration) {
  const points = [0];
  let t = 0;
  while (t < duration) {
    t += t < 10 ? 1.5 + Math.random() * 1.5 : 4 + Math.random() * 3;
    if (t < duration) points.push(t);
  }
  return points;
}
/** Para un instante t, qué ventana del pool (de tamaño count) se muestra. */
export function windowAt(t, schedule, poolLen, count) {
  let i = 0;
  while (i + 1 < schedule.length && schedule[i + 1] <= t) i++;
  if (poolLen <= count) return Array.from({ length: poolLen }, (_, k) => k);
  const start = i % poolLen;
  return Array.from({ length: count }, (_, k) => (start + k) % poolLen);
}

/** Asigna a cada frase un estilo de subtítulo (normal o karaoke), alternando solo en bloques de 2-4 frases. */
export function chooseSubtitleStyles(phraseCount) {
  const styles = [];
  let current = rand(2) ? 'karaoke' : 'normal';
  let i = 0;
  while (i < phraseCount) {
    const run = 2 + rand(3);
    for (let k = 0; k < run && i < phraseCount; k++, i++) styles.push(current);
    current = current === 'normal' ? 'karaoke' : 'normal';
  }
  return styles;
}
