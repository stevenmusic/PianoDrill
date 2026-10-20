/* 技巧模組(原 FingerDrill):音階 / 琶音 / 哈農 / 檢定抽考,練習面板(題目、樂譜、節拍器)共用。
   外框(js/main.js)負責頂欄、分頁、考試系統與級數;這裡的元素 id 都加 "t-" 前綴 */
import * as store from "./store.js";
import { gradeOf, questionsFor, applyFilter, drawQuestion, CATEGORIES, masteryKey, UNIT_SYM, NOTES_PER_UNIT } from "./syllabus.js";
import { buildExercise, questionText } from "./exercise.js";
import { exerciseToMusicXML, playbackEvents, melodyEvents } from "./musicxml.js";
import { noteLabelStr } from "./theory.js";
import { hanonThirdsKey } from "./fingering.js";
import { tr, scoped, getLang, pairText, unpair } from "../shared/i18n.js";
import * as audio from "../shared/audio.js";
import { addLog, cleanLog, renderLog as paintLog, today, nextGoal, cleanGoal } from "../shared/practicelog.js";
import { createDaily, clickPlays } from "../shared/daily.js";
import { createDailyCard } from "../shared/dailycard.js";
import { ROUTES, WARM_LEVELS, warmFor, findLevel, KEYS, adaptVary, keyLearned } from "./routes.js";
import { paintNoteNames } from "../shared/notenames.js";
import { sameBars, fingerMarks, barChords, chordTable, handPositions, chordName, keyInfo } from "./patterns.js";
import "./strings.js";
const T = scoped("tech");

const $ = id => document.getElementById("t-" + id);
const ROOT = document.getElementById("mod-tech");
let active = false, ctx = null;
const S = store.load();
let SY = null, FG = null;
const tabCur = {};       // 每個分頁目前的題目
let cur = null, ex = null, show = "both", lastKey = null;
let dseg = null;   // 今日練習目前顯示的段落(下面「今日練習」一段)
let bpm = 60;
let osmd = null;

/* 語言切換(外框通知):只重寫文字(不停止播放、不重畫樂譜;照 DrumDrill 技巧的 relabel)——
   選擇器、本級要求、題目、標籤、說明、速度、按鈕、暫時訊息、紀錄卡;檢定清單 */
export function relang(){
  if (!SY) return;
  if (S.exam) renderExam();
  if (active) relabel();
  renderLog();
}
function relabel(){
  const tab = S.tab;
  if (tab === "scale" || tab === "arp" || tab === "hanon") renderPicker(tab);
  dcard.relang(dseg);
  if (cur) { renderQText(cur, dseg ? "daily" : tab); fitTitle(); }
  else emptyText();
  syncTempoUI();
  $("playLabel").textContent = play ? T("stop") : starting ? tr("準備中…", "Preparing…") : T("play");
  remsg();
  syncQuizTop();
}
/* 暫時訊息(載入中、載入失敗、繪製失敗):記住產生文字的函式,換語言時重寫 */
const msgs = {};
function setMsg(id, fn){ msgs[id] = fn || null; $(id).textContent = fn ? fn() : ""; }
function remsg(){ for (const id in msgs) if (msgs[id]) $(id).textContent = msgs[id](); }

/* 雙音音階的指法說明(fingering.js 照哈農第 48、52 首) */
function doubleNote(q){
  if (q.articulation === "staccato") return q.type === "thirds"
    ? () => tr("斷奏三度照哈農第 48 首:右手 2–4、左手 4–2(原譜是 C 大調,其他調用同一個指法)。", "Staccato thirds follow Hanon No. 48: RH 2–4, LH 4–2 (printed in C; same fingering in every key).")
    : () => tr("斷奏六度照哈農第 48 首:右手 1–5、左手 5–1(原譜是 C 大調,其他調用同一個指法)。", "Staccato sixths follow Hanon No. 48: RH 1–5, LH 5–1 (printed in C; same fingering in every key).");
  if (q.type === "sixths") return () => tr("哈農沒有圓滑六度音階,所以不標指法,請照老師指定的。", "Hanon has no legato sixths scale, so no fingering is shown; use your teacher's.");
  if (!hanonThirdsKey(q.quality, q.tonic, q.form)) return () => tr("哈農第 52 首只有 C G D A E F B♭ E♭ A♭ 大調與 A D G 和聲小調,這個調沒有,所以不標指法,請照老師指定的。", "Hanon No. 52 only covers C G D A E F B♭ E♭ A♭ major and A D G harmonic minor, so no fingering is shown here; use your teacher's.");
  return q.octaves >= 2 ? () => tr("三度指法照哈農第 52 首逐調照抄(原譜沒印、又推不出來的留空)。", "Thirds fingering copied from Hanon No. 52 key by key (blank where Hanon prints none).")
    : () => tr("三度指法照哈農第 52 首;原譜是兩個八度,一個八度用其中一個八度的指法。", "Thirds fingering from Hanon No. 52, which is two octaves; one octave uses one of its octaves.");
}
function segBind(el, get, set){
  const seg = typeof el === "string" ? $(el) : el;
  const sync = () => seg.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === String(get()))));
  seg.onclick = e => { const b = e.target.closest("button"); if (!b || b.disabled) return; set(b.dataset.v); sync(); };
  sync();
  return sync;
}

/* ══ 音階 / 琶音 選擇器 ══ */
const MAJ_KEYS = ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"];
const MIN_KEYS = ["A", "E", "B", "F#", "C#", "G#", "Eb", "Bb", "F", "C", "G", "D"];
const STARTS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const keyOpts = list => list.map(k => [k, noteLabelStr(k)]);
const HANDS = () => [["RH", tr("右手", "RH")], ["LH", tr("左手", "LH")], ["HT", tr("雙手", "Both")]];
const ARTS = () => [["legato", tr("圓滑奏", "Legato")], ["staccato", tr("斷奏", "Staccato")]];
const OCTS = n => [1, 2, 3, 4].slice(0, n).map(o => [o, tr(o + " 個八度", o + " oct.")]);
/* 級數名稱:初級 / 1 級(Initial / Grade 1) */
const gradeLabel = g => ctx.gradeLabel(g.grade, S.exam.system);   // 級數名稱只留外框一份(D3)

// 拍點:♪ = 每 2 個音打一下(預設)、♩ = 每 4 個音(一拍)打一下;樂譜不變,只換節拍器的拍點與速度數字
const HANON_NOS = () => Array.from({ length: 20 }, (_, i) => [i + 1, String(i + 1)]);   // 第 1–20 首(第 39、41 首的音階、琶音在音階/琶音分頁,指法照它們核對)
const PULSE = () => ["pulse", tr("拍點", "Click"), [["e", tr("每 2 個音響一下", "Every 2 notes")], ["q", tr("每 4 個音響一下", "Every 4 notes")]]];
const PICKERS = {
  scale: {
    // 第一次進來(自由練習)= 初學者看得懂的:C 大調、右手、一個八度(檢定頁照大綱,不受影響)
    defaults: { kind: "major", form: "harmonic", motion: "similar", key: "C", octaves: 1, hands: "RH", art: "legato", pulse: "e" },
    rows: p => {
      const tonal = p.kind === "major" || p.kind === "minor";
      const SIM = ["similar", tr("同向", "Similar")], CON = ["contrary", tr("反向", "Contrary")];
      const motions = tonal ? [SIM, CON, ["apart3", tr("相隔三度", "3rd apart")], ["apart6", tr("相隔六度", "6th apart")], ["thirds", tr("三度雙音", "In 3rds")], ["sixths", tr("六度雙音", "In 6ths")]]
        : p.kind === "chromatic" ? [SIM, CON] : [SIM];
      const double = p.motion === "thirds" || p.motion === "sixths";
      const maxOct = p.motion === "contrary" || double ? 2 : 4;
      const hands = double ? HANDS().slice(0, 2) : p.motion === "similar" ? HANDS() : HANDS().slice(2);
      return [
        ["kind", tr("種類", "Type"), [["major", tr("大調", "Major")], ["minor", tr("小調", "Minor")], ["chromatic", tr("半音階", "Chromatic")], ["wholetone", tr("全音音階", "Whole-tone")]]],
        p.kind === "minor" && ["form", tr("小調", "Minor"), [["harmonic", tr("和聲", "Harmonic")], ["melodic", tr("旋律", "Melodic")], ["natural", tr("自然", "Natural")]]],
        ["motion", tr("進行", "Motion"), motions],
        ["key", tonal ? tr("調", "Key") : tr("起音", "Start"), keyOpts(p.kind === "major" ? MAJ_KEYS : p.kind === "minor" ? MIN_KEYS : STARTS)],
        ["octaves", tr("範圍", "Range"), OCTS(maxOct)],
        ["hands", tr("手", "Hands"), hands],
        ["art", tr("奏法", "Touch"), ARTS()],
        PULSE()
      ].filter(Boolean);
    },
    toQ: p => {
      const q = { hands: p.hands, octaves: p.octaves, articulation: p.art, motion: "similar" };
      if (p.kind === "chromatic") Object.assign(q, { type: "chromatic", tonic: p.key, lhStart: p.key, rhStart: p.key, motion: p.motion, cat: "chromatic" });
      else if (p.kind === "wholetone") Object.assign(q, { type: "wholetone", tonic: p.key, cat: "wholetone" });
      else {
        Object.assign(q, { tonic: p.key, quality: p.kind, form: p.kind === "minor" ? p.form : null });
        if (p.motion === "thirds" || p.motion === "sixths") Object.assign(q, { type: p.motion, cat: "double" });
        else if (p.motion === "apart3" || p.motion === "apart6") Object.assign(q, { type: "scale", apart: p.motion === "apart3" ? 3 : 6, cat: "apart" });
        else Object.assign(q, { type: "scale", motion: p.motion, cat: p.motion === "contrary" ? "contrary" : "scale" });
      }
      return q;
    }
  },
  arp: {
    defaults: { kind: "major", inv: 0, key: "C", octaves: 2, hands: "RH", art: "legato", pulse: "e" },   // 第一次:右手
    rows: p => [
      ["kind", tr("種類", "Type"), [["major", tr("大三和弦", "Major")], ["minor", tr("小三和弦", "Minor")], ["dom7", tr("屬七", "Dom. 7th")], ["dim7", tr("減七", "Dim. 7th")], ["broken", tr("分解和弦", "Broken")]]],
      (p.kind === "major" || p.kind === "minor") && ["inv", tr("轉位", "Position"), [[0, tr("原位", "Root")], [1, tr("第一轉位", "1st inv.")], [2, tr("第二轉位", "2nd inv.")]]],
      ["key", p.kind === "dim7" ? tr("起音", "Start") : tr("調", "Key"), keyOpts(p.kind === "minor" ? MIN_KEYS : p.kind === "dim7" ? STARTS : MAJ_KEYS)],
      ["hands", tr("手", "Hands"), HANDS()],
      ["art", tr("奏法", "Touch"), ARTS()],
      p.kind !== "broken" && PULSE()   // 分解和弦是三連音,一拍(三個音)打一下
    ].filter(Boolean),
    toQ: p => {
      const q = { hands: p.hands, octaves: 2, articulation: p.art, motion: "similar", tonic: p.key };   // 自由練習的琶音一律兩個八度(2026-10 第二輪;不給範圍選項,檢定照大綱);分解和弦另外設一個八度
      if (p.kind === "major" || p.kind === "minor") Object.assign(q, { type: "arpeggio", quality: p.kind, inversion: Number(p.inv), cat: "arpeggio" });
      else if (p.kind === "broken") Object.assign(q, { type: "broken", quality: "major", cat: "broken", octaves: 1 });   // 照 Trinity 1 級:一個八度、三連音
      else Object.assign(q, { type: p.kind, quality: "major", cat: "seventh" });
      return q;
    }
  },
  /* 哈農:曲目 1–20、調(12 個大調,同一個樣式移調)、手 */
  hanon: {
    defaults: { no: 1, key: "C", hands: "HT", rhythm: "even", pulse: "q", moreKeys: false, octaves: 2 },
    rows: p => [
      ["no", tr("曲目", "No."), HANON_NOS()],
      // 音域:原譜兩個八度;一個八度 = 上行、下行各少 7 小節(使用者要求)
      ["octaves", tr("音域", "Range"), [[2, tr("2 個八度", "2 oct.")], [1, tr("1 個八度", "1 oct.")]]],
      // 調:預設只有原譜的 C 大調;「其他調」展開 12 個調(進階,指法照 C 大調原譜)
      ["key", tr("調", "Key"), p.moreKeys || p.key !== "C" ? keyOpts(MAJ_KEYS).concat([["__less", tr("收起", "Less")]])
        : [["C", tr("C(原譜)", "C (orig.)")], ["__more", tr("其他調…", "Other keys…")]]],
      ["hands", tr("手", "Hands"), HANDS()],
      ["rhythm", tr("節奏", "Rhythm"), [["even", tr("平均", "Even")], ["dotted", tr("附點", "Dotted")], ["reverse", tr("反附點", "Rev. dotted")]]],
      // 拍點:♩ = 每 4 個音一拍(原譜的速度記法)、♪ = 每 2 個音一拍(比較好數;樂譜不變,速度數字 ×2)
      PULSE()   // 跟音階、琶音同一個順序(♪ 每 2 音 → ♩ 每 4 音);哈農預設仍是 ♩
    ],
    toQ: p => ({ type: "hanon", no: Number(p.no), tonic: p.key, hands: p.hands, rhythm: p.rhythm, octaves: Number(p.octaves) === 1 ? 1 : 2, quality: "major", articulation: "legato", motion: "similar", cat: "hanon" })
  }
};
S.pick = S.pick || {};
for (const t of ["scale", "arp", "hanon"]) S.pick[t] = { ...PICKERS[t].defaults, ...(S.pick[t] || {}) };
S.freeBpm = { scale: 60, arp: 60, hanon: 60, broken: 50, ...(S.freeBpm || {}) };
S.hanonBest = S.hanonBest || {};   // 哈農每首(不分調)練過的最高速度
const paneOf = tab => $(tab === "scale" ? "paneScale" : tab === "arp" ? "paneArp" : "paneHanon");

