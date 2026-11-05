// 新手從頭走到尾(兩個 App 同一份,@app-begin … @app-end 放各自的選擇器、用語與流程;tools/test/sync.json markers):
// 2026-11 使用者:「每個步驟的銜接性是最重要的」。每段流程都清空 localStorage、照真人點擊走一遍(FLOW= 選幾段,預設全部):
//   today:第一次打開 → 開始練習 → 技巧今日卡 → 開始今天的練習 → 每一段(底部主要按鈕 ▶ 跟著…一輪 → 播過一輪 → 做到了 / 穩了 → 到過關;
//     過關接下一關 / 下一段)→ 結束今天 → 練完卡 → 再練一下 → 結束 → 路線 → 點一關。
//   sight:視奏分頁 → 彈一遍 / 打一遍 → 彈完 → ▶ 對照 / 結果 → 下一題 → 認音 / 認譜答題(@app 的 FLOWS)
//   ear:聽力分頁 → ▶ 聽題目 → 作答 → 下一題(@app 的 FLOWS)
//   exam:第一次打開選「我在準備檢定」+ 系統 + 級數 → 檢定頁三個子項目各一題(@app 的 FLOWS)
// 每一下點完、畫面穩定後檢查(✗ = 斷點,⚠ = 只記警告):
//   1 有下一步:看得到(在畫面裡、沒被頂欄 / 分頁列 / 底部按鈕列蓋住:中心點 elementFromPoint 是它)一顆能按的主要按鈕,或狀態句寫著「按 …」
//     (流程另外列的 next:例如聽力的「下一題」、認音的琴鍵)
//   2 這個畫面的主要按鈕每一步位置一樣:今日練習 = 底部按鈕列 .daily-main(top、left、寬 ±1px,整段流程比);
//     其他 = 題目卡最後一行的 .btn.primary(頁面上的 top 與右邊界 ±1px;換題目(標題字換了)重新算)
//   3 題目卡標題與 ▶ 整個看得到(top ≥ 頂欄底、bottom ≤ 底部按鈕列 / 分頁列頂;在題目畫面時)
//   4 版面不跳:點完 1.8 秒內(含過關橫幅)題目卡標題、狀態句的位置變動 ≤ 4px(標題文字換了 = 換題,不算)
//   5 ⚠ 同一句話(例如「過關 ✓」)在看得到的文字裡出現 ≥ 2 次(按鈕上的字不算)
//   6 主要導覽(子項目分段鈕、今日練習那一行、底部按鈕列、分頁列)的按鈕 ≥ 44 × 44(含 ::before / ::after 伸出去的)
//   7 沒有文字被截成「…」(text-overflow 生效:scrollWidth > clientWidth)
//   另外每段流程自己的檢查(expect:例如「▶ 還沒彈過前藏起來」「狀態寫按 ▶ 對照」「出現自我檢查」)
// 用法:node tools/test/newbie.mjs(中文 iphone-390、fold-280、iphone-land + 英文 iphone-390);ONLY=fold-280,en-390 只跑幾輪;FLOW=today,sight,ear,exam 只跑幾段;
//   FAST=0 真的等播滿一輪(預設用測試掛鉤 dcard.ready(true) 代替「播過一輪」那幾秒,點擊照樣是真的點);SHOTS=資料夾 失敗截圖(預設 tools/test/out/newbie)
// 改今日練習、版面、流程一定要跑
import { open } from "./harness.mjs";
import fs from "node:fs";
import path from "node:path";

