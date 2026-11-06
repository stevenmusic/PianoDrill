import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTest } from '../../js/sight/generator/index.js';
import { expectedEvents, scorePerformance, detectNotes, createNoteOnsets, scoreRecording } from '../../js/sight/micscore.js';
import { rules } from './helpers.js';

/* 音頭時間直接給(不經過音訊):對齊、速度、各項目 */
function times(score, { tempo = 1, pauseAt = -1, pauseBeats = 2, drop = [], accel = 0, lead = 0.7 } = {}) {
  const ev = expectedEvents(score).events;
  const spb = 60 / score.tempoBpm / tempo;
  const total = ev[ev.length - 1].beat + 1;
  const at = (b) => (accel ? (spb * total / accel) * Math.log(1 + (accel * b) / total) : spb * b);
  return ev.map((e, k) => (drop.includes(k) ? null : lead + at(e.beat) + (k >= pauseAt && pauseAt >= 0 ? pauseBeats * spb : 0))).filter((t) => t !== null);
}

for (const grade of [0, 1, 3, 6]) {
  const score = generateTest(rules, { grade, seed: 40 + grade });
  const exp = expectedEvents(score);
  test(`grade ${grade}: own tempo is found and not punished`, () => {
    for (const tempo of [1, 0.7, 1.2]) {
      const r = scorePerformance(exp, times(score, { tempo }));
      assert.ok(Math.abs(r.bpmEst - score.tempoBpm * tempo) / (score.tempoBpm * tempo) < 0.01, `${tempo}: ${r.bpmEst}`);
      assert.ok(r.accuracy >= 95, `${tempo}: ${r.accuracy}`);
    }
  });
  test(`grade ${grade}: a pause, missed notes and speeding up each show where they belong`, () => {
    const n = exp.events.length, mid = Math.floor(n / 2);
    const pause = scorePerformance(exp, times(score, { pauseAt: mid }));
    assert.ok(pause.continuity < 100 && pause.pauses.length === 1, JSON.stringify(pause.pauses));
    const miss = scorePerformance(exp, times(score, { drop: [2, mid, n - 3] }));
    assert.equal(miss.missed, 3);
    assert.ok(miss.rhythm < 100);
    const fast = scorePerformance(exp, times(score, { accel: 0.35 }));
    assert.ok(fast.trend === 'faster' || fast.stability < 85, `${fast.trend} ${fast.stability}`);
  });
}

test('nothing heard is reported as silence', () => {
  const score = generateTest(rules, { grade: 1, seed: 3 });
  assert.equal(scorePerformance(expectedEvents(score), []).silent, true);
});

