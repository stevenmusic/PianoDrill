/* 樂理:音名拼法、音階/琶音/半音階的音高序列。
   音名不查表:字母照級數往上推,升降照目標音高差算(和聲小調的導音、F𝄪 才不會拼錯)。 */

export const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const SHARP_KEYS = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"];

export const INTERVALS = {
  major:    [0, 2, 4, 5, 7, 9, 11],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  melodic:  [0, 2, 3, 5, 7, 9, 11],   // 上行;下行 = 自然小調
  natural:  [0, 2, 3, 5, 7, 8, 10]
};

/* "F#" / "Bb" / "C" → { letter: 3, alter: 1 } */
export function parseNote(s){
  const m = /^([A-G])(##|#|bb|b|x)?$/.exec(s.trim());
  if (!m) throw new Error("音名格式錯誤:" + s);
  const alter = { "#": 1, "##": 2, x: 2, b: -1, bb: -2 }[m[2]] || 0;
  return { letter: LETTERS.indexOf(m[1]), alter };
}
export function pcOf(n){ return ((LETTER_PC[n.letter] + n.alter) % 12 + 12) % 12; }
export function midiOf(n){ return 12 * (n.octave + 1) + LETTER_PC[n.letter] + n.alter; }
/* 指法表的鍵名(升記號):C、Cs、D… */
export function sharpKey(pc){ return SHARP_KEYS[((pc % 12) + 12) % 12]; }
export function isBlack(midi){ return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12); }

const ACC_SYM = { "-2": "𝄫", "-1": "♭", "0": "", "1": "♯", "2": "𝄪" };
export function noteLabel(n){ return LETTERS[n.letter] + ACC_SYM[n.alter]; }
export function noteLabelStr(s){ return noteLabel(parseNote(s)); }

/* 從主音往上 7 級的拼法(不含八度):字母依序 +1,升降 = 目標音高 − 字母本身的音高 */
export function spellScale(tonic, intervals){
  const t = typeof tonic === "string" ? parseNote(tonic) : tonic, tpc = pcOf(t);
  return intervals.map((iv, d) => {
    const letter = (t.letter + d) % 7;
    let alter = ((tpc + iv - LETTER_PC[letter]) % 12 + 12) % 12;
    if (alter > 6) alter -= 12;
    return { letter, alter };
  });
}

/* 調號(五度圈位置):字母本身的五度位置 + 7 × 升降;小調用關係大調(自然小調第 3 級) */
const LETTER_FIFTHS = [0, 2, 4, -1, 1, 3, 5];
export function keyFifths(tonic, quality){
  const t = parseNote(tonic);
  const rel = quality === "major" ? t : spellScale(t, INTERVALS.natural)[2];
  return LETTER_FIFTHS[rel.letter] + 7 * rel.alter;
}

/* 從某個音起,依 7 級拼法往上 n 個八度的序列(含頂端主音),每個音帶八度 */
function ascendDegrees(spelled, startOct, octaves, startDeg = 0){
  const out = [];
  let oct = startOct, prevLetter = null;
  for (let i = 0; i <= 7 * octaves; i++) {
    const s = spelled[(startDeg + i) % 7];
    if (prevLetter !== null && s.letter < prevLetter) oct++;   // 字母繞回 C = 進下一個八度
    out.push({ letter: s.letter, alter: s.alter, octave: oct });
    prevLetter = s.letter;
  }
  return out;
}
/* 主音放在哪個八度:右手從中央 C 那個八度起(3~4 個八度時低一個八度),左手再低一個八度 */
export function startOctave(hand, octaves, motion, tonic){
  if (motion === "contrary") return 4;
  // 3~4 個八度從低一個八度起;4 個八度的 F~B 再低一個八度(最高音不超過 E7,鍵盤兩端也還在範圍內)
  // 右手起音放在中央 C 附近:一、兩個八度從 C4~F4 或 G3~B3 起(G~B 從 4 起會到 B6,要 8va);
  // 三個八度從 C3~B3 起;四個八度 C~E 從 3、F~B 從 2 起(最高不超過 E7)
  const L = tonic ? (typeof tonic === "string" ? parseNote(tonic) : tonic).letter : 0;
  let rh = octaves >= 3 ? 3 : (L >= 4 ? 3 : 4);
  if (octaves >= 4 && L >= 3) rh = 2;
  return hand === "rh" ? rh : rh - 1;
}
/* 同向音階:上行再下行(旋律小調下行用自然小調) */
export function scaleRun(tonic, quality, form, hand, octaves, opts = {}){
  const iv = opts.iv || (quality === "major" ? INTERVALS.major : INTERVALS[form]);
  const so = opts.startOct != null ? opts.startOct : startOctave(hand, octaves, "similar", tonic);
  const up = ascendDegrees(spellScale(tonic, iv), so, octaves);
  const downIv = !opts.iv && quality !== "major" && form === "melodic" ? INTERVALS.natural : iv;
  const down = ascendDegrees(spellScale(tonic, downIv), so, octaves).slice(0, -1).reverse();
  return { up, down, notes: up.concat(down) };
}