function renderPicker(tab){
  const pane = paneOf(tab), p = S.pick[tab], cfg = PICKERS[tab];
  // 選項不再合法時退回第一個(改了一列可能影響其他列,跑兩次)
  for (let pass = 0; pass < 2; pass++) for (const [k, , opts] of cfg.rows(p)) if (!opts.some(o => String(o[0]) === String(p[k]))) p[k] = opts[0][0];
  // 「手」不放在選單:譜卡上的右手 / 左手 / 雙手直接換題目(syncHandSeg);這裡的列只用來決定哪幾隻手可以選
  pane.querySelector(".rows").innerHTML = cfg.rows(p).filter(r => r[0] !== "hands").map(([k, lbl, opts]) =>
    `<div class="prow"><span class="lbl">${lbl}</span><div class="opts" data-k="${k}">` +
    opts.map(([v, t]) => `<button class="opt" data-v="${v}" aria-pressed="${String(v) === String(p[k])}">${t}</button>`).join("") + `</div></div>`).join("");
  // 收起來的一行只寫題目卡(標題、標籤)沒有的:題目名稱、手、範圍、奏法都已經在題目卡上 → 只寫「換題目」+ 拍點
  const pr = cfg.rows(p).find(r => r && r[0] === "pulse"), pv = pr && pr[2].find(o => o[0] === p.pulse);
  pane.querySelector(".sum").textContent = [tr("選題目", "Choose"), pv ? tr("拍點:", "Click ") + (getLang() === "en" ? pv[1].toLowerCase() : pv[1]) : ""].filter(Boolean).join(" · ");
  renderQuick(tab);
  syncHandAllowed();
}
for (const tab of ["scale", "arp", "hanon"]) {
  paneOf(tab).querySelector(".rows").onclick = e => {
    const b = e.target.closest(".opt"); if (!b) return;
    const k = b.closest(".opts").dataset.k;
    if (b.dataset.v === "__more" || b.dataset.v === "__less") {   // 哈農:展開 / 收起其他調(收起時回到原譜的 C)
      const more = b.dataset.v === "__more";
      S.pick[tab].moreKeys = more; if (!more) S.pick[tab].key = "C";
      store.save(); renderPicker(tab); if (!more) loadFree(tab); return;
    }
    S.pick[tab][k] = ["octaves", "inv", "no"].includes(k) ? Number(b.dataset.v) : b.dataset.v;
    store.save(); renderPicker(tab); loadFree(tab);
  };
}
function freeQuestion(tab){
  const q = PICKERS[tab].toQ(S.pick[tab]);
  // 哈農:S.freeBpm.hanon 一律記 ♩ 的速度;拍點選 ♪ 時顯示 ×2
  const eighth = tab === "hanon" && S.pick.hanon.pulse === "e";
  // 音階、琶音:S.freeBpm 一律記 ♪(每 2 音)的速度;拍點選 ♩ 時顯示 ÷2
  const beat4 = tab !== "hanon" && S.pick[tab].pulse === "q";
  q.tempo = tab === "hanon" ? { unit: eighth ? "e16" : "q16", bpm: S.freeBpm[tab] * (eighth ? 2 : 1) }
    : { unit: beat4 ? "q16" : "q", bpm: beat4 ? Math.max(30, Math.round(S.freeBpm[tab] / 2)) : S.freeBpm[tab] };
  q.free = true;
  if (q.type === "broken") { q.tempo = { unit: "q.", bpm: S.freeBpm.broken || 50 }; q.sub = 3; q.key = masteryKey(q); return q; }   // 分解和弦照 Trinity:♩. = 50、三連音
  q.sub = tab === "hanon" ? 4 : 2;
  q.key = tab === "hanon" ? `hanon|${q.no}|${q.tonic}${q.quality === "minor" ? "m" : ""}|${q.hands}|${q.rhythm}${q.octaves === 1 ? "|1" : ""}` : masteryKey(q);
  return q;
}
function loadFree(tab){ setQuestion(freeQuestion(tab), tab); }

/* 準備考試時:音階/琶音分頁上方先列出這一級的要求(可收起) */
const TAB_CATS = { scale: ["scale", "contrary", "apart", "double", "chromatic", "wholetone"], arp: ["arpeggio", "seventh", "broken"] };
function examQuestions(){
  if (!S.exam) return [];
  const g = gradeOf(SY, S.exam.system, S.exam.grade);
  return g ? questionsFor(SY, S.exam.system, g, { minorForm: S.minorForm, set: S.exam.set }) : [];
}
function renderQuick(tab){
  const box = paneOf(tab).querySelector(".quick");
  if (!S.exam || S.exam.auto || tab === "hanon") { box.hidden = true; return; }
  const sys = SY.systems[S.exam.system], g = gradeOf(SY, S.exam.system, S.exam.grade);
  const qs = examQuestions().filter(q => TAB_CATS[tab].includes(q.cat));
  box.hidden = false;
  const on = S.quickOpen === true;   // 預設收起:從檢定分頁回來時,題目不會被一整塊清單往下推(使用者反映)
  box.innerHTML = `<div class="qhead"><b>${sys.name} ${gradeLabel(g)}${sys.mode === "sets" ? " " + setName(S.exam.set) : ""}</b>${tr("的要求", "")}(${qs.length})` +
    `<button class="chip" aria-pressed="${on}">${on ? tr("收起", "Hide") : tr("展開", "Show")}</button></div>` +
    (on ? `<div class="opts">` + (qs.length ? qs.map((q, i) => `<button class="opt" data-i="${i}" aria-pressed="${!!(cur && !cur.free && cur.key === q.key)}"><i class="dot ${S.mastery[q.key] || ""}"></i><span>${shortLabel(q)}</span></button>`).join("") : `<span class="lbl">${tr("這一級沒有這類項目", "None at this grade")}</span>`) + `</div>` : "");
  box.onclick = e => {
    if (e.target.closest(".chip")) { S.quickOpen = !on; store.save(); renderQuick(tab); return; }
    const b = e.target.closest(".opt[data-i]"); if (!b) return;
    setQuestion(qs[Number(b.dataset.i)], tab);
  };
}
function shortLabel(q){
  const t = questionText(q);
  const hand = q.hands === "RH" ? tr(" 右", " RH") : q.hands === "LH" ? tr(" 左", " LH") : "";
  // 英文比較長:快速清單用縮寫,行數才會跟中文一樣
  const name = getLang() === "en" ? t[0].replace(/ scale$/, "").replace("harmonic minor", "harm. minor").replace("melodic minor", "mel. minor").replace(" arpeggio", " arp.") : t[0];
  return name + hand + (q.articulation === "staccato" ? tr(" 斷", " stacc.") : "");
}
const setName = k => tr(k + " 組", "Set " + k);
function sourceText(g){ return getLang() === "en" && g.sourceEn ? g.sourceEn : g.source;
}
/* 短出處:ABRSM 2025–2028 p.29 / Trinity 2023 p.31(頁碼從 sourceEn 取) */
function shortSource(g){
  const m = /p\. ?([\d–-]+)/.exec(g.sourceEn || "") || [], page = m[1] ? " p." + m[1] : "";
  return (S.exam.system === "abrsm" ? "ABRSM 2025–2028" : "Trinity 2023") + page;
}

/* ══ 檢定分頁 ══ */
function examGrade(){ return gradeOf(SY, S.exam.system, S.exam.grade); }
// 只是點進檢定分頁看看(沒選考試、級數):auto = true,不算在準備考試,音階/琶音分頁不會多出「本級要求」(使用者反映題目被往下推)
function ensureExam(){ if (!S.exam) S.exam = { system: "abrsm", grade: 1, set: "A", auto: true }; }
function filterObj(){ return { quality: S.filter.quality, cats: new Set(S.filter.cats), excludeMastered: S.filter.excludeMastered }; }
function examPool(){
  if (!S.exam) return [];
  const sys = SY.systems[S.exam.system];
  return sys.mode === "sets" ? examQuestions().filter(q => !(S.filter.excludeMastered && S.mastery[q.key] === "good")) : applyFilter(examQuestions(), filterObj(), S.mastery);
}
function renderExam(){
  ensureExam();
  const sys = SY.systems[S.exam.system], g = examGrade(), sets = sys.mode === "sets";
  syncSetSeg(); syncQualitySeg();
  $("fSet").hidden = !sets; $("fQuality").hidden = sets; $("fCats").hidden = sets;
  syncMinorSeg();
  const present = new Set(examQuestions().map(q => q.cat));
  // 新的分類(例如雙音音階)第一次出現時預設選上
  for (const c of present) if (!S.filter.cats.includes(c) && !(S.filter.seen || []).includes(c)) S.filter.cats.push(c);
  S.filter.seen = [...new Set([...(S.filter.seen || []), ...present])];
  $("catChips").innerHTML = CATEGORIES.filter(c => present.has(c.id)).map(c =>
    `<button class="chip" data-cat="${c.id}" aria-pressed="${S.filter.cats.includes(c.id)}">${tr(c.zh, c.en)}</button>`).join("");
  $("excludeMastered").setAttribute("aria-pressed", String(S.filter.excludeMastered));
  // 資料來源一行:「ABRSM 2025–2028 p.29」(完整書名在 licenses.html;核對紀錄對使用者沒意義,只有還沒核對時才寫)
  pairText($("verifyNote"), () => shortSource(g) + (g.verified ? "" : " · " + tr("尚未核對", "not yet checked")));
  // 考試系統、級數在外框的檢定設定卡;這裡只寫抽考的設定(Trinity 哪一組、範圍有幾題)
  $("examSummary").textContent = tr("抽考範圍", "Include") + " · " + tr(`${examPool().length} 題`, `${examPool().length} items`);   // Trinity 哪一組:組別鈕亮著(不重複)
  renderList();
  if (S.tab === "exam") syncExamButtons();
}
const syncSetSeg = segBind("setSeg", () => S.exam ? S.exam.set : "A", v => { ensureExam(); S.exam.set = v; store.save(); onExamChange(); });
const syncQualitySeg = segBind("qualitySeg", () => S.filter.quality, v => { S.filter.quality = v; store.save(); renderExam(); });
const syncMinorSeg = segBind("minorSeg", () => S.minorForm, v => { S.minorForm = v; store.save(); onExamChange(true); });   // 小調形式:三顆按鈕(不用下拉)
$("catChips").onclick = e => {
  const b = e.target.closest("[data-cat]"); if (!b) return;
  const c = b.dataset.cat, on = S.filter.cats.includes(c);
  S.filter.cats = on ? S.filter.cats.filter(x => x !== c) : S.filter.cats.concat(c);
  store.save(); renderExam();
};
$("excludeMastered").onclick = () => { S.filter.excludeMastered = !S.filter.excludeMastered; store.save(); renderExam(); };
/* 外框改了考試系統/級數(exam.auto = 還沒選考試,只是點進檢定分頁看看) */
export function setExam(ex){
  S.exam = { set: "A", ...(S.exam || {}), system: ex.system, grade: ex.grade, auto: !!ex.auto };
  if (!ex.auto) delete S.exam.auto;
  store.save();
  if (SY) onExamChange();
}
function onExamChange(keepCur){
  mock = null;
  if (ctx) ctx.examChanged();
  renderExam(); renderQuick("scale"); renderQuick("arp");
  if (S.tab === "exam") {
    const same = keepCur && cur && !cur.free && examQuestions().find(q => q.itemId === cur.itemId && q.tonic === cur.tonic && q.hands === cur.hands && q.articulation === cur.articulation);
    if (same) setQuestion(same, "exam"); else { tabCur.exam = null; showEmpty(); }
  }
}
function syncExamButtons(){
  const sets = SY.systems[S.exam.system].mode === "sets";
  // 題目卡最後一行右邊只有一顆主要按鈕(畫面設計 2026-10):沒題目 / ABRSM = 隨機抽考;Trinity 出了題目 = 下一題;模擬考 = 下一題 / 結束。模擬考鈕在本項列
  $("drawBtn").hidden = !!mock || (sets && !!cur); $("drawLabel").textContent = sets ? tr("隨機抽一項", "Random") : tr("隨機抽考", "Random");
  $("nextBtn").hidden = !mock && !(sets && cur);
  $("nextBtn").classList.add("primary");
  $("nextLabel").textContent = mock && mock.i === mock.list.length - 1 ? tr("結束", "Finish") : T("next");
  $("drawBtn").disabled = examPool().length === 0;
  $("mockBtn").hidden = false; $("mockBtn").disabled = !mock && examQuestions().length === 0;
  $("mockLabel").textContent = mock ? tr("停止", "Stop") : tr("模擬考", "Mock");
  $("mockBtn").title = $("mockBtn").ariaLabel = mock ? tr("停止模擬考", "Stop mock exam") : tr("模擬考", "Mock exam");
  syncQuizTop();
}
/* ══ 模擬考 ══
   ABRSM:從抽考範圍隨機點 8 項(不重複,像考官點題);Trinity:整組依序。每一項自己按 ✓ / ⚠,最後給結果 */
