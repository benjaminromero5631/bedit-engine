// Plan de edición (puro, sin I/O): frases, zooms y apoyos. Port fiel de la extensión.
import { PRESET } from './config.js';
import { stripPunct, plainText } from './draw.js';
import { keepFromCuts, srcToOut, outToSrc, detectCuts, mergeCutRanges, CUT_PRESETS } from './cuts.js';

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** chunks: [{text, timestamp:[a,b]}] (una palabra por chunk). Devuelve {phrases, words, fillers}. */
export function buildPhrases(chunks) {
  const S = PRESET.subtitle;
  const words = [];
  const fillers = [];
  for (const c of chunks) {
    const raw = (c.text || '').trim();
    if (!raw) continue;
    const clean = stripPunct(raw);
    if (!clean) continue;
    const a = c.timestamp?.[0] ?? 0;
    const b = c.timestamp?.[1] ?? a + 0.3;
    if (PRESET.fillerRegex.test(clean)) { fillers.push({ start: a, end: Math.max(b, a + 0.05) }); continue; }
    words.push({ raw, clean, start: a, end: Math.max(b, a + 0.05) });
  }
  const phrases = [];
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    let text = cur.map((w) => w.clean).join(' ');
    if (PRESET.lowercase) text = text.toLowerCase();
    phrases.push({ start: cur[0].start, end: cur[cur.length - 1].end, text, kind: 'base', keepBase: false });
    cur = [];
  };
  for (const w of words) {
    if (cur.length && w.start - cur[cur.length - 1].end > S.pauseBreakSec) flush();
    cur.push(w);
    const endsSentence = /[.?!…]$/.test(w.raw);
    const endsClause = /[,;:]$/.test(w.raw);
    if (cur.length >= S.maxWords || endsSentence || (endsClause && cur.length >= 3)) flush();
  }
  flush();
  for (let i = 0; i < phrases.length; i++) {
    const nxt = phrases[i + 1];
    if (nxt) phrases[i].end = nxt.start - phrases[i].end < 0.35 ? nxt.start : Math.min(phrases[i].end + 0.2, nxt.start);
    else phrases[i].end += 0.2;
  }
  return { phrases, words: words.map((w) => ({ start: w.start, end: w.end, text: w.clean, raw: w.raw })), fillers };
}

const STOP = new Set('el la los las un una unos unas de del al a en y o u e que se su sus mi mis tu tus me te lo le les con por para como más mas pero si sí no ya es son fue era ser está esta están este esto eso esa ese muy hay he ha han yo tú vas voy va ahí ahi'.split(' '));
export function keyWords(text) {
  const w = plainText(text).split(' ').filter(Boolean);
  if (w.length <= 3) return w.join(' ');
  const score = (x) => (STOP.has(x.toLowerCase()) ? 0 : Math.min(x.length, 9));
  let best = 0, bi = 0;
  for (let i = 0; i + 3 <= w.length; i++) {
    const sc = score(w[i]) + score(w[i + 1]) + score(w[i + 2]);
    if (sc >= best) { best = sc; bi = i; }
  }
  const win = w.slice(bi, bi + 3);
  while (win.length > 2 && STOP.has(win[0].toLowerCase())) win.shift();
  while (win.length > 2 && STOP.has(win[win.length - 1].toLowerCase())) win.pop();
  return win.join(' ');
}

