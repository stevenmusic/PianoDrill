/* FingerDrill 主程式:音階 / 琶音 / 哈農 / 檢定 四個分頁,練習面板(題目、樂譜、節拍器)共用 */
import * as store from "./store.js";
import { gradeOf, questionsFor, applyFilter, drawQuestion, CATEGORIES, masteryKey, UNIT_SYM, NOTES_PER_UNIT } from "./syllabus.js";
import { buildExercise, questionText } from "./exercise.js";
import { exerciseToMusicXML, playbackEvents } from "./musicxml.js";
import { noteLabelStr } from "./theory.js";
import { tr, T, applyStatic, setLang, getLang, pairText, unpair } from "./i18n.js";
import * as audio from "./audio.js";

const $ = id => document.getElementById(id);
const S = store.load();
let SY = null, FG = null;
const tabCur = {};       // 每個分頁目前的題目
let cur = null, ex = null, show = "both", lastKey = null;
let bpm = 60;
let osmd = null;

/* ── 主題 ── */
function applyTheme(){
  const light = S.theme === "light";
  document.body.classList.toggle("light", light);
  $("themeToggle").setAttribute("aria-pressed", String(light));
  document.querySelector('meta[name="theme-color"]').content = light ? "#FBF7EE" : "#0C0A07";
}
$("themeToggle").onclick = () => { S.theme = S.theme === "light" ? "dark" : "light"; store.save(); applyTheme(); };
applyTheme();
applyStatic();
/* 語言切換:靜態文字換掉,目前分頁與題目重畫(題目、清單、選擇器都會換語言) */
$("langToggle").onclick = () => {
  setLang(getLang() === "zh" ? "en" : "zh");
  if (!SY) return;
  if (!$("onboard").hidden) fillGrades($("obGrade"), obState.system, Number($("obGrade").value));
  const keep = cur, tab = S.tab;
  if (S.exam) renderExam();
  switchTab(tab);
  if (keep) setQuestion(keep, tab);
  renderLog();
};

function segBind(el, get, set){
  const seg = typeof el === "string" ? $(el) : el;
  const sync = () => seg.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === String(get()))));
  seg.onclick = e => { const b = e.target.closest("button"); if (!b || b.disabled) return; set(b.dataset.v); sync(); };
  sync();
  return sync;
}
// 手機:設定卡收成一行,點了展開
document.querySelectorAll(".setup-summary").forEach(btn => btn.onclick = () => {
  const card = btn.closest(".card"), open = !card.classList.contains("open");
  card.classList.toggle("open", open); btn.setAttribute("aria-expanded", String(open));
});

/* ══ 音階 / 琶音 選擇器 ══ */
const MAJ_KEYS = ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"];
const MIN_KEYS = ["A", "E", "B", "F#", "C#", "G#", "Eb", "Bb", "F", "C", "G", "D"];
const STARTS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const keyOpts = list => list.map(k => [k, noteLabelStr(k)]);
const HANDS = () => [["RH", tr("右手", "RH")], ["LH", tr("左手", "LH")], ["HT", tr("雙手", "Both")]];
const ARTS = () => [["legato", tr("圓滑", "Legato")], ["staccato", tr("斷奏", "Staccato")]];
const OCTS = n => [1, 2, 3, 4].slice(0, n).map(o => [o, tr(o + "八度", o + " oct.")]);
/* 級數名稱:初級 / 1 級(Initial / Grade 1) */
const gradeLabel = g => g.grade === 0 ? tr("初級", "Initial") : tr(g.grade + " 級", "Grade " + g.grade);

