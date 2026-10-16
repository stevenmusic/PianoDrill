/* 樂句產生器:旋律(節奏 + 音級隨機走)、和聲(I / IV / V,伴奏型態顯示拍子)、終止式、轉調。
   全部以「級數」運算,最後才換成 MIDI;時間單位 = 八分音符(6/8 的一拍 = 3 個八分)。
   產生的是 ev = [{ t: 秒, midi, dur: 秒, vel }],播放在 app.js */

export const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR_UP = [0, 2, 3, 5, 7, 9, 11];    // 旋律小調上行
const MINOR_DOWN = [0, 2, 3, 5, 7, 8, 10];  // 自然小調(下行)
const HARM_MINOR = [0, 2, 3, 5, 7, 8, 11];  // 和弦用(屬和弦有導音)

export const rnd = n => Math.floor(Math.random() * n);
export const pick = a => a[rnd(a.length)];
export const chance = p => Math.random() < p;
const mod = (a, n) => ((a % n) + n) % n;

/* 調:升降記號最多 n 個(ABRSM:最多三個升降)。tonic = 主音的音級(0–11) */
const MAJ_KEYS = [[0, 0], [7, 1], [5, 1], [2, 2], [10, 2], [9, 3], [3, 3], [4, 4], [8, 4]];   // [主音, 升降數]
const MIN_KEYS = [[9, 0], [4, 1], [2, 1], [11, 2], [7, 2], [6, 3], [0, 3], [1, 4], [5, 4]];
export function pickKey(minor, maxAcc = 3, onlyC = false){
  if (onlyC) return { tonicPc: minor ? 9 : 0, minor };
  return { tonicPc: pick((minor ? MIN_KEYS : MAJ_KEYS).filter(k => k[1] <= maxAcc))[0], minor };
}
/* 主音放在 A3–G♯4 附近(唱得到、手機喇叭也清楚) */
export const tonicMidi = (pc, low = 57) => low + mod(pc - low, 12);

export function degMidi(key, tonic, d, dir = 1){
  const sc = key.minor ? (dir >= 0 ? MINOR_UP : MINOR_DOWN) : MAJOR;
  return tonic + 12 * Math.floor(d / 7) + sc[mod(d, 7)];
}

/* ── 拍子 ──
   meter: "2" "3" "4"(四分音符為一拍)、"6"(6/8)、"5"(5/4)。unit = 一拍幾個八分 */
export const METERS = {
  "2": { beats: 2, unit: 2 }, "3": { beats: 3, unit: 2 }, "4": { beats: 4, unit: 2 },
  "6": { beats: 2, unit: 3 }, "5": { beats: 5, unit: 2 }
};
export const barLen = m => METERS[m].beats * METERS[m].unit;

/* 一小節的節奏(八分音符單位)。easy:只用四分 / 八分 / 二分 */
function barRhythm(m, easy){
  const { beats, unit } = METERS[m];
  const out = [];
  let b = 0;
  while (b < beats) {
    if (unit === 3) { out.push(...pick([[3], [3], [2, 1], [1, 1, 1], [2, 1]])); b++; continue; }
    if (beats - b >= 2 && chance(easy ? 0.15 : 0.2)) { out.push(...(easy || chance(0.5) ? [4] : [3, 1])); b += 2; continue; }
    out.push(...(chance(easy ? 0.3 : 0.4) ? [1, 1] : [2])); b++;
  }
  return out;
}
/* 最後一小節:第一拍落主音,長音到小節結束(4/4 有時先一個四分) */
function lastBar(m){
  const L = barLen(m), { unit } = METERS[m];
  return chance(0.5) && METERS[m].beats >= 3 ? [unit, L - unit] : [L];
}

