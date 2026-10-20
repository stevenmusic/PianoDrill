/* 聽音模組(原 EarDrill):單音 / 音程 / 和弦 / 檢定聽力測驗,題目卡(播放、作答、批改)共用。
   外框(js/main.js)負責頂欄、分頁、考試系統與級數;這裡的元素 id 都加 "e-" 前綴 */
import * as store from "./store.js";
import { ALL_ITEMS, itemLabel, makeQuestion, pcName, isBlack, setSolfege, noteName } from "./ear.js";
import { makeDrill, drillName, judgeTaps, judgeKeys, lazy } from "./aural.js";
import { tr, scoped, getLang, pairText } from "../shared/i18n.js";
import * as audio from "../shared/audio.js";
import { addLog, renderLog as paintLog, today, nextGoal } from "../shared/practicelog.js";
import "./strings.js";
const T = scoped("ear");

const $ = id => document.getElementById("e-" + id);
const ROOT = document.getElementById("mod-ear");
let active = false, ctx = null;
const S = store.load();
let SY = null;
const PRACTICE = ["note", "interval", "chord"];
const tabCur = {};                 // 每個分頁目前的題目
let cur = null;                    // 目前的題目(格式見 aural.js 開頭)
let A = null;                      // 作答狀態:{ step, results, done, keys: [], taps: [] }
let examDrill = null;              // 檢定:目前練的 { test, drill, idx }

/* 語言切換(外框通知):只重寫文字(不停止播放、不換題、作答狀態不變;照 DrumDrill 技巧的 relabel)——
   選擇器、檢定清單、題目與選項、按鈕、暫時訊息、正確率、紀錄卡。
   題目上的文字(標題、標籤、問題、選項、答案說明、拍子批改訊息)出題時就寫成 getter(aural.js、ear.js),
   每次畫都照目前的語言 → 這裡只要重畫目前的題目;其他分頁存著的題目(tabCur)回到畫面時 setQuestion 會重畫。
   模組不在畫面上時不碰題目卡(enter → switchTab 會整個重畫) */
export function relang(){
  if (!SY) return;
  if (S.exam) renderExam();
  remsg();
  if (active) {
    if (PRACTICE.includes(S.tab)) renderPicker(S.tab);
    if (cur) renderQuestion();
    else if (lastMock) showMockText();
    else if ($("qTitle").classList.contains("empty")) emptyText();
    $("playLabel").textContent = play ? T("stop") : starting ? tr("準備中…", "Preparing…") : cur && A && A.played ? T("replay") : T("play");
    renderStats();
  }
  renderLog();
}
/* 暫時訊息(載入中、載入失敗):記住產生文字的函式,換語言時重寫 */
const msgs = {};
function setMsg(id, fn){ msgs[id] = fn || null; $(id).textContent = fn ? fn() : ""; }
function remsg(){ for (const id in msgs) if (msgs[id]) $(id).textContent = msgs[id](); }

function segBind(el, get, set){
  const seg = typeof el === "string" ? $(el) : el;
  const sync = () => seg.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === String(get()))));
  seg.onclick = e => { const b = e.target.closest("button"); if (!b || b.disabled) return; set(b.dataset.v); sync(); };
  sync();
  return sync;
}

/* ══ 單音 / 音程 / 和弦 設定 ══
   每一列 [鍵, 標籤, 選項, 多選?];多選列前面的 "__" 選項是快速組合 */
