/* 檢定聽力練習:依 data/aural.json 的 drill(type + p)產生題目。
   題目格式(單音/音程/和弦分頁也一樣,app.js 統一處理):
   { key, label, tags, play: { ev, clicks, dur }, steps: [{ q, choices: [{ id, label }], answer }],
     keys: { target, lo, hi, octaveOk }, tap: { kind, beat, iois }, reveal, note } */
import { tr } from "./i18n.js";
import { MAJOR, rnd, pick, chance, pickKey, tonicMidi, degMidi, METERS, barLen, melody, render, harmonise,
  keyChordIntro, voiceChords, chordEvents, cadencePhrase, modulation } from "./music.js";
import { INTERVALS, pcName } from "./ear.js";

export const DRILL_NAME = {
  pulse: ["跟著打拍子", "Clap the pulse"], meter: ["幾拍子", "Time"], rhythm: ["拍出節奏", "Clap the rhythm"],
  echo: ["聽完彈回來", "Echo / memory"], dyn: ["力度", "Dynamics"], artic: ["奏法", "Articulation"],
  tempo: ["速度變化", "Tempo"], tonality: ["大調/小調", "Major/minor"], change: ["找出改變", "Spot the change"],
  highlow: ["最高/最低音", "Highest/lowest"], lastfirst: ["最後一音高或低", "Last vs first"], interval: ["音程", "Interval"],
  cadence: ["終止式", "Cadence"], chords: ["和弦", "Chords"], modulation: ["轉調", "Modulation"], tonchange: ["調性改變", "Tonality change"]
};
export const drillName = t => tr(...DRILL_NAME[t]);

const ch = (id, zh, en) => ({ id, label: tr(zh, en) });
const METER_CH = { "2": ["二拍子", "Two"], "3": ["三拍子", "Three"], "4": ["四拍子", "Four"], "6": ["6/8 拍", "6/8"], "5": ["五拍子", "Five"] };
const TS = { "2": "2/4", "3": "3/4", "4": "4/4", "6": "6/8", "5": "5/4" };
const CAD = { perfect: ["完全終止", "Perfect"], imperfect: ["不完全終止", "Imperfect"], interrupted: ["阻礙終止", "Interrupted"], plagal: ["變格終止", "Plagal"] };
const MOD = { dominant: ["屬調", "Dominant"], subdominant: ["下屬調", "Subdominant"] };
const ROMAN_ALL = ["I", "Ib", "Ic", "ii", "iib", "IV", "V", "Vb", "Vc", "V7", "vi"];

/* 一段樂句的共同設定:調、主音、拍子 */
function setup(p, minorDefault = false){
  const minor = p.minor === true ? chance(0.4) : p.minor === "always" ? true : minorDefault && chance(0.4);
  const key = pickKey(minor, 3);
  const tonic = tonicMidi(key.tonicPc);
  const meter = pick(p.meters || ["2", "3", "4"]);
  return { key, tonic, meter };
}
/* 範圍:"oct" = 一個八度內(隨機放在主音上下) */
const rangeOf = r => r === "oct" ? pick([[0, 7], [-3, 4], [-2, 5]]) : r || [-3, 7];

/* 依力度設定、速度變化的函式 */
const flat = v => () => v;
function shift(evs, dt){ return evs.map(e => ({ ...e, t: e.t + dt })); }
function clicksFor(n, beat, t0 = 0, per = 4){ return Array.from({ length: n }, (_, i) => ({ t: t0 + i * beat, strong: i % per === 0 })); }

/* 數兩小節(拍點) */
function countIn(meter, beat, t0){
  const per = METERS[meter].beats;
  return { clicks: clicksFor(per * 2, beat, t0, per), dur: per * 2 * beat };
}

export function makeDrill(drill, ctx){
  const p = drill.p || {}, sys = ctx.system;
  const q = GEN[drill.type](p, sys, ctx);
  q.type = drill.type;
  q.label = q.label || drillName(drill.type);
  q.key = ctx.key;
  return q;
}

