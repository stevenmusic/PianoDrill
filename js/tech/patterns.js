/* 今日練習的關卡(js/tech/routes.js)→ 練習題(ex,musicxml.js 的 exact 格式:每個音自己帶時值)。
   純函式(node 可測;tools/test/checks/routes.mjs)。指法:五指位置照位置算(一指一個鍵,一定對);
   一個八度音階照 data/fingerings.json(已核對);左手和弦照方法書常見的最近位置(SHAPE)。
   題目欄位 q:{ type: "route", r, id }(或 { warm })+ 這一次的變化 rkey(調)/ rhythm / touch / dyn(複習)。
   ex = { exact: true, div: 12, bar, time, fifths, sub: 2, bars, rh, lh, hold: { rh, lh }, dyn: { rh, lh }, lhSoft }
   音:{ letter, alter, octave, midi, finger, dur, chord?: [音…], rest?, stacc?, accent?, slur?: "start" | "stop", tie?: "start" | "stop" | "both" } */
import { parseNote, spellScale, INTERVALS, midiOf, keyFifths } from "./theory.js";
import { scaleFingersFrom } from "./fingering.js";
import { findLevel } from "./routes.js";

export const DIV = 12;
export const VAL = { q: 12, e: 6, s: 3, t: 4, h: 24, w: 48, dq: 18, dh: 36 };
export const keyInfo = k => (k === "a" ? { key: "a", tonic: "A", quality: "minor", iv: INTERVALS.harmonic } : { key: k, tonic: k, quality: "major", iv: INTERVALS.major });

/* 調裡第 d 級(0 = 主音,可以是負的或超過 7)的音;O = 主音所在的八度 */
export function degNote(K, d, O){
  const t = parseNote(K.tonic), sp = spellScale(t, K.iv), k = ((d % 7) + 7) % 7, step = O * 7 + t.letter + d;
  const n = { letter: sp[k].letter, alter: sp[k].alter, octave: Math.floor(step / 7) };
  n.midi = midiOf(n);
  return n;
}
const note = (K, d, O, finger) => ({ ...degNote(K, d, O), finger });
/* 五指位置的主音八度:右手 = 位置最低音不低於中央 C 的最低那個;左手 = 拇指(最高音)不超過 A3 的最高那個 */
export function posOctave(K, p, hand){
  if (hand === "rh") { for (let O = 2; O <= 6; O++) if (degNote(K, p, O).midi >= 60) return O; return 4; }
  for (let O = 6; O >= 0; O--) if (degNote(K, p + 4, O).midi <= 57) return O;
  return 2;
}
/* 某一級落在 lo–hi(midi)之間的主音八度 */
function octaveIn(K, d, lo, hi){
  for (let O = 0; O <= 7; O++) { const m = degNote(K, d, O).midi; if (m >= lo && m <= hi) return O; }
  return 3;
}
const rest = dur => ({ rest: true, dur });

