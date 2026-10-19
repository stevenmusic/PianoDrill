/* 今日練習的關卡(js/tech/routes.js)→ 練習題(ex,musicxml.js 的 exact 格式:每個音自己帶時值)。
   純函式(node 可測;tools/test/checks/routes.mjs)。指法:五指位置照位置算(一指一個鍵,一定對);
   一個八度音階照 data/fingerings.json(已核對);左手和弦照方法書常見的最近位置(SHAPE)。
   題目欄位 q:{ type: "route", r, id }(或 { warm })+ 這一次的變化 rkey(調)/ rhythm / touch / dyn(複習)。
   ex = { exact: true, div: 12, bar, time, fifths, sub: 2, bars, rh, lh, hold: { rh, lh }, dyn: { rh, lh }, lhSoft }
   音:{ letter, alter, octave, midi, finger, dur, chord?: [音…], rest?, stacc?, accent?, slur?: "start" | "stop", tie?: "start" | "stop" | "both" } */
import { parseNote, spellScale, INTERVALS, midiOf, keyFifths, noteLabel, isBlack } from "./theory.js";
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

/* ══ 譜面標記(方法書的寫法;app.js 畫、checks/routes.mjs 檢查)══ */
/* 和弦的實際名字:C、F、G7、Am、E7、B♭(最近位置的轉位照寫根音,不寫 F/C) */
export function chordName(K, ch){
  const r = degNote(K, ROOT[ch], 4), minor = ch === ch.toLowerCase();
  return noteLabel(r) + (minor ? "m" : "") + (/7$/.test(ch) ? "7" : "");
}
/* 這一關每一小節的和弦名(伴奏;不是伴奏 = null) */
export function barChords(ex){
  const L = ex.level; if (!L || !L.prog) return null;
  const K = keyInfo(ex.key);
  return L.prog.slice(0, ex.bars).map(ch => chordName(K, ch));
}
/* 和弦表:這一關用到的和弦(照出現順序)[{ name, notes: ["C","E","G"](低 → 高), fingers: [5,3,1] }];
   彈和弦形狀的那隻手:右手柱式(chords4 / chords2 / c332)= 右手,其他 = 左手 */
export function chordTable(ex){
  const names = barChords(ex); if (!names) return null;
  const h = /^(chords|c332)/.test(ex.level.rh || "") ? "rh" : "lh";
  const out = [], seen = new Set();
  let pos = 0;
  const byBar = Array.from({ length: ex.bars }, () => []);
  for (const n of ex[h]) { const b = Math.floor(pos / ex.bar); if (b < ex.bars && !n.rest) byBar[b].push(n); pos += n.dur; }
  names.forEach((name, b) => {
    if (seen.has(name)) return; seen.add(name);
    const m = new Map();
    for (const n of byBar[b]) for (const x of [n, ...(n.chord || [])]) if (!m.has(x.midi)) m.set(x.midi, x);
    const xs = [...m.values()].sort((a, c) => a.midi - c.midi);
    out.push({ name, notes: xs.map(noteLabel), fingers: xs.map(x => x.finger), hand: h });
  });
  return out;
}
/* 兩小節(或全部小節)一模一樣:畫一小節 + 反覆記號(播放照原本的長度重複)。回傳新的 ex(bars = 1、repeat = 原本的小節數)或 null */
export function sameBars(ex){
  if (!ex || !ex.exact || ex.bars < 2) return null;
  const bar = arr => { const out = Array.from({ length: ex.bars }, () => []); let p = 0; for (const n of arr || []) { const b = Math.floor(p / ex.bar); if (b < ex.bars) out[b].push(n); p += n.dur; } return out; };
  const sig = n => n.rest ? "r" + n.dur : [n.midi, ...(n.chord || []).map(c => c.midi)].join("+") + ":" + n.dur + ":" + n.finger + (n.stacc ? "." : "") + (n.accent ? ">" : "") + (n.slur || "") + (n.tie || "");
  const parts = [ex.rh, ex.lh, ex.hold && ex.hold.rh, ex.hold && ex.hold.lh].map(bar);
  const same = parts.every(bs => bs.every(b => b.map(sig).join(" ") === bs[0].map(sig).join(" ")));
  if (!same) return null;
  // 按住的音(連結線跨小節)不能縮成一小節
  if (ex.hold && ((ex.hold.rh || []).length || (ex.hold.lh || []).length)) return null;
  const one = bs => bs[0].map(n => ({ ...n, chord: n.chord ? n.chord.map(c => ({ ...c })) : undefined }));
  return { ...ex, bars: 1, repeat: ex.bars, rh: one(parts[0]), lh: one(parts[1]) };
}
/* 指法要標哪些(方法書的做法;n.fshow = false 的不標):
   - 和弦(柱式):每個和弦形狀在這份譜只標第一次
   - 單音:第 1 小節每個音都標;之後只標「跟第 1 小節同一個位置的手指不同」、換位置(拇指穿越、跨指、移位)、休止超過 1 拍後的第一個音;
     伴奏的分解和弦(Alberti 等):換到新的和弦形狀時那個形狀每個音第一次出現的地方
   - all = true(手指路線 A 組、暖身):每個音都標 */
