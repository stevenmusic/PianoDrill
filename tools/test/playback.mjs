// 播放中換語言不停播(D12;對應 DrumDrill tools/test/playback.mjs 第 4 項,Playwright):
//  1. 技巧(音階):播放中按語言鈕 → 繼續播放、排程中的節點還在;題目、選擇器、按鈕文字換成新語言
//  2. 聽音(和弦):播放中換語言 → 繼續播放;題目、選項、按鈕文字換成新語言;作答狀態不變
//  3. 視奏:播放中換語言 → 繼續播放(播放鈕還是「停止」狀態),播放鈕的說明換成新語言
// 聽音換語言後的文字要跟「直接用那個語言載入、出同一題、做同樣的操作」一模一樣
// (Math.random 換成固定種子 → 兩次出的題目相同;題目的音也比對,確定真的是同一題):
//  4. 檢定 D(ABRSM 3 級 力度)答錯後換語言(中→英、英→中):標題、標籤、問題、選項、答案說明
//  5. 模擬考中換語言:之後每一題(作答前、作答後)與結果畫面
//  6. 練習分頁(音程同時、和弦同時)答錯 → 切到技巧分頁換語言 → 回到聽音、再切子分頁:存著的題目也換成新語言
//  7. 拍子題的提示:rhythm 播完「現在按出節奏(n 下)」、pulse 播放中「跟著拍子按」換語言後還在
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