/* ── 手指路線:一隻手的字串 → 音 ── */
export function parseHand(str, K, hand, BAR, value){
  const out = [];
  let dur = VAL[value] || 12, p = 0, pos = 0, bars = 0;
  const O = {};
  const oct = pp => (O[pp] != null ? O[pp] : (O[pp] = posOctave(K, pp, hand)));
  const fingerDeg = f => (hand === "rh" ? f - 1 : 5 - f);
  for (const tok of str.trim().split(/\s+/)) {
    if (tok === "|") { bars++; if (pos !== bars * BAR) throw new Error(`第 ${bars} 小節拍數不對(${pos} ≠ ${bars * BAR}):${str}`); continue; }
    if (tok[0] === "@") {
      const v = tok.slice(1);
      if (v === "I") p = 0; else if (v === "V") p = 4;
      else if (VAL[v]) dur = VAL[v]; else throw new Error("不認得的記號:" + tok);
      continue;
    }
    if (tok === "R") { if (pos % BAR) throw new Error("整小節休止要在小節開頭:" + str); out.push({ ...rest(BAR), whole: true }); pos += BAR; continue; }
    if (tok === "r") { out.push(rest(dur)); pos += dur; continue; }
    if (tok === "-") { out[out.length - 1].dur += dur; pos += dur; continue; }
    const m = /^([0-9=+]+)([.>()]*)$/.exec(tok);
    if (!m) throw new Error("不認得的記號:" + tok);
    const parts = m[1].split("+").map(s => {
      if (s.includes("=")) { const [d, f] = s.split("=").map(Number); return note(K, p + d - 1, oct(p), f); }
      const f = Number(s); if (!(f >= 1 && f <= 5)) throw new Error("手指要 1–5:" + tok);
      return note(K, p + fingerDeg(f), oct(p), f);
    }).sort((a, b) => a.midi - b.midi);
    const n = { ...parts[0], dur };
    if (parts.length > 1) n.chord = parts.slice(1);
    if (m[2].includes(".")) n.stacc = true;
    if (m[2].includes(">")) n.accent = true;
    if (m[2].includes("(")) n.slur = "start";
    if (m[2].includes(")")) n.slur = "stop";
    out.push(n); pos += dur;
  }
  if (pos % BAR) throw new Error(`最後一小節拍數不對(${pos % BAR} / ${BAR}):${str}`);
  return out;
}
/* 按住的音:每小節一個長音(多個手指 = 和弦),小節之間連結線 */
function holdVoice(fingers, K, hand, BAR, bars){
  const O = posOctave(K, 0, hand);
  const ns = fingers.map(f => note(K, hand === "rh" ? f - 1 : 5 - f, O, f)).sort((a, b) => a.midi - b.midi);
  const out = [];
  for (let b = 0; b < bars; b++) {
    const n = { ...ns[0], dur: BAR, hold: true };
    if (ns.length > 1) n.chord = ns.slice(1).map(x => ({ ...x }));
    if (bars > 1) n.tie = b === 0 ? "start" : b === bars - 1 ? "stop" : "both";
    out.push(n);
  }
  return out;
}
/* 一個八度音階:上行八分 ×8、下行八分 ×6 + 主音四分(剛好 2 小節);指法照 fingerings.json */
function scaleHand(FG, K, hand){
  const O = hand === "rh" ? 4 : octaveIn(K, 0, 40, 50);
  const f = scaleFingersFrom(FG, parseNote(K.tonic), K.quality, "harmonic", hand, 0, 1);
  const up = [0, 1, 2, 3, 4, 5, 6, 7].map((d, i) => ({ ...note(K, d, O, f.up[i]), dur: 6 }));
  const down = [6, 5, 4, 3, 2, 1, 0].map((d, i) => ({ ...note(K, d, O, f.down[i]), dur: i === 6 ? 12 : 6 }));
  return up.concat(down);
}

