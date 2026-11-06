import { cleanLog, loadGoal } from "../shared/practicelog.js";
/* localStorage(私密瀏覽、清除網站資料時可能讀不到或寫不進去:一律 try/catch,讀不到就用預設值) */
const KEY = "pianodrill.tech.v1";
const OLD_KEY = "fingerdrill.v1";   // 同一個網域上的舊工具留下的紀錄:第一次打開時沿用
const DEFAULTS = {
  tab: "scale",
  exam: null,             // { system, grade, set }:準備的考試(第一次打開時問);null = 自由練習
  onboarded: false,
  filter: { quality: "all", cats: ["scale", "contrary", "apart", "double", "chromatic", "wholetone", "arpeggio", "seventh", "broken"], excludeMastered: false },
  minorForm: "harmonic",
  tempoPct: 100,          // 檢定題目:練習速度 = 考試速度的幾 %(新題目沿用)
  freeBpm: { scale: 60, arp: 60 },   // 自由練習的速度(♩)
  quickOpen: false,       // 音階/琶音分頁上方「本級要求」清單是否展開(預設收起;舊的 quickOn 不再用)
  mastery: {},            // masteryKey → "good" | "weak"
  theme: "dark",
  loop: false, ramp: false, clickOnly: false,  // 播放選項
  listen: true            // 今日練習「麥克風聽你彈」(會聽的關;false = 關掉,照原本自己按「做到了」)
};
let state = null;
export function load(){
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY) || "{}") || {}; } catch (e) {}
  // 讀進來消毒(手改過的備份檔):不是物件 → 空的;抽考範圍的類別不是字串陣列 → 預設
  const obj = v => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  const strs = v => (Array.isArray(v) ? v.filter(x => typeof x === "string") : null);
  saved = obj(saved);
  const filter = { ...DEFAULTS.filter, ...obj(saved.filter) };
  filter.cats = strs(filter.cats) || [...DEFAULTS.filter.cats];
  if (filter.seen !== undefined) filter.seen = strs(filter.seen) || [];
  state = { ...DEFAULTS, ...saved, filter, mastery: { ...obj(saved.mastery) } };
  state.log = cleanLog(state.log); Object.assign(state, loadGoal(saved));   // 練習紀錄、每週目標(分鐘;goalSet = 自己點過;js/shared/practicelog.js)
  // 第一次進來各子項目的一行說明:播放過一次的子項目 = true
  const intro = {}; if (saved.intro && typeof saved.intro === "object") for (const k of ["scale", "arp", "hanon"]) if (saved.intro[k] === true) intro[k] = true;
  state.intro = intro;
  // 今日練習的音名開關(每條路線記住;沒切過 = 照關卡的預設)
  const dn = {}; if (saved.dnames && typeof saved.dnames === "object") for (const k of ["finger", "accomp"]) if (typeof saved.dnames[k] === "boolean") dn[k] = saved.dnames[k];
  state.dnames = dn;
  state.listen = saved.listen !== false;
  return state;
}
export function save(){
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}
export function get(){ return state || load(); }
