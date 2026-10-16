/* 一道題目 → 兩手的音符(音高 + 指法)。
   題目欄位:type、tonic(起音/調)、quality、form、octaves 或 range("5th")、motion、apart、inversion、lhStart/rhStart(半音階)
   type:scale | arpeggio | dom7 | dim7 | chromatic | wholetone | broken | thirds | sixths */
import {
  INTERVALS, parseNote, spellScale, startOctave, triadTones, dom7Tones, dim7Tones, inversionTones,
  midiOf, keyFifths, noteLabelStr, pcOf, placeAtLeast, walkCycle, wholeToneCycle, chromaticRun
} from "./theory.js";
import { tr, getLang } from "./i18n.js";
import {
  scaleFingersFrom, triadFingers, fourNoteFingers, chromaticFingers, arpGroupFingers, cyclicFingers, BROKEN_FINGERS, thirdsStart, thirdsFingers, sixthsFingers
} from "./fingering.js";
import { buildHanon } from "./hanon.js";

const withF = (notes, fingers) => notes.map((n, i) => ({ ...n, midi: midiOf(n), finger: fingers ? fingers[i] : null }));
const scaleIv = q => q.quality === "major" ? INTERVALS.major : INTERVALS[q.form];
const downIv = q => q.quality !== "major" && q.form === "melodic" ? INTERVALS.natural : scaleIv(q);

/* ── 音域:左手起音、右手起音 ──
   同向:左手照起音字母放在 startOctave;右手 = 左手往上找同名音(八度)、三度相隔 = 再高一個三度(十度)、六度相隔 = 往上第一個(六度)
   反向:兩手都從中央 C 附近開始 */
function startNotes(q, lhSp, rhSp){
  const n = q.octaves || 1;
  if (q.motion === "contrary") {
    const lh = placeAtLeast(lhSp, 59);              // B3 以上的第一個(中央 C 附近)
    const rh = placeAtLeast(rhSp, midiOf(lh));
    return { lh, rh };
  }
  const lhOct = startOctave("lh", n, "similar", lhSp);   // 左手起音的字母決定八度(相隔三度/六度時右手再往上放)
  const lh = { ...lhSp, octave: lhOct };
  // 三度相隔:右手比左手高十度;其他:右手在左手之上最近的那個(同名音 = 八度)
  const min = q.apart === 3 || q.apartTenth ? midiOf(lh) + 12 + 1 : midiOf(lh) + 1;
  const rh = placeAtLeast(rhSp, min);
  // 右手最高音超過 E7(相隔三度的四個八度會到 G♯7)→ 兩手一起低一個八度(左手不低於 A0)
  if (midiOf(rh) + 12 * n > 100 && midiOf(lh) - 12 >= 21) { lh.octave--; rh.octave--; }
  return { lh, rh };
}

/* ── 音階(含相隔三度/六度、反向、五度範圍)── */
function buildScale(FG, q){
  const t = parseNote(q.tonic);
  const up = spellScale(t, scaleIv(q)), dn = spellScale(t, downIv(q));
  if (q.range === "5th") return fiveFinger(q, up);
  const n = q.octaves;
  // 起始級數:三度相隔 → 右手從第 3 級;六度相隔 → 左手從第 3 級(主音在上方)
  const deg = { rh: q.apart === 3 ? 2 : 0, lh: q.apart === 6 ? 2 : 0 };
  const st = startNotes(q, up[deg.lh], up[deg.rh]);
  const out = {};
  for (const hand of ["rh", "lh"]) {
    const d0 = deg[hand], start = st[hand];
    const f = scaleFingersFrom(FG, t, q.quality, q.form, hand, d0, n);
    if (q.motion === "contrary" && hand === "lh") {
      // 左手先往下 n 個八度(用下行的音:旋律小調是自然小調)再回來
      const outward = walkCycle(dn, d0, start, 7 * n, -1);
      const back = walkCycle(up, d0, outward[outward.length - 1], 7 * n, 1);
      out.lh = withF(outward, f.downAsc.slice().reverse()).concat(withF(back.slice(1), f.up.slice(1)));
      continue;
    }
    const asc = walkCycle(up, d0, start, 7 * n, 1);
    const desc = walkCycle(dn, d0, start, 7 * n, 1).slice(0, -1).reverse();
    out[hand] = withF(asc, f.up).concat(withF(desc, f.down));
  }
  return out;
}