const WHITE = ["0", "2", "4", "5", "7", "9", "11"];
const PRESETS = {
  note: { __white: WHITE, __all: ALL_ITEMS.note.map(x => x.id) },
  interval: { __basic: ["M2", "M3", "P4", "P5", "P8"], __all: ALL_ITEMS.interval.map(x => x.id) },
  chord: { __triads: ["maj", "min", "dim", "aug"], __sevenths: ["dom7", "maj7", "min7", "m7b5", "dim7"], __all: ALL_ITEMS.chord.map(x => x.id) }
};
const PRESET_NAME = () => ({ __white: tr("白鍵", "White keys"), __all: tr("全部", "All"), __basic: tr("入門", "Basic"), __triads: tr("三和弦", "Triads"), __sevenths: tr("七和弦", "7ths") });
/* 練習選項(各分頁共用,存在 S.auto / S.adaptive;以前放在題目卡下面佔一整列) */
const OPTS = () => ["opts", tr("選項", "Options"), [["auto", tr("答對自動下一題", "Auto next")], ["adaptive", tr("加強弱項", "Focus weak")]], "toggle"];
const PICKERS = {
  note: p => [
    ["preset", tr("常用", "Common"), Object.keys(PRESETS.note).map(k => [k, PRESET_NAME()[k]])],
    ["set", tr("出哪些音", "Notes"), ALL_ITEMS.note.map(it => [it.id, pcName(it.pc).replace("/", "/​")]), true],
    ["range", tr("音域", "Range"), [["1", tr("1 個八度", "1 oct.")], ["2", tr("2 個八度", "2 oct.")], ["4", tr("4 個八度", "4 oct.")]]],
    ["ref", tr("參考音", "Reference"), [["C", "C"], ["A", "A"], ["none", tr("不給", "None"), tr("不給參考音(絕對音感)", "No reference (absolute pitch)")]]],   // 參考音 = 題目卡琴鍵上方的「這是 C」鈕(不跟題目一起播)
    ["naming", tr("音名", "Names"), [["letter", "C D E"], ["solfege", tr("Do Re Mi(固定唱名)", "Do Re Mi (fixed do)")]]],
    OPTS()
  ],
  interval: p => [
    ["preset", tr("常用", "Common"), Object.keys(PRESETS.interval).map(k => [k, PRESET_NAME()[k]])],
    ["set", tr("出哪些音程", "Intervals"), ALL_ITEMS.interval.map(it => [it.id, itemLabel("interval", it)]), true],
    ["dir", tr("方向", "Direction"), [["up", tr("上行", "Up")], ["down", tr("下行", "Down")], ["harm", tr("同時", "Harmonic")], ["mix", tr("混合", "Mixed")]]],
    ["root", tr("起音", "Root"), [["rand", tr("隨機", "Random")], ["C", tr("固定 C", "Always C")]]],
    OPTS()
  ],
  chord: p => [
    ["preset", tr("常用", "Common"), Object.keys(PRESETS.chord).map(k => [k, PRESET_NAME()[k]])],
    ["set", tr("出哪些和弦", "Chords"), ALL_ITEMS.chord.map(it => [it.id, itemLabel("chord", it)]), true],
    ["inv", tr("轉位", "Inversions"), [["root", tr("原位", "Root only")], ["all", tr("含轉位", "Include")]]],
    ["style", tr("彈法", "Style"), [["block", tr("同時", "Block")], ["arp", tr("分解", "Broken")], ["both", tr("分解再同時", "Both")], ["mix", tr("混合", "Mixed")]]],
    ["root", tr("根音", "Root"), [["rand", tr("隨機", "Random")], ["C", tr("固定 C", "Always C")]]],
    OPTS()
  ]
};
const paneOf = tab => $({ note: "paneNote", interval: "paneInterval", chord: "paneChord" }[tab]);
function pickSummary(tab){
  const p = S.pick[tab], items = ALL_ITEMS[tab].filter(it => p.set.includes(it.id));
  const names = items.length > 4 ? tr(`${items.length} 項`, `${items.length} items`) : items.map(it => itemLabel(tab, it)).join("、");
  const row = k => {
    if (k === "ref") return p.ref === "none" ? tr("沒有參考音", "No ref.") : tr(`參考音 ${p.ref}`, `Ref. ${p.ref}`);   // 選項只寫 C / A,摘要要說是參考音
    const r = PICKERS[tab](p).find(x => x[0] === k); const o = r && r[2].find(x => x[0] === p[k]); return o ? o[1] : "";
  };
  // 和弦:作答鈕已經寫了和弦名,設定列只寫「原位 · 同時」
  return [tab === "chord" ? null : names, ...({ note: ["range", "ref"], interval: ["dir"], chord: ["inv", "style"] }[tab]).map(row)].filter(Boolean).join(" · ");
}
function renderPicker(tab){
  const pane = paneOf(tab), p = S.pick[tab];
  setSolfege(S.pick.note.naming === "solfege");
  pane.querySelector(".rows").innerHTML = PICKERS[tab](p).map(([k, lbl, opts, multi]) =>
    `<div class="prow"><span class="lbl">${lbl}</span><div class="opts" data-k="${k}"${multi === true ? ' data-multi="1"' : ""}>` +
    opts.map(([v, t, ti]) => {
      const on = k === "opts" ? !!S[v] : k === "preset" ? PRESETS[tab][v].length === p.set.length && PRESETS[tab][v].every(x => p.set.includes(x)) : multi === true ? p.set.includes(v) : String(v) === String(p[k]);
      return `<button class="opt" data-v="${v}" aria-pressed="${on}"${ti ? ` title="${ti}" aria-label="${ti}"` : ""}>${t}</button>`;   // 縮短的選項(「不給」):完整說明放 title
    }).join("") + `</div></div>`).join("");
  pane.querySelector(".sum").textContent = pickSummary(tab);
}
for (const tab of PRACTICE) {
  paneOf(tab).querySelector(".rows").onclick = e => {
    const b = e.target.closest(".opt"); if (!b) return;
    const box = b.closest(".opts"), k = box.dataset.k, v = b.dataset.v, p = S.pick[tab];
    if (k === "opts") { S[v] = !S[v]; store.save(); renderPicker(tab); syncOpts(); return; }
    if (k === "preset") p.set = [...PRESETS[tab][v]];
    else if (box.dataset.multi) {
      const has = p.set.includes(v);
      if (has && p.set.length <= (tab === "note" ? 1 : 2)) return;   // 至少留 1 個音 / 2 個選項
      p.set = has ? p.set.filter(x => x !== v) : ALL_ITEMS[tab].map(x => x.id).filter(x => x === v || p.set.includes(x));
    } else p[k] = v;
    store.save(); renderPicker(tab); newPractice(tab); renderStats();
  };
}
function newPractice(tab){
  setSolfege(S.pick.note.naming === "solfege");
  const q = makeQuestion(tab, S.pick[tab], S.stats, S.adaptive, tabCur[tab]);
  setQuestion(q, tab);
}

