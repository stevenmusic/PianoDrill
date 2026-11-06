/* 今日練習「App 聽你彈」(js/sight/micscore.js 的 scoreDaily)的壓力測試(node 側 + Chromium 算音訊;仿 tools/sight/micscore-stress.mjs)。
   每個會聽的關卡(js/tech/patterns.js 的 listenExpected)× 起始 / 目標速度 × 種子 × 情況:用 Salamander 取樣算成「學生彈的琴聲」,
   混進 App 自己放的拍點(Naked Drums xstick:預備拍 2 小節 + 每一拍,手機喇叭離麥克風很近,琴聲小的時候拍點相對大聲)。
   必須過(過關率 ≥ 95%):準時、慢 30%、快 15%、小聲 −20 dB、放遠、手誤差 ±60 ms、踏板殘響、電扇底噪、漏 1 個音;
     八分音符的關加:從起始速度直接彈到目標速度、手誤差 ±40 ms、圓滑奏兩個音黏在一起(重疊 30 ms)、重音(每 4 個音一個 +6 dB)。
   必須不過(誤過 0):靜音、只有電扇、有人講話、敲桌子、整輪錯音(差 1–2 個半音)、整段低一個八度、整段高一個八度、只彈一半、彈別的關;
     而且判出來的原因(decideDaily 的 reason)要對(每種情況的 why;App 的 lisWhy 照這個寫那一句)。
   每種情況跑兩次:有拍點(每一拍)/ 只有預備拍,報表寫出拍點讓過關率差多少。
   報表:每種情況的過關率 + 每關 × 每種情況。最後掃描門檻(decideDaily 的 DAILY;octKeep 在 analyseDaily,不掃):誤過 0 的前提下讓過關率最大,印出掃到的最好的一組跟現在的 DAILY 比。
     node tools/tech/listen-stress.mjs [--seeds 4] [--only ontime,silent] [--no-scan] */
import fs from 'node:fs';
import { open } from '../test/harness.mjs';
import { renderInPage } from '../sight/micaudio.mjs';
import { ROUTES } from '../../js/tech/routes.js';
import { listenExpected } from '../../js/tech/patterns.js';
import { buildExercise } from '../../js/tech/exercise.js';
import { analyseDaily, decideDaily, DAILY } from '../../js/sight/micscore.js';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SEEDS = Number(arg('--seeds', 4));
const ONLY = arg('--only', '');
const SCAN = !args.includes('--no-scan');
const RATE = 48000, LEAD = 0.4, PRE_BARS = 2;
const FG = JSON.parse(fs.readFileSync(new URL('../../data/fingerings.json', import.meta.url), 'utf8'));

/* ── 會聽的關卡(原樣那一題)── */
const LEVELS = [];
for (const R of ROUTES) for (const L of R.levels) { const e = listenExpected(FG, { ...L.q, sub: 2 }); if (e) LEVELS.push(L); }
/* 別的關的右手(彈錯關):照 app 一樣重複到 4 小節 */
function seqOf(id) {
  const L = ROUTES[0].levels.find((l) => l.id === id);
  const ex = buildExercise(FG, { ...L.q, sub: 2 });
  const one = []; let pos = 0;
  for (const n of ex.rh) { if (!n.rest) one.push({ beat: pos / 12, len: n.dur / 12, midi: n.midi }); pos += n.dur; }
  const reps = Math.ceil(4 / ex.bars), out = [];
  for (let k = 0; k < reps; k++) for (const e of one) out.push({ ...e, beat: e.beat + k * ex.bars * 4 });
  return out;
}

