// 共用:起本機 HTTP 伺服器(網頁要 fetch data/*.json,不能用 file://),開瀏覽器;
// raw.githubusercontent(ScrollScore 取樣)用 curl 下載後快取在本機,Google Fonts 擋掉
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const ROOT = path.resolve(new URL("../../", import.meta.url).pathname);
const CACHE = path.resolve(new URL("./samplecache", import.meta.url).pathname);
fs.mkdirSync(CACHE, { recursive: true });
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
export function serve(){
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) { rsp.writeHead(404); rsp.end(); return; }
      rsp.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(rsp);
    }).listen(0, () => res({ srv, url: `http://localhost:${srv.address().port}/` }));
  });
}
export async function open(opts = {}){
  const { srv, url } = await serve();
  // opts.args:另外的瀏覽器參數(mic-check 的假麥克風 --use-fake-device-for-media-stream 等)
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", ...(opts.args || [])] });
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1400, height: 900 }, deviceScaleFactor: opts.dpr || 1, isMobile: !!opts.mobile, hasTouch: !!opts.mobile });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push("[pageerror] " + e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("[console] " + m.text()); });
  page.on("requestfailed", r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url()) && !/ERR_ABORTED/.test((r.failure() || {}).errorText || "")) errors.push("[requestfailed] " + r.url() + " " + ((r.failure() || {}).errorText || "")); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.route(/raw\.githubusercontent\.com/, async r => {
    const u = r.request().url(), f = path.join(CACHE, u.replace(/^https:\/\/raw\.githubusercontent\.com\//, "").replace(/\//g, "__"));
    if (!fs.existsSync(f)) { try { execFileSync("curl", ["-sSfL", "-o", f, u]); } catch (e) { return r.fulfill({ status: 404, body: "" }); } }
    if (opts.sampleDelay && u.endsWith(".flac")) await new Promise(res => setTimeout(res, opts.sampleDelay * (0.5 + Math.random())));   // 模擬慢網路
    r.fulfill({ path: f, headers: { "access-control-allow-origin": "*", "content-type": u.endsWith(".json") ? "application/json" : "audio/flac" } });
  });
  await page.goto(url + (opts.path || ""));
  await page.waitForFunction(() => window.__stageReady >= 1, null, { timeout: 30000 });
  return { browser, page, errors, ctx, url, close: async () => { await browser.close(); srv.close(); } };
}
