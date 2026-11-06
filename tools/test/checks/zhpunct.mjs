/* 中文字串的標點(台灣出版習慣):中文字旁邊的逗號、冒號、分號、問號、驚嘆號、括號用全形,不用半形的 , : ; ? ! ( )
   只看程式裡的字串(" ' `)與 index.html 的文字、屬性值;註解、正規表示式、英文字串不管。
   括號裡全是英文 / 數字的不換(「C(5-3-1)」);數字範圍、♩=80、URL 不受影響(旁邊不是中文字)。
   兩個 App 同一份(tools/test/sync.json same);verify 呼叫 run(root)。
   一次換完:node tools/test/checks/zhpunct.mjs --fix [檔案…](fixSource;換完要看 diff、跑測試) */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HAN = /[\u3400-\u9fff\uf900-\ufaff]/;                       // 中文字
const WIDE = /[\u3400-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/;   // 中文字 + 全形標點與「」、。
const HALF = { ",": "\uff0c", ":": "\uff1a", ";": "\uff1b", "?": "\uff1f", "!": "\uff01" };   // 半形 → 全形
const isWide = c => !!c && WIDE.test(c);

// 先不換的檔案、段落(目前沒有;HOLD = [從這一行, 到這一行之前])
const SKIP = new Set([]);
const HOLD = {};   // [從這一行, 到這一行之前] 不換、不查
function held(src, file, fn){
  const h = HOLD[file]; if (!h) return fn(src);
  const a = src.search(h[0]), b = a < 0 ? -1 : src.slice(a).search(h[1]);
  if (a < 0 || b < 0) return fn(src);
  return fn(src.slice(0, a)) + src.slice(a, a + b) + fn(src.slice(a + b));
}

/* 第 i 個字是要換的半形標點嗎:緊鄰中文字(或隔空白後是中文字);
   前面是佔位(模板的 ${…}、字典的 {name})而且後面是字串結尾 / 中文字也算(「新路線開放了:{r}!」) */
const PH_END = (s, i) => /[\ue000-\uf8ff]/.test(s[i] || "") || (s[i] === "}" && /\{\w+\}$/.test(s.slice(0, i + 1)));
const SEP = /[·—–→|\/]/;              // 「 · 」這類分隔號前後的空白留著
const LIST = /^[^\s,]{1,2}(,[^\s,]{1,2})+$/;   // 「日,一,二…」這種用逗號分開的資料(會被 split),不換
function hit(s, i){
  if (!HALF[s[i]]) return false;
  let j = i + 1; while (s[j] === " ") j++;
  if (isWide(s[i - 1]) || isWide(s[i + 1]) || (s[i + 1] === " " && isWide(s[j]))) return true;
  return PH_END(s, i - 1) && (i + 1 >= s.length || isWide(s[i + 1]));
}

/* 一段字串內容(模板的 ${…} 先換成私用區的佔位字,不算中文)→ 換好的內容 */
// 括號留半形:換全形在折疊機 280 寬中文會多一行(bilingual.mjs 中英高度不同)
const KEEP_PAREN = new Set(["單擊 四分音符(右左輪流)", "到視奏頁練鼓組譜(不是 QSP)"]);
export function fixText(s) {
  if (!HAN.test(s) || LIST.test(s)) return s;
  if (KEEP_PAREN.has(s)) return s;
  // 括號:最裡面那一對、裡面有中文 → 全形;前後的半形空白拿掉(全形括號自己有空間)
  for (let prev = null; prev !== s;) {
    prev = s;
    s = s.replace(/( ?)\(([^()]*)\)( ?)/g, (m, a, body, b, at, all) => {
      if (!WIDE.test(body)) return m;
      const pre = all[at - 1], post = all[at + m.length];
      return (a && SEP.test(pre || "") ? a : "") + "\uff08" + body + "\uff09" + (b && !isWide(post) ? b : "");
    });
  }
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (hit(s, i)) {
      let j = i + 1; while (s[j] === " ") j++;
      if (isWide(out.replace(/ +$/, "").slice(-1))) out = out.replace(/ +$/, "");
      out += HALF[s[i]]; if (!SEP.test(s[j] || "")) i = j - 1; continue;
    }
    out += s[i];
  }
  return out;
}

/* 找出還有半形標點黏著中文字的地方(檢查用;括號不查:常常跨兩段字串) */
export function badText(s) {
  if (!HAN.test(s) || LIST.test(s)) return [];
  const bad = [];
  for (let i = 0; i < s.length; i++) if (hit(s, i)) bad.push(s.slice(Math.max(0, i - 8), i + 9));
  return bad;
}

const WORD_BEFORE_RE = new Set(["return", "typeof", "case", "in", "of", "delete", "void", "throw", "new", "else", "do", "yield", "await"]);

