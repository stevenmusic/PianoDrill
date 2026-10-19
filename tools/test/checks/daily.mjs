// 今日練習引擎(js/shared/daily.js)的檢查;兩個 App 同一份(sync.json same),verify.mjs 會呼叫;也可以單獨跑:node tools/test/checks/daily.mjs
//   菜單(暖身第一、順序固定、還沒開放的路線、到期複習一天一題)、慢練優先、速度階梯、連續 N 次穩才過關、失手重算、退速度、建議回上一關、
//   快速通道(開 / 關)、回上一關、歡迎回來(≥ 7 天)、複習盒與變化(穩 → 下一盒、不穩 → 上一盒隔天)、拍點模式、跨午夜換日、消毒、沒練不扣分
import { createDaily, cleanDaily, buildPlan, clickPlays, gapBars, verdictOf, addDays, dayNum, DEFAULT_VARY, REVIEW_GAPS, SEG_SEC, METRO, tempoUp, tempoDown } from "../../../js/shared/daily.js";

const ROUTES = [
  { id: "a", name: ["甲", "A"], levels: [
    { id: "A1", name: ["一", "One"], start: 60, target: 69 },
    { id: "A2", name: ["二", "Two"], start: 60, target: 80, need: 2 },
    { id: "A3", name: ["三", "Three"], start: 60, target: 80, click: "one" }] },
  { id: "b", name: ["乙", "B"], unlock: { route: "a", passed: "A1" }, levels: [
    { id: "B1", name: ["一", "One"], start: 50, target: 66,
      vary: [{}, { name: ["斷奏", "Staccato"], q: { articulation: "staccato" } }, { click: "one-three" }, { q: { tonic: "G" } }, { click: "gap", fast: true }] },
    { id: "B2", name: ["二", "Two"], start: 50, target: 66 }] }
];