let mock = null;
function shuffle(a){ for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
$("mockBtn").onclick = () => {
  if (mock) { mock = null; showEmpty(); syncExamButtons(); return; }
  const sets = SY.systems[S.exam.system].mode === "sets";
  let list = sets ? examQuestions() : shuffle(examPool().slice());
  if (!sets) { const seen = new Set(); list = list.filter(q => { const k = q.itemId + q.tonic; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8); }
  if (!list.length) return;
  mock = { list, i: 0 };
  setQuestion(list[0], "exam"); syncExamButtons();
};
function finishMock(){
  const list = mock.list; mock = null;
  const n = list.length, good = list.filter(q => S.mastery[q.key] === "good").length, weak = list.filter(q => S.mastery[q.key] === "weak").length;
  showEmpty(); syncExamButtons();
  emptyTitle = () => tr(`模擬考:${n} 項會了 ${good} 項`, `Mock: ${good} of ${n} got it`) + (weak ? tr(`、再練 ${weak} 項`, `, ${weak} need work`) : "");
  pairText($("qTitle"), emptyTitle);
  syncQuizTop();
}
$("drawBtn").onclick = () => { const q = drawQuestion(examPool(), S.mastery, lastKey); if (q) setQuestion(q, "exam"); };
$("nextBtn").onclick = () => {
  if (mock) {
    if (mock.i >= mock.list.length - 1) { finishMock(); return; }
    mock.i++; setQuestion(mock.list[mock.i], "exam"); syncExamButtons(); return;
  }
  const qs = examQuestions(); if (!qs.length) return;
  const i = cur && !cur.free ? qs.findIndex(q => q.key === cur.key && q.itemId === cur.itemId) : -1;
  setQuestion(qs[(i + 1) % qs.length], "exam");
};
function renderList(){
  const sys = SY.systems[S.exam.system], qs = examQuestions();
  const good = qs.filter(q => S.mastery[q.key] === "good").length;
  $("listTitle").textContent = sys.mode === "sets" ? tr("本級要求(依序)", "This grade (in order)") : T("listTitle");   // 哪一組:組別鈕亮著
  $("listSub").textContent = "";   // 「會了 n/m」在本項列(不重複)
  $("progressBar").style.width = (qs.length ? 100 * good / qs.length : 0) + "%";
  paintItemTag();
  const row = (q, i) => {
    const m = S.mastery[q.key] || "", hands = q.motion === "contrary" ? tr("反向", "contrary") : { RH: tr("右手", "RH"), LH: tr("左手", "LH"), HT: tr("雙手", "Both") }[q.hands];
    const extra = [hands, q.range === "5th" ? tr("五度", "5th") : tr(q.octaves + " 個八度", q.octaves + " oct.")];
    if (q.dynamic) extra.push({ "cresc-dim": "p–f–p" }[q.dynamic] || q.dynamic);
    return `<button class="qrow${cur && !cur.free && cur.key === q.key ? " cur" : ""}" data-i="${i}"><i class="dot ${m}"></i><span>${questionText(q)[0]}${q.articulation === "staccato" ? tr("(斷奏)", " (staccato)") : ""}</span><small>${extra.join(" · ")}</small></button>`;
  };
  if (sys.mode === "sets") $("qGroups").innerHTML = `<div class="qlist">${qs.map(row).join("")}</div>`;
  else $("qGroups").innerHTML = CATEGORIES.map(c => {
    const list = qs.map((q, i) => [q, i]).filter(([q]) => q.cat === c.id);
    return list.length ? `<div class="group"><h3>${tr(c.zh, c.en)}</h3><div class="qlist">${list.map(([q, i]) => row(q, i)).join("")}</div></div>` : "";
  }).join("");
}
$("qGroups").onclick = e => {
  const b = e.target.closest("[data-i]"); if (!b) return;
  setQuestion(examQuestions()[Number(b.dataset.i)], "exam");
  $("quizCard").scrollIntoView({ behavior: "smooth", block: "start" });
};

/* ══ 分頁切換 ══ */
function switchTab(tab){
  stopPlayback();
  S.tab = tab; store.save();
  ROOT.querySelectorAll(".pane").forEach(p => p.hidden = p.dataset.pane !== tab);
  if (tab !== "exam") mock = null;
  $("drawBtn").hidden = true; $("nextBtn").hidden = true; $("mockBtn").hidden = true;
  $("dailyCard").hidden = tab === "exam"; if (tab !== "exam") dcard.render();
  if (tab === "scale" || tab === "arp" || tab === "hanon") { renderPicker(tab); setQuestion(tabCur[tab] || freeQuestion(tab), tab); }
  else if (tab === "exam") { renderExam(); syncExamButtons(); if (tabCur.exam) setQuestion(tabCur.exam, "exam"); else showEmpty(); }
  window.scrollTo({ top: 0 });
  syncQuizTop();
}
/* 外框:顯示 / 離開這個模組 */
export function enter(tab){
  active = true;
  // 「今日」(子項目第一格;畫面設計 2026-10):只有今日練習卡 + 練習紀錄,開始後照舊(子項目列換成今日練習那一行,題目卡、譜卡、速度卡)。
  // 模組裡的子項目照舊是最後一次自由練習的那一類(S.tab);其他子項目 = 自由練習,不顯示今日練習卡(app.css 的 .today-view)
  const today = tab === "today";
  ROOT.classList.toggle("today-view", today);
  if (today) tab = ["scale", "arp", "hanon"].includes(S.tab) ? S.tab : "scale";
  // 今日練習的段落:從別的分頁回來照原樣;點了子項目(外框把分段鈕亮回來)或到檢定頁 = 暫停,回到一般畫面(卡片寫「繼續今天的練習」)
  if (dseg) {
    if (tab === "exam" || (ctx && ctx.subActive && ctx.subActive("tech"))) dExit();
    else { requestAnimationFrame(onStageResize); return; }
  }
  switchTab(tab); requestAnimationFrame(onStageResize);
}
export function leave(){ active = false; stopPlayback(); }

/* 題目上方那一列(官方大綱標記、抽考範圍、抽考按鈕)沒東西就整列收掉;樂譜還沒畫就留一塊放提示字。用 JS 判斷,不靠 CSS :has */
function syncQuizTop(){
  ROOT.classList.toggle("exam-empty", S.tab === "exam" && !cur);
  $("quizCard").classList.toggle("hint-empty", S.tab === "exam" && !cur && !emptyTitle);   // 還沒選題目:一行淡色提示 + 最下面一列按鈕(app.css 的 .quiz.hint-empty);模擬考結果照舊用大標題
  // 檢定頁還沒抽題:▶ 與「會了 / 再練」藏起來(沒有東西可以播、可以標)
  $("playBtn").hidden = S.tab === "exam" && !cur;
  ROOT.querySelector(".mastery").hidden = (S.tab === "exam" && !cur) || !!dseg;   // 今日練習每一段(含暖身)都不標熟練度(段落用「做到了 / 還要練」)   // 檢定頁還沒選題目:藏起譜卡與速度卡,本級要求放在題目卡正下方
  const top = ROOT.querySelector(".quiz-top");
  const empty = ROOT.querySelector(".mastery").hidden && !$("poolCount").textContent.trim() && [...top.querySelectorAll(".q-actions button")].every(b => b.hidden);
  top.classList.toggle("blank", empty);
  $("stage").classList.toggle("blank", !$("osmd").childElementCount);
}
/* ══ 練習面板 ══ */
let emptyTitle = null;   // 沒有題目時的大標題(模擬考結束時是結果);換語言時重寫
function showEmpty(){
  stopPlayback();
  cur = null; ex = null;
  $("qTitle").classList.add("empty"); $("qTitle").style.fontSize = "";
  emptyTitle = null;
  $("qTags").innerHTML = ""; emptyText(); renderIntro(null);
  if (S.tab === "exam" && SY && S.exam) syncExamButtons();
  $("playBtn").disabled = true; ROOT.querySelectorAll(".mbtn").forEach(b => { b.disabled = true; b.setAttribute("aria-pressed", "false"); });
  if (osmd) { try { osmd.clear(); } catch (e) {} }
  $("osmd").innerHTML = ""; osmd = null; noteXs = []; $("playline").hidden = true;
  setMsg("paperMsg", () => tr("選一題之後,這裡會顯示五線譜與指法", "Pick an item to see the score and fingering here"));
  $("scoreNote").hidden = true;
  syncTempoUI();
  syncQuizTop();
}
/* 沒有題目時的文字:大標題、抽考範圍(showEmpty 與換語言共用) */
function emptyText(){
  $("poolCount").textContent = "";   // 「抽考範圍 n 題」不寫(本級要求就在下面)
  pairText($("qTitle"), emptyTitle || (() => ""));
  // 題目卡的空狀態(畫面設計 2026-10 版型 B):一句怎麼開始 + 右下「隨機抽考」;項目名與進度在本項列
  pairText($("hint"), () => tr("點下面一項開始練", "Or pick one below"));
}
/* 本項列(檢定頁最上面一行):音階琶音 [會了 n/m](本級要求清單標題那一個在沒選題目時藏起來,不重複) */
function paintItemTag(){
  if (!S.exam) return;
  const qs = examQuestions(), good = qs.filter(q => S.mastery[q.key] === "good").length;
  $("irName").textContent = "";   // 子項目列已經寫項目名,本項列只留進度標籤 + 模擬考(同一個畫面不重複)
  $("irTag").textContent = tr(`會了 ${good}/${qs.length}`, `Got it ${good}/${qs.length}`);
}
function setQuestion(q, tab){
  stopPlayback();
  cur = q; lastKey = q.key; tabCur[tab] = q;
  ex = buildExercise(FG, q); namesLines = 1;
  if (ex && ex.exact && q.daily) dailyMarks();
  show = q.hands === "RH" ? "rh" : q.hands === "LH" ? "lh" : "both";
  syncHandSeg(); syncHandAllowed();
  renderQText(q, tab);
  fitTitle();
  $("playBtn").disabled = false;
  ROOT.querySelectorAll(".mbtn").forEach(b => b.disabled = false);
  syncMastery();
  bpm = q.free ? q.tempo.bpm : Math.max(30, Math.min(300, Math.round(q.tempo.bpm * S.tempoPct / 100)));
  syncTempoUI();
  renderScore();
  if (tab === "exam" && S.exam) { renderList(); syncExamButtons(); }
  if (tab === "scale" || tab === "arp") renderQuick(tab);
  syncQuizTop();
  preloadSamples();
}
/* 標籤(題目卡標題同一行):自由練習不放「右手 / 左手 / 雙手」(譜卡的手切換就是;畫面設計 2026-10);回傳 [文字, parts 的索引 − 1] */
const HAND_TAGS = () => [tr("右手", "RH"), tr("左手", "LH"), tr("雙手", "Both hands")];
function tagParts(q, parts){
  const drop = !q.daily ? HAND_TAGS() : [];   // 手寫在譜卡的手的切換(自由練習、檢定都有),標籤不重複
  return parts.slice(1).map((t, i) => [t, i]).filter(([t]) => !drop.includes(t));
}
/* 題目的文字:大標題、標籤、抽考範圍、樂譜下方說明(setQuestion 與換語言共用) */
function renderQText(q, tab){
  const parts = questionText(q);
  unpair($("qTitle")); $("qTitle").textContent = parts[0]; $("qTitle").classList.remove("empty");
  $("qTags").innerHTML = tagParts(q, parts).map(([t, i]) => `<span class="q-tag${q.dynamic && i === parts.length - 2 ? " dyn" : ""}">${t}</span>`).join("") + hanonBestTag(q);
  // 最後一行的「模擬考 n / m」只在檢定分頁的模擬考出現(「官方大綱」徽章不放:畫面設計 2026-10)
  if (!q.free && S.exam && tab === "exam") {
    const g = examGrade();
    $("poolCount").textContent = mock && mock.list.includes(q) ? tr(`模擬考 ${mock.i + 1} / ${mock.list.length}`, `Mock ${mock.i + 1} / ${mock.list.length}`)
      : tab === "exam" ? "" : `${SY.systems[S.exam.system].name} ${gradeLabel(g)}`;
  } else { $("poolCount").textContent = ""; }
  // 樂譜下方說明
  const notes = [], noteFns = notes;   // 每一則是函式:中英文各跑一次
  if (q.type === "thirds" || q.type === "sixths") notes.push(doubleNote(q));
  if (q.type === "broken") notes.push(() => (q.range === "5th" ? tr("分解三和弦照 Trinity 大綱的譜例(1-3-5-3-1,3/4 拍)。", "Broken triad as in the Trinity syllabus example (1-3-5-3-1 in 3/4).") : tr("分解和弦照 Trinity 大綱 1 級的譜例:三連音,原位 → 第一轉位 → 第二轉位到高八度主音,再反過來,停在五音。", "Broken chord as in the Trinity Grade 1 syllabus example: triplets, root → 1st → 2nd inversion to the upper tonic, then back, ending on the 5th.")));
  if (q.type === "dom7" && q.sys !== "trinity") notes.push(() => tr("屬七和弦琶音最後解決到主音(照 ABRSM 大綱的譜例)。", "The dominant 7th resolves on the tonic (as in the ABRSM syllabus example)."));
  if (q.apart === 3) notes.push(() => tr("相隔三度:右手比左手高十度(三度 + 八度),左手從主音、右手從第三級開始。", "A third apart: RH plays a tenth above LH — LH starts on the tonic, RH on the 3rd."));
  if (q.apart === 6) notes.push(() => tr("相隔六度:主音在上方 — 右手從主音、左手從低六度的第三級開始。", "A sixth apart: tonic on top — RH starts on the tonic, LH on the 3rd a sixth below."));
  if (q.type === "chromatic" && q.lhStart !== q.rhStart) notes.push(() => tr(`兩手從不同的音開始:左手 ${noteLabelStr(q.lhStart)}、右手 ${noteLabelStr(q.rhStart)}。`, `Hands start on different notes: LH ${noteLabelStr(q.lhStart)}, RH ${noteLabelStr(q.rhStart)}.`));
  $("scoreNote").hidden = !notes.length;
  pairText($("scoreNote"), () => noteFns.map(f => f()).join(" "));
  renderIntro(q.free && !q.daily ? tab : null);
  // 今日練習:標題 = 關卡(或暖身)的名稱,標籤 = 路線第幾關、速度 → 目標
  if (q.daily && dseg) {
    const nm = dseg.k === "warm" ? warmName(dseg.item) : levelName(dseg);
    $("qTitle").textContent = Array.isArray(nm) ? tr(nm[0], nm[1]) : nm;
    const tags = dcard.segTags({ ...dseg, bpm: q.tempo.bpm });
    const hand = questionText(q)[1];   // 關卡名稱已經寫了「右手」:標籤不再寫
    if (q.type === "route" && dseg.k !== "warm" && !$("qTitle").textContent.includes(hand)) tags.splice(1, 0, hand);   // [手指 1 / 33] [右手] [速度 50 → 84](時值不放,譜上看得到)
    $("qTags").innerHTML = tags.map(t => `<span class="q-tag">${t}</span>`).join("");
  }
  syncPlayCap();
  syncNamesBtn();
}
/* ▶ 下面一行小字:示範 / 示範 + 拍點(今日練習的路線段)/ 拍點(只有拍點的時候) */
function syncPlayCap(){
  const solo = clickOnlyOn() || !!(dseg && dseg.k !== "warm" && dseg.click && dseg.click !== "every");
  // 伴奏路線只有左手的關:App 另外彈一條旋律(示範 = 左手 + 旋律;只有拍點的那幾次 = 拍點 + 旋律,學生彈左手跟它合奏)
  $("playBtn").dataset.cap = melOn() ? (solo ? tr("拍點 + 旋律", "Click + melody") : tr("示範 + 旋律", "Demo + melody"))
    : solo ? tr("拍點", "Click") : dseg && dseg.k !== "warm" ? tr("示範 + 拍點", "Demo + click") : tr("示範", "Demo");
}
/* 這一段有合奏旋律(今日練習的伴奏關,只有左手的那幾關;patterns.js 的 accMelody) */
function melOn(){ return !!(dseg && dseg.k !== "warm" && cur && cur.daily && ex && ex.mel); }
/* 第一次進來這個子項目的一行說明(題目卡標籤下):這個子項目播放過一次就不再出現(S.intro[子項目] = true) */
const INTRO = {
  scale: ["一個調的音由低到高、再回來", "A key's notes up and back down"],
  arp: ["和弦的音一個一個彈(Do Mi Sol Do)", "A chord's notes one at a time (C E G C)"],
  hanon: ["手指練習曲,每拍 4 個音", "Finger exercise, 4 notes a beat"]
};
function renderIntro(tab){
  // 檢定頁的模擬考:這一行改寫「彈完自己按「會了」或「再練」」(模擬考靠熟練度按鈕記結果)
  const txt = mock && cur && mock.list.includes(cur) ? ["彈完自己按「會了」或「再練」", "After playing, tap Got it or Needs work"] : tab && !S.intro[tab] ? INTRO[tab] : null;
  $("intro").hidden = !txt;
  if (txt) pairText($("intro"), () => tr(txt[0], txt[1])); else unpair($("intro"));
}
function syncMastery(){
  const m = cur && S.mastery[cur.key];
  ROOT.querySelector(".mastery").hidden = (S.tab === "exam" && !cur) || !!dseg;   // 今日練習每一段(含暖身)都不標熟練度(段落用「做到了 / 還要練」)
  ROOT.querySelectorAll(".mbtn").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.m === m)));
}
/* 哈農的速度階梯:按 ✓ = 這個速度彈順了 → 記錄最高速度、下一輪 +4 */
function hanonBestTag(q){
  const b = q.type === "hanon" && S.hanonBest[q.no];
  return b ? `<span class="q-tag best">${tr("最高", "Best")} ♩=${b}</span>` : "";
}
ROOT.querySelectorAll(".mbtn").forEach(b => b.onclick = () => {
  if (!cur) return;
  const m = b.dataset.m;
  if (cur.type === "hanon" && m === "good") {
    const q4 = unitOf() === "e16" ? bpm / 2 : bpm;   // 最高速度一律記 ♩
    S.hanonBest[cur.no] = Math.max(S.hanonBest[cur.no] || 0, q4);
    S.mastery[cur.key] = "good";
    logPractice(0);
    setBpm(bpm + (unitOf() === "e16" ? 8 : 4), true);   // 下一輪 ♩ +4
    const parts = questionText(cur);
    $("qTags").innerHTML = tagParts(cur, parts).map(([t]) => `<span class="q-tag">${t}</span>`).join("") + hanonBestTag(cur);
    fitTitle(); syncMastery();
    return;
  }
  if (S.mastery[cur.key] === m) delete S.mastery[cur.key]; else { S.mastery[cur.key] = m; logPractice(0); }
  store.save(); syncMastery();
  if (S.tab === "exam") renderExam(); else renderQuick(S.tab);
  if (ctx) ctx.examChanged();
});

