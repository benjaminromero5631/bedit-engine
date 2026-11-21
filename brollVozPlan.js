// Plan de audio para "B-roll + voz en off": corta silencios y muletillas
// igual que Talking Head, pero en vez de pegar los tramos directo, deja
// siempre una pausa de entre 0.2 y 0.3s entre ellos (nunca 0, nunca más).
// También arma los subtítulos de una sola palabra (karaoke), mapeados al
// tiempo de salida. No toca cuts.js ni plan.js: es un módulo aparte.
import { detectCuts, CUT_PRESETS } from './cuts.js';
import { stripPunct } from './draw.js';

const rand = (a, b) => a + Math.random() * (b - a);

/** Igual idea que keepFromCuts (cuts.js), pero inserta una pausa fija entre
 * cada tramo conservado en vez de pegarlos directo. */
export function keepWithPauseFloor(cuts, duration, { min = 0.2, max = 0.3 } = {}) {
  const active = cuts.filter((c) => c.on).sort((a, b) => a.s - b.s);
  const raw = [];
  let cur = 0;
  for (const c of active) {
    if (c.s > cur) raw.push({ s: cur, e: c.s });
    cur = Math.max(cur, c.e);
  }
  if (duration > cur) raw.push({ s: cur, e: duration });
  const keep = [];
  let o = 0;
  for (let i = 0; i < raw.length; i++) {
    const { s, e } = raw[i];
    keep.push({ s, e, o });
    o += e - s;
    if (i < raw.length - 1) o += rand(min, max);
  }
  return { keep, outDuration: o };
}

/** t (tiempo original) → tiempo de salida, usando el `keep` con pausas. -1 si cayó en un corte. */
export function srcToOutPaused(keep, t) {
  for (const k of keep) if (t >= k.s && t < k.e) return k.o + (t - k.s);
  const last = keep[keep.length - 1];
  if (last && t === last.e) return last.o + (last.e - last.s);
  return -1;
}

/** Palabras (ya filtradas por cortes/muletillas) → una frase por palabra, en tiempo de salida. */
export function oneWordPhrases(words, keep) {
  const out = [];
  for (const w of words) {
    const text = stripPunct(w.raw || w.text || '').toLowerCase();
    if (!text) continue;
    const start = srcToOutPaused(keep, w.start);
    const endSrc = Math.max(w.start + 0.01, w.end);
    let end = srcToOutPaused(keep, endSrc);
    if (start < 0) continue;
    if (end < 0 || end <= start) end = start + Math.max(0.12, endSrc - w.start);
    out.push({ start, end, text, kind: 'base' });
  }
  return out;
}

/** Plan completo de la voz en off: cortes con piso de pausa + subtítulos de una palabra. */
export function planVoiceover({ audio16k, sr = 16000, words, fillers, duration, sensitivity = 'normal', pauseMin = 0.2, pauseMax = 0.3 }) {
  const cfg = CUT_PRESETS[sensitivity] || CUT_PRESETS.normal;
  const cuts = detectCuts(audio16k, sr, words, fillers, duration, cfg);
  const cutWords = (w) => cuts.some((c) => c.on && Math.min(w.end, c.e) - Math.max(w.start, c.s) >= 1 / 60);
  const active = words.filter((w) => !cutWords(w));
  const { keep, outDuration } = keepWithPauseFloor(cuts, duration, { min: pauseMin, max: pauseMax });
  const phrases = oneWordPhrases(active, keep);
  return { keep, outDuration, phrases, cuts };
}