/* 琶音(三和弦原位):1-3-5 */
export function triadTones(tonic, quality){
  const s = spellScale(tonic, quality === "major" ? INTERVALS.major : INTERVALS.harmonic);
  return [s[0], s[2], s[4]];
}
/* 屬七和弦(某調的屬七):5-7-2-4,7 級用和聲小調的導音 */
export function dom7Tones(tonic, quality){
  const s = spellScale(tonic, quality === "major" ? INTERVALS.major : INTERVALS.harmonic);
  return [s[4], s[6], s[1], s[3]];
}
/* 減七和弦(從某個音起):字母每次跳兩個、音高每次 +3 */
export function dim7Tones(start){
  const t = parseNote(start), tpc = pcOf(t);
  return [0, 1, 2, 3].map(k => {
    const letter = (t.letter + 2 * k) % 7;
    let alter = ((tpc + 3 * k - LETTER_PC[letter]) % 12 + 12) % 12;
    if (alter > 6) alter -= 12;
    return { letter, alter };
  });
}
/* 和弦音循環往上 n 個八度(含頂端根音),再下行 */
export function chordRun(tones, startOct, octaves){
  const up = [];
  let oct = startOct, prev = null;
  const k = tones.length;
  for (let i = 0; i <= k * octaves; i++) {
    const t = tones[i % k];
    if (prev !== null && t.letter <= prev.letter) oct++;
    up.push({ letter: t.letter, alter: t.alter, octave: oct });
    prev = t;
  }
  const down = up.slice(0, -1).reverse();
  return { up, down, notes: up.concat(down) };
}

/* 半音階:上行用升記號、下行用降記號(起音維持原拼法) */
const SHARP_SPELL = [[0,0],[0,1],[1,0],[1,1],[2,0],[3,0],[3,1],[4,0],[4,1],[5,0],[5,1],[6,0]];
const FLAT_SPELL  = [[0,0],[1,-1],[1,0],[2,-1],[2,0],[3,0],[4,-1],[4,0],[5,-1],[5,0],[6,-1],[6,0]];
function spellMidi(m, table){
  const pc = ((m % 12) + 12) % 12, [letter, alter] = table[pc];
  return { letter, alter, octave: Math.floor((m - LETTER_PC[letter] - alter) / 12) - 1 };
}
/* 半音階:往上的音用升記號、往下的音用降記號,起音與折返的音維持起音的拼法。
   dir = "up":先上後下(同向);"down":先下後上(反向的左手) */
export function chromaticRun(start, startOct, octaves, dir = "up"){
  const s = parseNote(start), m0 = midiOf({ ...s, octave: startOct }), N = 12 * octaves, sg = dir === "up" ? 1 : -1;
  const first = [], second = [];
  for (let i = 0; i <= N; i++) {
    const m = m0 + sg * i;
    first.push(i === 0 || i === N ? { ...s, octave: startOct + sg * (i === N ? octaves : 0) } : spellMidi(m, sg > 0 ? SHARP_SPELL : FLAT_SPELL));
  }
  for (let i = N - 1; i >= 0; i--) {
    const m = m0 + sg * i;
    second.push(i === 0 ? first[0] : spellMidi(m, sg > 0 ? FLAT_SPELL : SHARP_SPELL));
  }
  return { first, second, notes: first.concat(second) };
}

/* ── 通用:依拼法與方向放到正確的八度 ── */
export function midiOfSp(sp, octave){ return 12 * (octave + 1) + LETTER_PC[sp.letter] + sp.alter; }
/* 這個拼法 ≥ minMidi 的最低音 */
export function placeAtLeast(sp, minMidi){
  let o = Math.floor((minMidi - LETTER_PC[sp.letter] - sp.alter) / 12) - 1;
  while (midiOfSp(sp, o) < minMidi) o++;
  while (midiOfSp(sp, o - 1) >= minMidi) o--;
  return { letter: sp.letter, alter: sp.alter, octave: o };
}
/* 依循環(音階級數或和弦音)走 count 步;dir = 1 往上(每步比前一個高)、−1 往下 */
export function walkCycle(cycle, startIdx, startNote, count, dir = 1){
  const out = [startNote];
  let prev = midiOf(startNote), idx = startIdx;
  const k = cycle.length;
  for (let i = 0; i < count; i++) {
    idx = ((idx + dir) % k + k) % k;
    const sp = cycle[idx];
    let n = placeAtLeast(sp, prev + 1);
    if (dir < 0) { n = placeAtLeast(sp, prev - 11); if (midiOf(n) >= prev) n.octave--; }
    out.push(n); prev = midiOf(n);
  }
  return out;
}
/* 全音音階:從起音往上 6 個音;字母照順序推(跳過一個字母的地方照音高差拼),拼法維持升或降一致 */
export function wholeToneCycle(start){
  const s = parseNote(start), pc0 = pcOf(s), out = [s];
  const useFlat = s.alter < 0;
  for (let i = 1; i < 6; i++) {
    const pc = (pc0 + 2 * i) % 12;
    const table = useFlat ? FLAT_SPELL : SHARP_SPELL;
    const [letter, alter] = table[pc];
    out.push({ letter, alter });
  }
  return out;
}
/* 三和弦轉位:0 = 原位(1-3-5)、1 = 第一轉位(3-5-1)、2 = 第二轉位(5-1-3) */
export function inversionTones(tonic, quality, inv){
  const t = triadTones(tonic, quality);
  return t.slice(inv).concat(t.slice(0, inv));
}
export { FLAT_SPELL, SHARP_SPELL, LETTER_PC };
