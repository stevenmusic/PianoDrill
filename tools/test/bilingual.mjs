// 中英文版面一致:同一個畫面狀態,中文、英文各量一次每個可見元素的位置與高度,
// 高度或上緣不同(= 英文換行、多一行、被擠下去)就列出來。各尺寸 × 各分頁 × 對話框
import { open } from "./harness.mjs";
const ALL = [
  ["fold-280", 280, 653, true], ["se1-320", 320, 568, true], ["iphone-390", 390, 844, true], ["promax-430", 430, 932, true],
  ["se-land", 667, 375, true], ["iphone-land", 844, 390, true], ["ipad", 820, 1180, true], ["ipad-land", 1180, 820, true],
  ["laptop", 1280, 800, false], ["fhd", 1920, 1080, false], ["narrow-window", 500, 900, false]
];
const only = process.argv[2];
const VPS = only ? ALL.filter(v => v[0] === only) : ALL;
let bad = 0; const issues = [];
const snap = page => page.evaluate(() => {
  const vis = e => { const s = getComputedStyle(e); if (s.display === "none" || s.visibility === "hidden" || e.closest("[hidden]")) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  return [...document.querySelectorAll("body *")].map(e => {
    if (!vis(e) || e.closest(".quick .opt span") || e.closest("#t-osmd") || e.id === "t-playline" || e.closest("#s-score") || e.closest(".stage")) return null;
    const r = e.getBoundingClientRect();
    return { t: Math.round(r.top + scrollY), h: Math.round(r.height), w: Math.round(r.width), l: Math.round(r.left), name: e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (e.classList.length ? "." + [...e.classList].join(".") : ""), txt: e.textContent.trim().replace(/\s+/g, " ").slice(0, 40) };
  }).filter(Boolean);   // 只比看得到的元素(看不到的 <option> 等數量不同時,不會讓後面全部錯位)
});
async function compare(page, vp, state){
  await page.waitForFunction(() => !document.getElementById("t-loadingMsg").textContent.trim() || document.getElementById("t-loadingMsg").hidden, null, { timeout: 30000 }).catch(() => {});
  const setLang = async l => { const cur = await page.evaluate(() => document.documentElement.lang); if ((cur === "en") !== (l === "en")) { await page.click("#langToggle"); await page.waitForTimeout(900); } };
  await setLang("zh"); const zh = await snap(page);
  await setLang("en"); const en = await snap(page);
  await setLang("zh");
  const seen = new Set();
  for (let i = 0; i < zh.length; i++) {
    const a = zh[i], b = en[i];
    if (!a && !b) continue;
    if (!a || !b) { issues.push(`${vp} ${state}: 只有${a ? "中文" : "英文"}看得到 ${(a || b).name} 「${(a || b).txt}」`); bad++; continue; }
    if (Math.abs(a.h - b.h) > 1) {
      const k = a.name + a.h + b.h; if (seen.has(k)) continue; seen.add(k);
      issues.push(`${vp} ${state}: 高度 ${a.h}→${b.h} ${a.name}「${a.txt}」/「${b.txt}」`); bad++;
    }
  }
  const hz = Math.max(...zh.filter(Boolean).map(x => x.t + x.h)), he = Math.max(...en.filter(Boolean).map(x => x.t + x.h));
  if (Math.abs(hz - he) > 1) { issues.push(`${vp} ${state}: 頁面高度 ${hz}→${he}`); bad++; }
}
for (const [name, w, h, mobile] of VPS) {
  const { page, errors, close } = await open({ viewport: { width: w, height: h }, mobile, dpr: 1 });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("pianodrill-lang", "zh"); });
  await page.reload(); await page.waitForFunction(() => window.__stageReady >= 1);
  const tab = v => page.click(`#tabbar button[data-view="${v}"]`).then(() => page.waitForTimeout(400));
  const sub = v => page.click(`#subSeg button[data-v="${v}"]`).then(() => page.waitForTimeout(400));
  const expand = async sel => { if (await page.isVisible(sel + " .setup-summary")) { await page.click(sel + " .setup-summary"); await page.waitForTimeout(200); } };
  await compare(page, name, "對話框");
  await page.selectOption("#obGrade", "5"); await page.click("#obYes"); await page.waitForTimeout(300);
  await compare(page, name, "檢定 收合");
  const b = await page.evaluate(() => window.__scoreReady || 0);
  await page.click("#t-drawBtn"); await page.waitForFunction(b => (window.__scoreReady || 0) > b, b);
  await expand("#examSetup"); await expand("#t-paneExam");
  await compare(page, name, "檢定 ABRSM");
  await page.click('#systemSeg button[data-v="trinity"]'); await page.waitForTimeout(300);
  await compare(page, name, "檢定 Trinity");
  await sub("sight"); await compare(page, name, "檢定 視奏 Trinity");
  await sub("ear"); await compare(page, name, "檢定 聽力");
  await page.click('#systemSeg button[data-v="abrsm"]'); await page.waitForTimeout(300);
  await tab("tech");
  for (const [t, pane] of [["scale", "#t-paneScale"], ["arp", "#t-paneArp"]]) { await sub(t); await expand(pane); await compare(page, name, t); }
  await sub("hanon"); await compare(page, name, "哈農");
  await tab("sight"); await page.waitForTimeout(1200); await expand("#s-setup"); await compare(page, name, "視奏");
  await tab("ear");
  for (const [t, pane] of [["note", "#e-paneNote"], ["interval", "#e-paneInterval"], ["chord", "#e-paneChord"]]) { await sub(t); await expand(pane); await compare(page, name, "聽音 " + t); }
  await tab("exam"); await sub("tech");
  // 大綱每一題的題目與標籤:中英文行數一樣(用檢定分頁的題目卡實際排版量)
  const diff = await page.evaluate(async () => {
    const { setLang } = await import("./js/shared/i18n.js"), { questionText } = await import("./js/tech/exercise.js"), { questionsFor } = await import("./js/tech/syllabus.js");
    const SY = window.__tech.SY, qs = new Map();
    for (const [sys, s] of Object.entries(SY.systems)) for (const g of s.grades) for (const set of s.mode === "sets" ? ["A", "B"] : [null])
      for (const q of questionsFor(SY, sys, g, { set, minorForm: "harmonic" })) qs.set(q.key + (q.dynamic || ""), q);
    const T = document.getElementById("t-qTitle"); T.classList.remove("empty"); const G = document.getElementById("t-qTags"), out = [];
    const fill = q => { const p = questionText(q); T.textContent = p[0]; G.innerHTML = p.slice(1).map(t => `<span class="q-tag">${t}</span>`).join(""); window.__tech.fitTitle(); return [p.join(" | "), T.offsetHeight, G.offsetHeight]; };
    for (const q of qs.values()) {
      setLang("zh"); const a = fill(q); setLang("en"); const b = fill(q);
      if (a[1] !== b[1] || a[2] !== b[2]) out.push(`題目 ${a[1]}/${a[2]}→${b[1]}/${b[2]}「${a[0]}」/「${b[0]}」`);
    }
    setLang("zh");
    return out;
  });
  for (const d of [...new Set(diff)]) { issues.push(`${name} ${d}`); bad++; }
  for (const e of errors) { issues.push(`${name} console: ${e}`); bad++; }
  await close();
}
console.log(issues.join("\n"));
console.log(bad ? `✗ ${bad} 處中英版面不同` : `✓ ${VPS.length} 種尺寸中英版面一致`);
process.exit(bad ? 1 : 0);
