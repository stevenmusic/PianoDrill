// 新手從頭走到尾(兩個 App 同一份,@app-begin … @app-end 放各自的選擇器與用語;tools/test/sync.json markers):
// 2026-11 使用者:「每個步驟的銜接性是最重要的」。清空 localStorage、照真人點擊走一遍:
//   第一次打開 → 開始練習 → 技巧今日卡 → 開始今天的練習 → 每一段(底部主要按鈕 ▶ 跟著…一輪 → 播過一輪 → 做到了 / 穩了 → 到過關;
//   過關接下一關 / 下一段)→ 結束今天 → 練完卡 → 再練一下 → 結束 → 路線 → 點一關。
// 每一下點完、畫面穩定後檢查(✗ = 斷點,⚠ = 只記警告):
//   1 有下一步:看得到(在畫面裡、沒被頂欄 / 分頁列 / 底部按鈕列蓋住:中心點 elementFromPoint 是它)一顆能按的主要按鈕,或狀態句寫著「按 …」
//   2 段落進行中底部主要按鈕(.daily-cta .daily-main)每一步位置一樣(±1px)
//   3 題目卡標題與 ▶ 整個看得到(top ≥ 頂欄底、bottom ≤ 底部按鈕列 / 分頁列頂)
//   4 版面不跳:點完 1.8 秒內(含過關橫幅)題目卡標題、狀態句的位置變動 ≤ 4px(標題文字換了 = 換題,不算)
//   5 ⚠ 同一句話(例如「過關 ✓」)在看得到的文字裡出現 ≥ 2 次(按鈕上的字不算)
//   6 主要導覽(子項目分段鈕、今日練習那一行、底部按鈕列、分頁列)的按鈕 ≥ 44 × 44
//   7 沒有文字被截成「…」(text-overflow 生效:scrollWidth > clientWidth)
// 用法:node tools/test/newbie.mjs(中文 iphone-390、fold-280、iphone-land + 英文 iphone-390);ONLY=fold-280,en-390 只跑幾輪;
//   FAST=0 真的等播滿一輪(預設用測試掛鉤 dcard.ready(true) 代替「播過一輪」那幾秒,點擊照樣是真的點);SHOTS=資料夾 失敗截圖(預設 tools/test/out/newbie)
// 改今日練習、版面、流程一定要跑
import { open } from "./harness.mjs";
import fs from "node:fs";
import path from "node:path";

// @app-begin:App 專屬的選擇器、用語、測試掛鉤
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
// @app-end

const RUNS = {
  "iphone-390": { viewport: { width: 390, height: 844 }, lang: "zh" },
  "fold-280": { viewport: { width: 280, height: 653 }, lang: "zh" },
  "iphone-land": { viewport: { width: 844, height: 390 }, lang: "zh" },
  "en-390": { viewport: { width: 390, height: 844 }, lang: "en" }
};
const FAST = process.env.FAST !== "0";
const LEVELS_PER_SEG = 2;   // 一段最多過幾關就按「下一段 ›」(加速的時候播放秒數很少,過關會一直接下一關)
const OUT = path.resolve(process.env.SHOTS || new URL("./out/newbie", import.meta.url).pathname);
fs.mkdirSync(OUT, { recursive: true });
const only = (process.env.ONLY || process.argv[2] || "").split(",").filter(Boolean);
const runs = Object.entries(RUNS).filter(([n]) => !only.length || only.includes(n));
const wait = ms => new Promise(r => setTimeout(r, ms));

