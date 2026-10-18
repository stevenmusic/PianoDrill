// 播放中換語言不停播(D12;對應 DrumDrill tools/test/playback.mjs 第 4 項,Playwright):
//  1. 技巧(音階):播放中按語言鈕 → 繼續播放、排程中的節點還在;題目、選擇器、按鈕文字換成新語言
//  2. 聽音(和弦):播放中換語言 → 繼續播放;題目、選項、按鈕文字換成新語言;作答狀態不變
//  3. 視奏:播放中換語言 → 繼續播放(播放鈕還是「停止」狀態),播放鈕的說明換成新語言
// 用法:node tools/test/playback.mjs
import { open } from "./harness.mjs";
let bad = 0;
const fail = m => { bad++; console.log("✗ " + m); };
const ok = m => console.log("✓ " + m);
const { page, errors, close } = await open({ viewport: { width: 1280, height: 800 } });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem("pianodrill-lang", "zh"); localStorage.setItem("pianodrill.v1", JSON.stringify({ onboarded: true, view: "tech", sub: { tech: "scale", ear: "chord", exam: "tech", sight: "1" } })); });
await page.reload(); await page.waitForFunction(() => window.__stageReady >= 1);
const waitFor = (fn, arg, ms = 30000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 50 });
const text = id => page.evaluate(id => document.getElementById(id).textContent, id);
const lang = async () => { await page.click("#langToggle"); await page.waitForTimeout(300); };

// 1. 技巧
{
  await page.evaluate(() => { const T = window.__tech; T.S.loop = true; T.S.ramp = false; T.S.clickOnly = false; });
  await waitFor(() => window.__tech && window.__tech.cur && document.querySelector("#t-osmd svg"));
  await page.click("#t-playBtn");
  await waitFor(() => window.__tech.state.play && window.__tech.state.scheduled > 0);
  const before = { title: await text("t-qTitle"), picker: await text("t-paneScale") };
  await lang();
  const s = await page.evaluate(() => window.__tech.state);
  const after = { title: await text("t-qTitle"), picker: await text("t-paneScale"), label: await text("t-playLabel") };
  const n0 = bad;
  if (!s.play) fail("技巧:換語言後播放停止了");
  if (!s.scheduled) fail("技巧:換語言後排程中的節點 = 0(聲音被停掉)");
  if (after.title === before.title) fail(`技巧:換語言後題目沒換:${after.title}`);
  if (after.picker === before.picker) fail("技巧:換語言後選擇器文字沒換");
  if (after.label !== "Stop") fail(`技巧:換語言後播放鈕寫「${after.label}」`);
  if (bad === n0) ok(`技巧播放中換語言:繼續播放,題目「${before.title}」→「${after.title}」`);
  await page.click("#t-playBtn"); await page.waitForTimeout(300);
  await lang();   // 換回中文
  await page.evaluate(() => { window.__tech.S.loop = false; });
}

// 2. 聽音(和弦:分解再同時,播放比較長)
{
  await page.click('.tabbar [data-view="ear"]');
  await waitFor(() => window.__ear && window.__ear.cur);
  await page.evaluate(() => { const E = window.__ear; E.S.pick.chord.style = "both"; E.switchTab("chord"); });
  await waitFor(() => window.__ear.cur && window.__ear.cur.tab === "chord");
  await page.click("#e-playBtn");
  await waitFor(() => window.__ear.play);
  const before = { title: await text("e-qTitle"), answers: await text("e-answers"), picker: await text("e-paneChord"), q: await page.evaluate(() => window.__ear.cur) };
  await lang();
  const after = { title: await text("e-qTitle"), answers: await text("e-answers"), picker: await text("e-paneChord"), label: await text("e-playLabel") };
  const st = await page.evaluate(() => ({ play: window.__ear.play, cur: window.__ear.cur, A: window.__ear.A }));
  const n0 = bad;
  if (!st.play) fail("聽音:換語言後播放停止了");
  if (JSON.stringify(st.cur.play) !== JSON.stringify(before.q.play)) fail("聽音:換語言後題目的音變了(換了題)");
  if (st.A.done) fail("聽音:換語言後作答狀態變了");
  if (after.picker === before.picker) fail("聽音:換語言後選擇器文字沒換");
  if (after.answers === before.answers) fail(`聽音:換語言後選項文字沒換:${after.answers}`);
  if (after.label !== "Stop") fail(`聽音:換語言後播放鈕寫「${after.label}」`);
  if (bad === n0) ok(`聽音播放中換語言:繼續播放、同一題,選項「${before.answers.slice(0, 20)}…」→「${after.answers.slice(0, 20)}…」`);
  await page.click("#e-playBtn"); await page.waitForTimeout(300);
  await lang();
}

// 3. 視奏
{
  await page.click('.tabbar [data-view="sight"]');
  await waitFor(() => !document.getElementById("s-play").disabled, null, 60000);
  await page.click("#s-play");
  await waitFor(() => document.getElementById("s-play").classList.contains("is-active"), null, 30000);
  const before = await page.getAttribute("#s-play", "aria-label");
  await lang();
  const playing = await page.evaluate(() => document.getElementById("s-play").classList.contains("is-active"));
  const after = await page.getAttribute("#s-play", "aria-label");
  const n0 = bad;
  if (!playing) fail("視奏:換語言後播放停止了");
  if (after === before) fail(`視奏:換語言後播放鈕的說明沒換:${after}`);
  if (bad === n0) ok(`視奏播放中換語言:繼續播放,播放鈕「${before}」→「${after}」`);
  await page.click("#s-play"); await page.waitForTimeout(300);
  await lang();
}

for (const e of errors) fail("console:" + e);
await close();
console.log(bad ? `✗ ${bad} 項問題` : "✓ 播放中換語言全部通過");
process.exit(bad ? 1 : 0);
