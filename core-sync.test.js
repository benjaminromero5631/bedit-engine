import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCuts, keepFromCuts, srcToOut, outToSrc } from './cuts.js';
import { buildPhrases, generateZooms, markSuspects, planFromWords } from './plan.js';

test('time mapping skips removed source intervals without shifting them onto later footage', () => {
  const { keep } = keepFromCuts([{ s: 1, e: 2, on: true }], 4);
  assert.equal(srcToOut(keep, 0.5), 0.5);
  assert.equal(srcToOut(keep, 1.5), -1);
  assert.equal(srcToOut(keep, 2), 1);
  assert.equal(srcToOut(keep, 3), 2);
  assert.equal(outToSrc(keep, 1), 2);
  assert.equal(outToSrc(keep, 2), 3);
});

test('a manual cut removes intersecting speech from captions; removing it restores the caption', () => {
  const audio16k = new Float32Array(3 * 16000).fill(0.1);
  const words = [
    { raw: 'hola', text: 'hola', start: 0.5, end: 0.8 },
    { raw: 'mundo', text: 'mundo', start: 1.5, end: 1.8 },
  ];
  const args = { audio16k, words, fillers: [], duration: 3, seed: 4 };
  const cut = planFromWords({ ...args, manualCuts: [{ s: 0.4, e: 0.9 }] });
  assert.deepEqual(cut.phrases.filter((p) => p.kind === 'base').map((p) => p.text), ['mundo']);
  const restored = planFromWords(args);
  assert.deepEqual(restored.phrases.filter((p) => p.kind === 'base').map((p) => p.text), ['hola', 'mundo']);
});

test('a sub-frame edge overlap does not suppress the full spoken word', () => {
  const audio16k = new Float32Array(2 * 16000).fill(0.1);
  const words = [{ raw: 'hola', text: 'hola', start: 0.5, end: 0.8 }];
  const plan = planFromWords({ audio16k, words, fillers: [], duration: 2,
    manualCuts: [{ s: 0.49, e: 0.51 }] });
  assert.deepEqual(plan.phrases.filter((p) => p.kind === 'base').map((p) => p.text), ['hola']);
});

test('automatic zoom transitions stay sparse and alternate in and out', () => {
  const phrases = Array.from({ length: 100 }, (_, i) => ({ start: i * 0.6, end: i * 0.6 + 0.4 }));
  const events = generateZooms({ phrases, keep: [{ s: 0, e: 60, o: 0 }], outDuration: 60, seed: 123 });
  assert.ok(events.length >= 6);
  for (let i = 0; i < events.length - 1; i++) {
    assert.notEqual(events[i].to, events[i + 1].to, 'cada transición debe alternar zoom y zoom out');
    const gap = events[i + 1].t0 - events[i].t0;
    // El último evento puede ser el zoom-out de cierre, añadido al terminar el reel.
    if (gap < 3) assert.equal(i + 1, events.length - 1);
    else assert.ok(gap <= 5, `separación inesperada de ${gap.toFixed(2)} s`);
  }
});

test('speech-aligned cuts remove a loud non-speech blip in a long pause', () => {
  const sr = 16000, duration = 5, audio = new Float32Array(sr * duration);
  for (let i = 0; i < audio.length; i++) {
    const t = i / sr;
    if ((t >= 0.5 && t < 1.5) || (t >= 3 && t < 4)) audio[i] = 0.1 * Math.sin(2 * Math.PI * 180 * t);
    else if (t >= 2.05 && t < 2.25) audio[i] = 0.4 * Math.sin(2 * Math.PI * 900 * t);
  }
  const words = [{ start: 0.55, end: 1.45 }, { start: 3.05, end: 3.95 }];
  const cuts = detectCuts(audio, sr, words, [], duration);
  assert.ok(cuts.some((c) => c.s <= 2.05 && c.e >= 2.25), 'el ruido del silencio debe quedar dentro del corte');
  for (const w of words) {
    assert.ok(cuts.every((c) => Math.min(c.e, w.end) - Math.max(c.s, w.start) < 1 / 60), 'no debe cortar palabras reconocidas');
  }
});

test('low Whisper confidence is exposed for review, not auto-deleted', () => {
  const { words } = buildPhrases([
    { text: 'hola', timestamp: [0.1, 0.3], confidence: 0.32 },
    { text: 'amigo', timestamp: [0.35, 0.65], confidence: 0.91 },
  ]);
  markSuspects(words);
  assert.equal(words[0].confidence, 0.32);
  assert.equal(words[0].s, true);
  assert.equal(words[0].x, undefined);
  assert.equal(words[1].s, undefined);
});
