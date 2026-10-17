/* 哈農《The Virtuoso Pianist》第一部分 1–20 首:用「樣式 + 移位規則」產生,不逐音手打。
   原譜 = 上行 14 小節 + 下行 14 小節 + 結尾(兩個八度),2/4 拍、每小節 8 個十六分音符,兩手平行八度(左手低一個八度)。
   另有一個八度的版本(使用者要求):上行 7 小節 + 下行 7 小節,同樣的樣式與結尾。
   up / down:上行第 1 小節、下行第 1 小節(兩個八度版的第 15 小節)右手的 8 個音,以「C 大調音階從 C3 起算的級數」記(0 = C3、7 = C4);
   上行每小節整組 +1 級,下行每小節整組 −1 級。指法照原譜印在第 1、15 小節的數字(右手 rhU / rhD、左手 lhU / lhD)。
   fix:原譜在轉折處改的音或指法(不照樣式):at "top" = 上行最後一小節(第 14 小節)、"end" = 下行最後一小節(第 28 小節);
   i = 小節裡第幾個音(0 起),deg = 改成的級數(兩個八度版的座標),rh / lh = 指法。
   哈農在轉折處會避開「同一個音連彈兩次」(例:第 6 首第 14 小節原本最後是 G、第 15 小節又從 G 開始 → 改成 C)。
   移調:同一組級數換成該調的大音階(照原譜的做法,每個調都用同一個樣式)。
   資料來源:IMSLP #00874(Schirmer 版)。2026-10 第二次核對(使用者發現錯音):逐首看第 1、14、15、28 小節與結尾,
   改了第 12 首的樣式(上行第一個音是六度不是五度:A C E D C D E C;下行從 B 開始)與第 6、7、12、14、15、17、18 首的轉折。 */
import { parseNote, spellScale, INTERVALS, midiOf, keyFifths } from "./theory.js";

