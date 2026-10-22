import { generateTest, keyOptionsFor } from './generator/generate.js';
import { toMusicXml } from './generator/musicxml.js';
import { createHistory, generateUnique } from './generator/fingerprint.js';
import { createKey, pitchAt } from './generator/theory.js';
import { createPlayer } from './playback.js';
import { expectedOnsets } from './scoring.js';
import { createListener } from './miclisten.js';
import { expectedEvents, scoreRecording } from './micscore.js';
import { createStage, barTimings } from './stage.js';
import { t, applySightStatic } from './i18n.js';
import { pairText, unpair, tr } from '../shared/i18n.js';
import { createReading, cleanRead } from './reading.js';
import { addLog, cleanLog, renderLog as paintLog, today, streak as logStreak, nextGoal, cleanGoal } from '../shared/practicelog.js';
import { STAGES, HANDS, stageOf, rulesForStage, pickGrade, soloScore, rangeLabel } from './stages.js';
import { paintNoteNames } from '../shared/notenames.js';
import { createTempo } from '../shared/tempo.js';
import * as audio from '../shared/audio.js';

/* 視奏模組(原 SightDrill):外框(js/main.js)負責頂欄、分頁、主題、語言與考試設定;這裡的元素 id 都加 "s-" 前綴。
   檢定分頁:只有 ABRSM 1–8 級有出題規則(照官方視奏範例整理),其他考試/級數只說明還沒有,不自己發明 */
// 儲存鍵:合併成 PianoDrill 後改前綴;第一次打開沿用同一個網域上 SightDrill 留下的紀錄
const STORAGE_KEY = 'pianodrill.sight.history.v1';
const LAYOUT_STORAGE_KEY = 'pianodrill.sight.layout.v2';   // v2:排法改成「每行幾小節 + 縮放」,舊的快取不沿用
const OLD_KEYS = { [STORAGE_KEY]: 'sightscore.history.v1', 'pianodrill.sight.practice.v1': 'sightdrill.practice.v1', 'pianodrill.sight.mic': 'sightdrill.mic' };
function readKey(key) {
  const v = localStorage.getItem(key);
  return v ?? (OLD_KEYS[key] ? localStorage.getItem(OLD_KEYS[key]) : null);
}
/* pianodrill.sight.v1:{ stage:{ right, left, both }(視奏分頁每個子項目選的範圍階段 1–4), names:{ "1": true }(每一階的「顯示音名」;階 1 預設開) }
   讀進來先消毒;舊版的 grade(視奏分頁選的級數)丟掉 */
const SS = (() => {
  let s = null;
  try { s = JSON.parse(localStorage.getItem('pianodrill.sight.v1') || '{}'); } catch { s = null; }
  s = s && typeof s === 'object' && !Array.isArray(s) ? s : {};
  const stage = {}, names = {};
  for (const h of HANDS) { const v = s.stage && s.stage[h]; stage[h] = Number.isInteger(v) && v >= 1 && v <= 4 ? v : 1; }
  for (const n of [1, 2, 3, 4]) { const v = s.names && s.names[n]; names[n] = typeof v === 'boolean' ? v : n === 1; }
  // 練習紀錄:舊版存在 pianodrill.sight.practice.v1({ 日期: 題數 }),第一次讀進來換成 { n, sec }
  let log = s.log;
  if (!log) { log = {}; try { for (const [k, n] of Object.entries(JSON.parse(readKey('pianodrill.sight.practice.v1') ?? '{}') || {})) log[k] = { n, sec: 0 }; } catch { /* 讀不到就從頭記 */ } }
  // 第一次進來右手 / 左手 / 雙手的一行說明(題目卡狀態那行):彈完一遍的子項目 = true
  const intro = {}; if (s.intro && typeof s.intro === 'object') for (const h of HANDS) if (s.intro[h] === true) intro[h] = true;
  // 視奏分頁的速度:每個子項目的每個難度各自記住({ "right-1": 72 });沒改過 = 預設(難度 1–2 最快 ♩=80)
  const bpm = {}; if (s.bpm && typeof s.bpm === 'object') for (const [k, v] of Object.entries(s.bpm)) if (/^(right|left|both)-[1-4]$/.test(k) && Number.isFinite(v)) bpm[k] = Math.max(30, Math.min(200, Math.round(v)));
  // 檢定頁每一級練過幾題(本項卡的標籤「已練 n 題」;{ "abrsm-3": 5 }):30 秒準備跑完算一題
  const xn = {}; if (s.xn && typeof s.xn === 'object') for (const [k, v] of Object.entries(s.xn)) if (/^(abrsm|trinity)-[0-8]$/.test(k) && Number.isInteger(v) && v > 0) xn[k] = Math.min(v, 99999);
  // 進行中的模擬考標記(正常結束、按停止會拿掉;重新整理之後還在 = 說明「模擬考已中止」)
  const mockRun = s.mockRun && typeof s.mockRun === 'object' && !Array.isArray(s.mockRun) ? { at: Number(s.mockRun.at) || 0 } : undefined;
  return { stage, names, read: cleanRead(s.read), log: cleanLog(log), goal: cleanGoal(s.goal), intro, bpm, xn, mockRun };
})();
const saveSS = () => { try { localStorage.setItem('pianodrill.sight.v1', JSON.stringify(SS)); } catch { /* 存不了就算了 */ } };
const $ = (id) => document.getElementById('s-' + id);
/* 檢定頁的視奏模擬考(下面「模擬考」一節):idle | run(phase = load / prep / play)| result | aborted(說明為什麼中止) */
// 視奏沒有模擬考(2026-10 使用者:跟練習流程「看譜 30 秒 → 彈一遍」重複):mk 一直是 idle;舊版留下的 mockRun 標記直接丟掉
delete SS.mockRun;
let xCheck = null;   // 檢定頁彈完一遍的自我檢查(null = 不顯示;paintSelfCheck)
const mk = { state: 'idle', reason: null, id: 0, phase: null, endAt: 0, timer: null, prepT0: 0, checks: [], stopped: false, click: null };
const mockOn = () => mk.state === 'run' || mk.state === 'result';
/* 用麥克風自動打分(2026-10 使用者確認;js/sight/micscore.js):開關預設開,第一次按「彈一遍」才問權限;使用者可以關 */
const MIC_UI = true;
let active = false;
let mode = 'free';          // 'free' 自由練習 / 'exam' 檢定分頁
let exam = { system: 'abrsm', grade: 1, auto: true };
let ctx = null;
/* 視奏分頁:子項目 = 認音 / 右手 / 左手 / 雙手(外框),右手 / 左手 / 雙手各自選範圍階段 */
let hand = 'both';
let keyValue = '';   // 檢定頁選的調性('' = 隨機;"G:major")
let readT = 0;   // 認音:上一次作答的時間(兩題之間最多算 30 秒)
const reading = createReading({ $, store: SS.read, save: saveSS, onAnswered: () => { const now = Date.now(); if (readT) addPracticeSec(Math.min(30, (now - readT) / 1000)); readT = now; recordPractice(); } });
const readOn = () => mode === 'free' && hand === 'read';
/* 視奏分頁:「彈一遍」一直在(不用先等 30 秒準備;準備是選用的);檢定頁照考試流程,準備完才出現 */
const freeAlong = () => mode === 'free' && hand !== 'read';
let lastHandTab = null;   // 上一次在畫面上的右手 / 左手 / 雙手(切到認音時用那一階的範圍)
const stageNow = () => stageOf(SS.stage[hand]);
const freeKey = () => `${hand}-${SS.stage[hand]}`;
/* 視奏分頁的狀態那行:第一次進來這個子項目(還沒彈完一遍)寫在練什麼、怎麼作答;之後寫下一步 */
const freeReadyKey = () => (SS.intro[hand] ? 'freeReady' : 'freeIntro');
/* 目前用哪一級的規則出題:檢定分頁照考試級數;視奏分頁 = 這一題抽到的級(範圍階段裡隨機) */
const currentGrade = () => (mode === 'exam' ? exam.grade : current && current.free ? current.score.grade : stageNow().grades[stageNow().grades.length - 1]);
/* 這一階的規則表複本(調性選單、出題用;階 1 只有 C 大調) */
const stageRules = (g = stageNow().grades[stageNow().grades.length - 1]) => rulesForStage(rules, stageNow(), g);
/* 檢定分頁:這個考試/級數有沒有視奏規則 */
// ABRSM 初級–8 級都有規則(data/sight-rules.json 的 grades["0"]–["8"];初級照 2020 年範例書 35 題);Trinity 還沒有
const examSupported = () => exam.system === 'abrsm' && exam.grade >= 0 && exam.grade <= 8;

const elements = {
  key: $('key'),
  sum: $('sum'),
  generate: $('generate'),
  prepare: $('prepare'),
  play: $('play'),
  playIcon: $('playIcon'),
  title: $('title'),
  countdown: $('countdown'),
  countdownValue: $('countdownValue'),
  prepFloat: $('prepFloat'),
  prepFloatValue: $('prepFloatValue'),
  meta: $('meta'),
  score: $('score'),
  playline: $('playline'),
  highlight: $('highlight'),
  message: $('message'),
  checklist: $('checklist'),
  along: $('along'),
  playAlong: $('playAlong'),
  alongMic: $('alongMic'),
  alongResult: $('alongResult'),
  confidence: $('confidence'),
};

/* ScrollScore's icon paths, so the two apps show the same glyphs. */
const PLAY_ICON_D = 'M8 5v14l11-7z';
const PAUSE_ICON_D = 'M6 5h4v14H6zM14 5h4v14h-4z';

const player = createPlayer({
  // Only loading progress and failures; play() reports the rest. playback.js
  // passes i18n keys (not already-localized text) so a language switch mid
  // load still re-renders correctly — see `refreshDynamicText`.
  onStatus: (key) => { if (key) say(key); },
});
const history = createHistory({
  capacity: 60,
  load: () => JSON.parse(readKey(STORAGE_KEY) ?? '[]'),
  save: (entries) => localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)),
});

/*
 * Which bars-per-line count a given shape of test settled on, remembered so
 * two tests of the same grade and bar count break their lines the same way —
 * the way a printed sight-reading book keeps a consistent page layout for
 * same-length tests. The count is decided by measuring the *rendered*
 * content (bar width depends on note density, chords, accidentals), so
 * without this two same-shaped tests could land on different counts for no
 * reason a reader could point to.
 *
 * Only the line breaking lives here. The staff size used to be the other half
 * of this entry, searched per test and ratcheted down when a denser test of
 * the same shape needed more shrinking; it is now fixed per viewport
 * (`STAFF_ZOOM`) and never searched, so there is nothing left to ratchet.
 * `matchesRequestedLayout` (see `fitScore`) is what keeps the two axes below
 * safe to fold into the key: a cached count OSMD no longer honours for this
 * test's content is caught and re-searched rather than silently rendered as a
 * different number of lines.
 *
 * Two axes are deliberately coarser than "exact value" rather than dropped:
 *
 * - Time signature is bucketed by how much content a bar actually holds —
 *   `narrow` for four quarter notes' worth or fewer (2/4, 3/4, 4/4, 2/2,
 *   3/8, 5/8, 6/8, 7/8), `wide` for more (9/8, 5/4, 12/8, 7/4). This keys off
 *   real beat content rather than a hand-picked "simple time signature"
 *   family: 2/2 and 3/8 hold no more than a 4/4 bar despite not being in the
 *   classic 2/4-3/4-4/4 family. Dropping metre entirely was tried — a 2/4
 *   test and a 12/8 test of the same bar count genuinely do not fit the same
 *   number of bars on a line, so they would keep re-searching instead of
 *   settling.
 * - Viewport width is bucketed (`layoutWidthClass`), since how many bars fit
 *   a line is a question about the screen. Coarse tiers rather than exact
 *   pixels, so two phones (393 vs 430) share one answer instead of each
 *   model getting its own.
 */
const layoutCache = (() => {
  try {
    return JSON.parse(readKey(LAYOUT_STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
})();

function saveLayoutCache() {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layoutCache));
  } catch {
    /* storage full or unavailable — the layout still works, just isn't remembered */
  }
}

/** How many quarter notes' worth of content one bar holds — 2/4 is 2, 4/4 is
 * 4, 12/8 (four dotted-quarter beats) is 6. `narrow` at four or under
 * covers 2/4, 3/4, 4/4, 2/2, 3/8, 5/8, 6/8 and 7/8; `wide` covers 9/8, 5/4,
 * 12/8 and 7/4. */
function timeSignatureClass({ beats, beatType }) {
  const quarterNotesPerBar = (beats * 4) / beatType;
  return quarterNotesPerBar <= 4 ? 'narrow' : 'wide';
}

/** Coarse viewport-width tiers, so portrait phone / landscape-or-tablet /
 * desktop each get their own canonical layout instead of sharing one. */
function layoutWidthClass() {
  const width = window.innerWidth || document.documentElement.clientWidth;
  if (width < 500) return 'phone';
  if (width < 900) return 'compact';
  if (width < 1280) return 'medium';
  return 'wide';
}

/**
 * The one staff size this viewport uses, for every test at every grade. Fixed
 * rather than searched — see `STAFF_ZOOM`.
 */
function staffZoom() {
  return STAFF_ZOOM[layoutWidthClass()] ?? BASE_ZOOM;
}