/* 旋律:bars 小節;range = [lo, hi] 級數(0 = 主音);startDegs 可以開始的級數;結束在主音(0 或 7) */
export function melody({ meter = "4", bars = 4, range = [-3, 7], start = [0, 2, 4], easy = false, maxLeap = 2, endOnTonic = true }){
  const rh = [];
  for (let i = 0; i < bars; i++) rh.push(...(i === bars - 1 && endOnTonic && bars > 1 ? lastBar(meter) : barRhythm(meter, easy)));
  while (rh.length < 3) { const k = rh.findIndex(x => x >= 2); if (k < 0) break; rh.splice(k, 1, rh[k] >> 1, rh[k] - (rh[k] >> 1)); }
  const [lo, hi] = range;
  const okStart = start.filter(d => d >= lo && d <= hi);
  let d = pick(okStart.length ? okStart : [lo]);
  const degs = [d];
  const n = rh.length;
  let endDeg = 0;   // 結束的主音(0 或 7):倒數第二個音時選離目前比較近的
  for (let i = 1; i < n; i++) {
    if (endOnTonic && i === n - 1) { if (n === 2) endDeg = [0, 7].filter(x => x >= lo && x <= hi).sort((a, b) => Math.abs(a - d) - Math.abs(b - d))[0] ?? 0; d = endDeg; degs.push(d); break; }
    if (endOnTonic && i === n - 2) {    // 倒數第二個音:主音的上下鄰音(或屬音)
      endDeg = [0, 7].filter(x => x >= lo && x <= hi).sort((a, b) => Math.abs(a - d) - Math.abs(b - d))[0] ?? 0;
      const c = [endDeg + 1, endDeg - 1, endDeg === 0 ? -3 : 4].filter(x => x >= lo && x <= hi && Math.abs(x - d) <= Math.min(4, maxLeap + 1));
      if (c.length) { d = pick(c); degs.push(d); continue; }
    }
    const r = Math.random();
    let step = r < 0.62 ? pick([1, -1]) : r < 0.72 ? 0 : pick([2, -2, 2, -2, 3, -3, 4, -4].filter(x => Math.abs(x) <= maxLeap).concat(maxLeap < 2 ? [1, -1] : []));
    if (step === 0 && degs.length > 1 && degs[degs.length - 2] === d) step = pick([1, -1]);   // 不要連三個同音
    let nd = d + step;
    if (nd < lo || nd > hi) nd = d - step;
    if (nd < lo || nd > hi) nd = Math.min(hi, Math.max(lo, d + (d < (lo + hi) / 2 ? 1 : -1)));
    d = nd; degs.push(d);
  }
  const notes = []; let t = 0;
  rh.forEach((len, i) => { notes.push({ deg: degs[i], at: t, len }); t += len; });
  return { meter, bars, notes, total: t };
}

/* 和聲:每小節(4/4 每半小節)一個和弦,要包含強拍上的旋律音;倒數第二格用 V,最後 I */
const TRIADS = { I: [0, 2, 4], IV: [3, 5, 0], V: [4, 6, 1], ii: [1, 3, 5], vi: [5, 0, 2] };
export function harmonise(mel){
  const L = barLen(mel.meter), seg = mel.meter === "4" ? L / 2 : L;
  const n = Math.ceil(mel.total / seg), chords = [];
  for (let i = 0; i < n; i++) {
    const s = i * seg, note = mel.notes.find(x => x.at <= s && x.at + x.len > s) || mel.notes[0];
    const dg = mod(note.deg, 7);
    let opts = Object.keys(TRIADS).filter(k => k !== "ii" && k !== "vi" && TRIADS[k].includes(dg));
    if (i === n - 1) opts = ["I"];
    else if (i === n - 2 && opts.includes("V")) opts = ["V"];
    if (!opts.length) opts = Object.keys(TRIADS).filter(k => TRIADS[k].includes(dg));
    if (!opts.length) opts = ["I"];
    chords.push({ at: s, len: Math.min(seg, mel.total - s), name: i === 0 && opts.includes("I") ? "I" : pick(opts) });
  }
  return chords;
}

/* 和弦的音(級數 → MIDI)。小調的 V 用和聲小調(有導音) */
function chordPcs(key, tonic, name){
  const sc = key.minor ? HARM_MINOR : MAJOR;
  const pos = { I: 0, ii: 1, iii: 2, IV: 3, V: 4, vi: 5, V7: 4 }[name.replace(/[bc]$/, "")];
  const tri = name.startsWith("V7") ? [0, 2, 4, 6] : [0, 2, 4];
  return tri.map(x => tonic + 12 * Math.floor((pos + x) / 7) + sc[mod(pos + x, 7)]);
}