const stepOf = n => n.octave * 7 + n.letter;
const posOf = (n, h) => stepOf(n) - (h === "rh" ? n.finger - 1 : 5 - n.finger);
export function fingerMarks(ex, { all = false } = {}){
  const accomp = !!(ex.level && ex.level.prog);
  // 和弦的音(chord)在同一小節的幾拍之間是同一個物件:先複製,才能每一拍分開標
  for (const h of ["rh", "lh"]) ex[h] = (ex[h] || []).map(n => (n.chord ? { ...n, chord: n.chord.map(c => ({ ...c })) } : n));
  for (const h of ["rh", "lh"]) {
    const bars = Array.from({ length: ex.bars }, () => []);
    let p = 0;
    for (const n of ex[h] || []) { const b = Math.floor(p / ex.bar); if (b < ex.bars) bars[b].push(n); p += n.dur; }
    const m1 = bars[0].filter(n => !n.rest && !n.chord);
    const chordSeen = new Set(), shapeSeen = new Set();
    let prev = null, restLen = 0;
    bars.forEach((ns, b) => {
      const real = ns.filter(n => !n.rest);
      const shape = [...new Set(real.flatMap(n => [n, ...(n.chord || [])]).map(x => x.midi + ":" + x.finger))].sort().join();
      const newShape = !shapeSeen.has(shape); shapeSeen.add(shape);
      const firstPitch = new Set();
      let i = 0;
      for (const n of ns) {
        if (n.rest) { restLen += n.dur; continue; }
        if (n.chord) {
          const key = [n, ...n.chord].map(x => x.midi + ":" + x.finger).sort().join();
          const show = all || !chordSeen.has(key); chordSeen.add(key);
          n.fshow = show; n.chord.forEach(c => { c.fshow = show; });
        } else {
          let show = all || b === 0;
          if (!show) {
            if (accomp) show = newShape && !firstPitch.has(n.midi);
            else {
              const ref = m1[i];
              if (!ref || ref.finger !== n.finger) show = true;
              if (prev && !prev.chord && posOf(prev, h) !== posOf(n, h)) show = true;
              if (restLen > 12) show = true;
            }
          }
          n.fshow = show; firstPitch.add(n.midi); i++;
        }
        restLen = 0; prev = n;
      }
    });
    // 按住的音:只在第一小節標(後面是連結線)
    for (const [k, n] of ((ex.hold && ex.hold[h]) || []).entries()) { n.fshow = k === 0; (n.chord || []).forEach(c => { c.fshow = n.fshow; }); }
  }
  return ex;
}
/* 手位圖:每隻手這一關放的五指位置(單音的關;伴奏看和弦表)[{ hand, keys: [{ midi, finger }](低 → 高), thumb(拇指的音名) }],
   換位置的關最多兩個位置;音階(拇指穿越)不畫 */
export function handPositions(ex){
  if (!ex || !ex.exact || (ex.level && (ex.level.prog || ex.level.scale))) return [];
  const out = [];
  for (const h of ["rh", "lh"]) {
    const list = [];
    for (const n of [...(ex[h] || []), ...((ex.hold && ex.hold[h]) || [])]) if (!n.rest) for (const x of [n, ...(n.chord || [])]) {
      const pos = posOf(x, h);
      let P = list.find(q => q.pos === pos);
      if (!P) { if (list.length >= 2) continue; P = { pos, keys: new Map() }; list.push(P); }
      if (!P.keys.has(x.finger)) P.keys.set(x.finger, x);
    }
    for (const P of list) {
      // 五個手指都放出來(沒彈到的手指照位置補:右手 1 在最低、左手 5 在最低)
      const base = P.pos, K = keyInfo(ex.key);
      const keys = [1, 2, 3, 4, 5].map(f => {
        if (P.keys.has(f)) return { midi: P.keys.get(f).midi, finger: f, used: true, name: noteLabel(P.keys.get(f)) };
        const st = base + (h === "rh" ? f - 1 : 5 - f), n = degNote(K, st - parseNote(K.tonic).letter, 0);   // 位置裡第 f 指的音(照調號)
        return { midi: midiOf(n), finger: f, used: false, name: noteLabel(n) };
      }).sort((a, b) => a.midi - b.midi);
      const thumb = keys.find(k => k.finger === 1);
      out.push({ hand: h, keys, thumb: thumb ? thumb.name : "", mid: !!thumb && thumb.midi === 60, low: keys[0].name });
    }
  }
  return out;
}
