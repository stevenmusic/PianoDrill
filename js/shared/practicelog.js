/* 練習紀錄卡(技巧、視奏、聽力共用;照 PianoDrill 的紀錄卡:三格數字 + 每週目標 + 最近 7 天)。不寫死前綴:元素用模組自己的 $:
     $("logStreak")、$("logToday")、第三格(模組自己寫)、$("goalBar")、$("goalBtn")、$("logWeek")
   - log = { "YYYY-MM-DD": { n, sec, hits?, total? } }(各模組自己的 localStorage;保留 400 天)
       n = 完成幾次 / 幾題;sec = 真的播放、準備、作答的秒數(App 在前景、模組在畫面上的時間);hits / total = 聽力的「今天正確率」
   - 每週目標:最近 7 天(含今天)練了幾分鐘;目標點一下換 GOALS 裡的下一個(存在模組自己的 localStorage)。練習設定,不是考試要求 */
import { tr, getLang } from "./i18n.js";

export const KEEP_DAYS = 400;
export const GOALS = [15, 30, 60, 90, 120, 180];
export const GOAL_DEFAULT = 60;
export const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const cnt = v => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/* 讀進來先消毒:日期格式不對、不是物件的丟掉;數字負數、非整數的歸零 */
export function cleanLog(log){
  const out = {};
  if (!log || typeof log !== "object" || Array.isArray(log)) return out;
  for (const [k, v] of Object.entries(log)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !v || typeof v !== "object") continue;
    const e = { n: cnt(v.n), sec: cnt(v.sec) };
    if ("total" in v) { e.total = cnt(v.total); e.hits = Math.min(cnt(v.hits), e.total); }
    out[k] = e;
  }
  return out;
}
export const cleanGoal = g => (GOALS.includes(g) ? g : GOAL_DEFAULT);
export const nextGoal = g => GOALS[(GOALS.indexOf(cleanGoal(g)) + 1) % GOALS.length];

/* 記一筆:sec 秒、n 次(完成一次 / 一題)、hits / total(聽力的正確率) */
export function addLog(log, { sec = 0, n = 0, hits = 0, total = 0 } = {}){
  const k = dayKey(new Date()), e = log[k] || (log[k] = { n: 0, sec: 0 });
  e.n += n; e.sec += Math.round(Math.max(0, sec || 0));
  if (total) { e.total = (e.total || 0) + total; e.hits = (e.hits || 0) + hits; }
  const keys = Object.keys(log).sort();
  while (keys.length > KEEP_DAYS) delete log[keys.shift()];
  return e;
}
export const today = log => log[dayKey(new Date())] || { n: 0, sec: 0 };
/* 最近 7 天(含今天)的秒數 */
export function weekSec(log){
  let s = 0; const d = new Date();
  for (let i = 0; i < 7; i++) { const e = log[dayKey(d)]; if (e) s += e.sec || 0; d.setDate(d.getDate() - 1); }
  return s;
}
/* 連續天數:今天還沒練就從昨天算起 */
export function streak(log){
  let n = 0; const d = new Date();
  if (!(log[dayKey(d)] && log[dayKey(d)].n)) d.setDate(d.getDate() - 1);
  while (log[dayKey(d)] && log[dayKey(d)].n) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
/* 畫紀錄卡(第三格模組自己寫):連續天數、今天次數、每週目標、最近 7 天 */
export function renderLog($, log, goal){
  const t = today(log), g = cleanGoal(goal), min = Math.floor(weekSec(log) / 60);
  $("logStreak").textContent = streak(log);
  $("logToday").textContent = t.n;
  $("goalBar").style.width = Math.min(100, Math.round(100 * min / g)) + "%";
  $("goalBar").classList.toggle("done", min >= g);
  // 達成每週目標:按鈕直接寫「✓ 本週達標」並換成青綠色(跟進度條同色;不跳視窗、不加新的元素)
  const met = min >= g;
  const label = met ? tr(`✓ 本週達標 ${g} 分鐘`, `✓ Goal met · ${g} min`) : tr(`每週目標 ${min}/${g} 分鐘`, `Weekly ${min}/${g} min`);
  $("goalBtn").textContent = label;
  $("goalBtn").classList.toggle("done", met);
  $("goalBtn").setAttribute("aria-label", label + tr("(點一下換目標)", " (tap to change)"));
  const names = getLang() === "en" ? ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] : ["日", "一", "二", "三", "四", "五", "六"];
  let html = "";
  for (let i = 6; i >= 0; i--) {
    const x = new Date(); x.setDate(x.getDate() - i);
    const e = log[dayKey(x)];
    html += `<span class="${i === 0 ? "today" : ""}"><i class="${e && e.n ? "on" : ""}"></i>${names[x.getDay()]}</span>`;
  }
  $("logWeek").innerHTML = html;
}
