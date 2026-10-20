// 任務腳本(兩個 App 同一份,@app-begin … @app-end 放各自的任務;tools/test/sync.json markers):
// 模擬真人從打開 App 開始完成幾個任務,記錄每個任務「要點幾下才開始練」、要不要捲動、要點的東西在不在畫面上、
// 有沒有點到收起來的卡片裡、有沒有下拉選單、點擊區域夠不夠大(≥ 28×28),最後一步之後的畫面有沒有告訴使用者下一步。
// 目標:≤ 3 下就開始練、開始練之前不用捲動找按鈕、沒有下拉選單、沒有收合卡。超過就印 ✗(結束碼 1)。開始練以後的捲動記在「注意」。
// 第一個畫面:開始練的那一下之後(還沒捲動),task.first 列的東西(子項目列、題目譜框、作答區、最常用的設定)都要整個在畫面裡(頂欄下、分頁列上);
//   soft: true 的(「盡量」看得到,例如音域那行)不在畫面裡只記注意。step.common = 常用設定:開始以後點它也不能要捲動(不常用的設定開始後捲動只記注意)。
// 用法:node tools/test/tasks.mjs [尺寸,…](預設 iphone-390、fold-280、iphone-land、ipad、desktop);TASK=關鍵字 只跑名稱含關鍵字的任務
import { open } from "./harness.mjs";

const SIZES = {
  "iphone-390": { viewport: { width: 390, height: 844 }, mobile: true },
  "fold-280": { viewport: { width: 280, height: 653 }, mobile: true },
  "iphone-land": { viewport: { width: 844, height: 390 }, mobile: true },
  "ipad": { viewport: { width: 820, height: 1180 }, mobile: true },
  "desktop": { viewport: { width: 1400, height: 900 }, mobile: false }
};
const MAX_START = 3;

// @app-begin:各 App 的任務。step = { sel(要點的東西,CSS), say(說明), start(這一步之後就在練了), common(常用設定:要在第一個畫面), wait(點完等幾毫秒), run(不點、做別的,例如等播放結束) }
// first = [{ sel, say, soft }]:開始練的那一刻第一個畫面要看得到的東西
// check(page) → 錯誤訊息或 null(任務完成了沒有);next = 最後的畫面要寫著下一步(選擇器 + 要有的字,中或英)
const APP = "pianodrill";
const LANG_KEY = "pianodrill-lang", SHELL_KEY = "pianodrill.v1";
const onboarded = (o = {}) => ({ [SHELL_KEY]: { onboarded: true, exam: null, theme: "dark", ...o } });
const READ_FIRST = [{ sel: "#subSeg", say: "子項目列" }, { sel: "#s-rdScore", say: "譜框" }, { sel: "#s-rdKbd", say: "琴鍵" },
  { sel: "#s-rdClef", say: "譜號" }, { sel: "#s-rdQuick", say: "範圍快捷" }, { sel: ".rd-span-ctl", say: "音域那行", soft: true }];
