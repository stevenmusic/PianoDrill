/* 指法:音階、三和弦琶音查 data/fingerings.json 的標準表;屬七/減七琶音、半音階用規則產生。
   回傳的手指陣列與 theory.js 的音高序列一一對應。 */
import { pcOf, sharpKey, isBlack, midiOf } from "./theory.js";

const digits = s => [...s].map(Number);

/* 兩個八度的表 → n 個八度(上行順序,含頂端) */
export function expandScale(s, n){
  const d = digits(s);
  const out = d.slice(0, 7);
  for (let k = 1; k < n; k++) out.push(...d.slice(7, 14));
  out.push(d[14]);
  return out;
}
export function expandArp(s, n){
  const d = digits(s);
  const out = d.slice(0, 3);
  for (let k = 1; k < n; k++) out.push(...d.slice(3, 6));
  out.push(d[6]);
  return out;
}

function scaleEntry(FG, quality, form, tonicPc){
  const table = quality === "major" ? FG.scale.major : FG.scale[form === "natural" ? "melodic" : form];
  const e = table[sharpKey(tonicPc)];
  if (!e) throw new Error("指法表缺:" + quality + "/" + form + "/" + sharpKey(tonicPc));
  return e;
}

/* 同向音階:{ up, down },up 長 7n+1、down 長 7n */
export function scaleFingers(FG, tonic, quality, form, hand, n){
  const e = scaleEntry(FG, quality, form, pcOf(tonic));
  const natural = form === "natural";
  const upS = natural ? (e[hand + "Desc"] || e[hand]) : e[hand];
  const downS = quality !== "major" && (form === "melodic" || natural) ? (e[hand + "Desc"] || e[hand]) : e[hand];
  const up = expandScale(upS, n);
  const downAsc = expandScale(downS, n);
  downAsc[downAsc.length - 1] = up[up.length - 1];   // 頂端同一個音
  return { up, down: downAsc.slice(0, -1).reverse(), downAsc };
}

export function triadFingers(FG, tonic, quality, hand, n){
  const e = FG.arpeggio[quality === "major" ? "major" : "minor"][sharpKey(pcOf(tonic))];
  if (!e) throw new Error("琶音指法表缺:" + quality + "/" + sharpKey(pcOf(tonic)));
  const up = expandArp(e[hand], n);
  return { up, down: up.slice(0, -1).reverse() };
}

/* 四個音的琶音(屬七、減七):
   右手:拇指放在和弦音裡第一個白鍵,之後 1 2 3 4 循環;最高音是拇指的位置就用 5。
   左手:拇指放在根音(白鍵時)或往回找的第一個白鍵,往前倒數 1 2 3 4;最低音是拇指位置就用 5。 */
export function fourNoteFingers(tones, hand, n){
  const white = tones.map(t => !isBlack(pcOf(t)));
  const k = tones.length;
  let up;
  if (hand === "rh") {
    let t = white.indexOf(true); if (t < 0) t = 0;
    const f = i => ((i - t + k) % k) + 1;
    up = [];
    for (let i = 0; i <= k * n; i++) up.push(f(i % k));
    for (let i = 0; i < t; i++) up[i] = 2 + i;   // 第一個拇指之前的音從 2 開始(2 1 2 3 4…)
    if (t === 0) up[up.length - 1] = 5;
  } else {
    let u = 0;
    if (!white[0]) for (const c of [3, 2, 1]) if (white[c]) { u = c; break; }
    const g = i => ((u - i + k) % k) + 1;
    up = [];
    for (let i = 0; i <= k * n; i++) up.push(g(i % k));
    if (u === 0) up[0] = 5;
  }
  return { up, down: up.slice(0, -1).reverse() };
}

/* 半音階(每個音固定一根手指,上下行相同):
   右手:黑鍵 3、白鍵 1,C 與 F 用 2(接在 B、E 之後);起音是 C 或 F 時用 1
   左手:黑鍵 3、白鍵 1,E 與 B 用 2 */