// @app-begin:App 專屬的選擇器、用語、測試掛鉤、流程
const APP = "pianodrill";
const LANG_KEY = "pianodrill-lang";
const OK_WORD = ["做到了", "Did it"];           // 今日練習的「做到了 / 穩了」
const SEL = {
  title: "#t-qTitle", play: "#t-playBtn",        // 題目卡標題、圓形 ▶
  mod: "#mod-tech",                              // 技巧模組(段落進行中 .daily-on)
  card: "#t-dailyCard", step: "#t-dailyStep",    // 今日卡、段落面板
  start: "#obNo"                                 // 第一次打開:開始練習
};
// 主要導覽(點擊區 ≥ 44):子項目分段鈕、今日練習那一行、底部按鈕列、分頁列
const NAV = ["#subSeg button", "#subnav .daily-bar button", ".daily-cta button:not([hidden])", "#tabbar button"];
const hook = () => window.__tech;                // 在頁面裡執行:{ dcard, dseg, daily }
// 題目畫面(檢查 2、3、4 用):on = 看得到它就是在這個畫面;title / play = 大標題、圓形 ▶;status = 狀態句;prim = 題目卡最後一行的主要按鈕;
//   next = 也算「下一步」的東西(次要的下一題、作答區);busy = 播放中(頁面裡的運算式;播放中 App 把樂譜捲到頂欄下是設計:不查標題 / ▶,看不到下一步只記警告)
const VIEWS = {
  tech: { on: "#t-quizCard", title: "#t-qTitle", play: "#t-playBtn", status: "#t-hint, #t-intro", prim: "#t-quizCard .q-last .btn.primary" },
  sight: { on: "#s-quiz", title: "#s-title", play: "#s-play", status: "#s-message, #s-hint", prim: "#s-quiz .q-foot .btn.primary",
    busy: "/停止|Stop/.test(document.getElementById('s-playAlongTop').textContent) || document.getElementById('s-playAlongTop').classList.contains('counting') || document.getElementById('s-play').classList.contains('is-active')" },
  read: { on: "#s-rdCard", title: "#s-rdSet", status: "#s-rdMsg", next: "#s-rdKbd" },
  ear: { on: "#e-quizCard", title: "#e-qTitle", play: "#e-playBtn", status: "#e-feedback, #e-hint", prim: "#e-quizCard .q-foot .btn.primary", next: "#e-nextBtn, #e-kbd" },
  ob: { next: "#obSystem, #obGradeSeg" }   // 第一次打開「我在準備檢定」:下一步 = 選系統、級數(「開始準備考試」選好才能按)
};
const SIGHT_MSG = () => document.getElementById("s-message").textContent;
// 單音題:正確答案的鍵(ok = true)或錯的鍵(第一個不是答案、能按的白鍵)
const earKey = ok => { const q = window.__ear.cur, t = q && q.keys && q.keys.target[0]; if (t == null) return null;
  return [...document.querySelectorAll("#e-kbd .k:not(.off)")].find(k => ((Number(k.dataset.m) - t) % 12 === 0) === ok && (ok || k.classList.contains("wk"))); };
