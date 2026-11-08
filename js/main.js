/* 外框(PianoDrill / DrumDrill 共用,`@app-begin … @app-end` 以外兩邊一模一樣,tools/test/sync.mjs 檢查):
   頂欄、子項目分段鈕、底部分頁、共用的考試設定(系統 + 級數設一次,三個模組都照這一級)、主題、語言、第一次打開的問題。
   三個模組(js/tech、js/sight、js/ear)各自負責自己的卡片;外框只告訴它們「現在顯示哪一頁、考哪一級、語言換了」。
   每個模組匯出同一組函式:start(ctx)、enter(tab)、leave()、setExam(exam)、relang()、examStatus()、onKey(e)
   - ctx = { exam, examChanged(), gradeLabel(g, sys), showView(view, sub), setSubActive(on, view), subBar(el, view), subActive(view) } + 各 App 自己的(@app 區段的 appCtx(),
     例如 DrumDrill 的 examData(sys));模組不能 import 這個檔案。appCtx 最多等 APP_CTX_MS(4 秒):逾時先不給
     (模組要能處理 ctx 裡還沒有這些欄位),之後載好再補進同一個 ctx,通知每個模組重畫(onCtx(),沒有就 relang());
     不呼叫 setExam:考試沒變,不能把進行中的題目、模擬考洗掉
   - leave() 停止播放與計時(題目保留);enter(tab) 有題目就不重新出題
   - 切到背景(visibilitychange / pagehide)或聲音被系統打斷:目前的模組 leave() + 全部停止;回到前景再 enter() */
import { tr, T, applyStatic, setLang, getLang, onLang } from "./shared/i18n.js";
import * as audio from "./shared/audio.js";
import { exportAll, validate, importAll, MAX_BYTES } from "./shared/backup.js";
import { build as buildDigest } from "./shared/digest.js";
import { dayKey, neverPracticed } from "./shared/practicelog.js";
import * as tech from "./tech/app.js";
import * as sight from "./sight/app.js";
import * as ear from "./ear/app.js";

const $ = id => document.getElementById(id);
const MODS = { tech, sight, ear };

// @app-begin
/* ── 外框的設定(localStorage;讀不到就用預設值)── */
const KEY = "pianodrill.v1";
const S = (() => {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
  if (saved && (typeof saved !== "object" || Array.isArray(saved))) saved = {};   // 手改過的備份檔:整份不是物件 → 當作空的(不重問第一次的問題)
  if (!saved) {   // 第一次打開:同一個網域上用過舊工具(FingerDrill / EarDrill)的,沿用主題與考試設定
    saved = {};
    try {
      for (const k of ["fingerdrill.v1", "eardrill.v1"]) {
        const o = JSON.parse(localStorage.getItem(k) || "null"); if (!o) continue;
        if (o.theme && !saved.theme) saved.theme = o.theme;
        if (o.exam && !o.exam.auto && !saved.exam) { saved.exam = { system: o.exam.system, grade: o.exam.grade }; saved.onboarded = true; }
      }
    } catch (e) {}
  }
  const sub0 = saved.sub && typeof saved.sub === "object" && !Array.isArray(saved.sub) ? saved.sub : {};
  const s = { view: "tech", exam: null, onboarded: false, theme: "dark", ...saved,
    sub: { tech: "today", ear: "note", exam: "tech", sight: "right", ...sub0 } };   // 第一次進視奏 = 右手(階 1)
  // 讀進來消毒(手改過的備份檔):考試不是 { 系統, 級數 } → 沒選考試;分頁、子項目不是有的那幾個(下面的 SYSTEMS、SUBS)→ 預設
  const ex = s.exam;
  if (!(ex && typeof ex === "object" && ["abrsm", "trinity"].includes(ex.system) && Number.isInteger(ex.grade) && ex.grade >= 0 && ex.grade <= 8)) s.exam = null;
  else s.exam = { system: ex.system, grade: ex.grade };
  if (!["tech", "sight", "ear", "exam"].includes(s.view)) s.view = "tech";
  if (!["today", "scale", "arp", "hanon"].includes(s.sub.tech)) s.sub.tech = "today";
  if (!["note", "interval", "chord"].includes(s.sub.ear)) s.sub.ear = "note";
  if (!["tech", "sight", "ear"].includes(s.sub.exam)) s.sub.exam = "tech";
  // 視奏分頁的子項目 = 認音 / 右手 / 左手 / 雙手(範圍階段在 js/sight/stages.js);舊版存的是級數 1–8 → 雙手
  if (!["read", "right", "left", "both"].includes(s.sub.sight)) s.sub.sight = "both";
  return s;
})();
/* ── 考試:兩個系統都是初級(0)到 8 級 ── */
const SYSTEMS = { abrsm: "ABRSM", trinity: "Trinity" };
const DEFAULT_EXAM = { system: "abrsm", grade: 1 };   // 第一次打開的問題、沒選考試時檢定分頁暫時看的(auto,不算在準備考試)
export const gradeLabel = (g, sys) => g === 0 ? tr("初級", "Initial") : tr(g + " 級", "Grade " + g);
/* 級數按鈕上的短名(檢定頁與第一次的問題的級數列):初級寫 I;aria-label 另外寫完整級名 */
const gradeShort = g => (g === 0 ? "I" : String(g));
/* 子項目分段鈕;檢定分頁三項的名稱 */
const SUBS = {
  // 技巧:第一格「今日」= 今日練習(App 帶著練;畫面設計 2026-10),其他 = 自由練習
  tech: () => [["today", tr("今日", "Today"), tr("今日練習", "Today's practice")], ["scale", tr("音階", "Scales")], ["arp", tr("琶音", "Arpeggios")], ["hanon", tr("哈農", "Hanon")]],
  // 視奏:照學習順序 認音 → 右手 → 左手 → 雙手(級數只在檢定頁設;範圍階段在視奏分頁的設定卡)
  sight: () => [["read", tr("認音", "Notes")], ["right", tr("右手", "Right")], ["left", tr("左手", "Left")], ["both", tr("雙手", "Both")]],
  ear: () => [["note", tr("單音", "Notes")], ["interval", tr("音程", "Intervals")], ["chord", tr("和弦", "Chords")]],
  exam: () => [["tech", tr("音階琶音", "Scales")], ["sight", tr("視奏", "Sight-read")], ["ear", tr("聽力", "Aural")]]
};
/* 子項目分段鈕的群組名稱(無障礙:role="group" 的 aria-label) */
const SUB_LABEL = () => ({ tech: tr("技巧項目", "Technique"), sight: tr("讀譜類別", "Reading type"), ear: tr("題型", "Question type"), exam: tr("檢定項目", "Exam section") });
/* 外框另外給模組的東西(ctx 裡;DrumDrill 用來給考試資料):PianoDrill 的模組自己讀資料,這裡沒有 */
const appCtx = async () => ({});
/* 頁尾「備份紀錄」(js/shared/backup.js):備份檔的 App 名、localStorage 的前綴(pianodrill.*)與語言 key(js/shared/i18n.js 的 LANG_KEY);name = 檔名開頭 */
const BACKUP = { app: "pianodrill", name: "PianoDrill", prefix: "pianodrill.", langKey: "pianodrill-lang" };
/* 頁尾「分享本週摘要」(js/shared/digest.js)要的資料:三個分頁的練習紀錄(各模組 localStorage 的 log)+ 這幾天今日練習過了的關卡名稱(技巧的 daily.lv[…].passed)。
   同步讀(分享面板要在點擊的當下打開);關卡名稱用 js/tech/routes.js(技巧模組本來就載入了) */