const TASKS = [
  { name: "新手想練右手 C4–G4 視奏、彈完看回饋", store: null, steps: [
      { sel: "#obNo", say: "第一次的問題:不考,自由練習" },
      { sel: '#tabbar [data-view="sight"]', say: "視奏分頁", wait: 800 },
      { sel: '#subSeg [data-v="right"]', say: "右手(範圍預設 = C4–G4,題目馬上出)", start: true, wait: 2000 },
      { sel: "#s-playAlongTop", say: "彈一遍(題目卡上)", wait: 500 },
      { run: async page => { await page.waitForFunction(() => /下一題|Next/.test(document.getElementById("s-message").textContent), null, { timeout: 60000 }); }, say: "(彈完)" }
    ],
    check: async page => page.evaluate(() => { const st = document.querySelector('#s-stageSeg [aria-pressed="true"]'), sub = document.querySelector('#subSeg [aria-pressed="true"]');
      return sub && sub.dataset.v === "right" && st && /C4–G4/.test(st.textContent) ? null : "範圍不是右手 C4–G4:" + (st && st.textContent); }),
    next: { sel: "#s-message", words: ["下一題", "Next"] } },
  // 認音的第一個畫面:子項目列、譜框、琴鍵、最常用的設定(譜號 + 範圍快捷;音域那行盡量)
  { name: "想練高音譜表 C4–C5 認音", store: onboarded(), first: READ_FIRST, steps: [
      { sel: '#tabbar [data-view="sight"]', say: "視奏分頁", wait: 800 },
      { sel: '#subSeg [data-v="read"]', say: "認音(題目馬上出)", start: true, wait: 1200 },
      { sel: '#s-rdClef [data-v="treble"]', say: "高音譜表", common: true, wait: 600 },
      { sel: '#s-rdQuick [data-v="2"]', say: "範圍 C4–C5", common: true, wait: 600 },
      { sel: "#s-rdKbd .wk", say: "作答一題", wait: 300 }
    ],
    // 快捷按了音域那行跟著變、那顆快捷亮起來
    check: async page => page.evaluate(() => { const s = window.__read.state, $ = id => document.getElementById(id);
      return s.setting === "treble:60-72:all:w" && $("s-rdLo").textContent === "C4" && $("s-rdHi").textContent === "C5" && document.querySelector('#s-rdQuick [data-v="2"]').getAttribute("aria-pressed") === "true"
        ? null : "設定不對:" + s.setting + " " + $("s-rdLo").textContent + "–" + $("s-rdHi").textContent; }),
    next: { sel: "#s-rdMsg", words: ["答案", "對了", "這是什麼音", "Right", "It was", "Which note"] } },
  { name: "想練左手認音、自訂 C2–C3、只出線上、挑戰 60 秒", store: onboarded(), first: READ_FIRST, steps: [
      { sel: '#tabbar [data-view="sight"]', say: "視奏分頁", wait: 800 },
      { sel: '#subSeg [data-v="read"]', say: "認音(題目馬上出)", start: true, wait: 1200 },
      { sel: '#s-rdClef [data-v="bass"]', say: "低音譜表", common: true, wait: 600 },
      // 音域那行:最低音、最高音的「降低」箭頭(低音譜表階 1 = C3–G3 → C2–C3)
      ...Array.from({ length: 7 }, (_, i) => ({ sel: "#s-rdLoDown", say: `最低音降低(${i + 1}/7)`, wait: 150 })),
      ...Array.from({ length: 4 }, (_, i) => ({ sel: "#s-rdHiDown", say: `最高音降低(${i + 1}/4)`, wait: 150 })),
      { sel: '#s-rdPos [data-v="line"]', say: "只出線上", wait: 600 },
      { sel: '#s-rdMode [data-v="time"]', say: "60 秒", wait: 600 },
      { sel: "#s-rdStart", say: "開始 60 秒挑戰", wait: 800 },
      { sel: "#s-rdKbd .wk", say: "作答一題", wait: 300 }
    ],
    check: async page => page.evaluate(() => { const s = window.__read.state; return s.setting === "bass:36-48:line:w" && s.running && s.mode === "time" ? null : "設定不對:" + JSON.stringify(s); }),
    next: { sel: "#s-rdScoreTxt, #s-rdMsg", words: ["剩", "答案", "對了", "left", "It was", "Right"] } },
  { name: "考 ABRSM 3 級的人想練這一級的視奏題", store: onboarded({ exam: { system: "abrsm", grade: 3 }, view: "tech" }), steps: [
      { sel: '#tabbar [data-view="exam"]', say: "檢定分頁", wait: 600 },
      { sel: '#subSeg [data-v="sight"]', say: "視奏(子項目列;本項卡)", wait: 800 },
      { sel: "#s-generate", say: "練習一題(本項卡右下)", start: true, wait: 2000 },
      { sel: "#s-playAlongTop", say: "看譜 30 秒(題目卡右下的主要按鈕)", wait: 2500 }
    ],
    check: async page => page.evaluate(() => (document.querySelector('#gradeSeg [aria-pressed="true"]')?.dataset.v === "3" && !document.getElementById("s-quiz").hidden ? null : "檢定頁沒有出題")),
    next: { sel: "#s-message", words: ["給音", "讀", "pitch", "Read", "Scroll"] } },
  // 今日練習(兩個 App 同一個任務):打開技巧分頁 → 按「開始今天的練習」→ 第一段(暖身)就在練了;卡片與按鈕在第一個畫面
  { name: "打開技巧分頁、開始今天的練習", store: onboarded({ view: "tech" }),
    first: [{ sel: "#subnav .sub-bar", say: "今日練習(進度一行,在子項目列的位置)" }, { sel: "#t-qTitle", say: "這一段的標題" }, { sel: "#t-playBtn", say: "▶ 示範" }],
    steps: [{ sel: "#t-dailyCard .daily-btn", say: "開始今天的練習", start: true, wait: 1200 }],
    check: async page => page.evaluate(() => { const t = window.__tech, s = t && t.dseg;
      return s && s.i === 0 && !document.getElementById("t-dailyStep").hidden && !document.querySelector('#subSeg [aria-pressed="true"]') ? null : "沒有開始第一段:" + JSON.stringify(s && { k: s.k, i: s.i }); }),
    next: { sel: "#t-dailyStep, #subnav .sub-bar", words: ["下一段", "Next part"] } }
];
// @app-end

