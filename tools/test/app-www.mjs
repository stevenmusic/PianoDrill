// App 打包的內容完整嗎:先跑 tools/build/app-www.mjs(複製網頁 + 打包取樣到 app/www),再檢查 app/www:
//   - 複製清單(FILES)每一項都在;js/、css/、data/、vendor/、icons/ 跟 repo 裡逐位元組一樣(沒有漏檔、沒有舊檔)
//   - index.html = repo 的 index.html 只拿掉 Google Fonts 的 <link>;App 裡任何 .html / .css 都不載入 fonts.googleapis.com / fonts.gstatic.com(href / src / url() / @import)
//   - index.html 引用的檔案都在:importmap 每個模組、css、vendor、js/main.js、pdVersions 的 data 版本跟檔案內容一致
//   - sw.js 預快取清單的每個檔案都在(網頁版離線用的清單,App 裡也不能缺)
//   - 頁尾連到授權 / 隱私 / 支援頁,三頁都在,頁裡連回 index.html;VERSION 是 x.y.z 而且跟 repo 的一樣
//   - 取樣(@app 區段):打包的 manifest 與每一個該有的取樣檔都在,沒有多餘的檔案
// 用法:node tools/test/app-www.mjs(第一次要連網下載取樣到 tools/build/samples/);--no-build 只檢查現有的 app/www
// 也可以 APPWWW=1 node tools/test/verify.mjs(verify 的可選步驟)
// PianoDrill / DrumDrill 共用(tools/test/sync.mjs 檢查):@app 區段以外兩邊一模一樣
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { FILES, appIndex } from "../build/app-www.mjs";
const root = new URL("../../", import.meta.url).pathname, www = root + "app/www/";
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("✗ " + msg); } };
const has = f => fs.existsSync(www + f);
const sha = f => crypto.createHash("sha1").update(fs.readFileSync(f)).digest("hex");
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(d + "/" + e.name).map(x => e.name + "/" + x) : [e.name]);

if (!process.argv.includes("--no-build")) execFileSync("node", [root + "tools/build/app-www.mjs"], { stdio: "inherit" });
ok(fs.existsSync(www), "沒有 app/www(先跑 node tools/build/app-www.mjs)");
if (!fs.existsSync(www)) process.exit(1);

// 1. 複製清單:檔案一樣、資料夾裡的檔案一樣(不多不少)
for (const f of FILES) {
  ok(has(f), `app/www 少了 ${f}`);
  if (!has(f) || f === "index.html") continue;
  if (fs.statSync(root + f).isDirectory()) {
    const a = walk(root + f).sort(), b = walk(www + f).sort();
    ok(a.join("\n") === b.join("\n"), `app/www/${f}/ 的檔案跟 repo 不一樣(少了:${a.filter(x => !b.includes(x)).slice(0, 5).join("、") || "無"};多了:${b.filter(x => !a.includes(x)).slice(0, 5).join("、") || "無"})`);
    for (const x of a) if (b.includes(x)) ok(sha(root + f + "/" + x) === sha(www + f + "/" + x), `app/www/${f}/${x} 跟 repo 的內容不一樣`);
  } else ok(sha(root + f) === sha(www + f), `app/www/${f} 跟 repo 的內容不一樣`);
}
// 2. index.html:只拿掉 Google Fonts;任何頁面、樣式都不連 Google 字型
const src = fs.readFileSync(root + "index.html", "utf8"), html = has("index.html") ? fs.readFileSync(www + "index.html", "utf8") : "";
ok(/fonts\.googleapis\.com/.test(src), "repo 的 index.html 找不到 Google Fonts(網頁版應該照常載入;改了寫法要一起改 app-www)");
ok(html === appIndex(src), "app/www/index.html 應該 = repo 的 index.html 拿掉 Google Fonts 的 <link>(其他不動)");
for (const f of walk(www).filter(f => /\.(html|css)$/.test(f) && !f.startsWith("vendor/")))
  ok(!/(href|src)=["'][^"']*fonts\.(googleapis|gstatic)\.com|url\(["']?[^)]*fonts\.(googleapis|gstatic)\.com|@import[^;]*fonts\.googleapis\.com/.test(fs.readFileSync(www + f, "utf8")),
    `app/www/${f} 還連到 Google Fonts(App 版要用系統字型、不連 Google;隱私權政策裡的說明文字不算)`);
