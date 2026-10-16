/* 練習題 → MusicXML(OSMD 畫譜)。4/4(拍號不顯示),一拍 = 12 divisions。
   八分音符(sub 2)兩拍一組連桿、三連音(sub 3)與十六分(sub 4)一拍一組;最後一個音延長到小節結束。
   每個音都標指法:右手在上、左手在下。譜號依每小節的音域自動換(右手偏好高音譜號、左手偏好低音譜號)。 */
import { LETTERS } from "./theory.js";

let DIV = 12;   // 一拍(四分音符)幾個 division:預設 12;哈農附點節奏要三十二分音符 → 24(ex.div)
let BAR = 48;   // 一小節的長度:預設 4/4;哈農 2/4 = 24(ex.bar)
const NOTE_TYPES = [[48, "whole", 0], [36, "half", 1], [24, "half", 0], [18, "quarter", 1], [12, "quarter", 0], [9, "eighth", 1], [6, "eighth", 0], [3, "16th", 0]];
function fitType(d){ for (const [len, type, dots] of NOTE_TYPES) if (len <= d) return { len, type, dots }; return { len: 3, type: "16th", dots: 0 }; }

/* 最後一個音與後面的休止符(照 4/4 記譜慣例):
   在第 1 拍 → 全音符;第 3 拍 → 二分音符;第 2、4 拍 → 四分音符;不在拍點上 → 延到下一拍。
   休止符從拍點起、不跨小節中間:二分休止符只放在第 1、3 拍,其他用四分(不用附點休止符) */
let FINAL_Q = false;   // 照大綱譜例:最後一個音一律四分音符(ABRSM 譜例的寫法)
function finalAndRests(pos){
  const inBar = pos % BAR, out = [];
  let len;
  if (FINAL_Q && !(inBar % DIV)) len = DIV;
  else if (inBar % DIV) len = DIV - (inBar % DIV);
  else len = inBar === 0 ? BAR : inBar === 2 * DIV ? 2 * DIV : DIV;
  len = Math.min(len, BAR - inBar);   // 3/4 的第 3 拍只剩一拍(四分音符),不能寫二分
  out.push(len);
  let p = inBar + len;
  const rests = [];
  while (p < BAR) { const r = (p === 0 || p === 2 * DIV) && p + 2 * DIV <= BAR ? 2 * DIV : DIV - (p % DIV) || DIV; rests.push(r); p += r; }
  return { len, rests };
}
const TYPE_OF = { 48: ["whole", 0], 36: ["half", 1], 24: ["half", 0], 12: ["quarter", 0], 8: ["quarter", 0], 6: ["eighth", 0], 4: ["eighth", 0], 3: ["16th", 0], 9: ["eighth", 1] };
function typeOf(len){ return TYPE_OF[len * 12 / DIV] || ["quarter", 0]; }   // 表是以一拍 = 12 寫的

/* 從 pos(拍點)補休止符到小節結束(二分休止符只放第 1、3 拍) */
function fillRests(events, pos){
  let p = pos % BAR;
  if (p === 0) return;
  while (p < BAR) { const r = (p === 0 || p === 2 * DIV) && p + 2 * DIV <= BAR ? 2 * DIV : DIV; const [rt, rd] = typeOf(r); events.push({ rest: true, pos: pos, dur: r, type: rt, dots: rd }); pos += r; p += r; }
}
/* 一隻手的音 → 依小節切開的事件 */
function layoutHand(notes, sub){
  const step = DIV / sub, events = [];
  let pos = 0;
  notes.forEach((n, i) => {
    const last = i === notes.length - 1;
    // 音可以自己帶時值(哈農的附點節奏:n.dur 幾個 division、n.ntype / n.ndots 音符種類、n.hook 十六分音符的半截連桿)
    // 最後一個音剛好是一拍(三連音或十六分音符一組)的最後一個:留在三連音裡(跟前兩個音連桿),後面從拍點起補休止符
    const closesTriplet = last && (sub === 3 || sub === 4) && (pos + step) % DIV === 0 && pos % DIV !== 0;
    if (!last || closesTriplet) { const d = n.dur || step; events.push({ n, pos, dur: d, short: true, ntype: n.ntype, ndots: n.ndots || 0, hook: n.hook }); pos += d;
      if (closesTriplet) fillRests(events, pos);
      return; }
    const { len, rests } = finalAndRests(pos);
    const [type, dots] = typeOf(len);
    events.push({ n, pos, dur: len, type, dots, short: false, offbeat: (pos % DIV) !== 0 });
    pos += len;
    for (const r of rests) { const [rt, rd] = typeOf(r); events.push({ rest: true, pos, dur: r, type: rt, dots: rd }); pos += r; }
  });
  const measures = [];
  for (const e of events) { const m = Math.floor(e.pos / BAR); (measures[m] = measures[m] || []).push(e); }
  return measures;
}