/* ── 樂譜:一整行 + 播放軸(照 ScrollScore)──
   noteXs:每一步(OSMD 游標的每個位置)的拍點與 x 座標;播放時依拍點在兩步之間內插,播放軸平順移動。
   比畫面短的樂譜置中(#osmd margin:auto),比畫面長的可以左右滑;播放時讓目前的音停在畫面 25%(到結尾才讓播放軸走完) */
const PLAYLINE_RATIO = 0.25;
let noteXs = [];
/* 右手 / 左手 / 雙手:自由練習 = 換題目(選單沒有「手」那一列);檢定 = 照大綱指定的手,這裡只換顯示哪一手 */
const HAND_OF = { rh: "RH", lh: "LH", both: "HT" };
const freeTab = () => (cur && cur.free && !cur.daily && PICKERS[S.tab] ? S.tab : null);   // 今日練習:右手 / 左手 / 雙手只換顯示
const syncHandSeg = segBind("handSeg", () => show, v => {
  const tab = freeTab();
  if (tab) {
    const row = PICKERS[tab].rows(S.pick[tab]).find(r => r && r[0] === "hands");
    if (row && !row[2].some(o => o[0] === HAND_OF[v])) return;   // 這個題型沒有這隻手(例如反向只有雙手)
    S.pick[tab].hands = HAND_OF[v]; store.save(); renderPicker(tab); loadFree(tab); return;
  }
  show = v; stopPlayback(); renderScore();
});
/* 自由練習:這個題型不能選的手停用(反向、相隔 = 雙手;三度、六度雙音 = 單手);檢定全部可以按(只換顯示) */
function syncHandAllowed(){
  // 今日練習的關卡:單手的關只能看那一手(另一手整段休止)
  if (cur && cur.daily && cur.type === "route") {
    const allow = cur.hands === "RH" ? ["rh"] : cur.hands === "LH" ? ["lh"] : ["rh", "lh", "both"];
    $("handSeg").querySelectorAll("button").forEach(b => { b.disabled = !allow.includes(b.dataset.v); });
    return;
  }
  const tab = freeTab(), row = tab && PICKERS[tab].rows(S.pick[tab]).find(r => r && r[0] === "hands");
  $("handSeg").querySelectorAll("button").forEach(b => { b.disabled = !!row && !row[2].some(o => o[0] === HAND_OF[b.dataset.v]); });
}
let renderSeq = 0;
// 兩欄(≥1100)時右欄很寬:譜放大一點,畫面才飽滿(比畫面長的照樣左右捲、播放軸停在 25%)
const scoreZoom = () => landZoom || (window.innerWidth < 600 ? 0.85 : window.innerWidth < 1000 ? 0.95 : window.innerWidth < 1100 ? 1.05 : 1.25);
/* 手機橫放(平板不算):樂譜照畫面高度放大,讓「工具列 + 樂譜標題 + 樂譜」剛好一個畫面(播放時下方分頁列收起來) */
const PHONE_LAND = "(orientation: landscape) and (max-height: 500px)";
const isPhoneLand = () => matchMedia(PHONE_LAND).matches;
let landZoom = null;
function fitLandZoom(){
  if (wrapMode()) return false;   // 今日練習的關卡:換行排法(fitWrap)自己照畫面寬高排
  if (!isPhoneLand()) { if (landZoom) { landZoom = null; return refit(); } return false; }
  const svg = $("osmd").querySelector("svg"); if (!svg || !osmd) return false;
  const H = svg.getBoundingClientRect().height; if (!H) return false;
  // 第一個畫面(沒有捲動時)樂譜上緣以下還剩多少高度:雙手兩行譜都要看得到(以前照「樂譜卡貼頂欄」算,沒播放時下面那行被切掉)
  // 播放中(樂譜卡貼在頂欄下面)可以放到滿版
  const playing = document.body.classList.contains("land-play");
  const top = playing ? document.querySelector("header").offsetHeight + $("scoreCard").querySelector(".card-title").offsetHeight + 30
    : $("stage").getBoundingClientRect().top + scrollY - openSetupHeight();
  const avail = Math.max(130, innerHeight - top - 14);
  const z = Math.max(0.6, Math.min(1.8, osmd.zoom * avail / H));
  if (Math.abs(z - osmd.zoom) < 0.03) { landZoom = osmd.zoom; return false; }
  landZoom = z; return refit();
}
// 上方展開的設定卡不算(照收合時的位置算):不然展開/收合設定、切語言時樂譜大小跟著變
function openSetupHeight(){
  const st = $("stage").getBoundingClientRect().top;
  // 並排的設定卡(橫式檢定分頁)垂直範圍重疊,只算一次
  const spans = [...document.querySelectorAll(".setup.open .setup-body, .picker.open .setup-body")]
    .map(el => el.getBoundingClientRect()).filter(r => r.height && r.bottom <= st)
    .map(r => [r.top - 8, r.bottom]).sort((a, b) => a[0] - b[0]);
  let h = 0, end = -Infinity;
  for (const [a, b] of spans) { if (b <= end) continue; h += b - Math.max(a, end); end = b; }
  return h;
}
function refit(){ if (wrapMode()) { fitWrap(); measureNotes(); return true; } osmd.zoom = scoreZoom(); lastZoom = osmd.zoom; renderOsmd(); measureNotes(); return true; }
/* ── 今日練習的關卡:換行排法(像視奏的考卷)──
   一般題目是一整行可以左右滑;關卡的譜短(1–8 小節),要整份看得到、不能左右捲:
   每行小節數照候選(4 → 2 → 1;能整除的優先、不留單獨一小節),縮放到放得下寬度:
   每行 3–4 小節要在正常大小的 85% 以上才用(不然字太小),每行 2 小節最小 WRAP_MIN,最後才一小節一行(最小 WRAP_MIN1);
   手機橫放時再照「樂譜框到畫面底」縮(只縮不放大)。播放軸照每一行(系統)上下移動 */
