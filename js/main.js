/* PianoDrill 外框:頂欄、子項目分段鈕、底部分頁、共用的考試設定(系統 + 級數設一次,三個模組都照這一級)、主題、語言、第一次打開的問題。
   三個模組(js/tech、js/sight、js/ear)各自負責自己的卡片;外框只告訴它們「現在顯示哪一頁、考哪一級、語言換了」。
   每個模組匯出同一組函式:start()、enter(tab)、leave()、setExam(exam)、relang()、examStatus()、onKey(e) */
import { tr, T, applyStatic, setLang, getLang, onLang } from "./shared/i18n.js";
import * as audio from "./shared/audio.js";
import * as tech from "./tech/app.js";
import * as sight from "./sight/app.js";
import * as ear from "./ear/app.js";

const $ = id => document.getElementById(id);
const MODS = { tech, sight, ear };

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
  return { view: "tech", sub: { tech: "scale", ear: "note", exam: "tech" }, exam: null, onboarded: false, theme: "dark", ...saved,
    sub: { tech: "scale", ear: "note", exam: "tech", ...(saved.sub || {}) } };
})();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

/* ── 考試:兩個系統都是初級(0)到 8 級 ── */
const SYSTEMS = { abrsm: "ABRSM", trinity: "Trinity" };
const GRADES = [0, 1, 2, 3, 4, 5, 6, 7, 8];
export const gradeLabel = g => g === 0 ? tr("初級", "Initial") : tr(g + " 級", "Grade " + g);
/* 模組拿到的考試:還沒選考試時給 ABRSM 1 級(auto,只是點進檢定分頁看看,不算在準備考試) */
const effExam = () => S.exam ? { ...S.exam, auto: false } : { system: "abrsm", grade: 1, auto: true };
let autoExam = { system: "abrsm", grade: 1 };   // 沒選考試時,檢定分頁暫時看的系統/級數
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
  renderSubnav(); renderExamCard();
  if (!$("onboard").hidden) fillGrades($("obGrade"), Number($("obGrade").value));
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
/* 手機:設定卡收成一行,點了展開(每個模組的設定卡都一樣,在這裡統一處理) */
document.addEventListener("click", e => {
  const btn = e.target.closest(".setup-summary"); if (!btn) return;
  const card = btn.closest(".card"), open = !card.classList.contains("open");
  card.classList.toggle("open", open); btn.setAttribute("aria-expanded", String(open));
});

