// 壞掉的 localStorage(手改過的備份檔還原進來):各種壞值寫進去 → 重新整理 → 沒有 pageerror、每個分頁每個子項目都打得開
// 用法:node tools/test/badstore.mjs
import { open } from "./harness.mjs";

const OK_SHELL = JSON.stringify({ onboarded: true, exam: { system: "abrsm", grade: 1 } });
const J = v => JSON.stringify(v);
const bads = [5, "x", [], true, "{bad json", null];   // 整份不是物件(null = 字串 "null")
const raw = v => (typeof v === "string" && v.startsWith("{bad") ? v : J(v));
const CASES = [];
for (const v of bads) for (const k of ["pianodrill.v1", "pianodrill.tech.v1", "pianodrill.ear.v1", "pianodrill.sight.v1", "pianodrill.sight.history.v1", "pianodrill.sight.layout.v2"])
  CASES.push({ [k]: raw(v), ...(k === "pianodrill.v1" ? {} : { "pianodrill.v1": OK_SHELL }) });
const shell = [
  { exam: 5, sub: 5, view: 5, onboarded: true },
  { exam: [], sub: [], view: [], onboarded: true },
  { exam: { system: "zz", grade: "a" }, sub: { tech: 5, ear: [], exam: {}, sight: null }, view: "zz", onboarded: true },
  { exam: { system: "abrsm", grade: 99 }, onboarded: true, view: "exam" },
  { exam: { system: "toString", grade: 1 }, onboarded: true, view: "exam" },
  { exam: { system: "trinity", grade: 2 }, sub: { tech: "zz", ear: "zz", exam: "zz", sight: "zz" }, onboarded: true, view: "exam" }
];
for (const v of shell) CASES.push({ "pianodrill.v1": J(v) });
const mods = {
  "pianodrill.tech.v1": [
    { filter: 5 }, { filter: { cats: 5, seen: "x", quality: 3, excludeMastered: "y" } }, { filter: { cats: { a: 1 }, seen: { a: 1 } } }, { filter: { cats: [5, null] } },
    { mastery: 5, freeBpm: 5 }, { mastery: [], freeBpm: { scale: "x", arp: null } }, { daily: 5, log: "abc", goal: "x" }, { tab: 5, minorForm: [], tempoPct: "x" }
  ],
  "pianodrill.ear.v1": [
    { pick: 5 }, { pick: { note: 5, interval: { set: 5 }, chord: { set: "x" } } }, { pick: { note: { set: ["zz"] }, interval: { set: [] }, chord: { set: [5] } } },
    { pick: { note: { range: 5, ref: [], naming: {} }, interval: { dir: 5, root: null }, chord: { inv: 5, style: [], root: {} } } },
    { stats: 5 }, { stats: [] }, { stats: { "note:0": 5, "note:2": null, "interval:M2": "x", "chord:maj": { n: "a", ok: {} } } }, { log: "abc", goal: "x", auto: 5, adaptive: "x" }
  ],
  "pianodrill.sight.v1": [{ stage: 5, names: "x", read: 5, log: "abc", intro: 5, bpm: [], xn: "x" }, { read: { best: 5, miss: [] } }],
  "pianodrill.sight.history.v1": [{}, [5, null, {}], "x"],
  "pianodrill.sight.layout.v2": [{ a: 5, b: null }, "x"]
};
for (const [k, vs] of Object.entries(mods)) for (const v of vs) CASES.push({ "pianodrill.v1": OK_SHELL, [k]: J(v) });

const { page, errors, close } = await open({ viewport: { width: 390, height: 844 }, mobile: true });
let fail = 0;
for (const c of CASES) {
  errors.length = 0;
  await page.evaluate(c => { localStorage.clear(); for (const [k, v] of Object.entries(c)) localStorage.setItem(k, v); }, c);
  await page.reload();
  let bad = null;
  try {
    await page.waitForFunction(() => window.__stageReady >= 1, null, { timeout: 20000 });
    // 每個分頁、每個子項目(檢定分頁:沒選考試時只有考試卡 → 先選一個)
    for (const view of ["tech", "sight", "ear", "exam"]) {
      await page.evaluate(v => { const sh = window.__shell; if (v === "exam" && !sh.S.exam) sh.setExam("abrsm", 1); sh.showView(v); }, view);
      const subs = await page.$$eval("#subSeg button", bs => bs.map(b => b.dataset.v));
      if (!subs.length) { bad = `${view}:沒有子項目`; break; }
      for (const v of subs) {
        await page.evaluate(v => document.querySelector(`#subSeg button[data-v="${v}"]`).click(), v);
        await page.waitForTimeout(120);
        const vis = await page.evaluate(() => [...document.querySelectorAll(".mod")].some(m => !m.hidden));
        if (!vis) { bad = `${view}/${v}:模組沒有顯示`; break; }
      }
      if (bad) break;
    }
  } catch (e) { bad = "打不開:" + e.message.split("\n")[0]; }
  const errs = errors.filter(e => !/requestfailed/.test(e));
  if (bad || errs.length) { fail++; console.log("✗", JSON.stringify(c), bad || "", errs.slice(0, 3).join(" | ")); }
}
await close();
console.log(fail ? `✗ ${fail} / ${CASES.length} 種壞值出錯` : `✓ ${CASES.length} 種壞值:重新整理後沒有錯誤,每個分頁每個子項目都打得開`);
process.exit(fail ? 1 : 0);
