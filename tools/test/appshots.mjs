// App Store 截圖(中英各一套,真實畫面):iPhone 6.9 吋(430×932 × 3 = 1290 × 2796)與 iPad 13 吋(1032×1376 × 2 = 2064 × 2752)
// 五張:今日練習(開始後)→ 技巧 D 大調音階 → 視奏右手(難度 1、音名)→ 聽力單音 → 檢定 ABRSM 5 級抽一題音階
// 輸出 app/screenshots/{zh,en}/{iphone,ipad13}-n-名稱.png。用法:node tools/test/appshots.mjs
import fs from "node:fs";
import { open } from "./harness.mjs";
const ROOT = new URL("../../app/screenshots/", import.meta.url).pathname;
const today = new Date(), k = x => { const y = new Date(today); y.setDate(y.getDate() - x); return `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`; };
const techLog = Object.fromEntries([1, 2, 3, 4, 6].map(x => [k(x), { n: 5 - (x % 3), sec: 900 }]));   // 練習紀錄:最近幾天有練(今天還沒,今日練習卡才是「開始」)
for (const lang of ["zh", "en"]) {
  const OUT = `${ROOT}${lang}/`; fs.mkdirSync(OUT, { recursive: true });
  for (const [dev, w, h, dpr] of [["iphone", 430, 932, 3], ["ipad13", 1032, 1376, 2]]) {
    const { page, close, errors } = await open({ viewport: { width: w, height: h }, mobile: true, dpr });
    const go = async (shell, extra) => {
      await page.evaluate(([shell, techLog, lang]) => {
        localStorage.clear(); localStorage.setItem("pianodrill-lang", lang);
        localStorage.setItem("pianodrill.v1", JSON.stringify({ onboarded: true, ...shell }));
        localStorage.setItem("pianodrill.tech.v1", JSON.stringify({ log: techLog, pick: { scale: { kind: "major", key: "D", octaves: 2 } }, mastery: {} }));
      }, [shell, techLog, lang]);
      await page.reload(); await page.waitForFunction(() => window.__stageReady >= 1);
      await page.waitForTimeout(1200);
      if (extra) await extra();
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.scrollTo(0, 0));
    };
    const shot = name => page.screenshot({ path: `${OUT}${dev}-${name}.png` });
    // 1 今日練習:按「開始今天的練習」後的第一段(題目卡 + 樂譜)
    await go({ view: "tech", sub: { tech: "today" } }, async () => { await page.click("#t-dailyCard .daily-btn"); });
    await shot("1-today");
    // 2 技巧:D 大調音階(樂譜與指法)
    await go({ view: "tech", sub: { tech: "scale" } });
    await shot("2-scale");
    // 3 視奏:右手難度 1(音名開著)
    await go({ view: "sight", sub: { sight: "right" } });
    await shot("3-sight");
    // 4 聽力:單音(琴鍵作答)
    await go({ view: "ear", sub: { ear: "note" } });
    await shot("4-ear");
    // 5 檢定:ABRSM 5 級,抽一題音階
    await go({ view: "exam", exam: { system: "abrsm", grade: 5 }, sub: { exam: "tech" } }, async () => { await page.click("#t-drawBtn"); });
    await shot("5-exam");
    if (errors.length) console.log(dev, lang, errors.slice(0, 3).join("\n"));
    await close();
  }
}
console.log("ok");