export function chromaticFinger(midi, hand, isStart){
  const pc = ((midi % 12) + 12) % 12;
  if (isBlack(pc)) return 3;
  if (hand === "rh") return (pc === 0 || pc === 5) && !isStart ? 2 : 1;
  return pc === 4 || pc === 11 ? 2 : 1;
}
export function chromaticFingers(notes, hand){
  const startMidi = midiOf(notes[0]);
  return notes.map((n, i) => { const m = midiOf(n); return chromaticFinger(m, hand, m === startMidi); });
}

/* ── 從任一級數開始的音階指法(相隔三度/六度的音階會從第 3 級開始)──
   每個音用表裡「中間那個八度」的手指(同一個音同一根手指);
   從主音開始/結束時用表裡的起音、最高音手指;不是主音時:右手最高音若是拇指改用前一指 +1、左手最低音若是拇指改用下一指 +1 */
export function scaleCycle(FG, tonic, quality, form, hand, desc){
  const e = scaleEntry(FG, quality, form, pcOf(tonic));
  const s = digits(desc && e[hand + "Desc"] ? e[hand + "Desc"] : (form === "natural" ? (e[hand + "Desc"] || e[hand]) : e[hand]));
  return { start: s[0], head: s.slice(0, 7), cycle: s.slice(7, 14), top: s[14] };   // head:第一個八度(哈農 39 有的調開頭兩個音跟循環不同,例:A♭ 大調右手 2-3-1)
}
export function scaleFingersFrom(FG, tonic, quality, form, hand, startDeg, n){
  const up = scaleCycle(FG, tonic, quality, form, hand, false);
  const dn = quality !== "major" && (form === "melodic" || form === "natural") ? scaleCycle(FG, tonic, quality, form, hand, true) : up;
  const len = 7 * n + 1;
  const make = c => {
    const f = [];
    for (let i = 0; i < len; i++) f.push(c.cycle[(startDeg + i) % 7]);
    if (startDeg === 0) { for (let i = 0; i < 7 && i < len - 1; i++) f[i] = c.head[i]; f[len - 1] = c.top; }
    else if (hand === "rh") { if (f[len - 1] === 1) f[len - 1] = Math.min(5, f[len - 2] + 1); }
    else if (f[0] === 1) f[0] = Math.min(5, f[1] + 1);
    return f;
  };
  const fu = make(up), fd = make(dn);
  // 右手在頂端轉下行:下行第一個音的手指要比頂端小(例:F♯ 旋律小調上行用 2 到頂、下行 E 也是 2 → 頂端改 3)
  if (hand === "rh" && n >= 1 && fd[len - 2] >= fu[len - 1] && fd[len - 2] < 5) fu[len - 1] = fd[len - 2] + 1;
  fd[len - 1] = fu[len - 1];
  return { up: fu, downAsc: fd, down: fd.slice(0, -1).reverse() };
}

/* ── 琶音轉位(三個音一組)──
   右手:拇指放在每組第一個白鍵(優先放在這個轉位的最低音);一組 1-x-y:前兩個音距四度以上用 3、否則 2;
        第一個到第三個音距小六度以上用 4、否則 3。拇指前面的音從 2 開始;最高音是拇指的位置就用 5
   左手:鏡像,拇指放在一組最後一個音(白鍵優先),往前 x、y 同樣依音距;最低音是拇指位置就用 5 */