/* 譜表上的位置(第幾條線/間):字母 + 7 × 八度;中線:高音譜號 B4、低音譜號 D3 */
export const staffStep = n => n.octave * 7 + n.letter;
export const MIDDLE = { G: 4 * 7 + 6, F: 3 * 7 + 1 };
/* 符桿方向(標準規則):一組連桿看離中線最遠的音,在中線以上(含中線)朝下、以下朝上 */
export function stemFor(notes, clef){
  let far = 0;
  for (const n of notes) { const d = staffStep(n) - MIDDLE[clef]; if (Math.abs(d) > Math.abs(far) || (Math.abs(d) === Math.abs(far) && d > far)) far = d; }
  return far >= 0 ? "down" : "up";
}

/* 加線數(譜表上的位置 → 幾條加線):高音譜號 E4–F5、低音譜號 G2–A3 在五線內 */
const TOP = { G: 5 * 7 + 3, F: 3 * 7 + 5 }, BOT = { G: 4 * 7 + 2, F: 2 * 7 + 4 };
export function ledgers(step, clef){
  return step > TOP[clef] ? Math.floor((step - TOP[clef]) / 2) : step < BOT[clef] ? Math.floor((BOT[clef] - step) / 2) : 0;
}
/* 一組音(連桿一組、或最後的長音)= 換譜號與 8va 的單位 */
function unitsOf(measures, sub, perBar){
  const g = perBar ? 1e9 : sub === 2 ? 2 * DIV : DIV, units = [];
  measures.forEach((evs, mi) => {
    const groups = new Map();
    for (const e of evs) if (!e.rest) { const k = e.short ? "s" + Math.floor(e.pos / g) : "l" + e.pos; (groups.get(k) || groups.set(k, []).get(k)).push(e); }
    units.push(...groups.values());
  });
  return units;
}
/* 譜號:預設右手高音、左手低音;目前的譜號要超過 2 條加線、另一個譜號比較少才換;
   換走之後,原本的譜號只要 1 條加線以內就換回來(不會來回跳)
   還是超過 3 條加線 → 8va(往上)/ 8vb(往下),譜上畫低/高一個八度 */
function clefPlan(measures, hand, sub, perBar){
  const home = hand === "rh" ? "G" : "F", other = c => c === "G" ? "F" : "G";
  let cur = home;
  const plan = new Map(), shift = new Map();
  for (const u of unitsOf(measures, sub, perBar)) {
    const steps = u.flatMap(e => e.n.with ? [staffStep(e.n), staffStep(e.n.with)] : [staffStep(e.n)]);
    const led = c => Math.max(...steps.map(st => ledgers(st, c)));
    if (cur !== home && led(home) <= 1) cur = home;
    else if (led(cur) > 2 && led(other(cur)) < led(cur)) cur = other(cur);
    let sh = 0;
    if (led(cur) > 3) sh = Math.max(...steps) > TOP[cur] ? 7 : -7;
    for (const e of u) { plan.set(e, cur); if (sh) shift.set(e, sh); }
  }
  // 休止符跟著前一個音的譜號
  let last = home;
  for (const evs of measures) for (const e of evs) { if (plan.has(e)) last = plan.get(e); else plan.set(e, last); }
  return { plan, shift };
}
const clefXml = (c, staff) => `<clef number="${staff}"><sign>${c}</sign><line>${c === "G" ? 2 : 4}</line></clef>`;