/* ══ 檢定 ══ */
function gradeOf(system, grade){ return SY.systems[system].grades.find(g => g.grade === grade); }
function ensureExam(){ if (!S.exam) S.exam = { system: "abrsm", grade: 1, auto: true }; }
const examKey = (t, d) => `exam|${S.exam.system}|${S.exam.grade}|${t.id}|${d.type}`;
function allDrills(){
  const g = gradeOf(S.exam.system, S.exam.grade);
  return g.tests.flatMap(t => t.drills.map((d, idx) => ({ test: t, drill: d, idx })));
}
function renderExam(){
  ensureExam();
  const sys = SY.systems[S.exam.system], g = gradeOf(S.exam.system, S.exam.grade);
  // 考試系統、級數在外框的檢定設定卡;這裡只寫本級有幾項測驗、答對要不要自動下一題
  $("examSummary").textContent = tr(`${g.tests.length} 項聽力`, `${g.tests.length} aural tests`) + " · " + (S.auto ? tr("答對自動下一題", "Auto next") : tr("手動下一題", "Manual next"));
  pairText($("examNote"), () => tr(`依據:${sys.syllabus} ${g.source}`, `Source: ${sys.syllabus}, ${g.source}`) + (sys.syllabusNote ? tr("(" + sys.syllabusNote + ")", "") : ""));
  $("testsSub").textContent = (getLang() === "en" ? g.paramsEn : g.params) || "";
  $("testsList").innerHTML = (g.params ? "" : "") + g.tests.map(t => {
    const chips = t.drills.map((d, i) => {
      const s = S.stats[examKey(t, d)], pct = s && s.n ? Math.round(100 * s.ok / s.n) + "%" : "";
      const on = examDrill && examDrill.test.id === t.id && examDrill.idx === i;
      return `<button class="chip${on ? " cur" : ""}" data-t="${t.id}" data-i="${i}" aria-pressed="${on}">${drillName(d.type)}${pct ? ` <span class="pct">${pct}</span>` : ""}</button>`;
    }).join("");
    return `<div class="test"><h3><b>${t.id}</b><span data-t="${t.id}">${getLang() === "en" ? t.en : t.zh}</span></h3>` +
      (chips ? `<div class="chips">${chips}</div>` : `<p class="self"></p>`) + `</div>`;
  }).join("");
  pairTests(g);
  $("testsList").querySelectorAll("p.self").forEach(el => pairText(el, () => tr("這一項要看譜唱或口頭描述,App 不出題;請跟老師練習。", "Needs sight-singing or spoken description — practise with your teacher.")));
}
/* 測驗說明:中英文行數不一樣 → 保留比較高的那個高度(pairText),換語言時版面不動 */
function pairTests(g){
  $("testsList").querySelectorAll("span[data-t]").forEach(el => { const t = g.tests.find(x => x.id === el.dataset.t); if (t) pairText(el, () => tr(t.zh, t.en)); });
}
$("testsList").onclick = e => {
  const b = e.target.closest(".chip[data-t]"); if (!b) return;
  mock = null;
  const g = gradeOf(S.exam.system, S.exam.grade), t = g.tests.find(x => x.id === b.dataset.t);
  loadDrill({ test: t, drill: t.drills[Number(b.dataset.i)], idx: Number(b.dataset.i) });
};
function loadDrill(d){
  examDrill = d;
  const q = makeDrill(d.drill, { system: S.exam.system, key: examKey(d.test, d.drill) });
  q.examRef = d;
  // 標題跟著語言(模擬考加「模擬考 i/n · 」;mockI、mockN 由 loadMock 設)
  lazy(q, "label", () => (q.mockI != null ? tr(`模擬考 ${q.mockI + 1}/${q.mockN} · `, `Mock ${q.mockI + 1}/${q.mockN} · `) : "") + `${d.test.id} · ${drillName(d.drill.type)}`);
  setQuestion(q, "exam");
  renderExam(); renderStats();
}
function drawExam(){
  const all = allDrills(); if (!all.length) return;
  let d; do { d = all[Math.floor(Math.random() * all.length)]; } while (all.length > 1 && examDrill && d.test.id === examDrill.test.id && d.idx === examDrill.idx && Math.random() < 0.8);
  loadDrill(d);
}
$("drawBtn").onclick = () => { mock = null; drawExam(); };

/* ══ 模擬考:每一項測驗抽一個題型,依序做完,最後看結果(跟 FingerDrill 的模擬考同一個概念) ══ */
let mock = null;
$("mockBtn").onclick = () => {
  const g = gradeOf(S.exam.system, S.exam.grade);
  const queue = g.tests.filter(t => t.drills.length).map(t => { const idx = Math.floor(Math.random() * t.drills.length); return { test: t, drill: t.drills[idx], idx }; });
  if (!queue.length) return;
  mock = { queue, i: 0, res: [] };
  loadMock();
};
function loadMock(){
  const d = mock.queue[mock.i], m = mock;
  loadDrill(d); mock = m;
  cur.mockI = m.i; cur.mockN = m.queue.length;   // 標題的「模擬考 i/n」(loadDrill 的 label getter)
  renderQuestion();
}
let lastMock = null;   // 模擬考結果畫面(換語言時重寫)
function showMockResult(){
  stopPlayback();
  const m = mock; mock = null; cur = null; A = null;
  lastMock = m;
  showMockText();
  $("playBtn").disabled = true; $("revealBtn").hidden = true; $("nextBtn").disabled = false; $("nextBtn").hidden = false;   // 下一題 = 再考一次
}
function showMockText(){
  const m = lastMock, ok = m.res.filter(Boolean).length;
  $("qTitle").classList.remove("empty");
  $("qTitle").textContent = tr(`模擬考結果 ${ok}/${m.queue.length}`, `Mock result ${ok}/${m.queue.length}`);
  $("qTags").innerHTML = ""; $("stepQ").textContent = "";
  $("answers").classList.remove("compact");
  $("answers").innerHTML = `<div class="mock-res">` + m.queue.map((d, i) =>
    `<div><b>${d.test.id}</b><span>${drillName(d.drill.type)}</span><i class="${m.res[i] ? "ok" : "no"}">${m.res[i] ? "✓" : "✗"}</i></div>`).join("") + `</div>`;
  const fb = $("feedback");
  fb.className = "feedback " + (ok === m.queue.length ? "ok" : "");
  fb.textContent = ok === m.queue.length ? tr("全部答對!", "All correct!") : tr("錯的項目可以從下方清單再練", "Practise the missed ones from the list below");
}
/* 外框改了考試系統/級數(exam.auto = 還沒選考試,只是點進檢定分頁看看) */
export function setExam(ex){
  S.exam = { system: ex.system, grade: ex.grade };
  if (ex.auto) S.exam.auto = true;
  store.save();
  if (SY) onExamChange();
}
function onExamChange(){ examDrill = null; tabCur.exam = null; mock = null; renderExam(); if (active && S.tab === "exam") showEmpty(); renderStats(); }

