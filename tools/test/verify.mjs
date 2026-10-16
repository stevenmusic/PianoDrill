/* 程式自動驗證(不需要瀏覽器):
   1. data/syllabus.json 結構(ABRSM 點題制、Trinity A/B 組)
   2. data/fingerings.json 結構(長度、手指 1~5、循環一致)
   3. 大綱裡每一題 + 「所有調 × 所有題型 × 1~4 個八度」:音高、拼法、音型、音域、指法完整與可彈性
   4. MusicXML:每小節每個譜表的時值 = 4 拍、指法數 = 音數、記譜規則(另外寫的檢查,不沿用產生器)
   用法:node tools/test/verify.mjs */
import fs from "node:fs";
import { buildExercise } from "../../js/tech/exercise.js";
import { questionsFor, masteryKey } from "../../js/tech/syllabus.js";
import { exerciseToMusicXML } from "../../js/tech/musicxml.js";
import { buildHanon, HANON_KEYS, HANON_RHYTHMS } from "../../js/tech/hanon.js";
import { INTERVALS, parseNote, pcOf, midiOf, isBlack } from "../../js/tech/theory.js";

const root = new URL("../../", import.meta.url);
const SY = JSON.parse(fs.readFileSync(new URL("data/syllabus.json", root)));
const FG = JSON.parse(fs.readFileSync(new URL("data/fingerings.json", root)));
let fails = 0, checks = 0;
const fail = (msg) => { fails++; if (fails <= (process.env.ALL ? 1e9 : 60)) console.log("✗ " + msg); };
const ok = (cond, msg) => { checks++; if (!cond) fail(msg); return cond; };

