/* 離線使用(Service Worker)
   - 安裝時先把整份 App(首頁、manifest、圖示、css、js、data、vendor;清單 PRECACHE 由 tools/build/stamp.mjs 寫入)存好,
     第一次打開之後就算沒網路、沒點過的分頁也能用;快取名稱帶清單的雜湊,版本一變就換一個快取,舊的在新版啟用時刪掉
   - 首頁(index.html):先上網拿最新的,沒網路才用快取 → 有更新時一定拿到新版
   - 同網域的 css / js / data / vendor:網址都帶 ?v=內容指紋(tools/build/stamp.mjs),同一個網址內容不會變 → 先用快取;
     存了新版本就刪掉同一個檔案的舊版本
   - Google 字型:先用快取
   - 樂器取樣(raw.githubusercontent)由 js/shared/audio.js 自己存在 APP-samples-* 快取,這裡不管;
     App 版打包在 App 裡的取樣(samples/)本來就在裝置上,也不再存一份
   PianoDrill / DrumDrill 共用(tools/test/sync.mjs 檢查):@app 區段與預快取清單以外兩邊一模一樣 */
// @app-begin
const APP = "pianodrill";
// @app-end
/*@precache-begin*/
const CACHE = APP + "-app-76513893";
const PRECACHE = [
  "./",
  "manifest.webmanifest",
  "icons/apple-touch-icon.png",
  "icons/favicon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "css/app.css?v=9f6af68d07",
  "css/sight.css?v=0ba194fd2a",
  "vendor/opensheetmusicdisplay.min.js?v=4bfeb3d01c",
  "js/ear/app.js?v=26fa94ab2b",
  "js/ear/aural.js?v=2db3b73955",
  "js/ear/ear.js?v=ad307c1316",
  "js/ear/music.js?v=28644129ec",
  "js/ear/store.js?v=5ace8d1f1f",
  "js/ear/strings.js?v=eaf7382b0f",
  "js/main.js?v=a99afad73f",
  "js/shared/audio.js?v=364bf972e9",
  "js/shared/i18n.js?v=f6de467b70",
  "js/sight/app.js?v=d6d9ca5123",
  "js/sight/generator/fingerprint.js?v=2307e1ef7e",
  "js/sight/generator/generate.js?v=0a2725513f",
  "js/sight/generator/harmony.js?v=153a66fd1f",
  "js/sight/generator/index.js?v=f1aee5c391",
  "js/sight/generator/melody.js?v=262e7dca21",
  "js/sight/generator/meter.js?v=efdd9ec3e8",
  "js/sight/generator/musicxml.js?v=4bbadae920",
  "js/sight/generator/random.js?v=3b9b511386",
  "js/sight/generator/rhythm.js?v=013f8685d0",
  "js/sight/generator/theory.js?v=bca3da5ea8",
  "js/sight/i18n.js?v=fc0b7c1cab",
  "js/sight/mic.js?v=78259aee92",
  "js/sight/playback.js?v=2f4f886ed6",
  "js/sight/scoring.js?v=ccc19f9486",
  "js/sight/stage.js?v=9ca7fb07ed",
  "js/tech/app.js?v=5465ab32c2",
  "js/tech/exercise.js?v=254ed7b2c1",
  "js/tech/fingering.js?v=eabf64c8e1",
  "js/tech/hanon.js?v=be2621dd7a",
  "js/tech/musicxml.js?v=4257980f50",
  "js/tech/store.js?v=75f4c27725",
  "js/tech/strings.js?v=f389816556",
  "js/tech/syllabus.js?v=cdf3a21898",
  "js/tech/theory.js?v=ed03457554",
  "data/aural.json?v=742488735b",
  "data/fingerings.json?v=01a74f2d0c",
  "data/sight-rules.json?v=56549899c8",
  "data/syllabus.json?v=30b5443db2"
];
/*@precache-end*/
self.addEventListener("install", e => {
  // ?v= 的網址內容不會變,可以用瀏覽器快取裡的;首頁、manifest、圖示要先問伺服器(GitHub Pages 會讓瀏覽器快取 10 分鐘)
  const reqs = PRECACHE.map(u => new Request(u, { cache: u.includes("?v=") ? "default" : "no-cache" }));
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(reqs)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith(APP + "-app-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
async function networkFirst(req){
  const c = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) c.put(req.mode === "navigate" ? "./" : req, res.clone());
    return res;
  } catch (e) {
    return (await c.match(req.mode === "navigate" ? "./" : req)) || (await c.match("./")) || Response.error();
  }
}
async function cacheFirst(req){
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") {
    await c.put(req, res.clone());
    // 同一個檔案的舊版本(?v= 不同)刪掉
    const u = new URL(req.url);
    if (u.origin === location.origin && u.searchParams.has("v")) {
      for (const k of await c.keys()) { const ku = new URL(k.url); if (ku.pathname === u.pathname && ku.search !== u.search) c.delete(k); }
    }
  }
  return res;
}
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (u.origin === location.origin) {
    if (u.pathname.includes("/samples/")) return;
    if (req.mode === "navigate" || u.pathname.endsWith("/") || u.pathname.endsWith("/index.html")) e.respondWith(networkFirst(req));
    else e.respondWith(cacheFirst(req));
  } else if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) {
    e.respondWith(cacheFirst(req));
  }
});
