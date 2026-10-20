// 版面檢查:各種裝置尺寸(手機直/橫、折疊機、平板、筆電、大螢幕)× 每個畫面狀態,檢查
//  1. 沒有橫向捲動;可見元素沒有超出畫面左右
//  2. 按鈕文字沒有被截斷(刻意用省略號的除外)、點擊區域夠大
//  3. 頂欄品牌名和右邊按鈕不重疊;底部分頁列不蓋住內容(捲到底時最後一個元素在分頁列上方)
//  4. 對話框放得進畫面(放不下時可以捲動)
//  5. 樂譜不超出紙張
// 每種尺寸存截圖到 out/layout-*.png
// PianoDrill / DrumDrill 共用(tools/test/sync.mjs 檢查):檢查函式一模一樣,畫面狀態腳本放在 @app 區段
import { open } from "./harness.mjs";
import fs from "node:fs";
const OUT = new URL("./out/", import.meta.url).pathname; fs.mkdirSync(OUT, { recursive: true });
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const VPS_ALL = [
  ["fold-280", 280, 653, true], ["se1-320", 320, 568, true], ["se-375", 375, 667, true], ["iphone-390", 390, 844, true],
  ["promax-430", 430, 932, true], ["android-360", 360, 800, true], ["android-412", 412, 915, true],
  ["se-land", 667, 375, true], ["iphone-land", 844, 390, true], ["promax-land", 932, 430, true],
  ["ipad-mini", 744, 1133, true], ["ipad", 820, 1180, true], ["ipad-land", 1180, 820, true], ["ipad-pro", 1024, 1366, true], ["ipad-pro-land", 1366, 1024, true],
  ["laptop", 1280, 800, false], ["desktop", 1440, 900, false], ["fhd", 1920, 1080, false], ["narrow-window", 500, 900, false]
];
const VPS = ONLY ? VPS_ALL.filter(v => ONLY.includes(v[0])) : VPS_ALL;
let bad = 0; const issues = [];
const report = (vp, state, msg) => { bad++; issues.push(`${vp} ${state}: ${msg}`); };