/* 五度範圍(初級):反向 = 1-2-3-4-5-4-3-2-1(左手往下);琶音 = 1-3-5-3-1 */
function fiveFinger(q, sp){
  const contrary = q.motion === "contrary";
  const rhStart = contrary ? placeAtLeast(sp[0], 59) : placeAtLeast(sp[0], 60);
  const lhStart = contrary ? rhStart : placeAtLeast(sp[0], midiOf(rhStart) - 12);
  const rhUp = walkCycle(sp, 0, rhStart, 4, 1);
  const rh = withF(rhUp.concat(rhUp.slice(0, -1).reverse()), [1, 2, 3, 4, 5, 4, 3, 2, 1]);
  let lh;
  if (contrary) {
    const lhDown = walkCycle(sp, 0, lhStart, 4, -1);   // C B A G F
    lh = withF(lhDown.concat(lhDown.slice(0, -1).reverse()), [1, 2, 3, 4, 5, 4, 3, 2, 1]);
  } else {
    const lhUp = walkCycle(sp, 0, lhStart, 4, 1);
    lh = withF(lhUp.concat(lhUp.slice(0, -1).reverse()), [5, 4, 3, 2, 1, 2, 3, 4, 5]);
  }
  return { rh, lh };
}

/* ── 琶音(原位、轉位、屬七解決、減七、五度範圍)── */
function buildArp(FG, q){
  const n = q.octaves || 1;
  let tones, f = {};
  if (q.type === "arpeggio") {
    if (q.range === "5th") {
      const sp = triadTones(q.tonic, q.quality);
      const rh0 = placeAtLeast(sp[0], 60), lh0 = placeAtLeast(sp[0], 48);
      const r = walkCycle(sp, 0, rh0, 2, 1), l = walkCycle(sp, 0, lh0, 2, 1);
      return { rh: withF(r.concat(r.slice(0, -1).reverse()), [1, 3, 5, 3, 1]), lh: withF(l.concat(l.slice(0, -1).reverse()), [5, 3, 1, 3, 5]) };
    }
    tones = inversionTones(q.tonic, q.quality, q.inversion || 0);
    for (const h of ["rh", "lh"]) f[h] = q.inversion ? arpGroupFingers(tones, h, n) : triadFingers(FG, parseNote(q.tonic), q.quality, h, n);
  } else {
    tones = q.type === "dom7" ? dom7Tones(q.tonic, q.quality) : dim7Tones(q.tonic);
    for (const h of ["rh", "lh"]) f[h] = fourNoteFingers(tones, h, n);
  }
  const st = startNotes(q, tones[0], tones[0]);
  const out = {};
  for (const h of ["rh", "lh"]) {
    const asc = walkCycle(tones, 0, st[h], tones.length * n, 1);
    let notes = withF(asc, f[h].up).concat(withF(asc.slice(0, -1).reverse(), f[h].down));
    if (q.type === "dom7" && q.sys !== "trinity") {
      // 解決到主音(照 ABRSM 6–8 級大綱的譜例):下行停在導音(屬音上方的三音),最低的屬音不彈,往上半音到主音
      // Trinity 大綱沒有寫要解決,就照一般琶音回到起音
      notes = notes.slice(0, -1);
      const last = notes[notes.length - 1];
      const tonic = placeAtLeast(parseNote(q.tonic), last.midi + 1);
      const lf = last.finger;
      const rf = h === "rh" ? Math.min(5, lf + 1) : (lf === 1 ? 2 : lf - 1);   // 往上半音:右手下一指、左手上一指(左手拇指時用 2 跨過去)
      notes = notes.concat(withF([tonic], [rf]));
    }
    out[h] = notes;
  }
  return out;
}

/* ── 半音階(同向/反向,兩手可以從不同的音開始)── */
function buildChromatic(q){
  const lhSp = parseNote(q.lhStart || q.tonic), rhSp = parseNote(q.rhStart || q.tonic);
  const n = q.octaves;
  let lh, rh;
  if (q.motion === "contrary") {
    lh = placeAtLeast(lhSp, 59); rh = placeAtLeast(rhSp, midiOf(lh));
  } else {
    lh = { ...lhSp, octave: startOctave("lh", n, "similar", lhSp) };
    rh = placeAtLeast(rhSp, midiOf(lh) + (q.apartTenth ? 13 : 1));
  }
  const name = sp => "CDEFGAB"[sp.letter] + (sp.alter > 0 ? "#".repeat(sp.alter) : "b".repeat(-sp.alter));
  const r = chromaticRun(name(rhSp), rh.octave, n, "up").notes;
  const l = chromaticRun(name(lhSp), lh.octave, n, q.motion === "contrary" ? "down" : "up").notes;
  return { rh: withF(r, chromaticFingers(r, "rh")), lh: withF(l, chromaticFingers(l, "lh")) };
}