export default function check(ok){
  let clock = new Date(2026, 9, 19, 9, 0);
  const now = () => clock;
  const mk = (raw = null, extras = { warm: () => ({ no: 1 }) }) => {
    let store = raw;
    const d = createDaily({ routes: ROUTES, load: () => store, save: x => { store = JSON.parse(JSON.stringify(x)); }, now, extras });
    return { d, get store(){ return store; } };
  };
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // ── 拍點模式 ──
  ok(eq([0, 1, 2, 3].map(b => clickPlays("every", b, 4)), [true, true, true, true]), "every 每拍都響");
  ok(eq([0, 1, 2, 3].map(b => clickPlays("two-four", b, 4)), [false, true, false, true]), "two-four 只響 2、4 拍");
  ok(eq([0, 1, 2, 3].map(b => clickPlays("one-three", b, 4)), [true, false, true, false]), "one-three 只響 1、3 拍");
  ok(eq([0, 1, 4, 5].map(b => clickPlays("one", b, 4)), [true, false, true, false]), "one 只響每小節第 1 拍");
  ok(clickPlays("one", -3, 4) && clickPlays("gap", -1, 4, 32), "預備拍一律響");
  ok(eq(gapBars(8), [3, 5]) && eq(gapBars(4), [1, 3]) && eq(gapBars(3), [1, 2]) && eq(gapBars(2), [0, 0]), "gap 中間 2 小節(第一、最後一小節一定響):" + JSON.stringify([gapBars(8), gapBars(4), gapBars(3)]));
  const g8 = Array.from({ length: 32 }, (_, b) => clickPlays("gap", b, 4, 32));
  ok(g8.filter(x => !x).length === 8 && !g8[12] && !g8[19] && g8[11] && g8[20], "gap 8 小節:第 4、5 小節沒有拍點");

  // ── 結果 ──
  ok(verdictOf({ score: 85 }) === "steady" && verdictOf({ score: 84 }) === "near" && verdictOf({ score: 59 }) === "slow" && verdictOf({ score: null }) === "slow", "分數 → 穩 / 差一點 / 太快了");
  ok(verdictOf({ self: "ok" }) === "steady" && verdictOf({ self: "again" }) === "near", "自評 → 穩 / 差一點");

  // ── 第一天:暖身第一,路線 b 還沒開放(秒數加到 a),沒有複習 ──
  let { d } = mk();
  let plan = d.plan();
  ok(plan.length === 2 && plan[0].k === "warm" && plan[1].k === "route" && plan[1].r === "a" && plan[1].lv === "A1", "第一天:暖身 + 路線 a 第 1 關:" + JSON.stringify(plan));
  ok(plan[1].sec === SEG_SEC.route * 2, "還沒開放的路線秒數加到第一條路線");
  ok(d.locked().length === 1 && d.locked()[0].after.id === "A1", "路線 b 寫「a 過了第 1 關就開始」");
  ok(d.state() === "idle", "還沒開始");
  ok(eq(d.plan(), plan), "同一天的菜單不變");

  // ── 慢練優先、速度階梯 ──
  d.begin(); ok(d.state() === "run" && d.seg().k === "warm", "開始 = 第一段(暖身)");
  ok(d.attempt({ bpm: 60, self: "ok" }) === null, "暖身不過關");
  d.addSec(30); d.next();
  let s = d.seg();
  ok(s.k === "route" && s.bpm === 60 && s.click === "every", "新的一關從起始速度開始(不是目標):" + s.bpm);
  let r = d.attempt({ bpm: 60, self: "ok" });
  ok(r.verdict === "steady" && r.nextBpm === 63 && !r.passed, "穩 → 節拍器刻度往上一格(60 → 63):" + r.nextBpm);
  r = d.attempt({ bpm: 63, score: 90 }); ok(r.nextBpm === 66, "穩 → 下一格(63 → 66):" + r.nextBpm);
  r = d.attempt({ bpm: 66, score: 90 }); ok(r.nextBpm === 69, "穩 → 下一格到目標(66 → 69):" + r.nextBpm);
  r = d.attempt({ bpm: 69, score: 90 }); ok(!r.passed && r.streak === 1 && r.need === 3, "到目標第 1 次穩:還沒過(要連續 3 次)");
  r = d.attempt({ bpm: 69, score: 70 }); ok(r.verdict === "near" && r.nextBpm === 69 && r.streak === 0, "差一點 → 同速度、連續次數重算");
  r = d.attempt({ bpm: 69, score: 70 }); ok(r.nextBpm === 66, "連續兩次不穩 → 退一格(69 → 66):" + r.nextBpm);
  r = d.attempt({ bpm: 66, score: 30 }); ok(r.verdict === "slow" && r.nextBpm === 63, "太快了 → 馬上退一格(66 → 63):" + r.nextBpm);
  ok(d.data.prog.a.fast === false, "失手過:快速通道關著");
  d.attempt({ bpm: 63, self: "ok" }); d.attempt({ bpm: 66, self: "ok" });   // 63 → 66 → 69(到目標)
  r = d.attempt({ bpm: 69, self: "ok" }); r = d.attempt({ bpm: 69, self: "ok" });
  ok(!r.passed && r.streak === 2, "到目標連續 2 次:還沒過");
  // 這一段(360 秒)已經練了 320 秒,剩不到 60 秒 → 過關後不接下一關
  d.addSec(320);
  r = d.attempt({ bpm: 69, self: "ok" });
  ok(r.passed && r.nextLevel === "A2" && !r.cont && r.box === 1 && r.due === "2026-10-20", "連續 3 次穩 → 過關、明天複習(盒 1):" + JSON.stringify(r));
  ok(d.data.prog.a.at === "A2" && d.data.prog.a.fast === false, "過關 → 路線往下一關;有失手過不開快速通道");
  ok(d.seg().lv === "A1", "時間不夠:這一段停在原本那一關");
  d.addSec(60); ok(d.segLeft() < 0, "時間到了(只提示)");
  d.next();
  ok(d.state() === "done", "全部段落做完");
  const sum = d.summary({ "2026-10-19": { n: 1, sec: 300 }, "2026-10-17": { n: 2, sec: 60 }, "2026-10-01": { n: 1, sec: 1 } });
  ok(sum.segs === 2 && sum.passed === 1 && sum.week === 2 && sum.tomorrow.map(l => l.id).join() === "A2,B1" && sum.review && sum.review.id === "A1",
    "完成摘要:2 段、過 1 關、最近 7 天 2 天、明天 A2 + B1 + 複習 A1:" + JSON.stringify({ ...sum, tomorrow: sum.tomorrow.map(l => l.id), review: sum.review && sum.review.id }));
  // 再練一下:約 5 分鐘 = 還沒過的那一關(進度比較慢的路線:b 剛開放)+ 一題沒到期的複習(不改排程)
  s = d.addExtra();
  ok(s && s.r === "b" && s.lv === "B1" && d.state() === "run" && d.plan().length === 4 && d.plan()[3].k === "review" && d.plan()[3].extra && d.plan()[3].lv === "A1",
    "再練一下 = 進度比較慢的路線 + 一題沒到期的複習:" + JSON.stringify(d.plan().slice(2)));
  d.next(); s = d.seg();
  r = d.attempt({ bpm: s.bpm, self: "again" });
  ok(s.k === "review" && d.data.lv["a/A1"].box === 1 && d.data.lv["a/A1"].due === "2026-10-20", "加練的複習不改複習盒與到期日");
  d.next(); ok(d.state() === "done", "加練做完回到「練完了」");

  // ── 跨午夜換日:隔天的菜單 = 暖身 + 交錯的路線 + 複習 A1(盒 1 = 原樣) ──
  clock = new Date(2026, 9, 20, 0, 5);
  plan = d.plan();
  ok(plan.length === 4 && plan[0].k === "warm" && plan.some(p => p.k === "review" && p.lv === "A1" && p.box === 1) && plan.some(p => p.r === "b" && p.k === "route"), "隔天:暖身 + a + b + 複習:" + JSON.stringify(plan));
  ok(d.state() === "idle", "換日重排(還沒開始)");
  const orders = new Set();
  for (let i = 0; i < 6; i++) orders.add(buildPlan({ routes: ROUTES, daily: d.data, today: addDays("2026-10-20", i), extras: { warm: () => ({}) } }).map(p => p.k + (p.r || "")).join(","));
  ok(orders.size === 1 && [...orders][0] === "warm,routea,routeb,reviewa", "每天順序固定:暖身 → 主要路線 → 第二條路線 → 複習:" + [...orders].join(" | "));
  d.begin();
  const iRev = d.plan().findIndex(p => p.k === "review");
  s = d.begin(iRev);
  ok(s.k === "review" && s.bpm === 69 && s.click === "every" && eq(s.vary, {}), "複習盒 1:目標速度、原樣");
  r = d.attempt({ bpm: 69, self: "ok" });
  ok(r.box === 2 && r.due === addDays("2026-10-20", 3), "複習穩 → 盒 2、3 天後:" + JSON.stringify(r));
  r = d.attempt({ bpm: 69, self: "again" });
  ok(r.box === 2 && r.due === addDays("2026-10-20", 3), "同一天的第二次不改排程");

  // ── 複習的變化:盒 2 = 只響 2、4;不穩 → 回上一盒、隔天 ──
  clock = new Date(2026, 9, 23, 10, 0);
  s = d.begin(d.plan().findIndex(p => p.k === "review"));
  ok(s && s.box === 2 && s.click === "two-four", "盒 2(第 3 天)= 拍點只響 2、4:" + JSON.stringify(s && { box: s.box, click: s.click }));
  r = d.attempt({ bpm: 69, score: 40 });
  ok(r.box === 1 && r.due === "2026-10-24", "複習不穩 → 退回上一個變化、隔天再來:" + JSON.stringify(r));
  // 直接把盒子推到 4、5:gap、gap + 最快
  d.data.lv["a/A1"].box = 4; d.data.lv["a/A1"].due = "2026-10-23"; d.data.lv["a/A1"].rev = null;
  ok(eq(DEFAULT_VARY[3], { click: "gap" }) && d.reviewBpm("a", "A1", 4) === 69, "盒 4 = 中途消失、目標速度");
  ok(d.reviewBpm("a", "A1", 5) === 72, "盒 5 = 中途消失 + 最快(目標再上一格 69 → 72):" + d.reviewBpm("a", "A1", 5));
  // 關卡自己的變化清單(鋼琴:斷奏、換調…)
  const b1 = d.levelOf("b", "B1");
  ok(b1.n === 1 && b1.vary[1].q.articulation === "staccato", "關卡資料的變化清單");
  // 變化只用學過的(extras.vary):還沒過 A2 → 斷奏拿掉、退回拍點模式
  {
    const ad = (v, { passed }) => (v.q && v.q.articulation && !passed("a", "A2") ? { click: "one" } : v);
    const x = mk({ prog: { a: { at: "A2" }, b: { at: "B2" } }, lv: { "a/A1": { passed: "2026-10-01", box: 1, due: "2026-12-01" }, "b/B1": { passed: "2026-10-01", box: 2, due: "2026-10-02" } } },
      { warm: () => null, vary: ad }).d;
    const i = x.plan().findIndex(p => p.k === "review"), sv = i >= 0 ? x.begin(i) : null;
    ok(sv && sv.lv === "B1" && sv.click === "one" && eq(sv.vary, { click: "one" }), "變化只用學過的:還沒學的換成拍點模式:" + JSON.stringify(sv && sv.vary));
  }

  // ── 快速通道:第一次就連續穩(一次都沒失手)→ 下一關從目標速度開始 ──
  ({ d } = mk(null, {}));
  d.begin();
  for (const b of [60, 63, 66, 69, 69, 69]) r = d.attempt({ bpm: b, self: "ok" });
  ok(r.passed && d.data.prog.a.fast === true, "一次都沒失手過關 → 快速通道打開");
  s = d.seg();
  ok(s.lv === "A2" && r.cont && s.bpm === 80, "時間還夠:直接接下一關、從目標速度開始:" + JSON.stringify({ lv: s.lv, bpm: s.bpm, cont: r.cont }));
  r = d.attempt({ bpm: 80, self: "ok" }); ok(!r.passed && r.need === 2, "A2 只要連續 2 次(關卡覆寫 need)");
  r = d.attempt({ bpm: 80, score: 10 }); ok(d.data.prog.a.fast === false && r.nextBpm === 76, "失手 → 快速通道關掉、退一格(80 → 76):" + r.nextBpm);
  r = d.attempt({ bpm: 76, self: "ok" }); ok(r.nextBpm === 80, "穩 → 上一格(76 → 80):" + r.nextBpm);
  // 建議回上一關:同一個速度連續 4 次不穩
  for (let i = 0; i < 4; i++) r = d.attempt({ bpm: 70, self: "again" });
  ok(r.suggestBack, "同一個速度連續 4 次不穩 → 建議回上一關");
  // 最慢 = 起始速度的下一格(60 → 58)
  for (let i = 0; i < 12; i++) r = d.attempt({ bpm: Math.max(40, r.nextBpm), score: 0 });
  ok(r.nextBpm === 58, "最慢 = 起始速度的下一格:" + r.nextBpm);
  // 回上一關
  ok(d.canBack() && d.back() === "A1" && d.seg().lv === "A1" && d.data.prog.a.at === "A1" && d.data.lv["a/A2"].bpm === 58, "回上一關:原本那一關的速度保留");
  ok(!d.canBack(), "第一關不能再回");

  // ── 歡迎回來(隔 ≥ 7 天):目前那一關從起始速度開始;關卡、盒號不變(沒練不扣分) ──
  clock = new Date(2026, 9, 19, 9, 0);
  ({ d } = mk(null, {}));
  d.begin(); for (const b of [60, 63]) d.attempt({ bpm: b, self: "ok" });
  ok(d.bpmFor("a", "A1") === 66, "練到 66");
  const before = JSON.stringify({ prog: d.data.prog, box: d.data.lv["a/A1"].box });
  clock = new Date(2026, 9, 24, 9, 0);
  ok(d.seg() && d.plan() && d.bpmFor("a", "A1") === 66 && !d.today().welcome, "5 天沒練:速度照舊");
  clock = new Date(2026, 10, 3, 9, 0);
  d.plan();
  s = d.begin();
  ok(d.today().welcome && d.bpmFor("a", "A1") === 60 && s.welcome && JSON.stringify({ prog: d.data.prog, box: d.data.lv["a/A1"].box }) === before,
    "隔 10 天回來:從起始速度開始、關卡不變、寫歡迎回來");

  // ── 一天只排一題複習(到期的累積也一樣;到期日早的優先) ──
  const raw = { prog: { a: { at: "A3" }, b: { at: "B2" } }, lv: {
    "a/A1": { passed: "2026-10-01", box: 3, due: "2026-10-10" }, "a/A2": { passed: "2026-10-02", box: 1, due: "2026-10-05" }, "b/B1": { passed: "2026-10-03", box: 2, due: "2026-10-05" } } };
  const p2 = buildPlan({ routes: ROUTES, daily: cleanDaily(raw, ROUTES), today: "2026-11-01", extras: {} });
  ok(p2.filter(p => p.k === "review").length === 1 && p2.find(p => p.k === "review").lv === "A2", "一天只排一題複習:到期早、盒號小的先:" + JSON.stringify(p2));
  ok(p2.filter(p => p.k === "route").map(p => p.lv).sort().join() === "A3,B2", "沒有暖身(extras 沒給)、兩條路線");
  ok(!p2.some(p => p.k === "route" && p.sec !== SEG_SEC.route), "兩條都開放:各 180 秒");
  const p3 = buildPlan({ routes: ROUTES, daily: cleanDaily({ prog: { a: { at: "A3", done: true } }, lv: { "a/A1": { passed: "2026-10-01", box: 6, due: "2026-12-30" } } }, ROUTES), today: "2026-11-01", extras: {} });
  ok(p3.length === 1 && p3[0].r === "b" && p3[0].sec === SEG_SEC.route * 2, "路線全部過完:不排那一段、秒數給另一條:" + JSON.stringify(p3));

  // ── 消毒 ──
  const bad = cleanDaily({ v: 9, prog: { a: { at: "ZZ", fast: "yes" }, x: { at: "A1" } }, lv: { "a/A1": { bpm: -5, tries: -3, passed: "nope", box: 99 }, "q/Q1": { bpm: 60 }, "a/A2": "x" },
    today: { date: "2026-10-19", plan: [{ k: "route", r: "a", lv: "NO" }, { k: "warm" }, { k: "evil" }], i: 99, done: [5], sec: [-1] }, last: "2026/10/01" }, ROUTES, "2026-10-19");
  ok(bad.prog.a.at === "A1" && bad.prog.a.fast === false && !bad.prog.x && bad.prog.b.at === "B1", "消毒:不認得的關卡 → 第一關、不認得的路線丟掉");
  ok(eq(Object.keys(bad.lv), ["a/A1"]) && bad.lv["a/A1"].bpm === 40 && bad.lv["a/A1"].tries === 0 && !bad.lv["a/A1"].passed, "消毒:數字夾住、日期格式不對丟掉、未知 id 丟掉:" + JSON.stringify(bad.lv));
  ok(bad.today && bad.today.plan.length === 1 && bad.today.plan[0].k === "warm" && bad.today.i === 1 && bad.today.done[0] === 2 && bad.today.sec[0] === 0 && bad.last === null, "消毒:今天的菜單只留認得的段:" + JSON.stringify(bad.today));
  ok(cleanDaily({ today: { date: "2026-10-18", plan: [{ k: "warm" }] } }, ROUTES, "2026-10-19").today === null, "消毒:不是今天的菜單丟掉(重排)");
  for (const junk of [null, 5, "x", [], { prog: 1, lv: [], today: "x" }]) {
    let fine = true; try { const c = cleanDaily(junk, ROUTES); fine = c.prog.a.at === "A1" && c.today === null; } catch (e) { fine = false; }
    ok(fine, "消毒:亂資料 " + JSON.stringify(junk));
  }
  // 存起來再讀回來一樣
  const m = mk(null, {}); m.d.begin(); m.d.attempt({ bpm: 60, self: "ok" });
  const again = createDaily({ routes: ROUTES, load: () => m.store, now });
  ok(again.bpmFor("a", "A1") === 63 && again.state() === "run" && again.seg().lv === "A1", "存檔 → 讀回來接著練");
  ok(dayNum("2026-10-20") - dayNum("2026-10-19") === 1 && addDays("2026-12-31", 1) === "2027-01-01" && addDays("2026-03-01", -1) === "2026-02-28", "日期換算");
  ok(REVIEW_GAPS.join() === "1,3,7,14,30", "複習間隔 1、3、7、14、30 天");
  // 節拍器刻度:往上 / 往下一格;不在刻度上的速度、刻度以外
  ok(METRO.length === 39 && METRO[0] === 40 && METRO[METRO.length - 1] === 208 && METRO.every((m, i) => !i || m > METRO[i - 1]), "節拍器刻度 40 … 208(39 格、遞增)");
  ok(tempoUp(56) === 58 && tempoUp(60) === 63 && tempoUp(62) === 63 && tempoUp(116) === 120 && tempoUp(208) === 216, "往上一格(62 → 63、208 → 216):" + [tempoUp(62), tempoUp(208)]);
  ok(tempoDown(63) === 60 && tempoDown(62) === 60 && tempoDown(42) === 40 && tempoDown(40) === 40 && tempoDown(216) === 208, "往下一格(62 → 60、40 不再低):" + [tempoDown(62), tempoDown(40)]);
  // 目標不在刻度上:最後一步直接到目標
  const offRoutes = [{ id: "o", name: ["丙", "C"], levels: [{ id: "O1", name: ["一", "One"], start: 60, target: 70 }] }];
  const od = createDaily({ routes: offRoutes, load: () => null, now }); od.begin();
  r = od.attempt({ bpm: 66, self: "ok" }); const r2 = od.attempt({ bpm: 69, self: "ok" });
  ok(r.nextBpm === 69 && r2.nextBpm === 70, "目標 70 不在刻度上:66 → 69 → 70:" + [r.nextBpm, r2.nextBpm]);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  let fails = 0, n = 0;
  check((c, msg) => { n++; if (!c) { fails++; console.log("✗ " + msg); } });
  console.log(fails ? `✗ 今日練習引擎:${fails} / ${n} 項失敗` : `✓ 今日練習引擎:${n} 項全部通過`);
  process.exit(fails ? 1 : 0);
}