let digestRoutes = [];
import("./tech/routes.js").then(m => { digestRoutes = m.ROUTES || []; }).catch(() => {});
function digestData(days){
  const read = k => { try { const o = JSON.parse(localStorage.getItem(k) || "null"); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; } };
  const tech = read("pianodrill.tech.v1"), sight = read("pianodrill.sight.v1"), ear = read("pianodrill.ear.v1");
  const lv = tech.daily && typeof tech.daily.lv === "object" && tech.daily.lv ? tech.daily.lv : {};
  const passed = Object.entries(lv).filter(([, e]) => e && days.includes(e.passed)).sort((a, b) => (a[1].passed < b[1].passed ? -1 : 1));
  const daily = [];
  for (const [k] of passed) {
    const [r, id] = k.split("/"), R = digestRoutes.find(x => x.id === r), L = R && R.levels.find(l => l.id === id);
    if (L && L.name) daily.push(L.name);
  }
  return { mods: { tech: tech.log, sight: sight.log, ear: ear.log }, daily };
}
// @app-end
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const GRADES = [0, 1, 2, 3, 4, 5, 6, 7, 8];
/* 每個考試系統有哪幾級(現在兩個 App 的系統都是初級 0 到 8 級;PianoDrill 的 ABRSM 也有 Initial,見 data/syllabus.json)。
   換系統時目前的級數在新系統沒有 → 改成最接近的那一級 */
const gradesOf = sys => GRADES;
const validGrade = (g, sys) => { const gs = gradesOf(sys); return gs.includes(g) ? g : gs.reduce((a, b) => (Math.abs(b - g) < Math.abs(a - g) ? b : a)); };
const APP_CTX_MS = 4000;   // appCtx(App 自己的資料)最多等多久才先啟動模組
let autoExam = { ...DEFAULT_EXAM };   // 沒選考試時,檢定分頁暫時看的系統/級數
const examNow = () => S.exam ? { ...S.exam, auto: false } : { ...autoExam, auto: true };

/* ── 主題 ── */
function applyTheme(){
  const light = S.theme === "light";
  document.documentElement.classList.toggle("light", light);
  document.body.classList.toggle("light", light);
  $("themeToggle").setAttribute("aria-pressed", String(light));
  document.querySelector('meta[name="theme-color"]').content = light ? "#FBF7EE" : "#0C0A07";
}
$("themeToggle").onclick = () => { S.theme = S.theme === "light" ? "dark" : "light"; save(); applyTheme(); };
applyTheme();
applyStatic();
$("langToggle").onclick = () => setLang(getLang() === "zh" ? "en" : "zh");
/* localStorage 不能寫(私密瀏覽、空間滿):頁尾最上面一行淡字「這個瀏覽器不能存紀錄…」;能寫就不出現(App 照常用) */
const canStore = (() => { try { const k = "__store_probe"; localStorage.setItem(k, "1"); localStorage.removeItem(k); return true; } catch (e) { return false; } })();
if (!canStore) {
  const p = document.createElement("p");
  p.className = "store-warn"; p.dataset.i18n = "store.nosave"; p.setAttribute("data-i18n-pair", "");   // 中英一樣高
  const f = document.querySelector("footer"); if (f) { f.prepend(p); applyStatic(f); }
}
onLang(() => {
  renderSubnav(); renderExamCard(); tabbarLabel();
  if (!$("onboard").hidden) { fillGradeSeg($("obGradeSeg"), ob.grade, ob.system || DEFAULT_EXAM.system); obYesLabel(); }
  for (const m of Object.values(MODS)) m.relang();
});

/* ── 分段鈕 ── */
function segBind(el, get, set){
  const seg = typeof el === "string" ? $(el) : el;
  const sync = () => seg.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === String(get()))));
  seg.onclick = e => { const b = e.target.closest("button"); if (!b || b.disabled) return; set(b.dataset.v); sync(); };
  sync();
  return sync;
}
/* 手機:設定卡收成一行,點了展開(每個模組的設定卡都一樣,在這裡統一處理;檢定頁的考試卡不收起來) */
document.addEventListener("click", e => {
  const btn = e.target.closest(".setup-summary"); if (!btn) return;
  const card = btn.closest(".card"), open = !card.classList.contains("open");
  card.classList.toggle("open", open); btn.setAttribute("aria-expanded", String(open));
});
/* 設定卡展開時摘要只留卡名(下面的按鈕自己寫了狀態,不再重複;app.css 的 .sum-name):卡名 = 按鈕的 data-name「中|EN」,沒寫就是「設定」 */
function sumNames(){
  document.querySelectorAll(".setup-summary").forEach(b => {
    let n = b.querySelector(".sum-name");
    if (!n) { n = document.createElement("span"); n.className = "sum-name"; b.querySelector(".sum").after(n); }
    const [zh, en] = (b.dataset.name || "設定|Settings").split("|");
    n.textContent = tr(zh, en);
  });
}
sumNames();
onLang(sumNames);

