// 今日練習的關卡譜:每一關(手指 33、伴奏 17、暖身)× 每種變化(複習盒 1–6)× 每種尺寸,譜要整份放進譜框(不左右捲)
// 檢查:SVG 寬度 ≤ 譜框寬度、譜框不能左右捲、整頁沒有橫向捲動、縮放不小於可讀的大小(每行 2 小節以上 0.55,一小節一行 0.45)
// 用法:node tools/test/dailyfit.mjs [尺寸,…](預設 fold-280,se1-320,iphone-390,iphone-land,ipad,desktop);ALL=1 = 每個尺寸都跑全部變化
//       (預設只有 fold-280、iphone-390 跑全部變化,其他尺寸跑原樣與換調)
import { open } from "./harness.mjs";
const VPS = { "fold-280": [280, 653, true], "se1-320": [320, 568, true], "iphone-390": [390, 844, true], "iphone-land": [844, 390, true], "ipad": [820, 1180, true], "desktop": [1440, 900, false] };
const only = (process.argv[2] || Object.keys(VPS).join(",")).split(",");
const full = new Set(process.env.ALL ? only : ["fold-280", "iphone-390"]);
let bad = 0, total = 0;
for (const vp of only) {
  const [w, hh, mobile] = VPS[vp];
  const h = await open({ viewport: { width: w, height: hh }, mobile, dpr: 1 });
  const { page } = h;
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("pianodrill-lang", "zh"); });
  await page.reload(); await page.waitForFunction(() => window.__stageReady >= 1);
  await page.click("#obNo").catch(() => {}); await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelector("#t-dailyCard .daily-btn").click()); await page.waitForTimeout(1200);
  const list = await page.evaluate(() => window.__tech.daily.plan && ["finger", "accomp"].flatMap(r => {
    const out = [], R = window.__tech.daily.levelOf(r, r === "finger" ? "PA1" : "AA1").route;
    for (const L of R.levels) out.push([r, L.id, L.vary.length]);
    return out;
  }).concat(["w5s", "w5q", "w5e", "wsc"].flatMap(id => ["C", "G", "F"].map(k => ["warm", id + ":" + k, 0]))));
  const fails = [];
  for (const [r, id, nv] of list) {
    const boxes = r === "warm" ? [0] : full.has(vp) ? [0, ...Array.from({ length: nv }, (_, i) => i + 1)] : [0, 4];
    for (const box of boxes) {
      total++;
      const res = await page.evaluate(async ([r, id, box]) => {
        const T = window.__tech, L = r === "warm" ? null : T.daily.levelOf(r, id);
        const v = box ? L.vary[box - 1] : null;
        const [wid, wk] = id.split(":");
        const s = r === "warm" ? { k: "warm", item: { q: { type: "route", warm: wid, hands: "HT", rkey: wk }, name: ["暖身", "Warm-up"], bpm: 60 }, i: 0, of: 3, tries: 0 } : box ? { k: "review", r, lv: id, level: L, vary: v, bpm: L.target, click: v.click || "every", i: 1, of: 3, tries: 0 }
          : { k: "route", r, lv: id, level: L, bpm: L.start, target: L.target, need: 3, click: "every", i: 1, of: 3, tries: 0, streak: 0 };
        const k0 = window.__scoreReady || 0; T.dShow(s);
        for (let i = 0; i < 200 && (window.__scoreReady || 0) === k0; i++) await new Promise(r => setTimeout(r, 25));
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const svg = document.querySelector("#t-osmd svg"), sc = document.getElementById("t-scroll");
        if (!svg) return { err: "沒有譜" };
        const sw = Math.round(svg.getBoundingClientRect().width), fw = sc.clientWidth;
        const wr = window.__wrap || {};
        // 上下:譜的內容(含指法、音名)不能超出 SVG 的畫布,SVG 不能超出譜框
        const vb = svg.viewBox.baseVal, bb = svg.getBBox(), sr = svg.getBoundingClientRect(), fr = sc.getBoundingClientRect();
        const cut = vb && vb.height ? Math.max(0, bb.y + bb.height - (vb.y + vb.height), vb.y - bb.y, bb.x + bb.width - (vb.x + vb.width)) : 0;
        const below = Math.round(sr.bottom - fr.bottom), right = Math.round(sr.right - fr.right);
        return { cut: Math.round(cut), below, right, sw, fw, scroll: sc.scrollWidth - sc.clientWidth, page: document.documentElement.scrollWidth - innerWidth, n: wr.n, zoom: wr.zoom, bars: wr.bars };
      }, [r, id, box]);
      const why = [];
      if (res.err) why.push(res.err);
      else {
        if (res.sw > res.fw + 1) why.push(`SVG ${res.sw} > 譜框 ${res.fw}`);
        if (res.cut > 1) why.push(`譜的內容超出畫布 ${res.cut}`);
        if (res.below > 1 || res.right > 1) why.push(`SVG 超出譜框(下 ${res.below}、右 ${res.right})`);
        if (res.scroll > 1) why.push(`譜框左右捲 ${res.scroll}px`);
        if (res.page > 1) why.push(`整頁橫向捲動 ${res.page}px`);
        if (res.zoom < (res.n >= 2 ? 0.55 : 0.45) - 1e-6) why.push(`縮放 ${res.zoom} 太小(每行 ${res.n} 小節)`);
      }
      if (why.length) { bad++; fails.push(`  ${r} ${id}${box ? " 盒" + box : ""}: ${why.join(";")}`); }
      else if (process.env.V) console.log(`  ${vp} ${id}${box ? " 盒" + box : ""} 每行 ${res.n}/${res.bars} 小節 × ${res.zoom}`);
    }
  }
  console.log(`${vp}: ${fails.length ? "✗ " + fails.length + " 個" : "✓"}`); fails.forEach(f => console.log(f));
  if (h.errors.length) { bad++; console.log(h.errors.slice(0, 5)); }
  await h.close();
}
console.log(bad ? `✗ ${bad} 個問題(共 ${total} 題)` : `✓ 全部 ${total} 題放得下`);
process.exit(bad ? 1 : 0);
