import { cleanLog, cleanGoal, GOAL_DEFAULT } from "../shared/practicelog.js";
/* localStorage(私密瀏覽、清除網站資料時可能讀不到或寫不進去:一律 try/catch,讀不到就用預設值) */
const KEY = "pianodrill.ear.v1";
const OLD_KEY = "eardrill.v1";   // 同一個網域上的舊工具留下的紀錄:第一次打開時沿用
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
  goal: 60,               // 每週目標(分鐘;js/shared/practicelog.js)
  stats: {},              // "tab:id" 或 "exam|系統|級|測驗|題型" → { n, ok }
  log: {},                // "YYYY-MM-DD" → { n, sec, hits, total }(舊版 { n, ok } 讀進來換成 hits / total)
  theme: "dark"
};
let state = null;
export function load(){
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY) || "{}") || {}; } catch (e) {}
  const pick = {};
  for (const k of Object.keys(DEFAULTS.pick)) pick[k] = { ...DEFAULTS.pick[k], ...((saved.pick || {})[k] || {}) };
  state = { ...DEFAULTS, ...saved, pick, stats: { ...(saved.stats || {}) }, log: { ...(saved.log || {}) } };
  // 練習紀錄換成跟 DrumDrill 一樣的格式;每日目標(題數)換成每週目標(分鐘):舊的題數不沿用
  for (const v of Object.values(state.log)) if (v && typeof v === "object" && !("total" in v) && "ok" in v) { v.total = v.n; v.hits = v.ok; }
  state.log = cleanLog(state.log);
  state.goal = saved.goalUnit === "min" ? cleanGoal(state.goal) : GOAL_DEFAULT; state.goalUnit = "min";
  // 第一次進來各子項目的一行說明:答完一題的子項目 = true
  const intro = {}; if (saved.intro && typeof saved.intro === "object") for (const k of ["note", "interval", "chord"]) if (saved.intro[k] === true) intro[k] = true;
  state.intro = intro;
  return state;
}
export function save(){
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}
export function get(){ return state || load(); }