/* ── 背景聲(micscore-stress 同一套)── */
function rng(seed) { let z = seed >>> 0; return () => { z = (z * 1664525 + 1013904223) >>> 0; return z / 4294967296 - 0.5; }; }
function addWhite(x, level, seed) { const r = rng(seed); for (let k = 0; k < x.length; k++) x[k] += level * 2 * r(); }
function addFan(x, level, seed) { const r = rng(seed); let b0 = 0, b1 = 0; for (let k = 0; k < x.length; k++) { const w = r(); b0 = 0.995 * b0 + 0.05 * w; b1 = 0.9 * b1 + 0.1 * w; x[k] += level * (3 * b0 + 0.6 * b1 + 0.15 * w); } }
function addTalk(x, level, seed) {
  const r = rng(seed); let ph = 0, f0 = 150, env = 0, target = 0, next = 0;
  for (let k = 0; k < x.length; k++) {
    const t = k / RATE;
    if (t >= next) { target = r() > -0.2 ? 0.5 + r() : 0; next = t + 0.12 + 0.15 * (r() + 0.5); f0 = 120 + 80 * (r() + 0.5); }
    env += (target - env) * 0.0015; ph += (2 * Math.PI * f0) / RATE;
    let v = 0; for (let h = 1; h <= 12; h++) v += Math.sin(h * ph) / h * (h > 2 && h < 7 ? 1.6 : 1);
    x[k] += level * env * (0.25 * v + 0.2 * r());
  }
}
/* 敲桌子:跟著拍子敲(最難分的一種:節奏完全對,只是沒有音高);木頭的短共鳴 + 雜音 */
function addKnocks(x, level, times, seed) {
  const r = rng(seed);
  for (const t of times) {
    const k0 = Math.round(t * RATE), f = 180 + 300 * (r() + 0.5);
    for (let k = 0; k < 4000 && k0 + k < x.length; k++) x[k0 + k] += level * Math.exp(-k / 350) * (1.2 * r() + 0.8 * Math.sin((2 * Math.PI * f * k) / RATE));
  }
}
const mix = (x, y, g = 1) => { for (let k = 0; k < x.length && k < y.length; k++) x[k] += g * y[k]; };

/* ── 拍點(App 放的 xstick;audio.js 的 playClick:重拍 1、其他 0.45)在頁面裡算 ── */
async function renderClicks(page, clicks, seconds) {
  const b64 = await page.evaluate(async ({ clicks, seconds }) => {
    const SR = 48000, ROOT = 'https://raw.githubusercontent.com/stevenmusic/ScrollScore/main/drums/';
    const dec = new OfflineAudioContext(1, 1, SR);
    const bufs = window.__xs || (window.__xs = await Promise.all(['nk-xstick-L1.01.flac', 'nk-xstick-L1.02.flac', 'nk-xstick-L1.03.flac'].map(async (f) => dec.decodeAudioData(await (await fetch(ROOT + f)).arrayBuffer()))));
    const ctx = new OfflineAudioContext(1, Math.ceil(seconds * SR), SR);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 90; hp.connect(ctx.destination);
    clicks.forEach((c, k) => { const s = ctx.createBufferSource(); s.buffer = bufs[k % bufs.length]; const g = ctx.createGain(); g.gain.value = c.strong ? 1 : 0.45; s.connect(g).connect(hp); s.start(c.t); });
    const out = (await ctx.startRendering()).getChannelData(0);
    const u = new Uint8Array(out.buffer); let bin = ''; for (let k = 0; k < u.length; k += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(k, k + 0x8000));
    return btoa(bin);
  }, { clicks, seconds });
  return new Float32Array(Uint8Array.from(Buffer.from(b64, 'base64')).buffer);
}