// 拍點:♪ = 每 2 個音打一下(預設)、♩ = 每 4 個音(一拍)打一下;樂譜不變,只換節拍器的拍點與速度數字
const HANON_NOS = () => Array.from({ length: 20 }, (_, i) => [i + 1, String(i + 1)]);   // 第 1–20 首(第 39、41 首的音階、琶音在音階/琶音分頁,指法照它們核對)
const PULSE = () => ["pulse", tr("拍點", "Pulse"), [["e", tr("♪ 每 2 音", "♪ per 2")], ["q", tr("♩ 每 4 音", "♩ per 4")]]];
const PICKERS = {
  scale: {
    defaults: { kind: "major", form: "harmonic", motion: "similar", key: "C", octaves: 2, hands: "HT", art: "legato", pulse: "e" },
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
    defaults: { kind: "major", inv: 0, key: "C", octaves: 4, hands: "HT", art: "legato", pulse: "e" },
    rows: p => [
      ["kind", tr("種類", "Type"), [["major", tr("大三和弦", "Major")], ["minor", tr("小三和弦", "Minor")], ["dom7", tr("屬七", "Dom. 7th")], ["dim7", tr("減七", "Dim. 7th")], ["broken", tr("分解和弦", "Broken")]]],
      (p.kind === "major" || p.kind === "minor") && ["inv", tr("轉位", "Position"), [[0, tr("原位", "Root")], [1, tr("第一轉位", "1st inv.")], [2, tr("第二轉位", "2nd inv.")]]],
      ["key", p.kind === "dim7" ? tr("起音", "Start") : tr("調", "Key"), keyOpts(p.kind === "minor" ? MIN_KEYS : p.kind === "dim7" ? STARTS : MAJ_KEYS)],
      ["hands", tr("手", "Hands"), HANDS()],
      ["art", tr("奏法", "Touch"), ARTS()],
      p.kind !== "broken" && PULSE()   // 分解和弦是三連音,一拍(三個音)打一下
    ].filter(Boolean),
    toQ: p => {
      const q = { hands: p.hands, octaves: 4, articulation: p.art, motion: "similar", tonic: p.key };   // 琶音一律四個八度(使用者要求,不給 1–3 八度);分解和弦另外設兩個八度
      if (p.kind === "major" || p.kind === "minor") Object.assign(q, { type: "arpeggio", quality: p.kind, inversion: Number(p.inv), cat: "arpeggio" });
      else if (p.kind === "broken") Object.assign(q, { type: "broken", quality: "major", cat: "broken", octaves: 1 });   // 照 Trinity 1 級:一個八度、三連音
      else Object.assign(q, { type: p.kind, quality: "major", cat: "seventh" });
      return q;
    }
  },
  /* 哈農:曲目 1–20、調(12 個大調,同一個樣式移調)、手 */
  hanon: {
    defaults: { no: 1, key: "C", hands: "HT", rhythm: "even", pulse: "q", moreKeys: false },
    rows: p => [
      ["no", tr("曲目", "No."), HANON_NOS()],
      // 調:預設只有原譜的 C 大調;「其他調」展開 12 個調(進階,指法照 C 大調原譜)
      ["key", tr("調", "Key"), p.moreKeys || p.key !== "C" ? keyOpts(MAJ_KEYS).concat([["__less", tr("收起", "Less")]])
        : [["C", tr("C(原譜)", "C (orig.)")], ["__more", tr("其他調…", "Other keys…")]]],
      ["hands", tr("手", "Hands"), HANDS()],
      ["rhythm", tr("節奏", "Rhythm"), [["even", tr("原譜", "Even")], ["dotted", tr("附點", "Dotted")], ["reverse", tr("反附點", "Rev. dotted")]]],
      // 拍點:♩ = 每 4 個音一拍(原譜的速度記法)、♪ = 每 2 個音一拍(比較好數;樂譜不變,速度數字 ×2)
      PULSE()   // 跟音階、琶音同一個順序(♪ 每 2 音 → ♩ 每 4 音);哈農預設仍是 ♩
    ],
    toQ: p => ({ type: "hanon", no: Number(p.no), tonic: p.key, hands: p.hands, rhythm: p.rhythm, quality: "major", articulation: "legato", motion: "similar", cat: "hanon" })
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
  pane.querySelector(".rows").innerHTML = cfg.rows(p).map(([k, lbl, opts]) =>
    `<div class="prow"><span class="lbl">${lbl}</span><div class="opts" data-k="${k}">` +
    opts.map(([v, t]) => `<button class="opt" data-v="${v}" aria-pressed="${String(v) === String(p[k])}">${t}</button>`).join("") + `</div></div>`).join("");
  pane.querySelector(".sum").textContent = questionText(cfg.toQ(p)).join(" · ");
  renderQuick(tab);
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
  q.key = tab === "hanon" ? `hanon|${q.no}|${q.tonic}${q.quality === "minor" ? "m" : ""}|${q.hands}|${q.rhythm}` : masteryKey(q);
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

/* ══ 檢定分頁 ══ */
function examGrade(){ return gradeOf(SY, S.exam.system, S.exam.grade); }
// 只是點進檢定分頁看看(沒選考試、級數):auto = true,不算在準備考試,音階/琶音分頁不會多出「本級要求」(使用者反映題目被往下推)
function ensureExam(){ if (!S.exam) S.exam = { system: "abrsm", grade: 1, set: "A", auto: true }; }
function fillGrades(sel, system, grade){
  const sys = SY.systems[system];
  sel.innerHTML = sys.grades.map(g => `<option value="${g.grade}">${gradeLabel(g)}</option>`).join("");
  sel.value = String(sys.grades.some(g => g.grade === grade) ? grade : 1);
}
function filterObj(){ return { quality: S.filter.quality, cats: new Set(S.filter.cats), excludeMastered: S.filter.excludeMastered }; }
function examPool(){
  if (!S.exam) return [];
  const sys = SY.systems[S.exam.system];
  return sys.mode === "sets" ? examQuestions().filter(q => !(S.filter.excludeMastered && S.mastery[q.key] === "good")) : applyFilter(examQuestions(), filterObj(), S.mastery);
}
function renderExam(){
  ensureExam();
  const sys = SY.systems[S.exam.system], g = examGrade(), sets = sys.mode === "sets";
  fillGrades($("selGrade"), S.exam.system, S.exam.grade);
  syncSystemSeg(); syncSetSeg(); syncQualitySeg();
  $("fSet").hidden = !sets; $("fQuality").hidden = sets; $("fCats").hidden = sets;
  $("selMinor").value = S.minorForm;
  const present = new Set(examQuestions().map(q => q.cat));
  // 新的分類(例如雙音音階)第一次出現時預設選上
  for (const c of present) if (!S.filter.cats.includes(c) && !(S.filter.seen || []).includes(c)) S.filter.cats.push(c);
  S.filter.seen = [...new Set([...(S.filter.seen || []), ...present])];
  $("catChips").innerHTML = CATEGORIES.filter(c => present.has(c.id)).map(c =>
    `<button class="chip" data-cat="${c.id}" aria-pressed="${S.filter.cats.includes(c.id)}">${tr(c.zh, c.en)}</button>`).join("");
  $("excludeMastered").setAttribute("aria-pressed", String(S.filter.excludeMastered));
  pairText($("verifyNote"), () => tr("資料來源:", "Source: ") + sourceText(g) + tr("。", ". ")
    + (g.verified ? tr("已逐項核對官方大綱。", "Verified.") : tr("尚未核對。", "Not yet checked."))
    + (sets ? tr(" Trinity:整組都要彈,每一項的手、力度、奏法固定。", " Trinity: play all of Set A or B; hands, dynamics and touch are fixed.")
            : tr(" ABRSM:考官從清單點題,分手的項目會指定左手或右手。", " ABRSM: the examiner picks items and names the hand.")));
  $("examSummary").textContent = `${sys.name} · ${gradeLabel(g)}` + (sets ? ` · ${setName(S.exam.set)}` : "") + " · " + tr(`${examPool().length} 題`, `${examPool().length} items`);
  $("examChip").hidden = !!S.exam.auto; $("examChip").textContent = `${sys.name} ${gradeLabel(g)}`;
  renderList();
  if (S.tab === "exam") syncExamButtons();
}
const syncSystemSeg = segBind("systemSeg", () => S.exam ? S.exam.system : "abrsm", v => { ensureExam(); S.exam.system = v; delete S.exam.auto; store.save(); onExamChange(); });
const syncSetSeg = segBind("setSeg", () => S.exam ? S.exam.set : "A", v => { ensureExam(); S.exam.set = v; delete S.exam.auto; store.save(); onExamChange(); });
const syncQualitySeg = segBind("qualitySeg", () => S.filter.quality, v => { S.filter.quality = v; store.save(); renderExam(); });
$("selGrade").onchange = () => { ensureExam(); S.exam.grade = Number($("selGrade").value); delete S.exam.auto; store.save(); onExamChange(); };
$("selMinor").onchange = () => { S.minorForm = $("selMinor").value; store.save(); onExamChange(true); };
$("catChips").onclick = e => {
  const b = e.target.closest("[data-cat]"); if (!b) return;
  const c = b.dataset.cat, on = S.filter.cats.includes(c);
  S.filter.cats = on ? S.filter.cats.filter(x => x !== c) : S.filter.cats.concat(c);
  store.save(); renderExam();
};
$("excludeMastered").onclick = () => { S.filter.excludeMastered = !S.filter.excludeMastered; store.save(); renderExam(); };
function onExamChange(keepCur){
  mock = null;
  renderExam(); renderQuick("scale"); renderQuick("arp");
  if (S.tab === "exam") {
    const same = keepCur && cur && !cur.free && examQuestions().find(q => q.itemId === cur.itemId && q.tonic === cur.tonic && q.hands === cur.hands && q.articulation === cur.articulation);
    if (same) setQuestion(same, "exam"); else { tabCur.exam = null; showEmpty(); }
  }
}
function syncExamButtons(){
  const sets = SY.systems[S.exam.system].mode === "sets";
  $("drawBtn").hidden = !!mock; $("drawLabel").textContent = sets ? tr("隨機抽一項", "Random") : tr("隨機抽考", "Random");
  $("nextBtn").hidden = !sets && !mock;
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
  pairText($("qTitle"), () => tr(`模擬考結束:${n} 項中 通過 ${good}、待加強 ${weak}、未標記 ${n - good - weak}`, `Mock done: ${good} passed, ${weak} weak, ${n - good - weak} unmarked of ${n}`));
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
  $("listTitle").textContent = sys.mode === "sets" ? tr(`${S.exam.set} 組要求(依序)`, `Set ${S.exam.set} (in order)`) : T("listTitle");
  $("listSub").textContent = tr(`通過 ${good} / ${qs.length}`, `Passed ${good} / ${qs.length}`);
  $("progressBar").style.width = (qs.length ? 100 * good / qs.length : 0) + "%";
  const row = (q, i) => {
    const m = S.mastery[q.key] || "", hands = q.motion === "contrary" ? tr("反向", "contrary") : { RH: tr("右手", "RH"), LH: tr("左手", "LH"), HT: tr("雙手", "HT") }[q.hands];
    const extra = [hands, q.range === "5th" ? tr("五度", "5th") : tr(q.octaves + "八度", q.octaves + " oct.")];
    if (q.dynamic) extra.push({ "cresc-dim": "p–f–p" }[q.dynamic] || q.dynamic);
    return `<button class="qrow${cur && !cur.free && cur.key === q.key ? " cur" : ""}" data-i="${i}"><i class="dot ${m}"></i><span>${questionText(q)[0]}${q.articulation === "staccato" ? tr("(斷奏)", " (staccato)") : ""}</span><small>${extra.join(" · ")}</small></button>`;
  };
  if (sys.mode === "sets") $("qGroups").innerHTML = `<div class="qlist">${qs.map(row).join("")}</div>`;
  else $("qGroups").innerHTML = CATEGORIES.map(c => {
    const list = qs.map((q, i) => [q, i]).filter(([q]) => q.cat === c.id);
    return list.length ? `<div class="group"><h3>${c.zh}</h3><div class="qlist">${list.map(([q, i]) => row(q, i)).join("")}</div></div>` : "";
  }).join("");
}
$("qGroups").onclick = e => {
  const b = e.target.closest("[data-i]"); if (!b) return;
  setQuestion(examQuestions()[Number(b.dataset.i)], "exam");
  $("quizCard").scrollIntoView({ behavior: "smooth", block: "start" });
};
$("examChip").onclick = () => switchTab("exam");

/* ══ 分頁切換 ══ */
function switchTab(tab){
  stopPlayback();
  S.tab = tab; store.save();
  document.querySelectorAll("#tabbar button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  document.querySelectorAll(".pane").forEach(p => p.hidden = p.dataset.pane !== tab);
  if (tab !== "exam") mock = null;
  $("drawBtn").hidden = true; $("nextBtn").hidden = true; $("mockBtn").hidden = true;
  if (tab === "scale" || tab === "arp" || tab === "hanon") { renderPicker(tab); setQuestion(tabCur[tab] || freeQuestion(tab), tab); }
  else if (tab === "exam") { renderExam(); syncExamButtons(); if (tabCur.exam) setQuestion(tabCur.exam, "exam"); else showEmpty(); }
  window.scrollTo({ top: 0 });
  syncQuizTop();
}
$("tabbar").onclick = e => { const b = e.target.closest("button[data-tab]"); if (b) switchTab(b.dataset.tab); };

/* 題目上方那一列(官方大綱標記、抽考範圍、抽考按鈕)沒東西就整列收掉;樂譜還沒畫就留一塊放提示字。用 JS 判斷,不靠 CSS :has */
function syncQuizTop(){
  const top = document.querySelector(".quiz-top");
  const empty = $("verifyBadge").hidden && !$("poolCount").textContent.trim() && [...top.querySelectorAll(".q-actions button")].every(b => b.hidden);
  top.classList.toggle("blank", empty);
  $("stage").classList.toggle("blank", !$("osmd").childElementCount);
}
/* ══ 練習面板 ══ */
function showEmpty(){
  stopPlayback();
  cur = null; ex = null;
  $("qTitle").classList.add("empty"); $("qTitle").style.fontSize = "";
  const sets = S.exam && SY.systems[S.exam.system].mode === "sets";
  pairText($("qTitle"), () => { const d = sets ? tr("隨機抽一項", "Random") : tr("隨機抽考", "Random"); return tr("按「" + d + "」,或從下方清單選一項", "Tap " + d + ", or pick from the list below"); }); $("qTags").innerHTML = "";
  $("playBtn").disabled = true; document.querySelectorAll(".mbtn").forEach(b => { b.disabled = true; b.setAttribute("aria-pressed", "false"); });
  $("verifyBadge").hidden = true; $("poolCount").textContent = S.exam ? tr(`抽考範圍 ${examPool().length} 題`, `${examPool().length} items in range`) : "";
  if (osmd) { try { osmd.clear(); } catch (e) {} }
  $("osmd").innerHTML = ""; osmd = null; noteXs = []; $("playline").hidden = true;
  $("paperMsg").textContent = tr("選一題之後,這裡會顯示五線譜與指法", "Pick an item to see the score and fingering here");
  $("scoreNote").hidden = true;
  syncTempoUI();
  syncQuizTop();
}
function setQuestion(q, tab){
  stopPlayback();
  cur = q; lastKey = q.key; tabCur[tab] = q;
  ex = buildExercise(FG, q);
  show = q.hands === "RH" ? "rh" : q.hands === "LH" ? "lh" : "both";
  syncHandSeg();
  const parts = questionText(q);
  unpair($("qTitle")); $("qTitle").textContent = parts[0]; $("qTitle").classList.remove("empty");
  $("qTags").innerHTML = parts.slice(1).map((t, i) => `<span class="q-tag${q.dynamic && i === parts.length - 2 ? " dyn" : ""}">${t}</span>`).join("") + hanonBestTag(q);
  fitTitle();
  $("playBtn").disabled = false;
  document.querySelectorAll(".mbtn").forEach(b => b.disabled = false);
  syncMastery();
  // 上方那一列(官方大綱標記、抽考範圍)只在檢定分頁出現:音階/琶音分頁點「本級要求」的題目時不出現,題目才不會往下跳
  if (!q.free && S.exam && tab === "exam") {
    const g = examGrade();
    $("verifyBadge").hidden = false;
    $("verifyBadge").classList.toggle("ok", !!g.verified);
    $("verifyBadge").textContent = g.verified ? tr("官方大綱", "Official syllabus") : tr("大綱未核對", "Syllabus not checked");
    $("poolCount").textContent = mock && mock.list.includes(q) ? tr(`模擬考 ${mock.i + 1} / ${mock.list.length}`, `Mock ${mock.i + 1} / ${mock.list.length}`)
      : tab === "exam" ? tr(`抽考範圍 ${examPool().length} 題`, `${examPool().length} items in range`) : `${SY.systems[S.exam.system].name} ${gradeLabel(g)}`;
  } else { $("verifyBadge").hidden = true; $("poolCount").textContent = ""; }
  // 樂譜下方說明
  const notes = [], noteFns = notes;   // 每一則是函式:中英文各跑一次
  if (q.type === "thirds") notes.push(() => tr("三度指法照哈農第 52 首(Scales in Thirds)" + (["C", "G", "D", "A", "E", "F", "Bb", "Eb", "Ab"].includes(q.tonic) && q.quality !== "minor" || ["A", "D", "G"].includes(q.tonic) && q.quality === "minor" ? "。" : ";這個調原譜沒有印,照同一套循環推算。") + "雙音指法各版本不同,老師另有指定就照老師的。",
    "Thirds fingering follows Hanon No. 52 (Scales in Thirds)" + (["C", "G", "D", "A", "E", "F", "Bb", "Eb", "Ab"].includes(q.tonic) && q.quality !== "minor" || ["A", "D", "G"].includes(q.tonic) && q.quality === "minor" ? ". " : "; this key isn't printed there, so the same cycle is applied. ") + "Editions differ; follow your teacher if they say otherwise."));
  if (q.type === "sixths") notes.push(() => tr("六度指法照哈農第 48 首(斷奏六度):右手 1–5、左手 5–1,黑鍵用 4。雙音指法各版本不同,老師另有指定就照老師的。", "Sixths fingering follows Hanon No. 48 (detached sixths): RH 1–5, LH 5–1, 4 on black keys. Editions differ; follow your teacher if they say otherwise."));
  if (q.type === "broken") notes.push(() => (q.range === "5th" ? tr("分解三和弦照 Trinity 大綱的譜例(1-3-5-3-1,3/4 拍)。", "Broken triad as in the Trinity syllabus example (1-3-5-3-1 in 3/4).") : tr("分解和弦照 Trinity 大綱 1 級的譜例:三連音,原位 → 第一轉位 → 第二轉位到高八度主音,再反過來,停在五音。", "Broken chord as in the Trinity Grade 1 syllabus example: triplets, root → 1st → 2nd inversion to the upper tonic, then back, ending on the 5th.")));
  if (q.type === "dom7" && q.sys !== "trinity") notes.push(() => tr("屬七和弦琶音最後解決到主音(照 ABRSM 大綱的譜例)。", "The dominant 7th resolves on the tonic (as in the ABRSM syllabus example)."));
  if (q.apart === 3) notes.push(() => tr("相隔三度:右手比左手高十度(三度 + 八度),左手從主音、右手從第三級開始。", "A third apart: RH plays a tenth above LH — LH starts on the tonic, RH on the 3rd."));
  if (q.apart === 6) notes.push(() => tr("相隔六度:主音在上方 — 右手從主音、左手從低六度的第三級開始。", "A sixth apart: tonic on top — RH starts on the tonic, LH on the 3rd a sixth below."));
  if (q.type === "chromatic" && q.lhStart !== q.rhStart) notes.push(() => tr(`兩手從不同的音開始:左手 ${noteLabelStr(q.lhStart)}、右手 ${noteLabelStr(q.rhStart)}。`, `Hands start on different notes: LH ${noteLabelStr(q.lhStart)}, RH ${noteLabelStr(q.rhStart)}.`));
  if (!q.free && S.exam) notes.push(() => SY.systems[S.exam.system].mode === "sets" ? tr("速度是大綱的「最低速度」。", "Tempo is the syllabus minimum.") : tr("速度是大綱的「參考速度」。", "Tempo is the syllabus guide speed."));
  $("scoreNote").hidden = !notes.length;
  pairText($("scoreNote"), () => noteFns.map(f => f()).join(" "));
  bpm = q.free ? q.tempo.bpm : Math.max(30, Math.min(300, Math.round(q.tempo.bpm * S.tempoPct / 100)));
  syncTempoUI();
  renderScore();
  if (tab === "exam" && S.exam) renderList();
  if (tab === "scale" || tab === "arp") renderQuick(tab);
  syncQuizTop();
  preloadSamples();
}
function syncMastery(){
  const m = cur && S.mastery[cur.key];
  document.querySelectorAll(".mbtn").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.m === m)));
}
/* 哈農的速度階梯:按 ✓ = 這個速度彈順了 → 記錄最高速度、下一輪 +4 */
function hanonBestTag(q){
  const b = q.type === "hanon" && S.hanonBest[q.no];
  return b ? `<span class="q-tag best">${tr("最高", "Best")} ♩=${b}</span>` : "";
}
document.querySelectorAll(".mbtn").forEach(b => b.onclick = () => {
  if (!cur) return;
  const m = b.dataset.m;
  if (cur.type === "hanon" && m === "good") {
    const q4 = unitOf() === "e16" ? bpm / 2 : bpm;   // 最高速度一律記 ♩
    S.hanonBest[cur.no] = Math.max(S.hanonBest[cur.no] || 0, q4);
    S.mastery[cur.key] = "good";
    logPractice(0);
    setBpm(bpm + (unitOf() === "e16" ? 8 : 4), true);   // 下一輪 ♩ +4
    const parts = questionText(cur);
    $("qTags").innerHTML = parts.slice(1).map(t => `<span class="q-tag">${t}</span>`).join("") + hanonBestTag(cur);
    fitTitle(); syncMastery();
    return;
  }
  if (S.mastery[cur.key] === m) delete S.mastery[cur.key]; else { S.mastery[cur.key] = m; logPractice(0); }
  store.save(); syncMastery();
  if (S.tab === "exam") renderExam(); else renderQuick(S.tab);
});

