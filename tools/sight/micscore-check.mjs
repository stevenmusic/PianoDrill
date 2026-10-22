/* 麥克風自動打分(node 側):用 Salamander 取樣把真的題目算成音訊(tools/sight/micaudio.mjs),
   跑 js/shared/onsets.js 的 detectOnsets + js/sight/micscore.js,檢查:
   速度估計誤差 ≤ 3%、準時的準度 ≥ 90、慢 30% / 快 20% 不扣分、越彈越快 → 穩定、中途停 2 拍 → 連貫、漏 3 個音 → 節奏、彈錯音(初級–2 級)→ 音、安靜 → 沒聽到。
     node tools/sight/micscore-check.mjs [--grades 0,1,2,3,5] [--seeds 3] */
import { readFileSync } from 'node:fs';
import { open } from '../test/harness.mjs';
import { generateTest } from '../../js/sight/generator/index.js';
import { expectedEvents, scoreRecording } from '../../js/sight/micscore.js';
import { performance as perform, renderInPage } from './micaudio.mjs';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const GRADES = arg('--grades', '0,1,2,3,5').split(',').map(Number);
const SEEDS = Number(arg('--seeds', 3));
const rules = JSON.parse(readFileSync(new URL('../../data/sight-rules.json', import.meta.url), 'utf8'));
const { page, close } = await open({ viewport: { width: 800, height: 600 } });
const problems = [];
const rows = [];

export function analyse(samples, rate, score, grade) {
  return scoreRecording(samples, rate, { ...score, grade });   // App 同一條路(js/sight/app.js 的 analyseTake)
}

function pickInner(n, k, seed) { const out = []; for (let x = 1; x <= k; x++) out.push(Math.min(n - 2, Math.max(1, Math.round((n * x) / (k + 1)) + (seed % 2)))); return [...new Set(out)]; }

for (const grade of GRADES) for (let seed = 1; seed <= SEEDS; seed++) {
  const score = generateTest(rules, { grade, seed: grade * 100 + seed });
  const n = expectedEvents(score).events.length;
  const mid = Math.floor(n / 2);
  const rh = expectedEvents(score).events.map((e, k) => (e.pitches.some((p) => p >= 60) ? k : -1)).filter((k) => k > 0 && k < n - 1);
  const wrongIdx = [...new Set([rh[Math.floor(rh.length / 4)], rh[Math.floor(rh.length / 2)], rh[Math.floor((3 * rh.length) / 4)]])].filter((k) => k !== undefined);
  const SC = {
    ontime: {}, slow30: { tempo: 0.7 }, fast20: { tempo: 1.2 }, accel: { accel: 0.35 },
    pause: { pauseAt: mid, pauseBeats: 2 }, miss3: { drop: pickInner(n, 3, seed) },
    ...(grade <= 2 ? { wrong: { wrong: Object.fromEntries(wrongIdx.map((k, x) => [k, x % 2 ? -1 : 2])) } } : {}),
    room: { jitter: 0.02, room: 0.6, noise: 0.003 },
    silent: { silent: true },
  };
  const res = {};
  for (const [name, s] of Object.entries(SC)) {
    const { notes, truth } = perform(score, { ...s, seed });
    const last = notes.reduce((a, x) => Math.max(a, x.time + x.dur), 0);
    const samples = await renderInPage(page, s.silent ? [] : notes, (s.silent ? 4 : last) + 1.5, { room: s.room || 0, noise: s.noise ?? 0.0006 });
    const r = analyse(samples, 48000, score, grade);
    const trueBpm = score.tempoBpm * (s.tempo ?? 1);
    const err = r.silent ? null : Math.abs(r.bpmEst - trueBpm) / trueBpm;
    res[name] = r;
    rows.push({ grade, seed, name, n, acc: r.accuracy, R: r.rhythm, S: r.stability, C: r.continuity, P: r.pitch, bpm: r.bpmEst ? Math.round(r.bpmEst * 10) / 10 : '-', true: trueBpm, errPct: err === null ? '-' : (err * 100).toFixed(1),
      miss: r.missed, extra: r.extra, issues: r.barIssues ? Object.entries(r.barIssues).map(([b, k]) => `${b}:${k.join('/')}`).join(' ') : '', trend: r.trend || '' });
    const tag = `${grade}-${seed} ${name}`;
    if (name === 'silent') { if (!r.silent) problems.push(`${tag}: 安靜卻有結果`); continue; }
    if (r.silent || r.tooFew) { problems.push(`${tag}: 沒有結果`); continue; }
    if (['ontime', 'slow30', 'fast20', 'pause', 'miss3', 'wrong', 'room'].includes(name) && err > 0.03) problems.push(`${tag}: 速度誤差 ${(err * 100).toFixed(1)}%`);
    if (['ontime', 'slow30', 'fast20'].includes(name) && r.accuracy < 90) problems.push(`${tag}: 準度 ${r.accuracy}`);
    if (name === 'accel' && !(r.stability < res.ontime.stability - 8 || r.trend === 'faster')) problems.push(`${tag}: 越彈越快沒反映在穩定(${r.stability})`);
    if (name === 'pause' && !(r.continuity < 100 && r.pauses.length)) problems.push(`${tag}: 停頓沒抓到`);
    if (name === 'miss3' && !(r.missed >= 3 && r.rhythm < res.ontime.rhythm)) problems.push(`${tag}: 漏音 ${r.missed}`);
    if (name === 'wrong' && !(r.wrong >= Math.min(2, wrongIdx.length) && r.pitch < 100)) problems.push(`${tag}: 錯音抓到 ${r.wrong}/3`);
    if (name === 'room' && r.accuracy < 85) problems.push(`${tag}: 有殘響、手不那麼準(±20 ms)準度 ${r.accuracy}`);
    if (['ontime', 'room'].includes(name) && grade <= 2 && r.wrong > 0) problems.push(`${tag}: 準時卻判錯音 ${r.wrong}`);
  }
}
await close();
console.table(rows);
const errs = rows.filter((r) => r.errPct !== '-' && ['ontime', 'slow30', 'fast20', 'pause', 'miss3', 'wrong', 'room'].includes(r.name)).map((r) => Number(r.errPct));
console.log(`速度誤差:最大 ${Math.max(...errs).toFixed(1)}%、平均 ${(errs.reduce((a, b) => a + b, 0) / errs.length).toFixed(2)}%`);
if (problems.length) { console.error('\n✗', problems.length, '項問題:\n - ' + problems.join('\n - ')); process.exit(1); }
console.log('\n✓ 麥克風打分(node 側)全部通過');
