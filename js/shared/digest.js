/* 本週摘要(給家長 / 老師;PianoDrill / DrumDrill 共用,兩邊逐位元組相同;tools/test/sync.json same)。
   純函式:不碰 DOM、不 import(node 可以直接測:tools/test/checks/digest.mjs)。畫面在 js/main.js 共用部分(頁尾「分享本週摘要」)。
   build({ app, days, mods, daily, lang }) → 多行純文字
   - app = App 名稱(標題與最後一行)
   - days = 最近 7 天的 "YYYY-MM-DD"(舊 → 新;最後一個 = 今天)
   - mods = { tech, sight, ear }:各分頁的練習紀錄(js/shared/practicelog.js 的 log:{ 日期: { n, sec, hits?, total? } })
       技巧寫分鐘、視奏寫題數 + 分鐘、聽力寫題數 + 正確率(= 紀錄卡上的數字,7 天加起來)
   - daily = 這 7 天今日練習過了的關卡名稱([中, 英] 或字串;最多寫 5 個,其他寫「等 n 關」)
   - lang = "zh" | "en"
   練了幾天 = 7 天裡任何一個分頁有練(次數或秒數)的天數;分鐘 = 秒數加總後無條件捨去(跟每週目標一樣),有練但不到 1 分鐘寫「不到 1 分鐘」 */
const MAX_LEVELS = 5;
const num = v => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
const md = s => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;

function sum(log, days){
  const t = { n: 0, sec: 0, hits: 0, total: 0, days: new Set() };
  if (!log || typeof log !== "object") return t;
  for (const d of days) {
    const e = log[d];
    if (!e || typeof e !== "object") continue;
    t.n += num(e.n); t.sec += num(e.sec); t.hits += num(e.hits); t.total += num(e.total);
    if (num(e.n) || num(e.sec)) t.days.add(d);
  }
  return t;
}

export function build({ app = "", days = [], mods = {}, daily = [], lang = "zh" }){
  const en = lang === "en", L = (zh, e) => (en ? e : zh);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const mins = sec => {
    const m = Math.floor(sec / 60);
    return m ? L(`${m} 分鐘`, `${m} min`) : L("不到 1 分鐘", "under 1 min");
  };
  const range = days.length ? `${md(days[0])}–${md(days[days.length - 1])}` : "";
  const lines = [L(`${app} 本週練習(${range})`, `${app} practice this week (${range})`)];
  const t = { tech: sum(mods.tech, days), sight: sum(mods.sight, days), ear: sum(mods.ear, days) };
  const all = new Set([...t.tech.days, ...t.sight.days, ...t.ear.days]);
  const total = t.tech.sec + t.sight.sec + t.ear.sec;
  if (!all.size) {
    lines.push(L("這 7 天還沒有練習紀錄。今天練 5 分鐘就是好的開始。", "No practice in the last 7 days yet. 5 minutes today is a great start."));
  } else {
    lines.push(L(`練了 ${all.size} / 7 天 · 共 ${mins(total)}`, `Practiced ${all.size} of 7 days · ${mins(total)} in all`));
    const none = L("這週沒練", "not this week");
    lines.push(L("技巧：", "Technique: ") + (t.tech.days.size ? mins(t.tech.sec) : none));
    lines.push(L("視奏：", "Sight-reading: ") + (t.sight.days.size ? L(`${t.sight.n} 題 · `, plural(t.sight.n, "question", "questions") + " · ") + mins(t.sight.sec) : none));
    const rate = t.ear.total ? L(` · 正確率 ${Math.round(100 * t.ear.hits / t.ear.total)}%`, ` · ${Math.round(100 * t.ear.hits / t.ear.total)}% right`) : "";
    lines.push(L("聽力：", "Aural: ") + (t.ear.days.size ? L(`${t.ear.n} 題`, plural(t.ear.n, "question", "questions")) + rate : none));
  }
  const names = (Array.isArray(daily) ? daily : []).map(x => (Array.isArray(x) ? x[en ? 1 : 0] : x)).filter(x => typeof x === "string" && x);
  if (names.length) {
    const shown = names.slice(0, MAX_LEVELS), more = names.length - shown.length;
    lines.push(L(`今日練習過關：${shown.join("、")}${more ? ` 等 ${names.length} 關` : ""}`,
      `Levels passed: ${shown.join(", ")}${more ? ` and ${more} more` : ""}`));
  }
  lines.push(L(`— ${app}`, `— ${app}`));
  return lines.join("\n");
}
