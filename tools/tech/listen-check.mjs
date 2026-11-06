/* 今日練習「App 聽你彈」整個 App 照真的流程跑(仿 tools/sight/mic-check.js):
   Chromium 假麥克風(--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>%noloop),
   WAV = 用 Salamander 取樣照這一關(PA1)預期的音算出來的「學生彈奏」(tools/sight/micaudio.mjs 的 renderInPage),按 ▶ 之前才寫好(Chromium 在 getUserMedia 時才讀)。
   情況:彈對 → 自動算「做到了」(很好!);沒彈 → 不算、狀態寫原因、「還要練」能按、第二次沒彈 →「做到了」能自己按(逃生口);
   拒絕權限 → 照原本的自評流程(示範 + 做到了),狀態寫原因;開關關掉 → 底部按鈕回到「跟著彈一輪」;慢 15% 彈對 → 等到最後一個音之後 1.5 秒才停、照樣自動做到了。
   注意(2026-11 查過):headless Chromium 的假麥克風跟輸出的時脈不同步,錄到的聲音每隔約 0.3–0.5 秒掉 128 個樣本(一個 render quantum;錄音跟 WAV 逐段對齊量得到,
   16 秒掉 7–28 格,每次不一樣;開頭對得準,不是 AudioContext 起始時間或鋼琴聲音沒載入的問題,清掉 samplecache 也一樣)。掉的地方相位跳一下,頻譜通量會多找到音頭,
   掉得多時 scoreDaily 對不齊(約 1 / 10 次判成漏彈 / 多彈)。所以「彈對」那一輪判成沒過時先量掉了幾格(錄音跟 WAV 逐段對齊):掉得多(> 8 格)換新的瀏覽器重彈(最多 3 次,印 ⚠),掉得少還沒過 = 真的失敗。真的麥克風不會這樣掉,要在實機確認。
     node tools/tech/listen-check.mjs        ONLY=ontime,slow,silent,denied 只跑幾種 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { open } from '../test/harness.mjs';
import { renderInPage } from '../sight/micaudio.mjs';
import { ROUTES } from '../../js/tech/routes.js';
import { listenExpected } from '../../js/tech/patterns.js';

const ONLY = (process.env.ONLY || '').split(',').filter(Boolean), want = (k) => !ONLY.length || ONLY.includes(k);
const FG = JSON.parse(fs.readFileSync(new URL('../../data/fingerings.json', import.meta.url), 'utf8'));
const problems = [];
const ok = (c, m) => { if (!c) problems.push(m); console.log(c ? '  ✓' : '  ✗', m); };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pianodrill-listen-'));
const IPHONE = { viewport: { width: 390, height: 844 }, mobile: true };
const PA1 = ROUTES.find((r) => r.id === 'finger').levels.find((l) => l.id === 'PA1');
const day = (n) => { const d = new Date(Date.now() - n * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// 第 0 組過了、目前在 PA1(今天的菜單:暖身 → PA1)
const DAILY = { prog: { finger: { at: 'PA1' } }, lv: { 'finger/P01': { passed: day(3) }, 'finger/P02': { passed: day(3) } }, last: day(1), seen: true, tip: true };

const MAIN = '#t-dailyStep .daily-cta .daily-main', AGAIN = '#t-dailyStep .daily-cta .daily-again';
const st = (page) => page.evaluate(([m, a]) => {
  const main = document.querySelector(m), again = document.querySelector(a), t = window.__tech;
  return { mode: main && main.dataset.mode, label: main ? main.textContent.trim() : '', againOn: !!again && !again.disabled && again.style.visibility !== 'hidden',
    status: (document.querySelector('#t-dailyStep .daily-status') || {}).textContent || '', lv: t.dseg && t.dseg.lv, k: t.dseg && t.dseg.k,
    cap: document.getElementById('t-playBtn').dataset.cap, mic: (document.getElementById('t-micBtn') || {}).textContent || null, last: t.lastListen || null,
    tries: t.daily.data.lv['finger/PA1'] ? t.daily.data.lv['finger/PA1'].tries : 0 };
}, [MAIN, AGAIN]);

async function session(name, { denied = false } = {}) {
  const wav = path.join(TMP, `${name}.wav`);
  fs.writeFileSync(wav, Buffer.alloc(0));
  const h = await open({ ...IPHONE, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}%noloop`] });
  const { page } = h;
  await page.evaluate((d) => { localStorage.clear(); localStorage.setItem('pianodrill.v1', JSON.stringify({ onboarded: true, view: 'tech' })); localStorage.setItem('pianodrill-lang', 'zh'); localStorage.setItem('pianodrill.tech.v1', JSON.stringify({ daily: d })); }, DAILY);
  await page.reload();
  await page.waitForFunction(() => window.__stageReady >= 1 && window.__tech, null, { timeout: 30000 });
  await page.evaluate(() => { window.__keepTake = true; });
  if (denied) await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); }; });
  await page.click('#t-dailyCard .daily-btn');
  for (let k = 0; k < 4 && (await st(page)).k === 'warm'; k++) { await page.evaluate(() => window.__tech.dNext()); await page.waitForTimeout(300); }
  await page.waitForTimeout(600);
  return { ...h, wav };
}
/* 寫 WAV:notes = null → 安靜;否則照 PA1 預期的音、從錄音開始後 lead 秒彈 */
async function writeWav(page, wav, { play = true, bpm, tempo = 1 }) {
  const exp = listenExpected(FG, { ...PA1.q, sub: 2 }, { bpm });
  const spb = 60 / bpm, lead = 0.25 + 8 * spb;   // 打開麥克風 → 0.15 秒後預備拍 2 小節(4/4 = 8 拍)
  const sp = spb / tempo;   // 學生彈的速度(tempo 0.85 = 慢 15%;拍點照原本的速度)
  const notes = play ? exp.events.map((e, i) => ({ midi: e.midi, time: lead + e.beat * sp + (i % 3 - 1) * 0.012, dur: Math.max(0.12, 0.9 * sp), vel: 62 + (i % 4) * 5 })) : [];
  const seconds = lead + exp.bars * exp.barBeats * sp + 2;
  fs.writeFileSync(wav, await renderInPage(page, notes, seconds, { format: 'wav' }));
  return { lead, last: lead + exp.events[exp.events.length - 1].beat * sp };
}
/* 按底部主要按鈕,等這一輪聽完(lastListen 換了)或 timeout */
async function round(page, ms = 40000) {
  await page.evaluate(() => { window.__tech.lastListen = null; });
  await page.waitForTimeout(800);   // 剛換字 0.7 秒內按不算
  await page.click(MAIN);
  await page.waitForFunction(() => window.__tech.lastListen, null, { timeout: ms });
  await page.waitForTimeout(400);
  return st(page);
}

