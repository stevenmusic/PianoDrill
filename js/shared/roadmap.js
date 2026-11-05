/* 今日練習的路線圖(PianoDrill / DrumDrill 共用,兩邊逐位元組相同;tools/test/sync.json same)。
   純函式:不碰 DOM(node 可以直接測:tools/test/checks/roadmap.mjs);畫面在 js/shared/dailycard.js(今日卡的「路線」鈕,點了在卡內往下展開)。
   第一版只看、不能跳關練。
   roadmap(routes, d) → 每條路線一段:
     { id, route, open(開放了沒)、done(整條練完)、after(還沒開放:開放條件那一關 { r, id, n }), groups: [組…] }
     組 = { key(「路線/組」)、g、name(路線資料的 groups[組] = [中, 英];沒有 = null,畫面寫「A 組」)、st、pass(過了幾關)、total、levels: [{ id, n, level, st }] }
   - 一關的狀態 st:"cur" = 這條路線現在練的那一關(prog.at;回上一關以後也是它,就算以前過了)、"pass" = 過了、"todo" = 還沒到;路線還沒開放 = "lock"
   - 一組的狀態:有目前那一關 = "cur"、全部過了 = "pass"、路線還沒開放 = "lock"、其他 = "todo"
   d = daily.js 消毒過的資料(daily.data:prog、lv) */
import { isOpen } from "./daily.js";

const groupOf = L => (L.g == null ? "" : String(L.g));
export function roadmap(routes, d){
  const lv = (d && d.lv) || {}, prog = (d && d.prog) || {};
  return routes.map(R => {
    const open = isOpen(R, { lv }, routes);
    const p = prog[R.id] || {}, done = !!p.done;
    const at = R.levels.some(l => l.id === p.at) ? p.at : R.levels[0].id;
    const groups = [];
    R.levels.forEach((L, i) => {
      const e = lv[R.id + "/" + L.id], passed = !!(e && e.passed);
      const st = !open ? "lock" : !done && L.id === at ? "cur" : passed ? "pass" : "todo";
      const g = groupOf(L);
      let G = groups[groups.length - 1];
      if (!G || G.g !== g) {
        G = { key: R.id + "/" + g, g, name: (R.groups && R.groups[g]) || null, st: "todo", pass: 0, total: 0, levels: [] };
        groups.push(G);
      }
      G.levels.push({ id: L.id, n: i + 1, level: L, st });
      G.total++;
      if (passed) G.pass++;
    });
    for (const G of groups) {
      G.st = !open ? "lock" : G.levels.some(x => x.st === "cur") ? "cur" : G.levels.every(x => x.st === "pass") ? "pass" : "todo";
    }
    let after = null;
    if (!open && R.unlock) {
      const A = routes.find(x => x.id === R.unlock.route), n = A ? A.levels.findIndex(l => l.id === R.unlock.passed) + 1 : 0;
      if (n > 0) after = { r: A.id, id: R.unlock.passed, n };
    }
    return { id: R.id, route: R, open, done, after, groups };
  });
}
/* 預設展開的組:每條開放的路線「目前那一組」(整條練完 = 不展開) */
export const curGroups = map => map.filter(x => x.open).map(x => x.groups.find(G => G.st === "cur")).filter(Boolean).map(G => G.key);