/* ── 情況 ── pass = 必須過;fail = 必須不過 */
const NOPIANO = ['silent', 'notPiano', 'missed'];   // 沒彈琴:「沒聽到琴聲」/「聽不出譜上的音」(電扇、講話偶爾有幾個音頭對得上 = 漏掉了)
const WRONG = ['wrongPitch', 'notPiano', 'missed'];   // 彈錯音:音不對(對不上的時候也可能是聽不出 / 漏掉)
const HAND = { jitter: 0.015, vel: [55, 85] };
const SC = {
  ontime: { pass: true, ...HAND },
  slow30: { pass: true, ...HAND, tempo: 0.7 },
  fast15: { pass: true, ...HAND, tempo: 1.15 },
  soft20: { pass: true, ...HAND, gain: 0.1 },            // 小聲 −20 dB(拍點不變:喇叭在手機上)
  far: { pass: true, ...HAND, room: 0.9, gain: 0.15, noise: 0.0015 },   // 手機放遠:殘響多、琴聲小
  jitter60: { pass: true, ...HAND, jitter: 0.06 },
  pedal: { pass: true, ...HAND, pedal: true, room: 0.5 },
  fan: { pass: true, ...HAND, fan: 0.004 },
  miss1: { pass: true, ...HAND, drop: 1 },
  toTarget: { pass: true, ...HAND, toTarget: true },      // 拍點是起始速度,學生直接彈到目標速度(不要求照拍點;目標速度那一輪 = 準時)
  jitter40: { pass: true, ...HAND, jitter: 0.04 },
  legato30: { pass: true, ...HAND, legato: 0.03 },        // 圓滑奏:前一個音放開前下一個音已經按下去(重疊 30 ms)
  accent6: { pass: true, ...HAND, accent: 2 },           // 重音:每 4 個音的第一個大 6 dB(振幅 × 2)
  // why = 判出來的原因可以是哪幾種(decideDaily 的 reason)
  silent: { pass: false, none: true, why: NOPIANO },
  fanOnly: { pass: false, none: true, fan: 0.004, why: NOPIANO },
  talk: { pass: false, none: true, talk: 0.01, why: NOPIANO },
  loudTalk: { pass: false, none: true, talk: 0.05, why: NOPIANO },
  knock: { pass: false, none: true, knock: 0.05, why: NOPIANO },
  loudKnock: { pass: false, none: true, knock: 0.3, why: NOPIANO },
  wrongUp1: { pass: false, ...HAND, shift: 1, why: WRONG }, wrongDn1: { pass: false, ...HAND, shift: -1, why: WRONG },
  wrongUp2: { pass: false, ...HAND, shift: 2, why: WRONG }, wrongDn2: { pass: false, ...HAND, shift: -2, why: WRONG },
  half: { pass: false, ...HAND, half: true, why: ['missed'] },
  otherP01: { pass: false, ...HAND, other: 'P01', why: WRONG },   // 彈成「手指號碼」(同樣的節奏,音的順序不一樣)
  otherPD1: { pass: false, ...HAND, other: 'PD1', alt: 'PD3', why: WRONG },   // 彈成「右手 3、4 交替」(八分音符;本身就是 PD1 的關改彈 PD3)
  octaveDn: { pass: false, ...HAND, shift: -12, why: ['octaveLow'] },    // 整段低一個八度(五指位置一樣、手放錯八度:音名對、位置錯)
  octaveUp: { pass: false, ...HAND, shift: 12, why: ['octaveHigh'] },    // 整段高一個八度
  // 參考(不算進門檻與過關條件):拍點再大聲 10 dB
  clickLoud: { pass: true, info: true, ...HAND, click: 3 },
};
const MODES = { click: '有拍點', countIn: '只有預備拍' };

function perform(seq, s, spbClick, seed) {
  const r = rng(seed * 31 + 7), spb = spbClick / (s.tempo ?? 1), t0 = LEAD + PRE_BARS * 4 * spbClick;
  let list = seq.map((e, i) => ({ ...e, i }));
  if (s.half) list = list.slice(0, list.length / 2);
  if (s.drop) { const k = 3 + (seed % (list.length - 6)); list = list.filter((e) => e.i !== k); }
  const [vLo, vHi] = s.vel || [60, 80];
  const notes = list.map((e) => {
    const time = t0 + e.beat * spb + 2 * r() * (s.jitter ?? 0.015);
    const len = e.len * spb;
    let vel = Math.round(vLo + (r() + 0.5) * (vHi - vLo));
    if (s.accent && e.i % 4 === 0) vel = Math.min(127, Math.round(vel * Math.sqrt(s.accent)));   // 振幅 ∝ 力度²(micaudio)
    return { midi: e.midi + (s.shift || 0), time: Math.max(0.05, time), dur: s.pedal ? len + 3 * spb : s.legato ? len + s.legato : Math.max(0.1, len * 0.92), vel };
  });
  return { notes, t0, end: t0 + 16 * spb };
}