const GEN = {
  /* 跟著打拍子:播放中按節拍鍵,看穩不穩、速度對不對 */
  pulse(p){
    const { key, tonic, meter } = setup({ ...p, minor: true });
    const mel = melody({ meter, bars: 8, range: [-2, 7] });
    const r = render(mel, key, tonic, { acc: p.acc !== false, accent: true, vel: 66 });
    return { play: { ev: r.ev, dur: r.dur }, tap: { kind: "pulse", beat: r.beat, from: 0, until: r.dur },
      reveal: tr(METER_CH[meter][0], METER_CH[meter][1]) + " · ♩ ≈ " + Math.round(60 / r.beat) };
  },
  /* 幾拍子 / 拍號 */
  meter(p){
    const { key, tonic, meter } = setup({ meters: p.choices, minor: true });
    const mel = melody({ meter, bars: meter === "5" ? 4 : 6, range: [-3, 7] });
    const r = render(mel, key, tonic, { acc: p.acc !== false, accent: true, vel: 66 });
    const choices = p.choices.map(m => p.ts ? { id: m, label: TS[m] } : ch(m, ...METER_CH[m]));
    return { play: { ev: r.ev, dur: r.dur }, steps: [{ q: p.ts ? tr("拍號是?", "Time signature?") : tr("幾拍子?", "Which time?"), choices, answer: meter }] };
  },
  /* 拍出節奏:只有旋律;ABRSM 初級先數兩小節、聽完馬上接著拍(回聲);4 級以上彈兩次再拍 */
  rhythm(p){
    const { key, tonic, meter } = setup(p);
    const mel = melody({ meter, bars: p.bars || 2, range: [-2, 5], easy: true });
    const r = render(mel, key, tonic, { vel: 66 });
    let ev = r.ev, clicks = [], t = 0;
    if (p.countIn) { const c = countIn(meter, r.beat, 0); clicks = c.clicks; t = c.dur; ev = shift(ev, t); }
    let dur = t + r.dur;
    if (p.twice) { ev = ev.concat(shift(r.ev, dur + r.beat * 2)); dur = dur * 2 + r.beat * 2; }
    const on = mel.notes.map(n => n.at * r.eighth);
    return { play: { ev, clicks, dur }, tap: { kind: "rhythm", beat: r.beat, iois: on.slice(1).map((x, i) => x - on[i]), n: on.length },
      reveal: tr(`${on.length} 個音`, `${on.length} notes`) };
  },
  /* 回聲 / 背奏:用鍵盤彈出聽到的音(考試是唱或彈;高八度、低八度都算對) */
  echo(p){
    const { key, tonic, meter } = setup(p);
    const range = rangeOf(p.range);
    const mel = melody({ meter, bars: p.bars || 2, range, start: p.range && p.range[1] <= 2 ? [0] : [0, 2, 4], easy: (p.bars || 2) <= 2, maxLeap: p.range && p.range[1] <= 2 ? 1 : 2 });
    const r = render(mel, key, tonic, { vel: 68 });
    let ev = r.ev, target = r.ev.map(e => e.midi);
    if (p.part) {   // 兩聲部 / 三聲部:另外寫下聲部(和聲的根音或三音,級進為主)
      const bassNotes = harmonise(mel).map(c => ({ c, deg: { I: 0, IV: 3, V: 4, ii: 1, vi: 5 }[c.name] }));
      const low = bassNotes.map(({ c, deg }) => ({ t: c.at * r.eighth, midi: degMidi(key, tonic - 12, deg > 4 ? deg - 7 : deg), dur: c.len * r.eighth, vel: 62 }));
      const mid = p.part === "lowest3" ? bassNotes.map(({ c, deg }) => ({ t: c.at * r.eighth, midi: degMidi(key, tonic - 12, deg + 2) + (degMidi(key, tonic - 12, deg + 2) < tonic - 9 ? 12 : 0), dur: c.len * r.eighth, vel: 54 })) : [];
      ev = [...r.ev, ...low, ...mid];
      target = p.part === "upper" ? r.ev.map(e => e.midi) : low.map(e => e.midi);
    }
    const intro = keyChordIntro(key, tonic, (p.part && p.part !== "upper" ? ev.filter(e => e.vel === 62)[0] : r.ev[0]).midi);
    const ci = countIn(meter, r.beat, intro.dur);
    let all = [...intro.ev, ...shift(ev, intro.dur + ci.dur)], dur = intro.dur + ci.dur + r.dur;
    if (p.twice) { all = all.concat(shift(ev, dur + r.beat * 2)); dur += r.dur + r.beat * 2; }
    const lo = Math.min(...target) - 5, hi = Math.max(...target) + 5;
    const which = { upper: tr("上聲部", "upper part"), lower: tr("下聲部", "lower part"), lowest3: tr("最低聲部", "lowest part") }[p.part];
    return { play: { ev: all, clicks: ci.clicks, dur }, keys: { target, lo, hi, octaveOk: true },
      tags: [pcName(key.tonicPc) + (key.minor ? tr(" 小調", " minor") : tr(" 大調", " major")), which ? tr("彈出", "Play the ") + which : tr("用鍵盤彈出來", "Play it back")],
      reveal: target.map(m => pcName(m)).join(" ") };
  },
  /* 力度:lq 大聲/小聲;fp forte/piano;abrsm 加上突然/漸漸改變;vary(Trinity 2 級起)描述變化 */
  dyn(p){
    const { key, tonic, meter } = setup({ minor: true });
    const set = p.set || "lq";
    const opts = set === "lq" ? ["loud", "quiet"] : set === "fp" ? ["f", "p"] : set === "abrsm" ? ["loud", "quiet", "sudden", "gradual"] : ["cresc", "dim", "subLoud", "subQuiet"];
    const a = pick(opts);
    const F = 92, P = 36;
    const up = x => P + (F - P) * x, down = x => F - (F - P) * x, sUp = x => x < 0.5 ? P : F, sDown = x => x < 0.5 ? F : P;
    const g = { loud: flat(F), f: flat(F), quiet: flat(P), p: flat(P), cresc: up, dim: down, subLoud: sUp, subQuiet: sDown,
      gradual: chance(0.5) ? up : down, sudden: chance(0.5) ? sUp : sDown }[a];
    const mel = melody({ meter, bars: 4, range: [-2, 7] });
    const r = render(mel, key, tonic, { acc: true, dyn: g });
    const L = { loud: ["大聲", "Loud"], quiet: ["小聲", "Quiet"], f: ["forte(強)", "Forte"], p: ["piano(弱)", "Piano"], sudden: ["突然改變", "Sudden change"], gradual: ["漸漸改變", "Gradual change"],
      cresc: ["漸強", "Crescendo"], dim: ["漸弱", "Diminuendo"], subLoud: ["突然變強", "Suddenly loud"], subQuiet: ["突然變弱", "Suddenly quiet"] };
    return { play: { ev: r.ev, dur: r.dur }, steps: [{ q: tr("力度是?", "Dynamics?"), choices: opts.map(o => ch(o, ...L[o])), answer: a }] };
  },
  artic(p){
    const { key, tonic, meter } = setup({ minor: true });
    const a = pick(["legato", "staccato"]);
    const mel = melody({ meter, bars: 4, range: [-2, 7] });
    const r = render(mel, key, tonic, { acc: false, artic: a, vel: 66 });
    const it = p.names === "it";
    return { play: { ev: r.ev, dur: r.dur }, steps: [{ q: tr("奏法是?", "Articulation?"), choices: [ch("legato", it ? "圓滑(legato)" : "圓滑", it ? "Legato" : "Smooth"), ch("staccato", it ? "斷奏(staccato)" : "斷開", it ? "Staccato" : "Detached")], answer: a }] };
  },
  tempo(){
    const { key, tonic, meter } = setup({ minor: true });
    const a = pick(["slower", "faster", "same"]);
    const tf = { slower: x => x < 0.45 ? 1 : 1 - 0.75 * (x - 0.45), faster: x => x < 0.45 ? 1 : 1 + 0.9 * (x - 0.45), same: () => 1 }[a];
    const mel = melody({ meter, bars: 6, range: [-2, 7] });
    const r = render(mel, key, tonic, { acc: true, tempo: tf, bpm: a === "faster" ? 80 : 100 });
    return { play: { ev: r.ev, dur: r.dur }, steps: [{ q: tr("速度怎麼變?", "Tempo?"), choices: [ch("slower", "越來越慢", "Slowing down"), ch("faster", "越來越快", "Getting faster"), ch("same", "不變", "Same")], answer: a }] };
  },
  tonality(p){
    const minor = chance(0.5);
    const key = pickKey(minor, 3), tonic = tonicMidi(key.tonicPc), meter = pick(["2", "3", "4"]);
    const mel = melody({ meter, bars: 4, range: [-3, 7], start: [0, 2, 4] });
    const r = render(mel, key, tonic, { acc: p.acc !== false, vel: 64 });
    return { play: { ev: r.ev, dur: r.dur }, steps: [{ q: tr("大調還是小調?", "Major or minor?"), choices: [ch("major", "大調", "Major"), ch("minor", "小調", "Minor")], answer: minor ? "minor" : "major" }] };
  },
  /* 調性改變:前半大調、後半同主音小調(或相反) */
  tonchange(){
    const startMinor = chance(0.5);
    const k1 = pickKey(startMinor, 3), tonic = tonicMidi(k1.tonicPc), meter = pick(["2", "3", "4"]);
    const m1 = melody({ meter, bars: 4, range: [-2, 7] }), m2 = melody({ meter, bars: 4, range: [-2, 7] });
    const r1 = render(m1, k1, tonic, { acc: true, vel: 64 }), r2 = render(m2, { minor: !startMinor }, tonic, { acc: true, vel: 64 });
    return { play: { ev: [...r1.ev, ...shift(r2.ev, r1.dur)], dur: r1.dur + r2.dur },
      steps: [{ q: tr("調性怎麼改變?", "How does the tonality change?"), choices: [ch("M2m", "大調 → 小調", "Major → minor"), ch("m2M", "小調 → 大調", "Minor → major")], answer: startMinor ? "m2M" : "M2m" }] };
  },
  /* 前三個音:最高 / 最低(三個音不同音高) */
  highlow(){
    const { key, tonic } = setup({});
    let d; do { d = [0, 1, 2].map(() => rnd(6) - 1); } while (new Set(d).size < 3);
    const ask = pick(["high", "low"]);
    const ev = d.map((x, i) => ({ t: i * 0.6, midi: degMidi(key, tonic, x), dur: 0.58, vel: 68 }));
    const target = ask === "high" ? d.indexOf(Math.max(...d)) : d.indexOf(Math.min(...d));
    return { play: { ev, dur: 1.8 }, steps: [{ q: ask === "high" ? tr("哪一個音最高?", "Which note is highest?") : tr("哪一個音最低?", "Which note is lowest?"),
      choices: [ch("0", "第一個", "1st"), ch("1", "第二個", "2nd"), ch("2", "第三個", "3rd")], answer: String(target) }] };
  },
  /* 最後一個音比第一個音高還是低(不會一樣) */
  lastfirst(p){
    const { key, tonic, meter } = setup(p);
    let mel; do { mel = melody({ meter, bars: p.bars, range: [-3, 7], endOnTonic: p.bars > 2 }); } while (mel.notes[0].deg === mel.notes[mel.notes.length - 1].deg);
    const r = render(mel, key, tonic, { vel: 66 });
    const up = r.ev[r.ev.length - 1].midi > r.ev[0].midi;
    return { play: { ev: r.ev, dur: r.dur }, steps: [{ q: tr("最後一個音比第一個音…", "The last note is… than the first"), choices: [ch("higher", "高", "Higher"), ch("lower", "低", "Lower")], answer: up ? "higher" : "lower" }] };
  },
  /* 找出改變:同一句彈兩次,第二次改音高或節奏 */
  change(p, sys, ctx, tries = 0){
    const { key, tonic, meter } = setup(p);
    const mel = melody({ meter, bars: p.bars, range: [-3, 7] });
    const n = p.changes || 1;
    const kinds = p.kind === "both" ? ["rhythm", "pitch"] : Array.from({ length: n }, () => p.kind === "pitch" ? "pitch" : pick(["pitch", "rhythm"]));
    const L = barLen(meter);
    // 每個改變放在不同小節(不改第一個、最後一個音)
    const bars = []; const changes = [];
    const notes2 = mel.notes.map(x => ({ ...x }));
    for (const k of kinds) {
      for (let tries = 0; tries < 40; tries++) {
        const i = 1 + rnd(notes2.length - 2), nt = notes2[i], bar = Math.floor(nt.at / L);
        if (bars.includes(bar)) continue;
        if (k === "pitch") { const nd = nt.deg + pick([1, -1, 2, -2]); if (nd === notes2[i - 1].deg || nd === notes2[i + 1].deg) continue; nt.deg = nd; }
        else {   // 節奏:同一拍內換時值(四分 ↔ 附點八分 + 十六分、兩個八分 ↔ 附點八分 + 十六分)
          const nx = notes2[i + 1];
          if (!nx || Math.floor(nx.at / L) !== bar) continue;
          if (nt.len === 2) { nt.len = 1; notes2.splice(i + 1, 0, { deg: nt.deg + pick([1, -1]), at: nt.at + 1, len: 1 }); }
          else if (nt.len === 1 && nx.len === 1) { nt.len = 1.5; nx.at += 0.5; nx.len = 0.5; }
          else continue;
        }
        bars.push(bar); changes.push({ kind: k, bar }); break;
      }
    }
    if (changes.length < kinds.length && tries < 20) return GEN.change(p, sys, ctx, tries + 1);   // 放不下(樂句太短)→ 重新產生
    const mel2 = { ...mel, notes: notes2 };
    const r1 = render(mel, key, tonic, { acc: !!p.acc, vel: 66 }), r2 = render(mel2, key, tonic, { acc: !!p.acc, vel: 66 });
    let t = 0, ev = [], clicks = [];
    if (p.intro) { const it = keyChordIntro(key, tonic, tonic); ev = it.ev; t = it.dur; const c = countIn(meter, r1.beat, t); clicks = c.clicks; t += c.dur; }
    ev = ev.concat(shift(r1.ev, t)); t += r1.dur + r1.beat * 2;
    ev = ev.concat(shift(r2.ev, t)); t += r2.dur;
    changes.sort((a, b) => a.bar - b.bar);
    const barCh = Array.from({ length: p.bars }, (_, i) => ({ id: String(i + 1), label: String(i + 1) }));   // 小節號(按鈕只放數字,題目寫「第幾小節」)
    const typeCh = [ch("pitch", "音高", "Pitch"), ch("rhythm", "節奏", "Rhythm")];
    const ord = ["", "第一處", "第二處", "第三處"], ordEn = ["", "1st", "2nd", "3rd"];
    const steps = [];
    if (p.ask === "half") steps.push({ q: tr("改變在哪裡?", "Where was the change?"), choices: [ch("begin", "開頭附近", "Near the beginning"), ch("end", "結尾附近", "Near the end")], answer: changes[0].bar < p.bars / 2 ? "begin" : "end" });
    else if (p.ask === "type") steps.push({ q: tr("改了什麼?", "What changed?"), choices: typeCh, answer: changes[0].kind });
    else if (p.ask === "bars") for (const k of ["rhythm", "pitch"]) steps.push({ q: k === "rhythm" ? tr("節奏改在第幾小節?", "Bar of the rhythm change?") : tr("音高改在第幾小節?", "Bar of the pitch change?"), choices: barCh, answer: String(changes.find(c => c.kind === k).bar + 1) });
    else changes.forEach((c, i) => {
      const pre = n > 1 ? tr(ord[i + 1] + ":", ordEn[i + 1] + " change: ") : "";
      steps.push({ q: pre + tr("在第幾小節?", "Which bar?"), choices: barCh, answer: String(c.bar + 1) });
      if (p.ask === "bar+type") steps.push({ q: pre + tr("音高還是節奏?", "Pitch or rhythm?"), choices: typeCh, answer: c.kind });
    });
    return { play: { ev, clicks, dur: t }, steps, tags: [tr("彈兩次:第二次有改變", "Played twice — the 2nd time is changed")] };
  },
  /* 音程(旋律的頭兩個音、連續兩個音) */
  interval(p){
    const set = INTERVALS.filter(x => p.set.includes(x.id));
    const it = pick(set);
    const root = 55 + rnd(Math.max(1, 79 - it.st - 55));
    const down = !p.number && chance(0.25);
    const ns = down ? [root + it.st, root] : [root, root + it.st];
    const ev = ns.map((m, i) => ({ t: i * 0.75, midi: m, dur: 0.72, vel: 68 }));
    const NUM = ["", "", "二度", "三度", "四度", "五度", "六度", "七度", "八度"], NUMEN = ["", "", "2nd", "3rd", "4th", "5th", "6th", "7th", "Octave"];
    const numOf = x => ({ m2: 2, M2: 2, m3: 3, M3: 3, P4: 4, TT: 4, P5: 5, m6: 6, M6: 6, m7: 7, M7: 7, P8: 8 })[x.id];
    if (p.number) {
      const nums = [...new Set(set.map(numOf))];
      return { play: { ev, dur: 1.5 }, steps: [{ q: tr("幾度?", "Which number?"), choices: nums.map(n => ({ id: String(n), label: tr(NUM[n], NUMEN[n]) })), answer: String(numOf(it)) }] };
    }
    return { play: { ev, dur: 1.5 }, steps: [{ q: tr("什麼音程?", "Which interval?"), choices: set.map(x => ({ id: x.id, label: tr(x.zh, x.en) })), answer: it.id }] };
  },
  /* 終止式:和弦樂句,聽結尾 */
  cadence(p){
    const type = pick(p.set);
    const key = pickKey(chance(0.4), 3), tonic = tonicMidi(key.tonicPc, 60);
    const names = cadencePhrase(type);
    const vc = voiceChords(key, tonic, names);
    const intro = keyChordIntro(key, tonic, null);
    const c = chordEvents(vc, intro.dur, 0.95);
    let ev = [...intro.ev, ...c.ev], dur = intro.dur + c.dur;
    if (p.twice) { ev = ev.concat(shift(c.ev, dur + 1.2 - intro.dur)); dur += c.dur + 1.2; }
    return { play: { ev, dur }, steps: [{ q: tr("結尾是什麼終止式?", "Which cadence?"), choices: p.set.map(s => ch(s, ...CAD[s])), answer: type }],
      reveal: names.join(" – ") };
  },
  /* 和弦辨認:ABRSM 7 級兩個(I IV V V7 vi 原位);8 級三個(含轉位) */
  chords(p){
    const key = pickKey(chance(0.35), 3), tonic = tonicMidi(key.tonicPc, 60);
    let names, choices;
    if (p.n === 2) {
      names = pick([["V", "I"], ["V7", "I"], ["I", "V"], ["IV", "V"], ["vi", "V"], ["V", "vi"], ["V7", "vi"], ["IV", "I"]]);
      choices = ["I", "IV", "V", "V7", "vi"];
    } else {
      names = pick([["IV", "V", "I"], ["iib", "V", "I"], ["Ic", "V", "I"], ["ii", "V7", "I"], ["IV", "V7", "I"], ["Ib", "V", "I"], ["iib", "V7", "I"],
        ["I", "IV", "V"], ["IV", "Ic", "V"], ["ii", "Ic", "V"], ["vi", "iib", "V"], ["IV", "V", "vi"], ["Ic", "V", "vi"], ["iib", "V7", "vi"], ["vi", "IV", "I"], ["Ib", "IV", "I"], ["I", "Vb", "I"]]);
      choices = ROMAN_ALL;
    }
    const vc = voiceChords(key, tonic, names);
    const intro = keyChordIntro(key, tonic, null);
    const c = chordEvents(vc, intro.dur + 0.4, 1.3);
    let ev = [...intro.ev, ...c.ev], dur = intro.dur + 0.4 + c.dur;
    if (p.n === 3) vc.forEach(v => { const e = chordEvents([v], dur + 1.0, 1.6); ev = ev.concat(e.ev); dur += 1.0 + 1.6; });   // 8 級:再一個一個彈
    const lab = n => ({ id: n, label: n.replace(/b$/, "b").replace("V7", "V⁷") });
    return { play: { ev, dur }, steps: names.map((n, i) => ({ q: tr(`第 ${i + 1} 個和弦?`, `Chord ${i + 1}?`), choices: choices.map(lab), answer: n })),
      tags: [pcName(key.tonicPc) + (key.minor ? tr(" 小調", " minor") : tr(" 大調", " major"))] };
  },
  /* 轉調:屬調、下屬調、關係調 */
  modulation(p){
    const start = pick(p.starts), key = pickKey(start === "minor", 3), tonic = tonicMidi(key.tonicPc, 58);
    const target = pick(p.targets);
    const segs = modulation(key, tonic, target);
    const intro = keyChordIntro(key, tonic, null);
    let ev = [...intro.ev], t = intro.dur + 0.3;
    for (const s of segs) { const c = chordEvents(voiceChords(s.key, s.tonic, s.names), t, 0.85); ev = ev.concat(c.ev); t += c.dur; }
    const rel = key.minor ? ["關係大調", "Relative major"] : ["關係小調", "Relative minor"];
    const L = { ...MOD, relative: rel };
    return { play: { ev, dur: t }, steps: [{ q: tr("轉到哪裡?", "Modulates to?"), choices: p.targets.map(x => ch(x, ...L[x])), answer: target }],
      tags: [tr("從 ", "From ") + pcName(key.tonicPc) + (key.minor ? tr(" 小調", " minor") : tr(" 大調", " major"))] };
  }
};