/* 錄到的聲音比 WAV 掉了幾格 128 個樣本(逐段對齊:每 0.25 秒找一次位移;假麥克風的時脈問題,見檔頭) */
async function drops(page, wav) {
  const got = await page.evaluate(() => { const t = window.__keepTake; if (!t || !t.samples) return null; const u = new Uint8Array(t.samples.buffer); let b = ''; for (let k = 0; k < u.length; k += 0x8000) b += String.fromCharCode.apply(null, u.subarray(k, k + 0x8000)); return { b64: btoa(b), rate: t.sampleRate }; });
  if (!got) return null;
  const y = new Float32Array(Uint8Array.from(Buffer.from(got.b64, 'base64')).buffer), R = got.rate;
  const b = fs.readFileSync(wav); let off = 12; while (b.toString('ascii', off, off + 4) !== 'data') off += 8 + b.readUInt32LE(off + 4);
  const n = b.readUInt32LE(off + 4) / 2, W = b.readUInt32LE(24), x = new Float32Array(Math.floor((n * R) / W));
  for (let k = 0; k < x.length; k++) { const p = (k * W) / R, i = Math.floor(p), f = p - i; x[k] = (b.readInt16LE(off + 8 + 2 * i) * (1 - f) + (i + 1 < n ? b.readInt16LE(off + 10 + 2 * i) : 0) * f) / 32768; }
  const best = (t, lo, hi) => { const a = Math.round(t * R), len = 1024; let bl = 0, bv = -2; for (let L = lo; L <= hi; L++) { let s = 0, e1 = 0, e2 = 0; for (let q = 0; q < len; q++) { const u = y[a + q] || 0, v = x[a + q - L] || 0; s += u * v; e1 += u * u; e2 += v * v; } const c = s / Math.sqrt(e1 * e2 + 1e-12); if (c > bv) { bv = c; bl = L; } } return [bl, bv]; };
  let e2 = 0, t1 = 0; for (let k = 0; k < y.length; k++) if (Math.abs(y[k]) > 0.01) { t1 = k / R; break; }
  let [prev] = best(t1 + 0.05, Math.round(-1.5 * R), Math.round(1.5 * R)), moved = 0;
  for (let t = t1 + 0.3; t < y.length / R - 1.5; t += 0.25) { const [L, c] = best(t, prev - 400, prev + 400); if (c > 0.9) { moved += Math.abs(L - prev); prev = L; } }
  return Math.round(moved / 128);
}
/* 彈對的那一輪判成沒過:先量假麥克風掉了幾格。掉得多(> 8 格)= 測試環境的問題,換一個新的瀏覽器重彈(最多 3 次;同一個瀏覽器第 2 次沒過會開逃生口);
   掉得少還判成沒過 = 真的有問題,不重彈 */