/* ══ 分頁切換 ══ */
function switchTab(tab, keepQuestion){
  stopPlayback();
  S.tab = tab; store.save();
  ROOT.querySelectorAll(".pane").forEach(p => p.hidden = p.dataset.pane !== tab);
  $("drawBtn").hidden = tab !== "exam"; $("quizTop").hidden = tab !== "exam";
  $("mockBtn").hidden = tab !== "exam"; mock = null;
  if (PRACTICE.includes(tab)) { renderPicker(tab); if (!keepQuestion) { if (tabCur[tab]) setQuestion(tabCur[tab], tab, true); else newPractice(tab); } }
  else { renderExam(); if (!keepQuestion) { if (tabCur.exam) setQuestion(tabCur.exam, "exam", true); else showEmpty(); } }
  renderStats();
  if (!keepQuestion) window.scrollTo({ top: 0 });
}
/* 外框:顯示 / 離開這個模組 */
/* 回到同一個子項目(切到背景再回來、從別的分頁回來):題目與作答照原樣(setQuestion restore),進行中的模擬考也保留 */
export function enter(tab){ active = true; const m = tab === S.tab ? mock : null; switchTab(tab); if (m) mock = m; }
export function leave(){ active = false; stopPlayback(); }

/* ══ 題目卡 ══ */
function showEmpty(){
  stopPlayback();
  cur = null; A = null; lastMock = null;
  $("qTitle").classList.add("empty");
  emptyText();
  $("qTags").innerHTML = ""; $("stepQ").textContent = ""; $("answers").innerHTML = ""; $("feedback").textContent = ""; $("feedback").className = "feedback";
  $("playBtn").disabled = true; $("nextBtn").disabled = true; $("revealBtn").hidden = true;
  $("playBtn").hidden = $("nextBtn").hidden = true;   // 還沒有題目:▶ 與「下一題」先不出現
  syncScoreLine();
}
function emptyText(){ pairText($("qTitle"), () => tr("選一種題型,或按「隨機抽一題」", "Pick a test type, or tap Random")); }
const session = {};   // 每個分頁這一輪:{ n, ok, streak }
function syncScoreLine(){
  const s = session[S.tab];
  $("scoreLine").textContent = s && s.n ? tr(`本輪 ${s.ok}/${s.n} · 連對 ${s.streak}`, `${s.ok}/${s.n} · streak ${s.streak}`) : "";
}
function setQuestion(q, tab, restore){
  stopPlayback();
  if (!q) { showEmpty(); return; }
  cur = q; tabCur[tab] = q; lastMock = null;
  if (!restore || !q._A) q._A = { step: 0, results: [], done: false, keys: [], taps: [], played: false };
  A = q._A;
  renderQuestion();
  preloadSamples();
}
function renderQuestion(){
  const q = cur;
  $("qTitle").classList.remove("empty");
  $("qTitle").textContent = q.label || "";
  $("qTags").innerHTML = (q.tags || []).map(t => `<span class="q-tag">${t}</span>`).join("");
  $("playBtn").disabled = false; $("playBtn").hidden = $("nextBtn").hidden = false;
  $("revealBtn").hidden = A.done || !A.played;   // 「顯示答案」聽過一次題目才出現,答完藏起來
  $("nextBtn").disabled = !A.done && !q.tap;
  renderAnswers();
  syncScoreLine();
}
function renderAnswers(){
  const q = cur, box = $("answers");
  $("feedback").className = "feedback";
  if (q.steps) {
    const st = q.steps[Math.min(A.step, q.steps.length - 1)];
    $("stepQ").textContent = q.tab && q.steps.length === 1 ? "" : (q.steps.length > 1 ? `(${Math.min(A.step + 1, q.steps.length)}/${q.steps.length}) ` : "") + st.q;
    const res = A.results[A.step];
    box.classList.toggle("compact", st.choices.every(c => c.label.length <= 3));
    box.innerHTML = st.choices.map((c, i) => {
      let cls = "ans";
      if (res) cls += c.id === st.answer ? " right" : c.id === res.pick ? " wrong" : " done";
      return `<button class="${cls}" data-id="${c.id}">${c.label}${c.sub ? `<small>${c.sub}</small>` : ""}</button>`;   // 音程:第二行小字是以 C 為根的例子
    }).join("");
  } else if (q.keys) {
    box.classList.remove("compact");
    $("stepQ").textContent = q.keys.target.length > 1 ? tr(`在鍵盤上彈出 ${q.keys.target.length} 個音`, `Play the ${q.keys.target.length} notes`) : "";   // 單音:題目已經寫「這是什麼音?」,標籤有「哪個八度都算對」
    // 單音題的參考音:琴鍵正上方左邊一顆次要按鈕「這是 C」(不是圓形、不是實心;按了播 C4 / A4、那個鍵亮 1 秒,不算作答)
    const refBtn = q.ref != null ? `<div class="kbd-row"><button class="btn ghost" id="e-refBtn" style="min-height:44px;height:auto">${refLabel(q)}</button></div>` : "";
    box.innerHTML = `<div class="kbd-wrap">${refBtn}<div class="kbd" id="e-kbd">${keyboardHTML(q.keys)}</div>` +
      (q.keys.target.length > 1 ? `<div class="kbd-row"><div class="kbd-dots" id="e-kbdDots"></div><button class="btn ghost small" id="e-kbdClear">${T("clearKeys")}</button></div>` : "") + `</div>`;
    syncKeys(); fitKeyboard();
  } else if (q.tap) {
    box.classList.remove("compact");
    $("stepQ").textContent = q.tap.kind === "pulse" ? tr("播放時跟著拍子按", "Tap the beat while it plays") : tr(`聽完之後按出節奏(${q.tap.n} 下)`, `After listening, tap the rhythm (${q.tap.n} taps)`);
    box.innerHTML = `<div class="tap-wrap"><button class="tap-pad" id="e-tapPad">${T("tapBtn")}</button><span class="tap-info" id="e-tapInfo"></span>` +
      `<button class="btn small" id="e-tapDone">${T("tapDone")}</button></div>`;
    syncTap();
  }
  if (A.done) showResult();
  else $("feedback").textContent = !A.played ? idleText() : A.hint ? A.hint() : "";
}
/* 還沒聽題目時的狀態:第一次進來寫說明(INTRO),之後寫「先按 ▶ 聽題目」;單音題有參考音時兩句都先提「這是 C」 */
function idleText(){
  const first = INTRO[S.tab] && !S.intro[S.tab];
  if (cur && cur.ref != null) {
    const n = noteName(cur.ref % 12);
    return first ? tr(`先按「這是 ${n}」記住 ${n},再按 ▶ 聽題目、點出那個鍵`, `Tap “This is ${n}” to hear ${n}, then ▶ and tap the key`)
      : tr(`先按「這是 ${n}」記住 ${n},再按 ▶ 聽題目`, `Tap “This is ${n}” to hear ${n}, then ▶ to listen`);
  }
  return first ? tr(...INTRO[S.tab]) : tr("先按 ▶ 聽題目", "Press ▶ to listen");
}
const refLabel = q => tr("這是 ", "This is ") + noteName(q.ref % 12);
/* 第一次進來這個子項目(還沒答完一題):狀態那行寫在練什麼、怎麼作答(答完一題就換回「先按 ▶ 聽題目」) */
const INTRO = {
  note: ["聽一個音,點出是哪個鍵", "Hear a note, tap the key"],
  interval: ["聽兩個音,選出它們差多遠", "Hear two notes, pick how far apart"],
  chord: ["聽一個和弦,選出是哪一種", "Hear a chord, pick its type"]
};