/* ── 1. syllabus.json ── */
const TYPES = ["scale", "arpeggio", "chromatic", "dom7", "dim7", "wholetone", "broken", "thirds", "sixths"];
const CATS = ["scale", "contrary", "apart", "double", "chromatic", "wholetone", "arpeggio", "seventh", "broken"];
const KEY_RE = /^[A-G](#|b)?$/;
const TEMPO_OK = t => t && ["q", "h", "q."].includes(t.unit) && t.bpm >= 30 && t.bpm <= 200;
function checkItem(it, at, mode){
  ok(TYPES.includes(it.type), `${at}: type ${it.type}`);
  ok(CATS.includes(it.cat), `${at}: cat ${it.cat}`);
  const keys = mode === "sets" ? [it.key] : it.keys;
  ok(Array.isArray(keys) && keys.length && keys.every(k => KEY_RE.test(k)), `${at}: keys`);
  ok(mode === "sets" ? ["RH", "LH", "HT"].includes(it.hands) : ["HS", "HT"].includes(it.hands), `${at}: hands`);
  ok(it.range === "5th" || [1, 2, 3, 4].includes(it.octaves), `${at}: octaves/range`);
  const arts = mode === "sets" ? [it.articulation] : it.articulation;
  ok(Array.isArray(arts) && arts.every(a => ["legato", "staccato"].includes(a)), `${at}: articulation`);
  if (["scale", "arpeggio", "broken", "thirds", "sixths"].includes(it.type)) ok(["major", "minor"].includes(it.quality), `${at}: quality`);
  if (it.type === "scale") ok(["similar", "contrary"].includes(it.motion), `${at}: motion`);
  if (it.quality === "minor" && ["scale", "thirds", "sixths"].includes(it.type)) ok(Array.isArray(it.forms) && it.forms.length && it.forms.every(f => ["harmonic", "melodic", "natural"].includes(f)), `${at}: forms`);
  if (it.motion === "contrary") ok(it.hands === "HT", `${at}: 反向要雙手`);
  if (it.type === "chromatic") ok(KEY_RE.test(it.lhStart) && KEY_RE.test(it.rhStart), `${at}: 半音階起音`);
  if (mode === "sets") { ok(["p", "mf", "f", "cresc-dim"].includes(it.dynamic), `${at}: dynamic`); ok(TEMPO_OK(it.tempo), `${at}: tempo`); }
}
for (const [sk, sys] of Object.entries(SY.systems)) {
  ok(typeof sys.name === "string" && Array.isArray(sys.grades) && ["examiner", "sets"].includes(sys.mode), `${sk}: name/grades/mode`);
  const seen = new Set();
  for (const g of sys.grades) {
    const at = `${sk} G${g.grade}`;
    ok(Number.isInteger(g.grade) && !seen.has(g.grade), `${at}: grade 重複或不是整數`); seen.add(g.grade);
    ok(typeof g.verified === "boolean" && typeof g.source === "string" && g.source.length > 10, `${at}: 缺 verified/source`);
    if (sys.mode === "examiner") {
      const ids = new Set();
      for (const it of g.items) {
        ok(!ids.has(it.id), `${at} ${it.id}: id 重複`); ids.add(it.id);
        checkItem(it, `${at} ${it.id}`, "examiner");
        ok(TEMPO_OK(g.tempo[it.tempo]), `${at} ${it.id}: 速度 ${it.tempo} 沒有定義`);
      }
    } else {
      ok(g.sets && g.sets.A && g.sets.B, `${at}: 要有 A、B 兩組`);
      for (const [k, items] of Object.entries(g.sets)) items.forEach(it => checkItem(it, `${at} ${k}${it.id}`, "sets"));
    }
  }
}

/* ── 2. fingerings.json ── */
const PCS = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"];
for (const [form, table] of Object.entries(FG.scale)) for (const k of PCS) {
  const e = table[k];
  if (!ok(e, `指法表缺 scale/${form}/${k}`)) continue;
  for (const [h, s] of Object.entries(e)) {
    ok(/^[1-5]{15}$/.test(s), `scale/${form}/${k}/${h}: 要 15 個 1~5`);
    ok(s.slice(2, 7) === s.slice(9, 14), `scale/${form}/${k}/${h}: 第一個八度與循環不一致`);   // 開頭兩個音可以跟循環不同(哈農 39:A♭ 大調右手 2-3-1)
  }
}
for (const [q, table] of Object.entries(FG.arpeggio)) for (const k of PCS) {
  const e = table[k];
  if (!ok(e, `指法表缺 arpeggio/${q}/${k}`)) continue;
  for (const [h, s] of Object.entries(e)) {
    ok(/^[1-5]{7}$/.test(s), `arpeggio/${q}/${k}/${h}: 要 7 個 1~5`);
    ok(s.slice(1, 3) === s.slice(4, 6), `arpeggio/${q}/${k}/${h}: 第一組與循環不一致`);
  }
}

/* ── 3. 題目的音高與指法 ── */
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const spellingOk = n => ((LETTER_PC[n.letter] + n.alter - (n.midi - 12 * (n.octave + 1))) % 12 === 0) && Math.abs(n.alter) <= 2;
const pc = m => ((m % 12) + 12) % 12;
const ALL_BLACK_TRIADS = new Set(["major|6", "minor|3"]);   // F♯ 大三、E♭ 小三:三個都是黑鍵
function scaleIvs(q, desc){ const f = q.quality === "major" ? "major" : (desc && q.form === "melodic" ? "natural" : q.form); return INTERVALS[f]; }

/* 依題型算出每隻手應該的音高(跟產生器分開寫) */
function expectedPitches(q, hand, notes){
  const t = pcOf(parseNote(q.tonic)), first = notes[0].midi;
  const relSeq = (ivs, startDeg, count, dir) => { const a = []; let d = startDeg, oct = 0; a.push(0);
    for (let i = 0; i < count; i++) { const nd = d + dir; const no = oct + Math.floor(nd / 7); const md = ((nd % 7) + 7) % 7;
      a.push(12 * no + ivs[md] - ivs[startDeg]); d = md; oct = no; } return a; };
  if (q.type === "scale" && q.range === "5th") {
    const iv = scaleIvs(q, false);
    if (q.motion === "contrary" && hand === "lh") {   // 從主音往下走 4 級再回來(用同一個調的音)
      const dn = [0, -1, -2, -3, -4].map(d => { const dd = ((d % 7) + 7) % 7, o = Math.floor(d / 7); return 12 * o + iv[dd]; });
      return dn.concat(dn.slice(0, -1).reverse()).map(x => first + x);
    }
    const up = [0, 1, 2, 3, 4].map(d => iv[d]);
    return up.concat(up.slice(0, -1).reverse()).map(x => first + x);
  }
  if (q.type === "scale") {
    const n = q.octaves, deg = hand === "rh" ? (q.apart === 3 ? 2 : 0) : (q.apart === 6 ? 2 : 0);
    const ivU = scaleIvs(q, false), ivD = scaleIvs(q, true);
    if (q.motion === "contrary" && hand === "lh") {
      const out = relSeq(ivD, deg, 7 * n, -1), back = relSeq(ivU, deg, 7 * n, 1).map(x => x - 12 * n).slice(1);
      return out.concat(back).map(x => first + x);
    }
    const up = relSeq(ivU, deg, 7 * n, 1), dn = relSeq(ivD, deg, 7 * n, 1).slice(0, -1).reverse();
    return up.concat(dn).map(x => first + x);
  }
  if (q.type === "wholetone") { const k = 6 * q.octaves, up = []; for (let i = 0; i <= k; i++) up.push(first + 2 * i); return up.concat(up.slice(0, -1).reverse()); }
  if (q.type === "chromatic") return null;   // 另外檢查
  if (q.type === "arpeggio" && q.range === "5th") { const s = q.quality === "major" ? [0, 4, 7] : [0, 3, 7]; return [0, 1, 2, 1, 0].map(i => first + s[i]); }
  if (["arpeggio", "dom7", "dim7"].includes(q.type)) {
    let cyc = q.type === "arpeggio" ? (q.quality === "major" ? [0, 4, 7] : [0, 3, 7]) : q.type === "dom7" ? [0, 4, 7, 10] : [0, 3, 6, 9];
    if (q.type === "arpeggio" && q.inversion) cyc = cyc.slice(q.inversion).concat(cyc.slice(0, q.inversion).map(x => x + 12)).map((x, i, a) => x - a[0]);
    const k = cyc.length, up = [];
    for (let i = 0; i <= k * q.octaves; i++) up.push(first + 12 * Math.floor(i / k) + cyc[i % k]);
    const seq = up.concat(up.slice(0, -1).reverse());
    if (q.type === "dom7" && q.sys !== "trinity") { seq.pop(); seq.push(first + 5); }   // ABRSM 譜例:下行停在導音、往上半音解決到主音(最低的屬音不彈);Trinity 沒寫要解決
    return seq;
  }
  if (q.type === "broken") {
    const s = q.quality === "major" ? [0, 4, 7] : [0, 3, 7];
    // 照 Trinity 大綱譜例:初級五度範圍 1-3-5-3-1;1 級三連音 原位/第一/第二轉位 → 高八度主音 → 反過來 → 五音
    if (q.range === "5th") return [0, s[1], s[2], s[1], 0].map(x => first + x);
    const g0 = s, g1 = [s[1], s[2], 12], g2 = [s[2], 12, 12 + s[1]];
    return g0.concat(g1, g2, [12], g2.slice().reverse(), g1.slice().reverse(), g0.slice().reverse(), [s[2]]).map(x => first + x);
  }
  return null;
}
function checkPlayable(notes, hand, label, q){
  if (notes.every(n => n.finger == null)) return;   // 雙音音階:不標指法
  notes.forEach((n, i) => ok(Number.isInteger(n.finger) && n.finger >= 1 && n.finger <= 5, `${label} ${hand}: 第 ${i + 1} 個音指法缺漏`));
  if (q.type === "broken" || q.range === "5th") return;   // 固定手型,不跨指
  let asc;
  if (q.motion === "contrary" && hand === "lh") { const low = notes.reduce((b, n, i) => n.midi < notes[b].midi ? i : b, 0); asc = notes.slice(low); }
  else { const peak = notes.reduce((b, n, i) => n.midi > notes[b].midi ? i : b, 0); asc = notes.slice(0, peak + 1); }
  for (let i = 0; i + 1 < asc.length; i++) {
    const a = asc[i].finger, b = asc[i + 1].finger, at = `${label} ${hand} 第 ${i + 1}→${i + 2} 個音(${a}→${b})`;
    if (hand === "rh") ok(b > a || (b === 1 && [2, 3, 4].includes(a)), at + " 右手上行不能這樣接");
    else ok(b < a || (a === 1 && [2, 3, 4].includes(b)), at + " 左手上行不能這樣接");
    const top = i + 2 === asc.length && hand === "rh";   // 右手頂端轉下行:可以跳指(例:F♯ 旋律小調 E♯ 1 → F♯ 3,下行 E 才能用 2)
    if (q.type === "scale") ok(b === 1 ? true : top ? b > a : (hand === "rh" ? b === a + 1 : b === a - 1 || a === 1), at + " 音階手指要連續");
  }
  // 拇指不在黑鍵:三個音都是黑鍵的和弦(F♯ 大三、E♭ 小三,含轉位)、屬七最後解決的那一個長音除外
  notes.forEach((n, i) => { if (n.finger === 1 && isBlack(n.midi)) {
    const allBlack = q.type === "arpeggio" && ALL_BLACK_TRIADS.has(`${q.quality}|${pcOf(parseNote(q.tonic))}`);
    const resolution = q.type === "dom7" && i === notes.length - 1;
    ok(allBlack || resolution, `${label} ${hand}: 拇指在黑鍵 ${n.midi}`);
  } });
  const body = q.type === "dom7" ? notes.slice(0, -1) : notes;
  body.forEach(n => { if (n.finger === 5) { const ext = body.every(m => m.midi <= n.midi) || body.every(m => m.midi >= n.midi); ok(ext, `${label} ${hand}: 5 指不在最高/最低音`); } });
}
/* ── 4. 記譜規則(自己重新讀 MusicXML 檢查,不沿用產生器的程式) ──
   符桿方向、臨時記號、休止符位置、長音位置、連桿不跨拍、三連音成組、加線不超過 3 條 */
const LET = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const MID = { G: 34, F: 22 }, TOP = { G: 38, F: 26 }, BOT = { G: 30, F: 18 };
function keyAltersT(f){ const a = [0, 0, 0, 0, 0, 0, 0], o = [3, 0, 4, 1, 5, 2, 6]; if (f > 0) for (let i = 0; i < f; i++) a[o[i]] = 1; else for (let i = 0; i < -f; i++) a[o[6 - i]] = -1; return a; }
const ACCN = { "flat-flat": -2, flat: -1, natural: 0, sharp: 1, "double-sharp": 2 };
let maxLedger = 0;
function checkNotation(xml, label, sub){
  const fifths = Number(/<fifths>(-?\d+)<\/fifths>/.exec(xml)[1]), keyA = keyAltersT(fifths), D = Number(/<divisions>(\d+)/.exec(xml)[1]);
  const clef = {}, shift = {};
  const measures = xml.split("<measure ").slice(1);
  for (const [mi, m] of measures.entries()) {
    const tokens = [...m.matchAll(/<clef number="(\d)"><sign>([GF])<\/sign>|<octave-shift type="(\w+)"[^>]*\/><\/direction-type><staff>(\d)<\/staff>|<note>(.*?)<\/note>|<backup>/gs)];
    const pos = { 1: 0, 2: 0 }, acc = { 1: new Map(), 2: new Map() }, lastPos = { 1: 0, 2: 0 }, lastStem = { 1: null, 2: null };
    let staffCur = 1, group = [], tupN = 0, lastSingle = null;
    const checkSingle = sgl => { let far = 0; for (const st of sgl.steps) { const d = st - MID[sgl.clef]; if (Math.abs(d) > Math.abs(far) || (Math.abs(d) === Math.abs(far) && d > far)) far = d; }
      ok(sgl.stem === (far >= 0 ? "down" : "up"), `${label} m${mi + 1}: 單音符桿方向不符`); };
    const flushGroup = () => {
      if (!group.length) return;
      const st = new Set(group.map(g => g.stem));
      ok(st.size === 1, `${label} m${mi + 1}: 同一組連桿符桿方向不一致`);
      let far = 0; for (const g of group) for (const st of g.steps) { const d = st - MID[g.clef]; if (Math.abs(d) > Math.abs(far) || (Math.abs(d) === Math.abs(far) && d > far)) far = d; }
      ok(group[0].stem === (far >= 0 ? "down" : "up"), `${label} m${mi + 1}: 符桿方向不符(最遠的音離中線 ${far})`);
      const span = sub === 2 ? 2 * D : D;
      ok(Math.floor(group[0].pos / span) === Math.floor(group[group.length - 1].pos / span), `${label} m${mi + 1}: 連桿跨拍`);
      group = [];
    };
    for (const t of tokens) {
      if (t[1]) { clef[t[1]] = t[2]; continue; }
      if (t[3]) { shift[t[4]] = t[3] === "down" ? 7 : t[3] === "up" ? -7 : 0; continue; }
      if (t[0] === "<backup>") { flushGroup(); if (lastSingle) { checkSingle(lastSingle); lastSingle = null; } continue; }
      const body = t[5], dur = Number(/<duration>(\d+)/.exec(body)[1]), staff = Number(/<staff>(\d)/.exec(body)[1]);
      staffCur = staff;
      const isChord = /<chord\/>/.test(body);
      const p0 = isChord ? lastPos[staff] : pos[staff];
      if (/<rest\/>/.test(body)) {
        ok(p0 % D === 0, `${label} m${mi + 1}: 休止符不在拍點`);
        ok(!/<dot\/>/.test(body), `${label} m${mi + 1}: 附點休止符`);
        if (dur === 2 * D) ok(p0 === 0 || p0 === 2 * D, `${label} m${mi + 1}: 二分休止符不在第 1、3 拍`);
        pos[staff] += dur; continue;
      }
      const step = LET[/<step>(\w)/.exec(body)[1]], oct = Number(/<octave>(-?\d+)/.exec(body)[1]);
      const alter = Number((/<alter>(-?\d+)/.exec(body) || [0, 0])[1]);
      const disp = oct * 7 + step - (shift[staff] || 0), c = clef[staff];
      // 加線
      const led = disp > TOP[c] ? Math.floor((disp - TOP[c]) / 2) : disp < BOT[c] ? Math.floor((BOT[c] - disp) / 2) : 0;
      maxLedger = Math.max(maxLedger, led);
      ok(led <= 3, `${label} m${mi + 1}: ${led} 條加線`);
      // 臨時記號
      const real = oct * 7 + step;   // 臨時記號依實際音高(不受譜號、8va 影響)
      const cur = acc[staff].has(real) ? acc[staff].get(real) : keyA[step];
      const a = /<accidental>([\w-]+)<\/accidental>/.exec(body);
      if (alter !== cur) ok(a && ACCN[a[1]] === alter, `${label} m${mi + 1}: 缺臨時記號(音 ${step}/${alter})`);
      else ok(!a, `${label} m${mi + 1}: 多餘的臨時記號`);
      acc[staff].set(real, alter);
      // 長音位置
      const type = /<type>(\w+)/.exec(body)[1], dotted = /<dot\/>/.test(body);
      if (type === "whole") ok(p0 === 0, `${label} m${mi + 1}: 全音符不在第 1 拍`);
      if (type === "half") ok(!dotted && (p0 === 0 || p0 === 2 * D), `${label} m${mi + 1}: 二分音符位置不對`);
      // 三連音
      if (!isChord && /<time-modification>/.test(body)) { if (/<tuplet type="start"/.test(body)) { ok(tupN === 0, `${label}: 三連音沒有結束`); tupN = 1; } else { tupN++; if (/<tuplet type="stop"/.test(body)) { ok(tupN === 3, `${label}: 三連音不是 3 個`); tupN = 0; } } }
      // 符桿
      const stem = (/<stem>(\w+)/.exec(body) || [])[1];
      if (type !== "whole") ok(!!stem, `${label} m${mi + 1}: 缺符桿方向`);
      if (isChord) {
        ok(stem === lastStem[staff], `${label} m${mi + 1}: 雙音的符桿方向不一致`);
        if (group.length && group[group.length - 1].pos === p0) group[group.length - 1].steps.push(disp);   // 雙音:上方音也算進「離中線最遠」
        else if (lastSingle) lastSingle.steps.push(disp);
        continue;
      }
      if (lastSingle) { checkSingle(lastSingle); lastSingle = null; }
      lastStem[staff] = stem; lastPos[staff] = p0;
      const beam = (/<beam number="1">(\w+)/.exec(body) || [])[1];
      if (beam) { if (beam === "begin" && group.length) flushGroup(); group.push({ stem, steps: [disp], clef: c, pos: p0 }); }
      else if (stem) lastSingle = { stem, steps: [disp], clef: c };
      pos[staff] += dur;
    }
    flushGroup(); if (lastSingle) checkSingle(lastSingle); void staffCur;
  }
}


function checkQuestion(q, label){
  let ex;
  try { ex = buildExercise(FG, q); } catch (e) { fail(`${label}: 產生失敗 ${e.message}`); return; }
  for (const hand of ["rh", "lh"]) {
    const notes = ex[hand];
    const all = notes.flatMap(n => n.with ? [n, n.with] : [n]);
    all.forEach((n, i) => ok(spellingOk(n), `${label} ${hand} 第 ${i + 1} 個音拼法與音高不符`));
    ok(all.every(n => n.midi >= 21 && n.midi <= 108), `${label} ${hand}: 超出鋼琴音域 A0–C8`);
    const startName = q.type === "chromatic" ? (hand === "rh" ? q.rhStart || q.tonic : q.lhStart || q.tonic) : q.tonic;
    const lowDeg = (q.type === "scale" && ((hand === "rh" && q.apart === 3) || (hand === "lh" && q.apart === 6))) || q.type === "sixths";
    if (!["dom7"].includes(q.type) && !lowDeg && !(q.type === "arpeggio" && q.inversion)) ok(pcOf(parseNote(startName)) === pc(notes[0].midi), `${label} ${hand}: 起音不是 ${startName}`);
    // 分解和弦(1 級)照 Trinity 大綱譜例停在五音(音高另外由 expected 逐音比對)
    const endOk = q.type === "dom7" && q.sys !== "trinity" ? pc(notes[notes.length - 1].midi) === pcOf(parseNote(q.tonic)) : q.type === "broken" && q.range !== "5th" ? true : notes[notes.length - 1].midi === notes[0].midi;
    ok(endOk, `${label} ${hand}: 結束音不對`);
    const exp = expectedPitches(q, hand, notes);
    if (exp) ok(notes.length === exp.length && notes.every((n, i) => n.midi === exp[i]), `${label} ${hand}: 音高錯誤`);
    if (q.type === "scale" && q.range !== "5th") for (let i = 0; i + 1 < notes.length; i++) { const d = ((notes[i + 1].letter - notes[i].letter) % 7 + 7) % 7; ok(d === 1 || d === 6, `${label} ${hand}: 字母不連續`); }
    if (q.type === "chromatic") {
      ok(notes.length === 24 * q.octaves + 1, `${label} ${hand}: 半音階音數`);
      for (let i = 0; i + 1 < notes.length; i++) ok(Math.abs(notes[i + 1].midi - notes[i].midi) === 1, `${label} ${hand}: 半音階不是半音`);
    }
    if (q.type === "thirds" || q.type === "sixths") notes.forEach((n, i) => { const iv = n.with.midi - n.midi; ok(q.type === "thirds" ? iv === 3 || iv === 4 : iv === 8 || iv === 9, `${label} ${hand} 第 ${i + 1} 個雙音音程 ${iv}`); });
    // 雙音:單音的指法規則不適用;改查每組兩個手指(右手下方指 < 上方指、左手相反)
    if (q.type === "thirds" || q.type === "sixths") notes.forEach((n, i) => ok(n.finger >= 1 && n.with.finger <= 5 && (hand === "rh" ? n.finger < n.with.finger : n.finger > n.with.finger), `${label} ${hand} 第 ${i + 1} 組雙音指法 ${n.finger}/${n.with.finger}`));
    else checkPlayable(notes, hand, label, q);
  }
  // 兩手的距離
  const d0 = ex.rh[0].midi - ex.lh[0].midi;
  if (q.motion === "contrary") ok(q.type === "chromatic" ? d0 >= 0 && d0 <= 4 : d0 === 0, `${label}: 反向的兩手起音距離 ${d0}`);
  else if (q.type === "scale" && q.apart === 3) ok(d0 === 15 || d0 === 16, `${label}: 相隔三度應該差十度(${d0})`);
  else if (q.type === "scale" && q.apart === 6) ok(d0 === 8 || d0 === 9, `${label}: 相隔六度(${d0})`);
  else if (q.type === "chromatic" && q.apartTenth) ok(d0 === 15 || d0 === 16, `${label}: 半音階相隔小三度應該差十度(${d0})`);
  else if (q.type === "chromatic" && q.lhStart !== q.rhStart) ok(d0 > 0 && d0 < 12, `${label}: 半音階兩手起音(${d0})`);
  else if (!["broken", "thirds", "sixths"].includes(q.type) && q.range !== "5th" && !(q.type === "arpeggio" && q.range)) ok(d0 === 12, `${label}: 同向兩手要差一個八度(${d0})`);
  for (const show of ["both", "rh", "lh"]) {
    const xml = exerciseToMusicXML(ex, q, show);
    for (const m of xml.split("<measure ").slice(1)) m.split("<backup>").forEach(p => {
      const sum = [...p.matchAll(/<note>((?:(?!<\/note>).)*?)<\/note>/gs)].filter(x => !/<chord\/>/.test(x[1])).reduce((a, x) => a + Number(/<duration>(\d+)/.exec(x[1])[1]), 0);
      ok(sum === (ex.bar || 48), `${label} ${show}: 小節時值 ${sum} ≠ ${ex.bar || 48}`);
    });
    checkNotation(xml, `${label} ${show}`, ex.sub);
    const hands = show === "both" ? ["rh", "lh"] : [show];
    const expN = hands.reduce((s, h) => s + ex[h].reduce((a, n) => a + (n.with ? 2 : 1), 0), 0);
    const expF = hands.reduce((s, h) => s + ex[h].reduce((c, x) => c + !!x.finger + !!(x.with && x.with.finger), 0), 0);
    const nNotes = (xml.match(/<pitch>/g) || []).length, nF = (xml.match(/<fingering /g) || []).length;
    ok(nNotes === expN && nF === expF, `${label} ${show}: 音數 ${nNotes}/${expN}、指法 ${nF}/${expF}`);
    const beg = (xml.match(/<beam number="1">begin/g) || []).length, end = (xml.match(/<beam number="1">end/g) || []).length;
    ok(beg === end, `${label} ${show}: 連桿沒有成對`);
  }
}

// 3a. 大綱裡的每一題(三種小調形式、Trinity A/B 組都跑)
let nSyl = 0;
const seenKeys = new Set();
for (const [sk, sys] of Object.entries(SY.systems)) for (const g of sys.grades) for (const mf of ["harmonic", "melodic", "natural"]) for (const set of ["A", "B"]) {
  for (const q of questionsFor(SY, sk, g, { minorForm: mf, set })) {
    const k = q.key + q.sub; if (seenKeys.has(k)) continue; seenKeys.add(k);
    nSyl++; checkQuestion(q, `${sk} G${g.grade} ${q.key}`);
  }
}
// 3b. 全部組合
const MAJ = ["C", "G", "D", "A", "E", "B", "F#", "Gb", "C#", "Db", "Ab", "Eb", "Bb", "F", "Cb"];
const MIN = ["A", "E", "B", "F#", "C#", "G#", "D#", "Eb", "Bb", "F", "C", "G", "D", "A#"];
const STARTS = ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"];
let nAll = 0;
const T = (o) => { nAll++; const q = { hands: "HT", articulation: "legato", sub: 2, motion: "similar", ...o }; checkQuestion(q, "全部 " + masteryKey(q)); };
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
  for (const k of MAJ) {
    for (const inversion of [0, 1, 2]) T({ type: "arpeggio", tonic: k, quality: "major", inversion, octaves: oct });
    T({ type: "dom7", tonic: k, quality: "major", octaves: oct });
  }
  for (const k of MIN) {
    for (const inversion of [0, 1, 2]) T({ type: "arpeggio", tonic: k, quality: "minor", inversion, octaves: oct });
    T({ type: "dom7", tonic: k, quality: "minor", octaves: oct });
  }
  for (const k of STARTS) { T({ type: "dim7", tonic: k, octaves: oct }); T({ type: "wholetone", tonic: k, octaves: oct }); }
  if (oct <= 2) {
    for (const k of MAJ) for (const type of ["thirds", "sixths"]) T({ type, tonic: k, quality: "major", octaves: oct, hands: "RH" });
    for (const k of MIN) for (const type of ["thirds", "sixths"]) T({ type, tonic: k, quality: "minor", form: "harmonic", octaves: oct, hands: "RH" });
  }
}
for (const k of MAJ) { T({ type: "broken", tonic: k, quality: "major", octaves: 1, sub: 3 }); T({ type: "scale", tonic: k, quality: "major", range: "5th", motion: "contrary" }); T({ type: "arpeggio", tonic: k, quality: "major", range: "5th" }); }
for (const k of MIN) { T({ type: "broken", tonic: k, quality: "minor", octaves: 1, sub: 3 }); T({ type: "arpeggio", tonic: k, quality: "minor", range: "5th" }); }
// 半音階雙手錯開
for (const [lh, rh, motion, tenth] of [["F#", "A#", "contrary"], ["C#", "E", "contrary"], ["C", "E", "contrary"], ["Eb", "C", "similar"], ["C", "Eb", "similar", true]]) for (const oct of [1, 2, 4]) {
  if (motion === "contrary" && oct > 2) continue;
  T({ type: "chromatic", tonic: lh, lhStart: lh, rhStart: rh, motion, octaves: oct, apartTenth: !!tenth });
}

