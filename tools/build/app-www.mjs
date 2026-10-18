// App 打包用:把網頁本體複製到 app/www(Capacitor 的 webDir)。網頁本身沒有 build step,這只是複製檔案
import fs from "node:fs";
import { bundleSamples } from "./app-samples.mjs";
const root = new URL("../../", import.meta.url).pathname, out = root + "app/www/";
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
for (const f of ["index.html", "privacy.html", "licenses.html", "manifest.webmanifest", "sw.js", "css", "js", "data", "vendor", "icons"])
  fs.cpSync(root + f, out + f, { recursive: true });
bundleSamples();   // 鋼琴取樣打包進 App:第一次打開、沒網路也有聲音
console.log("app/www 已更新");