function noteXml(e, opts){
  const { staff, voice, sub, place, staccato, beam, stem, accidental } = opts;
  const tuplet = opts.tuplet;
  let x = "<note>";
  if (e.rest) {
    x += `<rest/><duration>${e.dur}</duration><voice>${voice}</voice><type>${e.type}</type>` + "<dot/>".repeat(e.dots) + `<staff>${staff}</staff></note>`;
    return x;
  }
  const n = e.n;
  x += `<pitch><step>${LETTERS[n.letter]}</step>${n.alter ? `<alter>${n.alter}</alter>` : ""}<octave>${n.octave}</octave></pitch>`;
  x += `<duration>${e.dur}</duration><voice>${voice}</voice>`;
  if (e.short && e.ntype) x += `<type>${e.ntype}</type>` + "<dot/>".repeat(e.ndots);
  else if (e.short) {
    x += `<type>${sub === 4 ? "16th" : "eighth"}</type>`;
    if (sub === 3) x += "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>";
  } else x += `<type>${e.type}</type>` + "<dot/>".repeat(e.dots);
  if (accidental) x += `<accidental>${accidental}</accidental>`;
  if (e.type !== "whole") x += `<stem>${stem}</stem>`;
  x += `<staff>${staff}</staff>`;
  if (beam) {
    x += `<beam number="1">${beam}</beam>`;
    // 自帶時值的音(哈農附點:附點十六分 + 三十二分):第 2 條連桿整組連、三十二分音符的第 3 條是半截
    if (e.ntype) { x += `<beam number="2">${beam}</beam>`; if (e.hook) x += `<beam number="3">${e.hook}</beam>`; }
    else if (sub === 4) x += `<beam number="2">${beam}</beam>`;
  }
  x += "<notations>";
  // 三連音的「3」只標在每隻手的第一組,之後照慣例省略(simile),不跟指法數字擠在一起
  if (tuplet === "start" || tuplet === "stop") x += `<tuplet type="${tuplet}" bracket="no" show-number="${tuplet === "start" && opts.firstTuplet ? "actual" : "none"}" placement="${opts.voice === 1 ? "below" : "above"}"/>`;   // 「3」放在指法的另一側(右手指法在上、左手在下);照手判斷(只顯示左手時它在第一行,不能照譜表判斷)
  if (n.finger) x += `<technical><fingering placement="${place}">${n.finger}</fingering></technical>`;
  if (staccato) x += `<articulations><staccato placement="${stem === "up" ? "below" : "above"}"/></articulations>`;   // 跳音點在符頭那側
  x += "</notations></note>";
  // 雙音:上方音用 <chord/> 跟主音同時、共用符桿
  if (n.with) {
    const w = n.with;
    x += `<note><chord/><pitch><step>${LETTERS[w.letter]}</step>${w.alter ? `<alter>${w.alter}</alter>` : ""}<octave>${w.octave}</octave></pitch>`;
    x += `<duration>${e.dur}</duration><voice>${voice}</voice>`;
    x += e.short ? `<type>${sub === 4 ? "16th" : "eighth"}</type>` + (sub === 3 ? "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>" : "") : `<type>${e.type}</type>` + "<dot/>".repeat(e.dots);
    if (opts.accidentalWith) x += `<accidental>${opts.accidentalWith}</accidental>`;
    if (e.type !== "whole") x += `<stem>${stem}</stem>`;
    x += `<staff>${staff}</staff>`;
    if (w.finger) x += `<notations><technical><fingering placement="${place}">${w.finger}</fingering></technical></notations>`;
    x += "</note>";
  }
  return x;
}

/* 一小節裡短音的連桿:同一組(sub 2 兩拍、其他一拍)≥2 個短音才連 */
/* 調號裡每個字母的升降:升記號順序 F C G D A E B,降記號倒過來 */
export function keyAlters(fifths){
  const a = [0, 0, 0, 0, 0, 0, 0], order = [3, 0, 4, 1, 5, 2, 6];
  if (fifths > 0) for (let i = 0; i < fifths; i++) a[order[i]] = 1;
  else for (let i = 0; i < -fifths; i++) a[order[6 - i]] = -1;
  return a;
}
const ACC_NAME = { "-2": "flat-flat", "-1": "flat", "0": "natural", "1": "sharp", "2": "double-sharp" };

