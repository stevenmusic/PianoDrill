/* 今日練習的關卡檢查(PianoDrill;js/tech/routes.js + patterns.js + musicxml.js 的 exact 格式)。verify.mjs 呼叫;也可以單獨跑:node tools/test/checks/routes.mjs
   不沿用產生器的算法,另外照樂理寫一份(音階、和弦的音、五指位置)互相核對:
   - 路線:id 不重複、名稱中英都有、起始 < 目標(≥ 40)、重點 2–3 項、unlock 指到存在的關、每一關的每一個變化(複習)都產生得出來
   - 時值由慢到快(使用者要求):每條路線第 1 關只有四分音符以上;八分音符不早於第 2 關;十六分音符不早於第一個八分音符的關之後 5 關
   - 每個聲部每小節拍數正確、音不跨小節線、時值是寫得出來的(全、附點二分、二分、附點四分、四分、附點八分、八分、三連音八分、十六分)
   - 音高:拼法對、都在這個調的音階裡(a 小調用和聲小調);五指位置的關:手指 = 位置裡的那個音(右手 1 = 最低、左手 5 = 最低)
   - 指法:每個音都有 1–5;相鄰兩音(同一聲部)照 fingeraudit 的規則(手指順序、穿指 / 跨指 ≤ 純五度、撐得到的距離);和弦的手指照音高排序
   - 左手和弦:每個音都是那個和弦的音;右手長音是那個和弦的音
   - 按住的音:每小節都有、連結線接起來、移動的聲部不彈到按住的鍵
   - 譜號固定時加線 ≤ 2 條;MusicXML:小節數、每段時值、音數 = 指法數、連桿 / 連結線成對、拍號、調號(換調時跟著換)
   - 播放:事件數、都在範圍內;暖身(4 種 × C / G / F / a)也產生得出來 */
import fs from "node:fs";
import { ROUTES, WARM_LEVELS, warmFor, adaptVary } from "../../../js/tech/routes.js";
import { buildExercise } from "../../../js/tech/exercise.js";
import { exerciseToMusicXML, playbackEvents } from "../../../js/tech/musicxml.js";
import { chordName, keyInfo, barChords, chordTable, fingerMarks, sameBars, handPositions } from "../../../js/tech/patterns.js";

const LP = [0, 2, 4, 5, 7, 9, 11];
const MAJ = [0, 2, 4, 5, 7, 9, 11], HMIN = [0, 2, 3, 5, 7, 8, 11];
const TON = { C: 0, G: 7, F: 5, a: 9 }, FIFTHS = { C: 0, G: 1, F: -1, a: 0 };
const scalePcs = k => (k === "a" ? HMIN : MAJ).map(x => (x + TON[k]) % 12);
const pcOfDeg = (k, d) => scalePcs(k)[((d % 7) + 7) % 7];
// 和弦的級數 → 這個調的音級(0 起算)
const CH = { I: [0, 2, 4], i: [0, 2, 4], IV: [3, 5, 0], iv: [3, 5, 0], V: [4, 6, 1], V7: [4, 6, 1, 3], vi: [5, 0, 2] };
const OK_DUR = new Set([48, 36, 24, 18, 12, 9, 6, 4, 3]);
const SPAN = { "1-2": 7, "1-3": 7, "1-4": 9, "1-5": 12, "2-3": 4, "2-4": 6, "2-5": 9, "3-4": 4, "3-5": 7, "4-5": 4 };
const midiOf = n => 12 * (n.octave + 1) + LP[n.letter] + n.alter;
const stepOf = n => n.octave * 7 + n.letter;
const ledgers = (n, clef) => { const s = stepOf(n), top = clef === "G" ? 38 : 26, bot = clef === "G" ? 30 : 18; return s > top ? Math.floor((s - top) / 2) : s < bot ? Math.floor((bot - s) / 2) : 0; };