/* ── 樂譜:一整行 + 播放軸(照 ScrollScore)──
   noteXs:每一步(OSMD 游標的每個位置)的拍點與 x 座標;播放時依拍點在兩步之間內插,播放軸平順移動。
   比畫面短的樂譜置中(#osmd margin:auto),比畫面長的可以左右滑;播放時讓目前的音停在畫面 25%(到結尾才讓播放軸走完) */
const PLAYLINE_RATIO = 0.25;
let noteXs = [];
const syncHandSeg = segBind("handSeg", () => show, v => { show = v; stopPlayback(); renderScore(); });
let renderSeq = 0;
const scoreZoom = () => landZoom || (window.innerWidth < 600 ? 0.85 : window.innerWidth < 1000 ? 0.95 : 1.05);
/* 手機橫放(平板不算):樂譜照畫面高度放大,讓「工具列 + 樂譜標題 + 樂譜」剛好一個畫面(播放時下方分頁列收起來) */
const PHONE_LAND = "(orientation: landscape) and (max-height: 500px)";
const isPhoneLand = () => matchMedia(PHONE_LAND).matches;
let landZoom = null;
function fitLandZoom(){
  if (!isPhoneLand()) { if (landZoom) { landZoom = null; return refit(); } return false; }
  const svg = document.querySelector("#osmd svg"); if (!svg || !osmd) return false;
  const H = svg.getBoundingClientRect().height; if (!H) return false;
  const head = document.querySelector("header").offsetHeight, title = document.querySelector("#scoreCard .card-title").offsetHeight;
  const avail = innerHeight - head - title - 44;           // 卡片與紙的上下內距、間隔
  const z = Math.max(0.85, Math.min(1.8, osmd.zoom * avail / H));
  if (Math.abs(z - osmd.zoom) < 0.03) { landZoom = osmd.zoom; return false; }
  landZoom = z; return refit();
}
function refit(){ osmd.zoom = scoreZoom(); lastZoom = osmd.zoom; renderOsmd(); measureNotes(); return true; }
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
  $("paperMsg").textContent = "";
  try {
    await osmd.load(xml);
    if (seq !== renderSeq) return;
    osmd.zoom = scoreZoom();
    renderOsmd();
    measureNotes();
    fitLandZoom();
    syncQuizTop();
  } catch (e) {
    console.error(e);
    $("paperMsg").textContent = tr("樂譜繪製失敗:", "Could not draw the score: ") + e.message;
  }
  window.__lastXml = xml;
  window.__scoreReady = (window.__scoreReady || 0) + 1;
}
/* 指法自己畫(OSMD 的指法有時會被擠到音符左邊,位置不一致):
   OSMD 只畫音符;每個音的指法數字對準符頭正中央,右手(placement above)放在「譜表上緣、這個音(含符桿)最高點」兩者較高的上方,
   左手(below)放在下方;雙音兩個數字疊起來(上面的音的指法在外側) */
