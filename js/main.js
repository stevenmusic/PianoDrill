/* 外框(PianoDrill / DrumDrill 共用,`@app-begin … @app-end` 以外兩邊一模一樣,tools/test/sync.mjs 檢查):
   頂欄、子項目分段鈕、底部分頁、共用的考試設定(系統 + 級數設一次,三個模組都照這一級)、主題、語言、第一次打開的問題。
   三個模組(js/tech、js/sight、js/ear)各自負責自己的卡片;外框只告訴它們「現在顯示哪一頁、考哪一級、語言換了」。
   每個模組匯出同一組函式:start(ctx)、enter(tab)、leave()、setExam(exam)、relang()、examStatus()、onKey(e)
   - ctx = { exam, examChanged(), gradeLabel(g, sys), showView(view, sub) } + 各 App 自己的(@app 區段的 appCtx(),
     例如 DrumDrill 的 examData(sys));模組不能 import 這個檔案。appCtx 最多等 APP_CTX_MS(4 秒):逾時先不給
     (模組要能處理 ctx 裡還沒有這些欄位),之後載好再補進同一個 ctx,通知每個模組重畫(onCtx(),沒有就 relang());
     不呼叫 setExam:考試沒變,不能把進行中的題目、模擬考洗掉
   - leave() 停止播放與計時(題目保留);enter(tab) 有題目就不重新出題
   - 切到背景(visibilitychange / pagehide)或聲音被系統打斷:目前的模組 leave() + 全部停止;回到前景再 enter() */