export default function check(ok, FG){
  FG = FG || JSON.parse(fs.readFileSync(new URL("../../../data/fingerings.json", import.meta.url)));
  let n = 0;
  const lvIds = new Set();
  for (const R of ROUTES) {
    ok(Array.isArray(R.name) && R.name.length === 2, `路線 ${R.id}:名稱`);
    const ids = new Set();
    let firstEighth = -1, firstSixteenth = -1;
    R.levels.forEach((L, li) => {
      const at = `${R.id}/${L.id}`;
      ok(!ids.has(L.id), `${at}:id 重複`); ids.add(L.id); lvIds.add(at);
      ok(Array.isArray(L.name) && L.name[0] && L.name[1] && L.name[1].length <= 40, `${at}:名稱中英都要有、英文 ≤ 40 字`);
      ok(!/[((](四分|八分|十六分|三連音|二分|全音符)/.test(L.name[0]) && !/\((quarters?|eighths?|16ths?|triplets?)/i.test(L.name[1]), `${at}:名稱不放時值括號(時值在標籤):${L.name[0]}`);
      ok(L.start >= 40 && (L.g === "0" ? L.start === L.target : L.start < L.target) && L.target <= 200, `${at}:速度 ${L.start} → ${L.target}`);
      ok(Array.isArray(L.check) && L.check.length >= 2 && L.check.length <= 3 && L.check.every(c => c[0] && c[1]), `${at}:重點要 2–3 項、中英都有`);
      ok(Array.isArray(L.vary) && L.vary.length >= 5, `${at}:複習變化至少 5 種`);
      ok(typeof L.names === "boolean", `${at}:音名預設`);
      const durs = [];
      [{}, ...L.vary].forEach((v, vi) => {
        const q = { ...L.q, ...(v.q || {}), sub: 2 };
        let ex;
        try { ex = buildExercise(FG, q); } catch (e) { ok(false, `${at} 變化 ${vi}:產生不出來 ${e.message}`); return; }
        n++;
        if (vi === 0) for (const h of ["rh", "lh"]) for (const x of ex[h]) if (!x.rest) durs.push(x.dur);
        if (v.q && v.q.rkey) ok(ex.fifths === FIFTHS[v.q.rkey], `${at} 變化 ${vi}:換到 ${v.q.rkey} 的調號 ${ex.fifths}`);
        if (v.name) ok(v.name[0] && v.name[1], `${at} 變化 ${vi}:名稱`);
        checkEx(ok, ex, q, L, `${at}${vi ? " 變化 " + vi : ""}`);
      });
      if (firstEighth < 0 && durs.some(d => d < 12)) firstEighth = li;
      if (firstSixteenth < 0 && durs.some(d => d === 3 || d === 9)) firstSixteenth = li;
    });
    ok(firstEighth !== 0, `${R.id}:第 1 關要四分音符以上(時值由慢到快)`);
    ok(firstEighth < 0 || firstEighth >= 2, `${R.id}:八分音符太早(第 ${firstEighth + 1} 關)`);
    ok(firstSixteenth < 0 || firstSixteenth >= firstEighth + 5, `${R.id}:十六分音符太早(第 ${firstSixteenth + 1} 關)`);
    if (R.unlock) ok(lvIds.has(`${R.unlock.route}/${R.unlock.passed}`) || ROUTES.some(r => r.id === R.unlock.route && r.levels.some(l => l.id === R.unlock.passed)), `${R.id}:unlock 指到不存在的關`);
  }
  for (const W of Object.values(WARM_LEVELS)) for (const key of ["C", "G", "F", "a"]) {
    const q = { ...W.q, rkey: key, sub: 2 };
    try { const ex = buildExercise(FG, q); checkEx(ok, ex, q, W, `暖身 ${W.id} ${key}`); n++; ok(Math.min(...["rh", "lh"].flatMap(h => ex[h].filter(x => !x.rest).map(x => x.dur))) >= (W.id === "w5s" || W.id === "w5q" ? 12 : 6), `暖身 ${W.id}:初學從四分音符`); }
    catch (e) { ok(false, `暖身 ${W.id} ${key}:${e.message}`); }
  }
  // ── 系統化(2026-10):第 0 組在手指路線最前面、伴奏等手指 PA5 過了才開放、暖身只用已經過的關、複習的變化只用學過的 ──
  const F0 = ROUTES[0].levels;
  ok(ROUTES[0].id === "finger" && F0[0].id === "P02" && F0[1].id === "P01" && F0[0].g === "0" && F0[1].g === "0" && F0[2].id === "PA1", "第 0 組:找到中央 C、手指號碼(手指路線最前面)");
  ok(ROUTES.every(R => R.levels.every(l => (l.g === "0") === (l.start === l.target && l.need === 2 && l.review === false))), "第 0 組:起始 = 目標速度、連續 2 次穩就過、不放進複習盒(只有第 0 組)");
  const acc = ROUTES.find(r => r.id === "accomp");
  ok(acc.unlock && acc.unlock.route === "finger" && acc.unlock.passed === "PA5", "伴奏:手指路線過了 PA5 才開放");
  const none = () => false, upTo = ids => (r, id) => ids.includes(id);
  ok(warmFor(none) === null && warmFor(upTo(["P02", "P01"])) === "w0" && warmFor(upTo(["P02", "P01", "PA1", "PA2"])) === "w5s" && warmFor(upTo(["PA4", "PA5", "PE3"])) === "wsc", "暖身只用已經過的關(第一天不排暖身)");
  const pb1 = F0.find(l => l.id === "PB1"), v2 = pb1.vary[1], v3 = pb1.vary[2], v4 = pb1.vary[3];
  const a2 = adaptVary(v2, { level: pb1, box: 2, passed: none }), a3 = adaptVary(v3, { level: pb1, box: 3, passed: none }), a4 = adaptVary(v4, { level: pb1, box: 4, passed: none });
  ok(v2.q.rhythm && !(a2.q && a2.q.rhythm) && (a2.click || (a2.q && Object.keys(a2.q).length)), "還沒教附點:附點拿掉(什麼都不剩就用拍點模式):" + JSON.stringify(a2));
  ok(v3.q.touch === "stacc" && !(a3.q && a3.q.touch) && adaptVary(v3, { level: pb1, box: 3, passed: upTo(["PF3"]) }).q.touch === "stacc", "斷奏要過了 PF3 才用");
  ok(v4.q.rkey === "G" && !(a4.q && a4.q.rkey) && a4.click && adaptVary(v4, { level: pb1, box: 4, passed: upTo(["PG1"]) }).q.rkey === "G", "換到 G 要學過 G(PG1 / AA4)");
  // ── 譜面標記(方法書的做法;patterns.js):和弦名(另外照樂理手抄一份核對)、和弦表、指法只標第一次、兩小節一樣縮成反覆 ──
  const CHORDS = { C: { I: "C", IV: "F", V: "G", V7: "G7", vi: "Am" }, G: { I: "G", IV: "C", V7: "D7" }, F: { I: "F", IV: "B♭", V7: "C7" }, a: { i: "Am", iv: "Dm", V7: "E7" } };
  for (const [k, m] of Object.entries(CHORDS)) for (const [ch, name] of Object.entries(m)) ok(chordName(keyInfo(k), ch) === name, `和弦名 ${k} ${ch} = ${name}(得到 ${chordName(keyInfo(k), ch)})`);
  const A1 = buildExercise(FG, { type: "route", r: "accomp", id: "AA1", sub: 2 });
  ok(barChords(A1).join() === "C,C,G7,C", "AA1 每小節的和弦名:" + barChords(A1));
  const t1 = chordTable(A1);
  ok(t1.length === 2 && t1[0].notes.join(" ") === "C E G" && t1[0].fingers.join("-") === "5-3-1" && t1[1].notes.join(" ") === "B F G" && t1[1].fingers.join("-") === "5-2-1", "AA1 和弦表 C = C E G(5-3-1)· G7 = B F G(5-2-1):" + JSON.stringify(t1));
  fingerMarks(A1);
  const lhC = A1.lh.filter(x => !x.rest);
  ok(lhC[0].fshow && lhC[0].chord.every(c => c.fshow) && !lhC[1].fshow && lhC[1].chord.every(c => !c.fshow), "柱式和弦:同一個形狀只標第一次(和弦裡每個音一起)");
  ok(lhC.filter(x => x.fshow).length === 2, "AA1:C、G7 各標一次:" + lhC.filter(x => x.fshow).length);
  const B1 = buildExercise(FG, { type: "route", r: "finger", id: "PB1", sub: 2 }), sb = sameBars(B1);
  ok(sb && sb.bars === 1 && sb.repeat === 2, "PB1 兩小節一樣 → 一小節 + 反覆");
  ok(!sameBars(buildExercise(FG, { type: "route", r: "finger", id: "PA1", sub: 2 })), "PA1 兩小節不一樣 → 不縮");
  const E1 = fingerMarks(buildExercise(FG, { type: "route", r: "finger", id: "PE1", sub: 2 })), e2 = E1.rh.filter(x => !x.rest).slice(8);
  ok(e2.filter(x => x.fshow).map(x => x.finger).join() === "1,3", "PE1 第 2 小節只標拇指穿越與跨回去(1、3):" + e2.filter(x => x.fshow).map(x => x.finger));
  const all = fingerMarks(buildExercise(FG, { type: "route", r: "finger", id: "PA1", sub: 2 }), { all: true });
  ok(all.rh.filter(x => !x.rest).every(x => x.fshow), "A 組每個音都標");
  const hp = handPositions(buildExercise(FG, { type: "route", r: "finger", id: "PB1", sub: 2 }));
  ok(hp.length === 1 && hp[0].keys.map(k => k.name + k.finger).join() === "C1,D2,E3,F4,G5" && hp[0].mid, "PB1 手位圖 = C 位置(右手拇指在中央 C):" + JSON.stringify(hp));
  const hpG = handPositions(buildExercise(FG, { type: "route", r: "finger", id: "PG2", sub: 2 }));
  ok(hpG.length === 2 && hpG[0].keys.map(k => k.name).join() === "F,G,A,B♭,C", "PG2 手位圖 F 位置有 B♭:" + JSON.stringify(hpG.map(p => p.keys.map(k => k.name))));
  return n;
}

function checkEx(ok, ex, q, L, at){
  const key = q.rkey || L.key || "C", BAR = ex.bar, pcs = scalePcs(key);
  ok(ex.bar === (L.time ? L.time[0] : 4) * 12, `${at}:小節長度`);
  ok(ex.fifths === FIFTHS[key], `${at}:調號`);
  for (const h of ["rh", "lh"]) {
    const voices = [ex[h], ...(ex.hold && ex.hold[h] && ex.hold[h].length ? [ex.hold[h]] : [])];
    voices.forEach((vs, vi) => {
      let pos = 0;
      for (const x of vs) {
        ok(x.whole ? x.dur === BAR : OK_DUR.has(x.dur), `${at} ${h}:時值 ${x.dur}`);
        ok(Math.floor(pos / BAR) === Math.floor((pos + x.dur - 1) / BAR), `${at} ${h}:音跨小節線(${pos})`);
        pos += x.dur;
        if (x.rest) continue;
        for (const y of [x, ...(x.chord || [])]) {
          ok(midiOf(y) === y.midi, `${at} ${h}:拼法與音高不符`);
          ok(pcs.includes(((y.midi % 12) + 12) % 12), `${at} ${h}:${y.midi} 不在 ${key} 的音階裡`);
          ok(y.finger >= 1 && y.finger <= 5, `${at} ${h}:沒有指法`);
          ok(ledgers(y, h === "rh" ? "G" : "F") <= 2, `${at} ${h}:加線太多`);
        }
        if (x.chord) {   // 和弦的手指照音高排(右手低音小號、左手低音大號)
          const all = [x, ...x.chord].sort((a, b) => a.midi - b.midi), fs = all.map(y => y.finger);
          ok(fs.every((f, i) => i === 0 || (h === "rh" ? f > fs[i - 1] : f < fs[i - 1])), `${at} ${h}:和弦的手指順序 ${fs}`);
          ok(all[all.length - 1].midi - all[0].midi <= (h === "rh" ? 9 : 9), `${at} ${h}:和弦撐太開`);
        }
      }
      ok(pos === ex.bars * BAR, `${at} ${h} 聲部 ${vi}:總長 ${pos} ≠ ${ex.bars * BAR}`);
      // 相鄰兩音的指法(同一聲部、單音)
      // 換和弦(伴奏)、換位置(@V)的小節線:手整個移過去,不算相鄰
      const shiftAtBar = !!L.prog || /@V/.test(L[h] || "");
      let p0 = 0; const ns = vs.map(x => { const o = { ...x, at: p0 }; p0 += x.dur; return o; }).filter(x => !x.rest);
      for (let i = 0; i + 1 < ns.length; i++) {
        const a = ns[i], b = ns[i + 1], d = b.midi - a.midi, fa = a.finger, fb = b.finger;
        if (!d || a.chord || b.chord) continue;
        if (shiftAtBar && Math.floor(a.at / BAR) !== Math.floor(b.at / BAR)) continue;
        const up = d > 0, rh = h === "rh";
        const natural = rh ? (up ? fb > fa : fb < fa) : (up ? fb < fa : fb > fa);
        const cross = !natural && fa !== fb && (rh ? (up ? fb === 1 && fa >= 2 && fa <= 4 : fa === 1 && fb >= 2 && fb <= 4) : (up ? fa === 1 && fb >= 2 && fb <= 4 : fb === 1 && fa >= 2 && fa <= 4));
        let why = null;
        if (fa === fb) why = `同一指 ${fa} 連彈兩個音`;
        else if (!natural && !cross) why = `${fa}→${fb} 不能這樣接`;
        else if (natural) { const k = Math.min(fa, fb) + "-" + Math.max(fa, fb); if (Math.abs(d) > SPAN[k]) why = `${fa}→${fb} 距離 ${Math.abs(d)}`; }
        else if (Math.abs(d) > 7) why = `穿指 ${fa}→${fb} 距離 ${Math.abs(d)}`;
        ok(!why, `${at} ${h} 第 ${i + 1}→${i + 2} 個音:${why}`);
      }
    });
    // 五指位置:同一個位置裡手指 = 音(右手 1 = 最低、左手 5 = 最低),每小節一個位置(@I / @V)
    if (!L.prog && !L.scale && !/=/.test(L[h] || "")) {
      const ns = [...ex[h], ...(ex.hold && ex.hold[h] ? ex.hold[h] : [])].filter(x => !x.rest).flatMap(x => [x, ...(x.chord || [])].map(y => ({ ...y, bar: Math.floor((x.pos ?? 0) / BAR) })));
      const byBarStart = new Map();
      // 位置最低音 = 每個音往回推:右手 midi 往下 (f−1) 級、左手往下 (5−f) 級 → 推回來的音要一樣
      let pos = 0; const mv = ex[h].map(x => { const o = { ...x, at: pos }; pos += x.dur; return o; });
      for (const x of mv) if (!x.rest) for (const y of [x, ...(x.chord || [])]) {
        const b = Math.floor(x.at / BAR), steps = h === "rh" ? y.finger - 1 : 5 - y.finger;
        const base = stepOf(y) - steps;
        if (byBarStart.has(b)) ok(byBarStart.get(b) === base, `${at} ${h} 第 ${b + 1} 小節:手指 ${y.finger} 不在五指位置上`);
        else byBarStart.set(b, base);
      }
      if (ex.hold && ex.hold[h]) for (const x of ex.hold[h]) for (const y of [x, ...(x.chord || [])]) {
        const base = stepOf(y) - (h === "rh" ? y.finger - 1 : 5 - y.finger);
        for (const v of byBarStart.values()) ok(v === base, `${at} ${h}:按住的音 ${y.finger} 不在五指位置上`);
      }
      void ns;
    }
    // 按住的音:每小節都有、連結線、移動的聲部不碰到
    if (ex.hold && ex.hold[h] && ex.hold[h].length) {
      const hv = ex.hold[h], held = new Set([hv[0], ...(hv[0].chord || [])].map(y => y.midi));
      ok(hv.length === ex.bars && hv.every((x, i) => x.dur === BAR && x.tie === (ex.bars === 1 ? undefined : i === 0 ? "start" : i === ex.bars - 1 ? "stop" : "both")), `${at} ${h}:按住的音沒有接起來`);
      ok(ex[h].every(x => x.rest || ![x, ...(x.chord || [])].some(y => held.has(y.midi))), `${at} ${h}:移動的聲部彈到按住的鍵`);
    }
  }
  // 左手和弦 / 右手長音:都是那個和弦的音
  if (L.prog) {
    const chordPcs = ch => CH[ch].map(d => pcOfDeg(key, d));
    for (const h of ["lh", "rh"]) {
      let pos = 0;
      for (const x of ex[h]) {
        const b = Math.floor(pos / BAR); pos += x.dur;
        if (x.rest) continue;
        const ch = L.prog[b];
        for (const y of [x, ...(x.chord || [])]) ok(chordPcs(ch).includes(((y.midi % 12) + 12) % 12), `${at} ${h} 第 ${b + 1} 小節:${y.midi} 不是 ${ch} 的音`);
      }
    }
    // 左手柱式的最低音 = 和弦音裡照方法書的形狀:I / IV = 主音在下、V7 = 導音在下
    if (["block4", "block2"].includes(L.lh)) L.prog.forEach((ch, b) => {
      const x = ex.lh.find((_, i) => { let p = 0; for (let k = 0; k < i; k++) p += ex.lh[k].dur; return Math.floor(p / BAR) === b; });
      const low = ((x.midi % 12) + 12) % 12;
      ok(low === pcOfDeg(key, ch === "V7" ? 6 : 0), `${at}:${ch} 的最低音`);
    });
  }
  // MusicXML
  for (const show of ["both", "rh", "lh"]) {
    const xml = exerciseToMusicXML(ex, q, show);
    const ms = xml.split("<measure ").slice(1);
    ok(ms.length === ex.bars, `${at} ${show}:小節數 ${ms.length}`);
    ok(/<time><beats>\d<\/beats>/.test(xml), `${at} ${show}:沒有拍號`);
    ok(new RegExp(`<fifths>${ex.fifths}</fifths>`).test(xml), `${at} ${show}:調號`);
    for (const m of ms) m.split("<backup>").forEach(p => {
      const sum = [...p.matchAll(/<note>((?:(?!<\/note>).)*?)<\/note>/gs)].filter(x => !/<chord\/>/.test(x[1])).reduce((a, x) => a + Number(/<duration>(\d+)/.exec(x[1])[1]), 0);
      ok(sum === BAR, `${at} ${show}:小節時值 ${sum} ≠ ${BAR}`);
    });
    const nNotes = (xml.match(/<pitch>/g) || []).length, nF = (xml.match(/<fingering /g) || []).length;
    ok(nNotes === nF, `${at} ${show}:音數 ${nNotes}、指法 ${nF}`);
    ok((xml.match(/<beam number="1">begin/g) || []).length === (xml.match(/<beam number="1">end/g) || []).length, `${at} ${show}:連桿沒有成對`);
    ok((xml.match(/<tied type="start"/g) || []).length === (xml.match(/<tied type="stop"/g) || []).length, `${at} ${show}:連結線沒有成對`);
    ok((xml.match(/<slur type="start"/g) || []).length === (xml.match(/<slur type="stop"/g) || []).length, `${at} ${show}:圓滑線沒有成對`);
    const evs = playbackEvents(ex, q, show), total = ex.bars * BAR / 12;
    ok((evs.length > 0 || nNotes === 0) && evs.every(e => e.beat >= 0 && e.beat + e.len <= total + 1e-9 && e.vel > 0 && e.midi >= 21 && e.midi <= 108), `${at} ${show}:播放事件`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let fails = 0, checks = 0;
  const n = check((c, m) => { checks++; if (!c) { fails++; if (fails < 60) console.log("✗ " + m); } return c; });
  console.log(`今日練習關卡:${n} 題(含變化、暖身)、${checks} 項檢查${fails ? `,✗ ${fails} 項失敗` : " ✓"}`);
  process.exit(fails ? 1 : 0);
}