/*
 * Only the line breaking is cached now: the zoom that used to be the other
 * half of this entry is fixed per viewport, so there is nothing left to
 * ratchet. The metre bucket and width tier stay in the key because both still
 * change how many bars fit on a line.
 */
function layoutShapeKey(score) {
  // 顯示音名的譜比較高(每個譜表下面多一排字),排法與大小分開記;手機每行 2 小節(twoPerLine)也分開記
  return `${score.grade}:${score.barCount}:${timeSignatureClass(score.timeSignature)}:${layoutWidthClass()}${namesShown() ? ':n' : ''}${twoPerLine() ? ':2' : ''}`;
}
/* 視奏分頁(自由練習)手機寬度(< 500):難度 1–2 每行 2 小節(字大、初學者看得清楚;檢定頁照考卷排法) */
const twoPerLine = () => mode !== 'exam' && !!current && !!current.free && !readOn() && SS.stage[hand] <= 2 && innerWidth < 500 && current.score.barCount >= 2;

let rules = null;
let osmd = null;
let stage = null;
let current = null;
let countdownTimer = null;
let followFrame = null;
let resizeTimer = null;
const BASE_ZOOM = 1;
/*
 * The staff is a property of the *page*, not of the test printed on it.
 *
 * `fitScore` used to search for a zoom per test and cache it per shape, so
 * the five lines of the stave — and the clefs sitting on them — landed
 * somewhere different depending on what had been generated: measured across
 * 40 renders on one desktop viewport, the gap between staff lines ran from
 * 5.13px to 10.00px (12 distinct sizes, a full 2x), the treble stave's own y
 * moved over a 78px range and the bass stave's over 151px. A reader meets one
 * sheet of paper and then another that is half the size, which reads as the
 * page wobbling rather than as a deliberate fit.
 *
 * So the staff size is now fixed per viewport tier and never searched. Line
 * breaking is the only free variable left — bars-per-line still adapts to the
 * content, which is what the barlines are allowed to do. The cost is that a
 * long, dense test no longer shrinks itself to fit the window; it keeps full
 * size and the page scrolls, the same trade the phone tiers already made.
 */
/* 譜表大小不再固定(使用者要求 2026-10:要像一般樂譜的譜面,不要一小節一行):
   先決定每行幾小節,再縮放到放得下。MAX_ZOOM = 印刷樂譜的大小(OSMD 1.0 ≈ 譜線間距 10px ≈ 1.75mm);
   MIN_ZOOM = 口袋總譜的大小,再小就看不清楚 → 改成每行少一小節或捲動 */
const MAX_ZOOM = 1.0;
const MIN_ZOOM = 0.55;
const MIN_ZOOM_DENSE = 0.45;   // 只給「每行 2 小節」的最後手段用
const STAFF_ZOOM = { phone: 0.9, compact: 0.95, medium: 1.0, wide: 1.0 };
/*
 * `medium` and `wide` share a value on purpose: `body` is capped at 64rem, so
 * the score column is 1024px wide on a 1280px screen and on a 2560px one
 * alike, and the staff has exactly the same room in both. The values are
 * calibrated against that width rather than guessed — each is the largest
 * that still lets `scripts/devices.js` place at least two bars on every line
 * (no stranded single bars) and, outside a landscape phone, keep the whole
 * test on screen. Raising the phone tier to 0.5 was tried and reverted: a
 * 430px-wide screen could not fit two bars of a dense test at that size, so
 * the line breaking fell back to OSMD's greedy wrap and stranded bars alone
 * on their own lines.
 */
/*
 * Fixed vertical spacing, in OSMD units (one unit is one staff-line gap), set
 * where they comfortably clear the tallest thing ordinary writing at these
 * grades puts between the staves — dynamics and a hairpin under the treble,
 * ledger lines reaching down toward the bass. See the OSMD construction for
 * why these are set at all.
 */
const STAFF_GAP_UNITS = 7;
const SYSTEM_GAP_UNITS = 9;
const PAGE_TOP_UNITS = 7;
/** Clear space kept between the tempo/character word and the music, in staff units. */
const TEMPO_TERM_GAP_UNITS = 0.8;
/** Clearance between what hangs off one stave and what rises toward the next. */
const MIN_CLEARANCE_UNITS = 2;
/*
 * Where the treble clef sits, measured from the top of the engraving in staff
 * units (one unit is one line gap, so this scales with the staff size rather
 * than being a pixel guess). OSMD reserves 10.0 to 13.1 units above the clef,
 * but what is actually *drawn* there — the tempo word once lifted, a high
 * ledger line, a slur, a beam — reaches at most 7.7 units above it (96 tests,
 * every grade, phone and 1080p). The old target of 15 sat above OSMD's
 * reservation so the score was only ever pushed down, and left 5+ units of
 * nothing between the meta line and the music. `pinScoreTop` now also pulls
 * the engraving *up* into OSMD's own empty margin when the target is below
 * it; 10 keeps a 2-unit clearance over the tallest ink measured, so nothing
 * drawn can come near the frame's top.
 */
const SCORE_TOP_UNITS = 10;
/** 最高的墨跡(速度術語、加線、圓滑線)上面再留的空白(單位;見 pinScoreTop) */
const TOP_CLEAR_UNITS = 1.2;
const topUnitsMemo = new Map();
/** Breathing room under the last system, so it never sits on the screen edge. */
const SCORE_BOTTOM_GAP = 16;
/*
 * Past this, a line of a short/simple test starts reading as cramped. Five
 * rather than four so that a ten-bar test — a common length from Grade 5 up,
 * and one with no even divisor at four or below — can split 5+5 instead of
 * 4+4+2. On a narrow screen the zoom floor rejects it and the search falls
 * through to a smaller count, so this only takes effect where there is width
 * for it.
 */
const MAX_MEASURES_PER_LINE = 5;

/*
 * Below this, the grade selector, meta line and countdown stay pinned to
 * the score's own top corners (see `pinTopRowLayout`) — there isn't room
 * to spare for a combined row without crowding the meta text. Two ways to
 * qualify for the combined row instead:
 *   - wide enough outright (desktop, iPad landscape) — `min-width: 1024px`.
 *   - a phone rotated to landscape: plenty of *width* (852px on an iPhone
 *     Pro) but very little *height* (393px), so the pinned-corner layout's
 *     separate rows for the grade selector and meta line cost exactly the
 *     vertical space landscape has least of. `max-height: 500px` catches
 *     this without also catching a portrait phone/tablet, which has height
 *     to spare; `min-width: 680px` keeps it off phones too narrow to lay
 *     the row out on even sideways (matches the breakpoint where the
 *     transport buttons' own labels reappear).
 */

/** Keyed by `score.confidence` — matches the i18n dictionary's own key names
 * one-to-one, so a lookup here is just `t(CONFIDENCE_LABEL_KEY[confidence])`. */
const CONFIDENCE_LABEL_KEY = {
  verified: null,
  partial: 'confidencePartial',
  inferred: 'confidenceInferred',
};

/**
 * The last status/error shown in `#message`, kept as an i18n key (+ params)
 * rather than only as rendered text — so a language switch mid-message (say,
 * while "Rendering…" is on screen) can re-render it in the new language
 * instead of leaving stale text from the old one. See `refreshDynamicText`.
 */
let lastMessage = null;

/** Ordinary status text, clearing any error styling left behind. */
function say(key, params) {
  lastMessage = { kind: 'say', key, params };
  elements.message.className = 'message';
  // 中英文行數不一樣:保留比較高的高度,換語言時下面的樂譜不會跳
  pairText(elements.message, () => t(key, params));
}

/** 程式組出來的狀態句(模擬考):換語言時重算 */
function sayFn(fn) {
  lastMessage = { kind: 'fn', fn };
  elements.message.className = 'message';
  pairText(elements.message, fn);
}

/** Surface failures on the page — a blank screen tells the user nothing. */
function fail(key, detail) {
  lastMessage = { kind: 'fail', key, detail };
  elements.message.className = 'message error';
  unpair(elements.message);
  elements.message.textContent = detail ? t('errorDetail', { text: t(key), detail }) : t(key);
  elements.generate.disabled = true;
}



/**
 * Move the tempo/character-word text to a fixed spot right after bar 1's
 * clef/key/time signature — OSMD itself centres it on whatever event starts
 * the bar, which for a whole-bar rest sits well into the measure (VexFlow
 * centres a measure rest) while an ordinary first note sits right at the
 * start, so the same term rendered at a different position from test to
 * test depending on which hand opens. The margin is taken from the gap
 * OSMD already placed before the time signature (from the key signature if
 * the key has one, otherwise the clef) rather than a fixed pixel value, so
 * it scales with whatever zoom the piece is rendered at.
 */
/**
 * Land the treble clef on the same pixel row for every test.
 *
 * Fixing the zoom holds the *spacing* of the five lines, but not where they
 * sit: OSMD reserves room above the first stave for whatever sticks up out of
 * it — the tempo word, a high ledger line, a slur — and adds that to its page
 * margin rather than taking the larger of the two, so no margin setting can
 * hold it still (measured: the treble stave's own y took 18 different values
 * across 32 renders, a 28px range, and regenerating visibly jogged the whole
 * page up and down).
 *
 * So the score is padded down to a fixed target instead. `SCORE_TOP_UNITS`
 * sits above the most headroom OSMD ever asks for, which makes every
 * correction a downward one — the score is only ever pushed further into
 * blank space, never pulled up into content. When a test somehow needs more
 * than the target, the padding simply goes to zero and that test keeps
 * OSMD's own spacing, which is the behaviour this replaced.
 *
 * The clef is the anchor rather than the staff lines because it is both what
 * the eye actually fixes on and a single cheap query — its own height is a
 * fixed multiple of the staff size, so pinning its top pins the stave with it.
 */
function pinScoreTop() {
  const svg = elements.score.querySelector('svg');
  if (!svg) return;
  elements.score.style.paddingTop = '0px';
  elements.score.style.marginTop = '0px';
  const clef = svg.querySelector('g.vf-clef');
  if (!clef) return;
  const clefTop = clef.getBoundingClientRect().top;
  const natural = clefTop - svg.getBoundingClientRect().top;
  // One OSMD unit is ten pixels before zoom, so the target tracks staff size.
  /*
   * 譜面上方不留一大片空白(使用者 2026-10:Moderato 上面空太多):固定的 10 單位是「所有級數最高的墨跡」的位置,
   * 大部分的題目只用到一半。改成「這一種題目(視奏分頁 = 子項目 + 範圍階段;檢定頁 = 級數)到目前為止最高的墨跡 + 1 單位」,
   * 只增不減(同一種題目換題時譜表不會上下跳;偶爾遇到更高的題目往下移一次就固定)。最多還是 SCORE_TOP_UNITS。
   */
  let inkTop = clefTop;
  for (const el of svg.querySelectorAll('path, rect, text')) {
    const b = el.getBoundingClientRect();
    if (b.width || b.height) inkTop = Math.min(inkTop, b.top);
  }
  const needUnits = Math.min(SCORE_TOP_UNITS, (clefTop - inkTop) / (10 * osmd.zoom) + TOP_CLEAR_UNITS);
  const key = `${mode === 'exam' ? `x${exam.system}${exam.grade}` : `${hand}${SS.stage[hand]}`}:${namesShown() ? 'n' : ''}`;
  const units = Math.max(needUnits, topUnitsMemo.get(key) || 0);
  topUnitsMemo.set(key, units);
  const target = units * 10 * osmd.zoom;
  const shift = target - natural;
  // Down: pad. Up: pull into OSMD's own blank top margin (see SCORE_TOP_UNITS).
  elements.score.style.paddingTop = `${Math.max(shift, 0)}px`;
  elements.score.style.marginTop = `${Math.min(shift, 0)}px`;
}

/**
 * Drop the second copy of a word OSMD draws twice.
 *
 * A `<words>` direction OSMD does not recognise as a known instruction gets
 * rendered twice, at byte-identical coordinates — confirmed on the vendored
 * build with a minimal one-note, one-direction document: "rall." and "dolce"
 * each come out twice, while "rit." and "a tempo" (which it does recognise)
 * come out once. Our MusicXML contains the direction exactly once, so this is
 * the renderer, not the serialiser, and no encoding avoids it: placement
 * above/below, with and without `<staff>`, with and without `<voice>`, plain
 * and italic all double.
 *
 * Two identical strings at the same pixel cannot be anything but a duplicate —
 * a real second marking would have to sit somewhere else to be readable — so
 * removing the later one is safe. It also makes the text stop looking
 * artificially bold, which is what drawing it twice actually looks like.
 *
 * Runs before `pinTempoTermPosition`, or that would move one copy and leave
 * the other behind.
 */
function removeDuplicateText() {
  const svg = elements.score.querySelector('svg');
  if (!svg) return;
  const seen = new Set();
  for (const text of svg.querySelectorAll('text')) {
    const box = text.getBoundingClientRect();
    const key = `${text.textContent}@${Math.round(box.x)},${Math.round(box.y)}`;
    if (seen.has(key)) text.remove();
    else seen.add(key);
  }
}

