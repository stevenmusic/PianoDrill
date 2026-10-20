/**
 * 麥克風自動打分:整個 App 照真的流程跑(開關、權限、聽、彈完停 2 秒自動結束、分析、結果、譜上標色)。
 * Chromium 假麥克風(--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>%noloop):
 * WAV = 用 Salamander 取樣照這一題算出來的「學生彈奏」(tools/sight/micaudio.mjs),在按「彈一遍」之前才寫好(Chromium 在 getUserMedia 時才讀)。
 *
 *   node tools/sight/mic-check.js            視奏分頁(右手、雙手)+ 檢定頁(ABRSM 1、3 級)
 *   SHOTS=<資料夾> node tools/sight/mic-check.js   另外存 iphone-390 中文截圖(開關、彈奏中、結果)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { open } from '../test/harness.mjs';
import { performance as perform, renderInPage } from './micaudio.mjs';

const problems = [];
const ok = (c, m) => { if (!c) problems.push(m); };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pianodrill-mic-'));
const SHOTS = process.env.SHOTS || '';
const IPHONE = { viewport: { width: 390, height: 844 }, mobile: true };

/** 一次:where = { view: 'free', sub } | { view: 'exam', grade };scenario = micaudio 的 performance 參數 + silent / denied */
async function take(name, where, scenario = {}, { shots = false } = {}) {
  const wav = path.join(TMP, `${name}.wav`);
  fs.writeFileSync(wav, Buffer.alloc(0));
  const { page, errors, close } = await open({ ...IPHONE, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}%noloop`] });
  try {
    await page.evaluate((v) => { localStorage.setItem('pianodrill.v1', JSON.stringify({ onboarded: true, view: v })); localStorage.setItem('pianodrill-lang', 'zh'); }, where.view === 'exam' ? 'exam' : 'sight');
    await page.reload();
    await page.waitForFunction(() => window.__stageReady);
    if (scenario.denied) await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); }; });
    if (where.view === 'exam') {
      await page.evaluate((g) => { window.__shell.setExam('abrsm', g); window.__shell.showView('exam', 'sight'); }, where.grade);
      await page.waitForFunction(() => !document.getElementById('s-generate').disabled);
      await page.click('#s-generate');   // 練習一題
    } else {
      await page.evaluate((sub) => window.__shell.showView('sight', sub), where.sub);
    }
    await page.waitForFunction(() => window.__sight.score() && !document.getElementById('s-score').hasAttribute('aria-busy') && document.querySelector('#s-score svg'));
    await page.waitForTimeout(400);
    ok(await page.evaluate(() => !document.getElementById('s-along').hidden && document.getElementById('s-alongMic').checked), `${name}: 麥克風開關沒有出現或預設沒開`);
    if (where.view === 'exam') {
      await page.click('#s-playAlongTop');   // 看譜 30 秒
      await page.waitForFunction(() => /^\d+ 秒$/.test(document.getElementById('s-playAlongTop').textContent.trim()), null, { timeout: 15000 });
      await page.evaluate(() => window.__sight.skipPrep());
      await page.waitForFunction(() => /彈一遍/.test(document.getElementById('s-playAlongTop').textContent), null, { timeout: 5000 });
    }
    if (shots) { await page.evaluate(() => document.getElementById('s-along').scrollIntoView({ block: 'end' })); await page.evaluate(() => scrollBy(0, 90)); await page.waitForTimeout(400); await page.screenshot({ path: path.join(SHOTS, '1-開關.png') }); await page.evaluate(() => scrollTo(0, 0)); }
    const score = await page.evaluate(() => window.__sight.score());
    let seconds = 4;
    if (!scenario.silent && !scenario.denied) {
      const { notes } = perform(score, { lead: 0.8, ...scenario });
      seconds = notes.reduce((a, x) => Math.max(a, x.time + x.dur), 0) + 0.6;
      fs.writeFileSync(wav, await renderInPage(page, notes, seconds, { format: 'wav', room: scenario.room || 0 }));
    } else {
      fs.writeFileSync(wav, await renderInPage(page, [], seconds, { format: 'wav' }));
    }
    await page.click('#s-playAlongTop');   // 彈一遍
    if (scenario.denied) {
      await page.waitForFunction(() => /沒有取得麥克風/.test(document.getElementById('s-alongResult').textContent), null, { timeout: 15000 });
      const out = await page.evaluate(() => ({ msg: document.getElementById('s-alongResult').innerText, label: document.getElementById('s-playAlongTop').textContent }));
      await page.click('#s-playAlongTop');   // 照原本的方式(預備拍 + 播放軸):停止
      await close();
      return out;
    }
    await page.waitForFunction(() => document.getElementById('s-playAlongTop').textContent.includes('停止'), null, { timeout: 15000 });
    const listening = await page.evaluate(() => document.getElementById('s-message').textContent);
    if (shots) { await page.waitForTimeout(Math.min(2500, seconds * 500)); await page.screenshot({ path: path.join(SHOTS, '2-彈奏中.png') }); }
    // 自動結束:最後一個音之後 2 秒(或一直沒聲音 20 秒)
    await page.waitForFunction(() => !document.getElementById('s-alongResult').hidden, null, { timeout: (seconds + 30) * 1000 });
    const out = await page.evaluate(() => ({
      r: window.__sight.mic(),
      text: document.getElementById('s-alongResult').innerText.replace(/\s+/g, ' '),
      marks: document.querySelectorAll('#s-stage .mic-mark').length,
      label: document.getElementById('s-playAlongTop').textContent,
      selfCheck: !document.getElementById('s-selfCheck').hidden,
    }));
    out.listening = listening;
    if (shots && out.marks) {
      await page.evaluate(() => document.querySelector('#s-stage .mic-mark').scrollIntoView({ block: 'start' }));
      await page.evaluate(() => scrollBy(0, -70));
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SHOTS, '3-結果-譜上標色.png') });
      await page.evaluate(() => { document.getElementById('s-alongResult').scrollIntoView({ block: 'end' }); scrollBy(0, 90); });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SHOTS, '4-結果.png') });
    }
    if (errors.length) problems.push(`${name}: ${errors.join(' | ')}`);
    return out;
  } finally { await close(); }
}

const show = (name, o) => console.log(name.padEnd(14), o.r ? `準度 ${o.r.accuracy} 節奏 ${o.r.rhythm} 穩定 ${o.r.stability} 連貫 ${o.r.continuity} 音 ${o.r.pitch} ♩≈${o.r.bpmEst?.toFixed(1)}(譜 ${o.r.scoreBpm})標色 ${o.marks}` : '', '|', (o.text || o.msg || '').slice(0, 120));

if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const ontime = await take('free-ontime', { view: 'free', sub: 'right' }, {});
show('右手 準時', ontime);
ok(ontime.r && ontime.r.accuracy >= 90, `準時的準度 ${ontime.r?.accuracy}`);
ok(/在聽/.test(ontime.listening), `彈奏前的狀態:${ontime.listening}`);
ok(/彈一遍/.test(ontime.label), '結束後按鈕沒有回到「彈一遍」');
ok(ontime.r && Math.abs(ontime.r.bpmEst - ontime.r.scoreBpm) / ontime.r.scoreBpm <= 0.03, '準時:速度估計誤差 > 3%');

const slow = await take('free-slow', { view: 'free', sub: 'both' }, { tempo: 0.7 });
show('雙手 慢 30%', slow);
ok(slow.r && slow.r.accuracy >= 90, `慢 30% 但穩:準度 ${slow.r?.accuracy}`);
ok(slow.r && Math.abs(slow.r.bpmEst - slow.r.scoreBpm * 0.7) / (slow.r.scoreBpm * 0.7) <= 0.03, '慢 30%:速度估計誤差 > 3%');
ok(/你的速度 ♩≈\d+\uFF08譜上 ♩=\d+\uFF09/.test(slow.text), `沒有寫你的速度:${slow.text}`);

const pause = await take('free-pause', { view: 'free', sub: 'both' }, { pauseAt: 6, pauseBeats: 2, drop: [9] }, { shots: !!SHOTS });
show('雙手 停+漏', pause);
ok(pause.r && pause.r.continuity < 100 && pause.marks >= 1 && /停頓/.test(pause.text), '中途停 2 拍:連貫沒扣、譜上沒標');

const exam1 = await take('exam-1', { view: 'exam', grade: 1 }, { tempo: 0.8 });
show('檢定 1 級 慢', exam1);
ok(exam1.r && exam1.r.accuracy >= 90 && !exam1.selfCheck && /不是考試分數/.test(exam1.text), `檢定頁:${exam1.text}`);

const exam3 = await take('exam-3', { view: 'exam', grade: 3 }, { accel: 0.35 });
show('檢定 3 級 加快', exam3);
ok(exam3.r && (exam3.r.trend === 'faster' || exam3.r.stability < 90), '越彈越快:穩定沒反映');

const silent = await take('free-silent', { view: 'free', sub: 'right' }, { silent: true });
show('安靜', silent);
ok(/沒有聽到琴聲/.test(silent.text), '安靜:沒有說沒聽到');

const denied = await take('free-denied', { view: 'free', sub: 'right' }, { denied: true });
console.log('拒絕權限      |', denied.msg.slice(0, 60), '|', denied.label);
ok(/停止/.test(denied.label), '拒絕權限:沒有照原本的方式(播放軸)繼續');

const deniedExam = await (async () => {
  const { page, close } = await open(IPHONE);
  await page.evaluate(() => { localStorage.setItem('pianodrill.v1', JSON.stringify({ onboarded: true, view: 'exam' })); localStorage.setItem('pianodrill-lang', 'zh'); });
  await page.reload();
  await page.waitForFunction(() => window.__stageReady);
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); }; window.__shell.setExam('abrsm', 1); window.__shell.showView('exam', 'sight'); });
  await page.click('#s-generate');
  await page.waitForFunction(() => window.__sight.score() && document.querySelector('#s-score svg'));
  await page.click('#s-playAlongTop');
  await page.waitForFunction(() => /^\d+ 秒$/.test(document.getElementById('s-playAlongTop').textContent.trim()));
  await page.evaluate(() => window.__sight.skipPrep());
  await page.waitForFunction(() => /彈一遍/.test(document.getElementById('s-playAlongTop').textContent));
  await page.click('#s-playAlongTop');
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__sight.finishPlay());
  await page.waitForFunction(() => window.__sight.selfCheck(), null, { timeout: 10000 });
  await close();
  return true;
})();
ok(deniedExam, '檢定頁拒絕權限:沒有自我檢查');
console.log('檢定頁拒絕權限 | 照原本的方式彈完,出現自我檢查');

if (problems.length) { console.error('\n✗', problems.length, '項問題:\n - ' + problems.join('\n - ')); process.exit(1); }
console.log('\n✓ 麥克風自動打分(瀏覽器)全部通過');