const D = s => s.split("").map(Number);
export const HANON = {
  1: { up: [0, 2, 3, 4, 5, 4, 3, 2], down: [18, 16, 15, 14, 13, 14, 15, 16], rhU: "12345432", lhU: "54321234", rhD: "54321234", lhD: "12345432" },
  2: { up: [0, 2, 5, 4, 3, 4, 3, 2], down: [18, 15, 13, 14, 15, 14, 15, 16], rhU: "12543432", lhU: "53123234", rhD: "52123234", lhD: "13543432" },
  3: { up: [0, 2, 5, 4, 3, 2, 3, 4], down: [18, 15, 13, 14, 15, 16, 15, 14], rhU: "12543234", lhU: "53123432", rhD: "52123432", lhD: "13543234" },
  4: { up: [0, 1, 0, 2, 5, 4, 3, 2], down: [18, 17, 18, 15, 13, 14, 15, 16], rhU: "12125432", lhU: "54531234", rhD: "54521234", lhD: "12135432" },
  5: { up: [0, 5, 4, 5, 3, 4, 2, 3], down: [14, 15, 14, 16, 15, 17, 16, 18], rhU: "15453423", lhU: "51213243", rhD: "12132435", lhD: "54534231" },
  6: { up: [0, 5, 4, 5, 3, 5, 2, 5], down: [18, 13, 14, 13, 15, 13, 16, 13], rhU: "15453525", lhU: "51213141", rhD: "51213141", lhD: "15453525",
    fix: [{ at: "top", i: 7, deg: 14, rh: 1, lh: 5 }, { at: "end", i: 7, deg: 2, rh: 3, lh: 3 }] },
  7: { up: [0, 2, 1, 3, 2, 4, 3, 2], down: [18, 16, 17, 15, 16, 14, 15, 16], rhU: "13243543", lhU: "53423134", rhD: "53423134", lhD: "13243543",
    fix: [{ at: "top", i: 6, rh: 3 }, { at: "top", i: 7, rh: 2 }] },
  8: { up: [0, 2, 4, 5, 3, 4, 2, 3], down: [18, 16, 14, 13, 15, 14, 16, 15], rhU: "12453423", lhU: "54213243", rhD: "54213243", lhD: "12453423" },
  9: { up: [0, 2, 3, 2, 4, 3, 5, 4], down: [18, 16, 15, 16, 14, 15, 13, 14], rhU: "12324354", lhU: "54342312", rhD: "54342312", lhD: "12324354" },
  10: { up: [0, 5, 4, 3, 2, 3, 2, 3], down: [18, 13, 14, 15, 16, 15, 16, 15], rhU: "15432323", lhU: "51234343", rhD: "51234343", lhD: "15432323" },
  11: { up: [0, 2, 5, 4, 5, 4, 3, 4], down: [18, 15, 13, 14, 13, 14, 15, 14], rhU: "12545434", lhU: "53121232", rhD: "52121232", lhD: "13545434" },
  12: { up: [5, 0, 2, 1, 0, 1, 2, 0], down: [13, 18, 16, 17, 18, 17, 16, 18], rhU: "51321231", lhU: "15345435", rhD: "15345435", lhD: "51321231",
    fix: [{ at: "top", i: 7, deg: 16, rh: 4, lh: 2 }] },
  13: { up: [2, 0, 3, 1, 4, 2, 3, 4], down: [16, 18, 15, 17, 16, 14, 15, 16], rhU: "31425345", lhU: "35241321", rhD: "35243134", lhD: "31423532" },
  14: { up: [0, 1, 3, 2, 3, 2, 4, 3], down: [18, 17, 15, 16, 15, 16, 14, 15], rhU: "12434354", lhU: "54232313", rhD: "54232313", lhD: "12434354",
    fix: [{ at: "top", i: 7, rh: 3 }] },
  15: { up: [0, 2, 1, 3, 2, 4, 3, 5], down: [18, 16, 17, 15, 16, 14, 15, 13], rhU: "12132435", lhU: "53423121", rhD: "53423121", lhD: "12132435",
    fix: [{ at: "top", i: 6, lh: 3 }, { at: "top", i: 7, deg: 17, rh: 4, lh: 2 }, { at: "end", i: 6, rh: 3 }, { at: "end", i: 7, deg: 1, rh: 2, lh: 4 }] },
  16: { up: [0, 2, 1, 2, 5, 4, 3, 4], down: [18, 15, 16, 15, 13, 14, 15, 14], rhU: "13235434", lhU: "53431232", rhD: "52321232", lhD: "13235434" },
  17: { up: [0, 2, 5, 4, 6, 5, 4, 5], down: [18, 15, 13, 14, 12, 13, 14, 12], rhU: "12435434", lhU: "54231232", rhD: "53231231", lhD: "12435435",
    fix: [{ at: "top", i: 7, deg: 16, rh: 2, lh: 4 }] },
  18: { up: [0, 1, 3, 2, 4, 3, 1, 2], down: [18, 17, 15, 16, 14, 15, 17, 16], rhU: "12435423", lhU: "54231243", rhD: "54231243", lhD: "12435423",
    fix: [{ at: "top", i: 6, rh: 1, lh: 5 }, { at: "top", i: 7, rh: 2, lh: 4 }, { at: "end", i: 5, rh: 3 }, { at: "end", i: 6, rh: 5 }, { at: "end", i: 7, rh: 4 }] },
  19: { up: [0, 5, 3, 4, 5, 3, 2, 4], down: [18, 13, 15, 14, 13, 15, 16, 14], rhU: "15345324", lhU: "51321342", rhD: "51321342", lhD: "15345324" },
  // 第 20 首:從 E 開始(第 3 級),音域到十度;結尾右手 E3 + C4、左手 C2 + C3(原譜)
  // 第 20 首上行、下行各 15 小節(原譜共 30 小節 + 結尾;最高一組從 E5 起、下行從 E6 起,最後一組從 E4 起)
  20: { up: [2, 4, 7, 9, 7, 6, 7, 5], down: [23, 21, 18, 16, 18, 17, 18, 16], rhU: "12454342", lhU: "54212324", rhD: "54213231", lhD: "12453435", end20: true, bars: 15 }
};
export const HANON_BARS = 14;   // 原譜(兩個八度):上行、下行各 14 小節;一個八度各 7 小節
export const HANON_KEYS = ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"];

/* 級數 → 音(該調大音階):deg 0 = 主音(起始八度) */
function noteAt(scale, tonicOct, deg){
  const i = ((deg % 7) + 7) % 7, o = Math.floor(deg / 7);
  // 主音以上的音:字母比主音小(繞過 B→C)要進一個八度
  const t = scale[0], n = scale[i];
  const wrap = n.letter < t.letter ? 1 : 0;
  return { letter: n.letter, alter: n.alter, octave: tonicOct + o + wrap };
}

/* 主音的八度:讓右手起音在 C3 附近(C–F♯ 在第 3 八度、G–B 在第 2 八度);左手低一個八度 */
function tonicOctave(t){ return [4, 5, 6].includes(t.letter) ? 2 : 3; }   // letter:0=C … 4=G 5=A 6=B