/**
 * Hold the staves in the same place on every render.
 *
 * OSMD spaces the two staves of a grand staff — and the systems below them —
 * by taking the *larger* of a fixed distance and a skyline measured from
 * whatever content sticks out: ledger lines, slurs, hairpins, dynamics. With
 * only the zoom fixed the staff lines kept their spacing but the staves
 * themselves still shuffled: measured over 40 renders, the treble stave's y
 * moved across a 37px range, the bass stave's across 71px, and the gap
 * between them took 18 different values. Set the fixed terms high enough to
 * win against the skyline in ordinary writing at these grades and the fixed
 * term is the one that decides, so every test puts its clefs on the same
 * pixels and only the notes change.
 *
 * This runs before *every* render rather than once at construction because
 * OSMD's `drawingParameters` preset reassigns these same rules
 * (`StaffDistance`, `BetweenStaffDistance`, `MinSkyBottomDist*`) behind us —
 * setting them once looked like it worked and silently did nothing.
 * `StaffDistance` is the one that actually governs the gap inside a grand
 * staff (`addStaffLineToMusicSystem` reads it); `BetweenStaffDistance` is set
 * alongside it for the same value rather than left at whatever the preset
 * chose.
 */
function applyFixedSpacing() {
  const rules = osmd.EngravingRules;
  // 顯示音名(視奏分頁):每個譜表下面多一排字,譜表之間、行與行之間都多留那一排的高度(`drawNoteNames`)
  const names = namesRowUnits();
  rules.StaffDistance = STAFF_GAP_UNITS + names;
  rules.BetweenStaffDistance = STAFF_GAP_UNITS + names;
  rules.MinimumDistanceBetweenSystems = SYSTEM_GAP_UNITS + names;
  /*
   * These two are the clearance that keeps what hangs below one stave off
   * what rises toward the next — slurs, hairpins, dynamics, ledger lines.
   * They were briefly set to 0 while chasing a constant staff position, which
   * removed exactly that protection and let slurs pile onto each other and
   * onto the notes. The staff distance above is what holds the layout still;
   * these are what stop it colliding, and they are not the same job.
   */
  // 音名排不下(譜表之間的東西太多)才連「最少空隙」一起加大;平常只加固定距離,不然 OSMD 會把力度記號擺在加大後的正中間,空出一大片
  rules.MinSkyBottomDistBetweenStaves = MIN_CLEARANCE_UNITS + (namesSky ? names : 0);
  rules.MinSkyBottomDistBetweenSystems = MIN_CLEARANCE_UNITS + (namesSky ? names : 0);
  /*
   * Let a slur bend around what is already engraved rather than being placed
   * from the notes alone. Off by default in OSMD, and with two hands each
   * carrying their own slurs into the same gap between the staves, the
   * default put one straight through the other.
   */
  rules.SlurPlacementUseSkyBottomLine = true;
  /*
   * Anchor slurs at the stems and flatten them slightly. Both keep a slur
   * close to the notes it belongs to instead of arcing out into the bands
   * where the hairpins and the pedal line live, which is where slurs were
   * running through other markings. Measured over 80 rendered tests: 11.6% of
   * tests had a slur crossing a marking with OSMD's defaults, 4.7% with the
   * stem anchoring, 3.8% with both. Attaching a slur at the stem is ordinary
   * engraving practice, not a compromise.
   *
   * Forcing the placement *side* per hand was tried too — right hand above,
   * left hand below, as piano writing normally does — and made it markedly
   * worse (22.5%), because it drove the left hand's slurs down onto the pedal
   * line, which OSMD gives no way to move. Its own stem-based choice is
   * better informed than a blanket rule, so it keeps that decision.
   */
  rules.SlurPlacementAtStems = true;
  rules.SlurHeightFactor = 0.8;
  rules.PageTopMargin = PAGE_TOP_UNITS;
}

function pinTempoTermPosition() {
  const svg = elements.score.querySelector('svg');
  if (!svg) return;
  const measures = [...svg.querySelectorAll('g.vf-measure[id="1"]')];
  if (!measures.length) return;
  // Staff 1 (treble) is the topmost of bar 1's two measure groups.
  const staff1Measure = measures.reduce(
    (top, candidate) => (candidate.getBBox().y < top.getBBox().y ? candidate : top),
  );
  const clef = staff1Measure.querySelector('.vf-clef');
  const time = staff1Measure.querySelector('.vf-timesignature');
  if (!clef || !time) return;
  const keySignature = staff1Measure.querySelector('.vf-keysignature');
  const timeBox = time.getBBox();
  const clefBox = clef.getBBox();
  const priorRight = keySignature
    ? keySignature.getBBox().x + keySignature.getBBox().width
    : clefBox.x + clefBox.width;
  const margin = timeBox.x - priorRight;
  if (margin <= 0) return;

  // The tempo term is the only bold, non-italic text OSMD draws — dynamics
  // (f, mf, ...) are bold italic, ordinary directions (rit., a tempo) are
  // italic but not bold.
  const term = svg.querySelector('text[font-weight="bold"][font-style="normal"]');
  if (!term) return;
  term.setAttribute('x', timeBox.x + timeBox.width + margin);
  /*
   * Lift it clear of the music as well as pinning its horizontal spot. OSMD
   * places the term just above whatever sits directly beneath it, which is
   * the same band a slur arcing over bar 1 reaches — measured with the term
   * crossed by a slur in a few percent of tests, and a fixed lift only trades
   * one guess for another, since how high a slur reaches depends on how high
   * the notes go.
   *
   * So it is raised above whatever is actually engraved in the first system
   * rather than by a set amount, and only ever *upward* — the reserved blank
   * space above the first stave (`pinScoreTop`) is where it goes, so there is
   * always somewhere to move to, and a test with nothing reaching up keeps
   * the term exactly where OSMD put it.
   */
  const termBox = term.getBBox();
  let highest = Infinity;
  /*
   * Every drawn shape, not a list of the ones worth worrying about. Naming
   * the obvious candidates — noteheads, ledger lines, slurs — missed beams,
   * which sit at the far end of upward stems and so reach higher than any of
   * them; a term cleared of the notes still landed on the beam above them.
   * Anything with ink can be in the way, so the cheapest correct rule is to
   * consider all of it and let the horizontal test do the filtering.
   */
  for (const el of svg.querySelectorAll('path, rect')) {
    if (el === term) continue;
    const box = el.getBBox();
    // Only what actually sits under the term horizontally can collide with it.
    if (box.x + box.width < termBox.x || box.x > termBox.x + termBox.width) continue;
    highest = Math.min(highest, box.y);
  }
  if (Number.isFinite(highest)) {
    const lift = termBox.y + termBox.height - (highest - TEMPO_TERM_GAP_UNITS * 10);
    if (lift > 0) term.setAttribute('y', Number(term.getAttribute('y')) - lift);
  }
}

/* ── 啟動(外框呼叫)── */
export async function start(c) {
  ctx = c;
  exam = { ...c.exam };
  elements.generate.disabled = true;
  applySightStatic();

  if (typeof opensheetmusicdisplay === 'undefined') {
    fail('loadingOSMD');
    return;
  }

  try {
    let ver = {}; try { ver = JSON.parse(document.getElementById('pdVersions').textContent); } catch { /* 沒有版本指紋就直接讀 */ }
    const f = 'data/sight-rules.json';
    const response = await fetch(f + (ver[f] ? '?v=' + ver[f] : ''));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    rules = await response.json();
  } catch (error) {
    fail('failLoadRules', error.message);
    return;
  }
  populateKeyOptions();

  try {
    osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(elements.score, {
      // OSMD's own resize listener re-renders on its own schedule and, on a
      // rotation that lands during a new test's load, leaves the previous
      // test's SVG on screen (16 bars in the sheet, 17 drawn). `init` already
      // refits on width changes through `fitScore`, so only that one renders.
      autoResize: false,
      drawTitle: false,
      drawPartNames: false,
      drawingParameters: 'default',
      // OSMD's default numbers a bar at the start of every system *and*
      // periodically on a fixed interval regardless of line breaks — with
      // `fitScore` forcing a uniform bars-per-line count, that interval
      // routinely lands on a bar mid-line too (e.g. bar 3 of a 3-per-line
      // test), printing a number nothing but the first bar of each line
      // should carry. Real engraving (and this app's own convention
      // everywhere else) numbers a line by its first bar only.
      drawMeasureNumbersOnlyAtSystemStart: true,
      // OSMD's default leaves the last system of a piece at its own natural
      // width rather than justifying it to the frame like every other line —
      // normal typesetting convention, but with `fitScore` forcing a uniform
      // bars-per-line count so that same-shaped tests share a layout (see
      // `layoutCache`), it means two lines with the *same* bar count can
      // still end at different points, which reads as misaligned rather than
      // deliberate. Stretching the last line to match keeps every line's
      // right edge where the reader expects it.
      stretchLastSystemLine: true,
    });
    osmd.EngravingRules.FixedMeasureWidth = true;
    // OSMD centres the tempo/character-word direction on whatever event
    // starts bar 1 — fine for an ordinary first note, but a bar that opens
    // with a whole-bar rest (Grade 1's alternating hands) gets it hovering
    // over that rest's own centred position instead of the start of the
    // piece, so the same term reads in a different spot test to test.
    // Wrapping `render` itself (rather than patching every call site) means
    // every one of `fitScore`'s repeated renders gets the correction too.
    const rawRender = osmd.render.bind(osmd);
    osmd.render = (...args) => {
      // 顯示音名:字排不下(音太密要交錯、和弦、或留的空間不夠)就多留空間再排(最多再排兩次;同一題之後都沿用)
      const memoKey = `${osmd.EngravingRules.RenderXMeasuresPerLineAkaSystem}:${osmd.zoom}`;
      ({ lines: namesLines, sky: namesSky } = namesMemo.get(memoKey) || { lines: 1, sky: false });
      for (let pass = 0; pass < 3; pass++) {
        applyFixedSpacing();
        rawRender(...args);
        removeDuplicateText();
        pinTempoTermPosition();
        pinScoreTop();
        const r = drawNoteNames();
        if (!r || (!r.crowded && r.need <= namesLines) || (namesSky && namesLines >= 4)) break;
        if (r.crowded && namesSky) namesLines = Math.min(4, namesLines + 1);
        if (r.crowded) namesSky = true;
        namesLines = Math.min(4, Math.max(r.need, namesLines));
        namesMemo.set(memoKey, { lines: namesLines, sky: namesSky });
      }
    };
  } catch (error) {
    fail('failInitRenderer', error.message);
    return;
  }
  window.__osmd = osmd; // debugging hook, also used by scripts/smoke.js
  window.__read = reading; // 測試用(tools/test/tasks.mjs):認音

  stage = createStage({
    score: elements.score,
    playline: elements.playline,
    highlight: elements.highlight,
    osmd: () => osmd,
  });
  window.__stage = stage; // debugging hook, also used by scripts/devices.js
  window.__playback = player; // debugging hook, also used by scripts/loudness.js
  // debugging hook for scripts/mic-check.js: what the current test expects from a player
  window.__scoring = () => (current ? { onsets: expectedOnsets(current.score), secondsPerBar: barTimings(current.score).secondsPerBar } : null);

  elements.generate.disabled = false;
  elements.generate.addEventListener('click', () => {
    if (mk.state === 'run') return;   // 模擬考中不能換題
    if (mk.state !== 'idle') { mk.state = 'idle'; paintMock(); }   // 結果 / 中止的說明 →「下一題」回到一般練習
    if (xIdle) setExamItem(false);
    newTest();
  });
  // 自我檢查(檢定頁彈完一遍出現;勾選、不算分數)
  $('selfCheck').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (!b || !xCheck) return;
    const i = Number(b.dataset.i);
    xCheck[i] = !xCheck[i];
    paintSelfCheck();
  });
  // 測試掛鉤(tools/test、截圖):提早彈完、看自我檢查
  window.__sight = {
    finishPlay: () => { if (alongStart !== null) alongStart = performance.now() / 1000 - 3600; },   // 彈一遍提早彈完
    selfCheck: () => (xCheck ? [...xCheck] : null),
    score: () => (current ? current.score : null),   // 麥克風測試(tools/sight/mic-check.js)照這一題算彈奏
    skipPrep: () => { prepSkip = true; },   // 看譜倒數馬上到
    mic: () => lastRhythmResult && { ...lastRhythmResult, score: undefined, errs: undefined },
  };
  elements.prepare.addEventListener('click', startCountdown);
  elements.play.addEventListener('click', togglePlayback);
  elements.playAlong.addEventListener('click', togglePlayAlong);
  $('playAlongTop').addEventListener('click', () => {
    if (freeAlong()) { togglePlayAlong(); return; }
    if (mk.state === 'result') { mk.state = 'idle'; paintMock(); }   // 模擬考結果 → 再彈一遍 = 回到一般練習(同一題)
    if (xPrep === 'before') startCountdown();
    else if (xPrep === 'done') togglePlayAlong();
  });
  // 麥克風自動打分:預設開(存過「關」才關);第一次按「彈一遍」時才問權限
  elements.alongMic.checked = MIC_UI;
  try { if (readKey('pianodrill.sight.mic') === '0') elements.alongMic.checked = false; } catch { /* 沒有儲存空間就照預設 */ }
  elements.alongMic.closest('label').hidden = !MIC_UI;
  $('alongMicNote').hidden = !MIC_UI;   // 說明一行一直在開關下面
  elements.alongMic.addEventListener('change', () => {
    try { localStorage.setItem('pianodrill.sight.mic', elements.alongMic.checked ? '1' : '0'); } catch { /* 不影響使用 */ }
  });
  setAlongLabel();
  elements.key.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b || b.dataset.v === keyValue) return;
    keyValue = b.dataset.v;
    for (const x of elements.key.querySelectorAll('button')) x.setAttribute('aria-pressed', String(x.dataset.v === keyValue));
    renderSummary();
    if (current) newTest();
  });

  // 樂譜每行幾小節要看寬度:轉向、改視窗寬度就重排(只看寬度:iOS 捲動時網址列收放只改高度,重排會跳回頂端)
  let lastWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    if (!current || !active) return;
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    clearTimeout(resizeTimer);
    // 走同一個排隊機制:跟新題的渲染不會同時操作 OSMD
    resizeTimer = setTimeout(() => { renderCurrent(); }, 200);
  });

  updateHistoryInfo();
  renderSummary();
}