/* ── 全音音階 ── */
function buildWholeTone(q){
  const cyc = wholeToneCycle(q.tonic), n = q.octaves;
  const st = startNotes(q, cyc[0], cyc[0]);
  const out = {};
  for (const h of ["rh", "lh"]) {
    const f = cyclicFingers(cyc.map(pcOf), h, n);
    const asc = walkCycle(cyc, 0, st[h], 6 * n, 1);
    out[h] = withF(asc, f.up).concat(withF(asc.slice(0, -1).reverse(), f.down));
  }
  return out;
}

/* ── 分解和弦(Trinity 1 級:三連音)──
   上行:原位 → 第一轉位 → 第二轉位(每組由低到高);下行:第二轉位、第一轉位(每組由高到低),最後回到起音(長音)。
   共 5 組三連音 + 結尾音,結尾音剛好落在拍點上。
   型態依一般教材寫法,請以 Trinity《Piano Scales & Arpeggios from 2015》核對 */
function buildBroken(q){
  const out = {};
  // 照 Trinity 大綱(分解和弦只出現在 Trinity;使用者要求「考試系統怎麼寫就怎麼做」):
  // 初級(五度範圍,大綱 p.97 譜例):3/4,八分音符 1-3-5-3 + 四分音符 1(C E G E | C)
  if (q.range === "5th") {
    const sp = inversionTones(q.tonic, q.quality, 0);
    for (const h of ["rh", "lh"]) {
      const g = walkCycle(sp, 0, placeAtLeast(sp[0], h === "rh" ? 60 : 48), 2, 1);
      out[h] = withF([g[0], g[1], g[2], g[1], g[0]], h === "rh" ? [1, 3, 5, 3, 1] : [5, 3, 1, 3, 5]);
    }
    return out;
  }
  // 1 級(一個八度,大綱 p.101 D 小調譜例):三連音,上行 原位 → 第一轉位 → 第二轉位,停在高八度的主音(一整拍);
  // 下行 第二轉位 → 第一轉位 → 原位(每組反過來),最後一個長音照譜例停在五音(一整拍)
  for (const h of ["rh", "lh"]) {
    const groups = [], fing = [];
    let prevFirst = null;
    for (let inv = 0; inv < 3; inv++) {
      const ts = inversionTones(q.tonic, q.quality, inv);
      const first = prevFirst === null ? placeAtLeast(ts[0], h === "rh" ? 60 : 48) : placeAtLeast(ts[0], midiOf(prevFirst) + 1);
      groups.push(walkCycle(ts, 0, first, 2, 1)); fing.push(BROKEN_FINGERS[h][inv]);
      prevFirst = first;
    }
    const notes = [], fs = [];
    groups.forEach((g, i) => { notes.push(...g); fs.push(...fing[i]); });
    // 頂端:高八度的主音(第二轉位那組的中間音),右手 3、左手 2
    notes.push({ ...groups[2][1], dur: 12, ntype: "quarter" }); fs.push(h === "rh" ? 3 : 2);
    for (let i = 2; i >= 0; i--) { notes.push(...groups[i].slice().reverse()); fs.push(...fing[i].slice().reverse()); }
    // 結尾:原位那組的五音(譜例的寫法),右手 5、左手 1
    notes.push({ ...groups[0][2] }); fs.push(h === "rh" ? 5 : 1);
    out[h] = withF(notes, fs);
  }
  return out;
}

/* ── 三度/六度雙音音階(單手):下方音走音階,上方音高三度或六度。
   指法版本差異大(連奏三度有多種系統),這裡只標音、不標指法 ── */