const WRAP_MIN = 0.55, WRAP_MIN1 = 0.45;   // 0.55 = 視奏考卷排法的下限(口袋總譜大小)
const wrapMode = () => !!(cur && cur.daily && cur.type === "route" && ex && ex.exact);
let wrapW = 0;
function systemsOf(){ try { return osmd.GraphicSheet.MusicPages.flatMap(p => p.MusicSystems); } catch (e) { return []; } }
/* 這次排出來的每一行小節數(OSMD 放不下會自己再換行:跟要求的不一樣 = 放不下) */
function wrapFits(n, bars){
  const sys = systemsOf();
  if (sys.length !== Math.ceil(bars / n)) return false;
  const rem = bars % n;
  if (!sys.every((sy, i) => (sy.GraphicalMeasures || []).length === (i === sys.length - 1 && rem ? rem : n))) return false;
  const svg = $("osmd").querySelector("svg");
  return !svg || svg.getBoundingClientRect().width <= $("scroll").clientWidth + 1;
}
function wrapRender(n, z){
  const R = osmd.EngravingRules;
  R.RenderSingleHorizontalStaffline = false; R.RenderXMeasuresPerLineAkaSystem = n;
  osmd.zoom = z; nameSpace(namesOn() ? namesLines : 0); osmd.render();   // 只量寬度:多留的音名空間不影響每行幾小節
}
function wrapCands(bars){
  const big = [4, 3].filter(n => n < bars);
  const even = big.filter(n => bars % n === 0), rest = big.filter(n => bars % n > 1);
  return [...new Set([bars <= 4 ? bars : null, ...even, ...rest, 2, 1])].filter(n => n && n <= bars);
}
function fitWrap(){
  const bars = ex.bars || (osmd.GraphicSheet ? osmd.GraphicSheet.MeasureList.length : 4);
  const base = window.innerWidth < 600 ? 0.85 : window.innerWidth < 1000 ? 0.95 : window.innerWidth < 1100 ? 1.05 : 1.25;
  wrapW = $("scroll").clientWidth;
  let pick = null;
  for (const n of wrapCands(bars)) {
    const floor = n >= 3 ? base * 0.85 : n === 2 ? WRAP_MIN : WRAP_MIN1;
    const fits = z => { wrapRender(n, z); return wrapFits(n, bars); };
    if (!fits(floor)) continue;
    let lo = floor, hi = base;
    if (fits(hi)) lo = hi;
    else for (let k = 0; k < 6; k++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
    pick = { n, z: Math.floor(lo * 100) / 100 };
    break;
  }
  if (!pick) pick = { n: 1, z: WRAP_MIN1 };
  // 手機橫放:第一個畫面(或播放中貼頂欄時)放得下整份;只縮不放大,不小於這個排法的下限
  if (isPhoneLand()) {
    wrapRender(pick.n, pick.z);
    const svg = $("osmd").querySelector("svg"), H = svg ? svg.getBoundingClientRect().height : 0;
    const playing = document.body.classList.contains("land-play");
    const top = playing ? document.querySelector("header").offsetHeight + 40 : $("stage").getBoundingClientRect().top + scrollY - openSetupHeight();
    const avail = Math.max(130, innerHeight - top - 14);
    if (H > avail) pick.z = Math.max(pick.n >= 2 ? WRAP_MIN : WRAP_MIN1, Math.floor(pick.z * avail / H * 100) / 100);
  }
  osmd.EngravingRules.RenderXMeasuresPerLineAkaSystem = pick.n; osmd.zoom = pick.z; lastZoom = pick.z;
  renderOsmd();
  window.__wrap = { n: pick.n, zoom: pick.z, bars };
}
async function renderScore(){
  if (!cur) return;
  const seq = ++renderSeq;
  const xml = exerciseToMusicXML(ex, cur, show);
  if (!osmd) {
    osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay($("osmd"), {
      backend: "svg", autoResize: false, drawTitle: false, drawSubtitle: false, drawComposer: false, drawPartNames: false,
      drawMeasureNumbers: false, drawingParameters: "compacttight", renderSingleHorizontalStaffline: true,
      cursorsOptions: [{ type: 0, color: "#F2B94B", alpha: 0, follow: false }]
    });
  }
  setMsg("paperMsg", null);
  try {
    await osmd.load(xml);
    if (seq !== renderSeq) return;
    const wrap = wrapMode();
    $("stage").classList.toggle("wrap", wrap);
    osmd.EngravingRules.RenderSingleHorizontalStaffline = !wrap;
    osmd.EngravingRules.RenderXMeasuresPerLineAkaSystem = 0;
    if (wrap) { namesLines = 1; fitWrap(); measureNotes(); }
    else {
      osmd.zoom = scoreZoom();
      renderOsmd();
      measureNotes();
      fitLandZoom();
    }
    syncQuizTop();
  } catch (e) {
    console.error(e);
    setMsg("paperMsg", () => tr("樂譜繪製失敗:", "Could not draw the score: ") + e.message);
  }
  window.__lastXml = xml;
  window.__scoreReady = (window.__scoreReady || 0) + 1;
}
/* 指法自己畫(OSMD 的指法有時會被擠到音符左邊,位置不一致):
   OSMD 只畫音符;每個音的指法數字對準符頭正中央,右手(placement above)放在「譜表上緣、這個音(含符桿)最高點」兩者較高的上方,
   左手(below)放在下方;雙音兩個數字疊起來(上面的音的指法在外側) */
function renderOsmd(){
  // 今日練習的關卡:「音名」開著 → 譜表之間多留一排字的空間,畫完指法再畫音名(js/shared/notenames.js,跟視奏分頁同一套);
  // 字排不下(音太密要交錯、和弦、或跟指法擠在一起)就多留空間再排(最多再排兩次)
  // 有和弦表、又沒有單音的關(柱式和弦):音名不寫,也不留那一排的空間
  const on = namesOn() && !(ex && ex.exact && barChords(ex) && !["rh", "lh"].some(h => (ex[h] || []).some(n => !n.rest && !n.chord)));
  for (let pass = 0; pass < 3; pass++) {
    nameSpace(on ? namesLines : 0);
    osmd.render();
    drawFingerings();
    const svg = $("osmd").querySelector("svg");
    if (!svg) return;
    drawChordNames(svg);
    if (!on) { svg.querySelectorAll(".t-name").forEach(el => el.remove()); return; }
    // 有和弦表的關:柱式和弦不在譜下疊音名(和弦表寫了);按住的音(第二聲部)不放進音名那一行
    const tbl = !!(ex && ex.exact && barChords(ex)), held = !!(ex && ex.hold && ((ex.hold.rh || []).length || (ex.hold.lh || []).length));
    const r = paintNoteNames(svg, osmd, { cls: "t-name", skip: gve => (tbl && gve.notes.filter(n => n.sourceNote && !n.sourceNote.isRest()).length > 1) || (held && [2, 6].includes(gve.parentVoiceEntry && gve.parentVoiceEntry.ParentVoice && gve.parentVoiceEntry.ParentVoice.VoiceId)) });
    svg.querySelectorAll(".t-name").forEach(el => { el.setAttribute("fill", "#5a4a2a"); el.setAttribute("font-family", "Noto Sans TC, sans-serif"); el.setAttribute("font-weight", "500"); });
    if (!r || (!r.crowded && r.need <= namesLines) || namesLines >= 3) return;
    namesLines = Math.min(3, Math.max(r.need, namesLines + (r.crowded ? 1 : 0)));
  }
}
/* ── 音名(今日練習的關卡;每條路線記住使用者的選擇,沒選過照關卡的預設:手指 A–C 組、伴奏 A–B 組開;換調的複習一律先開)── */
let namesLines = 1, namesSeg = null, baseSpace = null;
function nameSpace(lines){
  const rules = osmd.EngravingRules;
  if (!baseSpace) baseSpace = { sd: rules.StaffDistance, bsd: rules.BetweenStaffDistance, sys: rules.MinSkyBottomDistBetweenSystems };
  const add = lines ? (lines * Math.max(10 / (osmd.zoom || 1), 13) * 1.2 + 6) / 10 + 0.3 : 0;
  rules.StaffDistance = baseSpace.sd + add; rules.BetweenStaffDistance = baseSpace.bsd + add;
  rules.MinSkyBottomDistBetweenSystems = baseSpace.sys + add + (ex && ex.exact && barChords(ex) ? 2.6 : 0);   // 換行排法:最下面那個譜表的音名、下一行上方的和弦名
}
const keyVary = () => !!(dseg && dseg.k === "review" && dseg.vary && dseg.vary.q && dseg.vary.q.rkey);
const namesRoute = () => (dseg && dseg.k !== "warm" ? dseg.r : "finger");
function namesDefault(){
  if (!dseg) return false;
  if (keyVary()) return true;
  const L = dseg.k === "warm" ? findLevel({ r: "finger", id: daily.data.prog.finger.at }) : dseg.level;
  return !!(L && L.names);
}
function namesOn(){
  if (!cur || !cur.daily || cur.type !== "route" || !dseg) return false;
  if (namesSeg != null) return namesSeg;
  if (keyVary()) return true;
  const v = S.dnames[namesRoute()];
  return typeof v === "boolean" ? v : namesDefault();
}
/* ── 今日練習的譜面標記(方法書的做法;patterns.js)──
   兩小節一樣 = 一小節 + 反覆記號 ×N;指法只標要標的(fingerMarks;手指 A 組、暖身每個音都標);
   和弦名畫在最上面那個譜表上方(換和弦、每一行第一個);和弦表、手位圖在譜卡標題列下面(HTML) */
function dailyMarks(){
  const sb = sameBars(ex);
  if (sb) { ex = sb; const dp = dailyPlay(); ex.times = dp ? dp.bars : 4; }
  const L = dseg && dseg.level;
  fingerMarks(ex, { all: !!dseg && (dseg.k === "warm" || (L && L.route && L.route.id === "finger" && L.g === "A")) });
}
const NOTE_ZH = s => s;   // 音名中英一樣(C、F♯)
function renderMarksUI(){
  const route = !!(cur && cur.daily && cur.type === "route" && dseg && ex && ex.exact);
  const tbl = route ? chordTable(ex) : null, hp = route ? handPositions(ex) : [];
  const ct = $("chordTable"), hpEl = $("handPos");
  ct.hidden = !tbl || !tbl.length;
  if (tbl && tbl.length) {
    const on = namesOn();
    // 「C = C E G(5-3-1)· G7 = B F G(5-2-1)」;音名關掉:「C(5-3-1)· G7(5-2-1)」
    ct.innerHTML = tbl.map(c => `<span><b>${c.name}</b>${on ? " = " + c.notes.map(NOTE_ZH).join(" ") : ""}<small>(${c.fingers.join("-")})</small></span>`).join("<i aria-hidden=\"true\"> · </i>");
    ct.setAttribute("aria-label", tr("這一關的和弦:", "Chords here: ") + tbl.map(c => `${c.name} ${c.notes.join(" ")} ${tr("指法", "fingers")} ${c.fingers.join(" ")}`).join(";"));
  }
  hpEl.hidden = !hp.length;
  if (hp.length) {
    const names = [...new Set(hp.map(p => p.keys[0].name))];
    const say = hp.map(p => p.hand === "rh" ? tr(`右手拇指在${p.mid ? "中央 C" : p.thumb}`, `RH thumb on ${p.mid ? "middle C" : p.thumb}`) : tr(`左手小指在 ${p.low}`, `LH finger 5 on ${p.low}`));
    const label = names.join(" → ") + tr(" 位置", " position");
    hpEl.innerHTML = `<span class="hp-lbl"><b>${label}</b><span class="hp-more">${tr(":", ": ")}${[...new Set(say)].join(tr(",", ", "))}</span></span>` + hp.map(miniKeys).join("");
    hpEl.setAttribute("title", label + tr(":", ": ") + [...new Set(say)].join(tr(",", ", ")));
  }
}
/* 手位圖:一小段鍵盤(線稿),這個位置的 5 個鍵亮起來、寫手指號碼(高 28) */
function miniKeys(p){
  const lo = p.keys[0].midi - (isBlackKey(p.keys[0].midi) ? 1 : 0), hi = p.keys[4].midi + (isBlackKey(p.keys[4].midi) ? 1 : 0);
  const whites = []; for (let m = lo; m <= hi; m++) if (!isBlackKey(m)) whites.push(m);
  const W = 13, H = 28, fin = new Map(p.keys.map(k => [k.midi, k]));
  let x = 0, body = "", blacks = "";
  for (const m of whites) {
    const k = fin.get(m);
    body += `<rect x="${x + 0.5}" y="0.5" width="${W - 1}" height="${H - 1}" rx="2" class="${k ? (k.used ? "on" : "soft") : ""}"/>` + (k ? `<text x="${x + W / 2}" y="${H - 4}">${k.finger}</text>` : "");
    if (isBlackKey(m + 1) && m + 1 <= hi + 1) {
      const kb = fin.get(m + 1), bx = x + W - 4;
      blacks += `<rect x="${bx}" y="0.5" width="8" height="16" rx="1.5" class="blk${kb ? (kb.used ? " on" : " soft") : ""}"/>` + (kb ? `<text x="${bx + 4}" y="12" class="bt">${kb.finger}</text>` : "");
    }
    x += W;
  }
  return `<svg class="mini-kb" viewBox="0 0 ${x} ${H}" width="${x}" height="${H}" aria-hidden="true">${body}${blacks}</svg>`;
}
const isBlackKey = m => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
/* 和弦名:最上面那個譜表上方、指法外側;換和弦的地方與每一行第一個和弦才寫 */
function drawChordNames(svg){
  svg.querySelectorAll(".t-chord").forEach(e => e.remove());
  const names = ex && ex.exact ? barChords(ex) : null;
  if (!names || !osmd.GraphicSheet) return;
  const NS = "http://www.w3.org/2000/svg", frag = document.createDocumentFragment();
  const ink = [...svg.querySelectorAll("path, rect, text, ellipse, line, polyline, polygon, use")].map(e => e.getBBox()).filter(b => b.width || b.height);
  let lastSys = null;
  const rows = new Map();
  osmd.GraphicSheet.MeasureList.forEach((list, mi) => {
    const gm = list && list[0]; if (!gm || !gm.getVFStave || mi >= names.length) return;
    const sys = gm.ParentMusicSystem, first = sys !== lastSys; lastSys = sys;
    if (!first && names[mi] === names[mi - 1]) return;
    const se = gm.staffEntries[0], gn = se && se.graphicalVoiceEntries[0] && se.graphicalVoiceEntries[0].notes[0], g = gn && gn.getSVGGElement && gn.getSVGGElement();
    const head = g && (g.querySelector(".vf-notehead") || g);
    const x = head ? head.getBBox().x : gm.getVFStave().getNoteStartX() + 4;
    const stave = gm.getVFStave(), sp = stave.getSpacingBetweenLines();
    if (!rows.has(sys)) rows.set(sys, { top: stave.getYForLine(0), sp, border: (sys.PositionAndShape.AbsolutePosition.y + sys.PositionAndShape.BorderTop) * 10, items: [] });
    rows.get(sys).items.push({ x, name: names[mi] });
  });
  for (const r of rows.values()) {
    // 這一行最上面那個譜表上方的筆畫(音符、符桿、指法、圓滑線…)最高點;字放在它上面
    let top = r.top;
    for (const b of ink) if (b.y + b.height <= r.top + r.sp * 2 && b.y + b.height > r.border) top = Math.min(top, b.y);   // 只看這一行(上一行的筆畫在 border 上面)
    const fs = r.sp * 1.7, y = top - r.sp * 0.6;
    for (const it of r.items) {
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", it.x); t.setAttribute("y", y); t.setAttribute("class", "t-chord");
      t.setAttribute("font-family", "Noto Serif TC, Times New Roman, serif"); t.setAttribute("font-weight", "700"); t.setAttribute("font-size", fs); t.setAttribute("fill", "#16130D");
      t.textContent = it.name;
      frag.appendChild(t);
    }
  }
  svg.appendChild(frag);
  const vb = svg.viewBox.baseVal, bb = svg.getBBox();
  if (vb && vb.height && bb.y - 4 < vb.y) {
    const k = parseFloat(svg.getAttribute("height")) / vb.height, y0 = bb.y - 4;
    svg.setAttribute("viewBox", `${vb.x} ${y0} ${vb.width} ${vb.y + vb.height - y0}`);
    svg.setAttribute("height", (vb.y + vb.height - y0) * k);
  }
}
function syncNamesBtn(){
  const b = $("namesBtn"); if (!b) return;
  const route = !!(cur && cur.daily && cur.type === "route" && dseg);
  b.hidden = !route;
  b.setAttribute("aria-pressed", String(namesOn()));
  renderMarksUI();
  // 今日練習的關卡:譜卡標題列 = [音名] …[右手|左手|雙手](標題「樂譜與指法」省掉,一行放得下);單手的關不放手的切換(只有那一手)
  $("scoreCard").querySelector(".card-title").hidden = route;
  $("handSeg").hidden = route && cur.hands !== "HT";
}
$("namesBtn").onclick = () => {
  const v = !namesOn();
  if (keyVary()) namesSeg = v; else { S.dnames[namesRoute()] = v; store.save(); }
  syncNamesBtn(); namesLines = 1;
  if (osmd && cur) { if (wrapMode()) fitWrap(); else renderOsmd(); measureNotes(); }
};
function drawFingerings(){
  const svg = $("osmd").querySelector("svg"); if (!svg) return;
  // OSMD 畫的指法拿掉(排版時它已經幫指法留好上下空間);三連音的「3」不動
  svg.querySelectorAll("text").forEach(t => { if (/^[1-5]$/.test(t.textContent.trim()) && !t.closest(".vf-tuplet")) t.remove(); });
  const NS = "http://www.w3.org/2000/svg", frag = document.createDocumentFragment();
  // 連桿(符尾的粗線)不在音符的範圍裡:另外量,數字要放在連桿外側
  // 每一條連桿是一個四邊形(左右兩條直邊):算出在某個 x 位置連桿的上下緣
  const beams = [];
  svg.querySelectorAll(".vf-beam path").forEach(pth => {
    const n = ((pth.getAttribute("d") || "").match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    if (n.length < 8) return;
    const pts = [[n[0], n[1]], [n[2], n[3]], [n[4], n[5]], [n[6], n[7]]];
    const lo = Math.min(...pts.map(p => p[0])), hi = Math.max(...pts.map(p => p[0]));
    const L = pts.filter(p => Math.abs(p[0] - lo) < 0.5).map(p => p[1]), R = pts.filter(p => Math.abs(p[0] - hi) < 0.5).map(p => p[1]);
    if (L.length && R.length) beams.push({ lo, hi, lt: Math.min(...L), lb: Math.max(...L), rt: Math.min(...R), rb: Math.max(...R) });
  });
  const beamAt = (x0, x1) => {
    const out = [];
    for (const b of beams) {
      if (x1 < b.lo || x0 > b.hi) continue;
      const x = Math.max(b.lo, Math.min(b.hi, (x0 + x1) / 2)), f = b.hi > b.lo ? (x - b.lo) / (b.hi - b.lo) : 0;
      out.push([b.lt + (b.rt - b.lt) * f, b.lb + (b.rb - b.lb) * f]);
    }
    return out;
  };
  // 三連音的「3」(含括弧):指法數字要放在它外側,不然會疊在一起
  // (VexFlow 把「3」畫成沒有 class 的 path,直接放在 .vf-measure 底下;譜線也是 path 但高度 0)
  const tuplets = [...svg.querySelectorAll(".vf-tuplet, .vf-measure > path:not([class])")].map(t => t.getBBox()).filter(b => b.width > 2 && b.height > 4);
  for (const mlist of osmd.GraphicSheet.MeasureList) for (const gm of mlist || []) {
    if (!gm || !gm.getVFStave) continue;
    const stave = gm.getVFStave(), sp = stave.getSpacingBetweenLines(), top = stave.getYForLine(0), bot = stave.getYForLine(4);
    const fs = sp * 1.5, gap = sp * 0.5;
    for (const se of gm.staffEntries) for (const gve of se.graphicalVoiceEntries) {
      if (!gve.notes.some(n => n.sourceNote.Fingering) || !gve.notes[0].getSVGGElement) continue;
      const el = gve.notes[0].getSVGGElement(); if (!el) continue;
      const heads = [...el.querySelectorAll(".vf-notehead")].map(h => h.getBBox()).sort((a, b) => b.y - a.y);   // 低音 → 高音
      if (!heads.length) continue;
      const b0 = el.getBBox(), cx = heads[0].x + heads[0].width / 2;
      let bt = b0.y, bb = b0.y + b0.height;
      for (const [y0, y1] of beamAt(Math.min(heads[0].x - 1, cx - fs * 0.4), Math.max(heads[0].x + heads[0].width + 1, cx + fs * 0.4))) if (y1 >= top - sp * 8 && y0 <= bot + sp * 8 && y1 >= bt - sp * 9 && y0 <= bb + sp * 9) { bt = Math.min(bt, y0); bb = Math.max(bb, y1); }
      for (const t of tuplets) if (t.x <= cx + fs * 0.45 && t.x + t.width >= cx - fs * 0.45 && t.y + t.height >= top - sp * 8 && t.y <= bot + sp * 8 && t.y + t.height >= bt - sp * 6 && t.y <= bb + sp * 6) { bt = Math.min(bt, t.y); bb = Math.max(bb, t.y + t.height); }
      const box = { y: bt, height: bb - bt };
      const sorted = gve.notes.slice().sort((a, b) => a.sourceNote.Pitch.getHalfTone() - b.sourceNote.Pitch.getHalfTone());
      const list = sorted.map((n, k) => ({ n, h: heads[Math.min(k, heads.length - 1)] })).filter(x => x.n.sourceNote.Fingering);
      const above = list[0].n.sourceNote.Fingering.placement !== 1;
      if (above) list.sort((a, b) => b.h.y - a.h.y); else list.sort((a, b) => a.h.y - b.h.y);   // 靠近音符的先放
      let y = above ? Math.min(top, box.y) - gap : Math.max(bot, box.y + box.height) + gap + fs * 0.75;
      // 整疊對齊同一欄:和弦裡有二度(符頭錯開到符桿另一邊)時,照多數符頭那一欄(一樣多 = 最低音那一欄),不跟著錯開的符頭跑
      const cols = new Map();
      for (const h of heads) { const k = Math.round(h.x + h.width / 2); cols.set(k, (cols.get(k) || 0) + 1); }
      const colX = [...cols.entries()].sort((a, b) => b[1] - a[1] || 0)[0][0];
      const xCol = cols.size > 1 ? (cols.get(Math.round(heads[0].x + heads[0].width / 2)) >= Math.max(...cols.values()) ? heads[0].x + heads[0].width / 2 : colX) : heads[0].x + heads[0].width / 2;
      for (const { n, h } of list) {
        const t = document.createElementNS(NS, "text");
        t.setAttribute("x", xCol); t.setAttribute("y", y); t.setAttribute("text-anchor", "middle");
        t.setAttribute("font-family", "Times New Roman, Times, serif"); t.setAttribute("font-size", fs); t.setAttribute("class", "fd-finger");
        t.textContent = n.sourceNote.Fingering.value;
        frag.appendChild(t);
        y += above ? -fs * 0.82 : fs * 0.82;
      }
    }
  }
  svg.appendChild(frag);
  // 力度記號(mf 等文字)跟指法數字疊在一起時,往外移到指法外側(左手指法在下方,mf 常常壓在第一個指法上)
  const fings = [...svg.querySelectorAll("text.fd-finger")].map(t => t.getBBox());
  svg.querySelectorAll("text").forEach(t => {
    if (t.classList.contains("fd-finger") || t.closest(".vf-tuplet")) return;
    for (let k = 0; k < 4; k++) {
      const b = t.getBBox(), hit = fings.find(f => f.x < b.x + b.width + 1 && f.x + f.width > b.x - 1 && f.y < b.y + b.height && f.y + f.height > b.y);
      if (!hit) break;
      const below = b.y + b.height / 2 > hit.y + hit.height / 2;
      const dy = below ? hit.y + hit.height + 2 - b.y : hit.y - 2 - (b.y + b.height);
      t.setAttribute("y", parseFloat(t.getAttribute("y")) + dy);
    }
  });
  // 指法放到 OSMD 預留的範圍外時,把畫布撐大(不然會被切掉)
  const vb = svg.viewBox.baseVal, bb = svg.getBBox();
  if (vb && vb.height) {
    const k = parseFloat(svg.getAttribute("height")) / vb.height;
    const y0 = Math.min(vb.y, bb.y - 4), y1 = Math.max(vb.y + vb.height, bb.y + bb.height + 4);
    if (y0 < vb.y || y1 > vb.y + vb.height) {
      svg.setAttribute("viewBox", `${vb.x} ${y0} ${vb.width} ${y1 - y0}`);
      svg.setAttribute("height", (y1 - y0) * k);
    }
  }
}

/* 走一遍 OSMD 游標,記下每一步的拍點與 x(相對 #osmd);再量樂譜上下範圍給播放軸 */
let sysTops = [], sysExt = [];
function measureNotes(){
  noteXs = [];
  // 換行排法:每一行(系統)的上緣(游標的 top 是 #osmd 裡的像素;OSMD 單位 × 10 × 縮放)
  sysTops = wrapMode() ? systemsOf().map(sy => (sy.PositionAndShape.AbsolutePosition.y + sy.PositionAndShape.BorderTop) * 10 * osmd.zoom) : [];
  const c = osmd.cursor;
  c.show(); c.reset();
  let guard = 0;
  // 播放軸對準符頭正中央(以前用游標的左緣:游標沒有 style.width,播放軸一直比音符偏左一個符頭,最後一個長音時看起來卡在兩個音之間)
  const ox = $("osmd").getBoundingClientRect().x;
  while (!c.Iterator.EndReached && guard++ < 3000) {
    const el = c.cursorElement;
    let xs = [];
    try {
      xs = c.GNotesUnderCursor().filter(n => !(n.sourceNote && n.sourceNote.isRest && n.sourceNote.isRest())).map(n => { const g = n.getSVGGElement && n.getSVGGElement(); const h = g && (g.querySelector(".vf-notehead") || g); const r = h && h.getBoundingClientRect(); return r && r.width ? r.x - ox + r.width / 2 : null; }).filter(v => v != null);
    } catch (e) {}
    const x = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : parseFloat(el.style.left) + (el.offsetWidth || el.width || 0) / 2;
    let sys = 0;
    if (wrapMode()) { const top = parseFloat(el.style.top) || 0; sys = sysTops.length ? sysTops.reduce((b, t, i) => (top + 2 >= t ? i : b), 0) : 0; }
    const beat = c.Iterator.currentTimeStamp.RealValue * 4;
    if (!noteXs.length || beat > noteXs[noteXs.length - 1].beat + 1e-6) noteXs.push({ beat, x, sys });   // 反覆記號:游標跳回去的不算
    c.next();
  }
  c.reset(); c.hide();
  $("scroll").scrollLeft = 0;
  placePlaylineExtent();
  movePlayline(0, false);
}
/* 播放軸的上下:貼著譜線與音符(含加線、符桿)再往外留 1.2 個譜線間距(ScrollScore 的規則) */
function placePlaylineExtent(){
  const stage = $("stage"), pl = $("playline"), svg = $("osmd").querySelector("svg");
  if (!svg) { pl.hidden = true; return; }
  const sr = stage.getBoundingClientRect();
  let top = Infinity, bot = -Infinity, space = 8;
  const lines = svg.querySelectorAll(".staffline");
  lines.forEach(g => { const r = g.getBoundingClientRect(); top = Math.min(top, r.top); bot = Math.max(bot, r.bottom); space = r.height / 4 || space; });
  svg.querySelectorAll(".vf-stavenote, .vf-ledgers").forEach(g => { const r = g.getBoundingClientRect(); if (r.height) { top = Math.min(top, r.top); bot = Math.max(bot, r.bottom); } });
  if (!isFinite(top)) { pl.hidden = true; return; }
  const pad = space * 1.2;
  sysExt = [];
  if (wrapMode() && sysTops.length > 1) {
    // 換行排法:每一行自己的上下範圍(譜線、音符照 y 分到最近的那一行)
    const oy = $("osmd").getBoundingClientRect().top, idx = y => sysTops.reduce((b, t, i) => (y - oy + 4 >= t ? i : b), 0);
    const ext = sysTops.map(() => [Infinity, -Infinity]);
    svg.querySelectorAll(".staffline, .vf-stavenote, .vf-ledgers").forEach(g => { const r = g.getBoundingClientRect(); if (!r.height) return; const e = ext[idx(r.top + r.height / 2)]; e[0] = Math.min(e[0], r.top); e[1] = Math.max(e[1], r.bottom); });
    sysExt = ext.map(([a, b]) => (isFinite(a) ? { top: Math.max(0, a - sr.top - pad), h: b - a + 2 * pad } : null));
  }
  pl.style.top = Math.max(0, top - sr.top - pad) + "px";
  pl.style.bottom = Math.max(0, sr.bottom - bot - pad) + "px";
  pl.style.height = "";
  pl.hidden = false;
}
/* 換行排法:播放軸移到這一拍那一行 */
function playlineRow(beat){
  if (!sysExt.length) return;
  let i = 0; for (let k = 0; k < noteXs.length && noteXs[k].beat <= beat + 1e-6; k++) i = noteXs[k].sys || 0;
  const e = sysExt[i] || sysExt[0]; if (!e) return;
  const pl = $("playline");
  pl.style.top = e.top + "px"; pl.style.bottom = "auto"; pl.style.height = e.h + "px";
}
function xAtBeat(beat){
  if (!noteXs.length) return 0;
  if (beat <= noteXs[0].beat) return noteXs[0].x;
  for (let i = 0; i + 1 < noteXs.length; i++) {
    const a = noteXs[i], b = noteXs[i + 1];
    if (beat < b.beat) return a.sys !== b.sys ? a.x : a.x + (b.x - a.x) * (beat - a.beat) / (b.beat - a.beat);   // 換行:停在這一行最後一個音
  }
  return noteXs[noteXs.length - 1].x;
}
/* follow = true:播放中,讓目前位置停在 25%(能捲才捲)。
   播放中用 transform 移動樂譜(小數像素、GPU),不改 scrollLeft:scrollLeft 只能整數,
   播放軸跟樂譜各自四捨五入會差 1px 來回跳 → 看起來在抖 */
function movePlayline(beat, follow){
  const scroll = $("scroll"), o = $("osmd"), pl = $("playline");
  const x = o.offsetLeft + xAtBeat(beat);
  playlineRow(beat);
  if (follow && wrapMode()) { if (o.style.transform) o.style.transform = ""; pl.style.transform = `translate3d(${x - 1}px,0,0)`; return; }
  if (follow) {
    if (scroll.scrollLeft) scroll.scrollLeft = 0;
    const max = Math.max(0, o.offsetLeft + o.offsetWidth - scroll.clientWidth);
    const shift = Math.max(0, Math.min(max, x - scroll.clientWidth * PLAYLINE_RATIO));
    o.style.transform = shift ? `translate3d(${-shift}px,0,0)` : "";
    pl.style.transform = `translate3d(${x - shift - 1}px,0,0)`;
    return;
  }
  if (o.style.transform) o.style.transform = "";
  pl.style.transform = `translate3d(${x - scroll.scrollLeft - 1}px,0,0)`;
}
$("scroll").addEventListener("scroll", () => { if (!play) movePlayline(0, false); }, { passive: true });
/* 旋轉螢幕 / 改視窗大小:縮放改了就重畫;播放軸位置重算 */
let lastZoom = null;
/* 題目固定一行(高度固定):太長就把字縮小,中英文的版面才會一樣 */
function fitTitle(){
  const el = $("qTitle");
  el.style.fontSize = "";
  if (el.classList.contains("empty")) return;
  let fs = parseFloat(getComputedStyle(el).fontSize);
  const min = Math.max(14, fs * 0.55);
  while (el.scrollWidth > el.clientWidth + 1 && fs > min) { fs -= 1; el.style.fontSize = fs + "px"; }
  // 標籤也固定一行:放不下就整排一起縮小
  const g = $("qTags");
  let k = 1; g.style.setProperty("--tag-scale", 1); g.classList.remove("wrap");
  // 量最後一個標籤的右緣(留 2px;scrollWidth 是整數,小數寬度會差 1px 被切掉;跟 DrumDrill 一樣)
  const over = () => g.scrollWidth > g.clientWidth + 1 || (g.lastElementChild && g.lastElementChild.getBoundingClientRect().right + 2 > g.getBoundingClientRect().right);
  while (over() && k > 0.82) { k -= 0.04; g.style.setProperty("--tag-scale", k); }
  // 縮到 0.82 還放不下(折疊機、標籤多的關):換到第二行,不再縮小、不截掉
  if (over()) { g.style.setProperty("--tag-scale", 0.82); g.classList.add("wrap"); }
}
const onStageResize = () => {
  fitTitle();
  // 播放中轉向:直式 → 橫式 收起分頁列、樂譜貼到工具列下;橫式 → 直式 放回分頁列
  if (play) {
    const land = document.body.classList.contains("land-play");
    if (isPhoneLand() && !land) { revealScore(); setTimeout(() => { if (play) revealScore(); }, 400); }   // 樂譜放大重畫後再對齊一次
    else if (!isPhoneLand() && land) { document.body.classList.remove("land-play"); landScroll = null; revealScore(); }
  }
  if (!osmd || !cur) return;
  if (wrapMode()) {
    // 換行排法:寬度變了才重排(播放中不重排,停了再說)
    if (!play && Math.abs($("scroll").clientWidth - wrapW) > 1 && $("scroll").clientWidth > 0) { fitWrap(); measureNotes(); return; }
    placePlaylineExtent(); if (!play) movePlayline(0, false);
    return;
  }
  if (fitLandZoom()) return;
  const z = scoreZoom();
  if (z !== lastZoom && lastZoom !== null) { lastZoom = z; osmd.zoom = z; renderOsmd(); measureNotes(); return; }
  lastZoom = z;
  placePlaylineExtent();
  if (!play) movePlayline(0, false);
};
window.addEventListener("resize", onStageResize);
if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => requestAnimationFrame(onStageResize)).observe($("stage"));

/* ── 速度 ──
   檢定題目:單位照大綱(♩ 或 𝅗𝅥),一拍幾個八分音符照 NOTES_PER_UNIT;自由練習:♩、一拍兩個八分音符 */
function unitOf(){ return cur && cur.tempo ? cur.tempo.unit : "q"; }
function beatsPerBar(){
  if (ex && ex.time) return ex.time[0] * (unitOf() === "e16" ? 2 : 1);
  if (ex && ex.timeHidden) return Math.max(1, Math.round(8 / NOTES_PER_UNIT[unitOf()]));   // 十六分音符的音階:一小節 8 個音
  return unitOf() === "h" ? 2 : 4;
}
/* 速度的音符符號:音階寫成十六分音符時,拍點落在「每 2 個音」= ♪、「每 4 個音」= ♩(大綱原本的單位寫在說明裡) */
function unitSym(u){
  if (ex && ex.timeHidden && ex.sub === 4) return NOTES_PER_UNIT[u] === 4 ? "♩" : NOTES_PER_UNIT[u] === 2 ? "♪" : UNIT_SYM[u];
  return UNIT_SYM[u];
}
function syncTempoUI(){
  const u = unitOf();
  $("bpmRange").max = maxBpm();
  $("bpmVal").textContent = bpm; $("bpmRange").value = bpm;
  $("bpmUnit").textContent = tr("拍 / 分鐘", "beats / min");   // 拍 = 拍點響一下(每 2 或 4 個音,看選單)
  const examT = cur && !cur.free ? cur.tempo : null;
  $("bpmReset").hidden = !examT;
  if (examT) {
    const pct = Math.round(100 * bpm / examT.bpm);
    $("bpmPct").textContent = pct === 100 ? "" : tr(`考試速度的 ${pct}%`, `${pct}% of exam tempo`);   // 等於考試速度:副標已經寫了,數字後面不再寫「考試」
    // 不寫 ♩ / ♪ 的換算(自學者看不懂):考試速度的數字 + 每拍幾個音
    $("examTempo").textContent = tr(`考試速度 ${examT.bpm}(每拍 ${NOTES_PER_UNIT[u]} 個音${u === "q." ? ",三連音" : ""})`,
      `Exam tempo ${examT.bpm} (${NOTES_PER_UNIT[u]} ${u === "q." ? "triplet " : ""}notes per beat)`);
  } else if (u === "e16") { $("bpmPct").textContent = ""; $("examTempo").textContent = tr("原譜 ♩ 60–108 = ♪ 120–216", "Hanon ♩ 60–108 = ♪ 120–216"); }   // 拍點在選單上
  else if (u === "q.") { $("bpmPct").textContent = ""; $("examTempo").textContent = tr("三連音:每拍 3 個音", "Triplets: 3 notes per beat"); }
  else if (u === "q16" && cur && cur.type !== "hanon") { $("bpmPct").textContent = ""; $("examTempo").textContent = ""; }   // 拍點在選單上,不重複
  else if (u === "q16") { $("bpmPct").textContent = ""; $("examTempo").textContent = ex && ex.rhythm !== "even" ? tr("附點節奏 · 原譜速度 60–108", "Dotted · Hanon tempo 60–108") : tr("原譜速度 60–108", "Hanon tempo 60–108"); }
  else if (cur && cur.daily) { $("bpmPct").textContent = ""; $("examTempo").textContent = tr("自動調整", "Auto"); }   // 段落:速度卡縮成一行(− 60 +)
  else { $("bpmPct").textContent = ""; $("examTempo").textContent = ex && (ex.timeHidden || ex.exact) ? "" : tr("每拍 2 個八分音符", "2 quavers per beat"); }   // 今日練習的關卡:拍號印在譜上,一拍一下拍點   // 拍點 ♪ 在選單上,不重複
  $("beats").innerHTML = "<i class=\"first\"></i>" + "<i></i>".repeat(beatsPerBar() - 1);
}
/* ♪ 拍點時速度數字是 ♩ 的兩倍:上限 300(♪ = 300 等於 ♩ = 150) */
function maxBpm(){ return 300; }   // 速度上限一律 300(使用者要求)
function setBpm(v, fromUser){
  bpm = Math.max(30, Math.min(maxBpm(), Math.round(v)));
  if (fromUser && cur) {
    if (cur.daily) cur.tempo.bpm = bpm;   // 今日練習:只改這一次(不寫進自由練習的速度)
    else if (cur.free && cur.type === "broken") { S.freeBpm.broken = bpm; cur.tempo.bpm = bpm; }
    else if (cur.free) { S.freeBpm[S.tab] = unitOf() === "e16" ? bpm / 2 : S.tab !== "hanon" && unitOf() === "q16" ? Math.min(300, bpm * 2) : bpm; cur.tempo.bpm = bpm; }
    else S.tempoPct = Math.round(100 * bpm / cur.tempo.bpm);
    store.save();
  }
  syncTempoUI();
  retempo();
  if (dseg) syncReady();
}
/* − / +:點一下 ±1;按住 0.4 秒後開始連續增減,越按越快(每次 ±1 → 0.6 秒後 ±2 → 1.6 秒後 ±5) */
function holdRepeat(btn, dir){
  let timer = 0, t0 = 0, fired = false;
  const step = () => {
    const held = performance.now() - t0;
    const amt = held > 1600 ? 5 : held > 1000 ? 2 : 1;
    setBpm(bpm + dir * amt, true);
    timer = setTimeout(step, held > 1000 ? 70 : 110);
  };
  const start = e => {
    if (e.button > 0) return;
    e.preventDefault();
    fired = true; t0 = performance.now();
    setBpm(bpm + dir, true);
    timer = setTimeout(() => { t0 = performance.now() - 400; step(); }, 400);
    try { btn.setPointerCapture(e.pointerId); } catch (err) {}
  };
  const stop = () => { clearTimeout(timer); timer = 0; };
  btn.addEventListener("pointerdown", start);
  ["pointerup", "pointercancel", "lostpointercapture"].forEach(ev => btn.addEventListener(ev, stop));
  btn.addEventListener("contextmenu", e => e.preventDefault());
  // 鍵盤(Enter / 空白鍵)沒有 pointer 事件:照一般點擊 ±1
  btn.addEventListener("click", () => { if (fired) { fired = false; return; } setBpm(bpm + dir, true); });
}
holdRepeat($("bpmDown"), -1);
holdRepeat($("bpmUp"), +1);
$("bpmRange").oninput = () => setBpm(Number($("bpmRange").value), true);
// 點滑桿任何位置都跳到那裡、按住左右拖(手機上只能抓圓鈕太難滑到)
{
  const range = $("bpmRange");
  const setFromX = (e) => {
    const r = range.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const min = Number(range.min), max = Number(range.max);
    setBpm(Math.round(min + t * (max - min)), true);
  };
  let dragging = false;
  range.addEventListener("pointerdown", (e) => { dragging = true; try { range.setPointerCapture(e.pointerId); } catch {} setFromX(e); });
  range.addEventListener("pointermove", (e) => { if (dragging) setFromX(e); });
  const end = () => { dragging = false; };
  range.addEventListener("pointerup", end); range.addEventListener("pointercancel", end);
}
$("bpmReset").onclick = () => { if (cur && !cur.free) { S.tempoPct = 100; store.save(); setBpm(cur.tempo.bpm); } };

/* ── 音訊 ── */
const VEL = { f: 92, p: 42, mf: 68, "cresc-dim": 60 };
function demoVel(){ return cur && cur.dynamic ? VEL[cur.dynamic] : 64; }
let samplesReady = false;
/* 播放鈕外圈的載入進度(跟著百分比跑);p = null 表示還不知道進度(讀清單中),外圈轉一小段 */
let loadProg = null;
function setRing(p){
  loadProg = p;
  const r = $("playRing"); if (!r) return;
  r.classList.toggle("indet", p == null);
  r.querySelector(".ring-fg").style.strokeDashoffset = String(p == null ? 0.82 : 1 - Math.max(0.03, p));
}
/* 同一題只載一次:打開網頁時已經在背景載,按播放就接著等同一個工作(以前會再開一份,手機網路慢時要等兩倍) */
let preloadJob = null;
/* 回傳這一題的取樣有沒有載好(以前用全域的 samplesReady:上一題載好、這一題載失敗時會靜音播放) */
function preloadSamples(){
  if (!cur) return Promise.resolve(false);
  if (preloadJob && preloadJob.ex === ex) return preloadJob.p;
  const job = { ex, p: null };
  job.p = (async () => {
    try {
      setRing(null);   // 不在這裡建立 AudioContext(要等使用者的手勢,見 audio.js 的 dec())
      const notes = playbackEvents(ex, cur, "both").concat(melOn() ? melodyEvents(ex) : []).map(e => ({ midi: e.midi, vel: e.vel || demoVel() }));
      setMsg("loadingMsg", () => tr("載入鋼琴聲音…", "Loading piano…"));
      await audio.loadPianoFor(notes, 6, p => {
        if (preloadJob !== job) return;
        setRing(p * 0.95);
        setMsg("loadingMsg", () => tr("載入鋼琴聲音… ", "Loading piano… ") + Math.round(p * 100) + "%");
      });
      await audio.loadClick().catch(() => {});
      samplesReady = true;
      if (preloadJob === job) { setRing(1); setMsg("loadingMsg", null); }
      return true;
    } catch (e) {
      if (preloadJob === job) {
        preloadJob = null;   // 失敗的不留著:下次按播放重新載
        setMsg("loadingMsg", () => tr("鋼琴聲音載入失敗,再按一次播放重試(需要網路,之後會存在裝置上)", "Could not load the piano — tap play to retry (needs internet once; then cached)"));
      }
      return false;
    }
  })();
  preloadJob = job;
  return job.p;
}
/* 最多等 ms 毫秒(iOS 的 AudioContext 被來電、鎖屏打斷後 resume() 可能永遠不回來,以前就會卡在「準備中」、之後怎麼按都沒反應) */
const within = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);