/* ── 外框:顯示 / 離開 / 考試 / 語言 / 快捷鍵 ── */
let renderedWidth = 0;
export function enter(tab) {
  active = true;
  if (mk.state === 'run' && tab !== 'exam') abortMock('leave');   // 從檢定頁切到視奏分頁(同一個模組,外框不會呼叫 leave)
  const was = mode, wasKey = was === 'exam' ? `exam-${exam.grade}` : freeKey();
  mode = tab === 'exam' ? 'exam' : 'free';
  // 視奏分頁:外框的子項目 = 認音 / 右手 / 左手 / 雙手;從右手 / 左手 / 雙手切到認音:認音的範圍預設 = 那一階
  if (mode === 'free' && (HANDS.includes(tab) || tab === 'read')) {
    if (tab === 'read' && lastHandTab && was === 'free') reading.fromStage(lastHandTab, SS.stage[lastHandTab]);
    hand = tab;
    lastHandTab = HANDS.includes(tab) ? tab : null;
  }
  syncMode(was !== mode || wasKey !== (mode === 'exam' ? `exam-${exam.grade}` : freeKey()));
  // 在別的分頁時寬度變了(或從沒畫過):回來時重排
  if (current && window.innerWidth !== renderedWidth) renderCurrent();
}
export function leave() {
  active = false;
  abortMock('leave');   // 切分頁、切到背景:模擬考中止(回來時說明)
  reading.leave();
  stopAll();
}
export function setExam(ex) {
  const changed = ex.system !== exam.system || ex.grade !== exam.grade;
  if (changed && !abortMock('exam') && mk.state !== 'idle') mk.state = 'idle';   // 換了考試:舊的結果 / 中止說明不再顯示
  else if (!changed && mk.state === 'run') return;   // 外框重送同一個考試:進行中的模擬考不動
  exam = { ...ex };
  if (rules && mode === 'exam' && changed) syncMode(true);
}
export function relang() {
  applySightStatic();
  renderStage();
  reading.relang();
  refreshDynamicText();
  renderSummary();
  if (mode === 'exam') renderUnsupported();
  if (xIdle && mode === 'exam') showExamItem();   // 空狀態的一句
  paintItemRow();
}
export function examStatus() {
  if (!examSupported()) return t('examNotYetShort');
  const { today, streak } = practiceStats();
  return today ? t('practiceStats', { today, streak }) : t('examReady');
}
export function onKey(e) {
  if (readOn()) { if (reading.onKey(e)) e.preventDefault(); return; }
  if (e.code === 'Space') {
    e.preventDefault();
    // 視奏分頁還沒彈過(▶ 還沒出現)或正在彈:空白鍵 = 彈一遍 / 停止
    if (freeAlong() && current && (!played || alongStart !== null)) togglePlayAlong();
    else if (!elements.play.disabled) elements.play.click();
  }
  else if ((e.key === 'n' || e.key === 'N') && !elements.generate.disabled && mk.state !== 'run') elements.generate.click();
}
function stopAll() {
  clearInterval(mk.timer); mk.timer = null;
  prepToken += 1;
  stopCountdown();
  player.stop();
  if (alongStart !== null) stopPlayAlong();
  stopFollowing();
  setPlayState(false);
}
/* 自由練習 ↔ 檢定:級數改用考試的;這個考試/級數沒有規則時整個收起來,只留說明 */
function syncMode(changed) {
  paintItemRow();
  // 認音:只有認音的兩張卡(題目、設定),視奏的卡片都收起來
  const rd = readOn();
  $('rdCard').hidden = $('rdOpts').hidden = !rd;
  if (rd) {
    stopAll();
    for (const id of ['setup', 'quiz', 'scoreCard', 'unsupported']) $(id).hidden = true;
    elements.along.hidden = true;
    reading.enter();
    return;
  }
  reading.leave();
  // 視奏分頁:設定卡一直展開(範圍階段是常用設定),調性由 App 依階段套用(不放下拉選單);檢定頁照舊(收成一行、有調性選單)
  $('setup').classList.toggle('always-open', mode !== 'exam');
  // 視奏分頁的主要動作是題目卡上的「彈一遍」,新題目改成次要按鈕
  elements.generate.classList.toggle('primary', mode === 'exam');
  elements.generate.classList.toggle('ghost', mode !== 'exam');
  setAlongLabel();
  elements.key.closest('.prow').hidden = mode !== 'exam';
  const supported = mode !== 'exam' || examSupported();
  $('unsupported').hidden = supported;
  for (const id of ['setup', 'quiz', 'scoreCard']) $(id).hidden = !supported;
  if (!supported) { stopAll(); elements.along.hidden = true; renderUnsupported(); return; }
  if (rules) populateKeyOptions();
  renderStage();
  renderSummary();
  // 換了級數 / 子項目 / 範圍階段(或第一次進來):重新出一題;檢定頁先是本項卡(按「練習一題」才出題,畫面設計 2026-10 版型 B)
  const stale = !current || (mode === 'exam' ? current.free || current.score.grade !== currentGrade() : !current.free || current.key !== freeKey());
  if (mode === 'exam' && rules && (changed || stale || xIdle)) { showExamItem(); return; }
  setExamItem(false);
  paintMock();
  if (rules && (changed || stale)) newTest();
}
/* 本項列(檢定頁最上面一行;畫面設計 2026-10 版型 B):視奏 [已練 n 題] … 模擬考(這一級還沒有題目時不寫標籤、沒有模擬考) */
function paintItemRow() {
  $('itemRow').hidden = mode !== 'exam' || readOn();
  if (mode !== 'exam') paintSelfCheck();   // 自我檢查只在檢定頁
  if (mode !== 'exam') return;
  $('irName').textContent = '';   // 子項目列已經寫「視奏」,同一個畫面不重複
  const n = SS.xn[`${exam.system}-${exam.grade}`] || 0;
  $('irTag').textContent = examSupported() ? tr(`已練 ${n} 題`, `${n} practised`) : '';
  paintMock();
}
/* 檢定頁的題目卡空狀態:一句流程 + 右下「練習一題」(= 出題);項目名與進度在本項列 */
let xIdle = false;
function showExamItem() {
  stopAll();
  if (mk.state === 'result' || mk.state === 'run') mk.state = 'idle';
  setExamItem(true);
  paintItemRow();
  const sec = rules ? rules.exam.preparationSeconds : 30;
  if (mk.state === 'aborted') {
    // 中止的說明(為什麼、這一次不算);說明畫出來了,重新整理用的標記就拿掉
    const why = abortText(mk.reason);
    pairText($('hint'), why);   // 下一步:本項列的「模擬考」與右下「練習一題」都看得到,不再寫一次
    if (SS.mockRun) { delete SS.mockRun; saveSS(); }
  } else pairText($('hint'), () => tr(`出題 → 看譜 ${sec} 秒 → 彈一遍`, `New piece → ${sec}s to look → Play it`));
  lastMessage = null;
}
function setExamItem(on) {
  xIdle = on;
  if (on && xCheck) { xCheck = null; paintSelfCheck(); }
  $('quiz').classList.toggle('hint-empty', on);
  $('scoreCard').hidden = on;
  syncAlongCard();
  if (on) elements.generate.disabled = !rules;
  elements.generate.querySelector('.btn-label').textContent = on ? tr('練習一題', 'Get a test') : t('generateLabel');
  setAlongLabel();
}
function renderUnsupported() {
  pairText($('unsupportedText'), () => (exam.system === 'trinity' ? t('unsupportedTrinity') : t('examNotYet')));
}
/* ── 視奏分頁的速度(js/shared/tempo.js;跟 DrumDrill 視奏一樣):− / + / 滑桿;改了馬上用在下一次播放與彈一遍,記在 SS.bpm[子項目-難度] ── */
const FREE_MAX_BPM = 80;
const tempo = createTempo({ $, min: 30, max: 200, get: () => (current && current.score ? current.score.tempoBpm : 80), set: (v) => setFreeBpm(v) });
function setFreeBpm(v) {
  if (!current || !current.free || alongStart !== null || elements.play.classList.contains('is-active')) return;   // 播放、彈一遍中不改
  v = Math.max(30, Math.min(200, Math.round(v)));
  current.score.tempoBpm = v;
  if (v === current.score.defBpm) delete SS.bpm[freeKey()]; else SS.bpm[freeKey()] = v;
  saveSS(); renderTempo(); showMeta(current.score);
}
function renderTempo() {
  const box = $('tempoBox'), on = mode === 'free' && hand !== 'read' && !!current && !!current.free && current.key === freeKey();
  box.hidden = !on;
  if (!on) return;
  tempo.sync(tr('拍 / 分鐘', 'BPM'));
  $('bpmDown').setAttribute('aria-label', tr('慢 1(按住連續減少)', 'Slower (hold to repeat)'));
  $('bpmUp').setAttribute('aria-label', tr('快 1(按住連續增加)', 'Faster (hold to repeat)'));
  $('bpmRange').setAttribute('aria-label', tr('速度', 'Tempo'));
  const changed = current.score.tempoBpm !== current.score.defBpm;
  $('bpmReset').hidden = $('bpmReset').parentNode.hidden = !changed;   // 只在自己改過速度時出現
  $('bpmReset').textContent = tr('回到預設', 'Default tempo');
}
$('bpmReset').addEventListener('click', () => { if (current && current.score) setFreeBpm(current.score.defBpm); });
/* ── 視奏分頁的範圍階段(js/sight/stages.js):畫面只寫範圍,不寫級數、考試名稱 ── */
const HAND_NAME = { right: () => tr('右手', 'RH'), left: () => tr('左手', 'LH') };
function rangeText(st = stageNow(), h = hand) {
  const full = st.n === 4;
  if (h === 'both') return full ? tr('雙手 全範圍', 'Hands together · full range') : `${HAND_NAME.right()} ${rangeLabel(st.rh)} · ${HAND_NAME.left()} ${rangeLabel(st.lh)}`;
  return `${HAND_NAME[h]()} ${full ? tr('全範圍', 'full range') + ' ' : ''}${rangeLabel(h === 'right' ? st.rh : st.lh)}`;
}
function renderStage() {
  renderTempo();
  const box = $('stageBox');
  box.hidden = mode === 'exam';
  if (box.hidden) return;
  const seg = $('stageSeg'), cur = SS.stage[hand];
  const focused = document.activeElement && seg.contains(document.activeElement) ? document.activeElement.dataset.v : null;
  seg.setAttribute('aria-label', tr('難度', 'Level'));
  seg.classList.toggle('both', hand === 'both');
  seg.innerHTML = STAGES.map((st) => {
    // 每顆按鈕只寫一行:難度數字 + 範圍(「1 · C4–G4」;第 4 個「4 · 全範圍」);雙手兩手的範圍放不下 → 只寫數字(範圍寫在下面的說明)
    const r = hand === 'both' ? `${rangeLabel(st.rh)} / ${rangeLabel(st.lh)}` : rangeLabel(hand === 'right' ? st.rh : st.lh);
    const head = hand === 'both' ? String(st.n) : `${st.n} · ${st.n === 4 ? tr('全範圍', 'Full') : r}`;
    return `<button type="button" data-v="${st.n}" aria-pressed="${st.n === cur}" aria-label="${tr(`難度 ${st.n}`, `Level ${st.n}`)}: ${st.n === 4 ? tr('全範圍', 'full range') + ' ' : ''}${r}"><b>${head}</b></button>`;
  }).join('');
  if (focused) seg.querySelector(`[data-v="${focused}"]`)?.focus({ preventScroll: true });
  const names = $('names');
  names.textContent = tr('顯示音名', 'Note names');
  names.setAttribute('aria-pressed', String(!!SS.names[cur]));
  // 單手的範圍寫在按鈕上:這一行不寫(「節奏與調性由 App 依範圍安排」拿掉:畫面設計 2026-10);雙手 1–3 的按鈕只有數字,範圍寫在這一行
  const both = hand === 'both';
  $('stageNote').hidden = !both;
  if (both) pairText($('stageNote'), () => `${tr(`難度 ${stageNow().n}:`, `Level ${stageNow().n}: `)}${rangeText()}`); else unpair($('stageNote'));
}
function setupStage() {
  $('stageSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b || mode === 'exam') return;
    const n = Number(b.dataset.v);
    if (n === SS.stage[hand]) return;
    SS.stage[hand] = n; saveSS();
    renderStage();
    if (rules) { populateKeyOptions(); renderSummary(); newTest(); }
  });
  $('names').addEventListener('click', () => {
    const n = SS.stage[hand];
    SS.names[n] = !SS.names[n]; saveSS();
    renderStage();
    // 開關音名會改譜表之間的距離(多留一排字),要重新排版
    if (current && active) renderCurrent(); else drawNoteNames();
  });
}
setupStage();
/* 顯示音名(視奏分頁;每一階各自開關,階 1 預設開):每個譜表**下面**一排小字寫音名(字母,中英一樣;右手在高音譜表下、左手在低音譜表下,
   單手也一樣),畫在 OSMD 的 SVG 上(每次 render 之後重畫;換語言不用重畫)。檢定頁不畫。
   位置用實際畫出來的 SVG 量:同一行、同一個譜表的字母放在同一條水平線上(對齊各自的音),從譜表最下面那條線往下找
   第一個「每個字母都不碰到任何筆畫」(符桿、符尾、符槓、加線、重音、跳音、連結線 / 圓滑線、力度、漸強漸弱、下一個譜表)的高度。
   開音名時譜表之間、行與行之間多留字的空間(`namesRowUnits`,`applyFixedSpacing` 用);還是排不下就多留再排(`osmd.render` 的包裝)。
   (寫進符頭裡試過:手機上符頭只有約 5px,看不清,不用。)*/