/* ══ 分頁 ══ */
const SUBS = {
  tech: () => [["scale", tr("音階", "Scales")], ["arp", tr("琶音", "Arpeggios")], ["hanon", tr("哈農", "Hanon")]],
  sight: () => [],
  ear: () => [["note", tr("單音", "Notes")], ["interval", tr("音程", "Intervals")], ["chord", tr("和弦", "Chords")]],
  exam: () => [["tech", tr("音階琶音", "Scales")], ["sight", tr("視奏", "Sight-reading")], ["ear", tr("聽力", "Aural")]]
};
let curMod = null;
function renderSubnav(){
  const opts = SUBS[S.view]();
  $("subnav").hidden = !opts.length;
  document.body.classList.toggle("no-subnav", !opts.length);
  $("subSeg").innerHTML = opts.map(([v, t]) => `<button data-v="${v}" aria-pressed="${S.sub[S.view] === v}">${t}</button>`).join("");
}
$("subSeg").onclick = e => {
  const b = e.target.closest("button[data-v]"); if (!b) return;
  if (S.sub[S.view] === b.dataset.v) return;
  S.sub[S.view] = b.dataset.v; save();
  showView(S.view);
};
function showView(view){
  S.view = view; save();
  document.querySelectorAll("#tabbar button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.view === view)));
  const exam = view === "exam";
  const modName = exam ? S.sub.exam : view;
  const tab = exam ? "exam" : modName === "sight" ? "free" : S.sub[modName];
  $("examSetup").hidden = !exam;
  if (curMod && curMod !== modName) MODS[curMod].leave();
  for (const [name, m] of Object.entries(MODS)) $("mod-" + name).hidden = name !== modName;
  curMod = modName;
  document.body.classList.toggle("view-sight", modName === "sight");
  renderSubnav();
  if (exam) renderExamCard();
  window.scrollTo({ top: 0 });
  MODS[modName].enter(tab);
}
$("tabbar").onclick = e => { const b = e.target.closest("button[data-view]"); if (b) showView(b.dataset.view); };
$("examChip").onclick = () => showView("exam");

/* ══ 考試設定卡 ══ */
function fillGrades(sel, grade){
  sel.innerHTML = GRADES.map(g => `<option value="${g}">${gradeLabel(g)}</option>`).join("");
  sel.value = String(GRADES.includes(grade) ? grade : 1);
}
function setExam(system, grade){
  S.exam = { system, grade }; save();
  pushExam();
}
function pushExam(){
  const ex = examNow();
  for (const m of Object.values(MODS)) m.setExam(ex);
  renderExamCard(); renderChip();
}
const syncSystemSeg = segBind("systemSeg", () => examNow().system, v => setExam(v, examNow().grade));
$("selGrade").onchange = () => setExam(examNow().system, Number($("selGrade").value));
function renderChip(){
  $("examChip").hidden = !S.exam;
  if (S.exam) $("examChip").textContent = `${SYSTEMS[S.exam.system]} ${gradeLabel(S.exam.grade)}`;
}
function renderExamCard(){
  const ex = examNow();
  syncSystemSeg(); fillGrades($("selGrade"), ex.grade);
  $("examSum").textContent = S.exam ? `${SYSTEMS[ex.system]} · ${gradeLabel(ex.grade)}` : tr("還沒選考試 · 點這裡選考試和級數", "No exam chosen · tap to pick one");
  // 三個項目的進度(各模組自己算),點一下切到那一項
  $("examParts").innerHTML = Object.keys(MODS).map(name => {
    const st = MODS[name].examStatus() || "";
    const label = { tech: tr("音階琶音", "Scales & arpeggios"), sight: tr("視奏", "Sight-reading"), ear: tr("聽力測驗", "Aural tests") }[name];
    return `<button class="part" data-part="${name}" aria-pressed="${S.view === "exam" && S.sub.exam === name}"><b>${label}</b><small>${st}</small></button>`;
  }).join("");
}
$("examParts").onclick = e => {
  const b = e.target.closest("[data-part]"); if (!b) return;
  S.sub.exam = b.dataset.part; save(); showView("exam");
};
/* 模組裡的進度改變了(標記通過、答題):重畫進度 */
export function examChanged(){ if (S.view === "exam") renderExamCard(); }

/* ══ 第一次打開:在準備考試嗎? ══ */
function showOnboard(){
  const ob = { system: "abrsm", grade: 1 };
  const syncSys = segBind("obSystem", () => ob.system, v => { ob.system = v; });
  fillGrades($("obGrade"), ob.grade); syncSys();
  $("obGrade").onchange = () => ob.grade = Number($("obGrade").value);
  $("onboard").hidden = false;
  $("obYes").onclick = () => {
    S.onboarded = true; $("onboard").hidden = true;
    setExam(ob.system, Number($("obGrade").value)); showView("exam");
  };
  $("obNo").onclick = () => { S.exam = null; S.onboarded = true; save(); $("onboard").hidden = true; pushExam(); showView("tech"); };
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
/* 桌機快捷鍵交給目前的模組 */
document.addEventListener("keydown", e => {
  if (!$("onboard").hidden || e.target.closest("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
  if (curMod) MODS[curMod].onKey(e);
});

/* ── 啟動 ── */
async function init(){
  fillGrades($("selGrade"), examNow().grade);
  // 各模組讀自己的資料;一個失敗不影響其他兩個
  await Promise.all(Object.entries(MODS).map(([name, m]) => m.start({ exam: examNow(), examChanged }).catch(e => console.error(name, e))));
  renderChip();
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
