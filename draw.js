import { PRESET } from './config.js';

export function stripPunct(s) {
  return s
    .replace(/[.,;:¿?¡!"“”‘’«»()\[\]{}…·]/g, '')
    .replace(/(^|\s)[-–—]+(\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}



export function fontStr(F, px, fallback = 'sans-serif') {
  return `${F.fontStyle || 'normal'} ${F.fontWeight} ${px}px ${F.fontFamily}, ${fallback}`;
}
function setTracking(c, tracking, px) {
  if ('letterSpacing' in c) c.letterSpacing = `${(tracking * px).toFixed(2)}px`;
}
function applyShadow(c, sh, px) {
  c.shadowColor = sh.color;
  c.shadowBlur = px * sh.blur;
  c.shadowOffsetY = px * sh.offsetY;
}
function easeOutBack(p) {
  const c1 = 1.2, c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
}


export function plainText(text) { return stripPunct(text.replace(/\|/g, ' ')); }

// Reparte una frase destacada en { small, big, serif }. Con "|" manda el usuario.
export function splitHighlight(text) {
  if (text.includes('|')) {
    const parts = text.split('|').map((x) => stripPunct(x)).filter(Boolean);
    if (parts.length >= 3) return { small: parts[0], big: parts[1], serif: parts.slice(2).join(' ') };
    if (parts.length === 2) return { big: parts[0], serif: parts[1] };
    return { big: parts[0] || '' };
  }
  const w = stripPunct(text).split(' ').filter(Boolean);
  const n = w.length;
  if (n <= 1) return { big: w[0] || '' };
  if (n === 2) return { big: w[0], serif: w[1] };
  const k = Math.max(1, Math.floor(n / 3));
  return { small: w.slice(0, k).join(' '), big: w.slice(k, n - k).join(' '), serif: w.slice(n - k).join(' ') };
}
export function autoSplitText(text) {
  const p = splitHighlight(text);
  return [p.small, p.big, p.serif].filter(Boolean).join(' | ');
}

export function measure(c, s) { return c.measureText(s).width; }

export function layoutLines(c, text, fontPx, maxW, S = PRESET.subtitle) {
  c.font = fontStr(S, fontPx);
  setTracking(c, S.tracking, fontPx);
  const words = text.split(' ').filter(Boolean);
  if (!words.length) return [];
  let lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (measure(c, test) > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  lines.push(line);
  // Si quedaron 2 líneas, las equilibramos
  if (lines.length === 2 && words.length > 2) {
    let best = null, bestW = Infinity;
    for (let k = 1; k < words.length; k++) {
      const a = words.slice(0, k).join(' '), b = words.slice(k).join(' ');
      const w = Math.max(measure(c, a), measure(c, b));
      if (w < bestW && w <= maxW) { bestW = w; best = [a, b]; }
    }
    if (best) lines = best;
  }
  return lines;
}

export function drawSubtitle(c, W, H, text, S = PRESET.subtitle, pos) {
  if (!text) return null;
  const maxW = W * S.maxWidthPct;
  let fontPx = H * S.sizePct;
  let lines = layoutLines(c, text, fontPx, maxW, S);
  while (lines.length > S.maxLines && fontPx > H * S.sizePct * 0.7) {
    fontPx *= 0.95;
    lines = layoutLines(c, text, fontPx, maxW, S);
  }
  const lh = fontPx * S.lineHeight;
  const blockH = lines.length * lh;
  const cx = W * (pos ? pos.x : 0.5);
  const cy = H * (pos ? pos.y : S.centerYPct);
  const top = cy - blockH / 2;

  c.save();
  c.font = fontStr(S, fontPx);
  setTracking(c, S.tracking, fontPx);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = S.fill;
  applyShadow(c, S.shadow, fontPx);
  let wmax = 0;
  lines.forEach((ln, i) => { wmax = Math.max(wmax, measure(c, ln)); c.fillText(ln, cx, top + lh * i + lh / 2); });
  c.restore();
  return { x: cx - wmax / 2, y: top, w: wmax, h: blockH };
}

export function drawHighlight(c, W, H, parts, tIn, pos) {
  const Hh = PRESET.highlight;
  const slots = [];
  if (parts.small) slots.push({ key: 'small', F: Hh.small, text: parts.small, fb: 'sans-serif' });
  if (parts.big) slots.push({ key: 'big', F: Hh.big, text: parts.big.toUpperCase(), fb: 'sans-serif' });
  if (parts.serif) slots.push({ key: 'serif', F: Hh.serif, text: parts.serif, fb: 'serif' });
  if (!slots.length) return null;

  const widthOf = (sl, k) => {
    const px = H * sl.F.sizePct * k;
    c.font = fontStr(sl.F, px, sl.fb);
    setTracking(c, sl.F.tracking, px);
    return measure(c, sl.text);
  };

  // Si alguna línea se pasa del ancho, se achica todo el bloque
  let widest = 0;
  for (const sl of slots) widest = Math.max(widest, widthOf(sl, 1));
  const k = widest > W * Hh.maxWidthPct ? (W * Hh.maxWidthPct) / widest : 1;
  for (const sl of slots) sl.w = widthOf(sl, k);

  // Bloque: la línea grande manda el ancho; la pequeña se alinea a su izquierda y la cursiva a su derecha
  const bigSlot = slots.find((x) => x.key === 'big');
  const bw = bigSlot ? bigSlot.w : widest * k;
  const cx = W * (pos ? pos.x : 0.5);
  const left = cx - bw / 2, right = cx + bw / 2;

  // Posición vertical; con menos de 3 líneas el bloque se centra solo
  const offs = slots.map((sl) => Hh.offsets[sl.key] * H * k);
  let shift = 0;
  if (slots.length < 3) shift = (Math.min(...offs) + Math.max(...offs)) / 2;

  // Entrada con pop pequeño
  let s = 1;
  if (tIn >= 0 && tIn < Hh.popSec) s = Hh.popFrom + (1 - Hh.popFrom) * easeOutBack(tIn / Hh.popSec);
  const cy = H * (pos ? pos.y : Hh.centerYPct);

  c.save();
  c.translate(cx, cy);
  c.scale(s, s);
  c.translate(-cx, -cy);
  c.textBaseline = 'middle';
  c.fillStyle = Hh.fill;
  slots.forEach((sl, i) => {
    const px = H * sl.F.sizePct * k;
    c.font = fontStr(sl.F, px, sl.fb);
    setTracking(c, sl.F.tracking, px);
    applyShadow(c, Hh.shadow, px);
    let x = cx, align = 'center';
    if (sl.key === 'small' && sl.w <= bw) { x = left; align = 'left'; }
    if (sl.key === 'serif' && sl.w <= bw) { x = right; align = 'right'; }
    c.textAlign = align;
    c.fillText(sl.text, x, cy + offs[i] - shift);
  });
  c.restore();
  let top = Infinity, bottom = -Infinity, wmax = 0;
  slots.forEach((sl, i) => {
    const px = H * sl.F.sizePct * k;
    top = Math.min(top, cy + offs[i] - shift - px * 0.62);
    bottom = Math.max(bottom, cy + offs[i] - shift + px * 0.62);
    wmax = Math.max(wmax, sl.w);
  });
  return { x: cx - wmax / 2, y: top, w: wmax, h: bottom - top };
}



/** Dibuja SOLO subtítulos (sin video) para el instante `t` (segundos del video original). Devuelve true si dibujó algo. */
export function drawOverlay(c, W, H, t, phrases) {
  c.clearRect(0, 0, W, H);
  const ps = phrases;
  const active = [];
  ps.forEach((p, i) => { if (t >= p.start && t < p.end) active.push(i); });
  if (!active.length) return false;
  const latest = (arr) => arr.reduce((b, i) => (b < 0 || ps[i].start >= ps[b].start ? i : b), -1);
  const dest = latest(active.filter((i) => ps[i].kind === 'dest'));
  const apoyos = active.filter((i) => ps[i].kind === 'apoyo');
  let baseCands = active.filter((i) => ps[i].kind === 'base' || (ps[i].kind === 'dest' && ps[i].keepBase));
  if (dest >= 0 && !ps[dest].keepBase) baseCands = [];
  const bi = latest(baseCands);
  let drew = false;
  if (bi >= 0) {
    const p = ps[bi];
    const pos = p.kind === 'dest' ? p.posBase : p.pos;
    drawSubtitle(c, W, H, plainText(p.text), PRESET.subtitle, pos); drew = true;
  }
  for (const i of apoyos) { drawSubtitle(c, W, H, plainText(ps[i].text), PRESET.support, ps[i].pos); drew = true; }
  if (dest >= 0) { const p = ps[dest]; drawHighlight(c, W, H, splitHighlight(p.text), t - p.start, p.pos); drew = true; }
  return drew;
}