// 認音:題目的音名 → 琴鍵(data-pc);ok = false 挑另一個白鍵
const readKey = ok => { const n = window.__read.state.q; if (!n) return null;
  const pc = ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[n[0]] + (n.match(/♯|#/g) || []).length - (n.match(/♭|b(?=\d)/g) || []).length + 12) % 12;
  return ok ? document.querySelector(`#s-rdKbd .k[data-pc="${pc}"]`) : [...document.querySelectorAll("#s-rdKbd .wk")].find(k => Number(k.dataset.pc) !== pc); };
const FLOWS = {
  // 視奏:右手 → ▶ 先藏著 → 彈一遍(麥克風關掉:測試裡沒有琴聲)→ 彈完 → 按 ▶ 對照 → 下一題;認音答一題對、一題錯
  sight: { store: { "pianodrill.sight.mic": "0" }, run: async T => {
    await T.step("按「開始練習」", () => T.tap("#obNo"));
    T.view(VIEWS.sight);
    await T.step("點分頁列「視奏」", () => T.tap('#tabbar [data-view="sight"]'));
    await T.step("點「右手」(題目馬上出)", () => T.tap('#subSeg [data-v="right"]'),
      [() => !!window.__sight.score() && getComputedStyle(document.getElementById("s-play")).visibility === "hidden", "還沒彈過這一題,▶ 應該藏起來(visibility hidden)"]);
    await T.step("按「彈一遍」", () => T.tap("#s-playAlongTop"), [() => /停止|Stop/.test(document.getElementById("s-playAlongTop").textContent), "按了「彈一遍」主要按鈕沒有變成「停止」"]);
    await T.ev(() => window.__sight.finishPlay());
    await T.until(() => /對照|compare/i.test(document.getElementById("s-message").textContent), null, 15000, "彈完狀態沒有寫「按 ▶ 對照」");
    await T.step("彈完了(測試掛鉤 finishPlay)", null, [() => /按 ▶ 對照|▶ to compare/i.test(document.getElementById("s-message").textContent) && getComputedStyle(document.getElementById("s-play")).visibility !== "hidden", "彈完:狀態要寫「按 ▶ 對照」而且 ▶ 要出現"]);
    await T.step("按 ▶ 對照(聽正確版本)", () => T.tap("#s-play"));
    await T.step("再按 ▶ 停止", () => T.tap("#s-play"));
    await T.step("按「下一題」", () => T.tap("#s-generate"), [() => !!window.__sight.score() && getComputedStyle(document.getElementById("s-play")).visibility === "hidden", "下一題:▶ 應該又藏起來"]);
    T.view(VIEWS.read);
    await T.step("點「認音」(題目馬上出)", () => T.tap('#subSeg [data-v="read"]'));
    await T.until(() => !!window.__read.state.q, null, 15000, "認音沒有出題");
    await T.step("點對的鍵", () => T.tapPick(readKey, true));
    await T.until(() => !!window.__read.state.q, null, 15000, "認音沒有出下一題");
    await T.step("點錯的鍵", () => T.tapPick(readKey, false), [() => window.__read.state.session.n === 2 && window.__read.state.session.ok === 1, "兩題沒有都算到(一對一錯)"]);
  } },
  // 聽力單音:這是 C → ▶ → 錯的鍵 → 對的鍵(答完只出聲)→ 下一題 → ▶ → 對的鍵 → 自動下一題
  ear: { run: async T => {
    await T.step("按「開始練習」", () => T.tap("#obNo"));
    T.view(VIEWS.ear);
    await T.step("點分頁列「聽力」", () => T.tap('#tabbar [data-view="ear"]'));
    await T.step("點「單音」", () => T.tap('#subSeg [data-v="note"]'), [() => /這是 C|This is C/.test(document.getElementById("e-feedback").textContent), "狀態要先提「這是 C」"]);
    await T.step("按「這是 C」", () => T.tap("#e-refBtn"));
    await T.step("按 ▶ 聽題目", () => T.tap("#e-playBtn"));
    await T.until(() => !window.__ear.play, null, 15000, "題目播不完");
    await T.step("點錯的鍵", () => T.tapPick(earKey, false), [() => window.__ear.A.done && !window.__ear.A.ok, "點錯的鍵沒有判錯"]);
    await T.step("點對的鍵(答完了:只出聲比較)", () => T.tapPick(earKey, true));
    await T.step("按「下一題」(新題目自動播一次)", () => T.tap("#e-nextBtn"), [() => !window.__ear.A.done, "按了下一題沒有換題"]);
    await T.until(() => !window.__ear.play, null, 15000, "題目播不完");
    if (!(await T.ev(() => window.__ear.A.played))) { await T.step("按 ▶ 聽題目", () => T.tap("#e-playBtn")); await T.until(() => !window.__ear.play, null, 15000, "題目播不完"); }
    await T.step("點對的鍵(答對自動下一題)", () => T.tapPick(earKey, true), [() => !window.__ear.A.done, "答對 1.8 秒後沒有自動下一題"]);
  } },
  // 檢定:第一次打開 → 我在準備檢定 → ABRSM → 3 級 → 開始準備考試 → 音階琶音(隨機抽考 → 會了)→ 視奏(練習一題 → 看譜 30 秒 → 彈一遍 → 自我檢查)→ 聽力(隨機抽一題)
  exam: { store: { "pianodrill.sight.mic": "0" }, run: async T => {
    T.view(VIEWS.ob);
    await T.step("按「我在準備檢定」", () => T.tap("#obExam"));
    await T.step("點「ABRSM」", () => T.tap('#obSystem [data-v="abrsm"]'));
    await T.step("點「3」級", () => T.tap('#obGradeSeg [data-v="3"]'));
    await T.step("按「開始準備考試」", () => T.tap("#obYes"));
    T.view(VIEWS.tech);
    await T.step("點「音階琶音」", () => T.tap('#subSeg [data-v="tech"]'));
    await T.step("按「隨機抽考」", () => T.tap("#t-drawBtn"));
    await T.step("按「會了」", () => T.tap('#t-quizCard .mbtn[data-m="good"]'));
    T.view(VIEWS.sight);
    await T.step("點「視奏」", () => T.tap('#subSeg [data-v="sight"]'));
    await T.step("按「練習一題」", () => T.tap("#s-generate"));
    await T.step("按「看譜 30 秒」", () => T.tap("#s-playAlongTop"));
    await T.ev(() => window.__sight.skipPrep());
    await T.until(() => !document.getElementById("s-playAlongTop").disabled, null, 15000, "看譜時間到了「彈一遍」還不能按");
    await T.step("看譜時間到(測試掛鉤 skipPrep)", null);
    await T.step("按「彈一遍」", () => T.tap("#s-playAlongTop"));
    await T.ev(() => window.__sight.finishPlay());
    await T.until(() => !!window.__sight.selfCheck(), null, 15000, "彈完沒有出現自我檢查");
    await T.step("彈完(測試掛鉤 finishPlay)→ 自我檢查", null, [() => !document.getElementById("s-selfCheck").hidden, "自我檢查沒有出現"]);
    await T.step("勾一項自我檢查", () => T.tap("#s-selfCheck button[data-i]"));
    T.view(VIEWS.ear);
    await T.step("點「聽力」", () => T.tap('#subSeg [data-v="ear"]'));
    await T.step("按「隨機抽一題」", () => T.tap("#e-drawBtn"), [() => !!window.__ear.cur, "隨機抽一題沒有出題"]);
  } }
};
// @app-end

const RUNS = {
  "iphone-390": { viewport: { width: 390, height: 844 }, lang: "zh" },
  "fold-280": { viewport: { width: 280, height: 653 }, lang: "zh" },
  "iphone-land": { viewport: { width: 844, height: 390 }, lang: "zh" },
  "en-390": { viewport: { width: 390, height: 844 }, lang: "en" }
};
// 今日練習的題目畫面:底部按鈕列的主要按鈕整段流程比(top、left、寬)
const TODAY = { on: SEL.mod + ".daily-on", title: SEL.title, play: SEL.play, status: SEL.step + " :is(.daily-status, .q-status, [id$='-status'])", prim: SEL.step + " .daily-cta .daily-main", whole: true };
const FAST = process.env.FAST !== "0";
const LEVELS_PER_SEG = 2;   // 一段最多過幾關就按「下一段 ›」(加速的時候播放秒數很少,過關會一直接下一關)
const OUT = path.resolve(process.env.SHOTS || new URL("./out/newbie", import.meta.url).pathname);
fs.mkdirSync(OUT, { recursive: true });
const only = (process.env.ONLY || process.argv[2] || "").split(",").filter(Boolean);
const runs = Object.entries(RUNS).filter(([n]) => !only.length || only.includes(n));
const flowPick = (process.env.FLOW || "").split(",").filter(Boolean);
const flows = ["today", ...Object.keys(FLOWS)].filter(f => !flowPick.length || flowPick.includes(f));
const wait = ms => new Promise(r => setTimeout(r, ms));

/* 頁面裡:量這一刻的畫面(給 7 條檢查用);F = 現在的題目畫面(VIEWS / TODAY;null = 還不在題目畫面) */
function measure([F, NAV]){
  F = F || {};
  const vis = e => { if (!e || !e.getClientRects().length) return false; const cs = getComputedStyle(e); return cs.visibility !== "hidden" && +cs.opacity > 0.05 && !e.closest("[hidden], [inert], [aria-hidden='true']"); };
  const R = e => { const b = e.getBoundingClientRect(); return { top: b.top, left: b.left, width: b.width, height: b.height, bottom: b.bottom, right: b.right }; };
  const name = e => (e.getAttribute("aria-label") || e.textContent || e.id || e.className || "").trim().replace(/\s+/g, " ").slice(0, 24);
  const all = sel => (sel ? [...document.querySelectorAll(sel)].filter(vis) : []);
  // 頂欄底(header 與黏在上面的子項目列)、底部(分頁列 / 底部按鈕列頂)、左邊分頁列(手機橫式)
  const head = document.querySelector("header"), bar = document.getElementById("tabbar");
  let top = 0;
  for (const e of [head, document.getElementById("subnav")]) if (vis(e)) { const cs = getComputedStyle(e.closest("header") || e); if (/fixed|sticky/.test(cs.position)) top = Math.max(top, e.getBoundingClientRect().bottom); }
  const bb = vis(bar) ? bar.getBoundingClientRect() : null;
  const sideBar = bb && bb.height > innerHeight / 2 && bb.right < innerWidth / 2;
  let bottom = bb && !sideBar ? bb.top : innerHeight, left = sideBar ? bb.right : 0;
  const cta = [...document.querySelectorAll(".daily-cta")].find(vis);
  const ctaFixed = cta && getComputedStyle(cta).position === "fixed";
  const contentBottom = ctaFixed ? Math.min(bottom, cta.getBoundingClientRect().top) : bottom;
  const modal = [...document.querySelectorAll(".modal")].find(vis);
  // 看得到、沒被蓋住:在可見範圍裡,而且中心點 elementFromPoint 是它自己(或裡面的東西)
  const seen = (e, lo = top, hi = contentBottom) => {
    const b = e.getBoundingClientRect(); if (!b.width || !b.height) return false;
    const chrome = e.closest("header, #tabbar, .daily-cta, .modal");
    const T = chrome ? 0 : lo, B = chrome ? (e.closest(".daily-cta") ? bottom : innerHeight) : hi, L = chrome ? 0 : left;
    if (b.top < T - 1 || b.bottom > B + 1 || b.left < L - 1 || b.right > innerWidth + 1) return false;
    const h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return !!h && (h === e || e.contains(h) || h.contains(e));
  };
  // 1 有下一步(流程另外列的 next:次要的「下一題」、作答區也算)
  const scope = modal || document;
  const prim = [...scope.querySelectorAll(".btn.primary, .daily-main")].filter(e => vis(e) && !e.disabled);
  const primSeen = prim.filter(e => seen(e));
  const nextSeen = all(F.next).filter(e => !e.disabled && seen(e) && (!modal || modal.contains(e)));
  const statusSel = ".daily-status, .q-status, [id$='-status']" + (F.status ? ", " + F.status : "");
  const status = [...document.querySelectorAll(statusSel)].filter(vis);
  const statusSeen = status.filter(e => seen(e) && /按|Tap|Press/.test(e.textContent));
  // 2 這個畫面的主要按鈕(最後一顆看得到的;固定在畫面上的用畫面座標,其他用頁面座標:App 自己捲動不算跳)
  const on = all(F.on).length > 0;
  const main = all(F.prim).pop() || null;
  let mainR = null;
  if (main) {
    let fx = false; for (let p = main; p && p !== document.body; p = p.parentElement) if (getComputedStyle(p).position === "fixed") { fx = true; break; }
    const r = R(main), dy = fx ? 0 : scrollY;
    mainR = { top: r.top + dy, left: r.left, width: r.width, right: r.right, name: name(main) };
  }
  let busy = false; try { busy = !!(F.busy && (0, eval)(F.busy)); } catch (e) { /* 元素還沒有 */ }
  // 3、4 題目卡標題與 ▶
  const title = F.title ? document.querySelector(F.title) : null, play = F.play ? document.querySelector(F.play) : null;
  const tR = vis(title) ? R(title) : null, pR = vis(play) ? R(play) : null;
  const st = F.status ? all(F.status)[0] : null;
  // 1b 狀態句叫你按 ▶(「按 ▶ 對照」),▶ 要看得到(今日練習底部按鈕寫著 ▶ 也算)
  const playAsk = (F.status ? all(F.status) : []).some(e => /按 ?▶|(Tap|Press) ▶|▶ to /.test(e.textContent));
  const playSeen = (!!play && vis(play) && seen(play)) || all(".daily-main").some(e => /▶/.test(e.textContent) && seen(e));
  // 5 同一句話出現兩次:有自己的文字的元素,切成一句一句
  const seenText = new Map();
  for (const e of document.querySelectorAll("main *, #subnav *, .modal *")) {
    if (!vis(e) || e.closest("#srLive, .sr-only, svg, script, style, button, [role='button'], #tabbar")) continue;   // 按鈕上的字不是句子(狀態句寫「按「穩了」」本來就會跟按鈕同字)
    if (![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const b = e.getBoundingClientRect(); if (b.bottom < 0 || b.top > innerHeight) continue;   // 只算畫面裡的
    const own = [...e.childNodes].map(n => (n.nodeType === 3 ? n.textContent : n.nodeType === 1 && getComputedStyle(n).display.startsWith("inline") ? n.textContent : "\n")).join("");
    const parts = new Set(own.split(/[\n。!?!?;]|\.\s/).map(s => s.replace(/\s+/g, " ").trim()).filter(s => s.length >= 3 && /[\p{L}]/u.test(s)));
    for (const s of parts) seenText.set(s, (seenText.get(s) || 0) + 1);
  }
  const dup = [...seenText].filter(([, n]) => n >= 2).map(([s, n]) => `「${s.slice(0, 20)}」×${n}`);
  // 6 主要導覽 ≥ 44
  const small = [];
  // 點擊區 = 按鈕本身 + 用 ::before / ::after(position:absolute、負的 inset)伸出去的範圍(app.css 主導覽「看起來 32、點擊區伸到 44」的做法)
  const hit = e => {
    const b = e.getBoundingClientRect(); let w = b.width, h = b.height;
    for (const ps of ["::before", "::after"]) {
      const cs = getComputedStyle(e, ps); if (cs.content === "none" || cs.position !== "absolute") continue;
      const n = v => (v.endsWith("px") ? parseFloat(v) : 0), t = n(cs.top), btm = n(cs.bottom), l = n(cs.left), r = n(cs.right);
      w = Math.max(w, b.width - Math.min(l, 0) - Math.min(r, 0)); h = Math.max(h, b.height - Math.min(t, 0) - Math.min(btm, 0));
    }
    return { w, h };
  };
  for (const sel of NAV) for (const e of document.querySelectorAll(sel)) if (vis(e)) { const b = hit(e); if (b.w < 43.5 || b.h < 43.5) small.push(`${name(e)} ${Math.round(b.w)}×${Math.round(b.h)}`); }
  // 7 截成「…」
  const clipped = [];
  for (const e of document.querySelectorAll("body *")) {
    if (!vis(e) || !e.textContent.trim()) continue;
    const cs = getComputedStyle(e); if (cs.textOverflow !== "ellipsis" || cs.overflow === "visible") continue;
    if (e.scrollWidth > e.clientWidth + 1) clipped.push(name(e));
  }
  return {
    next: primSeen.length ? "btn" : statusSeen.length ? "status" : nextSeen.length ? "next" : null,
    primHidden: prim.filter(e => !seen(e)).map(name).slice(0, 2),
    on, main: mainR, busy, playAsk, playSeen,
    // 手機橫放播放中:樂譜卡貼在頂欄下、放大到滿版,蓋過標題是設計(停止在底部按鈕;PD 用 body.land-play,DD 路線段把鼓譜卡捲到頂欄下)
    landPlay: document.body.classList.contains("land-play") || (innerHeight <= 500 && innerWidth > innerHeight && (() => { const sc = [...document.querySelectorAll("#t-scoreCard, #t-rScoreCard")].find(e => e.offsetParent); return !!sc && Math.abs(sc.getBoundingClientRect().top - top) < 16; })()),   // 手機橫放播放中:樂譜放大到滿版、蓋過標題是設計(停止在底部按鈕)
    title: tR, titleDoc: tR ? tR.top + scrollY : null, titleText: title ? title.textContent.trim() : "", play: pR, top, contentBottom,   // titleDoc:頁面上的位置(App 有意的自動捲動不算「跳」)
    titleOk: !tR || (tR.top >= top - 0.5 && tR.bottom <= contentBottom + 0.5), playOk: !pR || (pR.top >= top - 0.5 && pR.bottom <= contentBottom + 0.5),
    // 只切到一半(橫跨頂欄底 / 畫面底):使用者自己捲下去點東西(例如譜下面的難度回饋)以後,標題整個在畫面外是正常的,切一半才算
    titleCut: !!tR && ((tR.top < top - 0.5 && tR.bottom > top + 0.5) || (tR.top < contentBottom - 0.5 && tR.bottom > contentBottom + 0.5)),
    playCut: !!pR && ((pR.top < top - 0.5 && pR.bottom > top + 0.5) || (pR.top < contentBottom - 0.5 && pR.bottom > contentBottom + 0.5)),
    statusTop: st ? R(st).top : null, statusText: st ? st.textContent.trim() : "",
    dup, small, clipped
  };
}

let bad = 0, warn = 0;
const kinds = new Map();   // 斷點種類 → { n, first }:最後一起列出來(同一個問題每一步都會再記一次)
for (const [rname, rc] of runs) {
  const h = await open({ viewport: rc.viewport, mobile: true, dpr: 1 });
  const { page } = h;
  let F = null, mainAt = null, n = 0, fails = 0, flow = "", scrolledTo = false;
  const m = () => page.evaluate(measure, [F, NAV]);
  /* 一步:點(或什麼都不點)→ 1.8 秒內一直量標題 / 狀態句的位置 → 檢查 7 條 + 這一步自己的 expect([頁面裡的函式, 不成立時的訊息]) */
  async function step(say, click, expect){
    n++;
    const before = await m();
    scrolledTo = false;
    if (click) {
      try { await click(); }
      catch (e) { await report(say, [`點不到:${e.message.split("\n")[0]}`], []); return false; }
    }
    const samples = [];
    const t0 = Date.now();
    do { await wait(150); samples.push(await m()); } while (Date.now() - t0 < (click ? 1800 : 300));
    const after = samples[samples.length - 1];
    // 4 版面不跳:同一個標題(文字沒換 = 沒換題)點之前到穩定的位置變動;狀態句:換成最後那句以後位置還在動(例如過關橫幅推下去又收回來)
    const range = (xs) => (xs.length ? Math.max(...xs) - Math.min(...xs) : 0);
    const sameT = samples.filter(x => x.title && x.titleText === after.titleText).map(x => x.titleDoc);
    if (before.title && before.titleText === after.titleText) sameT.push(before.titleDoc);
    const jump = range(sameT);
    const sjump = range(samples.filter(x => x.statusTop != null && x.statusText === after.statusText && x.titleText === after.titleText).map(x => x.statusTop - (x.title ? x.title.top : 0)));   // 狀態句相對標題(捲動不算)
    const errs = [], warns = [];
    if (!after.next) (/看重點|look/i.test(say) || after.busy ? warns : errs).push("看不到下一步(沒有能按的主要按鈕,狀態句也沒寫「按 …」)" + (after.primHidden.length ? `;主要按鈕被蓋住或在畫面外:${after.primHidden.join("、")}` : ""));
    if (after.on && after.playAsk && !after.playSeen && !after.busy && !after.landPlay) errs.push("狀態句寫「按 ▶」,▶ 不在畫面裡");
    if (after.on && after.main) {
      // 跟上一步比(每換一次位置記一次);今日練習整段流程比 top、left、寬,題目卡同一題比 top、右邊界
      const key = F.whole ? "" : after.titleText, ks = F.whole ? ["top", "left", "width"] : ["top", "right"];
      if (mainAt && mainAt.key === key) {
        const d = ks.map(k => Math.abs(after.main[k] - mainAt.r[k]));
        if (Math.max(...d) > 1) errs.push(`${F.whole ? "底部" : "題目卡"}主要按鈕位置跳了(${ks.map(k => `${k} ${Math.round(mainAt.r[k])}→${Math.round(after.main[k])}`).join("、")};${mainAt.r.name}→${after.main.name};狀態「${mainAt.say.slice(0, 16)}」→「${after.statusText.slice(0, 16)}」)`);
      }
      mainAt = { key, r: after.main, say: after.statusText };
    }
    if (after.on && !after.landPlay && !after.busy) {
      // 切一半一定算;整個不在畫面裡:這一步讓它離開畫面(App 自己捲走;使用者自己捲下去點東西不算)才算
      const lost = k => after[k + "Cut"] || (!after[k + "Ok"] && !scrolledTo && before[k + "Ok"]);
      if (lost("title")) errs.push(`題目卡標題被切掉 / 不在畫面裡(top ${Math.round(after.title.top)},頂欄底 ${Math.round(after.top)},底 ${Math.round(after.contentBottom)})`);
      if (lost("play")) errs.push(`▶ 被切掉 / 不在畫面裡(top ${Math.round(after.play.top)},頂欄底 ${Math.round(after.top)})`);
    }
    if (click && jump > 4) errs.push(`標題跳了 ${Math.round(jump)}px`);
    if (click && sjump > 4 && after.on) errs.push(`狀態句跳了 ${Math.round(sjump)}px(標題沒換)`);
    if (after.small.length) errs.push(`點擊區 < 44:${after.small.slice(0, 4).join("、")}${after.small.length > 4 ? ` 等 ${after.small.length} 個` : ""}`);
    if (after.clipped.length) errs.push(`文字被截成「…」:${after.clipped.slice(0, 3).join("、")}`);
    if (after.dup.length) warns.push(`同一句話重複:${after.dup.slice(0, 3).join("、")}`);
    if (expect && !(await page.evaluate(expect[0]).catch(() => false))) errs.push(expect[1]);
    await report(say, errs, warns);
    return true;
  }
  async function report(say, errs, warns){
    if (warns.length) warn++;
    const tag = `${rname} ${flow}`;
    if (errs.length) {
      fails++; bad++;
      for (const e of errs) { const k = e.replace(/[(:].*$/, "").replace(/\d+(?=px)/g, "n"), o = kinds.get(k) || { n: 0, first: `${tag} 第 ${n} 步「${say}」` }; o.n++; kinds.set(k, o); }
      const f = path.join(OUT, `${APP}-${rname}-${flow}-${String(n).padStart(2, "0")}.png`);
      await page.screenshot({ path: f }).catch(() => {});
      console.log(`✗ ${tag.padEnd(17)} ${String(n).padStart(2)} ${say}:${errs.join(";")}${warns.length ? ";⚠ " + warns.join(";") : ""}(${path.relative(process.cwd(), f)})`);
    } else console.log(`${warns.length ? "⚠" : "✓"} ${tag.padEnd(17)} ${String(n).padStart(2)} ${say}${warns.length ? ":" + warns.join(";") : ""}`);
  }
  // 點:要點的東西不在畫面裡(使用者得自己捲下去)→ 記下來(這一步只查標題 / ▶ 有沒有切一半)
  const tap = async sel => {
    const loc = page.locator(sel).filter({ visible: true }).first();
    if (!(await loc.evaluate(e => { const b = e.getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight; }, null, { timeout: 5000 }).catch(() => true))) scrolledTo = true;
    return loc.tap({ timeout: 5000 });
  };
  // 點頁面裡挑出來的元素(fn 在頁面裡執行、回傳元素;例如「對的琴鍵」)
  const tapPick = async (fn, arg) => {
    const ok = await page.evaluate(([src, a]) => { document.querySelectorAll("[data-nb-pick]").forEach(e => e.removeAttribute("data-nb-pick")); const e = (0, eval)("(" + src + ")")(a); if (e) e.setAttribute("data-nb-pick", "1"); return !!e; }, [fn.toString(), arg]);
    if (!ok) throw new Error("找不到要點的東西(" + fn.toString().slice(0, 40) + ")");
    return tap("[data-nb-pick='1']");
  };
  const until = async (fn, arg, ms, what) => { try { await page.waitForFunction(fn, arg, { timeout: ms || 15000 }); } catch (e) { throw new Error(what || "等不到"); } };
  // 給 @app 流程的工具
  const T = { page, rc, step, report, tap, tapPick, until, ev: (fn, arg) => page.evaluate(fn, arg), view: v => { F = v; mainAt = null; } };
  const st = () => page.evaluate(([hookSrc, step]) => {
    const t = (0, eval)("(" + hookSrc + ")")(), d = t && t.dseg, main = document.querySelector(step + " .daily-cta .daily-main");
    const on = !document.querySelector(step).hidden;
    const lv = d ? (d.level && d.level.id) || d.lv || null : null;   // 現在這一關(過關接下一關會換)
    return { on, k: d && d.k, i: d ? d.i : null, lv,
      mode: main && !main.hidden ? main.dataset.mode : null, ready: !!(t && t.dcard && t.dcard.isReady), label: main ? main.textContent.trim() : "" };
  }, [hook.toString(), SEL.step]);

  /* 段落一路練到「結束今天」:▶ 跟著…一輪 → 播過一輪 → 做到了 / 穩了;一段最多過 LEVELS_PER_SEG 關就按進度那一行的「下一段 ›」 */
  async function practise(tag){
    let guard = 0, passes = 0, lastSeg = null, lastLv = null;
    while (guard++ < 80) {
      const s = await st();
      if (!s.on) return true;   // 練完卡
      if (s.i !== lastSeg) { lastSeg = s.i; lastLv = s.lv; passes = 0; }
      else if (s.lv !== lastLv) { passes++; lastLv = s.lv; }
      if (s.mode === "next") { await step(`${tag}第 ${s.i + 1} 段:按「${s.label}」`, () => tap(SEL.step + " .daily-cta .daily-main")); continue; }
      if (passes >= LEVELS_PER_SEG && s.mode !== "stop") { await step(`${tag}第 ${s.i + 1} 段:過了 ${passes} 關,按進度那一行的「下一段 ›」`, () => tap("#subnav .daily-next")); continue; }
      if (s.mode === "play") {
        await step(`${tag}第 ${s.i + 1} 段(${s.k} ${s.lv || ""}):按「${s.label}」`, () => tap(SEL.step + " .daily-cta .daily-main"));
        // 等開始播(整組鼓 / 鋼琴聲音載入)→ 播過一輪
        const t0 = Date.now();
        while (Date.now() - t0 < 30000) { const x = await st(); if (x.mode !== "play") break; await wait(200); }
        if (FAST) { await wait(1200); await page.evaluate(hookSrc => { const t = (0, eval)("(" + hookSrc + ")")(); if (!t.dcard.isReady) t.dcard.ready(true); }, hook.toString()); }
        else { const t1 = Date.now(); while (Date.now() - t1 < 60000) { const x = await st(); if (x.ready) break; await wait(300); } }
        await wait(800);   // 剛換字 0.7 秒內再按不算(dailycard)
        await step(`${tag}第 ${s.i + 1} 段:播過一輪(「${OK_WORD[rc.lang === "en" ? 1 : 0]}」亮了)`, null);
        continue;
      }
      if (s.mode === "ok") { await step(`${tag}第 ${s.i + 1} 段:按「${s.label}」`, () => tap(SEL.step + " .daily-cta .daily-main")); continue; }
      if (s.mode === "stop") { await page.evaluate(hookSrc => { const t = (0, eval)("(" + hookSrc + ")")(); t.dcard.ready(true); }, hook.toString()); await wait(800); continue; }
      await report(`${tag}段落:底部按鈕列不見了(${JSON.stringify(s)})`, ["沒有底部主要按鈕"], []); return false;
    }
    await report(`${tag}練不完(80 步)`, ["一直沒有練完"], []); return false;
  }
  async function today(){
    T.view(TODAY);
    await step("按「開始練習」→ 技巧的今日卡", () => tap(SEL.start));
    await step("按「開始今天的練習」", () => tap(SEL.card + " .daily-btn"));
    if (await practise("")) {
      await step("練完卡(主要 = 再練一下)", null);
      await step("按「再練一下」", () => tap(SEL.card + " .daily-more"));
      if (await practise("再練:")) {
        await step("打開「路線」", () => tap(SEL.card + " .daily-road-btn"));
        await step("點一關看重點", () => tap(SEL.card + " .road-ls:not([hidden]) .road-lb"));
      }
    }
  }

  const before = { fails: 0, n: 0 };
  for (const fl of flows) {
    flow = fl; n = 0; F = null; mainAt = null; before.fails = fails;
    // 每段流程都從全新的使用者開始(清空 localStorage;流程的 store = 測試前先放好的設定,例如麥克風關掉)
    const store = fl === "today" ? null : FLOWS[fl].store;
    await page.evaluate(([lk, lang, store]) => { localStorage.clear(); localStorage.setItem(lk, lang); for (const [k, v] of Object.entries(store || {})) localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)); }, [LANG_KEY, rc.lang, store]);
    await page.reload(); await page.waitForFunction(() => window.__stageReady >= 1, null, { timeout: 30000 }); await page.waitForTimeout(900);
    try {
      await step("第一次打開(歡迎)", null);
      if (fl === "today") await today(); else await FLOWS[fl].run(T);
    } catch (e) { await report("中途出錯", [e.message.split("\n")[0]], []); }
    console.log(`${fails > before.fails ? "✗" : "✓"} ${rname} ${fl}:${n} 步,${fails - before.fails} 處斷點`);
  }
  if (h.errors.length) { bad++; fails++; console.log(`✗ ${rname} 頁面錯誤:${h.errors.slice(0, 3).join(" | ")}`); }
  console.log(`${fails ? "✗" : "✓"} ${rname}:${fails} 處斷點`);
  await h.close();
}
if (kinds.size) { console.log("斷點種類:"); for (const [k, o] of kinds) console.log(`  ${k}:${o.n} 次(第一次:${o.first})`); }
console.log(bad ? `✗ ${bad} 處斷點(${APP};截圖在 ${path.relative(process.cwd(), OUT)})` + (warn ? `;⚠ ${warn} 步有重複的句子` : "") : `✓ 新手從頭到尾每一步都接得上(${APP})` + (warn ? `;⚠ ${warn} 步有重複的句子` : ""));
process.exit(bad ? 1 : 0);