/* ── 左手伴奏 ── */
/* 左手和弦(相對主音的級數;主音放在 E2–D3):I 5-3-1、IV 5-2-1(根音不動)、V7 5-2-1(導音在下) */
export const SHAPE = { I: { d: [0, 2, 4], f: [5, 3, 1] }, i: { d: [0, 2, 4], f: [5, 3, 1] }, IV: { d: [0, 3, 5], f: [5, 2, 1] }, iv: { d: [0, 3, 5], f: [5, 2, 1] }, V7: { d: [-1, 3, 4], f: [5, 2, 1] } };
export const ROOT = { I: 0, i: 0, IV: 3, iv: 3, V: 4, V7: 4, vi: 5 };
export const TONES = { I: [0, 2, 4], i: [0, 2, 4], IV: [3, 5, 0], iv: [3, 5, 0], V: [4, 6, 1], V7: [4, 6, 1, 3], vi: [5, 0, 2] };
/* 右手柱式(I–V–vi–IV,只移動最少的手指;相對右手主音):C4 E4 G4 → B3 D4 G4 → C4 E4 A4 → C4 F4 A4 */
export const RH_CHORD = { I: { d: [0, 2, 4], f: [1, 3, 5] }, V: { d: [-1, 1, 4], f: [1, 2, 5] }, vi: { d: [0, 2, 5], f: [1, 2, 5] }, IV: { d: [0, 3, 5], f: [1, 3, 5] } };
const chordOf = ns => ({ ...ns[0], chord: ns.slice(1) });
const lhO = K => octaveIn(K, 0, 40, 50);
function lhShape(K, ch){
  const s = SHAPE[ch]; if (!s) throw new Error("左手沒有這個和弦的形狀:" + ch);
  return s.d.map((d, i) => note(K, d, lhO(K), s.f[i]));
}
function lhRoot(K, ch){ const r = ROOT[ch], O = octaveIn(K, r, 40, 50); return { root: note(K, r, O, 5), O, r }; }
function lhBar(K, ch, pat, beats){
  const BAR = beats * 12, dur = d => n => ({ ...n, dur: d });
  switch (pat) {
    case "block4": { const c = lhShape(K, ch); return Array.from({ length: beats }, () => ({ ...chordOf(c), dur: 12 })); }
    case "block2": { const c = lhShape(K, ch); return [{ ...chordOf(c), dur: 24 }, { ...chordOf(c), dur: 24 }]; }
    case "root5": { const { root, O, r } = lhRoot(K, ch), fifth = note(K, r + 4, O, 1); return [root, fifth, root, fifth].map(dur(12)); }
    case "broken": { const [a, b, c] = lhShape(K, ch); return [a, b, c, b, a, b, c, b].map(dur(6)); }
    case "alberti": { const [a, b, c] = lhShape(K, ch); return [a, c, b, c, a, c, b, c].map(dur(6)); }
    case "waltz": { const [a, b, c] = lhShape(K, ch); return [{ ...a, dur: 12 }, { ...chordOf([b, c]), dur: 12 }, { ...chordOf([b, c]), dur: 12 }]; }
    case "root": { const { root } = lhRoot(K, ch); return [{ ...root, dur: BAR }]; }
    case "r158": { const { root, O, r } = lhRoot(K, ch), f5 = note(K, r + 4, O, 2), o8 = note(K, r + 7, O, 1); return [root, f5, o8, f5, root, f5, o8, f5].map(dur(6)); }
  }
  throw new Error("不認得的左手型:" + pat);
}
/* 右手長音(App 規則):右手在主音的五指位置,每個和弦挑一個位置裡的和弦音;第一個 = 主和弦的三音,
   之後離前一個音最近(一樣近挑比較低的:七音往下解決) */
export function rhTones(K, prog){
  const out = [];
  let prev = null;
  for (const ch of prog) {
    const cands = [];
    for (let d = 0; d <= 4; d++) if (TONES[ch].some(t => ((t - d) % 7 + 7) % 7 === 0)) cands.push(note(K, d, 4, d + 1));
    let pick;
    if (prev == null) pick = cands.find(n => n.letter === degNote(K, 2, 4).letter) || cands[0];
    else pick = cands.slice().sort((a, b) => Math.abs(a.midi - prev.midi) - Math.abs(b.midi - prev.midi) || a.midi - b.midi)[0];
    out.push(pick); prev = pick;
  }
  return out;
}
function rhBar(K, ch, pat, beats, tone){
  const BAR = beats * 12;
  if (pat === "tones") return [{ ...tone, dur: BAR }];
  const v = RH_CHORD[ch]; if (!v) throw new Error("右手沒有這個和弦的柱式:" + ch);
  const c = chordOf(v.d.map((d, i) => note(K, d, 4, v.f[i])));
  if (pat === "chords4") return Array.from({ length: beats }, () => ({ ...c, dur: 12 }));
  if (pat === "chords2") return [{ ...c, dur: 24 }, { ...c, dur: 24 }];
  if (pat === "c332") return [{ ...c, dur: 18 }, { ...c, dur: 18 }, { ...c, dur: 12 }];
  throw new Error("不認得的右手型:" + pat);
}