/* ── 示範播放:預備拍兩小節 + 節拍器 ── */
const COUNT_IN_BARS = 2;   // 預備拍兩小節:第一小節聽速度、第二小節準備下手(2/4 只有一小節太短)
let play = null, starting = 0;   // starting:正在準備播放(載入取樣中)的序號;連點、換題時舊的準備作廢
/* 排程:從時間 from(秒)之後開始的音與拍點(開始播放時是全部;播放中改速度時只排還沒到的) */
function schedulePlay(p, from){
  const { t0, beatSec, clickSec, count, pre } = p;
  for (const h of ["rh", "lh", "mel"]) {
    const arr = p.byHand[h];
    arr.forEach(e => {
      const on = t0 + e.beat * beatSec;
      if (on < from) return;
      // 今日練習的關卡(exact):每個音自己的長度、斷奏、力度(按住的音、和弦、休止都照譜)
      if (e.exact) {
        const off = e.stacc ? on + Math.min(0.12, e.len * beatSec * 0.45) : on + e.len * beatSec + 0.015;
        if (h === "mel" || (!clickOnlyOn() && !p.solo)) audio.playPianoNote(e.midi, on, off, off, e.vel + (Math.random() * 6 - 3), false);   // 合奏旋律:只有拍點的時候也彈
        return;
      }
      const next = arr.find(x => x.beat > e.beat + 1e-6);   // 同一隻手下一個「不同時」的音(雙音的兩個音同時按)
      const legatoEnd = next ? t0 + next.beat * beatSec + 0.015 : on + e.len * beatSec;
      const off = p.stacc && next ? on + Math.min(0.12, (next.beat - e.beat) * beatSec * 0.45) : legatoEnd;
      if (!clickOnlyOn() && !p.solo) audio.playPianoNote(e.midi, on, off, off, p.velAt(e.beat) + (e.idx === 0 ? 6 : 0) + (Math.random() * 6 - 3), false);
    });
  }
  const totalClicks = Math.ceil(p.endBeat * beatSec / clickSec);
  // 今日練習的拍點模式(只響 1、3 拍、第 1 拍、中途消失 2 小節;預備拍一律響)
  for (let b = -pre; b < totalClicks; b++) { const at = t0 + b * clickSec; if (at >= from && clickPlays(p.click, b, count, totalClicks)) audio.playClick(at, ((b % count) + count) % count === 0); }
}
/* 播放中改速度:停在目前的位置(拍數),照新速度把後面的音重排(以前要停下來重按才會變) */
let retempoTimer = 0;
function retempo(){
  if (!play) return;
  clearTimeout(retempoTimer);
  retempoTimer = setTimeout(() => {
    if (!play) return;
    const clickSec = 60 / bpm, beatSec = clickSec / NOTES_PER_UNIT[unitOf()] * ex.sub;
    if (Math.abs(beatSec - play.beatSec) < 1e-6) return;
    const now = audio.audioNow(), from = now + 0.06;
    const beat = (from - play.t0) / play.beatSec;           // 新速度從這一拍接下去
    audio.cancelFrom(from);
    play.t0 = from - beat * beatSec; play.beatSec = beatSec; play.clickSec = clickSec;
    play.mark = Math.max(0, beat); play.heard = false;   // 換了速度:要用新的速度再播 2 小節
    schedulePlay(play, from);
  }, 60);
}
/* 按播放時樂譜要整份看得到(手機橫放時常常被底部分頁列蓋住一半):沒露出來就捲過去 */
let landScroll = null;   // 手機橫放:播放前的捲動位置(播完捲回去,播放鈕才看得到)
function revealScore(){
  if (isPhoneLand()) {
    // 樂譜卡貼在工具列下面、下方分頁列收起來,樂譜延伸到底
    if (landScroll == null) landScroll = scrollY;
    document.body.classList.add("land-play");
    if (fitLandZoom()) movePlayline(0, false);   // 播放時樂譜放大到滿版
    const top = $("scoreCard").getBoundingClientRect().top - document.querySelector("header").getBoundingClientRect().bottom - 6;
    if (Math.abs(top) > 2) window.scrollBy({ top, behavior: "smooth" });
    return;
  }
  const r = $("scoreCard").getBoundingClientRect(), bar = document.querySelector(".tabbar");
  const bt = bar ? bar.getBoundingClientRect().top : innerHeight;
  const bottom = bt > innerHeight / 2 ? bt : innerHeight;   // 手機橫放時分頁列在左邊(top = 0),下面沒有東西擋
  if (r.bottom > bottom - 4) window.scrollBy({ top: Math.min(r.bottom - bottom + 8, r.top - 4), behavior: "smooth" });
  else if (r.top < 0) window.scrollBy({ top: r.top - 8, behavior: "smooth" });
}
/* 播放的準備或排程中途出錯時,不能讓 starting 卡著(之後怎麼按都不理);錯誤原因直接寫在卡片上,方便回報 */
async function startPlayback(){
  // 這個子項目播放過一次:說明不再出現(換題目時才收起來,播放中版面不動)
  if (cur && cur.free && INTRO[S.tab] && !S.intro[S.tab]) { S.intro[S.tab] = true; store.save(); }
  try { await startPlaybackInner(); }
  catch (e) {
    console.error(e);
    starting = 0; $("playBtn").classList.remove("busy");
    if (play) stopPlayback();
    $("playLabel").textContent = T("play");
    setMsg("loadingMsg", () => tr("播放失敗:", "Playback failed: ") + (e && e.message || e));
  }
}
async function startPlaybackInner(){
  if (!cur || starting) return;
  const token = starting = Date.now() + Math.random();
  const q0 = cur, show0 = show;
  const ctx = audio.ensureAudio();
  $("playLabel").textContent = tr("準備中…", "Preparing…"); $("playBtn").classList.add("busy");
  if (ctx.state !== "running") await within(ctx.resume().catch(() => {}), 1500);
  const loaded = await preloadSamples();
  await within(audio.masterReady, 1500);
  // 準備期間換了題目、換了手、按了停止 → 不播
  if (starting !== token || cur !== q0 || show !== show0) { if (starting === token) { starting = 0; $("playLabel").textContent = T("play"); } $("playBtn").classList.remove("busy"); return; }
  starting = 0; $("playBtn").classList.remove("busy");
  if (!loaded) { $("playLabel").textContent = T("play"); return; }
  let events = playbackEvents(ex, cur, show).concat(melOn() ? melodyEvents(ex) : []);
  const u = unitOf(), clickSec = 60 / bpm, noteSec = clickSec / NOTES_PER_UNIT[u];
  const beatSec = noteSec * ex.sub;                      // 樂譜上一個四分音符的秒數
  const count = beatsPerBar(), pre = count * COUNT_IN_BARS;
  const t0 = ctx.currentTime + 0.15 + pre * clickSec;
  const stacc = cur.articulation === "staccato";
  let endBeat = ex.exact ? ex.bars * ex.bar / ex.div : Math.max(...events.map(e => e.beat + e.len));   // 關卡:整數小節(最後可能是休止)
  // 今日練習:短的題目重複到 4 小節(拍點中途消失 = 8 小節),整數小節一輪
  const dp = dailyPlay();
  let period = null;   // 重複的那一段有多長(播放軸每一輪從頭走)
  if (dp) {
    const barQ = count * clickSec / beatSec, per = Math.ceil(endBeat / barQ - 1e-6) * barQ, reps = Math.max(1, Math.ceil(dp.bars * barQ / per - 1e-6));
    if (reps > 1) { const one = events; events = []; for (let k = 0; k < reps; k++) for (const e of one) events.push({ ...e, beat: e.beat + k * per }); endBeat = (reps - 1) * per + endBeat; period = per; }
  }
  // 漸強再漸弱(p–f–p):前半漸強、後半漸弱
  const velAt = beat => cur.dynamic === "cresc-dim" ? Math.round(42 + 50 * (1 - Math.abs(2 * beat / endBeat - 1))) : demoVel();
  const byHand = { rh: [], lh: [], mel: [] };
  events.forEach(e => byHand[e.hand].push(e));
  play = { t0, beatSec, clickSec, endBeat, raf: 0, byHand, stacc, velAt, count, pre, click: dp ? dp.click : "every", solo: !!(dp && dp.solo), period,
    mark: 0, heard: false, heardQ: 2 * count * clickSec / beatSec };   // 今日練習:預備拍之後播過 2 小節,「做到了」才能按
  schedulePlay(play, -Infinity);
  revealScore();
  $("playLabel").textContent = T("stop");
  $("playIcon").innerHTML = '<rect x="6" y="6" width="12" height="12" rx="1.5"/>';
  const tick = () => {
    if (!play) return;
    const now = audio.audioNow();
    const beat = (now - play.t0) / play.beatSec;
    showBeat((now - play.t0) / play.clickSec);
    if (dp && !play.heard && beat - play.mark >= play.heardQ) { play.heard = true; heardAt = heardKey(); syncReady(); }
    movePlayline(Math.max(0, play.period ? beat % play.period : beat), true);
    if (beat > play.endBeat + 0.5) {
      const sec = play.endBeat * play.beatSec; stopPlayback(true, !!(loopOn() && cur)); logPractice(sec);
      // 循環:再來一輪(有預備拍);勾了「每輪 +4」就每輪快 4(拍點 ♪ 時快 8,等於 ♩ +4)
      if (loopOn() && cur) { if (S.ramp && !dseg) setBpm(bpm + (unitOf() === "e16" ? 8 : 4), true); startPlayback(); }   // 今日練習的速度照速度階梯
      return;
    }
    play.raf = requestAnimationFrame(tick);
  };
  play.raf = requestAnimationFrame(tick);
}
function stopPlayback(natural, keepView){
  starting = 0; $("playBtn").classList.remove("busy");
  // 手機橫放:播完(或停止)捲回播放前的位置、分頁列放回來;循環的下一輪不捲
  if (!keepView && landScroll != null) {
    document.body.classList.remove("land-play");
    window.scrollTo({ top: landScroll, behavior: "smooth" }); landScroll = null;
    fitLandZoom();   // 停止後縮回第一個畫面放得下的大小
  }
  if (play) { cancelAnimationFrame(play.raf); play = null; if (!natural) audio.stopAll(); }
  if (osmd && noteXs.length) { $("scroll").scrollLeft = 0; movePlayline(0, false); }
  $("playLabel").textContent = T("play");
  $("playIcon").innerHTML = '<path d="M7 4v16l13-8z"/>';
  showBeat(null);
}
/* 手機橫放播放中看不到播放鈕:點樂譜就停止(並捲回播放鈕) */
$("stage").addEventListener("click", () => { if (play && document.body.classList.contains("land-play")) stopPlayback(); });
/* 準備中再按一次不取消(以前會取消 → 看起來像「按了沒反應」);播放中按 = 停止 */
$("playBtn").onclick = () => { if (play) stopPlayback(); else if (!starting) startPlayback(); };

