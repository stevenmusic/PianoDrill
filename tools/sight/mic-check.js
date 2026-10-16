/**
 * End-to-end check of the microphone rhythm scoring: the page's own
 * getUserMedia is replaced by a synthetic "player" that strikes tones at
 * chosen times, and the score the app reports is compared with what that
 * performance deserves.
 *
 *   node scripts/mic-check.js
 */
import { startServer, launch, openPage } from './layout.js';

const { server, url } = await startServer();
const browser = await launch();
const problems = [];

/** mode: 'exact' | 'late' (constant 250 ms lag) | 'sloppy' | 'silent' | 'denied' */
async function take(mode, grade = '1') {
  const { page, errors } = await openPage(browser, url, { width: 430, height: 932, mobile: true });
  await page.evaluate((mode) => {
    navigator.mediaDevices.getUserMedia = async () => {
      if (mode === 'denied') throw new DOMException('denied', 'NotAllowedError');
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      const plan = window.__scoring();
      if (mode !== 'silent') {
        const base = ctx.currentTime + plan.secondsPerBar + 0.25; // first note ~ one bar of count-in later
        plan.onsets.forEach((time, i) => {
          const shift = mode === 'late' ? 0.25 : mode === 'sloppy' ? (i % 2 ? 0.2 : -0.2) : 0;
          const at = Math.max(ctx.currentTime + 0.02, base + time + shift);
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.value = 220 * (i % 3 === 0 ? 1 : 1.5);
          gain.gain.setValueAtTime(0.0001, at);
          gain.gain.linearRampToValueAtTime(0.6, at + 0.004);
          gain.gain.exponentialRampToValueAtTime(0.001, at + 0.35);
          osc.connect(gain).connect(dest);
          osc.start(at);
          osc.stop(at + 0.4);
        });
      }
      return dest.stream;
    };
  }, mode);
  await page.selectOption('#grade', grade);
  await page.click('#generate');
  await page.waitForFunction(() => window.__scoring() && !document.getElementById('score').hasAttribute('aria-busy'));
  await page.evaluate(() => { document.getElementById('along').hidden = false; });
  await page.check('#along-mic');
  const seconds = await page.evaluate(() => { const p = window.__scoring(); return p.secondsPerBar * (1 + Math.ceil(p.onsets.at(-1) / p.secondsPerBar)) + 6; });
  await page.click('#play-along');
  await page.waitForFunction(() => !document.getElementById('along-result').hidden || /沒有取得麥克風/.test(document.getElementById('along-result').textContent), null, { timeout: (seconds + 40) * 1000 });
  const out = await page.evaluate(() => ({
    take: window.__lastTake,
    text: document.getElementById('along-result').innerText.replace(/\s+/g, ' ').slice(0, 160),
    score: Number((document.querySelector('#along-result .big')?.textContent.match(/\d+/) || [])[0]),
    message: document.getElementById('along-result').textContent,
    label: document.getElementById('play-along').textContent,
  }));
  if (process.env.SHOT && mode === 'exact') { await page.evaluate(() => document.getElementById('along').scrollIntoView({ block: 'center' })); await page.screenshot({ path: process.env.SHOT }); }
  if (errors.length) problems.push(`${mode}: ${errors.join(' | ')}`);
  await page.close();
  return out;
}

const exact = await take('exact');
console.log('exact  ', exact.score, exact.text);
console.log('  expected', exact.take?.expected.map((t) => t.toFixed(2)).join(' '));
console.log('  detected', exact.take?.detected.map((t) => t.toFixed(2)).join(' '));
if (!(exact.score >= 80)) problems.push(`an accurate performance scored ${exact.score}`);

const late = await take('late');
console.log('late   ', late.score, late.text);
if (!(late.score >= 80)) problems.push(`a constant lag was punished: ${late.score}`);
if (!/慢約/.test(late.text)) problems.push('a constant lag was not reported');

const sloppy = await take('sloppy');
console.log('sloppy ', sloppy.score, sloppy.text);
if (!(sloppy.score < 60)) problems.push(`uneven timing scored ${sloppy.score}`);

const silent = await take('silent');
console.log('silent ', silent.text);
if (!/沒有聽到琴聲/.test(silent.text)) problems.push('silence was not reported');

const denied = await take('denied');
console.log('denied ', denied.message.slice(0, 40), '|', denied.label);
if (!/沒有取得麥克風/.test(denied.message)) problems.push('a refused microphone was not explained');

await browser.close();
server.close();
if (problems.length) { console.error('\n✗', problems.length, '項問題:\n - ' + problems.join('\n - ')); process.exit(1); }
console.log('\n✓ 麥克風評分流程全部通過');