/* ── 變化:節奏型(兩個一樣長的音 → 附點 / 反附點)、斷奏、力度 ── */
function applyRhythm(notes, kind, BAR){
  let pos = 0;
  const out = notes.map(n => ({ ...n }));
  for (let i = 0; i + 1 < out.length; i++) {
    const a = out[i], b = out[i + 1], d = a.dur;
    if (!a.rest && !b.rest && b.dur === d && (d === 6 || d === 12) && (pos % BAR) % (2 * d) === 0) {
      a.dur = kind === "dotted" ? d * 1.5 : d / 2; b.dur = 2 * d - a.dur;
      pos += 2 * d; i++; continue;
    }
    pos += d;
  }
  return out;
}
const applyTouch = (notes, t) => notes.map(n => (n.rest ? n : t === "stacc" ? (n.dur <= 12 ? { ...n, stacc: true, slur: undefined } : n) : { ...n, stacc: undefined }));

/* 這一關(+ 這一次的變化)→ ex */
export function buildRoute(FG, q){
  const L = findLevel(q); if (!L) throw new Error("沒有這一關:" + (q.id || q.warm));
  const accomp = !!L.prog;
  const K = keyInfo(q.rkey || L.key || "C");
  const time = L.time || [4, 4], beats = time[0], BAR = beats * 12;
  let rh, lh, hold = null, bars;
  if (accomp) {
    bars = L.prog.length;
    const tones = L.rh === "tones" ? rhTones(K, L.prog) : [];
    lh = L.prog.flatMap(ch => lhBar(K, ch, L.lh, beats));
    rh = L.rh ? L.prog.flatMap((ch, i) => rhBar(K, ch, L.rh, beats, tones[i])) : L.prog.map(() => ({ ...rest(BAR), whole: true }));
  } else if (L.scale) {
    bars = 2;
    rh = L.hands === "LH" ? [{ ...rest(BAR), whole: true }, { ...rest(BAR), whole: true }] : scaleHand(FG, K, "rh");
    lh = L.hands === "RH" ? [{ ...rest(BAR), whole: true }, { ...rest(BAR), whole: true }] : scaleHand(FG, K, "lh");
  } else {
    const src = { rh: L.rh, lh: L.lh };
    const any = parseHand(src.rh || src.lh, K, src.rh ? "rh" : "lh", BAR, L.value);
    bars = Math.round(any.reduce((a, n) => a + n.dur, 0) / BAR);
    const fill = () => Array.from({ length: bars }, () => ({ ...rest(BAR), whole: true }));
    rh = src.rh ? parseHand(src.rh, K, "rh", BAR, L.value) : fill();
    lh = src.lh ? parseHand(src.lh, K, "lh", BAR, L.value) : fill();
    if (L.hold) hold = { rh: L.hold.rh ? holdVoice(L.hold.rh, K, "rh", BAR, bars) : [], lh: L.hold.lh ? holdVoice(L.hold.lh, K, "lh", BAR, bars) : [] };
  }
  if (q.rhythm) { rh = applyRhythm(rh, q.rhythm, BAR); lh = applyRhythm(lh, q.rhythm, BAR); }
  if (q.touch) { rh = applyTouch(rh, q.touch); lh = applyTouch(lh, q.touch); }
  const dz = q.dyn || null;
  const dyn = dz === "balance" ? { rh: "f", lh: "p" } : dz ? { rh: dz, lh: dz } : L.dyn ? { rh: L.dyn.rh || null, lh: L.dyn.lh || null } : { rh: null, lh: null };
  return { exact: true, div: DIV, bar: BAR, time, fifths: keyFifths(K.tonic, K.quality), sub: 2, bars, rh, lh, hold, dyn,
    lhSoft: accomp && !!L.rh, key: K.key, level: L };
}
/* 這一題用到的每個音(檢查、預載用) */
export function allNotes(ex){
  const out = [];
  for (const h of ["rh", "lh"]) for (const arr of [ex[h], ex.hold ? ex.hold[h] || [] : []]) for (const n of arr) if (!n.rest) { out.push({ ...n, hand: h }); for (const c of n.chord || []) out.push({ ...c, hand: h, dur: n.dur }); }
  return out;
}
