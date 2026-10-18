// 兩個 App(DrumDrill ↔ PianoDrill)的共用檔案有沒有對齊:清單在 tools/test/sync.json,每一項 [DrumDrill 的路徑, PianoDrill 的路徑, 模式]
//   same    :逐位元組相同
//   markers :去掉 @app-begin … @app-end 區段(各 App 專屬)與 sw.js 的預快取區段(stamp.mjs 寫入)之後相同;
//             區段的位置、數量也要一樣(各留一行記號比對)。記號要在行首的註解裡(// @app-begin、/* @app-begin),寫在說明文字中間的不算
// 另一個 repo 的位置:在 DrumDrill 用 PIANODRILL=/path/to/pianodrill,在 PianoDrill 用 DRUMDRILL=/path/to/DrumDrill;
// 找不到另一個 repo 就印「略過」、結束碼 0(單一 repo 的 CI 也能跑)。不一致時列出檔案與第一個不同的行。
// 用法:PIANODRILL=/home/user/pianodrill node tools/test/sync.mjs(verify.mjs 最後也會跑)
// 這個檔案與 sync.json 兩邊一模一樣;靠 tools/test/package.json 的名稱(drumdrill-test / pianodrill-test)知道自己是哪一個
import fs from "node:fs";
import path from "node:path";
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, "../..");
const nameOf = dir => { try { return JSON.parse(fs.readFileSync(path.join(dir, "tools/test/package.json"), "utf8")).name; } catch (e) { return null; } };
const self = nameOf(root);
if (self !== "drumdrill-test" && self !== "pianodrill-test") { console.log(`✗ tools/test/package.json 的名稱應該是 drumdrill-test 或 pianodrill-test(現在是 ${self})`); process.exit(1); }
const isDrum = self === "drumdrill-test", envName = isDrum ? "PIANODRILL" : "DRUMDRILL";
const other = process.env[envName] ? path.resolve(process.env[envName]) : null;
if (!other || !fs.existsSync(path.join(other, "tools/test/sync.json"))) { console.log(`略過兩個 App 的同步檢查(找不到另一個 repo;設定 ${envName}=另一個 repo 的路徑再跑)`); process.exit(0); }
const otherName = nameOf(other), want = isDrum ? "pianodrill-test" : "drumdrill-test";
if (otherName !== want) { console.log(`✗ ${envName}=${other} 不是另一個 App(tools/test/package.json 的名稱是 ${otherName},應該是 ${want})`); process.exit(1); }
const drum = isDrum ? root : other, piano = isDrum ? other : root;
const pairs = JSON.parse(fs.readFileSync(path.join(here, "sync.json"), "utf8"));

const APP_BEGIN = /^\s*(\/\/|\/\*)\s*@app-begin/, APP_END = /^\s*(\/\/|\/\*)\s*@app-end/;
const PRE_BEGIN = /^\s*\/\*@precache-begin\*\//, PRE_END = /^\s*\/\*@precache-end\*\//;
/* 去掉 @app 與預快取區段:回傳 [{ n: 原本的行號, t: 內容 }];區段各留一行記號 */
function strip(file){
  const out = [], lines = fs.readFileSync(file, "utf8").split("\n");
  let skip = null;
  lines.forEach((t, i) => {
    if (skip) {
      if (skip === "app" && APP_BEGIN.test(t)) throw new Error(`${file}:${i + 1} @app-begin 裡面又有 @app-begin`);
      if ((skip === "app" && APP_END.test(t)) || (skip === "pre" && PRE_END.test(t))) skip = null;
      return;
    }
    if (APP_END.test(t)) throw new Error(`${file}:${i + 1} 多了一個 @app-end`);
    if (APP_BEGIN.test(t)) { skip = "app"; out.push({ n: i + 1, t: "«@app 區段»" }); return; }
    if (PRE_BEGIN.test(t)) { skip = "pre"; out.push({ n: i + 1, t: "«預快取區段»" }); return; }
    out.push({ n: i + 1, t });
  });
  if (skip) throw new Error(`${file} 的 ${skip === "app" ? "@app-begin" : "@precache-begin"} 沒有結束`);
  return out;
}
let bad = 0;
const short = s => (s.length > 100 ? s.slice(0, 100) + "…" : s);
for (const [a, b, mode] of pairs) {
  const fa = path.join(drum, a), fb = path.join(piano, b);
  if (!fs.existsSync(fa) || !fs.existsSync(fb)) { bad++; console.log(`✗ ${a} ↔ ${b}:${!fs.existsSync(fa) ? "DrumDrill 沒有 " + a : "PianoDrill 沒有 " + b}`); continue; }
  if (mode === "same") {
    const A = fs.readFileSync(fa), B = fs.readFileSync(fb);
    if (A.equals(B)) continue;
    bad++;
    const la = A.toString("utf8").split("\n"), lb = B.toString("utf8").split("\n");
    let i = 0; while (i < Math.max(la.length, lb.length) && la[i] === lb[i]) i++;
    console.log(`✗ ${a} ↔ ${b}(要逐位元組相同):第 ${i + 1} 行開始不同\n    DrumDrill :${short(la[i] ?? "(檔案結束)")}\n    PianoDrill:${short(lb[i] ?? "(檔案結束)")}`);
  } else if (mode === "markers") {
    let A, B;
    try { A = strip(fa); B = strip(fb); } catch (e) { bad++; console.log("✗ " + e.message); continue; }
    let i = 0; while (i < Math.max(A.length, B.length) && A[i] && B[i] && A[i].t === B[i].t) i++;
    if (i === A.length && i === B.length) continue;
    bad++;
    const x = A[i], y = B[i];
    console.log(`✗ ${a} ↔ ${b}(@app 區段以外要相同):DrumDrill 第 ${x ? x.n : "結尾"} 行 / PianoDrill 第 ${y ? y.n : "結尾"} 行開始不同\n    DrumDrill :${short(x ? x.t : "(檔案結束)")}\n    PianoDrill:${short(y ? y.t : "(檔案結束)")}`);
  } else { bad++; console.log(`✗ sync.json 的模式不對:${mode}`); }
}
console.log(bad ? `✗ 兩個 App 有 ${bad} 個共用檔案不一致` : `✓ 兩個 App 的 ${pairs.length} 個共用檔案一致`);
process.exit(bad ? 1 : 0);
