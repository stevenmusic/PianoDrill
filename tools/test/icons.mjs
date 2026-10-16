// App 圖示:琴鍵 + 勾(鋼琴 + 考試通過)。用 Chromium 把 SVG 畫成 PNG。
// 為什麼這樣畫(使用者選的方案 A):三個工具合併後耳朵/手/眼睛都只代表一部分,改畫三者的共同點 = 鋼琴(三白兩黑鍵)+ 考試結果(勾 = 答對、通過,
//   跟 App 裡的自動批改同一個意思);不放文字、不用考試機構的標誌與配色;縮到 40px(Spotlight)、29pt(設定)還認得出來。
// 底色:預設金底(在彩色、淺色、深色桌布都清楚,App Store 搜尋結果裡跟一般紅藍紫的鋼琴 App 分得開);
//   深色模式用黑底金勾(跟 App 介面同色);著色模式(Tinted)給灰階前景 + 黑底,讓系統上色。
// 產生:icons/icon-1024.png(App Store,不透明、直角)、icon-1024-dark.png、icon-1024-tinted.png、
//       icon-192.png、icon-512.png、icon-maskable-512.png(四周留安全區)、apple-touch-icon.png(180)、favicon.svg
// 執行:cd tools/test && node icons.mjs
import fs from "node:fs";
import { chromium } from "playwright";
const OUT = new URL("../../icons/", import.meta.url).pathname;
const IV = "#FFFBF0", BK = "#0C0A07";

// 三白鍵兩黑鍵:x, y, 寬, 高
function keys(x, y, w, h, white, black, edge){
  const gap = 1.6, kw = (w - gap * 2) / 3, bw = kw * 0.56, bh = h * 0.58;
  let s = "";
  for (let i = 0; i < 3; i++) s += `<rect x="${x + i * (kw + gap)}" y="${y}" width="${kw}" height="${h}" rx="2.2" fill="${white}"${edge ? ` stroke="${edge}" stroke-width="0.8"` : ""}/>`;
  for (const i of [1, 2]) { const cx = x + i * (kw + gap) - gap / 2; s += `<rect x="${cx - bw / 2}" y="${y}" width="${bw}" height="${bh}" rx="1.5" fill="${black}"/>`; }
  return s;
}
const CHECK = "M24 34 L40 49 L77 15";
const check = (stroke, under) => `<path d="${CHECK}" fill="none" stroke="${under}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="${CHECK}" fill="none" stroke="${stroke}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`;
const DEFS = `<defs>
<linearGradient id="goldbg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="100"><stop offset="0" stop-color="#F8D57C"/><stop offset="1" stop-color="#E3A33A"/></linearGradient>
<radialGradient id="dk" cx="50%" cy="32%" r="78%"><stop offset="0" stop-color="#2E2414"/><stop offset="1" stop-color="#0C0A07"/></radialGradient>
<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7CF6E"/><stop offset="1" stop-color="#E0A43A"/></linearGradient></defs>`;
// 前景(琴鍵 + 勾)放在 100×100 的中間;k = 縮放(maskable 要留安全區)
const fg = (variant, k) => {
  const body = variant === "dark" ? keys(20, 46, 60, 36, "#F4ECDA", BK) + check("url(#gold)", BK)
    : variant === "tinted" ? keys(20, 46, 60, 36, "#FFFFFF", "#000000") + check("#C8C8C8", "#000000")
    : keys(20, 46, 60, 36, IV, BK) + check(BK, "url(#goldbg)");
  return `<g transform="translate(${50 - 50 * k} ${50 - 50 * k}) scale(${k})">${body}</g>`;
};
const bg = variant => variant === "dark" ? `<rect width="100" height="100" fill="url(#dk)"/>` : variant === "tinted" ? `<rect width="100" height="100" fill="#000"/>` : `<rect width="100" height="100" fill="url(#goldbg)"/>`;
const svg = (size, variant = "light", k = 1, round = 0) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">${DEFS}` +
  (round ? `<clipPath id="r"><rect width="100" height="100" rx="${round}"/></clipPath><g clip-path="url(#r)">` : "<g>") + bg(variant) + fg(variant, k) + `</g></svg>`;

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined) });
const p = await b.newPage();
for (const [name, size, variant, k] of [
  ["icon-1024.png", 1024, "light", 1], ["icon-1024-dark.png", 1024, "dark", 1], ["icon-1024-tinted.png", 1024, "tinted", 1],
  ["icon-512.png", 512, "light", 1], ["icon-192.png", 192, "light", 1], ["apple-touch-icon.png", 180, "light", 1],
  ["icon-maskable-512.png", 512, "light", 0.8]]) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<html><body style="margin:0;background:#000">${svg(size, variant, k)}</body></html>`);
  await p.screenshot({ path: OUT + name, clip: { x: 0, y: 0, width: size, height: size }, omitBackground: false });
}
fs.writeFileSync(OUT + "favicon.svg", svg(64, "light", 1, 22).replace(/ width="64" height="64"/, ""));
await b.close(); console.log("ok");
