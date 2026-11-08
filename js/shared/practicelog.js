/* 練習紀錄卡(技巧、視奏、聽力共用;照 PianoDrill 的紀錄卡:三格數字 + 每週目標 + 最近 7 天)。不寫死前綴:元素用模組自己的 $:
     $("logStreak")、$("logToday")、第三格(模組自己寫)、$("goalBar")、$("goalBtn")、$("logWeek")
   - 從來沒練過:只寫一行「練完第一次,這裡會記下你的進步」(`neverPracticed`、卡片的 .log-empty)
   - log = { "YYYY-MM-DD": { n, sec, hits?, total? } }(各模組自己的 localStorage;保留 400 天)
       n = 完成幾次 / 幾題;sec = 真的播放、準備、作答的秒數(App 在前景、模組在畫面上的時間);hits / total = 聽力的「今天正確率」
   - 每週目標:最近 7 天(含今天)練了幾分鐘;目標點一下換 GOALS 裡的下一個(存在模組自己的 localStorage)。練習設定,不是考試要求
     預設 = GOAL_DEFAULT;使用者點過才算自己選的(goalSet: true,`tapGoal`)。讀進來用 `loadGoal`:
     舊資料沒有 goalSet、存的是舊預設 60 → 當作沒選過(換成新預設);存的是 60 以外 → 一定是點過的,照舊 */
import { tr, getLang, pairText } from "./i18n.js";

export const KEEP_DAYS = 400;
export const GOALS = [15, 30, 40, 60, 90, 120, 180];
export const GOAL_DEFAULT = 40;
const GOAL_OLD_DEFAULT = 60;   // 2026-11 以前的預設(那時沒有 goalSet,沒點過的人也存了 60)
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
/* 讀進來的每週目標:saved = 模組存的物件({ goal, goalSet });回傳 { goal, goalSet } */
export function loadGoal(saved){
  const g = saved && saved.goal, set = !!(saved && saved.goalSet === true);
  if (!GOALS.includes(g)) return { goal: GOAL_DEFAULT, goalSet: false };
  if (set || g !== GOAL_OLD_DEFAULT) return { goal: g, goalSet: true };
  return { goal: GOAL_DEFAULT, goalSet: false };
}
/* 點一下目標鈕:換下一個,記成自己選的 */
export function tapGoal(st){ st.goal = nextGoal(st.goal); st.goalSet = true; return st.goal; }

/* 記一筆:sec 秒、n 次(完成一次 / 一題)、hits / total(聽力的正確率) */
export function addLog(log, { sec = 0, n = 0, hits = 0, total = 0 } = {}){
  const k = dayKey(new Date()), e = log[k] || (log[k] = { n: 0, sec: 0 });
  e.n += n; e.sec += Math.round(Math.max(0, sec || 0));
  if (total) { e.total = (e.total || 0) + total; e.hits = (e.hits || 0) + hits; }
  const keys = Object.keys(log).sort();
  while (keys.length > KEEP_DAYS) delete log[keys.shift()];
  // 外框聽這個事件:第一次練完「分享本週摘要」馬上出現(main.js 的 syncDigest;模組存檔在這之後,所以外框延後一下才讀)
  if (typeof document !== "undefined") document.dispatchEvent(new Event("practicelog"));
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
/* 以前練過(今天以前有紀錄),連續天數是 0 時那一格寫「重新開始」;從沒練過的人照舊寫 0 */
export function freshStart(log){
  const k = dayKey(new Date());
  return streak(log) === 0 && Object.entries(log).some(([d, e]) => d < k && e && (e.n || e.sec));
}
/* 從來沒練過(紀錄裡沒有一天有次數或秒數) */
export const neverPracticed = log => !Object.values(log || {}).some(e => e && (e.n || e.sec));
/* 第一天的空狀態:從來沒練過 → 卡片加 .log-empty(app.css 藏起三格數字、每週目標、7 天點),標題下一行淡字(中英同高);練過一次以後照舊 */
function paintEmpty($, log){
  const box = $("logStreak").closest?.(".card"); if (!box) return;
  const empty = neverPracticed(log);
  box.classList.toggle("log-empty", empty);
  let p = box.querySelector(".log-first");
  if (empty && !p) { p = document.createElement("p"); p.className = "log-first"; const h = box.querySelector(".card-title"); h ? h.after(p) : box.prepend(p); }
  if (p) pairText(p, () => tr("練完第一次，這裡會記下你的進步", "Your progress shows up here after your first practice"));
}
/* 畫紀錄卡(第三格模組自己寫):連續天數、今天次數、每週目標、最近 7 天 */
export function renderLog($, log, goal){
  paintEmpty($, log);
  const t = today(log), g = cleanGoal(goal), min = Math.floor(weekSec(log) / 60);
  // 「重新開始」放在數字那一格,字比數字小(數字那一行的高度不變,三格的標籤對齊);放不下就換行,中英一樣
  if (freshStart(log)) $("logStreak").innerHTML = `<span style="font-size:var(--fs-sm);display:inline-block;line-height:1.2">${tr("重新開始", "Fresh start")}</span>`;
  else $("logStreak").textContent = streak(log);
  $("logToday").textContent = t.n;
  $("goalBar").style.width = Math.min(100, Math.round(100 * min / g)) + "%";
  $("goalBar").classList.toggle("done", min >= g);
  // 達成每週目標:按鈕直接寫「✓ 本週達標」並換成青綠色(跟進度條同色;不跳視窗、不加新的元素)
  const met = min >= g;
  const label = met ? tr(`✓ 本週達標 ${g} 分鐘`, `✓ Goal met · ${g} min`) : tr(`每週目標 ${min}/${g} 分鐘`, `Weekly ${min}/${g} min`);
  $("goalBtn").textContent = label;
  $("goalBtn").classList.toggle("done", met);
  $("goalBtn").setAttribute("aria-label", label + tr("（點一下換目標）", " (tap to change)"));
  const names = getLang() === "en" ? ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] : ["日", "一", "二", "三", "四", "五", "六"];
  let html = "";
  for (let i = 6; i >= 0; i--) {
    const x = new Date(); x.setDate(x.getDate() - i);
    const e = log[dayKey(x)];
    html += `<span class="${i === 0 ? "today" : ""}"><i class="${e && e.n ? "on" : ""}"></i>${names[x.getDay()]}</span>`;
  }
  $("logWeek").innerHTML = html;
}
