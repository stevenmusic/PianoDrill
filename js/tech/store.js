/* localStorage(私密瀏覽、清除網站資料時可能讀不到或寫不進去:一律 try/catch,讀不到就用預設值) */
const KEY = "fingerdrill.v1";
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
  loop: false, ramp: false, clickOnly: false   // 播放選項
};
let state = null;
export function load(){
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) {}
  state = { ...DEFAULTS, ...saved, filter: { ...DEFAULTS.filter, ...(saved.filter || {}) }, mastery: { ...(saved.mastery || {}) } };
  return state;
}
export function save(){
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}
export function get(){ return state || load(); }