/* ── 選擇題 ── */
$("answers").addEventListener("click", e => {
  const b = e.target.closest(".ans"); if (!b || !cur || !cur.steps) return;
  const id = b.dataset.id;
  if (A.done) { if (cur.compare) playSeq(cur.compare(id)); return; }   // 答完:點選項聽聽看差在哪裡
  const st = cur.steps[A.step];
  if (A.results[A.step]) return;
  A.results[A.step] = { pick: id, ok: id === st.answer };
  renderAnswers();
  if (A.step < cur.steps.length - 1) { setTimeout(() => { if (!A.done) { A.step++; renderAnswers(); } }, 650); return; }
  finish(A.results.every(r => r.ok));
});

/* ── 鍵盤 ── */
function keyboardHTML(k){
  let a = k.lo; while (isBlack(a)) a--;
  let b = k.hi; while (isBlack(b)) b++;
  const whites = []; for (let m = a; m <= b; m++) if (!isBlack(m)) whites.push(m);
  const w = 100 / whites.length;
  let html = whites.map(m => `<div class="k wk${k.allowed && !k.allowed.includes(m % 12) ? " off" : ""}" data-m="${m}">${k.pcOnly ? noteName(m % 12) : m % 12 === 0 ? "C" + (Math.floor(m / 12) - 1) : ""}</div>`).join("");   // 單音題:每個白鍵照「音名」設定標字(跟認音一樣)
  whites.forEach((m, i) => {
    if (m + 1 <= b && isBlack(m + 1)) html += `<div class="k bk${k.allowed && !k.allowed.includes((m + 1) % 12) ? " off" : ""}" data-m="${m + 1}" style="left:calc(${(i + 1) * w}% - ${w * 0.31}%);width:${w * 0.62}%"></div>`;
  });
  return html;
}
/* 鍵盤高度照真實比例(白鍵 5.2:1,ScrollScore 的算法),手指要按得到:90–170px */
function fitKeyboard(){
  const kb = $("kbd"); if (!kb) return;
  const n = kb.querySelectorAll(".wk").length || 1;
  kb.style.height = Math.round(Math.min(170, Math.max(90, kb.clientWidth / n * 5.2))) + "px";
}
addEventListener("resize", fitKeyboard);
function syncKeys(){
  const k = cur.keys, dots = $("kbdDots");
  if (dots) dots.innerHTML = k.target.map((_, i) => {
    const r = A.keyResult;
    const cls = i < A.keys.length ? (r ? (r.ok || i < r.firstWrong || r.firstWrong < 0 ? "right" : i === r.firstWrong ? "wrong" : "on") : "on") : "";
    return `<i class="${cls}"></i>`;
  }).join("");
}
$("answers").addEventListener("pointerdown", e => {
  const key = e.target.closest(".k"); if (!key || !cur || !cur.keys) return;
  if (key.dataset.refOff) return;   // 參考音亮起來時暫時拿掉 .off 的鍵(不是可以作答的音)
  e.preventDefault();
  const m = Number(key.dataset.m), k = cur.keys;
  if (A.done && k.pcOnly) tapNote(m + 12 * Math.round((k.target[0] - m) / 12));   // 單音答完:在題目的八度出聲比較
  else if (!k.mute) tapNote(m);
  key.classList.add("on"); setTimeout(() => key.classList.remove("on"), 180);
  if (A.done) return;
  A.keys.push(m);
  if (A.keys.length >= k.target.length) {
    const r = judgeKeys(k, A.keys.slice(0, k.target.length));
    A.keyResult = r;
    if (k.target.length === 1) { key.classList.add(r.ok ? "right" : "wrong"); if (!r.ok) markRightKey(); }
    syncKeys();
    finish(r.ok);
  } else syncKeys();
});
function markRightKey(){
  const k = cur.keys; if (k.target.length !== 1) return;
  $("answers").querySelectorAll(".k").forEach(el => { if ((Number(el.dataset.m) - k.target[0]) % 12 === 0) el.classList.add("right"); });
}
/* 參考音(單音題):播 C4 / A4、琴鍵上那個鍵亮 1 秒;不算作答、不算「聽過題目」、不影響計時與統計 */
let refTimer = 0;
async function playRef(){
  if (!cur || cur.ref == null) return;
  const q0 = cur, ref = cur.ref;
  if (play) stopPlayback();
  const c = audio.ensureAudio();
  if (c.state !== "running") await within(c.resume().catch(() => {}), 1500);
  const ok = await preloadSamples();
  await within(audio.masterReady, 1500);
  if (!ok || cur !== q0) return;
  const t = c.currentTime + 0.02;
  audio.playPianoNote(ref, t, t + 1.0, t + 1.0, 62, false);
  const key = $("answers").querySelector(`.k[data-m="${ref}"]`); if (!key) return;
  clearTimeout(refTimer);
  $("answers").querySelectorAll(".k[data-ref-off]").forEach(k => { k.classList.add("off"); delete k.dataset.refOff; });
  if (key.classList.contains("off")) { key.classList.remove("off"); key.dataset.refOff = "1"; }   // 不出題的鍵(.off 的顏色會蓋過 .on)
  key.classList.add("on");
  refTimer = setTimeout(() => { key.classList.remove("on"); if (key.dataset.refOff) { key.classList.add("off"); delete key.dataset.refOff; } }, 1000);
}
$("answers").addEventListener("click", e => {
  if (e.target.closest("#e-refBtn")) { playRef(); return; }
  if (e.target.id === "e-kbdClear" && cur && !A.done) { A.keys = []; A.keyResult = null; syncKeys(); }
  if (e.target.id === "e-tapDone" && cur && cur.tap && !A.done) judgeTapNow();
});

