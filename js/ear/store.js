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
/* 設定列每一項可以選的值(js/ear/app.js 的選單;讀進來消毒用) */
const CHOICES = {
  note: { range: ["1", "2", "4"], ref: ["C", "A", "none"], naming: ["letter", "solfege"] },
  interval: { dir: ["up", "down", "harm", "mix"], root: ["rand", "C"] },
  chord: { inv: ["root", "all"], style: ["block", "arp", "both", "mix"], root: ["rand", "C"] }
};
let state = null;
export function load(){
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY) || "{}") || {}; } catch (e) {}
  // 讀進來消毒(手改過的備份檔):不是物件 → 空的;每個題型的設定不是選單裡有的(CHOICES)→ 預設(set = 字串陣列、至少一項);
  // 正確率不是 { n, ok } 數字 → 丟掉那一筆
  const obj = v => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  saved = obj(saved);
  const pick = {}, sp = obj(saved.pick);
  for (const [k, d] of Object.entries(DEFAULTS.pick)) {
    const p = { ...d, ...obj(sp[k]) };
    for (const [f, ok] of Object.entries(CHOICES[k])) if (!ok.includes(String(p[f]))) p[f] = d[f];
    const set = Array.isArray(p.set) ? p.set.filter(x => typeof x === "string") : [];
    p.set = set.length ? set : [...d.set];
    pick[k] = p;
  }
  const stats = {};
  for (const [k, v] of Object.entries(obj(saved.stats))) if (v && Number.isFinite(v.n) && Number.isFinite(v.ok)) stats[k] = v;
  state = { ...DEFAULTS, ...saved, pick, stats, log: { ...obj(saved.log) } };
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