export function generateZooms({ phrases, keep, outDuration, seed = 1 }) {
  const Z = PRESET.zoom;
  if (!Z.enabled || !outDuration) return [];
  const rng = mulberry32(seed);
  const starts = phrases.map((p) => srcToOut(keep, p.start));
  const ev = [];
  let cur = 1, lastEnd = 0;
  const total = outDuration;
  let t = 1.5 + rng() * 2;
  while (t < total - 1.2) {
    let s = t, bestD = Infinity;
    for (const ps of starts) {
      const d = Math.abs(ps - t);
      if (d < bestD && d <= Z.snapWindowSec) { bestD = d; s = ps; }
    }
    s = Math.max(s, lastEnd + 0.2);
    if (s > total - 1.0) break;
    const fast = rng() < 0.5;
    const dur = fast ? Z.fastSec : Z.slowSec;
    const to = cur === 1 ? Z.scaleMin + rng() * (Z.scaleMax - Z.scaleMin) : 1;
    ev.push({ t0: s, t1: s + dur, from: cur, to, ease: fast ? 'out' : 'inout' });
    cur = to; lastEnd = s + dur;
    t = s + Z.everySecMin + rng() * (Z.everySecMax - Z.everySecMin);
  }
  if (cur !== 1 && total - lastEnd > 1.2) {
    const s = Math.min(lastEnd + 0.6, total - 1.0);
    ev.push({ t0: s, t1: s + Z.slowSec, from: cur, to: 1, ease: 'inout' });
  }
  return ev;
}

/** Devuelve phrases con los apoyos automáticos (auto:true) ya sincronizados con los zooms. */
export function withAutoSupport(phrases, zoomEvents, keep) {
  const S = PRESET.autoSupport;
  const out = phrases.filter((p) => !p.auto);
  if (S && S.enabled && zoomEvents.length && keep) {
    const used = new Set(); const added = [];
    zoomEvents.forEach((ev) => {
      const tSrc = outToSrc(keep, ev.t0 + 0.05);
      const base = out.find((p) => p.kind === 'base' && tSrc >= p.start && tSrc < p.end);
      if (!base || used.has(base)) return;
      if (out.some((p) => p.kind === 'dest' && tSrc >= p.start && tSrc < p.end)) return;
      if (out.some((p) => p.kind === 'apoyo' && p.start < base.end && p.end > base.start)) return;
      const text = keyWords(base.text);
      if (!text) return;
      used.add(base);
      added.push({ start: base.start, end: base.end, text, kind: 'apoyo', auto: true, keepBase: false,
        pos: { x: S.xAlt[added.length % S.xAlt.length], y: PRESET.support.centerYPct } });
    });
    out.push(...added);
  }
  out.sort((a, b) => a.start - b.start || (a.kind === 'apoyo') - (b.kind === 'apoyo'));
  return out;
}

/** Zoom en el instante de salida T (s). */
export function zoomAtOut(events, T) {
  let z = 1;
  for (const e of events) {
    if (T < e.t0) break;
    if (T >= e.t1) { z = e.to; continue; }
    const p = (T - e.t0) / (e.t1 - e.t0);
    const k = e.ease === 'out' ? 1 - Math.pow(1 - p, 3) : 0.5 - 0.5 * Math.cos(Math.PI * p);
    return e.from + (e.to - e.from) * k;
  }
  return z;
}

const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zñ0-9]/g, '');

/** Tomas repetidas: "hola como es… hola como e… hola como estas" → quita los intentos incompletos y deja el último. */
export function detectRepeats(words, { maxLen = 10, maxGap = 2.0 } = {}) {
  const n = words.length;
  const nw = words.map((w) => norm(w.text || w.raw));
  const out = new Set();
  const close = (a, b) => a && b && (a === b || a.startsWith(b) || b.startsWith(a));
  let i = 0;
  while (i < n - 1) {
    let hit = -1;
    for (let j = i + 1; j <= Math.min(n - 1, i + maxLen); j++) {
      if (words[j].start - words[j - 1].end > maxGap) break;
      const L = j - i;
      if (L === 1) {
        // palabra cortada a medias y repetida completa ("buen… bueno")
        if (nw[i].length >= 3 && nw[j] !== nw[i] && nw[j].startsWith(nw[i]) && words[j].start - words[j - 1].end < 1.0) { hit = j; break; }
        continue;
      }
      if (j + L > n) continue;
      let ok = true;
      for (let t = 0; t < L - 1 && ok; t++) ok = nw[i + t] === nw[j + t];
      if (ok && close(nw[i + L - 1], nw[j + L - 1])) { hit = j; break; }
    }
    if (hit > 0) { for (let k = i; k < hit; k++) out.add(k); i = hit; } else i++;
  }
  return out;
}

