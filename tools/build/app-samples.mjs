// 把鋼琴取樣與拍點打包進 App(app/www/samples/),App 第一次打開就有聲音、完全不用網路。
// 來源跟網頁版一樣:ScrollScore 的 Salamander 取樣(piano/)與 Naked Drums xstick(drums/)。
// 16 層力度只帶 5 層(4、6、8、10、12 ≈ 力度 40–95,涵蓋 ppp–fff 與重音),其餘層播放時用最近的一層;
// 有 ffmpeg 就截成 6.5 秒(App 最多只播前 6 秒,audio.js 會在 6 秒處淡出),約 40MB;沒有就整檔複製,約 50MB。
// 下載過的原檔存在 tools/build/samples/(不進 git),之後重跑不用再下載。
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const root = new URL("../../", import.meta.url).pathname;
const SRC = "https://raw.githubusercontent.com/stevenmusic/ScrollScore/main/";
const LAYERS = [4, 6, 8, 10, 12];
const KEEP_SEC = 6.5;
const CLICKS = ["nk-xstick-L1.01.flac", "nk-xstick-L1.02.flac", "nk-xstick-L1.03.flac"];
const cacheDir = root + "tools/build/samples/";
const out = root + "app/www/samples/";

function download(path) {
  const file = cacheDir + path.replace(/\//g, "__");
  if (!fs.existsSync(file)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    execFileSync("curl", ["-fsSL", "--retry", "3", "-o", file + ".part", SRC + path]);
    fs.renameSync(file + ".part", file);
  }
  return file;
}
let ffmpeg = true;
try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); } catch { ffmpeg = false; }

export function bundleSamples() {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out + "piano", { recursive: true });
  fs.mkdirSync(out + "drums", { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(download("piano/manifest.json"), "utf8"));
  let bytes = 0, count = 0;
  for (const note of Object.keys(manifest.notes)) {
    for (const layer of LAYERS) {
      const name = `pf-${note.replace("#", "s")}-v${layer}.flac`;
      const src = download("piano/" + name), dst = out + "piano/" + name;
      if (ffmpeg) execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src, "-t", String(KEEP_SEC), "-c:a", "flac", "-compression_level", "12", dst]);
      else fs.copyFileSync(src, dst);
      bytes += fs.statSync(dst).size; count++;
    }
  }
  // 播放端看到 bundledLayers 就只用這幾層
  delete manifest.aux;   // 共鳴、踏板等附屬取樣 App 沒有用到
  fs.writeFileSync(out + "piano/manifest.json", JSON.stringify({ ...manifest, bundledLayers: LAYERS }));
  for (const f of CLICKS) { fs.copyFileSync(download("drums/" + f), out + "drums/" + f); bytes += fs.statSync(out + "drums/" + f).size; count++; }
  console.log(`app/www/samples:${count} 個檔、${(bytes / 1e6).toFixed(1)} MB${ffmpeg ? "" : "(沒有 ffmpeg,未截短)"}`);
}

if (import.meta.url === `file://${process.argv[1]}`) bundleSamples();
