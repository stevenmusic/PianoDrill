/* 視奏分頁(自由練習)的「範圍階段」:子項目 = 右手 / 左手 / 雙手,設定卡選 4 階範圍(每個子項目各自記)。
   畫面只寫範圍(例如「右手 C4–C5」),不寫級數、考試名稱;範圍內的節奏、調性、拍號、長度、織體由 App 依階段套用現有的
   data/sight-rules.json(ABRSM 規則,練習設定):對 rules 的複本覆寫 range(與階 1 的調性),用原本的 generateTest 出題,不改產生器。
     階 1:右手 C4–G4、左手 C3–G3;1 級的規則,只出 C 大調(五指位置固定在 C)
     階 2:右手 C4–C5、左手 C3–C4;2–3 級的規則(每題隨機取一級)
     階 3:右手 C4–C6、左手 C2–C4;4–5 級
     階 4「全範圍」:右手 C3–G6、左手 E1–A4(= 8 級視奏的範圍);6–8 級
   單手:只顯示、播放、評分那一手(soloScore 把另一手換成整小節休止;toMusicXml 的 only 只寫那一手的譜表)。
   階 1 是兩手輪流(1 級):單手題把另一手的句子移八度交給這一手(兩手的範圍剛好差一個八度、C 大調),整題都有音、不會半首休止。
   純函式(不碰 DOM),node 測試用 test/sight/stages.test.js */
export const STAGES = [
  { n: 1, grades: [1], rh: [60, 67], lh: [48, 55], cOnly: true },
  { n: 2, grades: [2, 3], rh: [60, 72], lh: [48, 60] },
  { n: 3, grades: [4, 5], rh: [60, 84], lh: [36, 60] },
  { n: 4, grades: [6, 7, 8], rh: [48, 91], lh: [28, 69] }
];
export const HANDS = ['right', 'left', 'both'];
const LETTERS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const midiName = (m) => LETTERS[m % 12] + (Math.floor(m / 12) - 1);
export const rangeLabel = ([lo, hi]) => `${midiName(lo)}–${midiName(hi)}`;
export const stageOf = (n) => STAGES[Math.max(1, Math.min(4, Math.round(Number(n)) || 1)) - 1];

/** 這一階、這一級的規則表複本:只換 range(與階 1 的調性),其他照原本的規則 */
export function rulesForStage(rulesTable, stage, grade) {
  const table = { ...rulesTable, grades: { ...rulesTable.grades } };
  const base = rulesTable.grades[String(grade)];
  const g = JSON.parse(JSON.stringify(base));
  g.range = {
    ...g.range,
    rightHand: { ...g.range.rightHand, minMidi: stage.rh[0], maxMidi: stage.rh[1], label: rangeLabel(stage.rh) },
    leftHand: { ...g.range.leftHand, minMidi: stage.lh[0], maxMidi: stage.lh[1], label: rangeLabel(stage.lh) },
  };
  if (stage.cOnly) g.keys = { maxAccidentals: 0, major: [{ tonic: 'C', fifths: 0 }], minor: [] };
  table.grades[String(grade)] = g;
  return table;
}

/** 這一題用哪一級的規則(範圍內的級每題隨機) */
export const pickGrade = (stage, rnd = Math.random) => stage.grades[Math.floor(rnd() * stage.grades.length) % stage.grades.length];

const restBar = (bar, barDuration) => ({ ...bar, events: [{ type: 'whole', dur: barDuration, dots: 0, rest: true, measureRest: true }], directions: [], motif: null });
const shiftPitch = (p, oct) => (p ? { ...p, octave: p.octave + oct, dstep: p.dstep + 7 * oct, midi: p.midi + 12 * oct } : p);
const shiftEvent = (e, oct) => (e.rest ? e : {
  ...e,
  dstep: e.dstep == null ? e.dstep : e.dstep + 7 * oct,
  pitch: shiftPitch(e.pitch, oct),
  chord: e.chord ? e.chord.map((p) => shiftPitch(p, oct)) : e.chord,
  grace: e.grace ? { ...e.grace, pitch: shiftPitch(e.grace.pitch, oct) } : e.grace,
  crossStaff: undefined,
});
const sounding = (bar) => bar.events.some((e) => !e.rest);

/**
 * 單手題:hand = 'right' | 'left'。另一手換成整小節休止(播放、評分自然只有這一手);
 * 兩手輪流的題(階 1):另一手有音的小節移八度交給這一手。回傳新的 score(原本的不動)
 */
export function soloScore(score, hand) {
  const mine = hand === 'right' ? 1 : 2, other = mine === 1 ? 2 : 1, oct = mine === 1 ? 1 : -1;
  const own = score.staves[mine], theirs = score.staves[other];
  const alternate = own.some((b, i) => !sounding(b) && sounding(theirs[i]));
  const bars = own.map((b, i) => (alternate && !sounding(b) && sounding(theirs[i])
    ? { ...theirs[i], events: theirs[i].events.map((e) => shiftEvent(e, oct)) }
    : b));
  return { ...score, solo: hand, staves: { ...score.staves, [mine]: bars, [other]: theirs.map((b) => restBar(b, score.barDuration)) } };
}