/* JS 原始碼走一遍:字串內容交給 f(內容) 換掉,其他照抄;回傳 { out, end } */
function walkJS(src, f, i = 0, inExpr = false) {
  let out = "", depth = 0, prev = "";
  while (i < src.length) {
    const c = src[i];
    if (inExpr && c === "}" && depth === 0) return { out, end: i };
    if (c === "/" && src[i + 1] === "/") { let e = src.indexOf("\n", i); if (e < 0) e = src.length; out += src.slice(i, e); i = e; continue; }
    if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2) + 2; out += src.slice(i, e); i = e; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1; while (j < src.length && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      out += c + f(src.slice(i + 1, j)) + c; i = j + 1; prev = "str"; continue;
    }
    if (c === "`") {
      let j = i + 1, text = ""; const ex = [];
      while (j < src.length && src[j] !== "`") {
        if (src[j] === "\\") { text += src.slice(j, j + 2); j += 2; continue; }
        if (src[j] === "$" && src[j + 1] === "{") {
          const r = walkJS(src, f, j + 2, true);
          text += String.fromCharCode(0xe000 + ex.length); ex.push(r.out); j = r.end + 1; continue;
        }
        text += src[j++];
      }
      const fixed = f(text).replace(/[\ue000-\uf8ff]/g, m => "${" + ex[m.charCodeAt(0) - 0xe000] + "}");
      out += "`" + fixed + "`"; i = j + 1; prev = "str"; continue;
    }
    if (c === "/" && (prev === "" || WORD_BEFORE_RE.has(prev) || (prev.length === 1 && /[(,=:[!&|?{};+\-*%<>~^]/.test(prev)))) {
      let j = i + 1, cls = false;
      while (j < src.length && src[j] !== "\n") {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === "[") cls = true; else if (src[j] === "]") cls = false; else if (src[j] === "/" && !cls) break;
        j++;
      }
      j++; while (/[a-z]/.test(src[j] || "")) j++;
      out += src.slice(i, j); i = j; prev = "re"; continue;
    }
    if (c === "{") depth++; else if (c === "}") depth--;
    if (/\s/.test(c)) { out += c; i++; continue; }
    if (/[\w$]/.test(c)) { let j = i; while (j < src.length && /[\w$]/.test(src[j])) j++; prev = src.slice(i, j); out += prev; i = j; continue; }
    prev = c; out += c; i++;
  }
  return { out, end: i };
}

/* index.html:註解照抄,<script> 裡面當 JS,其他(文字、屬性值)直接換 */
function walkHTML(src, f) {
  let out = "", i = 0;
  while (i < src.length) {
    if (src.startsWith("<!--", i)) { const e = src.indexOf("-->", i) + 3; out += src.slice(i, e); i = e; continue; }
    const m = /^<script\b[^>]*>/i.exec(src.slice(i, i + 300));
    if (m) {
      const s = i + m[0].length, e = src.indexOf("</script>", s);
      out += m[0] + (/importmap|json/.test(m[0]) ? src.slice(s, e) : walkJS(src.slice(s, e), f).out); i = e; out += "</script>"; i += 9; continue;
    }
    let e = src.indexOf("<", i + 1); if (e < 0) e = src.length;
    if (src[i] === "<") { const t = src.indexOf(">", i) + 1; out += src.slice(i, t).replace(/="([^"]*)"/g, (all, v) => '="' + f(v) + '"'); i = t; continue; }
    out += f(src.slice(i, e)); i = e;
  }
  return out;
}

const walk = (src, file, f) => held(src, file, part => file.endsWith(".html") ? walkHTML(part, f) : walkJS(part, f).out);
export const fixSource = (src, file) => walk(src, file, fixText);
export function badSource(src, file) {
  const bad = []; walk(src, file, s => { bad.push(...badText(s)); return s; });
  return bad;
}

/* 要查的檔案:index.html + js/ 底下所有 .js */
export function files(root) {
  const list = [];
  const walk = d => { for (const n of readdirSync(join(root, d), { withFileTypes: true })) {
    const p = d + "/" + n.name;
    if (n.isDirectory()) walk(p); else if (p.endsWith(".js") && !SKIP.has(p)) list.push(p);
  } };
  walk("js");
  if (existsSync(join(root, "index.html"))) list.push("index.html");
  return list;
}

export function run(root) {
  const errs = [];
  for (const p of files(root)) for (const b of badSource(readFileSync(join(root, p), "utf8"), p)) errs.push(`${p}:「${b}」`);
  return errs;
}

const ROOT = join(fileURLToPath(import.meta.url), "../../../..");
/* verify 呼叫:每一處算一項失敗(最多列 20 處) */
export default function check(ok){
  const errs = run(ROOT);
  errs.slice(0, 20).forEach(e => ok(false, "中文旁邊用了半形標點 " + e));
  ok(errs.length <= 20, `另外還有 ${errs.length - 20} 處`);
  ok(true, "中文字串的標點");
  return errs.length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = ROOT;
  if (process.argv.includes("--fix")) {
    const only = process.argv.slice(2).filter(a => !a.startsWith("--"));
    for (const p of only.length ? only : files(root)) {
      const src = readFileSync(join(root, p), "utf8"), out = fixSource(src, p);
      if (out !== src) { writeFileSync(join(root, p), out); console.log("改了", p); }
    }
  }
  const errs = run(root);
  console.log(errs.length ? errs.join("\n") + `\n✗ ${errs.length} 處中文旁邊用了半形標點` : `✓ 中文字串的標點都是全形(${relative(process.cwd(), root) || "."})`);
  process.exitCode = errs.length ? 1 : 0;
}