test('spectral-flux onsets: legato tones and padded gaps', () => {
  const rate = 48000, out = new Float32Array(rate * 4);
  let seed = 9;
  for (let i = 0; i < out.length; i++) out[i] = (((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) - 0.5) * 0.002;   // 房間的雜音
  const starts = [0.5, 1.0, 1.5, 2.0, 2.5];
  starts.forEach((t, k) => {
    const f = 262 * 2 ** ([0, 2, 4, 5, 7][k] / 12);
    for (let i = 0; Math.round(t * rate) + i < out.length; i++) out[Math.round(t * rate) + i] += 0.2 * Math.exp(-i / (rate * 0.8)) * Math.sin((2 * Math.PI * f * i) / rate);
  });
  // 每個音都找到(固定的偏移不算),多出來的最多 3 個(純正弦波相鄰半音的拍頻很強,鋼琴不會這樣;
  // 多抓的真正檢查在 Salamander 取樣的 tools/sight/micscore-check.mjs 與 micscore-stress.mjs(踏板、講話…平均多抓 ≤ 1.1 個))
  const hitAll = (found) => {
    const off = found.find((t) => Math.abs(t - starts[0]) < 0.06) - starts[0];
    assert.ok(Number.isFinite(off), found.join(' '));
    for (const t0 of starts) assert.ok(found.some((t) => Math.abs(t - t0 - off) < 0.02), `${t0}: ${found.join(' ')}`);
    assert.ok(found.length <= starts.length + 3, found.join(' '));
  };
  hitAll(detectNotes(out, rate));
  // mic.js 補的靜音(一段 0)接回聲音時不算新的音
  const gap = out.slice();
  gap.fill(0, Math.round(1.2 * rate), Math.round(1.3 * rate));
  hitAll(detectNotes(gap, rate));
  // 即時版跟整段一樣
  const live = createNoteOnsets(rate);
  for (let i = 0; i < out.length; i += 2048) live.push(out.subarray(i, i + 2048));
  hitAll(live.onsets);
});

/* 按了「彈一遍」卻沒彈:只有麥克風底噪、碰到手機的聲音 → 不能給分數(使用者回報:沒彈也有準度 55) */
test('no piano (mic hiss, bumps) is reported as silence, not scored', () => {
  const score = generateTest(rules, { grade: 1, seed: 3 });
  const rate = 48000;
  let z = 7;
  const r = () => { z = (z * 1664525 + 1013904223) >>> 0; return z / 4294967296 - 0.5; };
  const hiss = new Float32Array(rate * 12);
  for (let k = 0; k < hiss.length; k++) hiss[k] = 0.012 * r();
  assert.equal(scoreRecording(hiss, rate, score).silent, true);
  const bumps = new Float32Array(rate * 12);
  for (let k = 0; k < bumps.length; k++) bumps[k] = 0.0012 * r();
  for (let t = 0.7; t < 11; t += 1.3) { const k0 = Math.round(t * rate); for (let k = 0; k < 2400; k++) bumps[k0 + k] += 0.04 * Math.exp(-k / 300) * r(); }
  assert.equal(scoreRecording(bumps, rate, score).silent, true);
});

/* 今日練習「App 聽你彈」(scoreDaily):合成的琴聲(諧波 + 衰減)、拍點(很短的雜音);真的取樣在 tools/tech/listen-stress.mjs */
test('daily listening: right notes pass, wrong / octave low / octave high / half / no piano / clicks only do not', async () => {
  const { scoreDaily } = await import('../../js/sight/micscore.js');
  const { listenExpected } = await import('../../js/tech/patterns.js');
  const fs = await import('node:fs');
  const FG = JSON.parse(fs.readFileSync(new URL('../../data/fingerings.json', import.meta.url)));
  const exp = listenExpected(FG, { type: 'route', r: 'finger', id: 'PA1', hands: 'RH', sub: 2 }, { bpm: 72 });
  assert.equal(exp.events.length, 16);
  const rate = 48000, spb = 60 / 72, t0 = 0.4 + 8 * spb;
  let z = 5;
  const r = () => { z = (z * 1664525 + 1013904223) >>> 0; return z / 4294967296 - 0.5; };
  const take = ({ shift = 0, upto = 16, clicks = true, piano = true } = {}) => {
    const x = new Float32Array(Math.round(rate * (t0 + 16 * spb + 2)));
    for (let k = 0; k < x.length; k++) x[k] = 0.0006 * r();
    if (piano) exp.events.slice(0, upto).forEach((e) => {
      const f = 440 * 2 ** ((e.midi + shift - 69) / 12), k0 = Math.round((t0 + e.beat * spb + 0.01 * r()) * rate);
      for (let k = 0; k < rate * spb * 1.2 && k0 + k < x.length; k++) {
        const t = k / rate; let v = 0;
        for (let h = 1; h <= 8; h++) v += Math.sin(2 * Math.PI * f * h * t) / h;
        x[k0 + k] += 0.05 * v * Math.min(1, t / 0.004, (rate * spb * 1.2 - k) / (rate * 0.08)) * Math.exp(-t / 0.6);   // 最後 80 ms 淡出(放鍵)
      }
    });
    const ct = [];
    for (let b = 0; b < (clicks ? 24 : 8); b++) { const at = 0.4 + b * spb; ct.push(at); const k0 = Math.round(at * rate); for (let k = 0; k < 1500; k++) x[k0 + k] += 0.06 * Math.exp(-k / 150) * 2 * r(); }
    return { x, ct };
  };
  const run = (o) => { const { x, ct } = take(o); return scoreDaily(x, rate, exp, { clicks: ct, t0 }); };
  const good = run({});
  assert.ok(good.ok, JSON.stringify({ reason: good.reason, matched: good.matched, wrong: good.wrong, extra: good.extra }));
  assert.ok(run({ clicks: false }).ok);
  for (const shift of [-2, -1, 1, 2]) assert.equal(run({ shift }).ok, false, `shift ${shift}`);
  const half = run({ upto: 8 });
  assert.equal(half.ok, false);
  assert.equal(half.reason, 'missed');
  const none = run({ piano: false });
  assert.equal(none.ok, false);
  assert.ok(['silent', 'notPiano'].includes(none.reason), none.reason);
  // 整段低一個八度(音名對、位置錯):有沒有拍點都要判出來
  for (const clicks of [true, false]) { const o = run({ shift: -12, clicks }); assert.equal(o.ok, false); assert.equal(o.reason, 'octaveLow', `clicks ${clicks}: ${o.reason}`); }
  // 整段高一個八度:一樣要判出來
  for (const clicks of [true, false]) { const o = run({ shift: 12, clicks }); assert.equal(o.ok, false); assert.equal(o.reason, 'octaveHigh', `clicks ${clicks}: ${o.reason}`); }
});