/* 節拍鍵的判斷:pulse = 拍子穩、速度對;rhythm = 數量對、相對時值對(容許整體快慢不同) */
export function judgeTaps(tap, times){
  if (tap.kind === "pulse") {
    if (times.length < 5) return { ok: false, msg: tr("至少按 5 下", "Tap at least 5 times") };
    const iv = times.slice(1).map((x, i) => x - times[i]);
    const s = [...iv].sort((a, b) => a - b), med = s[s.length >> 1];
    const ratio = med / tap.beat;
    const steady = iv.filter(x => Math.abs(x - med) / med < 0.2).length / iv.length;
    const right = [1, 2, 0.5].some(k => Math.abs(ratio - k) / k < 0.12);
    const ok = right && steady >= 0.75;
    return { ok, msg: ok ? tr(`穩定度 ${Math.round(steady * 100)}%`, `Steadiness ${Math.round(steady * 100)}%`)
      : !right ? tr("速度跟音樂不一致", "Tempo doesn't match the music") : tr(`不夠穩(${Math.round(steady * 100)}%)`, `Not steady enough (${Math.round(steady * 100)}%)`) };
  }
  if (times.length !== tap.n) return { ok: false, msg: tr(`按了 ${times.length} 下,應該是 ${tap.n} 下`, `${times.length} taps — expected ${tap.n}`) };
  const iv = times.slice(1).map((x, i) => x - times[i]);
  const sc = iv.reduce((a, b) => a + b, 0) / tap.iois.reduce((a, b) => a + b, 0);
  const bad = iv.findIndex((x, i) => Math.abs(x / sc - tap.iois[i]) > Math.max(0.35 * tap.iois[i], 0.09));
  return bad < 0 ? { ok: true, msg: tr("節奏正確", "Rhythm correct") } : { ok: false, msg: tr(`第 ${bad + 2} 下的時間不對`, `Tap ${bad + 2} is off`) };
}
/* 鍵盤回答:每個音都對(octaveOk:整段高或低八度也算對) */
export function judgeKeys(k, played){
  if (played.length < k.target.length) return null;
  if (k.pcOnly) { const ok = played.every((m, i) => (m - k.target[i]) % 12 === 0); return { ok, firstWrong: ok ? -1 : 0 }; }
  const same = played.every((m, i) => m === k.target[i]);
  const off = played[0] - k.target[0];
  const oct = k.octaveOk && off % 12 === 0 && played.every((m, i) => m - k.target[i] === off);
  const firstWrong = played.findIndex((m, i) => m - off !== k.target[i]);
  return { ok: same || oct, firstWrong };
}
export { MAJOR };
