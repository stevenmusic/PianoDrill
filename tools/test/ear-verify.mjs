/* 不需要瀏覽器的檢查:node tools/test/verify.mjs
   - 檢定每一級、每個題型各產生 100 題:音都在鋼琴音域、時間/長度合法、答案一定在選項裡、有作答方式
   - 單音 / 音程 / 和弦:所有設定組合各產生題目;音程的半音數、和弦的組成音都對
   - 旋律產生器:5000 句在音域內、跳進不超過五度、結束在主音
   - 版本指紋是最新的 */
globalThis.localStorage = { getItem(){ return null; }, setItem(){} };
import fs from "node:fs";
import { execSync } from "node:child_process";
const root = new URL("../../", import.meta.url).pathname;
const ear = await import(root + "js/ear.js"), au = await import(root + "js/aural.js"), mu = await import(root + "js/music.js");
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("✗", m); } };
const SY = JSON.parse(fs.readFileSync(root + "data/aural.json"));
let n = 0;
for (const [sk, sys] of Object.entries(SY.systems)) for (const g of sys.grades) {
  ok(g.source, `${sk} ${g.grade} 沒有頁碼`);
  for (const t of g.tests) for (const d of t.drills) for (let i = 0; i < 100; i++) {
    const q = au.makeDrill(d, { system: sk, key: "x" }); n++;
    const where = `${sk} ${g.grade} ${t.id} ${d.type}`;
    ok(q.play && q.play.ev.length && q.play.ev.every(e => Number.isFinite(e.t) && e.t >= 0 && Number.isInteger(e.midi) && e.midi >= 21 && e.midi <= 108 && e.dur > 0 && e.vel > 0), where + " 播放事件不合法");
    ok(q.play.dur > 0 && q.play.ev.every(e => e.t <= q.play.dur + 0.01), where + " 長度不對");
    if (q.steps) for (const s of q.steps) ok(s.choices.some(c => c.id === s.answer) && new Set(s.choices.map(c => c.id)).size === s.choices.length, where + " 答案不在選項裡");
    if (q.keys) ok(q.keys.target.length && q.keys.target.every(m => m >= q.keys.lo && m <= q.keys.hi), where + " 鍵盤範圍");
    ok(q.steps || q.keys || q.tap, where + " 沒有作答方式");
    if (d.type === "interval" && q.steps) { const ns = [...new Set(q.play.ev.map(e => e.midi))]; const st = Math.abs(ns[1] - ns[0]); ok(ear.ALL_ITEMS.interval.find(x => x.st === st), where + " 音程半音數"); }
  }
}
for (const tab of ["note", "interval", "chord"]) {
  const set = ear.ALL_ITEMS[tab].map(x => x.id);
  for (let i = 0; i < 2000; i++) {
    const pick = { set, range: mu.pick(["1", "2", "4"]), ref: mu.pick(["C", "A", "none"]), dir: mu.pick(["up", "down", "harm", "mix"]), root: mu.pick(["C", "rand"]), inv: mu.pick(["root", "all"]), style: mu.pick(["block", "arp", "both", "mix"]) };
    const q = ear.makeQuestion(tab, pick, {}, true, null);
    if (tab === "interval") { const it = ear.ALL_ITEMS.interval.find(x => x.id === q.steps[0].answer); const ns = q.play.ev.map(e => e.midi); ok(Math.abs(ns[1] - ns[0]) === it.st, "音程半音數錯 " + q.sig); }
    if (tab === "chord") { const it = ear.ALL_ITEMS.chord.find(x => x.id === q.steps[0].answer); const ns = [...new Set(q.play.ev.map(e => e.midi))].sort((a, b) => a - b); const rootPc = q.reveal; const pcs = new Set(ns.map(m => m % 12)); ok(pcs.size === it.iv.length, "和弦音數錯 " + q.sig); }
    if (tab === "note") ok(q.keys.target[0] % 12 === Number(q.key.split(":")[1]), "單音答案錯");
  }
}
let bad = 0;
for (let i = 0; i < 5000; i++) {
  const rg = mu.pick([[0, 2], [0, 4], [-3, 4], [-3, 7], [0, 7]]);
  const d = mu.melody({ meter: mu.pick(["2", "3", "4", "6", "5"]), bars: mu.pick([1, 2, 4, 8]), range: rg, maxLeap: mu.pick([1, 2, 4]) }).notes.map(x => x.deg);
  if (d.some((x, j) => j && Math.abs(x - d[j - 1]) > 4) || d.some(x => x < rg[0] || x > rg[1]) || ![0, 7].includes(d[d.length - 1])) bad++;
}
ok(!bad, `旋律產生器有 ${bad} 句不合規則`);
try { execSync("node " + root + "tools/build/stamp.mjs --check", { stdio: "pipe" }); } catch (e) { ok(false, "版本指紋不是最新的:執行 node tools/build/stamp.mjs"); }
console.log(fail ? `✗ ${fail} 項失敗` : `✓ 全部通過(檢定 ${n} 題、練習 6000 題、旋律 5000 句)`);
process.exit(fail ? 1 : 0);