/* ── 節拍鍵 ── */
function syncTap(){
  const info = $("tapInfo"); if (!info) return;
  info.textContent = A.taps.length ? tr(`${A.taps.length} 下`, `${A.taps.length} taps`) : "";
}
$("answers").addEventListener("pointerdown", e => {
  const pad = e.target.closest("#e-tapPad"); if (!pad || !cur || !cur.tap || A.done) return;
  e.preventDefault();
  if (!A.played) { $("feedback").textContent = tr("先按 ▶ 聽題目", "Press ▶ to listen"); return; }
  const now = audio.audioNow();
  // 拍出節奏:只算播完之後(回聲);跟著打拍子:只算播放中
  if (cur.tap.kind === "rhythm" && play && now < play.t0 + play.dur - 0.05) return;
  if (cur.tap.kind === "pulse" && A.tapStart != null && now > A.tapEnd + 0.6) return;
  A.taps.push(now);
  pad.classList.add("hit"); setTimeout(() => pad.classList.remove("hit"), 90);
  syncTap();
  if (cur.tap.kind === "rhythm" && A.taps.length >= cur.tap.n) setTimeout(judgeTapNow, 250);
}, { passive: false });
function judgeTapNow(){
  if (A.done) return;
  const r = judgeTaps(cur.tap, A.taps);
  A.tapRes = r;   // r.msg 是 getter(換語言時跟著變)
  finish(r.ok);
}

/* ── 結果 ── */
function finish(ok){
  A.done = true; A.ok = ok;
  const s = session[S.tab] || (session[S.tab] = { n: 0, ok: 0, streak: 0 });
  s.n++; if (ok) { s.ok++; s.streak++; } else s.streak = 0;
  const st = S.stats[cur.key] || (S.stats[cur.key] = { n: 0, ok: 0 });
  st.n++; if (ok) st.ok++;
  logAnswer(ok);
  if (INTRO[S.tab] && !S.intro[S.tab]) S.intro[S.tab] = true;   // 答完一題:第一次的說明不再出現
  if (mock) mock.res[mock.i] = ok;
  store.save();
  showResult();
  $("nextBtn").disabled = false; $("revealBtn").hidden = true;
  syncScoreLine(); renderStats();
  if (S.tab === "exam") { renderExam(); if (ctx) ctx.examChanged(); }
  if (ok && S.auto) autoNext(cur);
}
/* 答對自動下一題:至少停 1.1 秒讓人看到結果;題目還在播(或又按了重聽)就等播完再換。
   以前時間到時還在播放就直接放棄 → 題目卡住、看起來像「沒有題目了」 */