async function retryOnce(h, s1, name, tempo = 1) {
  for (let k = 1; k <= 3 && !(s1.last && s1.last.ok); k++) {
    const d = await drops(h.page, h.wav);
    console.log(`  ⚠ ${name}:這一輪判成「${s1.last && s1.last.reason}」(對到 ${s1.last && s1.last.matched} / ${s1.last && s1.last.total});假麥克風掉了 ${d} 格 128 個樣本`);
    if (d == null || d <= 8 || k === 3) break;
    await h.close();
    h = await session(name + '-' + (k + 1));
    const bpm = await h.page.evaluate(() => window.__tech.state.bpm);
    await writeWav(h.page, h.wav, { bpm, tempo });
    s1 = await round(h.page);
    console.log('   ', JSON.stringify(s1.last), '|', s1.status);
  }
  return { h, s1 };
}
/* 1. 彈對 → 自動做到了 */
if (want('ontime')) {
  console.log('彈對');
  let h = await session('ontime');
  const s0 = await st(h.page);
  ok(s0.lv === 'PA1' && s0.mode === 'play', `在 PA1、底部按鈕是 ▶(${s0.lv} ${s0.mode})`);
  ok(/你彈一輪/.test(s0.label), `底部按鈕寫「你彈一輪」(${s0.label})`);
  ok(/聽你彈/.test(s0.cap), `▶ 小字寫「拍點 + 聽你彈」(${s0.cap})`);
  ok(/麥克風聽你彈[:：]開/.test(s0.mic || ''), `面板有麥克風開關(${s0.mic})`);
  ok(!s0.againOn, '還沒彈:「還要練」不能按');
  const bpm = await h.page.evaluate(() => window.__tech.state.bpm);
  await writeWav(h.page, h.wav, { bpm });
  await h.page.evaluate(() => { window.__tech.lastListen = null; });
  await h.page.waitForTimeout(800);
  await h.page.click(MAIN);
  await h.page.waitForFunction(() => /在聽/.test((document.querySelector('#t-dailyStep .daily-status') || {}).textContent || ''), null, { timeout: 20000 }).catch(() => {});
  const mid = await st(h.page);
  ok(/在聽/.test(mid.status) && mid.mode === 'stop', `聽的時候:狀態「在聽……」、底部「停止」(${mid.status} / ${mid.mode})`);
  const sch = await h.page.evaluate(() => window.__tech.state.scheduled);
  await h.page.waitForFunction(() => window.__tech.lastListen, null, { timeout: 40000 });
  await h.page.waitForTimeout(400);
  let s1 = await st(h.page);
  ({ h, s1 } = await retryOnce(h, s1, 'ontime'));
  console.log('   ', JSON.stringify(s1.last), '|', s1.status);
  ok(s1.last && s1.last.ok, `彈對判成過(${s1.last && s1.last.reason})`);
  ok(/很好/.test(s1.status) && s1.tries === 1, `自動算「做到了」:狀態「很好!…」、嘗試 1 次(${s1.status};${s1.tries})`);
  ok(sch > 0, '聽的時候有排拍點');
  ok(!h.errors.length, `沒有頁面錯誤 ${h.errors.join(' | ')}`);
  await h.close();
}

/* 1b. 慢 15% 彈對(拍點照原本的速度):4 小節之後等到最後一個音之後 1.5 秒才停(最多多等 1 小節)→ 照樣自動做到了 */
if (want('slow')) {
  console.log('慢 15%');
  let h = await session('slow');
  const bpm = await h.page.evaluate(() => window.__tech.state.bpm);
  const w = await writeWav(h.page, h.wav, { bpm, tempo: 0.85 });
  let s1;
  ({ h, s1 } = await retryOnce(h, await round(h.page), 'slow', 0.85));
  console.log('   ', JSON.stringify(s1.last), '|', s1.status);
  ok(s1.last && s1.last.ok && s1.tries === 1 && /很好/.test(s1.status), `慢 15% 彈對:自動算「做到了」(${s1.last && s1.last.reason};${s1.status})`);
  const spb = 60 / bpm, max = 0.15 + 8 * spb + 20 * spb + 0.5;   // 預備拍 2 小節 + 4 小節 + 多等 1 小節(+ 開麥克風的時間)
  ok(s1.last && s1.last.sec >= w.last + 1.2 && s1.last.sec <= max + 0.6, `錄到最後一個音之後 1.5 秒、不超過多等的 1 小節(錄了 ${s1.last && s1.last.sec} 秒;最後一個音 ${w.last.toFixed(1)} 秒、上限 ${max.toFixed(1)} 秒)`);
  ok(!h.errors.length, `沒有頁面錯誤 ${h.errors.join(' | ')}`);
  await h.close();
}