/** 音名最小字級(CSS px;手機縮小譜面時也看得清楚)與相對譜表的大小(譜線間距的倍數) */
const NAME_MIN_PX = 10, NAME_UNITS = 1.3;
const namesShown = () => mode !== 'exam' && !!current && !!current.free && !!SS.names[SS.stage[hand]];
/** 音名字級(SVG 座標;一個譜線間距 = 10) */
const nameFontSvg = (zoom) => Math.max(NAME_MIN_PX / (zoom || 1), NAME_UNITS * 10);
// 這一次排版要留幾排字(音很密交錯、和弦會多一排)、要不要連最少空隙一起加大。
// 照「每行幾小節 + 縮放」分開記(fitScore 試排很擠的排法時算出來的不能帶到最後的排法),換題重來
let namesLines = 1, namesSky = false, namesFor = null, namesMemo = new Map();
/** 開音名時要多留的字的高度(譜線間距;namesLines 排 + 上下留白);關音名 = 0 */
function namesRowUnits() {
  return namesShown() && osmd ? (namesLines * nameFontSvg(osmd.zoom) * 1.2 + 2 * Math.max(3, 3 / (osmd.zoom || 1))) / 10 + 0.3 : 0;
}
function drawNoteNames() {
  const svg = elements.score.querySelector('svg');
  if (!svg) return;
  svg.querySelectorAll('.s-name').forEach((el) => el.remove());
  if (!namesShown() || !osmd || !osmd.GraphicSheet) return;
  return paintNoteNames(svg, osmd, { cls: 's-name', size: nameFontSvg(osmd.zoom) });
}
function renderSummary() {
  const keyText = elements.key.querySelector('button[aria-pressed="true"]')?.textContent ?? t('randomKey');
  // 檢定模式:考試與級數已經寫在上面的考試設定卡(和頂欄標籤),這裡只說調性;視奏分頁只寫範圍(不寫級數)
  elements.sum.textContent = mode === 'exam' ? keyText : rangeText();
}

/**
 * Re-renders every piece of text app.js builds or labels itself — the stuff
 * no static `data-i18n`/`data-i18n-attr` element in index.html can reach,
 * because it's assembled at runtime (select options, the meta strip, the
 * preparation checklist) or depends on state that isn't just "which language"
 * (the last status/error message, the play/stop button's playing state).
 * Called once after every `applyLanguage()` — see the `onLanguageChange`
 * subscription in `init()`. Safe to call before `rules`/`current` exist:
 * each piece guards on the state it actually needs.
 */
function refreshDynamicText() {
  if (lastMessage) {
    if (lastMessage.kind === 'say') say(lastMessage.key, lastMessage.params);
    else if (lastMessage.kind === 'fn') sayFn(lastMessage.fn);
    else fail(lastMessage.key, lastMessage.detail);
  }
  if (rules) populateKeyOptions();
  if (current) showMeta(current.score);
  setPlayState(player.playing);
  setAlongLabel();
  renderRhythmResult();
  updateHistoryInfo();
  paintMock();
  if (!elements.checklist.hidden) {
    elements.checklist.innerHTML = PREPARATION_STEP_KEYS
      .map((key) => `<li>${escapeHtml(t(key))}</li>`)
      .join('');
  }
}

/**
 * Rebuild #key's options for whichever grade is currently selected — each
 * grade allows a different key list (Grade 8's is every key up to six
 * accidentals), so this can't be written once in index.html the way
 * #grade's fixed 1-8 list is. "隨機調性" (empty value) is always first and
 * is what keeps today's fully-random behaviour the default. If the
 * previously chosen key is still valid for the new grade it's kept
 * selected rather than silently reset, so switching, say, Grade 3 to
 * Grade 5 doesn't quietly drop a still-valid "C 大調" pick back to random.
 */
function populateKeyOptions() {
  const gradeRules = mode === 'exam' ? rules.grades[String(currentGrade())] : stageRules().grades[String(stageNow().grades[stageNow().grades.length - 1])];
  const { major, minor } = keyOptionsFor(gradeRules);
  // 調性:一排按鈕(不用下拉選單;檢定頁的設定卡裡),「隨機調性」在第一顆;換級數時還有效的調性保留
  const opts = [['', t('randomKey')], ...major.map(({ tonic }) => [`${tonic}:major`, t('majorKey', { tonic })]), ...minor.map(({ tonic }) => [`${tonic}:minor`, t('minorKey', { tonic })])];
  if (!opts.some(([v]) => v === keyValue)) keyValue = '';
  elements.key.innerHTML = opts.map(([v, label]) => `<button type="button" class="opt" data-v="${v}" aria-pressed="${v === keyValue}">${escapeHtml(label)}</button>`).join('');
}

async function newTest({ randomKey = false } = {}) {
  prepToken += 1;
  xPrep = 'before';
  stopCountdown();
  player.stop();
  alongStart = null;
  played = false;
  setAlongLabel();
  resetAlongResult();
  stopFollowing();
  setPlayState(false);
  syncAlongCard();

  // Start fetching the piano samples now, so the first press of play is
  // immediate — same moment ScrollScore loads them, once there is a score.

  // '' (隨機調性) keeps the fully-random pickKey() behaviour; otherwise
  // every retry generateUnique makes is forced to the same chosen key,
  // same as it's forced to the same grade.
  const [tonic, keyMode] = mode === 'exam' && keyValue && !randomKey ? keyValue.split(':') : [];   // 模擬考:隨機調性(考試不會先告訴你調)   // 視奏分頁:調性由 App 依範圍階段套用
  if (mode === 'exam') {
    const grade = currentGrade();
    const { score } = generateUnique(() => generateTest(rules, { grade, tonic, mode: keyMode }), history);
    current = { score, xml: toMusicXml(score), free: false };
  } else {
    // 視奏分頁:範圍階段裡每題隨機取一級的規則(只換 range;階 1 只出 C 大調)。選了調性就只從有這個調的級裡抽
    const st = stageNow();
    const hasKey = (g) => { const k = keyOptionsFor(rulesForStage(rules, st, g).grades[String(g)]); return (keyMode === 'minor' ? k.minor : k.major).some((x) => x.tonic === tonic); };
    const pool = tonic ? st.grades.filter(hasKey) : st.grades;
    const fixed = st.cOnly ? { tonic: 'C', mode: 'major' } : tonic ? { tonic, mode: keyMode } : {};
    const { score: full } = generateUnique(() => { const g = pickGrade({ grades: pool.length ? pool : st.grades }); return generateTest(rulesForStage(rules, st, g), { grade: g, ...fixed }); }, history);
    const score = hand === 'both' ? full : soloScore(full, hand);
    // 速度:難度 1–2 的「彈一遍」預設最快 ♩=80(練習設定);自己改過的照這個子項目、這個難度記住的
    score.defBpm = st.n <= 2 ? Math.min(score.tempoBpm, FREE_MAX_BPM) : score.tempoBpm;
    score.tempoBpm = SS.bpm[freeKey()] ?? score.defBpm;
    current = { score, xml: toMusicXml(score, { only: hand === 'right' ? 1 : hand === 'left' ? 2 : 0 }), free: true, key: freeKey() };
  }
  const score = current.score;
  setAlongLabel();
  syncAlongCard();
  player.preload(score);

  loudRender = true;
  await renderCurrent();
}

/*
 * 渲染一次只跑一個:連點「產生新題」時,後一次的 osmd.load 會跟前一次交錯,
 * 結果樂譜是一題、資訊列是另一題(實測過:樂譜 17 小節、資訊列寫 16)。
 * 忙碌中收到新題就記下「還要再畫一次」,畫完這張再畫最新的那題。
 */
let rendering = false;
let renderAgain = false;
// 新題才更新訊息;旋轉螢幕等只是重畫,不該蓋掉給音/倒數中的提示
let loudRender = false;
let renderRetried = false;
async function renderCurrent() {
  if (rendering) { renderAgain = true; return; }
  rendering = true;
  try {
    // 渲染中標 aria-busy:輔助工具和自動測試都靠它知道畫面還沒穩定
    elements.score.setAttribute('aria-busy', 'true');
    do {
      renderAgain = false;
      const quiet = !loudRender;
      loudRender = false;
      await drawTest(current, quiet);
    } while (renderAgain);
  } finally {
    rendering = false;
    elements.score.removeAttribute('aria-busy');
  }
}

async function drawTest({ score, xml }, quiet = false) {
  // Held at opacity 0 through the whole render + fitScore search (which
  // calls osmd.render() many times while measuring candidate layouts) and
  // only released once a final layout is settled — see the .entering rule.
  elements.score.classList.add('entering');
  if (score !== namesFor) { namesFor = score; namesMemo = new Map(); }   // 音名要留幾排:每一題重新算

  if (!quiet) say('renderingStatus');
  try {
    try {
      await osmd.load(xml);
      osmd.render();
    } catch (first) {
      // OSMD occasionally throws from inside its own layout (a slur's staff
      // entry missing) on a score that renders fine the next time round.
      // Reload and draw once more before giving up, so a blank score is the
      // last resort rather than the first.
      console.warn('OSMD render failed, retrying once:', first.message);
      await osmd.load(xml);
      osmd.render();
    }
    if (!quiet) say(freeAlong() ? freeReadyKey() : 'readyStatus');
  } catch (error) {
    fail('failRender', error.message);
    elements.score.classList.remove('entering');
    // Still failing: the score itself is the problem, so draw a different one.
    if (!renderRetried) {
      renderRetried = true;
      setTimeout(() => { renderRetried = false; }, 3000);
      newTest();
    }
    return;
  }

  await fitScore();
  renderedWidth = window.innerWidth;
  paintBarMarks();
  // Two frames: the first lets the browser paint the held opacity-0 state
  // (removing `transition: none` alone wouldn't stop the two class changes
  // from collapsing into one paint), the second flips to the visible state
  // so the opacity/transform change is what actually animates.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => elements.score.classList.remove('entering'));
  });
  showMeta(score);
  elements.countdown.hidden = true;   // 剩幾秒寫在主要按鈕上
  elements.play.disabled = false;
  elements.prepare.disabled = false;
  elements.countdownValue.textContent = String(rules.exam.preparationSeconds);
  elements.countdown.className = 'countdown';
  elements.checklist.hidden = true;
  updateHistoryInfo();
}

function showMeta(score) {
  // 跟技巧、聽音的題目卡一樣:大標題 = 調性,標籤 = 拍號、小節數、速度(速度術語本身印在樂譜第一小節上方,不重複)
  const keyTemplate = score.key.mode === 'major' ? 'majorKey' : 'minorKey';
  elements.title.classList.remove('empty');
  elements.title.textContent = t(keyTemplate, { tonic: score.key.tonic });
  elements.meta.innerHTML = [score.timeSignature.text, t('barsSuffix', { count: score.barCount }), `♩=${score.tempoBpm}`]
    .map((value) => `<span class="q-tag">${escapeHtml(value)}</span>`).join('');

  // 視奏分頁:範圍內的規則是 App 的練習設定,不寫「這一級」的推估說明(那是檢定頁的)
  const warningKey = current && current.free ? null : CONFIDENCE_LABEL_KEY[score.confidence];
  elements.confidence.hidden = !warningKey || mockOn();   // 模擬考進行中、結果:考試內容的說明藏起來
  if (warningKey) elements.confidence.textContent = t(warningKey);
  renderTempo();
}

/*
 * The standard preparation order from the knowledge base. Reading it beats
 * staring at bar 1: the tempo should be set by the busiest bar, not the first.
 * The actual text lives in i18n.js (prepStep1..6) — kept as keys here rather
 * than resolved once, so `refreshDynamicText` can re-render this list in
 * place when the language changes while it's on screen.
 */
const PREPARATION_STEP_KEYS = ['prepStep1', 'prepStep2', 'prepStep3', 'prepStep4', 'prepStep5', 'prepStep6'];

/**
 * The tonic triad in root position, near the middle of the keyboard — what
 * an ABRSM examiner plays to establish the key before the 30 seconds start.
 * Built from `theory.js`'s diatonic-step spelling rather than a hand-picked
 * MIDI set, so the chord always comes from the test's actual key (its
 * accidentals follow the key signature, the same way every note in the
 * generated score does).
 */
function tonicTriadMidis(scoreKey) {
  const key = createKey(scoreKey);
  const root = 7 * 4 + key.tonicLetter; // dstep for the tonic near middle C
  return [root, root + 2, root + 4].map((dstep) => pitchAt(dstep, key).midi);
}