function autoNext(q0){
  const t0 = Date.now();
  const check = () => {
    if (cur !== q0 || !S.auto || !active) return;            // 已經換題 / 關掉自動 / 切到別的分頁(不能在背景自己出題播放)
    if (Date.now() - t0 < 1100 || play || starting) { setTimeout(check, 200); return; }
    nextQuestion();
  };
  setTimeout(check, 200);
}
function showResult(){
  const fb = $("feedback");
  fb.className = "feedback " + (A.ok ? "ok" : "no");
  const ans = cur.steps ? cur.steps.map(s => s.choices.find(c => c.id === s.answer).label).join(" → ") : "";
  const extra = [A.tapRes && A.tapRes.msg, cur.reveal].filter(Boolean).join(" · ");
  fb.textContent = (A.ok ? tr("✓ 正確", "✓ Correct") : A.revealed ? tr("答案:", "Answer: ") + (ans || "") : tr("✗ 答案是 ", "✗ Answer: ") + (ans || ""))
    + (extra ? (ans || A.ok ? " · " : "") + extra : "") + (A.done && cur.compare ? tr("(點選項可以比較)", " (tap options to compare)") : "");
}
$("revealBtn").onclick = () => {
  if (!cur || A.done) return;
  A.revealed = true;
  if (cur.steps) cur.steps.forEach((s, i) => { if (!A.results[i]) A.results[i] = { pick: null, ok: false }; });
  finish(false);
  if (cur.steps) { A.step = cur.steps.length - 1; renderAnswers(); }
  if (cur.keys) { markRightKey(); if (cur.keys.target.length > 1) playSeq({ ev: cur.keys.target.map((m, i) => ({ t: i * 0.5, midi: m, dur: 0.48, vel: 70 })), dur: cur.keys.target.length * 0.5 + 0.5 }); }
};
function nextQuestion(){
  if (S.tab === "exam" && mock) {
    if (++mock.i >= mock.queue.length) { showMockResult(); return; }
    loadMock(); startPlayback(); return;
  }
  if (S.tab === "exam") { if (examDrill) loadDrill(examDrill); else drawExam(); }
  else newPractice(S.tab);
  startPlayback();   // 新題目直接播
}
$("nextBtn").onclick = () => {
  if (!cur && S.tab === "exam") { $("mockBtn").click(); return; }   // 模擬考結果畫面:再考一次
  if (cur && cur.tap && !A.done && A.taps.length) { judgeTapNow(); return; }
  nextQuestion();
};

/* ══ 音訊 ══ */
let preloadJob = null;
function setRing(p){
  const r = $("playRing"); if (!r) return;
  r.classList.toggle("indet", p == null);
  r.querySelector(".ring-fg").style.strokeDashoffset = String(p == null ? 0.82 : 1 - Math.max(0.03, p));
}
function neededNotes(q){
  const notes = q.play.ev.map(e => ({ midi: e.midi, vel: e.vel }));
  if (q.keys) for (let m = q.keys.lo - 2; m <= q.keys.hi + 2; m++) notes.push({ midi: m, vel: 70 });
  return notes;
}
function preloadSamples(){
  if (!cur) return Promise.resolve(false);
  if (preloadJob && preloadJob.q === cur) return preloadJob.p;
  const job = { q: cur, p: null };
  job.p = (async () => {
    try {
      setRing(null);
      await audio.loadPianoFor(neededNotes(cur), 4, p => { if (preloadJob === job) { setRing(p * 0.95); setMsg("loadingMsg", () => tr("載入鋼琴聲音… ", "Loading piano… ") + Math.round(p * 100) + "%"); } });
      if (cur.play.clicks && cur.play.clicks.length) await audio.loadClick().catch(() => {});
      if (preloadJob === job) { setRing(1); setMsg("loadingMsg", null); }
      return true;
    } catch (e) {
      if (preloadJob === job) { preloadJob = null; setMsg("loadingMsg", () => tr("鋼琴聲音載入失敗,再按一次播放重試(第一次需要網路)", "Could not load the piano — tap play to retry (needs internet once)")); }
      return false;
    }
  })();
  preloadJob = job;
  return job.p;
}
const within = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
let play = null, starting = 0;
function playSeq(seq){
  const ctx = audio.ensureAudio();
  audio.stopAll();
  const t0 = ctx.currentTime + 0.12;
  for (const e of seq.ev) audio.playPianoNote(e.midi, t0 + e.t, t0 + e.t + e.dur, t0 + e.t + e.dur, Math.max(1, Math.min(127, Math.round(e.vel))), false);
  for (const c of seq.clicks || []) audio.playClick(t0 + c.t, c.strong);
  return t0;
}
function tapNote(m){
  const ctx = audio.ensureAudio(), t = ctx.currentTime + 0.01;
  audio.playPianoNote(m, t, t + 0.6, t + 0.6, 72, false);
}
async function startPlayback(){
  if (!cur || starting) return;
  const token = starting = Date.now() + Math.random(), q0 = cur;
  const ctx = audio.ensureAudio();
  $("playBtn").classList.add("busy"); $("playLabel").textContent = tr("準備中…", "Preparing…");
  if (ctx.state !== "running") await within(ctx.resume().catch(() => {}), 1500);
  const ok = await preloadSamples();
  await within(audio.masterReady, 1500);
  $("playBtn").classList.remove("busy");
  if (starting !== token || cur !== q0) { if (starting === token) starting = 0; return; }
  starting = 0;
  if (!ok) { $("playLabel").textContent = T("play"); return; }
  const t0 = playSeq(cur.play);
  play = { t0, dur: cur.play.dur, raf: 0 };
  A.played = true; if (!A.t0) A.t0 = Date.now();
  $("revealBtn").hidden = A.done;
  if (cur.tap) { A.taps = []; syncTap(); A.tapStart = t0; A.tapEnd = t0 + cur.play.dur; }
  // 作答提示記成函式(A.hint),換語言、切走再回來時 renderAnswers 照目前的語言重寫
  A.hint = cur.tap && cur.tap.kind === "pulse" ? () => tr("跟著拍子按「拍」", "Tap along") : null;
  if (!A.done) $("feedback").textContent = A.hint ? A.hint() : "";
  $("playIcon").innerHTML = '<rect x="6" y="6" width="12" height="12" rx="1.5"/>';
  $("playLabel").textContent = T("stop");
  const tick = () => {
    if (!play) return;
    if (audio.audioNow() > play.t0 + play.dur + 0.3) { stopPlayback(true); return; }
    play.raf = requestAnimationFrame(tick);
  };
  play.raf = requestAnimationFrame(tick);
}
function stopPlayback(natural){
  starting = 0; $("playBtn").classList.remove("busy");
  if (play) {
    cancelAnimationFrame(play.raf); play = null;
    if (!natural) audio.stopAll();
    // 跟著打拍子:播完就批改
    if (natural && cur && cur.tap && cur.tap.kind === "pulse" && !A.done) judgeTapNow();
    if (A) A.hint = null;   // 「跟著拍子按」只在播放中(手動停止就拿掉,不然留著過時的提示)
    if (!natural && cur && A && !A.done) $("feedback").textContent = "";
    if (natural && cur && cur.tap && cur.tap.kind === "rhythm" && !A.done) {
      const n = cur.tap.n;
      A.hint = () => tr(`現在按出節奏(${n} 下)`, `Now tap the rhythm (${n} taps)`);
      $("feedback").textContent = A.hint();
    }
  }
  $("playIcon").innerHTML = '<path d="M7 4v16l13-8z"/>';
  $("playLabel").textContent = cur && A && A.played ? T("replay") : T("play");
}
$("playBtn").onclick = () => { if (play) stopPlayback(); else if (!starting) startPlayback(); };

