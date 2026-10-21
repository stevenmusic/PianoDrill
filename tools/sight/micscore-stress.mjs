/* 麥克風自動打分:接近真實的情況(node 側)。micscore-check.mjs 是「乾淨」的錄音(手很準、沒有踏板、幾乎沒有雜音),
   這裡模擬家裡用手機錄:手的自然誤差 ±35 ms + 樂句的快慢起伏、力度大小不一、踏右踏板、彈得小聲、手機放遠一點(殘響)、
   電扇 / 冷氣的嗡嗡聲、旁邊有人講話。學生都是「彈對了」,所以:
     音頭找回率 ≥ 門檻、多抓的音頭 ≤ 門檻、準度不該被雜音拉低、初級–2 級不能把對的音判成錯音。
     node tools/sight/micscore-stress.mjs [--grades 0,1,2,3,5] [--seeds 2] [--only human,pedal] */
import { readFileSync } from 'node:fs';
import { open } from '../test/harness.mjs';
import { generateTest } from '../../js/sight/generator/index.js';
import { expectedEvents, scorePerformance, alignOnsets, checkPitches, detectNotes } from '../../js/sight/micscore.js';
import { performance as perform, renderInPage } from './micaudio.mjs';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const GRADES = arg('--grades', '0,1,2,3,5').split(',').map(Number);
const SEEDS = Number(arg('--seeds', 3));
const ONLY = arg('--only', '');
const RATE = 48000;
const rules = JSON.parse(readFileSync(new URL('../../data/sight-rules.json', import.meta.url), 'utf8'));

/* 背景聲(node 側加上去):fan = 低頻偏多的連續雜音;talk = 一個人講話(3–6 Hz 起伏的音節,有基頻與泛音) */
function rng(seed) { let z = seed >>> 0; return () => { z = (z * 1664525 + 1013904223) >>> 0; return z / 4294967296 - 0.5; }; }
function addFan(x, level, seed) {
  const r = rng(seed); let b0 = 0, b1 = 0;
  for (let k = 0; k < x.length; k++) { const w = r(); b0 = 0.995 * b0 + 0.05 * w; b1 = 0.9 * b1 + 0.1 * w; x[k] += level * (3 * b0 + 0.6 * b1 + 0.15 * w); }
}
function addTalk(x, level, seed) {
  const r = rng(seed); let ph = 0, f0 = 150, env = 0, target = 0, next = 0;
  for (let k = 0; k < x.length; k++) {
    const t = k / RATE;
    if (t >= next) { target = r() > -0.2 ? 0.5 + r() : 0; next = t + 0.12 + 0.15 * (r() + 0.5); f0 = 120 + 80 * (r() + 0.5); }
    env += (target - env) * 0.0015;
    ph += (2 * Math.PI * f0) / RATE;
    let v = 0; for (let h = 1; h <= 12; h++) v += Math.sin(h * ph) / h * (h > 2 && h < 7 ? 1.6 : 1);
    x[k] += level * env * (0.25 * v + 0.2 * r());
  }
}
function gain(x, g) { for (let k = 0; k < x.length; k++) x[k] *= g; }