// 第一個看得到的符合元素;在畫面裡(頂欄下、底部分頁列上;手機橫式在左邊分頁列右邊)= 不用捲動。mark = 標記起來給下一步點
async function look(page, sel, mark){
  return page.evaluate(([sel, mark]) => {
    const els = [...document.querySelectorAll(sel)].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== "hidden");
    const e = els[0]; if (!e) return null;
    const b = e.getBoundingClientRect(), head = document.querySelector("header"), bar = document.getElementById("tabbar");
    const top = head ? head.getBoundingClientRect().bottom : 0, bb = bar ? bar.getBoundingClientRect() : null;
    const bottom = bb && bb.top > innerHeight / 2 ? bb.top : innerHeight, left = bb && bb.right < innerWidth / 2 && bb.height > innerHeight / 2 ? bb.right : 0;
    // 頂欄、子項目列、分頁列上的按鈕:在畫面裡就算(它們本身就是固定的外框)
    const chrome = e.closest("header, #tabbar, #subnav, .modal, #onboard");
    const inView = chrome ? b.top >= 0 && b.bottom <= innerHeight + 1 && b.right <= innerWidth + 1
      : b.top >= top - 1 && b.bottom <= bottom + 1 && b.left >= left - 1 && b.right <= innerWidth + 1;
    const fold = e.closest(".setup:not(.open):not(.always-open), .picker:not(.open):not(.always-open)");
    const collapsed = !!fold && getComputedStyle(fold.querySelector(".setup-summary") || fold).display !== "none";
    if (mark) e.setAttribute("data-task-target", "1");
    return { inView, collapsed, w: Math.round(b.width), h: Math.round(b.height) };
  }, [sel, mark]);
}