/* 頁面裡:量這一刻的畫面(給 7 條檢查用) */
function measure([SEL, NAV]){
  const vis = e => { if (!e || !e.getClientRects().length) return false; const cs = getComputedStyle(e); return cs.visibility !== "hidden" && +cs.opacity > 0.05 && !e.closest("[hidden], [inert], [aria-hidden='true']"); };
  const R = e => { const b = e.getBoundingClientRect(); return { top: b.top, left: b.left, width: b.width, height: b.height, bottom: b.bottom, right: b.right }; };
  const name = e => (e.getAttribute("aria-label") || e.textContent || e.id || e.className || "").trim().replace(/\s+/g, " ").slice(0, 24);
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
  // 1 有下一步
  const scope = modal || document;
  const prim = [...scope.querySelectorAll(".btn.primary, .daily-main")].filter(e => vis(e) && !e.disabled);
  const primSeen = prim.filter(e => seen(e));
  const status = [...document.querySelectorAll(".daily-status, .q-status, [id$='-status']")].filter(vis);
  const statusSeen = status.filter(e => seen(e) && /按|Tap/.test(e.textContent));
  // 2 底部主要按鈕
  const main = cta ? cta.querySelector(".daily-main") : null;
  const mainR = main && vis(main) ? R(main) : null;
  // 3、4 題目卡標題與 ▶
  const mod = document.querySelector(SEL.mod), dailyOn = !!(mod && mod.classList.contains("daily-on"));
  const title = document.querySelector(SEL.title), play = document.querySelector(SEL.play);
  const tR = vis(title) ? R(title) : null, pR = vis(play) ? R(play) : null;
  const st = status.find(e => e.closest(SEL.step));
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
    next: primSeen.length ? "btn" : statusSeen.length ? "status" : null,
    primHidden: prim.filter(e => !seen(e)).map(name).slice(0, 2),
    dailyOn, main: mainR, mainMode: main ? main.dataset.mode : null,
    // 手機橫放播放中:樂譜卡貼在頂欄下、放大到滿版,蓋過標題是設計(停止在底部按鈕;PD 用 body.land-play,DD 路線段把鼓譜卡捲到頂欄下)
    landPlay: document.body.classList.contains("land-play") || (innerHeight <= 500 && innerWidth > innerHeight && (() => { const sc = [...document.querySelectorAll("#t-scoreCard, #t-rScoreCard")].find(e => e.offsetParent); return !!sc && Math.abs(sc.getBoundingClientRect().top - top) < 16; })()),   // 手機橫放播放中:樂譜放大到滿版、蓋過標題是設計(停止在底部按鈕)
    title: tR, titleDoc: tR ? tR.top + scrollY : null, titleText: title ? title.textContent.trim() : "", play: pR, top, contentBottom,   // titleDoc:頁面上的位置(App 有意的自動捲動不算「跳」)
    titleOk: !tR || (tR.top >= top - 0.5 && tR.bottom <= contentBottom + 0.5), playOk: !pR || (pR.top >= top - 0.5 && pR.bottom <= contentBottom + 0.5),
    statusTop: st ? R(st).top : null, statusText: st ? st.textContent.trim() : "",
    dup, small, clipped
  };
}