/* 無障礙:重畫一排按鈕(innerHTML)時,原本聚焦在裡面的按鈕換成新的同一顆(不然焦點掉回 <body>,鍵盤使用者要從頭 Tab) */
function keepFocus(box, attr){
  const a = document.activeElement, v = a && box.contains(a) ? a.getAttribute(attr) : null;
  return () => { if (v != null) { const b = box.querySelector(`[${attr}="${v}"]`); if (b) b.focus({ preventScroll: true }); } };
}
/* ══ 分頁 ══ */
let curMod = null;
/* 今日練習(技巧分頁最上面的卡片)的段落不是某個子項目:進行中子項目分段鈕都不亮(模組呼叫 ctx.setSubActive(false, view));
   點任何子項目 = 這一段暫停(模組 leave() 停播放、不清題目)、分段鈕亮回來;模組 enter(tab) 時看 ctx.subActive(view) 是 true 就離開段落 */
const subOff = new Set();
function setSubActive(on, view = S.view){
  if (on) { subOff.delete(view); delete subBars[view]; } else subOff.add(view);
  if (view === S.view) renderSubnav();
}
/* 今日練習進行中:子項目列換成今日練習的那一行(進度、暫停、下一段;js/shared/dailycard.js 的 barHost 交給 ctx.subBar(el, view))。
   每個分頁各自記;換到別的分頁照那一頁自己的子項目列,回來再換回這一行 */