/* ══ 選項 ══ */
function syncOpts(){ $("optAuto").setAttribute("aria-pressed", String(!!S.auto)); }
$("optAuto").onclick = () => { S.auto = !S.auto; store.save(); syncOpts(); if (S.exam && SY) renderExam(); };
syncOpts();

/* 桌機快捷鍵(外框轉給目前的模組):空白鍵 播放、Enter / N 下一題、1–9 選答案 */
export function onKey(e){
  if (e.code === "Space") { e.preventDefault(); $("playBtn").click(); }
  else if (e.key === "Enter" || e.key === "n" || e.key === "N") { if (!$("nextBtn").disabled) $("nextBtn").click(); }
  else if (/^[1-9]$/.test(e.key)) { const b = $("answers").querySelectorAll(".ans")[Number(e.key) - 1]; if (b) b.click(); }
}

/* ══ 各項正確率 ══ */
function renderStats(){
  let rows = [];
  if (PRACTICE.includes(S.tab)) rows = ALL_ITEMS[S.tab].map(it => [itemLabel(S.tab, it), S.stats[S.tab + ":" + it.id]]);
  else if (S.exam && SY) rows = allDrills().map(d => [`${d.test.id} ${drillName(d.drill.type)}`, S.stats[examKey(d.test, d.drill)]]);
  rows = rows.filter(r => r[1] && r[1].n);
  // 沒有資料:整張藏起來(不放一張空卡);檢定頁本來就不放(app.css body.view-exam)
  $("statsCard").hidden = !rows.length;
  $("statsList").innerHTML = rows.map(([name, s]) => {
    const p = Math.round(100 * s.ok / s.n);
    return `<div class="srow"><span>${name}</span><div class="bar"><i class="${p < 70 ? "low" : ""}" style="width:${p}%"></i></div><small>${p}% · ${tr(`${s.n} 題`, `${s.n} q`)}</small></div>`;
  }).join("");
  $("statsReset").hidden = !rows.length;
}
$("statsReset").onclick = () => {
  if (!confirm(tr("清除這個分頁的正確率紀錄?", "Reset accuracy for this tab?"))) return;
  const pre = PRACTICE.includes(S.tab) ? S.tab + ":" : `exam|${S.exam.system}|${S.exam.grade}|`;
  for (const k of Object.keys(S.stats)) if (k.startsWith(pre)) delete S.stats[k];
  store.save(); renderStats(); if (S.tab === "exam") renderExam();
};

/* ══ 練習紀錄(js/shared/practicelog.js,跟 DrumDrill 同一份)══ S.log = { "YYYY-MM-DD": { n, sec, hits, total } }(只留最近 400 天)
   答一題算一題;秒數 = 第一次按 ▶ 到作答完的時間(一題最多算 2 分鐘,放著不動不算);每週目標 S.goal(分鐘,點一下換) */
function logAnswer(ok){
  const sec = A && A.t0 ? Math.min(120, (Date.now() - A.t0) / 1000) : 0;
  addLog(S.log, { n: 1, sec, hits: ok ? 1 : 0, total: 1 });
  renderLog();
}
$("goalBtn").onclick = () => { S.goal = nextGoal(S.goal); store.save(); renderLog(); };
function renderLog(){
  paintLog($, S.log, S.goal);
  const t = today(S.log);
  $("logAcc").textContent = t.total ? Math.round(100 * t.hits / t.total) + "%" : "–";
}

/* 檢定分頁上方的進度:本級的聽力測驗題型答對率 */
export function examStatus(){
  if (!SY || !S.exam || !gradeOf(S.exam.system, S.exam.grade)) return "";
  let n = 0, ok = 0, tests = 0;
  for (const d of allDrills()) { const s = S.stats[examKey(d.test, d.drill)]; if (s) { n += s.n; ok += s.ok; } }
  tests = gradeOf(S.exam.system, S.exam.grade).tests.length;
  return n ? tr(`${tests} 項測驗 · 正確率 ${Math.round(100 * ok / n)}%`, `${tests} tests · ${Math.round(100 * ok / n)}% correct`) : tr(`${tests} 項測驗`, `${tests} tests`);
}

/* ── 啟動(外框呼叫)── */
export async function start(c){
  ctx = c;
  setExam(c.exam);
  let ver = {}; try { ver = JSON.parse(document.getElementById("pdVersions").textContent); } catch (e) {}
  SY = await fetch("data/aural.json" + (ver["data/aural.json"] ? "?v=" + ver["data/aural.json"] : "")).then(r => r.json());
  if (S.exam) renderExam();
  renderLog();
  window.__ear = { get cur(){ return cur; }, get A(){ return A; }, get play(){ return !!play; }, S, SY, switchTab, loadDrill, allDrills, finish };
}
