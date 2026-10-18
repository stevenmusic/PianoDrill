/* 雙語(繁體中文 / English):跟 HarmonyHands、HarmonyMap 同一套做法——
   頂欄最右邊的語言按鈕(中文時顯示 EN、英文時顯示 中),選擇存在 localStorage,第一次一律英文(使用者要求)。
   靜態文字:HTML 上的 data-i18n="key"(文字)/ data-i18n-attr="aria-label:key,title:key";
   程式產生的文字:tr("中文", "English")。
   模組各自的字串用前綴分開:"tech.play"、"ear.play"(同一個字在不同模組意思不同),模組裡用 scoped("tech") 拿到只查自己那一組的 T。
   PianoDrill / DrumDrill 共用(tools/test/sync.mjs 檢查):@app 區段(LANG_KEY、OLD_KEYS、STR)以外兩邊一模一樣 */
// @app-begin
/* PianoDrill:技巧、聽音的字串在 js/tech/strings.js、js/ear/strings.js(前綴 tech.、ear.);視奏模組沿用自己的字典(js/sight/i18n.js),語言跟這裡同步 */
const LANG_KEY = "pianodrill-lang";
const OLD_KEYS = ["fingerdrill-lang", "eardrill-lang"];   // 同一個網域上的舊工具選過的語言,第一次打開沿用
// @app-end
let LANG = (() => {
  try {
    for (const k of [LANG_KEY, ...OLD_KEYS]) { const v = localStorage.getItem(k); if (v === "en" || v === "zh") return v; }
  } catch (e) {}
  return "en";   // 預設英文(使用者要求);切過語言就記住
})();
export const getLang = () => LANG;
export const tr = (zh, en) => LANG === "en" ? en : zh;

// @app-begin
const STR = {
  pageTitle: ["PianoDrill 鋼琴檢定特訓", "PianoDrill — piano exam trainer"],
  tagline: ["鋼琴檢定特訓", "Piano exam trainer"],
  themeToggleLabel: ["淺色模式", "Light mode"], themeToggleTitle: ["切換淺色/深色主題", "Switch light/dark theme"],
  langToggleText: ["EN", "中"], langToggleLabel: ["切換為英文", "Switch to Chinese"], langToggleTitle: ["切換語言", "Switch language"],
  tabTech: ["技巧", "Technique"], tabSight: ["視奏", "Sight-read"], tabEar: ["聽音", "Aural"], tabExam: ["檢定", "Exams"],
  lblSystem: ["考試系統", "Exam board"], lblGrade: ["級數", "Grade"],
  examSetupTitle: ["準備的考試", "Your exam"],
  examNone: ["還沒選考試", "No exam chosen"],
  examClear: ["不考試", "No exam"],
  licenses: ["授權與出處", "Licenses"],
  privacy: ["隱私權政策", "Privacy"],
  support: ["支援", "Support"],
  footer: ["鋼琴音色:Accurate-Salamander Grand Piano V6.2(Salamander Grand Piano V3 by Alexander Holm,CC BY 3.0)· 節拍器:Naked Drums(Wilkinson Audio,CC BY 4.0),經 ScrollScore 整理,播放時加上殘響與壓縮 · 樂譜:OpenSheetMusicDisplay(BSD-3-Clause)。音階琶音、聽力要求依 ABRSM《Piano Practical Grades 2025 & 2026》與 Trinity《Piano Syllabus from 2023》整理;視奏依 ABRSM 視奏範例整理,題目由 App 依規則產生,僅供練習;實際要求以官方大綱為準。ABRSM、Trinity 為各自的商標,本 App 與其無關。",
    "Piano: Accurate-Salamander Grand Piano V6.2 (Salamander Grand Piano V3, Alexander Holm, CC BY 3.0) · Click: Naked Drums (Wilkinson Audio, CC BY 4.0), organised by ScrollScore, with reverb and compression added · Notation: OpenSheetMusicDisplay (BSD-3-Clause). Scales and aural from ABRSM Piano Practical Grades 2025 & 2026 and Trinity Piano Syllabus from 2023; sight-reading modelled on ABRSM specimen tests. Generated for practice only — check the official syllabus. ABRSM and Trinity are trademarks of their owners; this app is not affiliated with them."],
  obTitle: ["你在準備鋼琴檢定嗎?", "Taking an exam?"],
  obSub: ["選好考試和級數,會打開「檢定」分頁:音階琶音、視奏、聽力都照這一級出題。之後隨時可以在「檢定」分頁更改。",
    "Pick a board and grade: Exams opens with scales, sight-reading and aural set to that grade. Change any time in Exams."],
  obYes: ["開始準備考試", "Start exam prep"], obNo: ["不考試,自由練習", "No exam — free practice"]
};
// @app-end
/* 模組的字串:addStrings("tech", { play: ["播放示範", "Play"] }) → "tech.play" */
export function addStrings(ns, dict){ for (const [k, v] of Object.entries(dict)) STR[ns + "." + k] = v; }
export const T = key => (STR[key] ? STR[key][LANG === "en" ? 1 : 0] : key);
export const scoped = ns => key => (STR[ns + "." + key] ? T(ns + "." + key) : T(key));