const { page, close } = await open({ viewport: { width: 800, height: 600 } });
const cases = [];
const t1 = Date.now();
for (const L of LEVELS) for (const bpm of [L.start, L.target]) for (let seed = 1; seed <= SEEDS; seed++) {
  const exp = listenExpected(FG, { ...L.q, sub: 2 }, { bpm });
  const seq = exp.events.map((e, k) => ({ beat: e.beat, len: (k + 1 < exp.events.length ? exp.events[k + 1].beat : exp.bars * exp.barBeats) - e.beat, midi: e.midi }));
  const spbClick = 60 / bpm, t0 = LEAD + PRE_BARS * 4 * spbClick;
  for (const [name, s0] of Object.entries(SC)) {
    if (ONLY && !ONLY.split(',').includes(name)) continue;
    const s = s0.toTarget ? { ...s0, tempo: L.target / bpm } : s0;
    const src = s.other ? seqOf(s.other === L.id ? s.alt : s.other) : seq;
    const p = s.none ? { notes: [], t0, end: t0 + 16 * spbClick } : perform(src, s, spbClick, seed + bpm);
    const seconds = Math.max(p.end, t0 + 16 * spbClick) + 2;
    const piano = await renderInPage(page, p.notes, seconds, { room: s.room || 0, noise: 0 });
    if (s.gain) for (let k = 0; k < piano.length; k++) piano[k] *= s.gain;
    const bg = new Float32Array(piano.length);
    addWhite(bg, s.noise ?? 0.0006, seed * 13);
    if (s.fan) addFan(bg, s.fan, seed * 7);
    if (s.talk) addTalk(bg, s.talk, seed * 11);
    if (s.knock) addKnocks(bg, s.knock, seq.map((e) => t0 + e.beat * spbClick + 0.03 * rng(seed + e.beat)()), seed * 17);
    for (const mode of Object.keys(MODES)) {
      // 拍點:預備拍 2 小節(一律響)+ 有拍點時每一拍(學生彈得慢,拍點照樣照速度走到 4 小節)
      const clicks = [];
      const nBeats = PRE_BARS * 4 + (mode === 'click' ? 16 : 0);
      for (let b = 0; b < nBeats; b++) clicks.push({ t: LEAD + b * spbClick, strong: b % 4 === 0 });
      const ck = await renderClicks(page, clicks, seconds);
      const x = Float32Array.from(piano);
      mix(x, bg); mix(x, ck, 0.12 * (s.click || 1));   // 拍點大小:約等於中等力度琴聲的峰值(手機喇叭在麥克風旁邊)
      const a = analyseDaily(x, RATE, exp, { clicks: clicks.map((c) => c.t), t0 });
      cases.push({ level: L.id, bpm, seed, name, mode, pass: s.pass, info: !!s.info, a });
    }
  }
}
await close();
const secs = ((Date.now() - t1) / 1000).toFixed(0);
if (arg('--dump', '')) fs.writeFileSync(arg('--dump', ''), JSON.stringify(cases));   // 除錯:每段錄音的分析

/* ── 報表 ── */
function rates(lim) {
  const out = {};
  for (const c of cases) {
    const d = decideDaily(c.a, lim);
    const k = c.name;
    const b = (out[k] ||= { pass: c.pass, info: c.info, n: {}, ok: {}, reasons: {}, why: {}, badWhy: {} });
    const su = d.sure / d.total;
    b.sure = b.sure ? [Math.min(b.sure[0], su), Math.max(b.sure[1], su)] : [su, su];
    b.n[c.mode] = (b.n[c.mode] || 0) + 1;
    b.ok[c.mode] = (b.ok[c.mode] || 0) + (d.ok ? 1 : 0);
    if (c.mode === 'click' && d.ok !== c.pass) b.reasons[d.reason] = (b.reasons[d.reason] || 0) + 1;
    if (!c.pass && !d.ok) { b.why[d.reason] = (b.why[d.reason] || 0) + 1; if (!SC[k].why.includes(d.reason)) b.badWhy[c.mode] = (b.badWhy[c.mode] || 0) + 1; }
  }
  return out;
}
function summary(lim) {
  const R = rates(lim);
  let falsePass = 0, minPass = 1, sumPass = 0, np = 0;
  for (const b of Object.values(R)) for (const m of Object.keys(MODES)) {
    if (!b.n[m] || b.info) continue;
    const r = b.ok[m] / b.n[m];
    if (b.pass) { minPass = Math.min(minPass, r); sumPass += r; np++; } else falsePass += b.ok[m];
  }
  return { R, falsePass, minPass, meanPass: np ? sumPass / np : 0 };
}
const pct = (a, b) => (b ? ((100 * a) / b).toFixed(0) + '%' : '-');
function table(lim, title) {
  const { R, falsePass, minPass, meanPass } = summary(lim);
  console.log(`\n${title}(誤過 ${falsePass}、必須過的最低過關率 ${(minPass * 100).toFixed(0)}%、平均 ${(meanPass * 100).toFixed(1)}%)`);
  console.table(Object.fromEntries(Object.entries(R).map(([k, b]) => [k, {
    要: (b.pass ? '過' : '不過') + (b.info ? '(參考)' : ''), 有拍點: pct(b.ok.click, b.n.click), 只有預備拍: pct(b.ok.countIn, b.n.countIn),
    拍點的影響: b.n.click && b.n.countIn ? `${(((b.ok.click / b.n.click) - (b.ok.countIn / b.n.countIn)) * 100).toFixed(0)} 點` : '-',
    有拍點判錯的原因: Object.entries(b.reasons).map(([r, n]) => `${r} ${n}`).join(' '),
    不過的原因: Object.entries(b.why).map(([r, n]) => `${r} ${n}`).join(' '),
    譜上的音聽到: b.sure ? `${b.sure[0].toFixed(2)}–${b.sure[1].toFixed(2)}` : '-',
  }])));
  return { falsePass, minPass, meanPass };
}
/* 每關 × 每種情況:過關率(有拍點 / 只有預備拍) */
function byLevel(lim, title) {
  const T = {};
  for (const c of cases) {
    const d = decideDaily(c.a, lim);
    const row = (T[c.name] ||= {}), b = (row[c.level] ||= { click: [0, 0], countIn: [0, 0] });
    b[c.mode][0] += d.ok ? 1 : 0; b[c.mode][1]++;
  }
  console.log(`\n${title}:每關 × 每種情況的過關率(有拍點 / 只有預備拍)`);
  console.table(Object.fromEntries(Object.entries(T).map(([k, row]) => [(SC[k].pass ? '過 ' : '不過 ') + k + (SC[k].info ? '(參考)' : ''),
    Object.fromEntries(LEVELS.map((L) => [L.id, row[L.id] ? `${pct(...row[L.id].click)} / ${pct(...row[L.id].countIn)}` : '-']))])));
}
console.log(`會聽的關卡:${LEVELS.map((l) => l.id).join('、')};${cases.length} 段錄音(${secs} 秒)`);
const cur = table({}, '現在的門檻 DAILY');
byLevel({}, '現在的門檻 DAILY');