const only = (process.argv[2] || "").split(",").filter(Boolean);
const sizes = Object.entries(SIZES).filter(([n]) => !only.length || only.includes(n));
const pick = (process.env.TASK || "").trim();
let bad = 0;
const rows = [];
for (const [sname, sz] of sizes) {
  const h = await open({ viewport: sz.viewport, mobile: sz.mobile, dpr: 1 });
  const { page } = h;
  for (const task of TASKS.filter(t => !pick || t.name.includes(pick))) {
    await page.evaluate(([store, lk]) => { localStorage.clear(); localStorage.setItem(lk, "zh"); for (const [k, v] of Object.entries(store || {})) localStorage.setItem(k, JSON.stringify(v)); }, [task.store, LANG_KEY]);
    await page.reload(); await page.waitForFunction(() => window.__stageReady >= 1, null, { timeout: 30000 }); await page.waitForTimeout(800);
    const r = { size: sname, task: task.name, clicks: 0, start: null, scrolls: [], collapsed: [], small: [], notes: [], missing: [], firstMiss: [], fail: null };
    for (const st of task.steps) {
      if (st.run) { try { await st.run(page); } catch (e) { r.fail = `${st.say}:${e.message.split("\n")[0]}`; break; } continue; }
      const info = await look(page, st.sel, true);
      if (!info) { r.missing.push(st.say); r.fail = `找不到「${st.say}」(${st.sel})`; break; }
      // 「不用捲動」指的是開始練之前(第一個畫面就能開始);開始練以後:常用設定(common)也不能要捲動,不常用的捲動只記在注意事項
      if (!info.inView) { if (r.start == null) r.scrolls.push(st.say); else if (st.common) r.scrolls.push(`常用設定「${st.say}」`); else r.notes.push(`開始後捲動到「${st.say}」`); }
      if (info.collapsed) r.collapsed.push(st.say);
      if (info.w < 28 || info.h < 28) { if (st.small) r.notes.push(`${st.say} ${info.w}×${info.h}(${st.small})`); else r.small.push(`${st.say} ${info.w}×${info.h}`); }
      const el = page.locator("[data-task-target='1']").first();
      try { if (sz.mobile) await el.tap({ timeout: 4000 }); else await el.click({ timeout: 4000 }); }
      catch (e) { r.fail = `點不到「${st.say}」:${e.message.split("\n")[0]}`; break; }
      await page.evaluate(() => document.querySelectorAll("[data-task-target]").forEach(e => e.removeAttribute("data-task-target")));
      r.clicks++;
      const starting = st.start && r.start == null;
      if (starting) r.start = r.clicks;
      await page.waitForTimeout(st.wait || 400);
      // 開始練的那一刻(還沒捲動):第一個畫面要有的東西
      if (starting) for (const f of task.first || []) {
        const fi = await look(page, f.sel, false);
        if (fi && fi.inView) continue;
        const why = fi ? `${f.say} 不在第一個畫面` : `第一個畫面找不到 ${f.say}`;
        if (f.soft) r.notes.push(why); else r.firstMiss.push(why);
      }
    }
    if (!r.fail && task.check) r.fail = await task.check(page).catch(e => e.message);
    // 下拉選單:畫面上(目前的分頁)看得到的 <select>
    r.selects = await page.evaluate(() => [...document.querySelectorAll("main select")].filter(e => e.getClientRects().length).length);
    // 結果畫面寫著下一步
    if (!r.fail && task.next) {
      const txt = await page.evaluate(sel => [...document.querySelectorAll(sel)].filter(e => e.getClientRects().length).map(e => e.textContent).join(" "), task.next.sel);
      if (!task.next.words.some(w => txt.includes(w))) r.fail = `最後的畫面沒有寫下一步(${task.next.sel})`;
    }
    const ok = !r.fail && r.start != null && r.start <= MAX_START && !r.scrolls.length && !r.firstMiss.length && !r.collapsed.length && !r.selects && !r.small.length;
    if (!ok) bad++;
    rows.push({ ...r, ok });
    console.log(`${ok ? "✓" : "✗"} ${sname.padEnd(11)} ${task.name}:${r.start ?? "—"} 下開始練(共 ${r.clicks} 下)`
      + (r.scrolls.length ? `;要捲動:${r.scrolls.join("、")}` : "") + (r.firstMiss.length ? `;第一個畫面缺:${r.firstMiss.join("、")}` : "") + (r.collapsed.length ? `;在收起來的卡裡:${r.collapsed.join("、")}` : "")
      + (r.selects ? `;下拉選單 ${r.selects} 個` : "") + (r.small.length ? `;太小:${r.small.join("、")}` : "") + (r.notes.length ? `;注意:${r.notes.join("、")}` : "") + (r.fail ? `;${r.fail}` : ""));
  }
  if (h.errors.length) { bad++; console.log(`✗ ${sname} 頁面錯誤:${h.errors.slice(0, 3).join(" | ")}`); }
  await h.close();
}
console.log(bad ? `✗ ${bad} 個任務沒達標(${APP})` : `✓ 全部任務 ≤ ${MAX_START} 下開始練、不用捲動、第一個畫面有常用設定、沒有下拉與收合卡(${APP})`);
process.exit(bad ? 1 : 0);
