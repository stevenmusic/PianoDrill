// App 打包用:把網頁本體複製到 app/www(Capacitor 的 webDir)。網頁本身沒有 build step,這只是複製檔案
// - 複製清單 FILES:首頁、授權 / 隱私 / 支援頁、VERSION、manifest、sw.js、css、js、data、vendor、icons
// - App 版拿掉 index.html 的 Google Fonts(preconnect 與字型 CSS 的 <link>):App 離線也正常、不連 Google,改用系統字型(css 的字型清單往後退到 sans-serif / serif);
//   網頁版的 index.html 不動(docs/STAGES.md §8 第 5 點)
// - 版本號:repo 根目錄的 VERSION(例如 1.0.0)複製進 app/www(支援頁讀它,預填在回報問題的內容裡);
//   已經有 app/ios(跑過 npx cap add ios)時,同時寫進 Xcode 專案的 MARKETING_VERSION,
//   build 號 CURRENT_PROJECT_VERSION = git 的 commit 數(每次上傳 App Store Connect 都要比上一次大;拿不到 git 就不動)
// - 最後把取樣打包進 App(app-samples.mjs,@app 區段)
// 跑完用 node tools/test/app-www.mjs 檢查 app/www 完整(那支會先跑這支)。步驟見 docs/IOS.md
// PianoDrill / DrumDrill 共用(tools/test/sync.mjs 檢查):@app 區段以外兩邊一模一樣
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { bundleSamples } from "./app-samples.mjs";
const root = new URL("../../", import.meta.url).pathname, out = root + "app/www/";
export const FILES = ["index.html", "licenses.html", "privacy.html", "support.html", "VERSION", "manifest.webmanifest", "sw.js", "css", "js", "data", "vendor", "icons"];
// index.html 裡連到 Google Fonts 的整行 <link>(preconnect + 字型 CSS)
export const FONT_LINK = /^[ \t]*<link[^>\n]*fonts\.(googleapis|gstatic)\.com[^>\n]*>[ \t]*\r?\n/gm;
export const appIndex = html => html.replace(FONT_LINK, "");

export function buildWww(){
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  for (const f of FILES) {
    if (!fs.existsSync(root + f)) throw new Error("app-www:找不到 " + f);
    fs.cpSync(root + f, out + f, { recursive: true });
  }
  fs.writeFileSync(out + "index.html", appIndex(fs.readFileSync(root + "index.html", "utf8")));
  const version = fs.readFileSync(root + "VERSION", "utf8").trim();
  const pbx = root + "app/ios/App/App.xcodeproj/project.pbxproj";
  if (fs.existsSync(pbx)) {
    let p = fs.readFileSync(pbx, "utf8"), build = null;
    try { build = execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: root }).toString().trim(); } catch (e) {}
    p = p.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);
    if (build) p = p.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`);
    fs.writeFileSync(pbx, p);
    console.log(`Xcode 專案:版本 ${version}${build ? "、build " + build : "(拿不到 git,build 號沒改)"}`);
  }
// @app-begin
  bundleSamples();   // 鋼琴取樣打包進 App:第一次打開、沒網路也有聲音
// @app-end
  console.log(`app/www 已更新(版本 ${version})`);
}

if (import.meta.url === `file://${process.argv[1]}`) buildWww();
