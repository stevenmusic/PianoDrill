// 版本指紋:算出 src/ 全部檔案內容的雜湊,寫進 index.html 與每個 import 的 ?v=。
// 檔案沒變 → 指紋不變;只要改了任何一個 → 全部一起換成新的 URL,手機不會拿到新舊混雜。
// 用法:node tools/stamp.mjs        (改了 src/ 或 index.html 之後執行)
//      node tools/stamp.mjs --check (只檢查,不寫入;不一致就結束碼 1)
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const check = process.argv.includes('--check');
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});
const files = [...walk(join(root, 'src')).filter((f) => /\.(js|css|json)$/.test(f)), join(root, 'index.html')].sort();
const strip = (text) => text.replace(/\?v=[A-Za-z0-9]+/g, '?v=');
const hash = createHash('sha1');
for (const file of files) hash.update(file.slice(root.length)).update(strip(readFileSync(file, 'utf8')));
const stamp = hash.digest('hex').slice(0, 8);

let stale = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const next = text.replace(/\?v=[A-Za-z0-9]+/g, `?v=${stamp}`);
  if (next !== text) {
    stale += 1;
    if (!check) writeFileSync(file, next);
  }
}
if (check) {
  if (stale) { console.error(`版本指紋過期(${stale} 個檔案),請執行 node tools/stamp.mjs`); process.exit(1); }
  console.log(`版本指紋 ${stamp} 正確`);
} else {
  console.log(`版本指紋 ${stamp}(更新 ${stale} 個檔案)`);
}
