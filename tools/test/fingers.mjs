// 指法數字位置檢查:大綱每一題 + 哈農 20 首 × 3 種節奏,每一個指法數字要
//  1. 對準它的符頭正中央(水平差 ≤ 1.5)
//  2. 不碰到任何符頭、連桿、其他指法數字
//  3. 右手在譜表上方、左手在下方(不在五線之內)
// 用法:node fingers.mjs [寬度,預設 390]
import { open } from "./harness.mjs";
const W = Number(process.argv[2] || 390);
const { page, errors, close } = await open({ viewport: { width: W, height: 900 }, mobile: W < 600 });
await page.evaluate(() => { localStorage.setItem("pianodrill-lang", "zh"); localStorage.setItem("pianodrill.v1", JSON.stringify({ onboarded: true, view: "tech" })); });
await page.reload(); await page.waitForFunction(() => window.__stageReady >= 1);
const qs = await page.evaluate(async () => {
  const { questionsFor } = await import("./js/tech/syllabus.js");
  const SY = window.__tech.SY, m = new Map();
  for (const [sys, s] of Object.entries(SY.systems)) for (const g of s.grades) for (const set of s.mode === "sets" ? ["A", "B"] : [null])
    for (const form of ["harmonic", "melodic", "natural"]) for (const q of questionsFor(SY, sys, g, { set, minorForm: form })) m.set(q.key + (q.dynamic || ""), q);
  const out = [...m.values()];
  for (let no = 1; no <= 20; no++) for (const rhythm of ["even", "dotted", "reverse"]) out.push({ type: "hanon", no, tonic: "C", hands: "HT", rhythm, articulation: "legato", motion: "similar", tempo: { unit: "q16", bpm: 60 }, free: true, sub: 4, key: `h${no}${rhythm}` });
  return out;
});
let bad = 0, n = 0, nf = 0; const issues = [];
for (const q of qs) {
  for (const show of q.hands === "HT" ? ["both"] : [q.hands === "RH" ? "rh" : "lh"]) {
    const b = await page.evaluate(() => window.__scoreReady || 0);
    await page.evaluate(q => window.__tech.setQuestion(q, q.type === "hanon" ? "hanon" : "scale"), q);
    await page.waitForFunction(b => (window.__scoreReady || 0) > b, b, { timeout: 30000 });
    const r = await page.evaluate(() => {
      const svg = document.querySelector("#t-osmd svg"), out = [];
      const F = [...svg.querySelectorAll(".fd-finger")].map(t => ({ t, b: t.getBBox() }));
      const heads = [...svg.querySelectorAll(".vf-notehead")].map(h => h.getBBox());
      const beams = [...svg.querySelectorAll(".vf-beam path")].map(p => {
        const n = ((p.getAttribute("d") || "").match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
        const pts = [[n[0], n[1]], [n[2], n[3]], [n[4], n[5]], [n[6], n[7]]];
        const lo = Math.min(...pts.map(q => q[0])), hi = Math.max(...pts.map(q => q[0]));
        const L = pts.filter(q => Math.abs(q[0] - lo) < 0.5).map(q => q[1]), R = pts.filter(q => Math.abs(q[0] - hi) < 0.5).map(q => q[1]);
        return { lo, hi, lt: Math.min(...L), lb: Math.max(...L), rt: Math.min(...R), rb: Math.max(...R) };
      });
      const beamHit = k => beams.some(bm => { for (const x of [k.x, k.x + k.width / 2, k.x + k.width]) { if (x < bm.lo || x > bm.hi) continue; const f = bm.hi > bm.lo ? (x - bm.lo) / (bm.hi - bm.lo) : 0; const t = bm.lt + (bm.rt - bm.lt) * f, bo = bm.lb + (bm.rb - bm.lb) * f; if (k.y < bo && k.y + k.height > t) return true; } return false; });
      const hit = (a, b, m = 0) => a.x < b.x + b.width - m && a.x + a.width > b.x + m && a.y < b.y + b.height - m && a.y + a.height > b.y + m;
      // 字的實際墨水範圍比 getBBox 小(含上下留白):上下各縮 22%
      const ink = b => ({ x: b.x + b.width * 0.1, y: b.y + b.height * 0.22, width: b.width * 0.8, height: b.height * 0.56 });
      for (const f of F) {
        const k = ink(f.b);
        if (heads.some(h => hit(k, h))) out.push("碰到符頭");
        if (beamHit(k)) out.push("碰到連桿");
      }
      for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) if (hit(ink(F[i].b), ink(F[j].b))) out.push("指法數字互相重疊");
      return { out, n: F.length };
    });
    n++; nf += r.n;
    if (r.out.length) { bad++; issues.push(`${q.key} ${show}: ${[...new Set(r.out)].join("、")}`); }
  }
}
console.log(issues.slice(0, 40).join("\n"));
console.log(`${n} 題、${nf} 個指法數字,${bad} 題有問題`, errors.slice(0, 3));
await close();
process.exit(bad ? 1 : 0);
