/* 指法全面檢查(不需要瀏覽器):大綱每一題 + 自由練習全部組合 + 哈農 20 首 × 12 調,每一個相鄰的音(上行、下行都看)
   右手:往上 = 手指變大,或拇指從 2/3/4 底下穿過;往下 = 手指變小,或 2/3/4 跨過拇指(左手相反)
   同一指不能連續彈兩個不同的音;一般移動的距離不能超過那兩根手指撐得到的範圍;穿指 / 跨指不超過純五度
   用法:node tools/test/fingeraudit.mjs */
import fs from "node:fs";
import { buildExercise } from "../../js/tech/exercise.js";
import { questionsFor, masteryKey } from "../../js/tech/syllabus.js";
import { buildHanon, HANON_KEYS } from "../../js/tech/hanon.js";

const root = new URL("../../", import.meta.url);
const SY = JSON.parse(fs.readFileSync(new URL("data/syllabus.json", root)));
const FG = JSON.parse(fs.readFileSync(new URL("data/fingerings.json", root)));
let bad = 0, pairs = 0, items = 0;
const seen = new Set();
// 兩根手指撐得到的最大半音數(一般鋼琴教學的手型範圍,寬鬆一點)
const SPAN = { "1-2": 7, "1-3": 7, "1-4": 9, "1-5": 12, "2-3": 4, "2-4": 6, "2-5": 9, "3-4": 4, "3-5": 7, "4-5": 4 };
// skip:哈農上下行轉折(原譜:上行最後一個音與下行第一個音都用拇指/小指,手換位置)
function audit(notes, hand, label, skip = new Set()){
  const ns = notes.filter(n => n.finger != null && !n.with);
  for (let i = 0; i + 1 < ns.length; i++) {
    const a = ns[i], b = ns[i + 1], d = b.midi - a.midi, fa = a.finger, fb = b.finger;
    if (d === 0 || skip.has(i)) continue;
    pairs++;
    const up = d > 0, rh = hand === "rh";
    const natural = rh ? (up ? fb > fa : fb < fa) : (up ? fb < fa : fb > fa);   // 手指照順序走
    const cross = !natural && fa !== fb && (rh ? (up ? fb === 1 && fa >= 2 && fa <= 4 : fa === 1 && fb >= 2 && fb <= 4)
                                               : (up ? fa === 1 && fb >= 2 && fb <= 4 : fb === 1 && fa >= 2 && fa <= 4));
    let why = null;
    if (fa === fb) why = `同一指 ${fa} 連續彈兩個音`;
    else if (!natural && !cross) why = `${up ? "上行" : "下行"} ${fa}→${fb} 不能這樣接`;
    else if (natural) { const k = Math.min(fa, fb) + "-" + Math.max(fa, fb); if (Math.abs(d) > SPAN[k]) why = `${fa}→${fb} 距離 ${Math.abs(d)} 個半音太遠`; }
    else if (Math.abs(d) > 7) why = `穿指/跨指 ${fa}→${fb} 距離 ${Math.abs(d)} 個半音太遠`;
    if (why) { bad++; if (bad <= 80) console.log(`✗ ${label} ${hand} 第 ${i + 1}→${i + 2} 個音:${why}`); }
  }
}
function check(q, label){
  const k = masteryKey(q) + "|" + (q.sys || "") + "|" + (q.range || "") + "|" + q.octaves;
  if (seen.has(k)) return; seen.add(k); items++;
  const ex = buildExercise(FG, q);
  for (const h of ["rh", "lh"]) audit(ex[h], h, label);
}
for (const [sk, sys] of Object.entries(SY.systems)) for (const g of sys.grades) for (const mf of ["harmonic", "melodic", "natural"]) for (const set of ["A", "B"])
  for (const q of questionsFor(SY, sk, g, { minorForm: mf, set })) check(q, `${sk} G${g.grade} ${q.key}`);
const MAJ = ["C", "G", "D", "A", "E", "B", "F#", "Gb", "C#", "Db", "Ab", "Eb", "Bb", "F", "Cb"];
const MIN = ["A", "E", "B", "F#", "C#", "G#", "D#", "Eb", "Bb", "F", "C", "G", "D", "A#"];
const STARTS = ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"];
const T = o => check({ hands: "HT", articulation: "legato", sub: 2, motion: "similar", ...o }, "自由 " + masteryKey({ hands: "HT", articulation: "legato", motion: "similar", ...o }));
for (const oct of [1, 2, 3, 4]) {
  for (const motion of oct <= 2 ? ["similar", "contrary"] : ["similar"]) {
    for (const k of MAJ) T({ type: "scale", tonic: k, quality: "major", motion, octaves: oct });
    for (const k of MIN) for (const form of ["harmonic", "melodic", "natural"]) T({ type: "scale", tonic: k, quality: "minor", form, motion, octaves: oct });
    for (const k of STARTS) T({ type: "chromatic", tonic: k, lhStart: k, rhStart: k, motion, octaves: oct });
  }
  for (const apart of [3, 6]) {
    for (const k of MAJ) T({ type: "scale", tonic: k, quality: "major", apart, octaves: oct });
    for (const k of MIN) for (const form of ["harmonic", "melodic"]) T({ type: "scale", tonic: k, quality: "minor", form, apart, octaves: oct });
  }
  for (const k of MAJ) { for (const inversion of [0, 1, 2]) T({ type: "arpeggio", tonic: k, quality: "major", inversion, octaves: oct }); T({ type: "dom7", tonic: k, quality: "major", octaves: oct }); }
  for (const k of MIN) { for (const inversion of [0, 1, 2]) T({ type: "arpeggio", tonic: k, quality: "minor", inversion, octaves: oct }); T({ type: "dom7", tonic: k, quality: "minor", octaves: oct }); }
  for (const k of STARTS) { T({ type: "dim7", tonic: k, octaves: oct }); T({ type: "wholetone", tonic: k, octaves: oct }); }
}
for (const k of MAJ) T({ type: "broken", tonic: k, quality: "major", octaves: 1, sub: 3 });
for (const k of MIN) T({ type: "broken", tonic: k, quality: "minor", octaves: 1, sub: 3 });
let nh = 0;
for (let no = 1; no <= 20; no++) for (const key of HANON_KEYS) { const ex = buildHanon(no, key, "even"); nh++; for (const h of ["rh", "lh"]) audit(ex[h], h, `哈農 ${no} ${key}`, new Set([111])); }
console.log(`${items} 題 + 哈農 ${nh} 首次、${pairs} 對相鄰音:${bad ? "✗ " + bad + " 處有問題" : "✓ 全部沒問題"}`);
process.exit(bad ? 1 : 0);