let bad = 0, warn = 0;
const kinds = new Map();   // 斷點種類 → { n, first }:最後一起列出來(同一個問題每一步都會再記一次)
for (const [rname, rc] of runs) {
  const h = await open({ viewport: rc.viewport, mobile: true, dpr: 1 });
  const { page } = h;
  await page.evaluate(([lk, lang]) => { localStorage.clear(); localStorage.setItem(lk, lang); }, [LANG_KEY, rc.lang]);
  await page.reload(); await page.waitForFunction(() => window.__stageReady >= 1, null, { timeout: 30000 }); await page.waitForTimeout(900);
  const m = () => page.evaluate(measure, [SEL, NAV]);
  let ctaAt = null, n = 0, fails = 0;
  /* 一步:點(或什麼都不點)→ 1.8 秒內一直量標題 / 狀態句的位置 → 檢查 7 條 */
  async function step(say, click){
    n++;
    const before = await m();
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
    if (!after.next) (/看重點|look/i.test(say) ? warns : errs).push("看不到下一步(沒有能按的主要按鈕,狀態句也沒寫「按 …」)" + (after.primHidden.length ? `;主要按鈕被蓋住或在畫面外:${after.primHidden.join("、")}` : ""));
    if (after.dailyOn && after.main) {
      // 跟上一步比(每換一次位置記一次)
      if (ctaAt) { const d = ["top", "left", "width"].map(k => Math.abs(after.main[k] - ctaAt[k])); if (Math.max(...d) > 1) errs.push(`底部主要按鈕位置跳了(top ${Math.round(ctaAt.top)}→${Math.round(after.main.top)}、left ${Math.round(ctaAt.left)}→${Math.round(after.main.left)}、寬 ${Math.round(ctaAt.width)}→${Math.round(after.main.width)})`); }
      ctaAt = after.main;
    }
    if (after.dailyOn && !after.landPlay) {
      if (!after.titleOk) errs.push(`題目卡標題被切掉 / 不在畫面裡(top ${Math.round(after.title.top)},頂欄底 ${Math.round(after.top)},底 ${Math.round(after.contentBottom)})`);
      if (!after.playOk) errs.push(`▶ 被切掉 / 不在畫面裡(top ${Math.round(after.play.top)},頂欄底 ${Math.round(after.top)})`);
    }
    if (click && jump > 4) errs.push(`標題跳了 ${Math.round(jump)}px`);
    if (click && sjump > 4 && after.dailyOn) errs.push(`狀態句跳了 ${Math.round(sjump)}px(標題沒換)`);
    if (after.small.length) errs.push(`點擊區 < 44:${after.small.slice(0, 4).join("、")}${after.small.length > 4 ? ` 等 ${after.small.length} 個` : ""}`);
    if (after.clipped.length) errs.push(`文字被截成「…」:${after.clipped.slice(0, 3).join("、")}`);
    if (after.dup.length) warns.push(`同一句話重複:${after.dup.slice(0, 3).join("、")}`);
    await report(say, errs, warns);
    return true;
  }
  async function report(say, errs, warns){
    if (warns.length) warn++;
    if (errs.length) {
      fails++; bad++;
      for (const e of errs) { const k = e.replace(/[(:].*$/, "").replace(/\d+(?=px)/g, "n"), o = kinds.get(k) || { n: 0, first: `${rname} 第 ${n} 步「${say}」` }; o.n++; kinds.set(k, o); }
      const f = path.join(OUT, `${APP}-${rname}-${String(n).padStart(2, "0")}.png`);
      await page.screenshot({ path: f }).catch(() => {});
      console.log(`✗ ${rname.padEnd(11)} ${String(n).padStart(2)} ${say}:${errs.join(";")}${warns.length ? ";⚠ " + warns.join(";") : ""}(${path.relative(process.cwd(), f)})`);
    } else console.log(`${warns.length ? "⚠" : "✓"} ${rname.padEnd(11)} ${String(n).padStart(2)} ${say}${warns.length ? ":" + warns.join(";") : ""}`);
  }
  const tap = sel => page.locator(sel).filter({ visible: true }).first().tap({ timeout: 5000 });
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

  try {
    await step("第一次打開(歡迎)", null);
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
  } catch (e) { await report("中途出錯", [e.message.split("\n")[0]], []); }
  if (h.errors.length) { bad++; fails++; console.log(`✗ ${rname} 頁面錯誤:${h.errors.slice(0, 3).join(" | ")}`); }
  console.log(`${fails ? "✗" : "✓"} ${rname}:${n} 步,${fails} 處斷點`);
  await h.close();
}
if (kinds.size) { console.log("斷點種類:"); for (const [k, o] of kinds) console.log(`  ${k}:${o.n} 次(第一次:${o.first})`); }
console.log(bad ? `✗ ${bad} 處斷點(${APP};截圖在 ${path.relative(process.cwd(), OUT)})` + (warn ? `;⚠ ${warn} 步有重複的句子` : "") : `✓ 新手從頭到尾每一步都接得上(${APP})` + (warn ? `;⚠ ${warn} 步有重複的句子` : ""));
process.exit(bad ? 1 : 0);
