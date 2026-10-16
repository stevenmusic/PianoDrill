/* 雙語(繁體中文 / English):跟 HarmonyHands、HarmonyMap 同一套做法——
   頂欄最右邊的語言按鈕(中文時顯示 EN、英文時顯示 中),選擇存在 localStorage,第一次一律英文(使用者要求)。
   靜態文字:HTML 上的 data-i18n="key"(文字)/ data-i18n-attr="aria-label:key,title:key";
   程式產生的文字:tr("中文", "English")。 */
const LANG_KEY = "fingerdrill-lang";
let LANG = (() => {
  try { const v = localStorage.getItem(LANG_KEY); if (v === "en" || v === "zh") return v; } catch (e) {}
  return "en";   // 預設英文(使用者要求);切過語言就記住
})();
export const getLang = () => LANG;
export const tr = (zh, en) => LANG === "en" ? en : zh;

const STR = {
  pageTitle: ["FingerDrill 手指特訓", "FingerDrill 手指特訓"],
  themeToggleLabel: ["淺色模式", "Light mode"], themeToggleTitle: ["切換淺色/深色主題", "Switch light/dark theme"],
  langToggleText: ["EN", "中"], langToggleLabel: ["切換為英文", "Switch to Chinese"], langToggleTitle: ["切換語言", "Switch language"],
  tabScale: ["音階", "Scales"], tabArp: ["琶音", "Arpeggios"], tabHanon: ["哈農", "Hanon"], tabExam: ["檢定", "Exams"],
  lblSystem: ["考試系統", "Exam board"], lblGrade: ["級數", "Grade"], lblSet: ["準備哪一組(Trinity)", "Set (Trinity)"],
  setA: ["A 組", "Set A"], setB: ["B 組", "Set B"],
  lblQuality: ["大調 / 小調", "Major / minor"], qAll: ["全部", "All"], qMajor: ["大調", "Major"], qMinor: ["小調", "Minor"],
  lblMinorForm: ["小調形式(考生自選時)", "Minor form (your choice)"],
  formHarmonic: ["和聲小調", "Harmonic minor"], formMelodic: ["旋律小調", "Melodic minor"], formNatural: ["自然小調(大綱允許時)", "Natural minor (where allowed)"],
  lblCats: ["抽考範圍", "Include"], excludeMastered: ["排除已通過的項目", "Skip passed items"],
  draw: ["隨機抽考", "Random"], next: ["下一項", "Next"], play: ["播放示範", "Play"], stop: ["停止", "Stop"],
  good: ["通過", "Pass"], weak: ["待加強", "Weak"],
  scoreTitle: ["樂譜與指法", "Score"], handRH: ["右手", "RH"], handLH: ["左手", "LH"], handBoth: ["雙手", "Both"],
  metroTitle: ["速度", "Tempo"], bpmReset: ["回到考試速度", "Exam tempo"],
  bpmDown: ["慢 1(按住連續減少)", "Slower by 1 (hold to repeat)"], bpmUp: ["快 1(按住連續增加)", "Faster by 1 (hold to repeat)"],
  tempo: ["速度", "Tempo"],
  logTitle: ["練習紀錄", "Practice log"], logStreak: ["連續天數", "Day streak"], logToday: ["今天次數", "Today"], logMin: ["今天分鐘", "Minutes"],
  optLoop: ["循環播放", "Loop"], optRamp: ["每輪 +4", "+4 each loop"], optClick: ["只聽拍點", "Clicks only"],
  listTitle: ["本級要求", "Grade requirements"],
  legendGood: ["通過", "Pass"], legendWeak: ["待加強", "Weak"], legendNone: ["未標記", "New"],
  footer: ["鋼琴音色:Accurate-Salamander Grand Piano V6.2(Salamander Grand Piano V3 by Alexander Holm,CC-BY 3.0)· 節拍器:Naked Drums(Wilkinson Audio,CC-BY 4.0)· 取樣經 ScrollScore 整理後直接讀取 · 樂譜:OpenSheetMusicDisplay(BSD-3-Clause)。檢定要求依 ABRSM《Piano Practical Grades 2025 & 2026》與 Trinity《Piano Syllabus from 2023》整理,僅供練習參考;實際要求以官方大綱為準。",
    "Piano: Accurate-Salamander Grand Piano V6.2 (Salamander Grand Piano V3, Alexander Holm, CC-BY 3.0) · Click: Naked Drums (Wilkinson Audio, CC-BY 4.0) · via ScrollScore · Notation: OpenSheetMusicDisplay (BSD-3-Clause). Requirements from ABRSM Piano Practical Grades 2025 & 2026 and Trinity Piano Syllabus from 2023; for practice only — check the official syllabus."],
  obTitle: ["你在準備鋼琴檢定嗎?", "Taking an exam?"],
  obSub: ["選好考試和級數,會打開「檢定」分頁,音階、琶音分頁也會列出這一級的要求;之後隨時可以改。",
    "Pick a board and grade: Exams opens and Scales/Arpeggios list its items. Change any time."],
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
