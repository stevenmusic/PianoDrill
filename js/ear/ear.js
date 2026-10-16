/* 聽音題目:單音 / 音程 / 和弦。只產生「題目 = 要播的音 + 正確答案」,播放在 app.js、音色在 audio.js。
   音高一律用 MIDI(C4 = 60);音名照升降記號規則拼,不用查表拼字 */
import { tr } from "./i18n.js";

/* ── 音名 ── */
const PC_SHARP = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const PC_FLAT = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
export const isBlack = pc => [1, 3, 6, 8, 10].includes(((pc % 12) + 12) % 12);
/* 白鍵:C;黑鍵:C♯/D♭ */
export const pcName = pc => { pc = ((pc % 12) + 12) % 12; return isBlack(pc) ? PC_SHARP[pc] + "/" + PC_FLAT[pc] : PC_SHARP[pc]; };
export const midiName = m => pcName(m) + (Math.floor(m / 12) - 1);

/* ── 單音 ── 答案 = 音級(0–11) */
export const NOTE_ITEMS = Array.from({ length: 12 }, (_, pc) => ({ id: String(pc), pc }));
/* 單音分頁的音名:字母(C D E)或固定唱名(Do Re Mi,台灣學生常用) */
const SOL = ["Do", "Do♯/Re♭", "Re", "Re♯/Mi♭", "Mi", "Fa", "Fa♯/Sol♭", "Sol", "Sol♯/La♭", "La", "La♯/Si♭", "Si"];
let SOLF = false;
export const setSolfege = v => { SOLF = !!v; };
export const noteName = pc => SOLF ? SOL[((pc % 12) + 12) % 12] : pcName(pc);
export const noteLabel = it => noteName(it.pc);
export const NOTE_RANGES = { "1": [60, 71], "2": [48, 71], "4": [36, 83] };   // 1 個八度(C4–B4)、2 個八度(C3–B4)、4 個八度(C2–B5)

/* ── 音程 ── 答案 = 半音數(1–12) */
export const INTERVALS = [
  { id: "m2", st: 1, zh: "小二度", en: "m2" }, { id: "M2", st: 2, zh: "大二度", en: "M2" },
  { id: "m3", st: 3, zh: "小三度", en: "m3" }, { id: "M3", st: 4, zh: "大三度", en: "M3" },
  { id: "P4", st: 5, zh: "完全四度", en: "P4" }, { id: "TT", st: 6, zh: "三全音", en: "Tritone" },
  { id: "P5", st: 7, zh: "完全五度", en: "P5" }, { id: "m6", st: 8, zh: "小六度", en: "m6" },
  { id: "M6", st: 9, zh: "大六度", en: "M6" }, { id: "m7", st: 10, zh: "小七度", en: "m7" },
  { id: "M7", st: 11, zh: "大七度", en: "M7" }, { id: "P8", st: 12, zh: "完全八度", en: "Octave" }
];
export const intervalLabel = it => tr(it.zh, it.en);

/* ── 和弦 ── */
export const CHORDS = [
  { id: "maj", iv: [0, 4, 7], zh: "大三和弦", en: "Major" },
  { id: "min", iv: [0, 3, 7], zh: "小三和弦", en: "Minor" },
  { id: "dim", iv: [0, 3, 6], zh: "減三和弦", en: "Dim." },
  { id: "aug", iv: [0, 4, 8], zh: "增三和弦", en: "Aug." },
  { id: "dom7", iv: [0, 4, 7, 10], zh: "屬七和弦", en: "Dom. 7" },
  { id: "maj7", iv: [0, 4, 7, 11], zh: "大七和弦", en: "Maj. 7" },
  { id: "min7", iv: [0, 3, 7, 10], zh: "小七和弦", en: "Min. 7" },
  { id: "m7b5", iv: [0, 3, 6, 10], zh: "半減七和弦", en: "Half-dim. 7" },
  { id: "dim7", iv: [0, 3, 6, 9], zh: "減七和弦", en: "Dim. 7" }
];
export const chordLabel = it => tr(it.zh, it.en);
const INV_NAME = () => [tr("原位", "root pos."), tr("第一轉位", "1st inv."), tr("第二轉位", "2nd inv."), tr("第三轉位", "3rd inv.")];

/* 各分頁的答案清單(依目前設定:只出選了的項目) */
export const ALL_ITEMS = { note: NOTE_ITEMS, interval: INTERVALS, chord: CHORDS };
export function itemsFor(tab, pick){ return ALL_ITEMS[tab].filter(it => pick.set.includes(it.id)); }
export function itemLabel(tab, it){ return tab === "note" ? noteLabel(it) : tab === "interval" ? intervalLabel(it) : chordLabel(it); }