/** Marca como "sospechosos" arranques sueltos (1–3 palabras) separados del resto por pausas. No se quitan solos. */
export function markSuspects(words, gapSec = 0.5) {
  const groups = [];
  let cur = [];
  words.forEach((w, i) => {
    if (cur.length && w.start - words[cur[cur.length - 1]].end > gapSec) { groups.push(cur); cur = []; }
    cur.push(i);
  });
  if (cur.length) groups.push(cur);
  groups.forEach((g, gi) => {
    const lim = gi === 0 ? 3 : 2;
    if (g.length <= lim && groups.length > 1 && words.length > g.length + 4) g.forEach((i) => { if (!words[i].x) words[i].s = true; });
  });
}

/** Plan a partir de las palabras (las marcadas con `x` se sacan del video, subtítulos y cortes). */
export function planFromWords({ audio16k, sr = 16000, words, fillers, duration, sensitivity = 'normal', seed = 1, manualCuts = [] }) {
  const cfg = CUT_PRESETS[sensitivity] || CUT_PRESETS.normal;
  const active = words.filter((w) => !w.x);
  const chunks = active.map((w) => ({ text: w.raw, timestamp: [w.start, w.end] }));
  const { phrases } = buildPhrases(chunks);
  let cuts = detectCuts(audio16k, sr, active, fillers, duration, cfg);
  if (manualCuts.length) cuts = mergeCutRanges([...cuts, ...manualCuts.map((m) => ({ s: m.s, e: m.e, on: true }))]);
  return replan({ phrases, words, fillers, cuts, duration, seed });
}

/** Plan completo desde audio mono 16k + chunks de Whisper. */
export function makePlan({ audio16k, sr = 16000, chunks, duration, sensitivity = 'normal', seed = 1 }) {
  const { words, fillers } = buildPhrases(chunks);
  detectRepeats(words).forEach((i) => { words[i].x = 'rep'; });
  markSuspects(words);
  return planFromWords({ audio16k, sr, words, fillers, duration, sensitivity, seed });
}

/** Re-plan tras revisar: removed = índices que Benjamin quiere fuera; edits = {índice: texto}; times = {índice: {start,end}} (mover palabra/subtítulo); manualCuts = [{s,e}] cortes libres que dibujó en la línea de tiempo. */
export function editPlan({ audio16k, sr = 16000, words, fillers, duration, sensitivity = 'normal', seed = 1, removed, edits = {}, times = {}, manualCuts = [] }) {
  const ws = words.map((w, i) => {
    const c = { ...w };
    if (removed.has(i)) c.x = c.x || 'user'; else delete c.x;
    const t = edits[i];
    if (typeof t === 'string' && t.trim() && stripPunct(t.trim()) !== stripPunct(w.raw || w.text)) {
      const tail = (String(w.raw || '').match(/[.?!…,;:]+$/) || [''])[0];
      c.text = stripPunct(t.trim()); c.raw = t.trim() + (/[.?!…,;:]$/.test(t.trim()) ? '' : tail); c.e = true;
    }
    const tm = times[i];
    if (tm && Number.isFinite(tm.start) && Number.isFinite(tm.end) && tm.end - tm.start > 0.02) {
      c.start = Math.max(0, tm.start); c.end = Math.min(duration, tm.end);
    }
    return c;
  });
  const plan = planFromWords({ audio16k, sr, words: ws, fillers, duration, sensitivity, seed, manualCuts });
  return { ...plan, manualCuts };
}

/** Recalcula keep/zooms/apoyos a partir de frases y cortes (también para re-render tras revisión). */
export function replan({ phrases, words = [], fillers = [], cuts, duration, seed = 1, zoomEvents: fixedZooms = null }) {
  const { keep, outDuration } = keepFromCuts(cuts, duration);
  const clean = phrases.filter((p) => !p.auto);
  const zoomEvents = fixedZooms || generateZooms({ phrases: clean, keep, outDuration, seed });
  const all = withAutoSupport(clean, zoomEvents, keep);
  return { phrases: all, words, fillers, cuts, keep, outDuration, zoomEvents, duration, seed };
}