function renderOsmd(){
  osmd.render();
  drawFingerings();
}
function drawFingerings(){
  const svg = document.querySelector("#osmd svg"); if (!svg) return;
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
      for (const { n, h } of list) {
        const t = document.createElementNS(NS, "text");
        t.setAttribute("x", h.x + h.width / 2); t.setAttribute("y", y); t.setAttribute("text-anchor", "middle");
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
function measureNotes(){
  noteXs = [];
  const c = osmd.cursor;
  c.show(); c.reset();
  let guard = 0;
  // 播放軸對準符頭正中央(以前用游標的左緣:游標沒有 style.width,播放軸一直比音符偏左一個符頭,最後一個長音時看起來卡在兩個音之間)
  const ox = $("osmd").getBoundingClientRect().x;
  while (!c.Iterator.EndReached && guard++ < 3000) {
    const el = c.cursorElement;
    let xs = [];
    try {
      xs = c.GNotesUnderCursor().map(n => { const g = n.getSVGGElement && n.getSVGGElement(); const h = g && (g.querySelector(".vf-notehead") || g); const r = h && h.getBoundingClientRect(); return r && r.width ? r.x - ox + r.width / 2 : null; }).filter(v => v != null);
    } catch (e) {}
    const x = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : parseFloat(el.style.left) + (el.offsetWidth || el.width || 0) / 2;
    noteXs.push({ beat: c.Iterator.currentTimeStamp.RealValue * 4, x });
    c.next();
  }
  c.reset(); c.hide();
  $("scroll").scrollLeft = 0;
  placePlaylineExtent();
  movePlayline(0, false);
}
/* 播放軸的上下:貼著譜線與音符(含加線、符桿)再往外留 1.2 個譜線間距(ScrollScore 的規則) */
function placePlaylineExtent(){
  const stage = $("stage"), pl = $("playline"), svg = document.querySelector("#osmd svg");
  if (!svg) { pl.hidden = true; return; }
  const sr = stage.getBoundingClientRect();
  let top = Infinity, bot = -Infinity, space = 8;
  const lines = svg.querySelectorAll(".staffline");
  lines.forEach(g => { const r = g.getBoundingClientRect(); top = Math.min(top, r.top); bot = Math.max(bot, r.bottom); space = r.height / 4 || space; });
  svg.querySelectorAll(".vf-stavenote, .vf-ledgers").forEach(g => { const r = g.getBoundingClientRect(); if (r.height) { top = Math.min(top, r.top); bot = Math.max(bot, r.bottom); } });
  if (!isFinite(top)) { pl.hidden = true; return; }
  const pad = space * 1.2;
  pl.style.top = Math.max(0, top - sr.top - pad) + "px";
  pl.style.bottom = Math.max(0, sr.bottom - bot - pad) + "px";
  pl.hidden = false;
}
function xAtBeat(beat){
  if (!noteXs.length) return 0;
  if (beat <= noteXs[0].beat) return noteXs[0].x;
  for (let i = 0; i + 1 < noteXs.length; i++) {
    const a = noteXs[i], b = noteXs[i + 1];
    if (beat < b.beat) return a.x + (b.x - a.x) * (beat - a.beat) / (b.beat - a.beat);
  }
  return noteXs[noteXs.length - 1].x;
}
/* follow = true:播放中,讓目前位置停在 25%(能捲才捲)。
   播放中用 transform 移動樂譜(小數像素、GPU),不改 scrollLeft:scrollLeft 只能整數,
   播放軸跟樂譜各自四捨五入會差 1px 來回跳 → 看起來在抖 */
function movePlayline(beat, follow){
  const scroll = $("scroll"), o = $("osmd"), pl = $("playline");
  const x = o.offsetLeft + xAtBeat(beat);
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
  let k = 1; g.style.setProperty("--tag-scale", 1);
  while (g.scrollWidth > g.clientWidth + 1 && k > 0.6) { k -= 0.04; g.style.setProperty("--tag-scale", k); }
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
  $("bpmUnit").textContent = `${unitSym(u)} / ${tr("分", "min")}`;
  const examT = cur && !cur.free ? cur.tempo : null;
  $("bpmReset").hidden = !examT;
  if (examT) {
    const pct = Math.round(100 * bpm / examT.bpm);
    $("bpmPct").textContent = pct === 100 ? tr("考試", "exam") : tr(`考試速度的 ${pct}%`, `${pct}% of exam tempo`);
    $("examTempo").textContent = unitSym(u) !== UNIT_SYM[u]
      ? tr(`大綱 ${UNIT_SYM[u]} = ${examT.bpm}(每拍 ${NOTES_PER_UNIT[u]} 個八分音符)= 這裡的 ${unitSym(u)} = ${examT.bpm}`, `Syllabus ${UNIT_SYM[u]} = ${examT.bpm} (${NOTES_PER_UNIT[u]} quavers) = ${unitSym(u)} = ${examT.bpm} here`)
      : tr(`考試速度 ${UNIT_SYM[u]} = ${examT.bpm}(八分音符,每拍 ${NOTES_PER_UNIT[u]} 個${u === "q." ? ",三連音" : ""})`,
      `Exam tempo ${UNIT_SYM[u]} = ${examT.bpm} (${NOTES_PER_UNIT[u]} ${u === "q." ? "triplet " : ""}quavers per beat)`);
  } else if (u === "e16") { $("bpmPct").textContent = ""; $("examTempo").textContent = tr("拍點打在 ♪(每 2 個音)· 原譜 ♩ 60–108 = ♪ 120–216", "Clicks on ♪ (every 2 notes) · Hanon ♩ 60–108 = ♪ 120–216"); }
  else if (u === "q.") { $("bpmPct").textContent = ""; $("examTempo").textContent = tr("三連音:每拍 3 個音", "Triplets: 3 notes per beat"); }
  else if (u === "q16" && cur && cur.type !== "hanon") { $("bpmPct").textContent = ""; $("examTempo").textContent = tr("拍點 ♩ = 每 4 個音", "Click ♩ = every 4 notes"); }
  else if (u === "q16") { $("bpmPct").textContent = ""; $("examTempo").textContent = ex && ex.rhythm !== "even" ? tr("每拍 4 個音(附點節奏)· 原譜 60–108", "4 notes per beat (dotted) · Hanon: 60–108") : tr("每拍 4 個十六分音符 · 原譜 60–108", "4 semiquavers per beat · Hanon: 60–108"); }
  else { $("bpmPct").textContent = ""; $("examTempo").textContent = ex && ex.timeHidden ? tr("拍點 ♪ = 每 2 個音", "Click ♪ = every 2 notes") : tr("每拍 2 個八分音符", "2 quavers per beat"); }
  $("beats").innerHTML = "<i class=\"first\"></i>" + "<i></i>".repeat(beatsPerBar() - 1);
}
/* ♪ 拍點時速度數字是 ♩ 的兩倍:上限 300(♪ = 300 等於 ♩ = 150) */
function maxBpm(){ return 300; }   // 速度上限一律 300(使用者要求)
function setBpm(v, fromUser){
  bpm = Math.max(30, Math.min(maxBpm(), Math.round(v)));
  if (fromUser && cur) {
    if (cur.free && cur.type === "broken") { S.freeBpm.broken = bpm; cur.tempo.bpm = bpm; }
    else if (cur.free) { S.freeBpm[S.tab] = unitOf() === "e16" ? bpm / 2 : S.tab !== "hanon" && unitOf() === "q16" ? Math.min(300, bpm * 2) : bpm; cur.tempo.bpm = bpm; }
    else S.tempoPct = Math.round(100 * bpm / cur.tempo.bpm);
    store.save();
  }
  syncTempoUI();
  retempo();
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
      const notes = ["rh", "lh"].flatMap(h => ex[h].flatMap(n => n.with ? [n, n.with] : [n])).map(n => ({ midi: n.midi, vel: demoVel() }));
      $("loadingMsg").textContent = tr("載入鋼琴取樣…", "Loading piano samples…");
      await audio.loadPianoFor(notes, 6, p => {
        if (preloadJob !== job) return;
        setRing(p * 0.95);
        $("loadingMsg").textContent = tr("載入鋼琴取樣… ", "Loading piano samples… ") + Math.round(p * 100) + "%";
      });
      await audio.loadClick().catch(() => {});
      samplesReady = true;
      if (preloadJob === job) { setRing(1); $("loadingMsg").textContent = ""; }
      return true;
    } catch (e) {
      if (preloadJob === job) {
        preloadJob = null;   // 失敗的不留著:下次按播放重新載
        $("loadingMsg").textContent = tr("鋼琴取樣載入失敗,再按一次播放重試(需要網路,之後會存在裝置上)", "Could not load piano samples — tap play to retry (needs internet once; then cached)");
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
  for (const h of ["rh", "lh"]) {
    const arr = p.byHand[h];
    arr.forEach(e => {
      const on = t0 + e.beat * beatSec;
      if (on < from) return;
      const next = arr.find(x => x.beat > e.beat + 1e-6);   // 同一隻手下一個「不同時」的音(雙音的兩個音同時按)
      const legatoEnd = next ? t0 + next.beat * beatSec + 0.015 : on + e.len * beatSec;
      const off = p.stacc && next ? on + Math.min(0.12, (next.beat - e.beat) * beatSec * 0.45) : legatoEnd;
      if (!S.clickOnly) audio.playPianoNote(e.midi, on, off, off, p.velAt(e.beat) + (e.idx === 0 ? 6 : 0) + (Math.random() * 6 - 3), false);
    });
  }
  const totalClicks = Math.ceil(p.endBeat * beatSec / clickSec);
  for (let b = -pre; b < totalClicks; b++) { const at = t0 + b * clickSec; if (at >= from) audio.playClick(at, ((b % count) + count) % count === 0); }
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
    const top = $("scoreCard").getBoundingClientRect().top - document.querySelector("header").getBoundingClientRect().bottom - 6;
    if (Math.abs(top) > 2) window.scrollBy({ top, behavior: "smooth" });
    return;
  }
  const r = $("scoreCard").getBoundingClientRect(), bar = document.querySelector(".tabbar");
  const bottom = bar ? bar.getBoundingClientRect().top : innerHeight;
  if (r.bottom > bottom - 4) window.scrollBy({ top: Math.min(r.bottom - bottom + 8, r.top - 4), behavior: "smooth" });
  else if (r.top < 0) window.scrollBy({ top: r.top - 8, behavior: "smooth" });
}
/* 播放的準備或排程中途出錯時,不能讓 starting 卡著(之後怎麼按都不理);錯誤原因直接寫在卡片上,方便回報 */
async function startPlayback(){
  try { await startPlaybackInner(); }
  catch (e) {
    console.error(e);
    starting = 0; $("playBtn").classList.remove("busy");
    if (play) stopPlayback();
    $("playLabel").textContent = T("play");
    $("loadingMsg").textContent = tr("播放失敗:", "Playback failed: ") + (e && e.message || e);
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
  const events = playbackEvents(ex, cur, show);
  const u = unitOf(), clickSec = 60 / bpm, noteSec = clickSec / NOTES_PER_UNIT[u];
  const beatSec = noteSec * ex.sub;                      // 樂譜上一個四分音符的秒數
  const count = beatsPerBar(), pre = count * COUNT_IN_BARS;
  const t0 = ctx.currentTime + 0.15 + pre * clickSec;
  const stacc = cur.articulation === "staccato";
  const endBeat = Math.max(...events.map(e => e.beat + e.len));
  // 漸強再漸弱(p–f–p):前半漸強、後半漸弱
  const velAt = beat => cur.dynamic === "cresc-dim" ? Math.round(42 + 50 * (1 - Math.abs(2 * beat / endBeat - 1))) : demoVel();
  const byHand = { rh: [], lh: [] };
  events.forEach(e => byHand[e.hand].push(e));
  play = { t0, beatSec, clickSec, endBeat, raf: 0, byHand, stacc, velAt, count, pre };
  schedulePlay(play, -Infinity);
  revealScore();
  $("playLabel").textContent = T("stop");
  $("playIcon").innerHTML = '<rect x="6" y="6" width="12" height="12" rx="1.5"/>';
  const tick = () => {
    if (!play) return;
    const now = audio.audioNow();
    const beat = (now - play.t0) / play.beatSec;
    showBeat((now - play.t0) / play.clickSec);
    movePlayline(Math.max(0, beat), true);
    if (beat > play.endBeat + 0.5) {
      const sec = play.endBeat * play.beatSec; stopPlayback(true, !!(S.loop && cur)); logPractice(sec);
      // 循環:再來一輪(有預備拍);勾了「每輪 +4」就每輪快 4(拍點 ♪ 時快 8,等於 ♩ +4)
      if (S.loop && cur) { if (S.ramp) setBpm(bpm + (unitOf() === "e16" ? 8 : 4), true); startPlayback(); }
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
/* 禁止連點放大(iOS 有時不理 touch-action / user-scalable):300ms 內的第二下取消預設動作,自己補一次 click */
let lastTouchEnd = 0;
document.addEventListener("touchend", e => {
  const now = Date.now();
  if (now - lastTouchEnd < 300) { e.preventDefault(); const t = e.target.closest("button, .opt, .chip, [role=tab]"); if (t && !t.disabled) t.click(); }
  lastTouchEnd = now;
}, { passive: false });
document.addEventListener("gesturestart", e => e.preventDefault());
/* 每一次真的點擊都喚醒音訊(上面補的 click 不算使用者手勢,iOS 不准它打開聲音;被來電、鎖屏打斷的也在這裡叫回來) */
for (const ev of ["touchend", "click", "keydown"]) document.addEventListener(ev, () => audio.unlockAudio(), { capture: true, passive: true });

/* ── 拍點燈號(示範播放時亮)── */
function showBeat(click){
  const dots = $("beats").children, n = dots.length;
  const k = click == null || click < -n * COUNT_IN_BARS ? -1 : ((Math.floor(click + 1e-6) % n) + n) % n;
  for (let i = 0; i < dots.length; i++) dots[i].classList.toggle("on", i === k);
}

/* ══ 播放選項 ══ */
function syncPlayOpts(){
  $("optLoop").setAttribute("aria-pressed", String(!!S.loop));
  $("optRamp").setAttribute("aria-pressed", String(!!S.ramp));
  $("optRamp").disabled = !S.loop;
  $("optClick").setAttribute("aria-pressed", String(!!S.clickOnly));
}
for (const [id, k] of [["optLoop", "loop"], ["optRamp", "ramp"], ["optClick", "clickOnly"]]) $(id).onclick = () => { S[k] = !S[k]; store.save(); syncPlayOpts(); };
syncPlayOpts();

/* 練習時螢幕不要暗掉(手機放在譜架上):App 在前景時一直保持亮著 */
let wakeLock = null;
async function keepAwake(){
  try { if ("wakeLock" in navigator && document.visibilityState === "visible" && !wakeLock) { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }); } } catch (e) {}
}
document.addEventListener("visibilitychange", keepAwake);
document.addEventListener("pointerdown", keepAwake, { once: true });

/* 桌機快捷鍵:空白鍵 播放/停止、↑↓ 速度 ±1、N 下一題(檢定) */
document.addEventListener("keydown", e => {
  if (e.target.closest("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.code === "Space") { e.preventDefault(); $("playBtn").click(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); setBpm(bpm + 1, true); }
  else if (e.key === "ArrowDown") { e.preventDefault(); setBpm(bpm - 1, true); }
  else if ((e.key === "n" || e.key === "N") && S.tab === "exam") { const b = !$("nextBtn").hidden ? $("nextBtn") : $("drawBtn"); if (!b.hidden && !b.disabled) b.click(); }
});

/* ══ 練習紀錄 ══
   算一次練習:示範完整播完、或按了 ✓ / ⚠ 標記。S.log = { "YYYY-MM-DD": { n: 次數, sec: 秒數 } }(只留最近 400 天) */
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function logPractice(sec){
  S.log = S.log || {};
  const k = dayKey(new Date()), e = S.log[k] || (S.log[k] = { n: 0, sec: 0 });
  e.n++; e.sec += Math.round(sec || 0);
  const keys = Object.keys(S.log).sort();
  while (keys.length > 400) delete S.log[keys.shift()];
  store.save(); renderLog();
}
function renderLog(){
  const log = S.log || {}, today = new Date();
  // 連續天數:從今天(今天還沒練就從昨天)往回數
  let streak = 0, d = new Date(today);
  if (!(log[dayKey(d)] && log[dayKey(d)].n)) d.setDate(d.getDate() - 1);
  while (log[dayKey(d)] && log[dayKey(d)].n) { streak++; d.setDate(d.getDate() - 1); }
  const t = log[dayKey(today)] || { n: 0, sec: 0 };
  $("logStreak").textContent = streak; $("logToday").textContent = t.n; $("logMin").textContent = Math.round(t.sec / 60);
  const names = getLang() === "en" ? ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] : ["日", "一", "二", "三", "四", "五", "六"];
  let html = "";
  for (let i = 6; i >= 0; i--) {
    const x = new Date(today); x.setDate(x.getDate() - i);
    const e = log[dayKey(x)];
    html += `<span class="${i === 0 ? "today" : ""}"><i class="${e && e.n ? "on" : ""}"></i>${names[x.getDay()]}</span>`;
  }
  $("logWeek").innerHTML = html;
}

/* ══ 第一次打開:在準備考試嗎? ══ */
const obState = { system: "abrsm", grade: 1 };
function showOnboard(){
  const ob = obState;
  const syncSys = segBind("obSystem", () => ob.system, v => { ob.system = v; fillGrades($("obGrade"), ob.system, ob.grade); });
  fillGrades($("obGrade"), ob.system, ob.grade); syncSys();
  $("obGrade").onchange = () => ob.grade = Number($("obGrade").value);
  $("onboard").hidden = false;
  $("obYes").onclick = () => {
    S.exam = { system: ob.system, grade: Number($("obGrade").value), set: "A" }; S.onboarded = true; store.save();
    $("onboard").hidden = true; renderExam(); switchTab("exam");
  };
  $("obNo").onclick = () => { S.exam = null; S.onboarded = true; store.save(); $("onboard").hidden = true; $("examChip").hidden = true; switchTab("scale"); };
}

/* ── 啟動 ── */
async function init(){
  // 資料檔帶版本指紋(index.html 的 fdVersions,由 tools/build/stamp.mjs 產生),更新後不會讀到舊的快取
  let ver = {}; try { ver = JSON.parse(document.getElementById("fdVersions").textContent); } catch (e) {}
  const data = f => fetch(f + (ver[f] ? "?v=" + ver[f] : "")).then(r => r.json());
  const [sy, fg] = await Promise.all([data("data/syllabus.json"), data("data/fingerings.json")]);
  SY = sy; FG = fg;
  if (S.exam && !(SY.systems[S.exam.system] && gradeOf(SY, S.exam.system, S.exam.grade))) S.exam = null;
  if (window.innerWidth < 600) $("listCard").open = false;
  if (S.exam) renderExam();
  renderLog();
  window.__app = { get cur(){ return cur; }, get ex(){ return ex; }, get osmd(){ return osmd; },
    get state(){ return { play: !!play, starting: !!starting, bpm, show, scheduled: audio.scheduledCount(), noteXs: noteXs.length }; }, setQuestion, examQuestions, examPool, switchTab, fitTitle, S, SY };
  if (!S.onboarded) { switchTab("scale"); showOnboard(); }
  else switchTab(S.tab || (S.exam ? "exam" : "scale"));
  window.__stageReady = 1;
}
/* 離線使用:註冊 Service Worker(sw.js);本機開發(localhost)也註冊,方便測試 */
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
init().catch(e => { console.error(e); $("qTitle").textContent = tr("資料載入失敗:", "Could not load data: ") + e.message; });