/* 2. 沒彈 → 不算、說原因、「還要練」能按;第二次 → 「做到了」也能按 */
if (want('silent')) {
  console.log('沒彈');
  const h = await session('silent');
  const bpm = await h.page.evaluate(() => window.__tech.state.bpm);
  await writeWav(h.page, h.wav, { play: false, bpm });
  const s1 = await round(h.page);
  console.log('   ', JSON.stringify(s1.last), '|', s1.status);
  ok(s1.last && !s1.last.ok && s1.tries === 0, `沒彈不算(${s1.last && s1.last.reason};嘗試 ${s1.tries})`);
  ok(/沒聽到琴聲|聽不出/.test(s1.status) && /按 ▶ 再彈一輪/.test(s1.status), `狀態寫原因 + 下一步(${s1.status})`);
  ok(s1.mode === 'play' && s1.againOn, `底部 ▶ 你彈一輪、「還要練」能按(${s1.mode} ${s1.againOn})`);
  const s2 = await round(h.page);
  console.log('   ', JSON.stringify(s2.last), '|', s2.status);
  ok(s2.mode === 'ok' && /做到了/.test(s2.label) && s2.againOn, `連續 2 次聽不過:「做到了」能自己按(${s2.mode} ${s2.label})`);
  ok(/自己按「做到了」/.test(s2.status), `狀態說可以自己按(${s2.status})`);
  await h.page.waitForTimeout(800);
  await h.page.click(MAIN);
  await h.page.waitForTimeout(400);
  const s3 = await st(h.page);
  ok(s3.tries === 1 && /很好/.test(s3.status), `自己按「做到了」算一次(${s3.tries};${s3.status})`);
  // 開關關掉 → 照原本的流程
  await h.page.click('#t-micBtn');
  await h.page.waitForTimeout(300);
  const s4 = await st(h.page);
  ok(/關/.test(s4.mic || '') && /跟著彈一輪/.test(s4.label) && /示範/.test(s4.cap), `關掉麥克風:底部「跟著彈一輪」、▶「示範 + 拍點」(${s4.mic} ${s4.label} ${s4.cap})`);
  const saved = await h.page.evaluate(() => JSON.parse(localStorage.getItem('pianodrill.tech.v1')).listen);
  ok(saved === false, '關掉存在 pianodrill.tech.v1 的 listen');
  ok(!h.errors.length, `沒有頁面錯誤 ${h.errors.join(' | ')}`);
  await h.close();
}

/* 3. 拒絕權限 → 自評流程 */
if (want('denied')) {
  console.log('拒絕權限');
  const h = await session('denied', { denied: true });
  await h.page.waitForTimeout(800);
  await h.page.click(MAIN);
  await h.page.waitForFunction(() => /沒有取得麥克風/.test((document.querySelector('#t-dailyStep .daily-status') || {}).textContent || ''), null, { timeout: 20000 }).catch(() => {});
  const s1 = await st(h.page);
  console.log('   ', s1.status, '|', s1.mode, s1.cap);
  ok(/沒有取得麥克風/.test(s1.status), `狀態寫原因(${s1.status})`);
  ok(s1.mode === 'stop' && /示範/.test(s1.cap), `照原本的方式播示範(${s1.mode} ${s1.cap})`);
  await h.page.waitForFunction(() => window.__tech.dcard.isReady, null, { timeout: 30000 }).catch(() => {});
  const s2 = await st(h.page);
  ok(s2.mode === 'ok' && /做到了/.test(s2.label), `播過一輪後「做到了」能按(${s2.mode} ${s2.label})`);
  ok(!h.errors.length, `沒有頁面錯誤 ${h.errors.join(' | ')}`);
  await h.close();
}

if (problems.length) { console.error('\n✗', problems.length, '項問題:\n - ' + problems.join('\n - ')); process.exit(1); }
console.log('\n✓ App 聽你彈(瀏覽器)全部通過');