import { tr, T, applyStatic, setLang, getLang, onLang } from "./shared/i18n.js";
import * as audio from "./shared/audio.js";
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
  const s = { view: "tech", exam: null, onboarded: false, theme: "dark", ...saved,
    sub: { tech: "scale", ear: "note", exam: "tech", sight: "both", ...(saved.sub || {}) } };
  // 視奏分頁的子項目 = 右手 / 左手 / 雙手(範圍階段在 js/sight/stages.js);舊版存的是級數 1–8 → 雙手
  if (!["right", "left", "both"].includes(s.sub.sight)) s.sub.sight = "both";
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
  tech: () => [["scale", tr("音階", "Scales")], ["arp", tr("琶音", "Arpeggios")], ["hanon", tr("哈農", "Hanon")]],
  // 視奏:右手 / 左手 / 雙手(級數只在檢定頁設;範圍階段在視奏分頁的設定卡)
  sight: () => [["right", tr("右手", "Right hand")], ["left", tr("左手", "Left hand")], ["both", tr("雙手", "Both hands")]],
  ear: () => [["note", tr("單音", "Notes")], ["interval", tr("音程", "Intervals")], ["chord", tr("和弦", "Chords")]],
  exam: () => [["tech", tr("音階琶音", "Scales")], ["sight", tr("視奏", "Sight-reading")], ["ear", tr("聽力", "Aural")]]
};
const PART_LABEL = () => ({ tech: tr("音階琶音", "Scales & arpeggios"), sight: tr("視奏", "Sight-reading"), ear: tr("聽力測驗", "Aural tests") });
/* 子項目分段鈕的群組名稱(無障礙:role="group" 的 aria-label) */
const SUB_LABEL = () => ({ tech: tr("技巧項目", "Technique"), sight: tr("手", "Hands"), ear: tr("題型", "Question type"), exam: tr("檢定項目", "Exam section") });
/* 外框另外給模組的東西(ctx 裡;DrumDrill 用來給考試資料):PianoDrill 的模組自己讀資料,這裡沒有 */
const appCtx = async () => ({});
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
onLang(() => {
  renderSubnav(); renderExamCard(); tabbarLabel();
  if (!$("onboard").hidden) fillGradeSeg($("obGradeSeg"), ob.grade, ob.system);
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

/* 無障礙:重畫一排按鈕(innerHTML)時,原本聚焦在裡面的按鈕換成新的同一顆(不然焦點掉回 <body>,鍵盤使用者要從頭 Tab) */
function keepFocus(box, attr){
  const a = document.activeElement, v = a && box.contains(a) ? a.getAttribute(attr) : null;
  return () => { if (v != null) { const b = box.querySelector(`[${attr}="${v}"]`); if (b) b.focus({ preventScroll: true }); } };
}
/* ══ 分頁 ══ */
let curMod = null;
function renderSubnav(){
  const opts = SUBS[S.view]();
  $("subnav").hidden = !opts.length;
  document.body.classList.toggle("no-subnav", !opts.length);
  const keep = keepFocus($("subSeg"), "data-v");
  $("subSeg").innerHTML = opts.map(([v, t]) => `<button data-v="${v}" aria-pressed="${S.sub[S.view] === v}">${t}</button>`).join("");
  $("subSeg").setAttribute("aria-label", SUB_LABEL()[S.view] || "");
  keep();
}
$("subSeg").onclick = e => {
  const b = e.target.closest("button[data-v]"); if (!b) return;
  if (S.sub[S.view] === b.dataset.v) return;
  S.sub[S.view] = b.dataset.v; save();
  showView(S.view);
};
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
  const modName = modOf(view);
  const tab = tabOf(view);
  $("examSetup").hidden = !exam;
  if (curMod && curMod !== modName) MODS[curMod].leave();
  for (const [name, m] of Object.entries(MODS)) $("mod-" + name).hidden = name !== modName;
  curMod = modName;
  document.body.classList.toggle("view-exam", exam);
  document.body.classList.toggle("view-sight", modName === "sight");
  renderSubnav();
  if (exam) renderExamCard();
  window.scrollTo({ top: 0 });
  MODS[modName].enter(tab);
}
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
   aria-label 寫完整級名(gradeLabel);重畫時焦點留在同一顆(keepFocus) */
function fillGradeSeg(seg, grade, sys){
  const keep = keepFocus(seg, "data-v");
  seg.innerHTML = gradesOf(sys).map(g => `<button type="button" data-v="${g}" aria-pressed="${g === grade}" aria-label="${gradeLabel(g, sys)}">${gradeShort(g, sys)}</button>`).join("");
  keep();
}
const gradeOfClick = e => { const b = e.target.closest("button[data-v]"); return b && !b.disabled ? Number(b.dataset.v) : null; };
function setExam(system, grade){
  S.exam = { system, grade }; save();
  pushExam();
}
function pushExam(){
  const ex = examNow();
  for (const m of Object.values(MODS)) m.setExam(ex);
  renderExamCard(); renderChip();
}
const syncSystemSeg = segBind("systemSeg", () => examNow().system, v => setExam(v, validGrade(examNow().grade, v)));
$("gradeSeg").onclick = e => { const g = gradeOfClick(e); if (g != null) setExam(examNow().system, g); };
function renderChip(){
  $("examChip").hidden = !S.exam;
  if (S.exam) $("examChip").textContent = `${SYSTEMS[S.exam.system]} ${gradeLabel(S.exam.grade)}`;
}
function renderExamCard(){
  const ex = examNow();
  syncSystemSeg(); fillGradeSeg($("gradeSeg"), ex.grade, ex.system);
  $("examSum").textContent = S.exam ? `${SYSTEMS[ex.system]} · ${gradeLabel(ex.grade, ex.system)}` : tr("還沒選考試 · 請在下面選", "No exam yet · pick one below");
  // 三個項目的進度(各模組自己算),點一下切到那一項
  const keep = keepFocus($("examParts"), "data-part");
  $("examParts").innerHTML = Object.keys(MODS).map(name => {
    const st = MODS[name].examStatus() || "";
    const label = PART_LABEL()[name];
    return `<button class="part" data-part="${name}" aria-pressed="${S.view === "exam" && S.sub.exam === name}"><b>${label}</b><small>${st}</small></button>`;
  }).join("");
  keep();
}
$("examParts").onclick = e => {
  const b = e.target.closest("[data-part]"); if (!b) return;
  S.sub.exam = b.dataset.part; save(); showView("exam");
};
/* 模組裡的進度改變了(標記通過、答題):重畫進度 */
export function examChanged(){ if (S.view === "exam") renderExamCard(); }

/* ══ 第一次打開:在準備考試嗎? ══
   無障礙:對話框打開時焦點移進去(第一個按鈕)、Tab 只在對話框 + 頂欄右邊的主題 / 語言鈕之間轉(頂欄在對話框上面,可以邊選邊換語言)、
   Esc = 「不考試,自由練習」;背景(內容、分頁列、子項目分段鈕、頂欄的考試標籤)設 inert;關掉時焦點回到打開前的地方(沒有就回到選到的分頁) */
const ob = { ...DEFAULT_EXAM };
let obReturn = null;
const OB_BG = () => [MAIN, $("tabbar"), $("subnav"), $("examChip")].filter(Boolean);
const OB_SEL = "button, select, [href], input, [tabindex]:not([tabindex='-1'])";
function obFocusables(){ return [...document.querySelectorAll(".header-right button"), ...$("onboard").querySelectorAll(OB_SEL)].filter(el => !el.disabled && !el.hidden && !el.inert && el.offsetParent !== null); }
function openOnboard(){
  obReturn = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
  $("onboard").hidden = false;
  for (const el of OB_BG()) el.inert = true;
  const first = $("onboard").querySelector("#obSystem button[aria-pressed=true]") || obFocusables()[0];
  if (first) first.focus();
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
  f[i < 0 ? 0 : (i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
});
function showOnboard(){
  const syncSys = segBind("obSystem", () => ob.system, v => { ob.system = v; ob.grade = validGrade(ob.grade, v); fillGradeSeg($("obGradeSeg"), ob.grade, v); });
  fillGradeSeg($("obGradeSeg"), ob.grade, ob.system); syncSys();
  $("obGradeSeg").onclick = e => { const g = gradeOfClick(e); if (g != null) { ob.grade = g; fillGradeSeg($("obGradeSeg"), g, ob.system); } };
  openOnboard();
  $("obYes").onclick = () => {
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
  if (now - lastTouchEnd < 300) { e.preventDefault(); const t = e.target.closest("button:not(.tap-pad), .opt, .chip, [role=tab]"); if (t && !t.disabled) t.click(); }
  lastTouchEnd = now;
}, { passive: false });
document.addEventListener("gesturestart", e => e.preventDefault());
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

/* ── 啟動 ── */
async function init(){
  fillGradeSeg($("gradeSeg"), examNow().grade, examNow().system);
  // 各模組讀自己的資料;一個失敗不影響其他兩個
  // App 自己的資料(@app 區段的 appCtx;讀不到不影響啟動)。網路慢、離線又沒快取時最多等 4 秒,不擋住模組啟動:
  // 逾時(null)先用沒有這些欄位的 ctx 啟動,之後載好再補進同一個 ctx(模組拿的是同一個物件),只通知模組重畫
  // (onCtx(),沒有就 relang():只重寫畫面;不走 setExam / pushExam,考試沒變,進行中的題目與模擬考要保留)
  const ctx = { exam: examNow(), examChanged, gradeLabel, showView };
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
