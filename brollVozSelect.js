// Selección y orden de B-roll para el formato "B-roll + voz en off".
// Trocea tomas crudas en pedacitos de 1.0-1.5s, los mezcla una sola vez y, si
// no alcanzan para cubrir la voz en off, repite el mismo orden desde el
// principio (loop) en vez de repetir al azar, para que el repetido se note
// menos (ej: si el pedacito 10 salió al principio, al final se repite el
// mismo pedacito 10, no uno cualquiera de la mitad del video).
import crypto from 'node:crypto';

const MIN_CLIP = 1.0, MAX_CLIP = 1.5;
const rand = (n) => crypto.randomInt(Math.max(1, Math.round(n * 1000))) / 1000;

/** Trocea una toma en pedacitos secuenciales de 1.0-1.5s (sin analizar contenido). */
export function sliceTake(takeId, duration) {
  const pieces = [];
  let t = 0;
  while (t < duration - 0.05) {
    const len = Math.min(MIN_CLIP + rand(MAX_CLIP - MIN_CLIP), duration - t);
    if (len < 0.3 && pieces.length) break; // la sobra muy corta al final se descarta
    pieces.push({ takeId, start: t, duration: len });
    t += len;
  }
  return pieces;
}

/** Junta los pedacitos de todas las tomas subidas en una sola bolsa. */
export function buildPool(takes) {
  return takes.flatMap((t) => sliceTake(t.id, t.duration));
}

function shuffle(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Reordena para que, cuando se pueda, no vengan 3+ pedacitos seguidos de la misma toma. */
function antiConsecutive(items) {
  const out = [];
  const pool = [...items];
  while (pool.length) {
    const lastTwo = out.slice(-2);
    let idx = pool.findIndex((p) => !(lastTwo.length === 2 && lastTwo.every((x) => x.takeId === p.takeId)));
    if (idx < 0) idx = 0;
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

/**
 * Arma la secuencia final que cubre exactamente `totalDuration` (la duración
 * de la voz en off ya cortada). Mezcla la bolsa una sola vez; si no alcanza,
 * repite ese mismo orden en loop (no vuelve a mezclar al azar).
 */
export function buildSequence(pool, totalDuration) {
  if (!pool.length) throw new Error('No hay tomas de B-roll para armar la secuencia');
  const order = antiConsecutive(shuffle(pool));
  const seq = [];
  let covered = 0, i = 0;
  while (covered < totalDuration - 1e-6) {
    const piece = order[i % order.length];
    const duration = Math.min(piece.duration, totalDuration - covered);
    seq.push({ takeId: piece.takeId, start: piece.start, duration });
    covered += duration;
    i++;
  }
  return seq;
}

/** "Remix all": vuelve a mezclar y armar todo de cero, misma bolsa, nuevo orden al azar. */
export function remixSequence(pool, totalDuration) {
  return buildSequence(pool, totalDuration);
}

/** Reemplaza un pedacito puntual (botón "cambiar este clip" en la revisión) por otro al azar de la bolsa. */
export function replaceClip(seq, pool, index) {
  const current = seq[index];
  if (!current) throw new Error('Índice de pedacito inválido');
  const candidates = pool.filter((p) => !(p.takeId === current.takeId && p.start === current.start));
  if (!candidates.length) throw new Error('No hay otro pedacito disponible para reemplazar este');
  const pick = candidates[crypto.randomInt(candidates.length)];
  const next = [...seq];
  next[index] = { takeId: pick.takeId, start: pick.start, duration: Math.min(pick.duration, current.duration) };
  return next;
}
