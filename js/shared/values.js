/* 認音 / 認譜的「時值」模式(PianoDrill / DrumDrill 共用,兩邊逐位元組相同;tools/test/sync.json same)。
   看一個音符或休止符,問「這是幾拍?」(四分音符 = 1 拍),作答鈕 ½ / 1 / 2 / 3 / 4。
   快捷照學習順序、每一格包含前一格:四分和八分 → 加二分、全音符 → 加休止符 → 加附點。
   挑戰、最常錯照現有的 js/shared/drill.js(目標 = 時值 id、回答 = 拍數 id)。都是 App 的練習設定 */
import { tr } from "./i18n.js";

/* 時值:type = MusicXML 的 type、dur = 幾個八分音符(divisions 2)、beat = 作答的 id */
export const VALUES = {
  n4: { type: "quarter", dur: 2, beat: "1", name: ["四分音符", "quarter note"] },
  n8: { type: "eighth", dur: 1, beat: "h", name: ["八分音符", "eighth note"] },
  n2: { type: "half", dur: 4, beat: "2", name: ["二分音符", "half note"] },
  n1: { type: "whole", dur: 8, beat: "4", name: ["全音符", "whole note"] },
  r4: { type: "quarter", dur: 2, beat: "1", rest: true, name: ["四分休止符", "quarter rest"] },
  r8: { type: "eighth", dur: 1, beat: "h", rest: true, name: ["八分休止符", "eighth rest"] },
  r2: { type: "half", dur: 4, beat: "2", rest: true, name: ["二分休止符", "half rest"] },
  r1: { type: "whole", dur: 8, beat: "4", rest: true, name: ["全休止符", "whole rest"] },
  n2d: { type: "half", dur: 6, beat: "3", dot: true, name: ["附點二分音符", "dotted half note"] }
};
/* 快捷(每一格包含前一格) */
export const VALUE_SETS = [
  ["qe", ["四分和八分", "Quarter & eighth"], ["n4", "n8"]],
  ["hw", ["加二分、全音符", "+ Half, whole"], ["n4", "n8", "n2", "n1"]],
  ["rest", ["加休止符", "+ Rests"], ["n4", "n8", "n2", "n1", "r4", "r8", "r2", "r1"]],
  ["dot", ["加附點", "+ Dotted"], ["n4", "n8", "n2", "n1", "r4", "r8", "r2", "r1", "n2d"]]
];
export const BEATS = ["h", "1", "2", "3", "4"];
export const beatLabel = b => (b === "h" ? "½" : b);
export const valueName = id => (VALUES[id] ? tr(...VALUES[id].name) : id);
export const beatText = b => tr(`${beatLabel(b)} 拍`, `${beatLabel(b)} beat${b === "1" || b === "h" ? "" : "s"}`);
export const setOf = id => VALUE_SETS.find(s => s[0] === id) || VALUE_SETS[0];

/* 一個音符或休止符的 MusicXML(不印拍號、不畫小節線):clef = "treble"(鋼琴:B4,第三線)/ "perc"(鼓:五線鼓譜的小鼓,第三間) */
export function valueXML(id, clef = "treble"){
  const v = VALUES[id] || VALUES.n4, perc = clef === "perc";
  const head = v.rest ? "<rest/>" : perc ? "<unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched>" : "<pitch><step>B</step><octave>4</octave></pitch>";
  const clefXML = perc ? "<clef><sign>percussion</sign><line>2</line></clef>" : "<clef><sign>G</sign><line>2</line></clef>";
  const stem = v.rest || v.type === "whole" ? "" : `<stem>${perc ? "up" : "down"}</stem>`;
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name></part-name></score-part></part-list><part id="P1"><measure number="1">`
    + `<attributes><divisions>2</divisions><key print-object="no"><fifths>0</fifths></key><time print-object="no"><beats>4</beats><beat-type>4</beat-type></time>${clefXML}</attributes>`
    + `<note>${head}<duration>${v.dur}</duration><voice>1</voice><type>${v.type}</type>${v.dot ? "<dot/>" : ""}${stem}</note>`
    + `<barline location="right"><bar-style>none</bar-style></barline></measure></part></score-partwise>`;
}
