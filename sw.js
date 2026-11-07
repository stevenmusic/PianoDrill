/* 離線使用(Service Worker)
   - 安裝時先把整份 App(首頁、manifest、圖示、授權 / 隱私 / 支援頁、css、js、data、vendor;清單 PRECACHE 由 tools/build/stamp.mjs 寫入)存好,
     第一次打開之後就算沒網路、沒點過的分頁也能用;快取名稱帶「清單 + 沒有 ?v= 的檔案內容」的雜湊,版本一變就換一個快取,舊的在新版啟用時刪掉
   - 頁面(首頁、授權、隱私、支援):先上網拿最新的,沒網路才用快取 → 有更新時一定拿到新版
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
const CACHE = APP + "-app-9378bcac";
const PRECACHE = [
  "./",
  "manifest.webmanifest",
  "icons/apple-touch-icon.png",
  "icons/favicon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "licenses.html",
  "privacy.html",
  "support.html",
  "css/app.css?v=3a1a41659d",
  "css/tech.css?v=afd9bfb592",
  "css/sight.css?v=54eb975548",
  "vendor/opensheetmusicdisplay.min.js?v=4bfeb3d01c",
  "js/ear/app.js?v=d01e527d99",
  "js/ear/aural.js?v=6ce7b9b96e",
  "js/ear/ear.js?v=a51e5d3f4c",
  "js/ear/music.js?v=28644129ec",
  "js/ear/store.js?v=c634a91742",
  "js/ear/strings.js?v=62d5d35316",
  "js/main.js?v=e3ac4ac1bf",
  "js/shared/audio.js?v=d0a959c3ed",
  "js/shared/backup.js?v=620efafdf5",
  "js/shared/celebrate.js?v=e5ee0328bb",
  "js/shared/daily.js?v=07a2184cb8",
  "js/shared/dailycard.js?v=9082c50016",
  "js/shared/digest.js?v=a0bde17c3e",
  "js/shared/drill.js?v=9f698a5f44",
  "js/shared/i18n.js?v=192ff8c388",
  "js/shared/keystrip.js?v=dd4d105375",
  "js/shared/mic.js?v=5450b68a2d",
  "js/shared/milestone.js?v=40a9ff0313",
  "js/shared/notenames.js?v=68a982911d",
  "js/shared/onsets.js?v=d8df0b9ef2",
  "js/shared/practicelog.js?v=d3461179e1",
  "js/shared/roadmap.js?v=cd243150ea",
  "js/shared/staffframe.js?v=7d869b31d1",
  "js/shared/tempo.js?v=1e38af7d3f",
  "js/shared/values.js?v=e240ea1b65",
  "js/sight/app.js?v=78d049ea92",
  "js/sight/generator/fingerprint.js?v=9c9903e4f3",
  "js/sight/generator/generate.js?v=2bf5f28eae",
  "js/sight/generator/harmony.js?v=153a66fd1f",
  "js/sight/generator/index.js?v=f1aee5c391",
  "js/sight/generator/melody.js?v=90ff930860",
  "js/sight/generator/meter.js?v=efdd9ec3e8",
  "js/sight/generator/musicxml.js?v=0cf5774154",
  "js/sight/generator/random.js?v=3b9b511386",
  "js/sight/generator/rhythm.js?v=8c72082fc4",
  "js/sight/generator/theory.js?v=bca3da5ea8",
  "js/sight/i18n.js?v=33177c7e92",
  "js/sight/miclisten.js?v=03ef2602b8",
  "js/sight/micscore.js?v=56b9d62915",
  "js/sight/playback.js?v=206fa6f436",
  "js/sight/reading.js?v=d649e24236",
  "js/sight/scoring.js?v=c1912c76a7",
  "js/sight/stage.js?v=bee4aca9a4",
  "js/sight/stages.js?v=1768d14127",
  "js/tech/app.js?v=4c5d366ddd",
  "js/tech/exercise.js?v=27317eacd2",
  "js/tech/fingering.js?v=be9e0f69a4",
  "js/tech/hanon.js?v=be2621dd7a",
  "js/tech/musicxml.js?v=f077fb5329",
  "js/tech/patterns.js?v=211add874d",
  "js/tech/routes.js?v=a22dd37eb4",
  "js/tech/store.js?v=5c1ecf8b6f",
  "js/tech/strings.js?v=da092e23a0",
  "js/tech/syllabus.js?v=cdf3a21898",
  "js/tech/theory.js?v=8dcc1618b6",
  "data/aural.json?v=e118b14095",
  "data/fingerings.json?v=01a74f2d0c",
  "data/sight-rules.json?v=b26d7a8fb4",
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
  // 首頁存在 "./";其他頁面(licenses.html、privacy.html、support.html)各存各的(不帶 ?query),不能蓋掉首頁
  const u = new URL(req.url);
  const key = /\/(index\.html)?$/.test(u.pathname) ? "./" : u.origin + u.pathname;
  try {
    const res = await fetch(req);
    if (res.ok) c.put(key, res.clone());
    return res;
  } catch (e) {
    return (await c.match(key)) || (await c.match("./")) || Response.error();
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