/* 旋律 + 伴奏 → 事件(秒)。opts:bpm(拍)、vel、artic(legato / staccato)、accent(強拍加重)、
   acc:是否加伴奏;dyn(t 比例 0–1 → 力度)、tempo(t 比例 → 速度倍率) */
export function render(mel, key, tonic, o = {}){
  const { unit, beats } = METERS[mel.meter];
  const bpm = o.bpm || (unit === 3 ? 60 : 92);
  const eighth = 60 / bpm / unit;
  const L = barLen(mel.meter);
  // 速度變化(漸慢/漸快):把八分音符的位置換成秒(對速度倍率積分)
  const tf = o.tempo || (() => 1);
  const timeAt = x => { let s = 0; const step = 0.25; for (let y = 0; y < x; y += step) s += Math.min(step, x - y) * eighth / tf(y / mel.total); return s; };
  const dyn = o.dyn || (() => o.vel || 66);
  const ev = [];
  const stacc = o.artic === "staccato";
  mel.notes.forEach((n, i) => {
    const t = timeAt(n.at), end = timeAt(n.at + n.len);
    const next = mel.notes[i + 1];
    const dir = next ? Math.sign(next.deg - n.deg) || 1 : -1;
    const strong = n.at % L === 0;
    const v = dyn(n.at / mel.total) + (o.accent && strong ? 10 : 0) + (Math.random() * 6 - 3);
    ev.push({ t, midi: degMidi(key, tonic, n.deg, dir), dur: stacc ? Math.min(0.16, (end - t) * 0.4) : end - t + 0.02, vel: v, part: "mel" });
  });
  if (o.acc) {
    // 伴奏型態(八分音符位置):b = 低音、f = 低音五度、c = 和弦;強拍低音讓拍子聽得出來
    const PAT = { "2": "b.c.", "3": "b.c.c.", "4": "b.c.f.c.", "6": "bccfcc", "5": "b.c.c.f.c." }[mel.meter];
    for (const c of harmonise(mel)) {
      const pcs = chordPcs(key, tonic, c.name);
      const bass = 36 + mod(pcs[0] - 36, 12) + (36 + mod(pcs[0] - 36, 12) < 41 ? 12 : 0);
      for (let x = c.at; x < c.at + c.len; x++) {
        const k = PAT[x % L]; if (k === ".") continue;
        let nx = x + 1; while (nx < c.at + c.len && PAT[nx % L] === ".") nx++;
        const t = timeAt(x), end = timeAt(nx);
        const v = dyn(x / mel.total) * 0.72 + (k === "b" ? 10 : 0);
        const len = stacc ? Math.min(0.16, (end - t) * 0.5) : end - t;
        if (k === "c") for (const p of pcs) ev.push({ t, midi: p - 12 >= 52 ? p - 12 : p, dur: len * 0.92, vel: v - 10, part: "acc" });
        else ev.push({ t, midi: k === "b" ? bass : bass + 7 > 55 ? bass - 5 : bass + 7, dur: len, vel: v, part: "acc" });
      }
    }
  }
  return { ev, dur: timeAt(mel.total), eighth, beat: eighth * unit, bpm };
}

/* 開頭的「調的主和弦 + 起音」(ABRSM 的做法),回傳事件與長度(秒) */
export function keyChordIntro(key, tonic, startMidi, t0 = 0){
  const pcs = chordPcs(key, tonic, "I");
  const ev = pcs.map(m => ({ t: t0, midi: m - 12 >= 48 ? m - 12 : m, dur: 1.3, vel: 58 }));
  ev.push({ t: t0, midi: pcs[0] - 24, dur: 1.3, vel: 60 });
  if (startMidi != null) ev.push({ t: t0 + 1.6, midi: startMidi, dur: 0.9, vel: 66 });
  return { ev, dur: startMidi != null ? 2.7 : 1.7 };
}

/* ── 四部和聲(終止式、和弦辨認、轉調)──
   和弦名稱:I Ib Ic ii iib IV V Vb Vc V7 vi;低音照轉位,上三聲部選離前一個和弦最近的排法 */