if (SCAN) {
  const grid = { ratio: [0.7, 0.85, 1, 1.2, 1.5], wrongRatio: [0.2, 0.35, 0.5, 0.7], clear: [1.5, 2, 3], pitch: [0.7, 0.8, 0.85, 0.9], okMin: [0.3, 0.4, 0.5, 0.6, 0.7], miss: [1, 2], extra: [1, 2, 3], octLow: [0.2, 0.3, 0.4] };
  const keys = Object.keys(grid);
  let best = null, tried = 0;
  const rec = (k, lim) => {
    if (k === keys.length) {
      tried++;
      const s = summary(lim);
      if (s.falsePass) return;
      // 一樣好的時候挑跟現在的 DAILY 最接近的(改最少)
      const diff = keys.filter((x) => lim[x] !== DAILY[x]).length;
      const score = s.minPass * 1000 + s.meanPass - diff * 1e-4;
      if (!best || score > best.score + 1e-9) best = { score, lim: { ...lim }, diff, ...s };
      return;
    }
    for (const v of grid[keys[k]]) rec(k + 1, { ...lim, [keys[k]]: v });
  };
  rec(0, {});
  if (best) {
    console.log(`\n掃描 ${tried} 組門檻:誤過 0 裡最好的一組 ${JSON.stringify(best.lim)}(跟現在的 DAILY 差 ${best.diff} 項;一樣好的挑改最少的)`);
    table(best.lim, '掃到最好的門檻');
  } else console.log(`\n掃描 ${tried} 組門檻:沒有誤過 0 的組合`);
}
const problems = [];
const { R } = summary({});
for (const [k, b] of Object.entries(R)) for (const m of Object.keys(MODES)) {
  if (!b.n[m] || b.info) continue;
  const r = b.ok[m] / b.n[m];
  if (b.pass && r < 0.95) problems.push(`${k}(${MODES[m]}):過關率 ${(r * 100).toFixed(0)}% < 95%`);
  if (!b.pass && b.ok[m]) problems.push(`${k}(${MODES[m]}):誤過 ${b.ok[m]} / ${b.n[m]}`);
  if (!b.pass && b.badWhy[m]) problems.push(`${k}(${MODES[m]}):原因不對 ${b.badWhy[m]} / ${b.n[m]}(要 ${SC[k].why.join(' / ')})`);
}
if (problems.length) { console.error('\n✗', problems.length, '項問題:\n - ' + problems.join('\n - ')); process.exit(1); }
console.log('\n✓ App 聽你彈:必須過的 ≥ 95%、必須不過的誤過 0、原因都對');