export function arpGroupFingers(tones, hand, n){
  const pcs = tones.map(t => pcOf(t)), k = tones.length;
  const white = pcs.map(p => !isBlack(p));
  const gap = (a, b) => ((pcs[b % k] - pcs[a % k]) % 12 + 12) % 12 || 12;
  const up = [];
  if (hand === "rh") {
    let t = white.indexOf(true); if (t < 0) t = 0;
    const x = gap(t, t + 1) >= 5 ? 3 : 2, y = gap(t, t + 1) + gap(t + 1, t + 2) >= 8 ? 4 : 3;
    const cyc = []; cyc[t] = 1; cyc[(t + 1) % k] = x; cyc[(t + 2) % k] = y;
    for (let i = 0; i <= k * n; i++) up.push(cyc[i % k]);
    // 拇指前面的音:只有一個就用 2;有兩個就照循環的手指(例:A♭ 大調第二轉位 E♭-A♭-C = 2-4-1,以前寫 2-3 要撐四度)
    for (let i = 0; i < t; i++) up[i] = t === 1 ? 2 : cyc[i];
    if (t === 0) up[up.length - 1] = 5;
  } else {
    let u = 0;
    if (!white[0]) for (const c of [2, 1]) if (white[c]) { u = c; break; }
    // 一組 = (u+1, u+2, u+3=u) 往上走到拇指:y x 1
    const a = (u + 1) % k, b = (u + 2) % k;
    const x = gap(b, u) >= 6 ? 3 : 2, y = gap(a, b) + gap(b, u) >= 8 ? 4 : 3;
    const cyc = []; cyc[u] = 1; cyc[b] = x; cyc[a] = y;
    for (let i = 0; i <= k * n; i++) up.push(cyc[i % k]);
    if (u === 0) up[0] = 5;
  }
  return { up, down: up.slice(0, -1).reverse() };
}

/* ── 通用循環指法(全音音階):在白鍵上選拇指,兩個拇指之間 2~4 個音;右手從拇指往上 1 2 3 4、左手往上數到拇指 4 3 2 1 ──
   窮舉拇指位置(一個八度最多 7 個音),選「拇指數最少、每組長度最平均」的 */
export function cyclicFingers(pcsCycle, hand, n){
  const k = pcsCycle.length;
  let best = null;
  for (let mask = 1; mask < (1 << k); mask++) {
    const T = [];
    for (let i = 0; i < k; i++) if (mask >> i & 1) T.push(i);
    if (T.some(i => isBlack(pcsCycle[i]))) continue;
    const gaps = T.map((t, j) => ((T[(j + 1) % T.length] - t) % k + k) % k || k);
    if (gaps.some(g => g < 2 || g > 4)) continue;
    const score = T.length * 10 + gaps.reduce((s, g) => s + Math.abs(g - 3), 0);
    if (!best || score < best.score) best = { T, score };
  }
  if (!best) throw new Error("找不到拇指位置");
  const cyc = new Array(k);
  for (let j = 0; j < best.T.length; j++) {
    const t = best.T[j], next = best.T[(j + 1) % best.T.length], g = ((next - t) % k + k) % k || k;
    if (hand === "rh") for (let s = 0; s < g; s++) cyc[(t + s) % k] = s + 1;
    else for (let s = 1; s <= g; s++) cyc[(t + s) % k] = g - s + 1;   // 從 t+1 往上到下一個拇指:g g-1 … 1
  }
  const up = [];
  for (let i = 0; i <= k * n; i++) up.push(cyc[i % k]);
  if (hand === "rh") { if (up[up.length - 1] === 1) up[up.length - 1] = Math.min(5, up[up.length - 2] + 1); }
  else if (up[0] === 1) up[0] = Math.min(5, up[1] + 1);
  return { up, down: up.slice(0, -1).reverse() };
}

/* ── 分解和弦(三個音一組:原位 1-3-5、第一轉位 1-2-5、第二轉位 1-3-5;左手 5-3-1、5-3-1、5-2-1)── */
export const BROKEN_FINGERS = { rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]], lh: [[5, 3, 1], [5, 3, 1], [5, 2, 1]] };

/* ── 雙音音階指法(照哈農《The Virtuoso Pianist》Ricordi 版,使用者提供的書逐調核對,2026-10)──
   圓滑三度 = 第 52 首「Scales in Thirds in the Keys Most Used」(書 p.87–90):原譜只印這 12 個調(小調是和聲小調)。
   每個調、每隻手各記上行 15 組(兩個八度,低 → 高)與下行 15 組(高 → 低,第一組就是頂端那組);
   有印的數字照抄,沒印的用前後印出來的數字唯一決定(拇指組 1-2 → 1-3 → 2-4 → 3-5);決定不了的(E 大調下行兩處)留空,跟原譜一樣不標。
   代號 右手(下方指, 上方指):a = 1-2、b = 1-3、c = 2-4、d = 3-5;左手:A = 5-3、B = 4-2、C = 3-1、D = 2-1;- = 不標
   注意:各調分組不同(例如 C 4+3+4+4、G 4+4+3+4),有的調上下行也不同,不能用同一個循環推。
   斷奏三度、斷奏六度 = 第 48 首(書 p.79–80,只有 C 大調、simile):三度右手 2-4、左手 4-2;六度右手 1-5、左手 5-1。 */
