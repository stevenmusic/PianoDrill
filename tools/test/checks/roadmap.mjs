// 路線圖(js/shared/roadmap.js)的檢查;兩個 App 同一份(sync.json same),verify.mjs 會呼叫;也可以單獨跑:node tools/test/checks/roadmap.mjs
//   組數 / 關數加總 = 路線的關數、組照路線順序、過 / 目前 / 還沒到 / 還沒開放的判斷、回上一關(目前那一關以前過了也是「目前」)、整條練完、預設展開的組、
//   各 App 的路線(js/tech/routes.js 的 ROUTES):每一組都有名字(groups[組];中文 ≤ 8 字、英文 ≤ 20 字)
import { roadmap, curGroups } from "../../../js/shared/roadmap.js";
import { cleanDaily } from "../../../js/shared/daily.js";
import { ROUTES as APP_ROUTES } from "../../../js/tech/routes.js";

const ROUTES = [
  { id: "a", name: ["甲", "A"], groups: { "0": ["基礎", "Basics"], A: ["一組", "One"] }, levels: [
    { id: "A0", g: "0", start: 60, target: 60 }, { id: "A1", g: "A", start: 60, target: 80 }, { id: "A2", g: "A", start: 60, target: 80 },
    { id: "B1", g: "B", start: 60, target: 80 }] },
  { id: "b", name: ["乙", "B"], unlock: { route: "a", passed: "A1" }, levels: [{ id: "C1", g: "A", start: 50, target: 66 }, { id: "C2", g: "A", start: 50, target: 66 }] }
];

export default function check(ok){
  const day = "2026-11-01";
  // 第一天:什麼都沒過
  let d = cleanDaily(null, ROUTES);
  let m = roadmap(ROUTES, d);
  ok(m.length === 2, "每條路線一段");
  ok(m[0].groups.map(G => G.g).join() === "0,A,B", "組照路線順序:" + m[0].groups.map(G => G.g));
  ok(m[0].groups.reduce((a, G) => a + G.total, 0) === 4 && m[1].groups.reduce((a, G) => a + G.total, 0) === 2, "每條路線組裡的關數加總 = 路線的關數");
  ok(m[0].groups[0].name && m[0].groups[0].name[0] === "基礎" && m[0].groups[2].name === null, "組名 = groups[組],沒有 = null");
  ok(m[0].groups[0].st === "cur" && m[0].groups[1].st === "todo", "第一天:第一組 = 目前、其他 = 還沒到");
  ok(m[0].groups[0].levels[0].st === "cur" && m[0].groups[1].levels[0].st === "todo", "第一天:第一關 = 目前");
  ok(!m[1].open && m[1].groups.every(G => G.st === "lock" && G.levels.every(l => l.st === "lock")), "還沒開放的路線 = 鎖");
  ok(m[1].after && m[1].after.r === "a" && m[1].after.id === "A1" && m[1].after.n === 2, "開放條件 = 甲第 2 關");
  ok(curGroups(m).join() === "a/0", "預設展開:每條開放路線目前那一組:" + curGroups(m));
  ok(m[0].groups.every(G => G.levels.every(l => l.n >= 1 && l.n <= 4)) && m[0].groups[1].levels[1].n === 3, "關的序號 = 路線裡第幾關");

  // 過了 A0、A1,目前 A2:乙開放
  d = cleanDaily({ prog: { a: { at: "A2" } }, lv: { "a/A0": { passed: day }, "a/A1": { passed: day } } }, ROUTES);
  m = roadmap(ROUTES, d);
  ok(m[0].groups[0].st === "pass" && m[0].groups[0].pass === 1, "第 0 組全過 = 過了");
  ok(m[0].groups[1].st === "cur" && m[0].groups[1].pass === 1 && m[0].groups[1].total === 2, "A 組:目前、過了 1 / 2");
  ok(m[0].groups[1].levels.map(l => l.st).join() === "pass,cur", "A 組的關:過了、目前");
  ok(m[0].groups[2].st === "todo", "B 組 = 還沒到");
  ok(m[1].open && m[1].after === null && m[1].groups[0].st === "cur", "條件那一關過了:乙開放、第一組 = 目前");
  ok(curGroups(m).join() === "a/A,b/A", "兩條路線各展開目前那一組:" + curGroups(m));

  // 回上一關:目前那一關以前過了 → 還是「目前」(組也是目前)
  d = cleanDaily({ prog: { a: { at: "A1" } }, lv: { "a/A0": { passed: day }, "a/A1": { passed: day }, "a/A2": { passed: day } } }, ROUTES);
  m = roadmap(ROUTES, d);
  ok(m[0].groups[1].levels.map(l => l.st).join() === "cur,pass" && m[0].groups[1].st === "cur" && m[0].groups[1].pass === 2, "回上一關:那一關 = 目前、組 = 目前、過了照算");

  // 整條練完:全部過了、沒有目前
  d = cleanDaily({ prog: { a: { at: "B1", done: true } }, lv: Object.fromEntries(["A0", "A1", "A2", "B1"].map(id => ["a/" + id, { passed: day }])) }, ROUTES);
  m = roadmap(ROUTES, d);
  ok(m[0].done && m[0].groups.every(G => G.st === "pass"), "整條練完:每一組 = 過了");
  ok(!curGroups(m).includes("a/B"), "整條練完:不展開");

  // 壞資料:prog 指到不存在的關 → 第一關
  m = roadmap(ROUTES, { prog: { a: { at: "XX" } }, lv: {} });
  ok(m[0].groups[0].levels[0].st === "cur", "壞資料:目前 = 第一關");

  // 各 App 的路線:每一組都有名字、長度;加總 = 關數
  let n = 0;
  for (const R of APP_ROUTES) {
    const x = roadmap(APP_ROUTES, cleanDaily(null, APP_ROUTES)).find(y => y.id === R.id);
    ok(x.groups.reduce((a, G) => a + G.total, 0) === R.levels.length, `${R.id}:組裡的關數加總 = ${R.levels.length}`);
    const seen = new Set();
    for (const G of x.groups) {
      ok(!seen.has(G.g), `${R.id}:${G.g} 組的關要排在一起`); seen.add(G.g);
      ok(Array.isArray(G.name) && G.name.length === 2, `${R.id}:${G.g} 組要有名字(routes.js 的 groups)`);
      if (Array.isArray(G.name)) {
        ok([...G.name[0]].length <= 8, `${R.id}:${G.g} 組中文名 ≤ 8 字:${G.name[0]}`);
        ok(G.name[1].length <= 20, `${R.id}:${G.g} 組英文名 ≤ 20 字:${G.name[1]}`);
      }
      n++;
    }
  }
  return n;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let bad = 0;
  const n = check((c, msg) => { if (!c) { bad++; console.log("✗ " + msg); } });
  console.log(bad ? `路線圖 ✗ ${bad} 項` : `路線圖 ${n} 組 ✓`);
  process.exit(bad ? 1 : 0);
}