async function audit(page, vp, state){
  const r = await page.evaluate(() => {
    const W = window.innerWidth, H = window.innerHeight, out = [];
    const vis = e => { const s = getComputedStyle(e); if (s.display === "none" || s.visibility === "hidden" || e.closest("[hidden]")) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    if (document.documentElement.scrollWidth > W + 1) out.push(`橫向捲動 ${document.documentElement.scrollWidth} > ${W}`);
    // 可見元素超出畫面(橫向捲動的 .opts 容器裡的除外;樂譜紙張 overflow hidden)
    for (const e of document.querySelectorAll("body *")) {
      if (!vis(e) || e.closest(".opts") || e.closest("#t-scroll") || e.id === "t-playline" || e.closest(".stage") || e.closest(".modal") && !e.closest(".modal-card")) continue;
      const r = e.getBoundingClientRect();
      if (r.left < -1 || r.right > W + 1) { out.push(`超出畫面:${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}.${[...e.classList].join(".")} [${Math.round(r.left)},${Math.round(r.right)}]`); if (out.length > 12) break; }
    }
    // 按鈕文字被截斷
    for (const e of document.querySelectorAll("button, .q-tag, label, .lbl")) {
      if (!vis(e) || e.closest(".setup-summary") || e.id === "examChip") continue;   // 摘要列刻意省略號
      if (e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== "visible") out.push(`文字被截斷:${e.textContent.trim().slice(0, 30)}(${e.scrollWidth}>${e.clientWidth})`);
    }
    // 點擊區域(手指):至少 28×28
    for (const e of document.querySelectorAll("button, select, input[type=range]")) {
      if (!vis(e)) continue;
      const r = e.getBoundingClientRect();
      if (r.height < 28 || r.width < 28) out.push(`點擊區域太小:${(e.id || e.textContent.trim()).slice(0, 20)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    // 頂欄重疊
    const h1 = document.querySelector("header h1").getBoundingClientRect(), hr = document.querySelector(".header-right").getBoundingClientRect();
    if (h1.right > hr.left + 1 && h1.bottom > hr.top && h1.top < hr.bottom) out.push(`頂欄重疊:品牌名到 ${Math.round(h1.right)},按鈕從 ${Math.round(hr.left)}`);
    // 樂譜不超出紙張
    const svg = document.querySelector("#t-osmd svg"), paper = document.querySelector("#mod-tech .paper");
    // 樂譜一整行:比紙張長時要能左右滑(#scroll),比紙張短時要置中
    if (svg && vis(paper)) {
      const sc = document.getElementById("t-scroll"), pr = paper.getBoundingClientRect(), gr = svg.getBoundingClientRect();
      if (pr.right > W + 1) out.push("樂譜紙張超出畫面");
      if (gr.width <= sc.clientWidth && Math.abs((gr.left + gr.right) / 2 - (pr.left + pr.right) / 2) > 3) out.push(`樂譜沒有置中(差 ${Math.round((gr.left + gr.right) / 2 - (pr.left + pr.right) / 2)}px)`);
      if (gr.width > sc.clientWidth + 2 && sc.scrollWidth <= sc.clientWidth) out.push("樂譜比紙張長卻不能左右滑");
    }
    // 對話框
    const mc = document.querySelector(".modal-card");
    if (mc && vis(mc)) { const r = mc.getBoundingClientRect(), m = document.querySelector(".modal"); if ((r.height > H + 1) && m.scrollHeight <= m.clientHeight) out.push(`對話框放不下又不能捲 ${Math.round(r.height)} > ${H}`); }
    return out;
  });
  for (const m of [...new Set(r)]) report(vp, state, m);
  // 捲到底:最後的內容不被底部分頁列蓋住
  const cover = await page.evaluate(async () => {
    // 播放中譜面會自己捲(stage.js 換行時平滑捲動):量的時候要真的在最底下,不在就再捲一次(最多 8 次)
    for (let k = 0; k < 8; k++) {
      window.scrollTo(0, document.documentElement.scrollHeight); await new Promise(r => setTimeout(r, 120));
      if (scrollY + innerHeight >= document.documentElement.scrollHeight - 2) break;
    }
    const tb = document.getElementById("tabbar").getBoundingClientRect();
    // 收起來的 <details> 裡的卡(考試內容的規格卡)看不見、不算(checkVisibility;以前會誤報「被分頁列蓋住」)
    const items = [...document.querySelectorAll("main .card, main > footer")].filter(e => !e.closest("[hidden]") && e.getBoundingClientRect().height > 0 && (!e.checkVisibility || e.checkVisibility()));
    const lastBottom = Math.max(...items.map(e => e.getBoundingClientRect().bottom));
    const left = Math.min(...items.map(e => e.getBoundingClientRect().left));
    window.scrollTo(0, 0);
    // 分頁列在下面:最後的內容要在它上面;手機橫放時分頁列是左邊的直欄:內容要在它右邊
    if (tb.height > innerHeight / 2) return left < tb.right - 1 ? `內容被左邊的分頁列蓋住(${Math.round(left)} < ${Math.round(tb.right)})` : null;
    return lastBottom > tb.top + 1 ? `最後的內容被底部分頁列蓋住(${Math.round(lastBottom)} > ${Math.round(tb.top)})` : null;
  });
  if (cover) report(vp, state, cover);
  // 飽滿(使用者要求):每種裝置的第一個畫面,題目卡要在畫面上半部(設定卡不能把題目擠到下面去)
  const quizTop = await page.evaluate(() => {
    const q = [...document.querySelectorAll(".mod:not([hidden]) .quiz")].find(e => !e.closest("[hidden]") && e.getBoundingClientRect().height > 0);
    // 使用者自己打開的設定卡把題目往下推是正常的;只檢查設定卡都收著(或在兩欄的左欄)的時候
    const opened = [...document.querySelectorAll(".setup.open, .picker.open")].some(e => !e.closest("[hidden]") && !e.closest(".mod-side, #examSetup") || (e.closest("#examSetup") && innerWidth < 1100));
    const sideOpen = innerWidth < 1100 && [...document.querySelectorAll(".mod-side .setup.open, .mod-side .picker.open")].some(e => !e.closest("[hidden]"));
    if (opened || sideOpen) return null;
    return q ? { top: Math.round(q.getBoundingClientRect().top + scrollY), H: innerHeight } : null;
  });
  // 手機橫放(高度 ≤ 500):頂欄 + 兩條收起來的設定列就佔掉一半,放寬到 60%(題目標題仍在第一個畫面)
  const limit = quizTop && quizTop.H <= 500 ? 0.6 : 0.5;
  if (quizTop && !/對話框|設定展開|選擇器|字級/.test(state) && quizTop.top > quizTop.H * limit) report(vp, state, `題目卡太下面(${quizTop.top} > 畫面 ${Math.round(limit * 100)}% ${Math.round(quizTop.H * limit)})`);
}

for (const [name, w, h, mobile] of VPS) {
  const { page, errors, close } = await open({ viewport: { width: w, height: h }, mobile, hasTouch: mobile, dpr: 1 });
  const shot = async st => page.screenshot({ path: `${OUT}layout-${name}-${st}.png` });
  const tab = v => page.click(`#tabbar button[data-view="${v}"]`).then(() => page.waitForTimeout(400));
  const sub = v => page.click(`#subSeg button[data-v="${v}"]`).then(() => page.waitForTimeout(500));
  const expand = async sel => { if (await page.isVisible(sel + " .setup-summary")) await page.click(sel + " .setup-summary"); };
  // @app-begin:各 App 的畫面狀態
  // 第一次打開:對話框
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("pianodrill-lang", "zh"); });
  await page.reload(); await page.waitForFunction(() => window.__stageReady >= 1);
  await audit(page, name, "對話框"); await shot("onboard");
  await page.click('#obGradeSeg button[data-v="8"]'); await page.click("#obYes");
  await page.waitForTimeout(300);
  // 檢定 · 音階琶音:ABRSM 8 級抽一題(四個八度,最寬的譜)
  const b = await page.evaluate(() => window.__scoreReady || 0);
  await page.click("#t-drawBtn"); await page.waitForFunction(b => (window.__scoreReady || 0) > b, b);
  await audit(page, name, "檢定 音階琶音"); await shot("exam");
  await page.click('#gradeSeg button[data-v="0"]'); await expand("#t-paneExam");
  await page.click('#systemSeg button[data-v="trinity"]'); await page.waitForTimeout(300);
  await audit(page, name, "檢定 Trinity 設定展開");
  // 檢定 · 視奏(Trinity 還沒有規則 → 說明)、聽力
  await sub("sight"); await audit(page, name, "檢定 視奏 Trinity");
  await page.click('#systemSeg button[data-v="abrsm"]'); await page.waitForTimeout(1500);
  await audit(page, name, "檢定 視奏 ABRSM 8"); await shot("exam-sight");
  await sub("ear"); await audit(page, name, "檢定 聽力"); await shot("exam-ear");
  // 技巧:音階選擇器展開、琶音、哈農
  await tab("tech"); await sub("scale");
  await expand("#t-paneScale");
  await page.click('#t-paneScale .opt[data-v="minor"]'); await page.waitForTimeout(400);
  await audit(page, name, "音階 選擇器"); await shot("scale");
  await sub("arp"); await audit(page, name, "琶音");
  await sub("hanon"); await audit(page, name, "哈農");
  // 視奏(自由練習)
  await tab("sight"); await page.waitForTimeout(1200); await expand("#s-setup");
  await audit(page, name, "視奏"); await shot("sight");
  // 聽音:單音(鍵盤)、音程、和弦
  await tab("ear"); await sub("note"); await audit(page, name, "聽音 單音"); await shot("ear");
  await sub("interval"); await audit(page, name, "聽音 音程");
  await sub("chord"); await audit(page, name, "聽音 和弦");
  // 英文(字比較長)
  await tab("tech"); await sub("scale"); await page.click("#langToggle"); await page.waitForTimeout(500);
  await audit(page, name, "英文 音階"); await shot("english");
  await tab("sight"); await page.waitForTimeout(800); await audit(page, name, "英文 視奏");
  await tab("ear"); await audit(page, name, "英文 聽音");
  await tab("exam"); await audit(page, name, "英文 檢定");
  // @app-end
  // 動態字級 200%(無障礙;iOS「更大的文字」):根字級 17px → 34px(app.css 的字級代幣是 rem,最多 2 倍),每個分頁看一次:
  // 沒有橫向捲動、元素不超出畫面、按鈕文字不被截斷(題目卡的位置不檢查:字大了本來就會往下)
  await page.evaluate(() => { window.scrollTo(0, 0); document.documentElement.style.fontSize = "34px"; });
  for (const v of ["tech", "sight", "ear", "exam"]) { await tab(v); await page.waitForTimeout(300); await audit(page, name, `字級 200% ${v}`); await shot(`font200-${v}`); }
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  for (const e of errors) report(name, "console", e);
  await close();
}
console.log(issues.slice(0, 120).join("\n"));
console.log(bad ? `✗ ${bad} 項問題` : `✓ ${VPS.length} 種尺寸全部通過`);
process.exit(bad ? 1 : 0);