// 哈農:20 首 × 12 個調 × 3 種節奏 —— 移位規則、兩手八度、調內音、指法位置、音域、記譜
let nHanon = 0;
{
  const stepOf = n => n.octave * 7 + n.letter;
  for (let no = 1; no <= 20; no++) for (const key of HANON_KEYS) for (const rhythm of HANON_RHYTHMS) {
    const ex = buildHanon(no, key, rhythm), label = `哈農 ${no} ${key} ${rhythm}`, scalePcs = new Set(INTERVALS.major.map(iv => (pcOf(parseNote(key)) + iv) % 12));
    nHanon++;
    for (const h of ["rh", "lh"]) {
      const ns = ex[h];
      ok(ns.length === 225, `${label} ${h}: 音數 ${ns.length}`);
      for (let b = 1; b < 14; b++) for (let i = 0; i < 8; i++) {
        ok(stepOf(ns[b * 8 + i]) - stepOf(ns[(b - 1) * 8 + i]) === 1, `${label} ${h}: 上行第 ${b + 1} 小節沒有整組往上一級`);
        ok(stepOf(ns[112 + b * 8 + i]) - stepOf(ns[112 + (b - 1) * 8 + i]) === -1, `${label} ${h}: 下行第 ${b + 15} 小節沒有整組往下一級`);
      }
      ns.forEach((n, i) => {
        ok(scalePcs.has(pcOf(n)) && n.midi === midiOf(n), `${label} ${h} #${i}: 不是調內音`);
        ok(n.midi >= 21 && n.midi <= 108, `${label} ${h} #${i}: 超出鋼琴音域`);
        ok(n.finger >= 1 && n.finger <= 5, `${label} ${h} #${i}: 沒有指法`);
      });
    }
    for (let i = 0; i < 224; i++) ok(stepOf(ex.rh[i]) - stepOf(ex.lh[i]) === 7, `${label} #${i}: 兩手不是相隔八度`);
    for (const show of ["both", "rh", "lh"]) {
      const xml = exerciseToMusicXML(ex, { articulation: "legato" }, show);
      ok((xml.match(/<measure /g) || []).length === 29, `${label} ${show}: 小節數不對`);
      checkNotation(xml, `${label} ${show}`, 4);
    }
  }
}
console.log(`哈農 ${nHanon} 種組合`);

// 版本指紋(快取):index.html 裡的 ?v= 要跟檔案內容一致
{
  const { execFileSync } = await import("node:child_process");
  try { execFileSync("node", [new URL("../build/stamp.mjs", import.meta.url).pathname, "--check"], { stdio: "pipe" }); checks++; }
  catch (e) { fail("index.html 的版本指紋不是最新的:執行 node tools/build/stamp.mjs"); }
}
console.log(`最多加線 ${maxLedger} 條`);
console.log(`\n大綱題目 ${nSyl} 題、全部組合 ${nAll} 題,共 ${checks} 項檢查。`);
if (fails) { console.log(`✗ ${fails} 項失敗`); process.exit(1); }
console.log("✓ 全部通過");
