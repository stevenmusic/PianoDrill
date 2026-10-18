/* 版本指紋(快取問題):GitHub Pages 會讓瀏覽器快取 10 分鐘,更新後可能拿到「新 HTML + 舊 CSS/JS」。
   這支程式把每個檔案內容的雜湊寫進 index.html:
   - <link href="css/*.css?v=…">、<script src="vendor/…?v=…">、<script type="module" src="js/main.js?v=…">
   - <script type="importmap">:js/ 底下(含子資料夾)每個模組 → 帶 ?v= 的網址(模組彼此 import 的相對路徑也會被換掉)
   - <script type="application/json" id="pdVersions">:data/*.json 的版本(各模組 fetch 時帶上)
   - sw.js 的預快取區段(@precache-begin … @precache-end 註解之間):離線要用的完整檔案清單(帶 ?v=)與快取名稱(APP + "-app-" + 清單雜湊前 8 碼),
     Service Worker 安裝時整份先存好;清單一變快取名稱就變,舊快取在新版啟用時刪掉
   改了任何 css/js/data 之後執行:node tools/build/stamp.mjs;node tools/build/stamp.mjs --check 只檢查(verify.mjs 會跑)
   PianoDrill / DrumDrill 兩邊這個檔案一模一樣(tools/test/sync.mjs 檢查) */
import fs from "node:fs";
import crypto from "node:crypto";
const root = new URL("../../", import.meta.url).pathname;
const h = f => crypto.createHash("sha1").update(fs.readFileSync(root + f)).digest("hex").slice(0, 10);
const walk = d => fs.readdirSync(root + d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(d + "/" + e.name) : e.name.endsWith(".js") ? [d + "/" + e.name] : []);
const js = walk("js").sort();
const data = fs.readdirSync(root + "data").filter(f => f.endsWith(".json")).sort().map(f => "data/" + f);
const imap = { imports: Object.fromEntries(js.map(f => ["./" + f, "./" + f + "?v=" + h(f)])) };
const dv = Object.fromEntries(data.map(f => [f, h(f)]));
let html = fs.readFileSync(root + "index.html", "utf8");
const orig = html;
html = html.replace(/href="(css\/[\w-]+\.css)(\?v=[^"]*)?"/g, (m, f) => `href="${f}?v=${h(f)}"`);
html = html.replace(/src="vendor\/opensheetmusicdisplay\.min\.js(\?v=[^"]*)?"/, `src="vendor/opensheetmusicdisplay.min.js?v=${h("vendor/opensheetmusicdisplay.min.js")}"`);
html = html.replace(/<script type="module" src="js\/main\.js(\?v=[^"]*)?"><\/script>/, `<script type="module" src="js/main.js?v=${h("js/main.js")}"></script>`);
html = html.replace(/<script type="importmap">.*?<\/script>/s, `<script type="importmap">${JSON.stringify(imap)}</script>`);
html = html.replace(/<script type="application\/json" id="pdVersions">.*?<\/script>/s, `<script type="application/json" id="pdVersions">${JSON.stringify(dv)}</script>`);
// sw.js 預快取清單:首頁、manifest、圖示、css、vendor、js、data(都跟 index.html 實際用的網址一樣)
let sw = fs.readFileSync(root + "sw.js", "utf8");
const swOrig = sw;
const manifest = JSON.parse(fs.readFileSync(root + "manifest.webmanifest", "utf8"));
const icons = [...new Set([...(manifest.icons || []).map(i => i.src), ...[...html.matchAll(/<link rel="[\w-]*icon" href="([^"?]+)"/g)].map(m => m[1])])].sort();
const pre = ["./", "manifest.webmanifest", ...icons,
  ...[...html.matchAll(/href="(css\/[^"]+)"/g)].map(m => m[1]),
  ...[...html.matchAll(/src="(vendor\/[^"]+)"/g)].map(m => m[1]),
  ...Object.values(imap.imports).map(u => u.replace(/^\.\//, "")),
  ...data.map(f => f + "?v=" + dv[f])];
const tag = crypto.createHash("sha1").update(pre.join("\n")).digest("hex").slice(0, 8);
sw = sw.replace(/\/\*@precache-begin\*\/[\s\S]*?\/\*@precache-end\*\//, `/*@precache-begin*/\nconst CACHE = APP + "-app-${tag}";\nconst PRECACHE = ${JSON.stringify(pre, null, 1).replace(/\n /g, "\n  ")};\n/*@precache-end*/`);
if (!swOrig.includes("/*@precache-begin*/")) { console.log("✗ sw.js 沒有 @precache-begin … @precache-end 區段"); process.exit(1); }
if (process.argv.includes("--check")) {
  if (html !== orig) { console.log("✗ index.html 的版本指紋不是最新的:執行 node tools/build/stamp.mjs"); process.exit(1); }
  if (sw !== swOrig) { console.log("✗ sw.js 的預快取清單不是最新的:執行 node tools/build/stamp.mjs"); process.exit(1); }
  console.log("✓ 版本指紋與 sw.js 預快取清單是最新的");
} else {
  fs.writeFileSync(root + "index.html", html); fs.writeFileSync(root + "sw.js", sw);
  console.log(html === orig && sw === swOrig ? "版本指紋沒有變" : "已更新 index.html 的版本指紋與 sw.js 的預快取清單");
}