const H52 = {
  P1: { rh: ["abcdbcdabcdabcd", "dcbadcbadcbdcba"], lh: ["ABCDABCABCDABCD", "DCBADCBACBADCBA"] },
  G:  { rh: ["abcdabcdbcdabcd", "dcbadcbadcbdcba"], lh: ["ABCDABCDABCABCD", "DCBADCBACBADCBA"] },
  A:  { rh: ["bcdabcdbcdabcdb", "bdcbadcbdcbadcb"], lh: ["ABCABCDABCABCDB", "BDCBACBADCBACBA"] },
  E:  { rh: ["bcdabcdbcdbcbcd", "d-d-adcbdcbadcb"], lh: ["ABCABCDABCABCBC", "CBCBACBADCBACBA"] },
  Bb: { rh: ["abcdabcdbcdabcd", "dcbadcbdcbadcba"], lh: ["ABCDABCDABCDABC", "CBADCBADCBADCBA"] },
  Eb: { rh: ["bcbcdbcdabcdbcd", "dcbdcbadcbdcbcb"], lh: ["BCABCABCABCDABC", "CBADCBACBACBACB"] },
  Ab: { rh: ["bcbcdbcdabcdbcd", "dcbdcbadcbdcbcb"], lh: ["BCBCDABCABCDABC", "CBADCBACBACBACB"] },
  m2: { rh: ["bcdabcdbcdabcdb", "bdcbadcbdcbadcb"], lh: ["ABCABCDABCABCBC", "CBCBACBADCBACBA"] }
};
const H52_KEYS = { "major:C": "P1", "major:D": "P1", "major:F": "P1", "minor:A": "P1", "major:G": "G", "major:A": "A", "major:E": "E",
  "major:Bb": "Bb", "major:Eb": "Eb", "major:Ab": "Ab", "minor:D": "m2", "minor:G": "m2" };
const PAIR = { a: [1, 2], b: [1, 3], c: [2, 4], d: [3, 5], A: [5, 3], B: [4, 2], C: [3, 1], D: [2, 1], "-": [null, null] };
/* 哈農有沒有這個調(小調只有和聲小調) */
export function hanonThirdsKey(quality, tonic, form){
  if (quality === "minor" && form !== "harmonic") return null;
  return H52_KEYS[`${quality === "minor" ? "minor" : "major"}:${tonic}`] || null;
}
/* 圓滑三度:上行 7n+1 組 + 下行 7n 組的 [下方指, 上方指];哈農沒有的調回傳 null(不標指法)
   一個八度(Trinity 6 級等;哈農只有兩個八度):用第 52 首上面那個八度(從中間的主音到頂端再回來,頂端怎麼轉照原譜);
   上面那個八度的主音不是拇指組的調(G、B♭、E♭、A♭)改用下面那個八度上行、原路下行 */
export function thirdsFingers(quality, tonic, form, hand, octaves){
  const k = hanonThirdsKey(quality, tonic, form); if (!k) return null;
  const [up, down] = H52[k][hand], rh = H52[k].rh;
  let seq;
  if (octaves >= 2) seq = up + down.slice(1);
  else if ("ab".includes(rh[0][7]) && rh[1][7] === rh[0][7]) seq = up.slice(7) + down.slice(1, 8);
  else seq = up.slice(0, 8) + [...up.slice(0, 7)].reverse().join("");
  return [...seq].map(c => PAIR[c].slice());
}
/* 斷奏三度、斷奏六度(第 48 首):每一組同一個指法 */
export const STACCATO_DOUBLE = { thirds: { rh: [2, 4], lh: [4, 2] }, sixths: { rh: [1, 5], lh: [5, 1] } };
