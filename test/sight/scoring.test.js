import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTest } from '../src/generator/index.js';
import { expectedOnsets, detectOnsets, scoreRhythm } from '../src/app/scoring.js';
import { rules, GRADES } from './helpers.js';

const RATE = 44100;

/** A piano-ish strike: a decaying 220 Hz tone with a sharp attack, on a faintly noisy floor. */
function render(times, seconds, { noise = 0.0008, gain = 0.4 } = {}) {
  const out = new Float32Array(Math.floor(seconds * RATE));
  let seed = 12345;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) - 0.5;
  for (let i = 0; i < out.length; i++) out[i] = rand() * noise;
  for (const time of times) {
    const start = Math.floor(time * RATE);
    for (let i = 0; i < RATE * 0.6 && start + i < out.length; i++) {
      out[start + i] += gain * Math.exp(-i / (RATE * 0.18)) * Math.sin((2 * Math.PI * 220 * i) / RATE);
    }
  }
  return out;
}

const EXPECTED = [0, 0.5, 1, 1.5, 2, 2.75, 3, 3.5, 4, 5];

test('onsets are found where notes start', () => {
  const found = detectOnsets(render(EXPECTED.map((t) => t + 0.5), 7), RATE);
  assert.equal(found.length, EXPECTED.length);
  found.forEach((time, i) => assert.ok(Math.abs(time - (EXPECTED[i] + 0.5)) < 0.03, `onset ${i}: ${time}`));
});

test('silence and room noise report no onsets', () => {
  assert.deepEqual(detectOnsets(new Float32Array(RATE * 3), RATE), []);
  assert.deepEqual(detectOnsets(render([], 3, { noise: 0.004 }), RATE), []);
});

test('a perfect performance scores high, and a constant lag is reported, not punished', () => {
  const lag = 0.18;
  const detected = detectOnsets(render(EXPECTED.map((t) => t + 0.6 + lag), 8), RATE);
  const result = scoreRhythm(EXPECTED, detected.map((t) => t - 0.6), { tempoBpm: 100 });
  assert.ok(result.score >= 95, JSON.stringify(result));
  assert.ok(Math.abs(result.offsetMs - 180) < 30, JSON.stringify(result));
  assert.equal(result.missed, 0);
});

test('skipped notes and wrong timing lower the score', () => {
  const half = EXPECTED.filter((_, i) => i % 2 === 0);
  const skipped = scoreRhythm(EXPECTED, detectOnsets(render(half.map((t) => t + 0.5), 7), RATE).map((t) => t - 0.5), { tempoBpm: 100 });
  assert.ok(skipped.score < 70 && skipped.missed >= 4, JSON.stringify(skipped));

  const sloppy = EXPECTED.map((t, i) => t + (i % 2 ? 0.22 : -0.22));
  const result = scoreRhythm(EXPECTED, detectOnsets(render(sloppy.map((t) => t + 0.6), 8), RATE).map((t) => t - 0.6), { tempoBpm: 100 });
  assert.ok(result.score < 60, JSON.stringify(result));
});

test('nothing played scores zero', () => {
  assert.equal(scoreRhythm(EXPECTED, [], { tempoBpm: 100 }).score, 0);
});

test('expected onsets: ascending, both hands merged, one per attack', () => {
  for (const grade of GRADES) {
    for (let seed = 1; seed <= 6; seed++) {
      const score = generateTest(rules, { grade, seed });
      const onsets = expectedOnsets(score);
      assert.ok(onsets.length > 0);
      onsets.forEach((time, i) => { if (i) assert.ok(time - onsets[i - 1] > 0.04); });
      const total = score.barCount * (score.barDuration / score.divisions) * (60 / score.tempoBpm);
      assert.ok(onsets.at(-1) < total, 'last attack is inside the piece');
    }
  }
});

test('a lag longer than the gap between notes is still found (dense passages)', () => {
  // Notes 0.15 s apart and a 0.27 s lag: the nearest played onset to a written
  // note is usually its neighbour, which is what broke the first estimator.
  const written = Array.from({ length: 24 }, (_, i) => i * 0.15 + (i > 12 ? 0.3 : 0));
  const played = written.map((time) => time + 0.27);
  const result = scoreRhythm(written, played, { tempoBpm: 100 });
  assert.ok(result.score >= 95, JSON.stringify(result));
  assert.ok(Math.abs(result.offsetMs - 270) <= 10, JSON.stringify(result));
  assert.equal(result.missed, 0);
});
