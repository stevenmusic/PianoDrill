/* 播放軸對準符頭正中央(兩個 App 同一份):每一個音、休止符的那一拍,播放軸中心跟符頭中心差幾 px。
   技巧(一整行 / 換行排法)、視奏(考卷排法,stage.js)。容許 ≤ 2 px(線寬 2 px 的取整)。
     node tools/test/playhead.mjs [寬度,預設 390] */
import { open } from "./harness.mjs";
const W = Number(process.argv[2] || 390);
const { page, close, errors } = await open({ viewport: { width: W, height: 844 }, mobile: W < 600 });
const app = await page.evaluate(() => (document.title.includes("Drum") ? "dd" : "pd"));
const pre = app === "pd" ? "pianodrill" : "drumdrill";
await page.evaluate(([p]) => { localStorage.clear(); localStorage.setItem(p + "-lang", "zh"); localStorage.setItem(p + ".v1", JSON.stringify({ onboarded: true, view: "tech" })); }, [pre]);
await page.reload(); await page.waitForFunction(() => window.__stageReady >= 1);

/* 在頁面裡:每個起音(含休止符、不含裝飾音)的拍位置與符頭中心(螢幕 x) */
const TARGETS = `(() => {
  const center = n => { const g = n.getSVGGElement && n.getSVGGElement(); if (!g) return null;
    const hs = [...g.querySelectorAll(".vf-notehead")].filter(e => !e.closest(".vf-modifiers"));
    const rs = (hs.length ? hs : [g]).map(e => e.getBoundingClientRect()).filter(r => r.width);
    return rs.length ? rs.reduce((s, r) => s + r.x + r.width / 2, 0) / rs.length : null; };
  return (osmd) => { const out = [];
    for (const row of osmd.GraphicSheet.MeasureList) for (const gm of row) { if (!gm) continue;
      const dur = gm.parentSourceMeasure.Duration.RealValue, abs = gm.parentSourceMeasure.AbsoluteTimestamp.RealValue;
      for (const se of gm.staffEntries) { const ns = [], rs = [];
        for (const v of se.graphicalVoiceEntries) for (const n of v.notes) { const s = n.sourceNote; if (s && s.IsGraceNote) continue; const rest = !!(s && s.isRest && s.isRest());
          if (rest && s.Length.RealValue >= dur - 1e-9) continue; const x = center(n); if (x != null) (rest ? rs : ns).push(x); }
        const xs = ns.length ? ns : rs;   // 有音就對準音;整小節休止不算
        if (xs.length) out.push({ bar: gm.MeasureNumber, f: se.relInMeasureTimestamp.RealValue / dur, beat: (abs + se.relInMeasureTimestamp.RealValue) * 4, x: xs.reduce((a, b) => a + b, 0) / xs.length });
      } }
    const m = new Map(); for (const t of out) { const k = t.beat.toFixed(4); const a = m.get(k); if (a) { a.x = (a.x * a.n + t.x) / (a.n + 1); a.n++; } else m.set(k, { ...t, n: 1 }); }
    return [...m.values()].sort((a, b) => a.beat - b.beat); }; })()`;

async function today(){
  await page.evaluate(() => window.__shell.showView("tech", "today")); await page.waitForTimeout(800);
  await page.evaluate(() => { const b = document.querySelector("#t-dailyCard button"); if (b) b.click(); });
  await page.waitForTimeout(2500);
  return checkTech("今日練習");
}
async function checkTech(label){
  await page.waitForFunction(() => window.__tech && window.__tech.osmd && window.__tech.osmd.GraphicSheet, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  return page.evaluate(([src, label]) => {
    const targets = eval(src)(window.__tech.osmd);
    const move = window.__tech.movePlayline || (window.__tech.score && window.__tech.score.movePlayline);
    if (!move) return { label, n: 0, worst: 0, bad: [] };
    const pl = document.getElementById("t-playline"); pl.hidden = false;
    const bad = []; let worst = 0, len = 0;
    const last = targets.length ? targets[targets.length - 1].beat : 0;
    for (const t of targets) {
      if (t.beat >= last + 1e-6) continue;
      move(t.beat, false);
      const r = pl.getBoundingClientRect(), d = Math.abs(r.x + r.width / 2 - t.x); len++;
      worst = Math.max(worst, d); if (d > 2) bad.push(`${label} 拍 ${t.beat}: 差 ${d.toFixed(1)} px`);
    }
    return { label, n: len, worst: +worst.toFixed(1), bad };
  }, [TARGETS, label]);
}
async function checkSight(label){
  await page.waitForFunction(() => window.__osmd && window.__osmd.GraphicSheet && window.__stage, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  return page.evaluate(([src, label]) => {
    const st = window.__stage; st.measure(); st.begin();
    const targets = eval(src)(window.__osmd);
    const pl = document.getElementById("s-playline"); pl.style.transition = "none";
    const bad = []; let worst = 0;
    for (const t of targets) {
      st.update(t.bar, t.f);
      const r = pl.getBoundingClientRect(), d = Math.abs(r.x + r.width / 2 - t.x);
      worst = Math.max(worst, d); if (d > 2) bad.push(`${label} 第 ${t.bar} 小節 ${t.f.toFixed(3)}: 差 ${d.toFixed(1)} px`);
    }
    st.end();
    return { label, n: targets.length, worst: +worst.toFixed(1), bad };
  }, [TARGETS, label]);
}

const res = [];
if (app === "pd") {
  for (const sub of ["scale", "arp", "hanon"]) { await page.evaluate(s => window.__shell.showView("tech", s), sub); res.push(await checkTech("技巧 " + sub)); }
  res.push(await today());
  for (const g of [0, 1, 3, 6]) { await page.evaluate(g => { window.__shell.setExam("abrsm", g); window.__shell.showView("exam", "sight"); }, g); await page.waitForTimeout(500);
    await page.evaluate(() => { const b = document.getElementById("s-generate"); if (b) b.click(); }); res.push(await checkSight(`視奏 ${g} 級`)); }
} else {
  for (const sub of ["roll", "diddle", "flam", "drag"]) { await page.evaluate(s => window.__shell.showView("tech", s), sub); res.push(await checkTech("技巧 " + sub)); }
  res.push(await today());
  for (const [sys, g] of [["rsl", 1], ["rsl", 4], ["trinity", 3]]) { await page.evaluate(([sys, g]) => window.__sight.goto(sys, g), [sys, g]); res.push(await checkSight(`視奏 ${sys} ${g}`)); }
}
await close();
for (const r of res) console.log(`${r.bad.length ? "✗" : "✓"} ${r.label}:${r.n} 個起音,最大差 ${r.worst} px`);
const bad = res.flatMap(r => r.bad);
if (errors.length) console.log(errors.slice(0, 5).join("\n"));
if (bad.length) { console.error(bad.slice(0, 20).join("\n")); process.exit(1); }
console.log("✓ 播放軸都對準符頭正中央");