/* 產生一首:{ rh, lh, fifths, sub: 4, bar: 24 } */
/* 節奏變化(哈農練習常用的附點練法):兩個音一組,一組 = 一個八分音符(速度、小節跟原譜一樣,2/4)
   dotted = 附點十六分 + 三十二分(長短)、reverse = 三十二分 + 附點十六分(短長);一拍 = 24 divisions 才寫得出三十二分音符 */
export const HANON_RHYTHMS = ["even", "dotted", "reverse"];
function applyRhythm(notes, rhythm){
  const L = { dur: 9, ntype: "16th", ndots: 1 }, S = { dur: 3, ntype: "32nd", ndots: 0 };
  notes.forEach((n, i) => {
    if (i === notes.length - 1) return;
    const first = i % 2 === 0, long = rhythm === "dotted" ? first : !first;
    Object.assign(n, long ? L : S, long ? {} : { hook: first ? "forward hook" : "backward hook" });
  });
}
export function buildHanon(no, key = "C", rhythm = "even", octaves = 2){
  const H = HANON[no], t = parseNote(key), scale = spellScale(t, INTERVALS.major), oct = tonicOctave(t);
  const mk = (deg, finger, shift) => { const n = noteAt(scale, oct + shift, deg); return { ...n, midi: midiOf(n), finger }; };
  // 一個八度:上行 7 小節;下行整組低一個八度、也走 7 小節 → 最後一小節跟原譜一樣
  const full = H.bars || HANON_BARS, bars = octaves === 1 ? full - 7 : full, drop = octaves === 1 ? 7 : 0;
  const out = { rh: [], lh: [] };
  for (const [hand, shift] of [["rh", 0], ["lh", -1]]) {
    const fU = D(H[hand === "rh" ? "rhU" : "lhU"]), fD = D(H[hand === "rh" ? "rhD" : "lhD"]);
    const fixes = (H.fix || []).map(f => ({ ...f, finger: f[hand] }));
    // 每個音都標指法(使用者要求):上行每小節照第 1 小節、下行每小節照第 15 小節的指法(原譜:整首同一個指法),轉折處照原譜改
    for (let b = 0; b < bars; b++) H.up.forEach((d, i) => {
      const f = b === bars - 1 && fixes.find(x => x.at === "top" && x.i === i);
      out[hand].push(mk(f && f.deg !== undefined ? f.deg - (full - 1) + b : d + b, (f && f.finger) || fU[i], shift));
    });
    for (let b = 0; b < bars; b++) H.down.forEach((d, i) => {
      const f = b === bars - 1 && fixes.find(x => x.at === "end" && x.i === i);
      out[hand].push(mk(f && f.deg !== undefined ? f.deg : d - drop - b, (f && f.finger) || fD[i], shift));
    });
    // 結尾:主音的二分音符(右手 = 起音、左手低一個八度);第 20 首右手 E3 + C4、左手 C2 + C3(原譜)
    let e;
    // 結尾的指法:右手拇指、左手小指(第 20 首的和弦標低音那一個)
    if (H.end20) e = hand === "rh" ? { ...mk(2, 1, 0), with: mk(7, null, 0) } : { ...mk(0, 5, -1), with: mk(0, null, 0) };
    else e = mk(0, hand === "rh" ? 1 : 5, shift);
    // 結尾的手指不能跟前一個音一樣(例:第 17 首下行最後是 B 用 1,結尾 C 再用 1 → 改 2;左手 5 → 4)
    const prev = out[hand][out[hand].length - 1];
    if (prev.finger === e.finger && prev.midi !== e.midi) e.finger = hand === "rh" ? (e.midi > prev.midi ? Math.min(5, e.finger + 1) : Math.max(1, e.finger - 1)) : (e.midi > prev.midi ? Math.max(1, e.finger - 1) : Math.min(5, e.finger + 1));
    out[hand].push(e);
  }
  if (rhythm === "dotted" || rhythm === "reverse") {
    applyRhythm(out.rh, rhythm); applyRhythm(out.lh, rhythm);
    return { rh: out.rh, lh: out.lh, fifths: keyFifths(key, "major"), sub: 4, div: 24, bar: 48, time: [2, 4], rhythm, octaves, clefPerBar: true };
  }
  return { rh: out.rh, lh: out.lh, fifths: keyFifths(key, "major"), sub: 4, bar: 24, time: [2, 4], rhythm: "even", octaves, clefPerBar: true };
}