const rnd = n => Math.floor(Math.random() * n);
const pickOne = a => a[rnd(a.length)];
/* 加強弱項:答錯比例越高越常出(沒練過的也多出一點) */
function weighted(items, stats, tab, adaptive){
  if (!adaptive) return pickOne(items);
  const w = items.map(it => {
    const s = stats[tab + ":" + it.id];
    if (!s || s.n < 3) return 2;
    return 1 + 4 * (1 - s.ok / s.n);
  });
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) { r -= w[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}

function voice(root, iv, inv){
  const ns = iv.map(x => root + x);
  for (let i = 0; i < inv; i++) ns.push(ns.shift() + 12);
  return ns;
}
/* 音 → 播放事件:single 單音(可先給參考音)、melodic 一個接一個、block 同時、arp 分解、both 分解再同時 */
function playOf(notes, mode, ref){
  const ev = []; let t = 0;
  if (ref != null) { ev.push({ t: 0, midi: ref, dur: 1.0, vel: 62 }); t = 1.6; }
  if (mode === "block") { notes.forEach(m => ev.push({ t, midi: m, dur: 1.8, vel: 64 })); return { ev, dur: t + 1.9 }; }
  const gap = mode === "melodic" ? 0.8 : 0.42;
  notes.forEach((m, i) => ev.push({ t: t + i * gap, midi: m, dur: mode === "arp" || mode === "both" ? (notes.length - i) * gap + 1.0 : 0.78, vel: 66 }));
  t += notes.length * gap;
  if (mode === "both") { t += 0.3; notes.forEach(m => ev.push({ t, midi: m, dur: 1.8, vel: 64 })); t += 1.9; }
  else t += mode === "single" ? 1.2 : 0.9;
  return { ev, dur: t };
}

/* 產生一題(格式同 aural.js)。prev:上一題(避免連續出一模一樣的題目) */
export function makeQuestion(tab, pick, stats, adaptive, prev){
  const items = itemsFor(tab, pick);
  if (!items.length) return null;
  let q = null;
  for (let tries = 0; tries < 8; tries++) {
    q = build(tab, pick, weighted(items, stats, tab, adaptive), items);
    if (!prev || items.length === 1 || q.sig !== prev.sig) break;
  }
  return q;
}

function build(tab, pick, it, items){
  if (tab === "note") {
    const [lo, hi] = NOTE_RANGES[pick.range];
    const cands = [];
    for (let m = lo; m <= hi; m++) if (((m % 12) + 12) % 12 === it.pc) cands.push(m);
    const m = pickOne(cands), ref = pick.ref === "C" ? 60 : pick.ref === "A" ? 69 : null;
    return { tab, key: "note:" + it.id, sig: "n" + m, play: playOf([m], "single", ref),
      keys: { target: [m], lo: 60, hi: 71, pcOnly: true, allowed: items.map(x => x.pc), mute: true },
      label: tr("這是什麼音?", "Which note?"), tags: [...questionTags({ tab, ref }), tr("八度不限", "Any octave")], reveal: noteName(m) + (Math.floor(m / 12) - 1),
      compare: id => playOf([Math.floor(m / 12) * 12 + Number(id)], "single", null) };
  }
  if (tab === "interval") {
    const dir = pick.dir === "mix" ? pickOne(["up", "down", "harm"]) : pick.dir;
    // 隨機起音:兩個音都在 G3–G5 之間(手機喇叭也聽得清楚)
    const root = pick.root === "C" ? 60 : 55 + rnd(Math.max(1, 79 - it.st - 55 + 1));
    const ns = x => dir === "down" ? [root + x.st, root] : [root, root + x.st];
    const mode = dir === "harm" ? "block" : "melodic";
    return { tab, key: "interval:" + it.id, sig: dir + root + it.id, play: playOf(ns(it), mode),
      steps: [{ q: tr("什麼音程?", "Which interval?"), choices: items.map(x => ({ id: x.id, label: intervalLabel(x) })), answer: it.id }],
      label: tr("這是什麼音程?", "Which interval?"), tags: questionTags({ tab, dir }), reveal: ns(it).map(midiName).join(" → "),
      compare: id => playOf(ns(INTERVALS.find(x => x.id === id)), mode) };
  }
  const inv = pick.inv === "root" ? 0 : rnd(it.iv.length);
  const root = pick.root === "C" ? 60 : 53 + rnd(12);   // F3–E4
  const mode = pick.style === "mix" ? pickOne(["block", "arp"]) : pick.style;
  const vo = c => voice(root, c.iv, Math.min(inv, c.iv.length - 1));
  return { tab, key: "chord:" + it.id, sig: mode + root + inv + it.id, play: playOf(vo(it), mode),
    steps: [{ q: tr("什麼和弦?", "Which chord?"), choices: items.map(x => ({ id: x.id, label: chordLabel(x) })), answer: it.id }],
    label: tr("這是什麼和弦?", "Which chord?"), tags: questionTags({ tab, mode }),
    reveal: pcName(root) + " " + chordLabel(it) + (inv ? "(" + INV_NAME()[inv] + ")" : ""),
    compare: id => playOf(vo(CHORDS.find(x => x.id === id)), mode) };
}

/* 題目說明(播放前顯示,不洩漏答案) */
function questionTags(q){
  if (q.tab === "note") return [q.ref === 60 ? tr("參考音 C4", "Ref. C4") : q.ref === 69 ? tr("參考音 A4", "Ref. A4") : tr("沒有參考音", "No reference")];
  if (q.tab === "interval") return [{ up: tr("上行", "Ascending"), down: tr("下行", "Descending"), harm: tr("同時", "Harmonic") }[q.dir]];
  return [q.mode === "block" ? tr("同時", "Block") : q.mode === "arp" ? tr("分解", "Broken") : tr("分解再同時", "Broken + block")];
}