// ── 4–7:聽音換語言,跟直接用那個語言載入比對 ──
const boot = async (lng, shell, ear = {}) => {
  await page.evaluate(([lng, shell, ear]) => {
    localStorage.clear(); localStorage.setItem("pianodrill-lang", lng);
    localStorage.setItem("pianodrill.v1", JSON.stringify({ onboarded: true, ...shell }));
    localStorage.setItem("pianodrill.ear.v1", JSON.stringify({ auto: false, adaptive: false, ...ear }));
  }, [lng, shell, ear]);
  await page.reload(); await page.waitForFunction(() => window.__stageReady >= 1 && window.__ear && window.__ear.SY);
  await page.waitForTimeout(400);
};
const seed = s => page.evaluate(s => {   // mulberry32
  let x = s >>> 0;
  Math.random = () => { x = (x + 0x6D2B79F5) >>> 0; let t = x; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}, s);
const snap = () => page.evaluate(() => {
  const g = id => document.getElementById(id).textContent;
  const E = window.__ear;
  return { title: g("e-qTitle"), tags: g("e-qTags"), stepQ: g("e-stepQ"), answers: g("e-answers"), feedback: g("e-feedback"), play: g("e-playLabel"),
    sound: E.cur ? JSON.stringify(E.cur.play) : "" };
});
const EXAM3 = { view: "exam", exam: { system: "abrsm", grade: 3 }, sub: { tech: "scale", ear: "note", exam: "ear", sight: "1" } };
/* 兩次的畫面逐欄比對(sound 不同 = 種子沒對上,不是同一題) */
function same(name, got, want){
  const n0 = bad;
  if (got.length !== want.length) { fail(`${name}:畫面數不同 ${got.length} / ${want.length}`); return; }
  got.forEach((g, i) => {
    if (g.sound !== want[i].sound) { fail(`${name} #${i}:兩次出的題目不同(種子沒對上),無法比對`); return; }
    for (const k of Object.keys(g)) if (k !== "sound" && g[k] !== want[i][k]) fail(`${name} #${i} ${k}:換語言後「${g[k]}」,直接載入「${want[i][k]}」`);
  });
  return bad === n0;
}
const answerWrong = () => page.evaluate(() => {
  const st = window.__ear.cur.steps[window.__ear.A.step], c = st.choices.find(x => x.id !== st.answer);
  document.querySelector(`#e-answers .ans[data-id="${c.id}"]`).click();
});

// 4. 檢定 D 答錯後換語言
for (const [from, to] of [["zh", "en"], ["en", "zh"]]) {
  const run = async (lng, flip) => {
    await boot(lng, EXAM3);
    await seed(11);
    await page.evaluate(() => { const E = window.__ear; E.loadDrill(E.allDrills().find(x => x.test.id === "D" && x.drill.type === "dyn")); });
    await answerWrong(); await page.waitForTimeout(150);
    const before = await snap();
    if (flip) await lang();
    return [before, await snap()];
  };
  const [before, got] = await run(from, true);
  const [, want] = await run(to, false);
  if (got.stepQ === before.stepQ || got.answers === before.answers || got.feedback === before.feedback) fail(`檢定 D ${from}→${to}:換語言後問題/選項/答案說明沒換:${got.stepQ} | ${got.answers} | ${got.feedback}`);
  if (same(`檢定 D ${from}→${to}`, [got], [want])) ok(`檢定 D 答錯後換語言(${from}→${to}):「${before.stepQ} ${before.answers}」→「${got.stepQ} ${got.answers}」,跟直接載入一致`);
}

// 5. 模擬考中換語言(第 2 題換;之後每一題作答前、作答後、結果畫面都要跟直接用英文考一樣)
{
  const run = async (lng, flip, flipAt = 1) => {
    await boot(lng, EXAM3);
    await seed(22);
    await page.click("#e-mockBtn"); await page.waitForTimeout(150);
    const out = [];
    for (let i = 0; i < 10; i++) {
      if (flip && i === flipAt) await lang();
      if (i >= flipAt) out.push(await snap());
      const kind = await page.evaluate(() => { const E = window.__ear; return E.cur.steps ? E.cur.steps.length : 0; });
      if (kind) for (let k = 0; k < kind; k++) { await answerWrong(); await page.waitForTimeout(800); }
      else { await page.click("#e-revealBtn"); await page.waitForTimeout(150); }
      if (i >= flipAt) out.push(await snap());
      await page.click("#e-nextBtn");
      const done = await page.evaluate(() => !window.__ear.cur);
      if (done) { await page.waitForTimeout(150); out.push(await snap()); break; }
      await waitFor(() => window.__ear.play);
      await page.click("#e-playBtn"); await page.waitForTimeout(200);   // 停掉自動播放(兩次的畫面才一樣)
    }
    return out;
  };
  const got = await run("zh", true), want = await run("en", false);
  const mid = got.find(x => /Mock|模擬考/.test(x.title));
  if (!mid || !/^Mock /.test(mid.title)) fail(`模擬考:換語言後標題不是英文:${mid && mid.title}`);
  if (!/^Mock result/.test(got[got.length - 1].title)) fail(`模擬考:結果畫面不是英文:${got[got.length - 1].title}`);
  if (same("模擬考中換語言", got, want)) ok(`模擬考中換語言:之後 ${got.length} 個畫面跟直接用英文考一致(${got.map(x => x.stepQ).filter(Boolean).slice(0, 3).join(" / ")}…)`);
}

// 6. 練習分頁:答錯後切到技巧分頁換語言,回到聽音、切子分頁
{
  const sub = v => page.click(`#subSeg button[data-v="${v}"]`).then(() => page.waitForTimeout(250));
  const run = async (lng, flip) => {
    await boot(lng, { view: "ear", sub: { tech: "scale", ear: "note", exam: "tech", sight: "1" } },
      { tab: "note", pick: { interval: { set: ["M2", "M3", "P4", "P5", "P8"], dir: "harm", root: "rand" }, chord: { set: ["maj", "min"], inv: "all", style: "block", root: "rand" } } });
    await seed(33);
    await sub("interval"); await answerWrong(); await page.waitForTimeout(150);
    await sub("chord"); await answerWrong(); await page.waitForTimeout(150);
    await page.click('.tabbar [data-view="tech"]'); await page.waitForTimeout(300);
    if (flip) await lang();
    await page.click('.tabbar [data-view="ear"]'); await page.waitForTimeout(300);
    const out = [await snap()];
    await sub("interval"); out.push(await snap());
    return out;
  };
  const got = await run("zh", true), want = await run("en", false);
  if (!/Block/.test(got[0].tags) || !/Harmonic/.test(got[1].tags)) fail(`練習分頁:回來後標籤沒換成英文:${got[0].tags} / ${got[1].tags}`);
  if (same("切到別分頁換語言再回來", got, want)) ok(`切到別分頁換語言再回來:和弦「${got[0].tags}」「${got[0].feedback}」、音程「${got[1].tags}」,跟直接載入一致`);
}

// 7. 拍子題的提示
{
  await boot("zh", { ...EXAM3, exam: { system: "abrsm", grade: 0 } });
  await page.evaluate(() => { const E = window.__ear; E.loadDrill(E.allDrills().find(x => x.drill.type === "rhythm")); });
  await page.click("#e-playBtn");
  await waitFor(() => /現在按出節奏/.test(document.getElementById("e-feedback").textContent), null, 60000);
  await lang();
  const n = await page.evaluate(() => window.__ear.cur.tap.n), fb = await text("e-feedback");
  const n0 = bad;
  if (fb !== `Now tap the rhythm (${n} taps)`) fail(`rhythm 播完的提示換語言後是「${fb}」`);
  await page.evaluate(() => { const E = window.__ear; E.loadDrill(E.allDrills().find(x => x.drill.type === "pulse")); });
  await page.click("#e-playBtn");
  await waitFor(() => window.__ear.play);
  await lang();
  const fb2 = await text("e-feedback");
  if (fb2 !== "跟著拍子按「拍」") fail(`pulse 播放中的提示換語言(英→中)後是「${fb2}」`);
  await page.click("#e-playBtn"); await page.waitForTimeout(200);
  if (await text("e-feedback")) fail(`pulse 手動停止後還留著提示「${await text("e-feedback")}」`);
  if (bad === n0) ok(`拍子題提示:rhythm 播完「${fb}」、pulse 播放中「${fb2}」換語言後都還在`);
}

for (const e of errors) fail("console:" + e);
await close();
console.log(bad ? `✗ ${bad} 項問題` : "✓ 播放中換語言全部通過");
process.exit(bad ? 1 : 0);