function buildDouble(FG, q){
  const t = parseNote(q.tonic);
  const up = spellScale(t, scaleIv(q)), dn = spellScale(t, downIv(q));
  const step = q.type === "thirds" ? 2 : 5;      // 三度 = 往上兩級、六度 = 往上五級
  const lowDeg = q.type === "thirds" ? 0 : 2;     // 六度:主音在上方 → 下方音從第 3 級
  const n = q.octaves, out = {};
  for (const h of ["rh", "lh"]) {
    const base = placeAtLeast(up[lowDeg], h === "rh" ? 60 : 48);
    while (midiOf(base) + 12 * n + 9 > 98) base.octave--;   // 最上面的音不超過 D7(兩個八度的六度會太高)
    const asc = walkCycle(up, lowDeg, base, 7 * n, 1);
    const desc = walkCycle(dn, lowDeg, base, 7 * n, 1).slice(0, -1).reverse();
    const lower = asc.concat(desc);
    const degOf = i => i <= 7 * n ? (lowDeg + i) % 7 : (lowDeg + (14 * n - i)) % 7;
    const pairs = lower.map((ln, i) => {
      const cyc = i <= 7 * n ? up : dn;
      return [ln, placeAtLeast(cyc[(degOf(i) + step) % 7], midiOf(ln) + 1)];
    });
    // 指法:三度照哈農第 52 首的循環(fingering.js),六度照哈農第 48 首
    const fs = q.type === "thirds" ? thirdsFingers(lower.map((_, i) => degOf(i)), thirdsStart(up, q.quality, q.tonic).p, h) : sixthsFingers(pairs, h);
    out[h] = pairs.map(([ln, upper], i) => ({ ...ln, midi: midiOf(ln), finger: fs[i][0], with: { ...upper, midi: midiOf(upper), finger: fs[i][1] } }));
  }
  return out;
}

export const SIXTEENTH_TYPES = ["scale", "chromatic", "wholetone", "thirds", "sixths", "arpeggio", "dom7", "dim7"];   // 分解和弦照 Trinity 大綱(三連音 / 初級八分音符)
export function buildExercise(FG, q){
  if (q.type === "hanon") return buildHanon(q.no, q.tonic, q.rhythm);
  const b = {
    scale: buildScale, arpeggio: buildArp, dom7: buildArp, dim7: buildArp,
    chromatic: (FG, q) => buildChromatic(q), wholetone: (FG, q) => buildWholeTone(q),
    broken: (FG, q) => buildBroken(q), thirds: buildDouble, sixths: buildDouble
  }[q.type];
  if (!b) throw new Error("未知題型:" + q.type);
  const { rh, lh } = b(FG, q);
  const noKey = ["chromatic", "dim7", "wholetone"].includes(q.type);
  const fifths = noKey ? 0 : keyFifths(q.tonic, q.quality || "major");
  // 音階、琶音(使用者要求,跟哈農一樣;分解和弦三個音一組,寫三連音、一組一拍):寫成十六分音符、2/4 一小節 8 個音(拍號不顯示);速度與拍點不變
  // ABRSM 大綱印了譜例的項目照譜例的節奏寫(八分音符,最後一個音四分音符):初級反向五度、初級琶音五度、6–8 級屬七
  if (q.sys === "abrsm" && q.range === "5th") return { rh, lh, fifths, sub: 2, bar: rh.length === 9 ? 60 : 36, timeHidden: [rh.length === 9 ? 5 : 3, 4], finalQuarter: true };
  if (q.sys === "abrsm" && q.type === "dom7") return { rh, lh, fifths, sub: 2, finalQuarter: true };
  if (SIXTEENTH_TYPES.includes(q.type) && (q.sub || 2) === 2) return { rh, lh, fifths, sub: 4, bar: 24, timeHidden: [2, 4] };
  if (q.type === "broken" && q.range === "5th") return { rh, lh, fifths, sub: 2, bar: 36, time: [3, 4] };   // 初級:大綱譜例是 3/4(八分音符一拍一組,結尾四分音符)
  return { rh, lh, fifths, sub: q.sub || 2 };
}