function beamMarks(evs, sub){
  const g = sub === 2 && BAR % (2 * DIV) === 0 ? 2 * DIV : DIV, marks = new Map(), tup = new Map();
  const groups = new Map();
  evs.forEach(e => { if (e.short) { const k = Math.floor(e.pos / g); (groups.get(k) || groups.set(k, []).get(k)).push(e); } });
  for (const arr of groups.values()) {
    if (arr.length >= 2) arr.forEach((e, i) => marks.set(e, i === 0 ? "begin" : i === arr.length - 1 ? "end" : "continue"));
  }
  if (sub === 3) {
    const beats = new Map();
    evs.forEach(e => { if (e.short) { const k = Math.floor(e.pos / DIV); (beats.get(k) || beats.set(k, []).get(k)).push(e); } });
    for (const arr of beats.values()) if (arr.length === 3) { tup.set(arr[0], "start"); tup.set(arr[2], "stop"); tup.set(arr[1], "mid"); }
  }
  return { marks, tup, groups: [...groups.values()] };
}

/* show: "both" | "rh" | "lh" */
export function exerciseToMusicXML(ex, q, show = "both"){
  DIV = ex.div || 12; BAR = ex.bar || 4 * DIV; FINAL_Q = !!ex.finalQuarter;
  const hands = show === "both" ? ["rh", "lh"] : [show];
  const lay = hands.map(h => layoutHand(ex[h], ex.sub));
  const cp = hands.map((h, i) => clefPlan(lay[i], h, ex.sub, ex.clefPerBar));   // 哈農:一小節一個譜號(不在小節中間來回換)
  const plans = cp.map(c => c.plan);
  const ottNow = hands.map(() => 0);   // 每隻手目前的 8va 狀態(跨小節延續)
  const clefNow = hands.map(() => null);
  const tupletShown = hands.map(() => false);
  const nMeasures = Math.max(...lay.map(l => l.length));
  const staves = hands.length;
  let body = "";
  for (let m = 0; m < nMeasures; m++) {
    body += `<measure number="${m + 1}">`;
    let attrs = "";
    if (m === 0) attrs += `<divisions>${DIV}</divisions><key><fifths>${ex.fifths}</fifths></key>${ex.time ? `<time><beats>${ex.time[0]}</beats><beat-type>${ex.time[1]}</beat-type></time>` : `<time print-object="no"><beats>${ex.timeHidden ? ex.timeHidden[0] : 4}</beats><beat-type>${ex.timeHidden ? ex.timeHidden[1] : 4}</beat-type></time>`}` + (staves > 1 ? `<staves>${staves}</staves>` : "");
    hands.forEach((h, i) => { if (m === 0) { clefNow[i] = ex.crossStaff ? (i === 0 ? "G" : "F") : plans[i].get(lay[i][0][0]); attrs += clefXml(clefNow[i], i + 1); } });
    if (attrs) body += `<attributes>${attrs}</attributes>`;
    if (m === 0 && q.dynamic) body += `<direction placement="below"><direction-type><dynamics><${q.dynamic}/></dynamics></direction-type><staff>1</staff></direction>`;
    hands.forEach((h, i) => {
      if (i > 0) body += `<backup><duration>${BAR}</duration></backup>`;
      const evs = lay[i][m] || [];
      const { marks, tup, groups } = beamMarks(evs, ex.sub);
      const place = h === "rh" ? "above" : "below";
      const shiftOf = cp[i].shift;   // 7 = 8va(畫低一個八度)、−7 = 8vb
      const shift1 = (n, e) => shiftOf.has(e) ? { ...n, octave: n.octave - shiftOf.get(e) / 7 } : n;
      const shownAll = e => e.n.with ? [shift1(e.n, e), shift1(e.n.with, e)] : [shift1(e.n, e)];   // 譜上畫的位置(雙音兩個都算)
      // 符桿:同一組連桿一起決定;沒有連桿的音自己決定
      const stems = new Map();
      for (const g of groups) { const st = stemFor(g.flatMap(shownAll), plans[i].get(g[0])); g.forEach(e => stems.set(e, st)); }
      // 臨時記號:同一小節、同一譜表、同一個音高(字母 + 實際八度)到小節線為止都有效;
      // 換譜號、8va 都不影響(Gould《Behind Bars》的規則,OSMD 也是這樣算)
      const keyA = keyAlters(ex.fifths), accState = new Map();
      // 8va / 8vb 跨小節:下一小節開頭也要同樣的移位就不停(一條線畫到底,不在小節線斷開;使用者要求,所有樂譜)
      let inOttava = ottNow[i];
      const ottava = (type, up) => `<direction placement="${up ? "above" : "below"}"><direction-type><octave-shift type="${type}" size="8"/></direction-type><staff>${i + 1}</staff></direction>`;
      for (const e of evs) {
        const c = plans[i].get(e);
        // 跨譜表(哈農第 41 首,照原譜):不換譜號,右手的低音整組寫到下面那行、左手的高音寫到上面那行
        const home = i === 0 ? "G" : "F", cross = ex.crossStaff && c !== home;
        if (!ex.crossStaff && c !== clefNow[i]) { body += `<attributes>${clefXml(c, i + 1)}</attributes>`; clefNow[i] = c; }
        const sh = e.rest ? inOttava : (shiftOf.get(e) || 0);
        if (sh !== inOttava) {
          if (inOttava) body += ottava("stop", inOttava > 0);
          if (sh) body += ottava(sh > 0 ? "down" : "up", sh > 0);
          inOttava = sh;
        }
        let accidental = null, accidentalWith = null, stem = null;
        const accFor = n => {
          const pos = staffStep(n), curA = accState.has(pos) ? accState.get(pos) : keyA[n.letter];
          accState.set(pos, n.alter);
          return n.alter !== curA ? ACC_NAME[n.alter] : null;
        };
        if (!e.rest) {
          accidental = accFor(e.n);
          if (e.n.with) accidentalWith = accFor(e.n.with);
          stem = stems.get(e) || stemFor(shownAll(e), c);
          if (ex.crossStaff) stem = i === 0 ? "up" : "down";   // 原譜:右手符桿一律朝上、左手一律朝下(跨到另一行也一樣)
        }
        const tp = tup.get(e), firstTuplet = tp === "start" && !tupletShown[i];
        if (firstTuplet) tupletShown[i] = true;
        body += noteXml(e, { staff: cross ? 2 - i : i + 1, voice: h === "rh" ? 1 : 5, sub: ex.sub, place, staccato: q.articulation === "staccato", beam: marks.get(e), tuplet: tp, firstTuplet, stem, accidental, accidentalWith });
      }
      const nextEv = (lay[i][m + 1] || []).find(x => !x.rest);
      const nextSh = nextEv ? (shiftOf.get(nextEv) || 0) : 0;
      if (inOttava && nextSh !== inOttava) { body += ottava("stop", inOttava > 0); inOttava = 0; }
      ottNow[i] = inOttava;
    });
    if (m === nMeasures - 1) body += `<barline location="right"><bar-style>light-heavy</bar-style></barline>`;
    body += "</measure>";
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1"><part-list><score-part id="P1"><part-name print-object="no">Piano</part-name></score-part></part-list><part id="P1">${body}</part></score-partwise>`;
}

/* 播放時間表:每個音的起點(拍)與長度(拍),兩手同一份時間軸;雙音兩個音一起 */
export function playbackEvents(ex, q, show = "both"){
  DIV = ex.div || 12;
  const out = [], step = 1 / ex.sub;
  const handEvents = (notes, hand) => { let pos = 0; notes.forEach((n, i) => {
    const d = n.dur ? n.dur / DIV : step;
    const last = i === notes.length - 1, ev = { beat: pos, len: last ? 2 : d, hand, idx: i };
    pos += d;
    out.push({ ...ev, midi: n.midi });
    if (n.with) out.push({ ...ev, midi: n.with.midi, chord: true });
  }); };
  for (const h of show === "both" ? ["rh", "lh"] : [show]) handEvents(ex[h], h);
  return out;
}