const HUMAN = { jitter: 0.035, rubato: 0.08, vel: [40, 95] };
const SC = {
  human: { ...HUMAN },
  pedal: { ...HUMAN, pedal: true, room: 0.5 },
  soft: { ...HUMAN, vel: [22, 50], post: { gain: 0.35 }, noise: 0.0015 },
  far: { ...HUMAN, room: 0.9, post: { gain: 0.15 }, noise: 0.0015 },
  fan: { ...HUMAN, post: { fan: 0.004 } },
  talk: { ...HUMAN, post: { talk: 0.01 } },   // 同一個房間有人講話:比琴聲小約 20 dB
  home: { ...HUMAN, pedal: true, room: 0.6, vel: [30, 80], post: { gain: 0.3, fan: 0.002 }, noise: 0.001 },
};
// 每一份:音頭找回 ≥ 8 成、多抓 ≤ 12%、彈對了準度 ≥ 80、初級–2 級不誤判錯音;每種情況平均找回 ≥ 9 成
const LIMIT = { recall: 0.8, meanRecall: 0.9, extraRate: 0.12, acc: 80 };
const { page, close } = await open({ viewport: { width: 800, height: 600 } });
const rows = [], problems = [];
for (const grade of GRADES) for (let seed = 1; seed <= SEEDS; seed++) {
  const score = generateTest(rules, { grade, seed: grade * 100 + seed + 50 });
  const exp = expectedEvents(score);
  for (const [name, s] of Object.entries(SC)) {
    if (ONLY && !ONLY.split(',').includes(name)) continue;
    const { notes, truth } = perform(score, { ...s, seed });
    const last = notes.reduce((a, x) => Math.max(a, x.time + Math.min(x.dur, 3)), 0);
    const x = await renderInPage(page, notes, last + 1.5, { room: s.room || 0, noise: s.noise ?? 0.0006 });
    const p = s.post || {};
    if (p.gain) gain(x, p.gain);
    if (p.fan) addFan(x, p.fan, seed * 7);
    if (p.talk) addTalk(x, p.talk, seed * 11);
    const on = detectNotes(x, RATE);
    // 找回率 / 多抓:真實的起音 ±60 ms 內有沒有偵測到的音頭(偵測的時間有固定偏移,先扣掉中位數)
    const tr = truth.onsets.filter((t) => t !== null);
    const near = (t) => on.reduce((b, o) => (Math.abs(o - t) < Math.abs(b - t) ? o : b), Infinity);
    const off = tr.map((t) => near(t) - t).filter((d) => Math.abs(d) < 0.08).sort((a, b) => a - b);
    const bias = off.length ? off[off.length >> 1] : 0;
    const hit = tr.filter((t) => Math.abs(near(t + bias) - (t + bias)) <= 0.06).length;
    const extra = on.filter((o) => !tr.some((t) => Math.abs(o - bias - t) <= 0.06)).length;
    let pitchOk = null;
    if (grade <= 2 && on.length) { const { pairs } = alignOnsets(exp.events.map((e) => e.beat), on); pitchOk = checkPitches(x, RATE, exp.events, on, pairs); }
    const r = scorePerformance(exp, on, { pitchOk });
    const trueBpm = score.tempoBpm;
    const row = { grade, seed, name, n: tr.length, recall: +(hit / tr.length).toFixed(2), extra, acc: r.accuracy ?? '-', R: r.rhythm, S: r.stability, C: r.continuity, P: r.pitch ?? '', wrong: r.wrong ?? '', bpm: r.bpmEst ? Math.round(r.bpmEst) : '-', true: trueBpm };
    rows.push(row);
    const tag = `${grade}-${seed} ${name}`;
    if (row.recall < LIMIT.recall) problems.push(`${tag}: 音頭找回率 ${row.recall}`);
    if (extra > Math.max(2, LIMIT.extraRate * tr.length)) problems.push(`${tag}: 多抓 ${extra} 個音頭`);
    if (!(r.accuracy >= LIMIT.acc)) problems.push(`${tag}: 彈對了準度只有 ${r.accuracy}`);
    if (grade <= 2 && r.wrong > 0) problems.push(`${tag}: 彈對了卻判 ${r.wrong} 個錯音`);
  }
}
await close();
console.table(rows);
const by = {};
for (const r of rows) { const b = (by[r.name] ||= { n: 0, recall: 0, extra: 0, acc: 0, wrong: 0 }); b.n++; b.recall += r.recall; b.extra += r.extra; b.acc += Number(r.acc) || 0; b.wrong += Number(r.wrong) || 0; }
console.table(Object.fromEntries(Object.entries(by).map(([k, b]) => [k, { recall: (b.recall / b.n).toFixed(3), extra: (b.extra / b.n).toFixed(1), acc: (b.acc / b.n).toFixed(1), wrongNotes: b.wrong }])));
for (const [k, b] of Object.entries(by)) if (b.recall / b.n < LIMIT.meanRecall) problems.push(`${k}: 平均找回率 ${(b.recall / b.n).toFixed(2)}`);
if (problems.length) { console.error('\n✗', problems.length, '項問題:\n - ' + problems.join('\n - ')); process.exit(1); }
console.log('\n✓ 接近真實的情況全部通過');
