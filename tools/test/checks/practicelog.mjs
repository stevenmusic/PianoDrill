// 練習紀錄卡(js/shared/practicelog.js)的檢查;兩個 App 同一份(sync.json same),verify.mjs 會呼叫;也可以單獨跑:node tools/test/checks/practicelog.mjs
//   每週目標:預設 40、選項有 40、點一下照順序換;舊資料存 60 沒有 goalSet = 沒選過 → 40;60 以外 / 有 goalSet = 自己選的,照舊;壞值 → 40
//   第一天的空狀態:從來沒練過(沒有一天有次數或秒數)才是 neverPracticed
//   「重新開始」:連續天數 0 而且今天以前練過才出現;從沒練過、今天第一次練、連續中都不出現;達標的按鈕寫實際的目標分鐘
import { GOALS, GOAL_DEFAULT, nextGoal, loadGoal, tapGoal, freshStart, renderLog, dayKey, neverPracticed } from "../../../js/shared/practicelog.js";

const ago = n => { const d = new Date(); d.setDate(d.getDate() - n); return dayKey(d); };
function card(){
  const el = () => ({ textContent: "", innerHTML: "", style: {}, cls: new Set(), attr: {},
    classList: { toggle(c, on){ on ? this.o.cls.add(c) : this.o.cls.delete(c); } }, setAttribute(k, v){ this.attr[k] = v; } });
  const els = {};
  for (const k of ["logStreak", "logToday", "goalBar", "goalBtn", "logWeek"]) { const e = el(); e.classList.o = e; els[k] = e; }
  return { $: k => els[k], els };
}

export default function check(ok){
  // 每週目標
  ok(GOAL_DEFAULT === 40, `預設應該是 40:${GOAL_DEFAULT}`);
  ok(GOALS.includes(40) && GOALS.join() === "15,30,40,60,90,120,180", `選項:${GOALS.join()}`);
  ok(nextGoal(40) === 60 && nextGoal(180) === 15 && nextGoal(30) === 40, "點一下的順序");
  const lg = s => JSON.stringify(loadGoal(s));
  ok(lg({}) === JSON.stringify({ goal: 40, goalSet: false }), `沒存過 → 40:${lg({})}`);
  ok(lg(null) === JSON.stringify({ goal: 40, goalSet: false }), "null → 40");
  ok(lg({ goal: 60 }) === JSON.stringify({ goal: 40, goalSet: false }), `舊資料 60 沒有 goalSet → 40:${lg({ goal: 60 })}`);
  ok(lg({ goal: 60, goalSet: true }) === JSON.stringify({ goal: 60, goalSet: true }), "自己選的 60 照舊");
  ok(lg({ goal: 90 }) === JSON.stringify({ goal: 90, goalSet: true }), "舊資料 90(一定點過)照舊");
  ok(lg({ goal: 15 }) === JSON.stringify({ goal: 15, goalSet: true }), "舊資料 15 照舊");
  ok(lg({ goal: 40, goalSet: true }) === JSON.stringify({ goal: 40, goalSet: true }), "自己選的 40 照舊");
  ok(lg({ goal: 45, goalSet: true }) === JSON.stringify({ goal: 40, goalSet: false }), "不在選項裡 → 40");
  ok(lg({ goal: "60", goalSet: "yes" }) === JSON.stringify({ goal: 40, goalSet: false }), "型別不對 → 40");
  const st = { goal: 40, goalSet: false };
  ok(tapGoal(st) === 60 && st.goal === 60 && st.goalSet === true, "點一下 → 60、記成自己選的");
  ok(lg(JSON.parse(JSON.stringify(st))) === JSON.stringify({ goal: 60, goalSet: true }), "點過的 60 存了再讀照舊");

  // 重新開始
  ok(!freshStart({}), "從沒練過不寫重新開始");
  ok(!freshStart({ [ago(0)]: { n: 1, sec: 30 } }), "今天第一次練(以前沒練過)不寫");
  ok(!freshStart({ [ago(1)]: { n: 1, sec: 30 } }), "昨天練過(連續 1 天)不寫");
  ok(!freshStart({ [ago(5)]: { n: 1, sec: 30 }, [ago(0)]: { n: 1, sec: 30 } }), "斷了又練(今天連續 1 天)不寫");
  ok(freshStart({ [ago(3)]: { n: 2, sec: 90 } }), "3 天前練過、連續 0 → 重新開始");
  ok(freshStart({ [ago(3)]: { n: 2, sec: 90 }, [ago(0)]: { n: 0, sec: 20 } }), "今天有秒數但還沒完成一次 → 仍是重新開始");
  ok(!freshStart({ [ago(3)]: { n: 0, sec: 0 } }), "空的紀錄不算練過");

  // 第一天的空狀態
  ok(neverPracticed({}) && neverPracticed(null) && neverPracticed({ [ago(2)]: { n: 0, sec: 0 } }), "從沒練過 = 空狀態");
  ok(!neverPracticed({ [ago(0)]: { n: 0, sec: 20 } }) && !neverPracticed({ [ago(9)]: { n: 1, sec: 0 } }), "練過(有秒數或次數)不是空狀態");

  // 畫卡片(node 沒有 localStorage = 英文):「重新開始」、0、數字;達標的分鐘照實際目標
  {
    const a = card(); renderLog(a.$, { [ago(4)]: { n: 1, sec: 60 } }, 40);
    ok(/Fresh start/.test(a.els.logStreak.innerHTML), `重新開始沒畫出來:${a.els.logStreak.innerHTML}`);
    const b = card(); renderLog(b.$, {}, 40);
    ok(b.els.logStreak.textContent === 0 && !b.els.logStreak.innerHTML, "從沒練過寫 0");
    const c = card(); renderLog(c.$, { [ago(0)]: { n: 1, sec: 60 }, [ago(1)]: { n: 1, sec: 60 } }, 40);
    ok(c.els.logStreak.textContent === 2, "連續 2 天寫 2");
    const d = card(); renderLog(d.$, { [ago(0)]: { n: 1, sec: 40 * 60 } }, 40);
    ok(d.els.goalBtn.textContent === "✓ Goal met · 40 min" && d.els.goalBtn.cls.has("done"), `達標 40:${d.els.goalBtn.textContent}`);
    const e = card(); renderLog(e.$, { [ago(0)]: { n: 1, sec: 40 * 60 } }, 90);
    ok(e.els.goalBtn.textContent === "Weekly 40/90 min" && !e.els.goalBtn.cls.has("done"), `目標 90:${e.els.goalBtn.textContent}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let fails = 0, n = 0;
  check((c, m) => { n++; if (!c) { fails++; console.log("✗ " + m); } return c; });
  console.log(fails ? `✗ ${fails} / ${n} 項失敗` : `✓ 練習紀錄卡 ${n} 項`);
  process.exit(fails ? 1 : 0);
}