/* 語言改變時要重畫的東西(各模組登記) */
const listeners = [];
export const onLang = fn => listeners.push(fn);

/* 段落文字:兩種語言的行數不一定一樣,所以量兩種語言的高度,保留比較高的(min-height),
   切換語言時版面完全不動。寬度改變(旋轉、視窗縮放、從隱藏變顯示)時重量 */
const RO = typeof ResizeObserver !== "undefined" ? new ResizeObserver(es => es.forEach(e => equalize(e.target))) : null;
let lastW = new WeakMap();
function equalize(el){
  if (el._eq || !el._pair || !el.offsetWidth) return;
  const w = el.offsetWidth;
  if (lastW.get(el) === w && el.style.minHeight && el._pairDone === el._pair) return;
  el._eq = true;
  const cur = el.textContent;
  el.style.minHeight = "";
  const h1 = el.getBoundingClientRect().height;
  el.textContent = el._pair[LANG === "en" ? 0 : 1];
  const h2 = el.getBoundingClientRect().height;
  el.textContent = cur;
  el.style.minHeight = Math.ceil(Math.max(h1, h2)) + "px";
  lastW.set(el, w); el._pairDone = el._pair;
  el._eq = false;
}
/* 字型載好(或載入失敗改用備用字型)之後字寬會變:成對的段落全部重量一次 */
const paired = new Set();
const reEqualize = () => { for (const el of paired) { if (!el.isConnected) { paired.delete(el); continue; } lastW.delete(el); equalize(el); } };
if (typeof document !== "undefined" && document.fonts) {
  document.fonts.ready.then(reEqualize);
  document.fonts.addEventListener?.("loadingdone", reEqualize);
  document.fonts.addEventListener?.("loadingerror", reEqualize);
}
/* 設定段落文字:fn 會用中文、英文各跑一次(裡面用 tr) */
export function pairText(el, fn){
  const keep = LANG;
  LANG = "zh"; const zh = fn(); LANG = "en"; const en = fn(); LANG = keep;
  el.textContent = LANG === "en" ? en : zh;
  el._pair = [zh, en];
  if (RO && !el._observed) { RO.observe(el); el._observed = true; }
  paired.add(el);
  equalize(el);
}
export function unpair(el){ el._pair = null; el.style.minHeight = ""; }
export function applyStatic(root = document){
  if (root === document) { document.documentElement.lang = LANG === "en" ? "en" : "zh-Hant"; document.title = T("pageTitle"); }
  root.querySelectorAll("[data-i18n]").forEach(el => {
    if (el.hasAttribute("data-i18n-pair")) { const k = el.dataset.i18n; pairText(el, () => T(k)); }
    else el.textContent = T(el.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-attr]").forEach(el => {
    for (const pair of el.dataset.i18nAttr.split(",")) { const [a, k] = pair.split(":"); el.setAttribute(a, T(k)); }
  });
  const btn = document.getElementById("langToggle");
  if (btn) btn.setAttribute("aria-pressed", String(LANG === "en"));
}
export function setLang(lang){
  LANG = lang;
  try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
  applyStatic();
  for (const fn of listeners) { try { fn(lang); } catch (e) { console.error(e); } }
}