const subBars = {};
function subBar(el, view = S.view){
  if (el) subBars[view] = el; else delete subBars[view];
  if (view === S.view) renderSubnav();
}
function renderSubnav(){
  // 檢定分頁還沒選考試:只有考試卡(三個項目的子項目也不顯示)
  const opts = S.view === "exam" && !S.exam ? [] : SUBS[S.view]();
  $("subnav").hidden = !opts.length;
  document.body.classList.toggle("no-subnav", !opts.length);
  const keep = keepFocus($("subSeg"), "data-v");
  // 第三個欄位 = 無障礙名稱(按鈕上的字是短名時,例如「今日」→ 今日練習)
  $("subSeg").innerHTML = opts.map(([v, t, a]) => `<button data-v="${v}" aria-pressed="${!subOff.has(S.view) && S.sub[S.view] === v}"${a ? ` aria-label="${a}"` : ""}>${t}</button>`).join("");
  $("subSeg").setAttribute("aria-label", SUB_LABEL()[S.view] || "");
  keep();
  const bar = opts.length && subOff.has(S.view) ? subBars[S.view] : null;
  $("subnav").querySelectorAll(".sub-bar").forEach(x => { if (x !== bar) x.remove(); });
  if (bar && bar.parentNode !== $("subnav")) { bar.classList.add("sub-bar"); $("subnav").appendChild(bar); }
  $("subSeg").hidden = !!bar;
  $("subnav").classList.toggle("has-bar", !!bar);
  // 今日練習的段落進行中(這一頁的子項目都不亮):頁尾藏起來(app.css 的 body.daily-on)
  document.body.classList.toggle("daily-on", !!opts.length && subOff.has(S.view));
  ctaSoon();
}
$("subSeg").onclick = e => {
  const b = e.target.closest("button[data-v]"); if (!b) return;
  const paused = subOff.has(S.view);   // 今日練習的段落進行中:點哪一個(包括原本那一類)都是暫停、回到那一類
  if (S.sub[S.view] === b.dataset.v && !paused) return;
  if (paused) { subOff.delete(S.view); if (curMod) MODS[curMod].leave(); }
  S.sub[S.view] = b.dataset.v; save();
  showView(S.view);
  if (S.view === "exam") examScroll(b.dataset.v);
};
/* 檢定頁換項目:小畫面(折疊機、手機橫式)考試卡佔滿第一個畫面時,捲到這一項的題目卡(主要動作在裡面)或第一張卡 */
function examScroll(part){
  requestAnimationFrame(() => {
    const cards = [...$("mod-" + part).querySelectorAll(".card")].filter(c => c.getClientRects().length && !c.closest("[hidden]"));
    if (!cards.length) return;
    const head = document.querySelector("header"), top = head ? head.getBoundingClientRect().bottom : 0;
    const quiz = cards.find(c => c.classList.contains("quiz"));
    if (quiz) { const r = quiz.getBoundingClientRect(); if (r.bottom > innerHeight - 70 || r.top > innerHeight * 0.55) window.scrollTo({ top: Math.max(0, scrollY + r.top - top - 8) }); return; }
    const first = Math.min(...cards.map(c => c.getBoundingClientRect().top));
    if (first > innerHeight * 0.55) window.scrollTo({ top: Math.max(0, scrollY + first - top - 8) });
  });
}
/* 目前分頁的模組與它的子項目(檢定分頁:模組 = 檢定的子項目,tab = "exam") */
const modOf = view => (view === "exam" ? S.sub.exam : view);
const tabOf = view => (view === "exam" ? "exam" : S.sub[view] || "");
/* 切到某一頁;sub = 同時切到那一頁的某個子項目(模組要帶使用者去別的地方練時用,例如檢定清單 → 技巧的某一類) */
function showView(view, sub){
  if (sub != null) S.sub[view] = String(sub);
  S.view = view; save();
  document.querySelectorAll("#tabbar button").forEach(b => { const on = b.dataset.view === view; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
  MAIN.setAttribute("aria-labelledby", "tab-" + view);
  const exam = view === "exam";
  // 檢定分頁還沒選考試:只有考試卡(「先選考試系統和級數」),不顯示任何一級的內容(不拿預設的系統、級數充數)
  const modName = exam && !S.exam ? null : modOf(view);
  const tab = tabOf(view);
  $("examSetup").hidden = !exam;
  if (curMod && curMod !== modName) MODS[curMod].leave();
  for (const [name, m] of Object.entries(MODS)) $("mod-" + name).hidden = name !== modName;
  curMod = modName;
  document.body.classList.toggle("view-exam", exam);
  document.body.classList.toggle("view-sight", modName === "sight");
  for (const v of ["tech", "sight", "ear", "exam"]) document.body.classList.toggle("tab-" + v, v === view);   // 目前沒有樣式用到(分頁輔色 2026-11-06 拿掉,docs/DESIGN.md 第 8 節)
  renderSubnav();
  if (exam) renderExamCard();
  window.scrollTo({ top: 0 });
  if (modName) MODS[modName].enter(tab);
  balanceSoon();
  syncDigest();
}
/* ══ 寬畫面(≥ 1100):一個框、一欄(docs/DESIGN.md 第 9 節丙;以前的 balanceCols 兩欄平衡拿掉了,練習紀錄卡不再搬家,照 app.css 的 order 排)。
   版面變了(換寬度、卡片高度變了)只要重算一張練習卡的合併(syncJoin)與底部按鈕列(syncCta) */
const WIDE = matchMedia("(min-width:1100px)");
const balanceSoon = () => ctaSoon();
/* ══ 題目卡最後一行固定在畫面底部(2026-11 使用者選定;跟今日練習的 .daily-cta 一樣,分頁列正上方、位置永遠不變):
   手機(直式 ≤ 600 寬、手機橫式)目前看得到的模組裡第一張看得到的題目卡(.quiz),它最後一個有按鈕的 .q-foot / .q-last 加 .cta-bar(app.css),
   body 加 has-cta、--cta-h = 這一列的高(main 的底部留白);今日練習段落進行中(body.daily-on)照舊用 .daily-cta,不要兩條。
   狀態句、結果插進題目卡時主要按鈕不再被推動;模組自己的捲動扣掉這一列(ctaTop) */
const CTA_MQ = matchMedia("(max-width:600px), (orientation:landscape) and (max-height:500px)");
const shownEl = el => !!el && !el.closest("[hidden]") && getComputedStyle(el).display !== "none";
const hasBtn = row => [...row.querySelectorAll("button")].some(b => !b.closest("[hidden]") && b.getClientRects().length);
function syncCta(){
  let bar = null;
  if (CTA_MQ.matches && !document.body.classList.contains("daily-on")) {
    const mod = [...document.querySelectorAll(".mod")].find(m => !m.hidden);
    const quiz = mod && [...mod.querySelectorAll(".quiz")].find(q => shownEl(q) && q.getClientRects().length);
    // display:contents 的列(手機橫式技巧的 .q-last)量不到外框:看裡面有沒有看得到的按鈕
    const rows = quiz ? [...quiz.querySelectorAll(":scope > .q-foot, :scope > .q-last")].filter(r => !r.closest("[hidden]") && hasBtn(r)) : [];
    bar = rows.pop() || null;
  }
  document.querySelectorAll(".cta-bar").forEach(r => { if (r !== bar) r.classList.remove("cta-bar"); });
  if (bar && !bar.classList.contains("cta-bar")) bar.classList.add("cta-bar");
  if (document.body.classList.contains("has-cta") !== !!bar) document.body.classList.toggle("has-cta", !!bar);
  const h = bar ? Math.round(bar.getBoundingClientRect().height) + "px" : "";
  if (document.body.style.getPropertyValue("--cta-h") !== h) { if (h) document.body.style.setProperty("--cta-h", h); else document.body.style.removeProperty("--cta-h"); }
}
/* ══ 一張練習卡(2026-11 使用者選「專心練習畫面」A;docs/DESIGN.md 第 7 節):index.html 標了 data-join 的卡片,在同一欄上下相鄰(中間沒有別張看得到的卡)
   就合成一張:第一張 .j-top、中間 .j-mid、最後 .j-bot(app.css:同一塊底色、中間一條細線)。檢定頁不合;只有一張就不加 */
const JOIN = ["j-top", "j-mid", "j-bot"];
let joinSig = "";
function syncJoin(){
  const exam = document.body.classList.contains("view-exam");
  /* 播放中播放軸、譜上高亮一直改 class:看得到的卡片集合與位置沒變就不重算(不每幀量版面) */
  const sig = (exam ? "x" : "") + innerWidth + [...document.querySelectorAll(".mod:not([hidden]) [data-join]")]
    .map(el => (shownEl(el) && el.getClientRects().length ? 1 : 0) + ":" + el.offsetLeft + ":" + el.offsetTop).join(",");
  if (sig === joinSig) return;
  joinSig = sig;
  for (const mod of document.querySelectorAll(".mod")) {
    const want = new Map();
    if (!mod.hidden && !exam) {
      const items = [...mod.querySelectorAll(":scope > *, :scope > .mod-side > *, :scope > .mod-main > *")]
        .filter(el => !el.classList.contains("mod-side") && !el.classList.contains("mod-main") && shownEl(el) && el.getClientRects().length)
        .map(el => ({ el, r: el.getBoundingClientRect() }));
      const cols = new Map();
      for (const it of items) { const k = Math.round(it.r.left); if (!cols.has(k)) cols.set(k, []); cols.get(k).push(it); }
      for (const col of cols.values()) {
        col.sort((a, b) => a.r.top - b.r.top);
        let run = [];
        const flush = () => { if (run.length > 1) run.forEach((el, i) => want.set(el, i === 0 ? "j-top" : i === run.length - 1 ? "j-bot" : "j-mid")); run = []; };
        for (const it of col) { if (it.el.hasAttribute("data-join")) run.push(it.el); else flush(); }
        flush();
      }
    }
    for (const el of mod.querySelectorAll("[data-join]")) {
      const w = want.get(el) || null;
      for (const c of JOIN) if (el.classList.contains(c) !== (c === w)) el.classList.toggle(c, c === w);
    }
  }
}
let ctaRaf = 0;
function ctaSoon(){ cancelAnimationFrame(ctaRaf); ctaRaf = requestAnimationFrame(() => { syncJoin(); syncCta(); }); }
if (typeof MutationObserver !== "undefined") new MutationObserver(ctaSoon).observe(document.querySelector("main"), { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "class"] });
if (CTA_MQ.addEventListener) CTA_MQ.addEventListener("change", ctaSoon);
addEventListener("resize", ctaSoon);
if (typeof ResizeObserver !== "undefined") { const ro = new ResizeObserver(balanceSoon); document.querySelectorAll(".mod > .mod-side, .mod > .mod-main").forEach(el => ro.observe(el)); }
if (WIDE.addEventListener) WIDE.addEventListener("change", balanceSoon);
$("tabbar").onclick = e => { const b = e.target.closest("button[data-view]"); if (b) showView(b.dataset.view); };
/* 無障礙:分頁列 = tablist,<main> = tabpanel(aria-labelledby = 目前的分頁);只有選到的分頁 tabindex=0,
   ← → ↑ ↓(直式在底部、手機橫式在左邊的直欄,兩個方向都可以)、Home / End 換分頁(選到就切過去) */
const MAIN = document.querySelector("main");
MAIN.id = MAIN.id || "panel";
MAIN.setAttribute("role", "tabpanel");
const TABS = [...document.querySelectorAll("#tabbar button[data-view]")];
for (const b of TABS) { b.id = "tab-" + b.dataset.view; b.setAttribute("aria-controls", MAIN.id); }
$("tabbar").addEventListener("keydown", e => {
  const i = TABS.indexOf(e.target.closest("button[data-view]")); if (i < 0) return;
  const k = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
  if (k == null) return;
  e.preventDefault(); e.stopPropagation();   // 不要轉給模組的快捷鍵(技巧的 ↑ ↓ = 速度)
  const b = TABS[(k + TABS.length) % TABS.length];
  showView(b.dataset.view); b.focus();
});
// 手機橫式(app.css 的 orientation:landscape 且高度 ≤ 500)分頁列是左邊的直欄:aria-orientation = vertical
const TAB_VERT = matchMedia("(orientation:landscape) and (max-height:500px)");
const tabOrient = () => $("tabbar").setAttribute("aria-orientation", TAB_VERT.matches ? "vertical" : "horizontal");
tabOrient();
if (TAB_VERT.addEventListener) TAB_VERT.addEventListener("change", tabOrient); else if (TAB_VERT.addListener) TAB_VERT.addListener(tabOrient);
const tabbarLabel = () => $("tabbar").setAttribute("aria-label", tr("練習項目", "Sections"));
tabbarLabel();
$("examChip").onclick = () => showView("exam");

/* ══ 考試卡(檢定頁;不收起來):系統兩顆大鈕 + 級數一排,點一下就換 ══
   級數列(#gradeSeg、第一次的問題的 #obGradeSeg):role="group",每顆 aria-pressed;按鈕上寫短名(gradeShort:0–8,第一格 I / D),
   aria-label 寫完整級名(gradeLabel);重畫時焦點留在同一顆(keepFocus)。
   無障礙(可見字要在名稱開頭,語音控制說「點 D」才對得上):級名不是以按鈕上的字開頭、按鈕上也不是數字 → 「D (Debut)」「I 初級」 */
const gradeAria = (g, sys) => { const lab = gradeLabel(g, sys), sh = gradeShort(g, sys); return lab.startsWith(sh) || /^\d+$/.test(sh) ? lab : tr(`${sh} ${lab}`, `${sh} (${lab})`); };
function fillGradeSeg(seg, grade, sys){
  const keep = keepFocus(seg, "data-v");
  seg.innerHTML = gradesOf(sys).map(g => `<button type="button" data-v="${g}" aria-pressed="${g === grade}" aria-label="${gradeAria(g, sys)}">${gradeShort(g, sys)}</button>`).join("");
  keep();
}
const gradeOfClick = e => { const b = e.target.closest("button[data-v]"); return b && !b.disabled ? Number(b.dataset.v) : null; };
function setExam(system, grade){
  const was = !!S.exam;
  S.exam = { system, grade }; save(); pickSys = null;
  pushExam();
  if (!was && S.view === "exam") showView("exam");   // 剛選好考試:檢定分頁的內容現在才出現
}
/* 還沒選考試時,檢定頁的系統鈕、級數鈕都不亮;先點系統只記住(亮那一顆),點了級數才算選好(先點級數 = 預設的系統) */
let pickSys = null;
function pushExam(){
  const ex = examNow();
  for (const m of Object.values(MODS)) m.setExam(ex);
  renderExamCard(); renderChip();
}
const syncSystemSeg = segBind("systemSeg", () => (S.exam ? S.exam.system : pickSys), v => { if (S.exam) setExam(v, validGrade(S.exam.grade, v)); else { pickSys = v; renderExamCard(); } });
$("gradeSeg").onclick = e => { const g = gradeOfClick(e); if (g != null) setExam(S.exam ? S.exam.system : pickSys || examNow().system, g); };
function renderChip(){
  $("examChip").hidden = !S.exam;
  if (S.exam) $("examChip").textContent = `${SYSTEMS[S.exam.system]} ${gradeLabel(S.exam.grade)}`;
}
function renderExamCard(){
  const ex = examNow();
  // 已選考試:系統鈕、級數鈕亮著就是標題(不再寫一行「RSL · 3 級」);還沒選:兩排都不亮,只寫「先選考試系統和級數」
  syncSystemSeg(); fillGradeSeg($("gradeSeg"), S.exam ? ex.grade : null, S.exam ? ex.system : pickSys || ex.system);
  $("examSum").parentElement.hidden = !!S.exam;
  $("examSum").textContent = S.exam ? "" : pickSys ? tr("再選級數", "Now pick a grade") : tr("先選考試系統和級數", "Pick an exam board and grade");
  // 級數那排下面一行:只有沒選考試時寫(怎麼知道考哪一級);「推估 = …」的說明收在各項的「考試內容」裡(畫面設計 2026-10:考試卡只有系統 + 級數)
  const hint = !S.exam ? T("examHelp") : "";
  $("examHint").hidden = !hint; $("examHint").textContent = hint;
  // 以前這裡有三格進度(技巧 / 視奏 / 聽力):跟子項目列重複、又寫了練習紀錄與正確率 → 拿掉(2026-10);各項進度在自己的檢定頁(模組的 examStatus 留著,不畫)
}
/* 模組裡的進度改變了(標記通過、答題):重畫進度 */
export function examChanged(){ if (S.view === "exam") renderExamCard(); }

/* ══ 第一次打開:歡迎 →(我在準備檢定)在準備考試嗎? ══
   無障礙:對話框打開時焦點放在標題(不放 ABRSM,免得看起來像已選),Tab 才進第一顆、Tab 只在對話框 + 頂欄右邊的主題 / 語言鈕之間轉(頂欄在對話框上面,可以邊選邊換語言)、
   Esc = 「不考試,自由練習」;背景(內容、分頁列、子項目分段鈕、頂欄的考試標籤)設 inert;關掉時焦點回到打開前的地方(沒有就回到選到的分頁) */
const ob = { system: null, grade: null };   // 第一次的問題:系統、級數都不預選(跟檢定頁「沒選不亮」一樣)
// 沒選級數時「開始準備考試」不能按,按鈕上直接寫「先選級數」(點了沒反應 7 歲會以為壞了;2026-11 第 8 輪健檢;不跳視窗、一行不增高)
const obYesLabel = () => { $("obYes").textContent = ob.grade == null ? tr("先選級數", "Pick a grade first") : T("obYes"); };
let obReturn = null;
const OB_BG = () => [MAIN, $("tabbar"), $("subnav"), $("examChip")].filter(Boolean);
const OB_SEL = "button, select, [href], input, [tabindex]:not([tabindex='-1'])";
function obFocusables(){ return [...document.querySelectorAll(".header-right button"), ...$("onboard").querySelectorAll(OB_SEL)].filter(el => !el.disabled && !el.hidden && !el.inert && el.offsetParent !== null); }
function openOnboard(){
  obReturn = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
  $("onboard").hidden = false;
  for (const el of OB_BG()) el.inert = true;
  // 焦點放在標題(螢幕報讀先唸問題);不放在 ABRSM,否則焦點框看起來像已經選了(沒選考試時系統鈕都不亮)
  $("onboardTitle")?.focus();
}
function closeOnboard(){
  $("onboard").hidden = true;
  for (const el of OB_BG()) el.inert = false;
  const back = obReturn && obReturn.isConnected && !obReturn.closest("[hidden]") ? obReturn : document.querySelector('#tabbar [aria-selected="true"]');
  obReturn = null;
  if (back) back.focus({ preventScroll: true });
}
document.addEventListener("keydown", e => {
  if ($("onboard").hidden) return;
  if (e.key === "Escape") { e.preventDefault(); $("obNo").click(); return; }
  if (e.key !== "Tab") return;
  const f = obFocusables(); if (!f.length) return;
  const i = f.indexOf(document.activeElement);
  e.preventDefault();   // 每一下都自己移(頂欄右邊的鈕跟對話框在 DOM 裡不相鄰,交給瀏覽器會跑到子項目分段鈕)
  const ob0 = f.findIndex(el => $("onboard").contains(el));   // 從標題按 Tab = 對話框第一顆(ABRSM),Shift+Tab = 最後一顆
  f[i < 0 ? (e.shiftKey ? f.length - 1 : Math.max(ob0, 0)) : (i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
});
/* 第一次打開先是歡迎(exam = false:主要「開始練習」、次要「我在準備檢定」);按了「我在準備檢定」(exam = true)才在同一個對話框展開系統 + 級數,
   主要換成「開始準備考試」、「開始練習」變成次要的「不考試,自由練習」(同一顆 #obNo,行為一樣)。標題、說明、按鈕字照 data-i18n 換(換語言照樣對) */
function obMode(exam){
  $("obExamPane").hidden = !exam; $("obYes").hidden = !exam; $("obExam").hidden = exam;
  $("obExam").setAttribute("aria-expanded", String(exam));
  $("onboard").querySelector(".modal-card").classList.toggle("ob-exam-on", exam);   // 展開系統 + 級數:歡迎的大圖示縮小(app.css;不用 :has)
  $("obNo").classList.toggle("primary", !exam); $("obNo").classList.toggle("ghost", exam);
  $("onboardTitle").dataset.i18n = exam ? "obTitle" : "obWelcome";
  $("obSub").dataset.i18n = exam ? "obSub" : "obWelcomeSub";
  $("obNo").dataset.i18n = exam ? "obNo" : "obStart";
  applyStatic($("onboard")); obYesLabel();
}
function showOnboard(){
  // 沒選級數時「開始準備考試」不能按;先點級數 = 預設的系統(跟檢定頁一樣)
  const obSync = () => { fillGradeSeg($("obGradeSeg"), ob.grade, ob.system || DEFAULT_EXAM.system); $("obYes").disabled = ob.grade == null; obYesLabel(); };
  const syncSys = segBind("obSystem", () => ob.system, v => { ob.system = v; if (ob.grade != null) ob.grade = validGrade(ob.grade, v); obSync(); });
  obSync(); syncSys();
  $("obGradeSeg").onclick = e => { const g = gradeOfClick(e); if (g != null) { ob.grade = g; if (!ob.system) ob.system = DEFAULT_EXAM.system; obSync(); syncSys(); } };
  obMode(false);
  $("obExam").onclick = () => { obMode(true); $("onboardTitle").focus(); };   // 焦點回到標題(先唸問題;不放在 ABRSM,免得看起來像已選)
  openOnboard();
  $("obYes").onclick = () => {
    if (ob.grade == null) return;
    S.onboarded = true;
    setExam(ob.system, ob.grade); showView("exam");
    closeOnboard();
  };
  $("obNo").onclick = () => { S.exam = null; S.onboarded = true; save(); pushExam(); showView("tech"); closeOnboard(); };
}

/* ══ 全部模組共用的觸控、音訊、螢幕 ══ */
/* 禁止連點放大(iOS 有時不理 touch-action / user-scalable):300ms 內的第二下取消預設動作,自己補一次 click(鍵盤、節拍鍵用 pointerdown,不受影響) */
let lastTouchEnd = 0;
document.addEventListener("touchend", e => {
  const now = Date.now();
  if (now - lastTouchEnd < 300) { e.preventDefault(); const t = e.target.closest("button:not(.tap-pad), .opt, .chip, [role=tab], [data-tap]"); if (t && !t.disabled) t.click(); }
  lastTouchEnd = now;
}, { passive: false });
document.addEventListener("gesturestart", e => e.preventDefault());
/* iOS Safari 要有 touchstart 監聽,按鈕的 :active(按下去縮一下、變色)才會出現 */
document.addEventListener("touchstart", () => {}, { passive: true });
/* 每一次真的點擊都喚醒音訊(上面補的 click 不算使用者手勢,iOS 不准它打開聲音;被來電、鎖屏打斷的也在這裡叫回來) */
for (const ev of ["touchend", "click", "keydown", "pointerdown"]) document.addEventListener(ev, () => audio.unlockAudio(), { capture: true, passive: true });
/* 練習時螢幕不要暗掉(手機放在譜架上):App 在前景時一直保持亮著 */
let wakeLock = null;
async function keepAwake(){
  try { if ("wakeLock" in navigator && document.visibilityState === "visible" && !wakeLock) { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }); } } catch (e) {}
}
document.addEventListener("visibilitychange", keepAwake);
document.addEventListener("pointerdown", keepAwake, { once: true });
/* 切到背景(換 App、鎖屏、關分頁):目前的模組停止播放與計時、全部的聲音停掉;回到前景再進來(題目保留,不會自己開始播) */
let inBackground = false;
function toBackground(){
  if (inBackground) return;
  inBackground = true;
  if (curMod) MODS[curMod].leave();
  audio.stopAll();
}
function reenter(){
  if (!curMod) return;
  const y = window.scrollY;
  MODS[curMod].enter(tabOf(S.view));
  window.scrollTo(0, y);   // 回到原本看的位置(enter 有的會捲回頂端)
}
function toForeground(){
  if (!inBackground) return;
  inBackground = false;
  reenter();
}
document.addEventListener("visibilitychange", () => (document.visibilityState === "hidden" ? toBackground() : toForeground()));
window.addEventListener("pagehide", toBackground);
window.addEventListener("pageshow", () => { if (document.visibilityState !== "hidden") toForeground(); });
/* 聲音被系統打斷(來電、Siri;AudioContext 變成 interrupted / suspended)但畫面還在前景:同樣停掉,按鈕回到「播放」 */
audio.onInterrupt(() => {
  if (inBackground || !curMod) return;
  MODS[curMod].leave(); audio.stopAll(); reenter();
});
/* 桌機快捷鍵交給目前的模組 */
document.addEventListener("keydown", e => {
  if (!$("onboard").hidden || e.target.closest("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
  // 無障礙:用鍵盤(Tab)聚焦在按鈕、連結上時,Space / Enter 是按那個按鈕,不轉給模組(滑鼠點過的按鈕不算,空白鍵照樣是播放)
  if ((e.code === "Space" || e.key === "Enter") && e.target.closest && e.target.closest("button, a, [role=tab]") && e.target.matches(":focus-visible")) return;
  if (curMod) MODS[curMod].onKey(e);
});

/* ══ 頁尾:備份紀錄(兩個 App 一樣;js/shared/backup.js)══
   「備份紀錄」點了在頁尾下面展開一小塊(不跳視窗):一行說明 + 「存成檔案」「從檔案還原」。
   存:App 版(Capacitor 的 Filesystem + Share 外掛)寫到暫存再打開分享面板(可以存到「檔案」、傳給自己);
       網頁版手機能分享檔案就用分享面板,其他(桌機)直接下載。檔名「PianoDrill-紀錄-2026-11-04.json」
   還原:選檔 → 檢查(壞檔在這一塊寫一句原因)→ 確認 → 先讓目前的模組停下來(跟切到背景一樣,不會再把舊的紀錄存回去)→ 寫入 → 重新整理 */
const BAK_OPT = { app: BACKUP.app, prefix: BACKUP.prefix, langKey: BACKUP.langKey };
// 有全頁唯一的播報區 #srLive(DrumDrill)就也寫一份給報讀器(這兩個訊息本身不另外 aria-live);沒有 #srLive(PianoDrill)= 訊息自己是 role=status
const srSay = t => { const el = document.getElementById("srLive"); if (!el || !t) return; el.textContent = ""; setTimeout(() => { el.textContent = t; }, 60); };
const bakMsg = t => { $("bakMsg").textContent = t; srSay(t); };
$("bakLink").onclick = () => {
  const open = $("bakPanel").hidden;
  $("bakPanel").hidden = !open; $("bakLink").setAttribute("aria-expanded", String(open)); bakMsg("");
  if (open) requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight }));   // 頁尾在最下面:捲到底,這一塊不被分頁列蓋住
};
async function saveFile(name, text){
  const cap = window.Capacitor && window.Capacitor.Plugins, FS = cap && cap.Filesystem, SH = cap && cap.Share;
  if (FS && SH) {
    const { uri } = await FS.writeFile({ path: name, data: text, directory: "CACHE", encoding: "utf8" });
    await SH.share({ title: name, files: [uri] });
    return;
  }
  // 網頁版:手機(觸控)能分享檔案就用分享面板(iPhone 可以「儲存到檔案」);桌機的分享面板不能存檔,直接下載
  const file = typeof File === "function" ? new File([text], name, { type: "application/json" }) : null;
  if (file && matchMedia("(pointer:coarse)").matches && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.hidden = true;
  document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 30000);
}
$("bakSave").onclick = async () => {
  bakMsg("");
  const name = `${BACKUP.name}-${T("bak.file")}-${dayKey(new Date())}.json`;
  try {
    await saveFile(name, JSON.stringify(exportAll(localStorage, BAK_OPT)));
    bakMsg(T("bak.saved").replace("{f}", name));
  } catch (e) {
    if (e && (e.name === "AbortError" || /cancel/i.test(e.message || ""))) return;   // 使用者關掉分享面板:不算失敗
    bakMsg(T("bak.err_save"));
  }
};
$("bakLoad").onclick = () => { bakMsg(""); $("bakFile").value = ""; $("bakFile").click(); };
$("bakFile").onchange = async () => {
  const f = $("bakFile").files && $("bakFile").files[0]; if (!f) return;
  if (f.size >= MAX_BYTES) { bakMsg(T("bak.err_toolarge")); return; }
  let obj = null;
  try { obj = JSON.parse(await f.text()); } catch (e) { bakMsg(T("bak.err_notfile")); return; }
  const err = validate(obj, BAK_OPT);
  if (err) { bakMsg(T("bak.err_" + err)); return; }
  if (!confirm(T("bak.confirm"))) return;
  toBackground();   // 目前的模組停止播放與計時、存好現在的;之後切到背景 / 重新整理不會再存一次(inBackground)
  if (importAll(localStorage, obj, BAK_OPT)) { toForeground(); bakMsg(T("bak.err_write")); return; }
  location.reload();
};