/**
 * Real preparation starts once the key has been given, not the instant the
 * button is pressed — so this gives the tonic chord first and only starts
 * the visible 30-second countdown once it has finished ringing. `current` is
 * guarded rather than assumed: `#prepare` isn't disabled while a chord or a
 * countdown from a *previous* test is still in flight, only before the very
 * first test exists.
 */
let prepToken = 0;
let prepSkip = false;   // 測試掛鉤 __sight.skipPrep
async function startCountdown() {
  if (!current) return;
  if (freeAlong()) return;   // 視奏分頁沒有準備倒數(按鈕藏起來;官方準備時間只在檢定頁)
  stopCountdown();
  player.stop();
  alongStart = null;
  resetAlongResult();
  setAlongLabel();
  elements.checklist.hidden = true;
  say('givingPitch');
  xPrep = 'pitch';
  setAlongLabel();

  const token = ++prepToken;
  const finished = await player.playChord(tonicTriadMidis(current.score.key)).catch(() => false);
  // 給音被打斷(按了播放、停止、產生新題):不要再開始倒數
  if (token !== prepToken) return;
  if (!finished) {
    xPrep = 'before';
    setAlongLabel();
    say(freeAlong() ? freeReadyKey() : 'readyStatus');
    return;
  }

  runPreparationCountdown();
}

/**
 * Whether the rendered score fits the viewport without scrolling — the same
 * check `scripts/devices.js` audits per device (`scoreBottom <=
 * viewportHeight`, measured off the rendered SVG rather than the bar boxes
 * so pedal brackets/hairpins/slurs hanging outside the staves count). A
 * phone routinely fails this (see CLAUDE.md: deliberately left to scroll
 * rather than shrink into illegibility), so the preparation message can't
 * unconditionally claim the whole piece is on screen — real ABRSM
 * preparation time is built around seeing the whole test at a glance, and
 * telling a scrolling phone user otherwise actively misleads the one thing
 * this countdown is simulating.
 */
function scoreFitsViewport() {
  // 樂譜卡捲到頂欄下時放不放得下(準備時會捲過去,所以看的是這個,不是現在的位置)
  return renderedScoreHeight() <= availableScoreHeight();
}

/** 準備時把樂譜卡捲到頂欄下面:30 秒是用來看譜的,樂譜要在畫面上 */
function bringScoreIntoView() {
  const header = document.querySelector('header');
  const top = header ? header.getBoundingClientRect().bottom : 0;
  const card = $('scoreCard').getBoundingClientRect();
  if (Math.abs(card.top - top - 8) < 4) return;
  window.scrollTo({ top: Math.max(0, window.scrollY + card.top - top - 8), behavior: 'smooth' });
}

/** 右上角的浮動倒數:放在頂欄下面(手機橫放時頂欄比較矮,所以每次量) */
function showPrepFloat(seconds) {
  const header = document.querySelector('header');
  // 題目卡右下的主要按鈕看得到時不重複(剩幾秒已經寫在按鈕上)
  const top = $('playAlongTop').getBoundingClientRect(), bar = document.getElementById('tabbar');
  const floor = bar && bar.getBoundingClientRect().top > innerHeight / 2 ? bar.getBoundingClientRect().top : innerHeight;
  if (!$('playAlongTop').hidden && top.height && top.top >= (header ? header.getBoundingClientRect().bottom : 0) && top.bottom <= floor) {
    elements.prepFloat.hidden = true;
    return;
  }
  elements.prepFloat.style.top = `${Math.round((header ? header.getBoundingClientRect().bottom : 0) + 8)}px`;
  elements.prepFloatValue.textContent = String(seconds);
  elements.prepFloat.classList.toggle('low', seconds <= 5);
  elements.prepFloat.hidden = false;
}

// 看譜倒數時捲動畫面:主要按鈕捲出畫面就換右上角的浮動倒數(看得到按鈕時不重複)
addEventListener('scroll', () => { if (xPrep === 'count' && alongStart === null) showPrepFloat(xLeft); }, { passive: true });
function runPreparationCountdown() {
  let remaining = rules.exam.preparationSeconds;
  elements.countdownValue.textContent = String(remaining);
  xPrep = 'count'; xLeft = remaining; setAlongLabel();
  showPrepFloat(remaining);
  elements.countdown.className = 'countdown running';
  elements.checklist.hidden = false;
  elements.checklist.innerHTML = PREPARATION_STEP_KEYS
    .map((key) => `<li>${escapeHtml(t(key))}</li>`)
    .join('');
  say(scoreFitsViewport() ? 'prepFitsScreen' : 'prepScrolls');
  bringScoreIntoView();

  prepSkip = false;
  countdownTimer = setInterval(() => {
    remaining -= 1;
    if (prepSkip) remaining = 0;
    if (SS.log) addLog(SS.log, { sec: 1 });   // 準備倒數的每一秒(跑完或停下時存檔)
    elements.countdownValue.textContent = String(Math.max(remaining, 0));
    xLeft = Math.max(remaining, 0); setAlongLabel();
    showPrepFloat(Math.max(remaining, 0));
    if (remaining <= 0) {
      xPrep = 'done';
      stopCountdown();
      elements.countdown.className = 'countdown done';
      elements.checklist.hidden = true;
      // Continuity outscores accuracy: going back to fix a slip is counted as
      // a second mistake.
      say('prepDone');
      if (mode === 'exam') { const k = `${exam.system}-${exam.grade}`; SS.xn[k] = (SS.xn[k] || 0) + 1; paintItemRow(); }
      recordPractice();
      setAlongLabel();
    }
  }, 1000);
}

function stopCountdown() {
  if (countdownTimer) { saveSS(); updateHistoryInfo(); }
  clearInterval(countdownTimer);
  countdownTimer = null;
  elements.prepFloat.hidden = true;
  // 看譜被打斷(換題、切分頁、給音中停下):主要按鈕回到「看譜 30 秒」
  if (xPrep === 'count' || xPrep === 'pitch') { xPrep = 'before'; setAlongLabel(); }
}

function setPlayState(playing) {
  elements.play.classList.toggle('is-active', playing);
  elements.playIcon.setAttribute('d', playing ? PAUSE_ICON_D : PLAY_ICON_D);
  elements.play.setAttribute('aria-label', t(playing ? 'playAriaStop' : freeAlong() ? 'playAriaRef' : 'playAriaPlay'));
  elements.play.title = t(playing ? 'playTitleStop' : freeAlong() ? 'playAriaRef' : 'playTitlePlay');
}

/**
 * One render at this viewport's fixed staff size, reporting the layout OSMD
 * actually produced and whether it fits the window without scrolling.
 *
 * Whatever `EngravingRules.RenderXMeasuresPerLineAkaSystem` is currently set
 * to stays in effect — and it is a target, not a guarantee: if the requested
 * bar count does not fit the container, OSMD silently wraps further instead,
 * which is what `matchesRequestedLayout` exists to catch.
 */

/**
 * How tall the engraved score actually is, measured from the rendered SVG
 * rather than from the bar boxes.
 *
 * The bar boxes cover the staves only. Everything OSMD hangs outside them —
 * pedal brackets under the bass staff, dynamics and hairpins between the
 * staves, slurs and ledger lines above — is in the SVG but not in those
 * boxes, so sizing to them would leave exactly the material this needs to
 * reserve room for hanging off the bottom of the screen.
 */
function renderedScoreHeight() {
  const svg = elements.score.querySelector('svg');
  if (!svg) return 0;
  /*
   * From the top of the score container to the bottom of the engraving, so
   * the padding `pinScoreTop` adds above the first stave counts toward the
   * fit. Measuring the SVG alone would report a score that fits while the
   * padding pushed it off the bottom of the screen.
   */
  const top = elements.score.getBoundingClientRect().top;
  return svg.getBoundingClientRect().bottom - top;
}

/**
 * The height the score has to fit into for the whole test to be readable
 * without scrolling — the distance from the top of the engraving to the
 * bottom of the window, less the frame's own padding.
 *
 * A tablet has the room for this and a phone often does not; the zoom floor
 * decides which. Where the floor is reached first the score simply stays
 * legible and the page scrolls, which is the right trade on a small screen.
 */
function availableScoreHeight() {
  // 樂譜卡捲到頂欄下面時,頂欄與底部分頁列之間放得下多高(準備時捲到樂譜卡就能一眼看完;播放時也會自動捲到這裡)
  const header = document.querySelector('header');
  const top = header ? header.getBoundingClientRect().height : 0;
  const bar = document.getElementById('tabbar');
  // 分頁列在下面才扣掉它;手機橫放時分頁列是左邊的直欄(top = 0),不佔下面的高度
  const barBox = bar ? bar.getBoundingClientRect() : null;
  const bottom = barBox && barBox.top > window.innerHeight / 2 ? barBox.top : (window.innerHeight || document.documentElement.clientHeight);
  const card = $('scoreCard').getBoundingClientRect(), score = elements.score.getBoundingClientRect();
  const chrome = score.top - card.top;   // 樂譜卡的標題列與內距
  return Math.max(120, bottom - top - chrome - SCORE_BOTTOM_GAP);
}

function hasSingleBarLine(layout) {
  return layout.bars.size > 1 && layout.systems.some((system) => system.bars.length === 1);
}

/*
 * `RenderXMeasuresPerLineAkaSystem` is a target, not a guarantee: when the
 * requested count doesn't actually fit the container at the current zoom,
 * OSMD silently re-wraps into a different system shape instead — e.g. "3 per
 * line" on a 6-bar test can come back as three systems of 2 rather than the
 * requested two systems of 3. `hasSingleBarLine` only catches the case where
 * that re-wrap strands a lone bar; a re-wrap into some *other* uniform shape
 * (like the two-of-three example) sails right through it and looks like a
 * success — so two tests of the same shape could each request the same `n`,
 * each get silently re-wrapped to a *different* actual shape depending on
 * their own content, and still both get cached under that same `n` as if
 * they'd rendered identically. This checks that OSMD actually honoured the
 * request — every system has exactly `n` bars except optionally the last,
 * which gets whatever remainder is left — so a request that wasn't honoured
 * can be told apart from one that was, instead of both being cached as if
 * interchangeable.
 */
function matchesRequestedLayout(layout, n, totalBars) {
  const systems = layout.systems;
  if (systems.length !== Math.ceil(totalBars / n)) return false;
  const remainder = totalBars % n;
  return systems.every((system, i) => {
    const isLast = i === systems.length - 1;
    const expected = isLast && remainder !== 0 ? remainder : n;
    return system.bars.length === expected;
  });
}

/**
 * The whole test always renders on the page in normal flow — no fullscreen
 * step, no cropped follow-window — and the staff size is fixed for this
 * viewport (see `STAFF_ZOOM`), so the only thing left to decide is where the
 * lines break.
 *
 * OSMD's own line breaking is a greedy fill (pack bars onto a line until the
 * next one doesn't fit), which strands a lone bar whenever the content
 * doesn't divide evenly and front-loads earlier lines, since bar-to-bar width
 * varies with note density. `RenderXMeasuresPerLineAkaSystem` fixes both by
 * forcing a uniform count — the question is which count.
 *
 * Try progressively fewer bars per line, from `MAX_MEASURES_PER_LINE` down to
 * 2, and take the first (most compact) count OSMD actually honours without
 * stranding a bar or silently re-wrapping into some other shape
 * (`matchesRequestedLayout`). `n=3` on 10 bars would strand one bar on a
 * fourth line (3+3+3+1) rather than sharing it, so any `n` leaving a
 * remainder of exactly 1 is skipped outright. A test where no uniform count
 * works falls back to the natural wrap, which is always free of stranded
 * bars.
 */
