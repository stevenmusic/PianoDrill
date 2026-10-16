// App Store 截圖(中文):iPhone 6.9/6.7 吋欄位(1290 × 2796)與 iPad 13 吋(2064 × 2752)
// 五張:檢定總覽 → 技巧(音階 + 指法)→ 視奏 → 聽音(鍵盤作答)→ 聽力測驗
// 用法:cd tools/test && node appshots.mjs
import fs from "node:fs";
import { open } from "./harness.mjs";
const OUT = new URL("../../app/screenshots/", import.meta.url).pathname; fs.mkdirSync(OUT, { recursive: true });
const today = new Date(), k = x => { const y = new Date(today); y.setDate(y.getDate() - x); return `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`; };
const techLog = Object.fromEntries([0, 1, 2, 3, 4, 6].map(x => [k(x), { n: 5 - (x % 3), sec: 900 }]));
for (const [dev, w, h, dpr] of [["iphone", 430, 932, 3], ["ipad13", 1032, 1376, 2]]) {
  const { page, close } = await open({ viewport: { width: w, height: h }, mobile: true, dpr });
  const go = async (shell, extra) => {
    await page.evaluate(([shell, techLog]) => {
      localStorage.clear(); localStorage.setItem("pianodrill-lang", "zh");
      localStorage.setItem("pianodrill.v1", JSON.stringify({ onboarded: true, exam: { system: "abrsm", grade: 5 }, ...shell }));
      localStorage.setItem("pianodrill.tech.v1", JSON.stringify({ log: techLog, pick: { scale: { kind: "major", key: "D", octaves: 2 } }, mastery: {} }));
    }, [shell, techLog]);
    await page.reload(); await page.waitForFunction(() => window.__stageReady >= 1);
    await page.waitForTimeout(1200);
    if (extra) await extra();
    await page.waitForTimeout(1500);
  };
  // 1 檢定:ABRSM 5 級,抽一題音階
  await go({ view: "exam", sub: { exam: "tech" } }, async () => {
    if (await page.isVisible("#examSetup .setup-summary")) await page.click("#examSetup .setup-summary");
    await page.click("#t-drawBtn");
  });
  await page.screenshot({ path: `${OUT}${dev}-1-exam.png` });
  // 2 技巧:D 大調音階,樂譜與指法
  await go({ view: "tech", sub: { tech: "scale" } });
  await page.screenshot({ path: `${OUT}${dev}-2-scale.png` });
  // 3 視奏:4 級
  await go({ view: "sight" }, async () => {
    await page.evaluate(() => document.querySelector('#s-grades .opt[data-v="4"]').click());
    await page.waitForTimeout(1500);
  });
  await page.screenshot({ path: `${OUT}${dev}-3-sight.png` });
  // 4 聽音:音程,鍵盤 / 選項作答
  await go({ view: "ear", sub: { ear: "interval" } });
  await page.screenshot({ path: `${OUT}${dev}-4-ear.png` });
  // 5 檢定 · 聽力測驗清單
  await go({ view: "exam", sub: { exam: "ear" } }, async () => {
    await page.evaluate(() => document.getElementById("e-testsCard").scrollIntoView({ block: "start" }));
    await page.evaluate(() => window.scrollBy(0, -(document.querySelector("header").offsetHeight + 8)));
  });
  await page.screenshot({ path: `${OUT}${dev}-5-aural.png` });
  await close();
}
console.log("ok");