/* ══ 頁尾:分享本週摘要(兩個 App 一樣;js/shared/digest.js)══
   給家長 / 老師的幾行純文字(最近 7 天):App 版用 Capacitor 的 Share 外掛、網頁版 navigator.share;都不能用就複製,旁邊寫「已複製」2 秒 */
let digestTimer = 0;
const digestMsg = t => { $("digestMsg").textContent = t || ""; srSay(t); clearTimeout(digestTimer); if (t) digestTimer = setTimeout(() => { $("digestMsg").textContent = ""; }, 2000); };
$("digestLink").onclick = async () => {
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(dayKey(d)); }
  const text = buildDigest({ app: BACKUP.name, days, ...digestData(days), lang: getLang() });
  const cancelled = e => e && (e.name === "AbortError" || /cancel/i.test(e.message || ""));
  const SH = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share;
  try {
    if (SH) { await SH.share({ text }); return; }
    if (navigator.share) { await navigator.share({ text }); return; }
  } catch (e) { if (cancelled(e)) return; }   // 其他錯誤(不准分享):改成複製
  try { await navigator.clipboard.writeText(text); digestMsg(T("digest.copied")); }
  catch (e) { digestMsg(T("digest.fail")); }
};
/* 從來沒練過(三個分頁的練習紀錄都是空的,practicelog 的 neverPracticed):「分享本週摘要」與它前面的「·」不顯示(沒東西可分享),練過一次才出現(index.html 的 .dg)。
   練習紀錄是各模組自己寫的:換分頁、頁尾捲進畫面時再看一次 */
