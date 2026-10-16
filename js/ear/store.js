/* localStorage(私密瀏覽、清除網站資料時可能讀不到或寫不進去:一律 try/catch,讀不到就用預設值) */
const KEY = "eardrill.v1";
const DEFAULTS = {
  tab: "note",
  exam: null,             // { system, grade }:準備的考試(第一次打開時問);null = 自由練習
  onboarded: false,
  pick: {
    note: { set: ["0", "2", "4", "5", "7", "9", "11"], range: "1", ref: "C", naming: "letter" },
    interval: { set: ["M2", "M3", "P4", "P5", "P8"], dir: "up", root: "rand" },
    chord: { set: ["maj", "min"], inv: "root", style: "block", root: "rand" }
  },
  auto: true, adaptive: true,
  goal: 20,               // 每日目標(題數)
  stats: {},              // "tab:id" 或 "exam|系統|級|測驗|題型" → { n, ok }
  log: {},                // "YYYY-MM-DD" → { n, ok }
  theme: "dark"
};
let state = null;
export function load(){
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) {}
  const pick = {};
  for (const k of Object.keys(DEFAULTS.pick)) pick[k] = { ...DEFAULTS.pick[k], ...((saved.pick || {})[k] || {}) };
  state = { ...DEFAULTS, ...saved, pick, stats: { ...(saved.stats || {}) }, log: { ...(saved.log || {}) } };
  return state;
}
export function save(){
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}
export function get(){ return state || load(); }