/* ── 拍點燈號(示範播放時亮)── */
function showBeat(click){
  const dots = $("beats").children, n = dots.length;
  const k = click == null || click < -n * COUNT_IN_BARS ? -1 : ((Math.floor(click + 1e-6) % n) + n) % n;
  for (let i = 0; i < dots.length; i++) dots[i].classList.toggle("on", i === k);
}

/* ══ 播放選項 ══(今日練習的段落不用:速度卡藏起來,播放照段落的設定) */
const loopOn = () => !!S.loop && !dseg, clickOnlyOn = () => !!S.clickOnly && !dseg;
function syncPlayOpts(){
  $("optLoop").setAttribute("aria-pressed", String(!!S.loop));
  $("optRamp").setAttribute("aria-pressed", String(!!S.ramp));
  $("optRamp").hidden = !S.loop;   // 沒開循環播放時「每輪加快 4」沒有作用:藏起來(跟 DrumDrill 一樣)
  $("optClick").setAttribute("aria-pressed", String(!!S.clickOnly));
  if (cur) syncPlayCap();
}
for (const [id, k] of [["optLoop", "loop"], ["optRamp", "ramp"], ["optClick", "clickOnly"]]) $(id).onclick = () => { S[k] = !S[k]; store.save(); syncPlayOpts(); };
syncPlayOpts();


