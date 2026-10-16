// 截圖:指定一題(JSON),手機直式 / 手機橫向 / 桌機。例:node shot.mjs '{"type":"thirds","tonic":"G","quality":"major","octaves":2,"hands":"RH","articulation":"legato"}' name
import { open } from "./harness.mjs";
import fs from "node:fs";
const OUT = new URL("./out/", import.meta.url).pathname; fs.mkdirSync(OUT, { recursive: true });
const q = JSON.parse(process.argv[2]), name = process.argv[3] || "shot";
for (const vp of [{ name: "phone", viewport: { width: 390, height: 844 }, mobile: true, dpr: 2 }, { name: "phone-land", viewport: { width: 844, height: 390 }, mobile: true, dpr: 2 }, { name: "desktop", viewport: { width: 1400, height: 900 } }]) {
  const { page, errors, close } = await open(vp);
  await page.evaluate(() => { localStorage.setItem("pianodrill.v1", JSON.stringify({ onboarded: true, view: "tech" })); }); await page.reload(); await page.waitForFunction(() => window.__stageReady >= 1);
  const b = await page.evaluate(() => window.__scoreReady || 0);
  await page.evaluate(q => window.__tech.setQuestion({ motion: "similar", hands: "HT", articulation: "legato", sub: 2, tempo: { unit: "q", bpm: 60 }, free: true, key: "x", ...q }, "scale"), q);
  await page.waitForFunction(b => (window.__scoreReady || 0) > b, b);
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById("t-quizCard").scrollIntoView());
  await page.screenshot({ path: `${OUT}${vp.name}-${name}.png` });
  if (errors.length) console.log(errors.join("\n"));
  await close();
}