// 3. index.html 引用的檔案
const im = /<script type="importmap">(.*?)<\/script>/s.exec(html);
ok(im, "index.html 沒有 importmap");
const imports = im ? Object.values(JSON.parse(im[1]).imports) : [];
const jsFiles = walk(root + "js").filter(f => f.endsWith(".js")).map(f => "js/" + f);
ok(imports.length === jsFiles.length, `importmap 有 ${imports.length} 個模組,js/ 底下有 ${jsFiles.length} 個`);
const refs = [...imports, ...[...html.matchAll(/(?:href|src)="((?:css|js|vendor|icons)\/[^"]+|manifest\.webmanifest|licenses\.html|privacy\.html|support\.html)"/g)].map(m => m[1])];
for (const u of refs) {
  const [p, q] = u.replace(/^\.\//, "").split("?");
  ok(has(p), `index.html 引用的 ${p} 不在 app/www`);
  const v = /(?:^|&)v=([0-9a-f]+)/.exec(q || "");
  if (v && has(p)) ok(sha(www + p).startsWith(v[1]), `${p} 的 ?v=${v[1]} 跟內容不一致(先跑 node tools/build/stamp.mjs)`);
}
const dv = /<script type="application\/json" id="pdVersions">(.*?)<\/script>/s.exec(html);
ok(dv, "index.html 沒有 pdVersions");
for (const [f, v] of Object.entries(dv ? JSON.parse(dv[1]) : {})) ok(has(f) && sha(www + f).startsWith(v), `data 版本:${f} 不在 app/www 或內容跟 ?v=${v} 不一致`);
// 4. sw.js 預快取清單
const pre = /const PRECACHE = (\[[\s\S]*?\]);/.exec(has("sw.js") ? fs.readFileSync(www + "sw.js", "utf8") : "");
ok(pre, "sw.js 沒有 PRECACHE 清單");
for (const u of pre ? JSON.parse(pre[1]) : []) ok(has(u === "./" ? "index.html" : u.replace(/\?.*$/, "")), `sw.js 預快取的 ${u} 不在 app/www`);
// 5. 授權 / 隱私 / 支援頁、版本號
for (const p of ["licenses.html", "privacy.html", "support.html"]) {
  ok(new RegExp(`<a href="${p.replace(".", "\\.")}" data-i18n="`).test(html), `index.html 頁尾沒有連到 ${p}`);
  if (has(p)) ok(/href="index\.html"/.test(fs.readFileSync(www + p, "utf8")), `${p} 沒有返回 index.html 的連結`);
}
const ver = has("VERSION") ? fs.readFileSync(www + "VERSION", "utf8").trim() : "";
ok(/^\d+\.\d+\.\d+$/.test(ver), `VERSION 應該是 x.y.z(現在是「${ver}」)`);

// 6. 取樣
// @app-begin
// PianoDrill:samples/piano/ = manifest(bundledLayers)+ 每個音 × 帶的每一層力度;samples/drums/ = 拍點的 xstick 3 個
{
  ok(has("samples/piano/manifest.json"), "app/www/samples/piano/manifest.json 不在");
  const man = has("samples/piano/manifest.json") ? JSON.parse(fs.readFileSync(www + "samples/piano/manifest.json", "utf8")) : { notes: {} };
  ok(Array.isArray(man.bundledLayers) && man.bundledLayers.length > 0, "取樣 manifest 沒有 bundledLayers(播放端靠它知道 App 只帶了哪幾層)");
  ok(!man.aux, "取樣 manifest 不該有 aux(App 沒有打包附屬取樣)");
  const want = new Set(["manifest.json"]);
  for (const note of Object.keys(man.notes)) for (const layer of man.bundledLayers || []) want.add(`pf-${note.replace("#", "s")}-v${layer}.flac`);
  ok(want.size > 1, "取樣 manifest 沒有任何音");
  const got = has("samples/piano") ? walk(www + "samples/piano") : [];
  for (const f of want) ok(got.includes(f), `app/www/samples/piano/${f} 不在`);
  for (const f of got) ok(want.has(f), `app/www/samples/piano/${f} 是多餘的`);
  const clicks = ["nk-xstick-L1.01.flac", "nk-xstick-L1.02.flac", "nk-xstick-L1.03.flac"], drums = has("samples/drums") ? walk(www + "samples/drums") : [];
  for (const f of clicks) ok(drums.includes(f), `app/www/samples/drums/${f}(拍點)不在`);
  ok(drums.length === clicks.length, `app/www/samples/drums 應該只有拍點 3 個檔(現在 ${drums.length} 個)`);
  console.log(`取樣:samples/piano ${got.length} 個檔(應有 ${want.size} 個)、samples/drums ${drums.length} 個`);
}
// @app-end

console.log(fails ? `\n✗ app/www:${fails} 項失敗(共 ${checks} 項)` : `✓ app/www 完整(${checks} 項)`);
process.exit(fails ? 1 : 0);
