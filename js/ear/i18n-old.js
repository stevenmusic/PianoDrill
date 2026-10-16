/* 雙語(繁體中文 / English):跟 HarmonyHands、HarmonyMap 同一套做法——
   頂欄最右邊的語言按鈕(中文時顯示 EN、英文時顯示 中),選擇存在 localStorage,第一次一律英文(使用者要求)。
   靜態文字:HTML 上的 data-i18n="key"(文字)/ data-i18n-attr="aria-label:key,title:key";
   程式產生的文字:tr("中文", "English")。 */
const LANG_KEY = "eardrill-lang";
let LANG = (() => {
  try { const v = localStorage.getItem(LANG_KEY); if (v === "en" || v === "zh") return v; } catch (e) {}
  return "en";   // 預設英文(使用者要求);切過語言就記住
})();
export const getLang = () => LANG;
export const tr = (zh, en) => LANG === "en" ? en : zh;

const STR = {
  pageTitle: ["EarDrill 聽音特訓", "EarDrill 聽音特訓"],
  themeToggleLabel: ["淺色模式", "Light mode"], themeToggleTitle: ["切換淺色/深色主題", "Switch light/dark theme"],
  langToggleText: ["EN", "中"], langToggleLabel: ["切換為英文", "Switch to Chinese"], langToggleTitle: ["切換語言", "Switch language"],
  tabNote: ["單音", "Notes"], tabInterval: ["音程", "Intervals"], tabChord: ["和弦", "Chords"], tabExam: ["檢定", "Exams"],
  lblSystem: ["考試系統", "Exam board"], lblGrade: ["級數", "Grade"],
  play: ["播放題目", "Play"], replay: ["再聽一次", "Replay"], stop: ["停止", "Stop"],
  next: ["下一題", "Next"], draw: ["隨機抽一題", "Random"], showAnswer: ["顯示答案", "Show answer"], clearKeys: ["重彈", "Clear"],
  tapBtn: ["拍", "Tap"], tapDone: ["完成", "Done"],
  optAuto: ["答對自動下一題", "Auto next"], mock: ["模擬考", "Mock exam"], optAdaptive: ["加強弱項", "Focus weak"],
  statsTitle: ["各項正確率", "Accuracy"], statsReset: ["重設", "Reset"],
  logTitle: ["練習紀錄", "Practice log"], logStreak: ["連續天數", "Day streak"], logToday: ["今天題數", "Today"], logAcc: ["今天正確率", "Today %"],
  examTestsTitle: ["本級聽力測驗", "Aural tests"],
  footer: ["鋼琴音色:Accurate-Salamander Grand Piano V6.2(Salamander Grand Piano V3 by Alexander Holm,CC-BY 3.0)· 拍點:Naked Drums(Wilkinson Audio,CC-BY 4.0)· 取樣經 ScrollScore 整理後直接讀取。檢定聽力要求依 ABRSM《Piano Practical Grades 2025 & 2026》與 Trinity《Piano Syllabus from 2023》整理,題目由 App 依要求產生,僅供練習;實際要求以官方大綱為準。",
    "Piano: Accurate-Salamander Grand Piano V6.2 (Salamander Grand Piano V3, Alexander Holm, CC-BY 3.0) · Click: Naked Drums (Wilkinson Audio, CC-BY 4.0) · via ScrollScore. Aural requirements from ABRSM Piano Practical Grades 2025 & 2026 and Trinity Piano Syllabus from 2023; questions are generated for practice — check the official syllabus."],
  obTitle: ["你在準備聽力檢定嗎?", "Taking an exam?"],
  obSub: ["選好考試和級數,會打開「檢定」分頁,列出這一級的聽力測驗;之後隨時可以改。",
    "Pick a board and grade to open the Exams tab with its aural tests. Change any time."],
  obYes: ["開始準備考試", "Start exam prep"], obNo: ["不考試,自由練習", "No exam — free practice"]
};
export const T = key => (STR[key] ? STR[key][LANG === "en" ? 1 : 0] : key);

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
/* 設定段落文字:fn 會用中文、英文各跑一次(裡面用 tr) */
export function pairText(el, fn){
  const keep = LANG;
  LANG = "zh"; const zh = fn(); LANG = "en"; const en = fn(); LANG = keep;
  el.textContent = LANG === "en" ? en : zh;
  el._pair = [zh, en];
  if (RO && !el._observed) { RO.observe(el); el._observed = true; }
  equalize(el);
}
export function unpair(el){ el._pair = null; el.style.minHeight = ""; }
export function applyStatic(){
  document.documentElement.lang = LANG === "en" ? "en" : "zh-Hant";
  document.title = T("pageTitle");
  document.querySelectorAll("[data-i18n]").forEach(el => {
    if (el.hasAttribute("data-i18n-pair")) { const k = el.dataset.i18n; pairText(el, () => T(k)); }
    else el.textContent = T(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-attr]").forEach(el => {
    for (const pair of el.dataset.i18nAttr.split(",")) { const [a, k] = pair.split(":"); el.setAttribute(a, T(k)); }
  });
  const btn = document.getElementById("langToggle");
  if (btn) btn.setAttribute("aria-pressed", String(LANG === "en"));
}
export function setLang(lang){
  LANG = lang;
  try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
  applyStatic();
}