export function voiceChords(key, tonic, names){
  let prev = null;
  return names.map(nm => {
    const pcs = chordPcs(key, tonic, nm);
    const inv = nm.endsWith("b") ? 1 : nm.endsWith("c") ? 2 : 0;
    const bassPc = pcs[inv];
    const bass = 36 + mod(bassPc - 36, 12) + (36 + mod(bassPc - 36, 12) < 41 ? 12 : 0);
    // 上三聲部:G3–F5 之間,三個不同的和弦音(七和弦省略五音)
    const tones = pcs.length === 4 ? [pcs[0], pcs[1], pcs[3]] : pcs;
    const cands = [];
    for (let a = 55; a <= 72; a++) for (let b = a + 1; b <= a + 12; b++) for (let c = b + 1; c <= a + 12 && c <= 79; c++) {
      const set = [a, b, c].map(x => mod(x, 12)), need = tones.map(x => mod(x, 12));
      if (need.every(p => set.includes(p)) && set.every(p => need.includes(p)) && a > bass + 2) cands.push([a, b, c]);
    }
    let best = cands[0], bs = Infinity;
    for (const v of cands) {
      const s = prev ? v.reduce((acc, x, i) => acc + Math.abs(x - prev[i]), 0) : Math.abs(v[2] - 72) + Math.random() * 3;
      if (s < bs) { bs = s; best = v; }
    }
    prev = best;
    return { name: nm, bass, upper: best };
  });
}
export function chordEvents(vc, t0, dur = 1.0, gap = 0.05, vel = 64){
  const ev = [];
  vc.forEach((c, i) => {
    const t = t0 + i * dur;
    ev.push({ t, midi: c.bass, dur: dur - gap, vel: vel + 2 });
    for (const m of c.upper) ev.push({ t, midi: m, dur: dur - gap, vel: vel - 4 });
  });
  return { ev, dur: vc.length * dur };
}

/* 終止式樂句:前面幾個和弦 + 終止的兩個和弦 */
export const CADENCES = {
  perfect: [["V", "I"], ["V7", "I"]],
  imperfect: [["I", "V"], ["IV", "V"], ["ii", "V"], ["vi", "V"], ["Ic", "V"]],
  interrupted: [["V", "vi"], ["V7", "vi"]],
  plagal: [["IV", "I"]]
};
const LEADS = [["I", "IV"], ["I", "vi"], ["I", "ii"], ["I", "IV", "I"], ["I", "vi", "IV"], ["I", "V", "vi"], ["I", "Ib", "IV"]];
export function cadencePhrase(type){
  let lead = pick(LEADS), cad = pick(CADENCES[type]);
  if (lead[lead.length - 1] === cad[0]) lead = lead.slice(0, -1);
  if (type === "plagal" && lead[lead.length - 1] === "I") lead = [...lead, "V"].slice(-3);   // IV 之前不要剛好是 I(聽起來像 I–IV–I 鄰音)
  return [...lead, ...cad];
}

/* 轉調:原調 I–IV–V7–I 確立調性,再到新調 ii(或 IV)–V7–I(–IV–V7–I)。
   target:dominant / subdominant / relative。回傳 [{ key, tonic, names }] 兩段 */
export function modulation(key, tonic, target){
  const home = pick([["I", "IV", "V7", "I"], ["I", "vi", "IV", "V7", "I"], ["I", "ii", "V7", "I"]]);
  let nk, nt;
  if (target === "dominant") { nk = { minor: key.minor }; nt = tonic + 7; }
  else if (target === "subdominant") { nk = { minor: key.minor }; nt = tonic + 5; }
  else { nk = { minor: !key.minor }; nt = key.minor ? tonic + 3 : tonic - 3; }
  if (nt > 64) nt -= 12;
  const away = pick([["ii", "V7", "I"], ["IV", "V7", "I"], ["ii", "V7", "I", "IV", "V7", "I"], ["IV", "Ic", "V7", "I"]]);
  return [{ key, tonic, names: home }, { key: nk, tonic: nt, names: away }];
}
