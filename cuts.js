// Cortes automáticos: se queda con lo que hablas y quita el resto (silencios, "eh", "mmm").
// Usa la energía del audio + los tiempos de las palabras de Whisper (para no comerse palabras suaves).

export const CUT_CFG = {
  hop: 0.01,            // s por cuadro de energía
  aboveFloorDb: 12,     // la voz tiene que superar el ruido de fondo por esto
  thrMinDb: -52,        // límites del umbral (dBFS)
  thrMaxDb: -32,
  closeGap: 0.30,       // huecos de voz más cortos que esto se rellenan (respiros dentro de una palabra)
  minBlip: 0.10,        // ruidos más cortos que esto no cuentan como voz
  wordPadBefore: 0.05,
  wordPadAfter: 0.10,
  padLead: 0.10,        // respiro antes de hablar
  padTail: 0.15,        // respiro después de hablar
  minCut: 0.12,         // cortes más cortos que esto se ignoran
  fillerShrink: 0.03,
  requireWords: false,  // true: solo se queda lo que coincide con palabras entendidas (ignora ruidos de fondo)
};

// Sensibilidad: qué tan agresivo es el corte
export const CUT_PRESETS = {
  suave:  { ...CUT_CFG, aboveFloorDb: 8,  padLead: 0.14, padTail: 0.22, closeGap: 0.4 },
  normal: { ...CUT_CFG },
  fuerte: { ...CUT_CFG, aboveFloorDb: 14, requireWords: true, wordPadBefore: 0.08, wordPadAfter: 0.14, padLead: 0.08, padTail: 0.13 },
};

function frameDb(audio, sr, hop) {
  const n = Math.floor(audio.length / (sr * hop));
  const win = Math.round(sr * hop * 2);
  const hopS = Math.round(sr * hop);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = i * hopS;
    const b = Math.min(audio.length, a + win);
    let s = 0;
    for (let j = a; j < b; j++) s += audio[j] * audio[j];
    const rms = Math.sqrt(s / Math.max(1, b - a));
    out[i] = 20 * Math.log10(rms + 1e-9);
  }
  return out;
}

function mergeIntervals(iv, gap = 0) {
  iv.sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of iv) {
    if (b <= a) continue;
    const last = out[out.length - 1];
    if (last && a - last[1] <= gap) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

function subtract(iv, holes) {
  let out = iv.map((x) => [x[0], x[1]]);
  for (const [ha, hb] of holes) {
    const next = [];
    for (const [a, b] of out) {
      if (hb <= a || ha >= b) { next.push([a, b]); continue; }
      if (ha > a) next.push([a, ha]);
      if (hb < b) next.push([hb, b]);
    }
    out = next;
  }
  return out;
}

/**
 * @param {Float32Array} audio  mono, `sr` Hz
 * @param {{start:number,end:number}[]} words  palabras reales (sin muletillas)
 * @param {{start:number,end:number}[]} fillers  muletillas detectadas (se cortan)
 * @returns {{s:number,e:number,on:boolean}[]} cortes (lo que se quita)
 */
export function detectCuts(audio, sr, words, fillers, duration, cfg = CUT_CFG) {
  if (!audio || !audio.length || !duration) return [];
  const db = frameDb(audio, sr, cfg.hop);
  const sorted = Array.from(db).sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.1)] ?? -60;
  const thr = Math.min(cfg.thrMaxDb, Math.max(cfg.thrMinDb, floor + cfg.aboveFloorDb));

  // 1) tramos con voz por energía
  let voiced = [];
  let start = -1;
  for (let i = 0; i <= db.length; i++) {
    const on = i < db.length && db[i] > thr;
    if (on && start < 0) start = i;
    if (!on && start >= 0) { voiced.push([start * cfg.hop, i * cfg.hop]); start = -1; }
  }
  voiced = mergeIntervals(voiced, cfg.closeGap).filter(([a, b]) => b - a >= cfg.minBlip);

  // 2) sumar las palabras que Whisper entendió
  const wordIv = words.map((w) => [Math.max(0, w.start - cfg.wordPadBefore), Math.min(duration, w.end + cfg.wordPadAfter)]);
  if (cfg.requireWords) voiced = voiced.filter(([a, b]) => wordIv.some(([x, y]) => x < b && y > a));   // ruido sin palabras = silencio
  let keep = mergeIntervals([...voiced, ...wordIv]);

  // 3) sacar las muletillas
  const fillIv = fillers.map((f) => [f.start + cfg.fillerShrink, f.end - cfg.fillerShrink]).filter(([a, b]) => b > a);
  keep = subtract(keep, fillIv);

  // 4) respiro alrededor de lo que se queda (sin invadir muletillas)
  keep = keep.map(([a, b]) => [Math.max(0, a - cfg.padLead), Math.min(duration, b + cfg.padTail)]);
  keep = mergeIntervals(keep, cfg.minCut);
  keep = subtract(keep, fillers.map((f) => [f.start + 0.02, f.end - 0.02]).filter(([a, b]) => b > a));
  keep = mergeIntervals(keep, cfg.minCut);

  if (!keep.length) return [];

  // 5) cortes = lo que no está en keep
  const cuts = [];
  let cur = 0;
  for (const [a, b] of keep) {
    if (a - cur >= cfg.minCut) cuts.push({ s: cur, e: a, on: true });
    cur = Math.max(cur, b);
  }
  if (duration - cur >= cfg.minCut) cuts.push({ s: cur, e: duration, on: true });
  return cuts;
}

/** A partir de los cortes activos, devuelve los tramos que se quedan con su inicio en el video final. */
export function keepFromCuts(cuts, duration) {
  const active = cuts.filter((c) => c.on).sort((a, b) => a.s - b.s);
  const keep = [];
  let cur = 0, out = 0;
  for (const c of active) {
    if (c.s > cur) { keep.push({ s: cur, e: c.s, o: out }); out += c.s - cur; }
    cur = Math.max(cur, c.e);
  }
  if (duration > cur) { keep.push({ s: cur, e: duration, o: out }); out += duration - cur; }
  return { keep, outDuration: out };
}

export function srcToOut(keep, t) {
  if (!keep.length) return t;
  for (const k of keep) {
    if (t < k.s) return k.o;               // dentro de un corte: cae al inicio del siguiente tramo
    if (t <= k.e) return k.o + (t - k.s);
  }
  const l = keep[keep.length - 1];
  return l.o + (l.e - l.s);
}

export function outToSrc(keep, T) {
  if (!keep.length) return T;
  for (const k of keep) {
    if (T < k.o + (k.e - k.s)) return k.s + Math.max(0, T - k.o);
  }
  return keep[keep.length - 1].e;
}