/* 桌機快捷鍵(外框轉給目前的模組):空白鍵 播放/停止、↑↓ 速度 ±1、N 下一題(檢定) */
export function onKey(e){
  if (e.code === "Space") { e.preventDefault(); $("playBtn").click(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); setBpm(bpm + 1, true); }
  else if (e.key === "ArrowDown") { e.preventDefault(); setBpm(bpm - 1, true); }
  else if ((e.key === "n" || e.key === "N") && S.tab === "exam") { const b = !$("nextBtn").hidden ? $("nextBtn") : $("drawBtn"); if (!b.hidden && !b.disabled) b.click(); }
}

/* ══ 練習紀錄(js/shared/practicelog.js,跟 DrumDrill 同一份):示範完整播完、或按了 ✓ / ⚠ 標記算一次;
   S.log = { "YYYY-MM-DD": { n: 次數, sec: 秒數 } }(只留最近 400 天);每週目標 S.goal(分鐘,點一下換) */
function logPractice(sec){
  S.log = S.log || {};
  // 今日練習的段落:秒數也算進這一段;次數改成「完成一段算一次」(dNext)
  if (dseg && cur && cur.daily) { daily.addSec(sec); addLog(S.log, { sec, n: 0 }); store.save(); renderLog(); dcard.render(); return; }
  addLog(S.log, { sec, n: 1 });
  store.save(); renderLog();
}
function renderLog(){
  S.log = S.log || {};
  paintLog($, S.log, S.goal);
  $("logMin").textContent = Math.floor(today(S.log).sec / 60);
}
$("goalBtn").onclick = () => { S.goal = nextGoal(S.goal); store.save(); renderLog(); };

/* 檢定分頁上方的進度:通過幾項 / 本級幾項 */
export function examStatus(){
  if (!SY || !S.exam) return "";
  const qs = examQuestions(), good = qs.filter(q => S.mastery[q.key] === "good").length;
  return tr(`會了 ${good}/${qs.length}`, `Got it ${good}/${qs.length}`);
}


/* ══ 今日練習(js/shared/daily.js 引擎 + js/shared/dailycard.js 卡片;路線在 js/tech/routes.js,第一階段是暫時的示範關卡)══
   技巧分頁最上面的卡片 → 「開始今天的練習」→ 一段一段:暖身(現有五指位置 / 本級音階,不過關、只記時間)、路線的這一關、複習(用這一盒的變化:
   節奏型、觸鍵、強弱、換調、拍點模式)。▶ 示範 + 拍點陪你彈(拍點模式不是每拍都響的那一次 ▶ 只有拍點)→ 自己按「做到了 / 還要練」。
   題目 q.daily = 段落種類(右手 / 左手 / 雙手只換顯示、速度不寫進自由練習的設定);進行中子項目分段鈕都不亮(ctx.setSubActive);點子項目或到檢定頁 = 暫停 */
const hashDay = k => Number(k.replace(/-/g, "")) || 0;
const warmName = it => it.name || questionText(it.q)[0];   // 本級項目照題目名稱(不寫考試名稱)
/* 暖身:有選考試 → 本級項目(沒標「會了」的優先;畫面不寫考試名稱);
   沒選 → 照手指路線的進度(routes.js 的 warmFor:五指兩手輪流 → 雙手四分 → 八分 → 一個八度音階),調 = 今天伴奏那一關的調;♩=60 */
function warmItem(d, today){
  if (S.exam && !S.exam.auto && SY) {
    const all = examPool(); let pool = all.filter(q => S.mastery[q.key] !== "good"); if (!pool.length) pool = all;
    if (pool.length) { const q = pool[hashDay(today) % pool.length]; return { exam: q.key, q: { ...q }, bpm: q.tempo.bpm, unit: q.tempo.unit }; }
  }
  const passed = (r, id) => !!(d.lv[r + "/" + id] && d.lv[r + "/" + id].passed);
  const wid = warmFor(passed); if (!wid) return null;   // 一關都還沒過(第一天):不排暖身,直接從第 0 組開始
  const w = WARM_LEVELS[wid];
  // 調 = 今天伴奏那一關的調,但只用學過的調(還沒學過 → C)
  const acc = d.prog.accomp && findLevel({ r: "accomp", id: d.prog.accomp.at }), k0 = (acc && acc.key) || "C", key = keyLearned(k0, passed) ? k0 : "C";
  return { q: { ...w.q, rkey: key }, name: [KEYS[key][0] + w.name[0], KEYS[key][1] + " " + w.name[1]], bpm: 60 };
}
/* 伴奏的關名寫實際和弦(「C 和 G7(I、V7)」;chordName 的關):換調複習自動換和弦名 */
function levelName(s){
  const L = s.level; if (!L || !L.chordName) return L ? L.name : "";
  const k = (s.vary && s.vary.q && s.vary.q.rkey) || L.key || "C", K = keyInfo(k), uniq = [...new Set(L.prog)], names = uniq.map(ch => chordName(K, ch));
  const join = (a, sep, and) => (a.length < 2 ? a.join("") : a.slice(0, -1).join(sep) + and + a[a.length - 1]);
  return [`${join(names, "、", " 和 ")}(${uniq.join("、")})`, `${join(names, ", ", " and ")} (${uniq.join(", ")})`];
}
const daily = createDaily({ routes: ROUTES, load: () => S.daily, save: d => { S.daily = d; store.save(); }, extras: { warm: warmItem, vary: adaptVary } });
const dcard = createDailyCard({ $, daily,
  labels: { ok: ["做到了", "Did it"], again: ["還要練", "Not yet"], verb: ["彈", "play"], good: ["很好!", "Good!"],
    // 狀態一句短話(fold-280 不超過兩行);過關規則改成到了目標速度在標籤後面顯示「穩 ●○○」
    hint: ["跟著彈,做到了按 ✓", "Play along, then ✓"],
    get solo(){ return melOn() ? ["你彈左手,做到了按 ✓", "You play the LH, then ✓"] : ["自己彈,做到了按 ✓", "Play it yourself, then ✓"]; } },
  warmName, levelName, log: () => S.log,
  onStart: () => { dShow(daily.begin()); window.scrollTo({ top: 0 }); },
  onNext: () => dNext(), onPause: () => dExit(),
  onMore: () => { const s = daily.addExtra(); if (s) dShow(s); },
  barHost: el => { if (ctx && ctx.subBar) ctx.subBar(el, "tech"); },   // 進行中:子項目列換成今日練習的那一行
  onOk: () => dTry("ok"), onAgain: () => dTry("again"),
  onBack: () => { stopPlayback(); if (daily.back()) dShow(daily.seg()); } });
/* 「做到了」要先用現在的速度播過一輪(預備拍之後 2 小節)才能按:同一段、同一關、同一個速度 */
let heardAt = null;
const heardKey = () => (dseg ? `${dseg.i}/${dseg.lv || ""}/${bpm}` : null);
function syncReady(){ dcard.ready(!!dseg && heardAt === heardKey()); }
/* 這一段的播放:4 小節(中途消失 = 8 小節);拍點模式不是每拍 = 只有拍點 */
function dailyPlay(){
  if (!dseg || !cur || !cur.daily) return null;
  const click = dseg.click || "every";
  return { bars: click === "gap" ? 8 : 4, click, solo: dseg.k !== "warm" && click !== "every" };
}
/* 這一段的題目:關卡的 q + 這一次的變化(複習),速度 = 引擎給的 */
function dailyQ(s){
  const base = s.k === "warm" ? s.item.q : { ...s.level.q, ...((s.vary && s.vary.q) || {}) };
  const q = JSON.parse(JSON.stringify(base));
  const hanon = q.type === "hanon";
  q.tempo = s.k === "warm" && s.item.unit ? { unit: s.item.unit, bpm: s.item.bpm } : { unit: hanon ? "q16" : "q", bpm: s.k === "warm" ? s.item.bpm : s.bpm };
  q.sub = q.tempo.unit === "q." ? 3 : hanon ? 4 : 2;
  q.free = true; q.daily = s.k;
  if (s.k !== "warm") q.mseed = hashDay(daily.today().date);   // 合奏旋律:同一關同一天同一條
  q.key = hanon ? `hanon|${q.no}|${q.tonic}|${q.hands}|${q.rhythm}${q.octaves === 1 ? "|1" : ""}` : masteryKey(q);
  return q;
}
/* 顯示一段 */
function dShow(s, status = null){
  stopPlayback();
  if (!s) { dExit(); return; }
  dseg = s; dcard.showing = true; namesSeg = null;
  ROOT.classList.add("daily-on");   // 段落進行中:練習紀錄卡、速度卡的選項藏起來(app.css)
  if (ctx && ctx.setSubActive) ctx.setSubActive(false, "tech");
  ROOT.querySelectorAll(".pane").forEach(p => { p.hidden = true; });
  setQuestion(dailyQ(s), "daily");
  syncReady();
  dcard.render(); dcard.renderStep(s, { status });
}
/* 離開段落(暫停或今天練完):回到一般畫面 */
function dExit(){
  stopPlayback();
  dseg = null; dcard.showing = false; syncNamesBtn();
  ROOT.classList.remove("daily-on");
  if (ctx && ctx.setSubActive) ctx.setSubActive(true, "tech");
  dcard.renderStep(null);
  if (S.tab !== "exam") dcard.render();
}
/* 自評一次:做到了 / 還要練 */
function dTry(self){
  if (!dseg || dseg.k === "warm") return;
  if (self === "ok" && !dcard.isReady) return;   // 還沒播過:不算嘗試
  stopPlayback();
  const s = dseg, res = daily.attempt({ bpm, self });
  const txt = () => dcard.resultText(res, s);
  if (res.passed || res.verdict === "steady") cue();
  if (res.passed && res.cont) { dShow(daily.seg(), txt); return; }
  dseg = daily.seg();
  if (s.k === "route") { bpm = res.nextBpm; cur.tempo.bpm = bpm; syncTempoUI(); }
  renderQText(cur, "daily"); fitTitle();
  syncReady();
  dcard.renderStep(dseg, { status: txt, passedDone: res.passed || s.k === "review" });
  dcard.render();
}
/* 過關、做到了:一個短的取樣音(Salamander 高音 C6;不用合成音) */
function cue(){ audio.ensureAudio(); audio.loadPianoFor([{ midi: 84, vel: 70 }], 1).then(() => { const t = audio.audioNow() + 0.03; audio.playPianoNote(84, t, t + 0.25, t + 0.3, 70, false); }).catch(() => {}); }
/* 下一段:練過的那一段算一次練習 */
function dNext(){
  stopPlayback();
  const t = daily.today(), i = t.i, worked = t.sec[i] > 0 || t.tries[i] > 0;
  const s = daily.next();
  if (worked) { S.log = S.log || {}; addLog(S.log, { n: 1 }); store.save(); renderLog(); }
  if (s) { dShow(s); return; }
  dExit(); switchTab(S.tab);
}

/* ── 啟動(外框呼叫)── */
export async function start(c){
  ctx = c;
  setExam(c.exam);
  // 資料檔帶版本指紋(index.html 的 pdVersions,由 tools/build/stamp.mjs 產生),更新後不會讀到舊的快取
  let ver = {}; try { ver = JSON.parse(document.getElementById("pdVersions").textContent); } catch (e) {}
  const data = f => fetch(f + (ver[f] ? "?v=" + ver[f] : "")).then(r => r.json());
  const [sy, fg] = await Promise.all([data("data/syllabus.json"), data("data/fingerings.json")]);
  SY = sy; FG = fg;
  // 本級要求一律展開(還沒選題目時放在題目卡正下方;精簡 2026-10)
  if (S.exam) renderExam();
  renderLog();
  dcard.render();
  window.__tech = { daily, dcard, get dseg(){ return dseg; }, dTry, dNext, dShow, get cur(){ return cur; }, get ex(){ return ex; }, get osmd(){ return osmd; },
    get state(){ return { play: !!play, starting: !!starting, bpm, show, scheduled: audio.scheduledCount(), noteXs: noteXs.length }; }, setQuestion, examQuestions, examPool, switchTab, fitTitle, S, SY };
}