function syncDigest(){
  const f = document.querySelector("footer");
  if (f) f.classList.toggle("no-digest", Object.values(digestData([]).mods).every(neverPracticed));
}
if (window.IntersectionObserver && document.querySelector("footer")) new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) syncDigest(); }).observe(document.querySelector("footer"));

/* ── 啟動 ── */
async function init(){
  fillGradeSeg($("gradeSeg"), examNow().grade, examNow().system);
  // 各模組讀自己的資料;一個失敗不影響其他兩個
  // App 自己的資料(@app 區段的 appCtx;讀不到不影響啟動)。網路慢、離線又沒快取時最多等 4 秒,不擋住模組啟動:
  // 逾時(null)先用沒有這些欄位的 ctx 啟動,之後載好再補進同一個 ctx(模組拿的是同一個物件),只通知模組重畫
  // (onCtx(),沒有就 relang():只重寫畫面;不走 setExam / pushExam,考試沒變,進行中的題目與模擬考要保留)
  const ctx = { exam: examNow(), examChanged, gradeLabel, showView, setSubActive, subBar, subActive: (view = S.view) => !subOff.has(view) };
  const extraJob = appCtx().catch(e => (console.error("appCtx", e), {}));
  const extra = await Promise.race([extraJob, new Promise(r => setTimeout(() => r(null), APP_CTX_MS))]);
  if (extra) Object.assign(ctx, extra);
  else extraJob.then(x => {
    Object.assign(ctx, x);
    for (const [name, m] of Object.entries(MODS)) { try { (m.onCtx || m.relang)(); } catch (e) { console.error(name, e); } }
    renderExamCard();
  });
  await Promise.all(Object.entries(MODS).map(([name, m]) => m.start(ctx).catch(e => console.error(name, e))));
  renderChip(); renderExamCard();
  window.__shell = { S, showView, setExam, MODS };
  if (!S.onboarded) { showView("tech"); showOnboard(); }
  else showView(S.view || (S.exam ? "exam" : "tech"));
  window.__stageReady = 1;
}
/* 離線使用:註冊 Service Worker(sw.js);本機開發(localhost)也註冊,方便測試 */
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
init().catch(e => console.error(e));