async function fitScore() {
  if (!current || !osmd) return;
  const shapeKey = layoutShapeKey(current.score);
  const totalBars = current.score.barCount;
  const cached = layoutCache[shapeKey];

  // 同樣形狀(級數、小節數、拍號寬窄、螢幕寬度)的題目沿用同一個排法與大小,換題時版面不會忽大忽小
  if (cached && cached.zoom) {
    const r = renderAt(cached.measuresPerLine, cached.zoom);
    if (matchesRequestedLayout(r.layout, cached.measuresPerLine, totalBars)) {
      if (r.fitsHeight || cached.zoom <= MIN_ZOOM + 0.001) return;
    }
  }

  let chosen = null;
  for (const n of twoPerLine() ? [2] : perLineCandidates(totalBars)) {
    // 寬度:縮到 n 小節放得進一行為止(二分搜尋;縮小只會更放得下)
    const fits = (z) => matchesRequestedLayout(renderAt(n, z).layout, n, totalBars);
    if (!fits(MIN_ZOOM)) continue;               // 最小還放不下(音太密)→ 每行少一小節
    let lo = MIN_ZOOM, hi = MAX_ZOOM;
    if (fits(MAX_ZOOM)) lo = MAX_ZOOM;
    else for (let k = 0; k < 6; k++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
    // 高度:整份要在畫面裡(30 秒準備時一眼看完),放不下就再縮一點,但不小於 MIN_ZOOM
    let z = lo, r = renderAt(n, z);
    for (let k = 0; k < 4 && !r.fitsHeight && z > MIN_ZOOM + 0.001; k++) {
      z = Math.max(MIN_ZOOM, z * Math.min(0.97, availableScoreHeight() / Math.max(1, renderedScoreHeight())));
      r = renderAt(n, z);
    }
    chosen = { measuresPerLine: n, zoom: Math.round(z * 1000) / 1000 };
    break;
  }
  if (!chosen && totalBars >= 2) {
    // 音很密(7–8 級的十六分音符)又是直式手機:每行 2 小節時可以再小一點,總比一小節一行、要一直捲好
    const fits = (z) => matchesRequestedLayout(renderAt(2, z).layout, 2, totalBars);
    for (const z of [0.5, MIN_ZOOM_DENSE]) if (fits(z)) { chosen = { measuresPerLine: 2, zoom: z }; break; }
  }
  if (!chosen) {   // 還是放不下(折疊機之類):交給 OSMD 自己換行
    chosen = { measuresPerLine: 0, zoom: MIN_ZOOM_DENSE };
  }
  // 同樣形狀的下一題如果比較密、要更小才放得下,就一起縮(只縮不放大),之後同形狀的題目都一樣大
  if (cached && cached.zoom && cached.measuresPerLine === chosen.measuresPerLine) chosen.zoom = Math.min(chosen.zoom, cached.zoom);
  renderAt(chosen.measuresPerLine, chosen.zoom);
  layoutCache[shapeKey] = chosen;
  saveLayoutCache();
}

/* 每行幾小節的候選(多的先試):像印出來的視奏考卷,一行大約 4 小節。
   能整除的優先(8 小節 → 4+4、6 小節 → 3+3、10 小節 → 5+5),不留一個小節單獨一行,最後才退到每行 2 小節 */
function perLineCandidates(bars) {
  const big = [5, 4, 3].filter((n) => n <= bars);
  const even = big.filter((n) => bars % n === 0 && (n < 5 || bars >= 10));
  const rest = big.filter((n) => n < 5 && bars % n !== 0 && bars % n !== 1);
  return [...new Set([...even, ...rest, 2])].filter((n) => n <= bars);
}
function renderAt(n, zoom) {
  osmd.EngravingRules.RenderXMeasuresPerLineAkaSystem = n;
  osmd.zoom = zoom;
  osmd.render();
  const layout = stage.measure();
  return { layout, fitsHeight: renderedScoreHeight() <= availableScoreHeight() };
}

let followT0 = 0;   // 跟著譜走(彈一遍、聽正確版本)開始的時間:停下來時算進練習紀錄的秒數
function startFollowing(clock = () => player.elapsed, onFinish = null) {
  if (!current || !stage.begin()) return;
  followT0 = performance.now();
  const { secondsPerBar } = barTimings(current.score);
  const totalBars = current.score.barCount;

  const step = () => {
    const elapsed = clock();
    if (elapsed === null) {
      stopFollowing();
      return;
    }
    if (onFinish && elapsed >= secondsPerBar * totalBars + 0.4) {
      onFinish();
      return;
    }
    if (elapsed >= 0) {
      const position = elapsed / secondsPerBar;
      /*
       * Playback keeps running for a couple of seconds after the last note —
       * the reverb tail — before onEnd fires and stops this loop, but
       * `elapsed` keeps climbing that whole time. Left unclamped, `position`
       * sails past `totalBars` and its fractional part keeps cycling 0→1, so
       * the playhead swept back across the final bar and re-played it, which
       * is the "last bar repeats" symptom. Freeze at the end of the last bar
       * once the test itself is actually finished.
       */
      if (position >= totalBars) {
        stage.update(totalBars, 1);
      } else {
        const bar = Math.floor(position) + 1;
        stage.update(bar, position - Math.floor(position));
      }
    }
    followFrame = requestAnimationFrame(step);
  };
  followFrame = requestAnimationFrame(step);
}

/*
 * 跟著彈:不出聲的播放軸。備考結束後,彈的人自己彈(用自己的琴),播放軸照題目速度走、
 * 到行尾自動換行(預看式捲動),手不用離開琴鍵點螢幕。先數一小節預備拍,
 * 跟考試一樣不會一開始就開跑。
 */
let alongStart = null;
let alongBeat = null;
// 檢定頁這一題走到哪一步:before(還沒看譜)| pitch(給音)| count(看譜倒數,xLeft = 剩幾秒)| done(時間到,可以彈)
let xPrep = 'before';
let xLeft = 0;
// 視奏分頁:這一題彈過(彈完或停止)了沒有。還沒彈之前不顯示 ▶(先自己讀、彈完再對照);新題目又藏起來
let played = false;

/* 視奏分頁(自由練習)的題目卡只有兩顆:左邊小的「新題目」、右邊大的「彈一遍」(進行中變停止);
   沒有 30 秒準備倒數(官方準備時間留在檢定頁),樂譜下面那張卡只留麥克風選項與結果。檢定頁照舊 */
function setAlongLabel() {
  const free = freeAlong();
  // 檢定頁出了題目也照版型 A:左 = 小的「下一題」、右 = 一顆主要按鈕,照步驟換字:看譜 30 秒 → 倒數(剩幾秒)→ 彈一遍 → 停止彈奏
  const x = mode === 'exam' && !readOn() && !xIdle && !!current;
  elements.playAlong.textContent = t(alongStart === null ? 'playAlong' : 'playAlongStop');
  elements.playAlong.hidden = free || x;
  const top = $('playAlongTop');
  top.textContent = alongStart !== null ? t('playAlongStop')
    : x && (xPrep === 'before' || xPrep === 'pitch') ? t('prepareLabel')
      : x && xPrep === 'count' ? tr(`${xLeft} 秒`, `${xLeft}s`)
        : tr('彈一遍', 'Play it');
  top.disabled = x && alongStart === null && (xPrep === 'pitch' || xPrep === 'count');
  top.classList.toggle('counting', x && xPrep === 'count' && alongStart === null);
  top.hidden = !(free || x) || !current;
  $('quiz').classList.toggle('free', free || x);
  elements.prepare.hidden = true;   // 看譜 30 秒就是主要按鈕(不另外放一顆)
  elements.countdown.hidden = true;   // 剩幾秒寫在主要按鈕上(樂譜捲上去時右上角浮動顯示)
  elements.generate.classList.toggle('small', free || x);
  elements.generate.classList.toggle('primary', !(free || x) && mode === 'exam');
  elements.generate.classList.toggle('ghost', free || x || mode !== 'exam');
  // ▶ 藏起來時保留位置(大標題那一行高度不跳)
  elements.play.style.visibility = (free && !played) || mk.state === 'run' ? 'hidden' : '';
  setPlayState(player.playing);
}

function stopPlayAlong(message) {
  if (listen) { stopListening(); if (message) say(message); return; }
  recorder.cancel();
  if (alongClicks) { alongClicks = false; audio.stopAll(); }
  if (alongStart !== null && freeAlong()) played = true;
  alongStart = null;
  alongBeat = null;
  stopFollowing();
  setAlongLabel();
  if (message) say(message);
}

/* 彈一遍旁邊那張卡(麥克風開關 + 說明一行):有題目、能彈的時候才出現 */
function syncAlongCard() {
  elements.along.hidden = !MIC_UI || readOn() || !current || (mode === 'exam' && (xIdle || mk.state === 'run')) || (mode !== 'exam' && !freeAlong());
}

const recorder = createListener();
let alongStarting = false;
let lastRhythmResult = null;

async function togglePlayAlong() {
  if (!current || alongStarting) return;
  if (listen) {
    // 聽到音以後按停止 = 彈完了,照樣打分;還沒彈就停 = 不算
    if (listen.notes > 0) finishListening(); else stopPlayAlong(freeAlong() ? freeReadyKey() : 'alongDone');
    return;
  }
  if (alongStart !== null) {
    if (mk.state === 'run') { finishMock(true); return; }   // 模擬考裡彈到一半按停止:記「中途停止」,照樣到結果
    stopPlayAlong('alongDone');   // 停下來:下一步 = ▶ 對照(沒彈完,不寫「彈完了」)
    return;
  }
  player.stop();
  stopFollowing();
  setPlayState(false);
  resetAlongResult();

  /* 麥克風自動打分:不放預備拍、不放拍點,照自己的速度彈;第一個音 = 開始,彈完停 2 秒(或按停止)= 結束。
     拿不到麥克風(拒絕、沒有、不支援)= 這次照原本的方式(預備拍 + 播放軸,檢定頁彈完自我檢查) */
  if (elements.alongMic.checked && mk.state !== 'run') {
    alongStarting = true;
    const token = ++listenToken;
    let ok = false;
    try { await recorder.start((n) => onHeard(token, n)); ok = true; } catch {
      lastRhythmResult = { denied: true };
      renderRhythmResult();
    }
    alongStarting = false;
    if (!current || token !== listenToken) { recorder.cancel(); return; }
    if (ok) { startListening(token); return; }
  }

  const { secondsPerBar } = barTimings(current.score);
  // 模擬考:預備拍與全曲的拍點真的響(xstick);一般練習照舊不出聲
  const lead = mk.state === 'run' ? scheduleClicks(secondsPerBar) : 0;
  alongStart = performance.now() / 1000 + lead + secondsPerBar; // 一小節預備拍
  setAlongLabel();
  const beats = current.score.timeSignature.beats;
  startFollowing(() => {
    if (alongStart === null) return null;
    const elapsed = performance.now() / 1000 - alongStart;
    if (elapsed < 0) {
      const n = Math.min(beats, Math.ceil((-elapsed / secondsPerBar) * beats));
      if (n !== alongBeat) { alongBeat = n; say('alongCountIn', { n }); }
    } else if (alongBeat !== 0) {
      alongBeat = 0;
      say('alongPlaying');
    }
    return elapsed;
  }, () => finishPlayAlong());
  // 沒有可跟的樂譜位置(還沒畫好)時,別讓按鈕卡在「停止彈奏」
  if (followFrame === null) stopPlayAlong();
}

/* ── 麥克風聽彈奏 ── */
const SILENCE_DONE = 2;      // 秒:最後一個音之後多久沒有新的音 = 彈完(聽到的音夠多時)
const SILENCE_GIVEUP = 6;    // 秒:音還不夠多(中途停下來想)時,等久一點
const WAIT_FIRST = 20;       // 秒:一直沒有聲音就結束
let listen = null;           // { token, t0, notes, lastAt, timer, need }
let listenToken = 0;
function startListening(token) {
  const need = Math.max(2, Math.round(expectedEvents(current.score).events.length * 0.8));
  listen = { token, t0: performance.now(), notes: 0, lastAt: 0, need, timer: setInterval(checkListening, 200) };
  alongStart = performance.now() / 1000;   // 主要按鈕變「停止」
  setAlongLabel();
  say('micListen');
}
function onHeard(token, n) {
  if (!listen || token !== listen.token) return;
  if (!listen.notes) say('micHeard');
  listen.notes += n;
  listen.lastAt = performance.now();
}
function checkListening() {
  if (!listen) return;
  const now = performance.now();
  if (!listen.notes) { if (now - listen.t0 > WAIT_FIRST * 1000) finishListening(); return; }
  const quiet = (now - listen.lastAt) / 1000;
  if (quiet >= (listen.notes >= listen.need ? SILENCE_DONE : SILENCE_GIVEUP) || now - listen.t0 > 360000) finishListening();
}
function stopListening() {
  if (!listen) return;
  clearInterval(listen.timer);
  addPracticeSec((performance.now() - listen.t0) / 1000);
  listen = null;
  recorder.cancel();
  alongStart = null;
  if (freeAlong()) played = true;
  setAlongLabel();
}
/** 彈完:停麥克風、在裝置上分析、顯示結果 */
function finishListening() {
  if (!listen) return;
  const heard = listen.notes;
  clearInterval(listen.timer);
  addPracticeSec((performance.now() - listen.t0) / 1000);
  listen = null;
  const take = recorder.finish();
  alongStart = null;
  const free = freeAlong();
  if (free) played = true;
  setAlongLabel();
  if (free) { recordPractice(); if (!SS.intro[hand]) { SS.intro[hand] = true; saveSS(); } }
  if (!take || !heard) { lastRhythmResult = { silent: true }; renderRhythmResult(); say(free ? 'freeDone' : 'alongDone'); return; }
  say('micAnalysing');
  const score = current.score;
  setTimeout(() => {
    if (!current || current.score !== score) return;
    lastRhythmResult = analyseTake(take, score);
    window.__lastTake = { result: lastRhythmResult }; // 測試掛鉤(tools/sight/mic-check.js)
    renderRhythmResult();
    say(free ? 'freeDone' : 'alongDone');
  }, 30);
}
/* 整段錄音 → 結果(micscore.js;初級–2 級加上音高) */
function analyseTake(take, score) {
  const r = scoreRecording(take.samples, take.sampleRate, score);
  return r.silent ? r : { ...r, score };
}

/** 沒用麥克風(關掉或拿不到):播放軸走完 = 彈完 */
function finishPlayAlong() {
  const free = freeAlong();
  stopPlayAlong(free ? 'freeDone' : 'alongDone');
  // 檢定頁:彈完出現自我檢查 4 項(沒有麥克風的結果時,這是彈完唯一的回饋;勾選、不算分數)
  if (!free && mode === 'exam') { xCheck = SELF_CHECK.map(() => false); paintSelfCheck(); sayFn(() => tr('彈完了,對照下面自己檢查,再按 ▶ 聽一次', 'Done — check yourself below, then tap ▶ to listen')); }
  if (free) { recordPractice(); if (!SS.intro[hand]) { SS.intro[hand] = true; saveSS(); } }   // 視奏分頁沒有準備倒數:彈完一遍算練了一題(第一次的說明不再出現)
}

const ISSUE = {
  pause: () => tr('停頓', 'paused'),
  restart: () => tr('重來', 'restarted'),
  fast: () => tr('變快', 'rushed'),
  slow: () => tr('變慢', 'dragged'),
  miss: () => tr('漏音', 'missed notes'),
  rhythm: () => tr('節奏', 'rhythm'),
  wrong: () => tr('音不對', 'wrong notes'),
};
const ISSUE_ORDER = ['pause', 'restart', 'miss', 'wrong', 'rhythm', 'fast', 'slow'];
function renderRhythmResult() {
  const r = lastRhythmResult;
  const box = elements.alongResult;
  if (!r) { box.hidden = true; paintBarMarks(); return; }
  if (r.denied) {
    box.innerHTML = `<p>${escapeHtml(t('alongMicDenied'))}</p>`;
  } else if (r.silent || r.tooFew) {
    box.innerHTML = `<p>${escapeHtml(t(r.notPiano ? 'resultNotPiano' : r.tooFew ? 'resultTooFew' : 'resultSilent'))}</p>`;
  } else {
    const parts = [tr(`節奏 ${r.rhythm}`, `Rhythm ${r.rhythm}`), tr(`穩定 ${r.stability}`, `Steady ${r.stability}`), tr(`連貫 ${r.continuity}`, `Flow ${r.continuity}`)];
    if (r.pitch !== null && r.pitch !== undefined) parts.push(tr(`音 ${r.pitch}`, `Notes ${r.pitch}`));
    const bpm = Math.round(r.bpmEst);
    const notes = [];
    if (r.trend) notes.push(r.trend === 'faster' ? tr('越彈越快', 'sped up') : tr('越彈越慢', 'slowed down'));
    if (r.unfinished) notes.push(tr('沒彈完', 'not finished'));
    const bars = Object.keys(r.barIssues).map(Number).sort((a, b) => a - b);
    for (const bar of bars.slice(0, 4)) {
      const kinds = ISSUE_ORDER.filter((k) => r.barIssues[bar].includes(k)).slice(0, 2).map((k) => ISSUE[k]());
      notes.push(tr(`第 ${bar} 小節${kinds.join('、')}`, `bar ${bar} ${kinds.join(', ')}`));
    }
    if (bars.length > 4) notes.push('…');
    box.innerHTML = `<div class="big"><small class="lead">${escapeHtml(t('resultTitle'))}</small>${r.accuracy}<small>/ 100</small></div>`
      + `<p class="mic-parts">${escapeHtml(parts.join(' · '))}</p>`
      + `<p>${escapeHtml(tr(`你的速度 ♩≈${bpm}（譜上 ♩=${r.scoreBpm}）`, `Your tempo ♩≈${bpm} (written ♩=${r.scoreBpm})`))}</p>`
      + (notes.length ? `<p class="mic-bars">${bars.length ? '<i class="mic-key" aria-hidden="true"></i>' : ''}${escapeHtml(notes.join(' · '))}</p>` : '')
      + (mode === 'exam' ? `<p class="disclaimer">${escapeHtml(tr('練習回饋,不是考試分數', 'Practice feedback, not an exam mark'))}</p>` : '');
  }
  box.hidden = false;
  paintBarMarks();
  // 結果沒露出來就捲過去
  requestAnimationFrame(() => {
    const rect = box.getBoundingClientRect();
    if (rect.height && rect.bottom > innerHeight - 70) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

/* 有問題的小節在譜上標顏色(重畫樂譜、換尺寸以後重新標) */
function paintBarMarks() {
  const stageEl = $('stage');
  for (const el of stageEl.querySelectorAll('.mic-mark')) el.remove();
  const r = lastRhythmResult;
  if (!r || !r.barIssues || !current || r.score !== current.score) return;
  const svg = elements.score.querySelector('svg');
  if (!svg) return;
  const frame = stageEl.getBoundingClientRect();
  for (const bar of Object.keys(r.barIssues)) {
    let box = null;
    for (const g of svg.querySelectorAll('g.vf-measure')) {
      if (Number(g.id) !== Number(bar)) continue;
      const b = g.getBoundingClientRect();
      box = box ? { left: Math.min(box.left, b.left), top: Math.min(box.top, b.top), right: Math.max(box.right, b.right), bottom: Math.max(box.bottom, b.bottom) } : { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    }
    if (!box) continue;
    const mark = document.createElement('div');
    mark.className = 'mic-mark';
    mark.style.left = `${box.left - frame.left - stageEl.clientLeft}px`;
    mark.style.top = `${box.top - frame.top - stageEl.clientTop - 4}px`;
    mark.style.width = `${box.right - box.left}px`;
    mark.style.height = `${box.bottom - box.top + 8}px`;
    stageEl.appendChild(mark);
  }
}

function resetAlongResult() {
  if (xCheck) { xCheck = null; paintSelfCheck(); }
  listenToken++;
  if (listen) stopListening();
  recorder.cancel();
  lastRhythmResult = null;
  elements.alongResult.hidden = true;
  paintBarMarks();
}

function stopFollowing() {
  cancelAnimationFrame(followFrame);
  followFrame = null;
  if (followT0) { addPracticeSec((performance.now() - followT0) / 1000); followT0 = 0; }
  stage?.end();
}

function togglePlayback() {
  if (!current) return;
  if (alongStart !== null) stopPlayAlong();
  if (player.playing) {
    player.stop();
    stopFollowing();
    setPlayState(false);
    return;
  }
  setPlayState(true);
  player.play(current.score, {
    onEnd: () => {
      stopFollowing();
      setPlayState(false);
    },
  })
    .then(() => {
      if (!player.playing) return;
      say('playingStatus');
      startFollowing();
    })
    .catch((error) => fail('failPlayback', error.message));
}

/* ══ 視奏沒有模擬考(2026-10:跟練習流程重複 —— 檢定頁的練習就是「看譜 30 秒 → 彈一遍」照考試的方式走一遍)══
   檢定頁彈完一遍出現自我檢查 4 項(xCheck;勾選、不算分數、不出現等第字眼),出新題或再彈一遍時收起來。
   mk 留著一直是 idle(下面的 finishMock / abortMock / closeMock 不會被叫到;換考試時 abortMock 回傳 false) */
let alongClicks = false;
const SELF_CHECK = [
  () => tr('一路彈到最後,沒有停下來、沒有回頭改', 'Kept going — no stopping, no going back'),
  () => tr('速度穩定,跟得上拍點', 'Kept a steady beat with the click'),
  () => tr('音和節奏大部分正確', 'Notes and rhythms mostly right'),
  () => tr('有彈出力度和記號(斷奏、圓滑線…)', 'Showed the dynamics and markings'),
];
const abortText = (reason) => ({
  leave: () => tr('已中止:中途切換了分頁或切到背景(這一次不算)。', 'Stopped: you left the page mid-way (not counted).'),
  reload: () => tr('已中止:上次沒有做完(重新整理或關掉了 App),不算。', "Stopped: last time didn't finish (reloaded or closed), not counted."),
  exam: () => tr('已中止:考試或級數換了(這一次不算)。', 'Stopped: the exam or grade changed (not counted).'),
  load: () => tr('已中止:拍點的聲音載入失敗(第一次要連網路),這一次不算。', "Stopped: the click sound didn't load (needs internet once), not counted."),
}[reason] ?? (() => tr('已中止(這一次不算)。', 'Stopped (not counted).')));

/* 預備拍 + 全曲的拍點(xstick;每小節第一拍大聲):x/8 的複拍子每個附點四分一下,其他每拍一下。回傳離第一下拍點還有幾秒 */
function scheduleClicks(secondsPerBar) {
  const c = audio.ensureAudio();
  const lead = 0.12;
  const t0 = c.currentTime + lead;
  const { beats, beatType } = current.score.timeSignature;
  const group = beatType === 8 && beats % 3 === 0 && beats > 3 ? 3 : 1;
  const n = beats / group;
  for (let bar = 0; bar <= current.score.barCount; bar++) {
    for (let i = 0; i < n; i++) audio.playClick(t0 + bar * secondsPerBar + (i * secondsPerBar) / n, i === 0);
  }
  alongClicks = true;
  return lead;
}
function finishMock(stopped) {
  if (mk.state !== 'run') return;
  mk.id++;
  mk.stopped = stopped;
  stopPlayAlong();
  played = true;
  mk.state = 'result';
  mk.phase = null;
  delete SS.mockRun;
  saveSS();
  paintMock();
  sayFn(() => (stopped ? tr('中途停了。', 'Stopped part-way. ') : tr('彈完了。', 'Done. '))
    + tr('對照下面自己檢查,再按 ▶ 聽一次。', 'Check yourself below, then tap ▶ to listen.'));
}
/* 中止:停掉播放、拍點與計時;標記留著,說明畫出來(showExamItem)才拿掉 */
function abortMock(reason) {
  if (mk.state !== 'run') return false;
  mk.id++;
  clearInterval(mk.timer); mk.timer = null;
  mk.state = 'aborted';
  mk.reason = reason;
  mk.phase = null;
  if (alongStart !== null) stopPlayAlong();
  if (alongClicks) { alongClicks = false; audio.stopAll(); }
  elements.prepFloat.hidden = true;
  xIdle = true;   // 回到檢定頁(或下次進來)時顯示說明
  if (active && mode === 'exam' && reason !== 'leave') showExamItem();
  return true;
}
/* 本項列的「停止」:不算、沒有結果,回到檢定頁 */
function closeMock() {
  mk.id++;
  mk.state = 'idle';
  mk.phase = null;
  delete SS.mockRun;
  saveSS();
  showExamItem();
}
/* 模擬考的畫面:本項列的按鈕、題目卡(進行中不能換題、▶ 藏起來)、設定卡與推估說明藏起來、結果的自我檢查 */
function paintMock() {
  const run = mk.state === 'run', on = mockOn();
  const btn = $('mockBtn');
  btn.hidden = true;   // 視奏沒有模擬考(跟練習流程重複)
  pairText($('mockLabel'), () => (run ? tr('結束', 'End') : tr('模擬考', 'Mock')));
  btn.title = run ? tr('結束模擬考(這一次不算)', 'End the mock exam (not counted)') : tr('模擬考', 'Mock exam');
  btn.setAttribute('aria-label', btn.title);
  btn.disabled = !run && (!rules || !examSupported());
  $('quiz').classList.toggle('mock-run', run);
  $('quiz').classList.toggle('mock-result', mk.state === 'result');
  if (mode === 'exam') $('setup').hidden = !examSupported() || on;
  if (mode === 'exam' && on) elements.confidence.hidden = true;
  elements.generate.hidden = run;   // 模擬考中不能換題(準備、彈奏都是自動的,沒有要按的主要按鈕)
  if (run) {
    elements.generate.disabled = true;
    elements.play.disabled = true;
  } else if (mode === 'exam') {
    if (!xIdle && current) elements.generate.disabled = elements.play.disabled = false;   // 結果:▶ 聽正確版本
  }
  setAlongLabel();
  syncAlongCard();
  paintSelfCheck();
}
function paintSelfCheck() {
  const box = $('selfCheck');
  const show = !!xCheck && mode === 'exam';
  box.hidden = !show;
  if (!show) { box.innerHTML = ''; return; }
  box.setAttribute('aria-label', tr('自我檢查', 'Check yourself'));
  box.innerHTML = SELF_CHECK.map((fn, i) => `<button type="button" data-i="${i}" aria-pressed="${!!xCheck[i]}"><span></span><i aria-hidden="true">${xCheck[i] ? '✓' : ''}</i></button>`).join('');
  box.querySelectorAll('button span').forEach((el, i) => pairText(el, SELF_CHECK[i]));
}

/*
 * 練習紀錄(js/shared/practicelog.js,跟技巧、聽音、DrumDrill 同一份):SS.log = { "YYYY-MM-DD": { n, sec } }、SS.goal = 每週目標(分鐘)。
 * 一題 = 30 秒準備跑完(檢定頁)、彈完一遍(視奏分頁)、認音答一題;秒數 = 準備倒數、彈一遍、聽正確版本(跟著譜走的時間)與認音作答的時間。
 * 出題歷史(不重複出題)照舊在背景記,不顯示也不能清除。
 */
function addPracticeSec(sec) {
  if (!(sec > 0)) return;
  addLog(SS.log, { sec: Math.min(sec, 600) });
  saveSS(); updateHistoryInfo();
}
function recordPractice() {
  addLog(SS.log, { n: 1 });
  saveSS();
  updateHistoryInfo();
  if (ctx) ctx.examChanged();
}
function practiceStats() {
  return { today: today(SS.log).n, streak: logStreak(SS.log) };
}

/* 練習紀錄卡:連續天數、今天題數、今天分鐘 + 每週目標 + 最近 7 天 */
function updateHistoryInfo() {
  paintLog($, SS.log, SS.goal);
  $('logMin').textContent = Math.floor(today(SS.log).sec / 60);
}
$('goalBtn').addEventListener('click', () => { SS.goal = nextGoal(SS.goal); saveSS(); updateHistoryInfo(); });

function escapeHtml(value) {
  return String(value).replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
}