/* ── 題目文字(考官點題的說法;中英雙語)── */
const OCT = [["", ""], ["一個八度", "1 octave"], ["兩個八度", "2 octaves"], ["三個八度", "3 octaves"], ["四個八度", "4 octaves"]];
const FORM = { harmonic: ["和聲小調", "harmonic minor", "harm. minor"], melodic: ["旋律小調", "melodic minor", "mel. minor"], natural: ["自然小調", "natural minor", "nat. minor"] };
const INV = [["", ""], ["第一轉位", "1st inv."], ["第二轉位", "2nd inv."]];
const HAND = { RH: ["右手", "RH"], LH: ["左手", "LH"], HT: ["雙手", "HT"] };
const DYN = { f: ["f", "f"], p: ["p", "p"], mf: ["mf", "mf"], "cresc-dim": ["p–f–p", "p–f–p"] };
const pick = pair => tr(pair[0], pair[1]);
const nm = s => noteLabelStr(s);
const qual = q => q.quality === "minor" ? tr(" 小調", " minor") : tr(" 大調", " major");
const keyQ = q => q.quality === "minor" && q.form ? nm(q.tonic) + " " + pick(FORM[q.form]) : nm(q.tonic) + qual(q);
export function keyName(q){
  switch (q.type) {
    case "chromatic":
      if (q.lhStart && q.rhStart && q.lhStart !== q.rhStart) return tr(`半音階(左 ${nm(q.lhStart)}、右 ${nm(q.rhStart)})`, `Chromatic, LH ${nm(q.lhStart)} RH ${nm(q.rhStart)}`);
      return tr("從 " + nm(q.tonic) + " 開始的半音階", "Chromatic on " + nm(q.tonic));
    case "wholetone": return tr("從 " + nm(q.tonic) + " 開始的全音音階", "Whole-tone on " + nm(q.tonic));
    case "dim7": return tr(nm(q.tonic) + " 減七和弦琶音", "Dim. 7th on " + nm(q.tonic));
    case "dom7": return tr(nm(q.tonic) + qual(q) + "的屬七和弦琶音", "Dom. 7th in " + nm(q.tonic) + (q.quality === "minor" ? " minor" : ""));
    case "arpeggio": return nm(q.tonic) + qual(q) + (q.inversion ? tr("琶音(" + INV[q.inversion][0] + ")", " arp. " + INV[q.inversion][1]) : tr("琶音", " arpeggio"));
    case "broken": return nm(q.tonic) + qual(q) + (q.range === "5th" ? tr("分解三和弦", " broken triad") : tr("分解和弦", " broken chord"));
    case "thirds": return keyQ(q) + tr("三度雙音音階", " in 3rds");
    case "sixths": return keyQ(q) + tr("六度雙音音階", " in 6ths");
  }
  const apart = q.apart === 3 ? tr("(相隔三度)", "3rd apart") : q.apart === 6 ? tr("(相隔六度)", "6th apart") : "";
  if (q.motion === "contrary") return q.quality === "minor" && q.form ? nm(q.tonic) + tr(" " + FORM[q.form][0] + "反向音階", " " + FORM[q.form][2] + " contrary") : keyQ(q) + tr("反向音階", " contrary");
  if (apart) return getLang() === "en" ? nm(q.tonic) + (q.quality === "minor" && q.form ? " " + FORM[q.form][2] : " major") + ", " + apart : keyQ(q) + (q.quality === "minor" && q.form ? "" : "音階") + apart;
  return keyQ(q) + tr("音階", " scale");
}
export const keyNameZh = keyName;
export function questionText(q){
  if (q.type === "hanon") return [tr(`哈農 第 ${q.no} 首`, `Hanon No. ${q.no}`), pick(HAND[q.hands] || HAND.HT), nm(q.tonic) + (q.quality === "minor" ? tr(" 小調", " minor") : tr(" 大調", " major"))]
    .concat(q.rhythm === "dotted" ? [tr("附點", "Dotted")] : q.rhythm === "reverse" ? [tr("反附點", "Rev. dotted")] : []);
  // 相隔三度/六度放在標籤(取代「雙手」),題目才不會比另一種語言多一行
  const parts = [keyName(q.apart ? { ...q, apart: 0 } : q)];
  parts.push(q.motion === "contrary" ? tr("反向", "Contrary") : q.apart === 3 ? tr("相隔三度", "3rd apart") : q.apart === 6 ? tr("相隔六度", "6th apart") : pick(HAND[q.hands] || HAND.HT));
  parts.push(q.range === "5th" ? tr("五度範圍", "5th range") : pick(OCT[q.octaves] || [q.octaves + " 個八度", q.octaves + " octaves"]));
  parts.push(q.articulation === "staccato" ? tr("斷奏", "Staccato") : tr("圓滑奏", "Legato"));
  if (q.dynamic) parts.push(DYN[q.dynamic] ? pick(DYN[q.dynamic]) : q.dynamic);
  return parts;
}
