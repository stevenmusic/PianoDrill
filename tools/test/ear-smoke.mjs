// 瀏覽器整合測試:第一次打開的問題、三個練習分頁作答、檢定每一級每個題型都出得了題、中英切換、沒有 console 錯誤、沒有橫向捲動
// 執行:python3 -m http.server 8765(repo 根目錄)→ cd tools/test && node smoke.mjs [網址]
import { chromium } from "playwright";
const URL0 = process.argv[2] || "http://localhost:8765/";
const OUT = new URL("./out/", import.meta.url).pathname;
import fs from "node:fs"; fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ["--autoplay-policy=no-user-gesture-required"] });
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("✗", m); } else console.log("✓", m); };
for (const vp of [{ width: 390, height: 844, isMobile: true, hasTouch: true }, { width: 1280, height: 860 }]) {
  const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push(String(e))); p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(URL0); await p.waitForFunction(() => window.__stageReady);
  ok(await p.isVisible("#onboard"), `${vp.width}: 第一次打開會問考試`);
  await p.click("#obNo");
  for (const tab of ["note", "interval", "chord"]) {
    await p.click(`#tabbar [data-tab=${tab}]`);
    const q = await p.evaluate(() => window.__app.cur && { label: window.__app.cur.label, steps: !!window.__app.cur.steps, keys: !!window.__app.cur.keys });
    ok(q && q.label, `${vp.width}: ${tab} 有題目`);
    await p.click("#playBtn"); await p.waitForTimeout(2500);
    if (q.steps) await p.click("#answers .ans >> nth=0"); else await p.dispatchEvent("#kbd .wk >> nth=0", "pointerdown");
    const done = await p.evaluate(() => window.__app.A.done);
    ok(done, `${vp.width}: ${tab} 作答後有批改`);
    await p.screenshot({ path: OUT + `${tab}-${vp.width}.png`, fullPage: true });
  }
  await p.click("#tabbar [data-tab=exam]");
  if (!(await p.isVisible("#systemSeg"))) await p.click("#paneExam .setup-summary");
  let n = 0;
  for (const sys of ["abrsm", "trinity"]) {
    await p.click(`#systemSeg [data-v=${sys}]`);
    const grades = await p.$$eval("#selGrade option", os => os.map(o => o.value));
    for (const g of grades) {
      await p.selectOption("#selGrade", g);
      const chips = await p.$$("#testsList .chip[data-t]");
      for (let i = 0; i < chips.length; i++) {
        await p.click(`#testsList .chip[data-t] >> nth=${i}`);
        const has = await p.evaluate(() => !!(window.__app.cur && (window.__app.cur.steps || window.__app.cur.keys || window.__app.cur.tap)));
        if (!has) ok(false, `${sys} ${g} 第 ${i} 個題型沒有題目`);
        n++;
      }
    }
  }
  ok(n > 50, `${vp.width}: 檢定題型都出得了題(${n} 個)`);
  await p.click("#tabbar [data-tab=exam]");
  await p.screenshot({ path: OUT + `exam-${vp.width}.png`, fullPage: true });
  await p.click("#langToggle");
  const zh = await p.evaluate(() => document.body.innerText.match(/[一-鿿]/g)?.length || 0);
  ok(zh > 50, `${vp.width}: 中文模式有中文`);
  await p.click("#langToggle");
  const en2 = await p.evaluate(() => (document.body.innerText.replace(/聽音特訓|中/g, "").match(/[一-鿿]+/g) || []));
  if (en2.length) console.log(await p.evaluate(() => [...document.querySelectorAll("body *")].filter(e => /[\u4e00-\u9fff]/.test(e.innerText || "") && e.offsetParent && ![...e.children].some(c => /[\u4e00-\u9fff]/.test(c.innerText || ""))).map(e => (e.id || e.tagName) + ": " + e.innerText.slice(0, 40)).join("\n")));
  ok(en2.length === 0, `${vp.width}: 英文模式沒有殘留中文 ${en2.slice(0, 5).join(",")}`);
  const sx = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok(!sx, `${vp.width}: 沒有橫向捲動`);
  ok(!errs.length, `${vp.width}: 沒有 console 錯誤 ${errs.slice(0, 3).join(" | ")}`);
  await ctx.close();
}
await b.close();
console.log(fail ? `${fail} 項失敗` : "全部通過"); process.exit(fail ? 1 : 0);
