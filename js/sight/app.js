import { generateTest, keyOptionsFor } from './generator/generate.js';
import { toMusicXml } from './generator/musicxml.js';
import { createHistory, generateUnique } from './generator/fingerprint.js';
import { createKey, pitchAt } from './generator/theory.js';
import { createPlayer } from './playback.js';
import { createRecorder } from '../shared/mic.js';
import { expectedOnsets, detectOnsets, scoreRhythm } from './scoring.js';
import { createStage, barTimings } from './stage.js';
import { t, applySightStatic } from './i18n.js';
import { pairText, unpair, tr } from '../shared/i18n.js';
import { createReading, cleanRead } from './reading.js';
import { STAGES, HANDS, stageOf, rulesForStage, pickGrade, soloScore, rangeLabel } from './stages.js';

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
  return { stage, names, read: cleanRead(s.read) };
})();
const saveSS = () => { try { localStorage.setItem('pianodrill.sight.v1', JSON.stringify(SS)); } catch { /* 存不了就算了 */ } };
const $ = (id) => document.getElementById('s-' + id);
let active = false;
let mode = 'free';          // 'free' 自由練習 / 'exam' 檢定分頁
let exam = { system: 'abrsm', grade: 1, auto: true };
let ctx = null;
/* 視奏分頁:子項目 = 認音 / 右手 / 左手 / 雙手(外框),右手 / 左手 / 雙手各自選範圍階段 */
let hand = 'both';
let keyValue = '';   // 檢定頁選的調性('' = 隨機;"G:major")
const reading = createReading({ $, store: SS.read, save: saveSS, onAnswered: () => recordPractice() });
const readOn = () => mode === 'free' && hand === 'read';
/* 視奏分頁:「彈一遍」一直在(不用先等 30 秒準備;準備是選用的);檢定頁照考試流程,準備完才出現 */
const freeAlong = () => mode === 'free' && hand !== 'read';
let lastHandTab = null;   // 上一次在畫面上的右手 / 左手 / 雙手(切到認音時用那一階的範圍)
const stageNow = () => stageOf(SS.stage[hand]);
const freeKey = () => `${hand}-${SS.stage[hand]}`;
/* 目前用哪一級的規則出題:檢定分頁照考試級數;視奏分頁 = 這一題抽到的級(範圍階段裡隨機) */
const currentGrade = () => (mode === 'exam' ? exam.grade : current && current.free ? current.score.grade : stageNow().grades[stageNow().grades.length - 1]);
/* 這一階的規則表複本(調性選單、出題用;階 1 只有 C 大調) */
const stageRules = (g = stageNow().grades[stageNow().grades.length - 1]) => rulesForStage(rules, stageNow(), g);
/* 檢定分頁:這個考試/級數有沒有視奏規則 */
const examSupported = () => exam.system === 'abrsm' && exam.grade >= 1 && exam.grade <= 8;

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
  clearHistory: $('clearHistory'),
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
  // 顯示音名的譜比較高(每個譜表下面多一排字),排法與大小分開記
  return `${score.grade}:${score.barCount}:${timeSignatureClass(score.timeSignature)}:${layoutWidthClass()}${namesShown() ? ':n' : ''}`;
}

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
  });
  window.__stage = stage; // debugging hook, also used by scripts/devices.js
  window.__playback = player; // debugging hook, also used by scripts/loudness.js
  // debugging hook for scripts/mic-check.js: what the current test expects from a player
  window.__scoring = () => (current ? { onsets: expectedOnsets(current.score), secondsPerBar: barTimings(current.score).secondsPerBar } : null);

  elements.generate.disabled = false;
  elements.generate.addEventListener('click', newTest);
  elements.prepare.addEventListener('click', startCountdown);
  elements.play.addEventListener('click', togglePlayback);
  elements.playAlong.addEventListener('click', togglePlayAlong);
  $('playAlongTop').addEventListener('click', togglePlayAlong);
  try { elements.alongMic.checked = readKey('pianodrill.sight.mic') === '1'; } catch { /* 沒有儲存空間就預設關 */ }
  elements.alongMic.addEventListener('change', () => {
    try { localStorage.setItem('pianodrill.sight.mic', elements.alongMic.checked ? '1' : '0'); } catch { /* 不影響使用 */ }
  });
  setAlongLabel();
  elements.clearHistory.addEventListener('click', () => {
    if (!confirm(t('clearHistoryConfirm'))) return;
    history.clear();
    updateHistoryInfo();
  });
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
  reading.leave();
  stopAll();
}
export function setExam(ex) {
  const changed = ex.system !== exam.system || ex.grade !== exam.grade;
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
  else if ((e.key === 'n' || e.key === 'N') && !elements.generate.disabled) elements.generate.click();
}
function stopAll() {
  prepToken += 1;
  stopCountdown();
  player.stop();
  if (alongStart !== null) stopPlayAlong();
  stopFollowing();
  setPlayState(false);
}
/* 自由練習 ↔ 檢定:級數改用考試的;這個考試/級數沒有規則時整個收起來,只留說明 */
function syncMode(changed) {
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
  // 換了級數 / 子項目 / 範圍階段(或第一次進來):重新出一題
  const stale = !current || (mode === 'exam' ? current.free || current.score.grade !== currentGrade() : !current.free || current.key !== freeKey());
  if (rules && (changed || stale)) newTest();
}
function renderUnsupported() {
  const ini = exam.grade === 0;
  pairText($('unsupportedText'), () => (exam.system === 'trinity'
    ? t('unsupportedTrinity')
    : ini ? t('unsupportedInitial') : t('examNotYet')));
}
/* ── 視奏分頁的範圍階段(js/sight/stages.js):畫面只寫範圍,不寫級數、考試名稱 ── */
const HAND_NAME = { right: () => tr('右手', 'RH'), left: () => tr('左手', 'LH') };
function rangeText(st = stageNow(), h = hand) {
  const full = st.n === 4;
  if (h === 'both') return full ? tr('雙手 全範圍', 'Hands together · full range') : `${HAND_NAME.right()} ${rangeLabel(st.rh)} · ${HAND_NAME.left()} ${rangeLabel(st.lh)}`;
  return `${HAND_NAME[h]()} ${full ? tr('全範圍', 'full range') + ' ' : ''}${rangeLabel(h === 'right' ? st.rh : st.lh)}`;
}
function renderStage() {
  const box = $('stageBox');
  box.hidden = mode === 'exam';
  if (box.hidden) return;
  const seg = $('stageSeg'), cur = SS.stage[hand];
  const focused = document.activeElement && seg.contains(document.activeElement) ? document.activeElement.dataset.v : null;
  seg.setAttribute('aria-label', tr('範圍階段', 'Range stage'));
  seg.innerHTML = STAGES.map((st) => {
    // 每顆按鈕只寫一行(使用者:「C4–G4 / C3–G3」擠成兩行):雙手寫 1 / 2 / 3 / 全範圍(兩手的範圍寫在下面的說明),單手寫那一手的範圍
    const r = hand === 'both' ? `${rangeLabel(st.rh)} / ${rangeLabel(st.lh)}` : rangeLabel(hand === 'right' ? st.rh : st.lh);
    const head = st.n === 4 ? tr('全範圍', 'Full') : hand === 'both' ? String(st.n) : r;
    return `<button type="button" data-v="${st.n}" aria-pressed="${st.n === cur}" aria-label="${st.n === 4 ? tr('全範圍', 'Full range') : tr(`範圍 ${st.n}`, `Range ${st.n}`)}: ${r}"><b>${head}</b></button>`;
  }).join('');
  if (focused) seg.querySelector(`[data-v="${focused}"]`)?.focus({ preventScroll: true });
  const names = $('names');
  names.textContent = tr('顯示音名', 'Note names');
  names.setAttribute('aria-pressed', String(!!SS.names[cur]));
  pairText($('stageNote'), () => `${rangeText()} · ${tr('範圍內的節奏與調性由 App 依階段套用(練習設定)', 'rhythm & keys set by the App (practice setting)')}`);
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
const NOTE_LETTER = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };
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
  // 位置用畫面座標量,再換回 SVG 自己的座標(OSMD 的 SVG 有 viewBox 縮放;SVG 座標 = VexFlow 座標,一個譜線間距 = 10)
  const ctm = svg.getScreenCTM();
  if (!ctm || !ctm.a) return;
  const k = ctm.a, toX = (cx) => (cx - ctm.e) / k, toY = (cy) => (cy - ctm.f) / (ctm.d || k);
  const NS = 'http://www.w3.org/2000/svg', size = nameFontSvg(osmd.zoom), padX = Math.max(2.5, 2 / k), padY = Math.max(3, 3 / k), gapX = size * 0.35;   // 留白至少 2–3 CSS px
  // 譜上所有筆畫的外框(SVG 座標)
  const ink = [];
  for (const el of svg.querySelectorAll('path, rect, text, ellipse, circle, line, polyline, polygon, use')) {
    const b = el.getBoundingClientRect();
    if (!b.width && !b.height) continue;
    ink.push({ l: toX(b.left), r: toX(b.right), t: toY(b.top), b: toY(b.bottom) });
  }
  // 每一行、每一個譜表一排:{ top, bottom(譜表第一條、最後一條線), next(下面那個譜表的第一條線), items }
  const rows = new Map();
  for (const measures of osmd.GraphicSheet.MeasureList) {
    for (const m of measures) {
      if (!m || !m.getVFStave) continue;
      const line = m.ParentStaffLine;
      const vf = m.getVFStave();
      const key = `${line && line.PositionAndShape ? Math.round(line.PositionAndShape.AbsolutePosition.y * 10) : 0}`;
      if (!rows.has(key)) rows.set(key, { key, top: vf.getYForLine(0), bottom: vf.getYForLine(4), items: [] });
      const row = rows.get(key);
      for (const se of m.staffEntries) {
        for (const gve of se.graphicalVoiceEntries) {
          for (const gn of gve.notes) {
            const src = gn.sourceNote;
            if (!src || src.isRest() || !src.Pitch || src.IsGraceNote) continue;
            if (src.NoteTie && src.NoteTie.StartNote !== src) continue;   // 連結線後面的音不再寫
            const head = gn.getSVGGElement && gn.getSVGGElement();
            const nh = head && (head.querySelector('.vf-notehead') || head);
            if (!nh) continue;
            const box = nh.getBoundingClientRect();
            const p = src.Pitch, letter = NOTE_LETTER[p.FundamentalNote] ?? '';
            const acc = p.AccidentalHalfTones > 0 ? '♯' : p.AccidentalHalfTones < 0 ? '♭' : '';
            row.items.push({ x: toX(box.left + box.width / 2), y: toY(box.top + box.height / 2), text: letter + acc });
          }
        }
      }
    }
  }
  const list = [...rows.values()].sort((a, b) => a.top - b.top);
  list.forEach((row, i) => { row.next = i + 1 < list.length ? list[i + 1].top : Infinity; });
  let maxBottom = 0, need = 1, crowded = false;
  for (const row of list) {
    // 同一個位置的音(和弦)排成一欄:高的音在上面;同一個字只寫一次
    const cols = [];
    for (const it of row.items.sort((a, b) => a.x - b.x)) {
      let col = cols.find((c) => Math.abs(c.x - it.x) < 4);
      if (!col) { col = { x: it.x, notes: [] }; cols.push(col); }
      col.notes.push(it);
    }
    for (const col of cols) col.texts = [...new Set(col.notes.sort((a, b) => a.y - b.y).map((it) => it.text))];
    if (!cols.length) continue;
    // 先畫出來量字的大小(基線到頂端的距離、寬度),再決定高度
    let lineH = 0, ascent = 0;
    for (const col of cols) {
      col.els = col.texts.map((text) => {
        const el = document.createElementNS(NS, 'text');
        el.setAttribute('class', 's-name');
        el.setAttribute('x', String(col.x)); el.setAttribute('y', '0');
        el.setAttribute('text-anchor', 'middle'); el.setAttribute('font-size', String(size));
        el.setAttribute('aria-hidden', 'true');
        el.textContent = text;
        svg.appendChild(el);
        return el;
      });
      col.w = 0;
      for (const el of col.els) { const bb = el.getBBox(); col.w = Math.max(col.w, bb.width); lineH = Math.max(lineH, bb.height); ascent = Math.max(ascent, -bb.y); }
    }
    // 音很密(十六分音符)時字比音距寬:相鄰的字會碰在一起的,下一個字往下一層(交錯);和弦一個音一層。
    // 每一欄找最上面一個放得下(這幾層在這個寬度裡都還空著)的層
    const levelRight = [];
    for (const col of cols) {
      const l = col.x - col.w / 2, n = col.els.length;
      let base = 0;
      while (Array.from({ length: n }, (_, j) => levelRight[base + j] ?? -Infinity).some((r) => r + gapX > l)) base++;
      for (let j = 0; j < n; j++) levelRight[base + j] = col.x + col.w / 2;
      col.base = base;
      // 每一欄只看水平方向會碰到的筆畫
      col.ink = ink.filter((b) => b.r > l - padX && b.l < col.x + col.w / 2 + padX);
    }
    const levels = levelRight.length;
    need = Math.max(need, levels);
    // 從譜表最下面那條線往下找第一個整排都不碰到筆畫的高度(字的頂端 = y)
    const hits = (y) => {
      let n = 0;
      for (const col of cols) {
        const t = y + col.base * lineH - padY, b = y + (col.base + col.els.length) * lineH + padY;
        for (const box of col.ink) if (box.b > t && box.t < b) n++;
      }
      return n;
    };
    const start = row.bottom + 3, limit = Number.isFinite(row.next) ? row.next - levels * lineH - 2 : row.bottom + 400;
    let best = start, bestHits = Infinity;
    for (let y = start; y <= Math.max(start, limit); y += 1) {
      const n = hits(y);
      if (n < bestHits) { best = y; bestHits = n; }
      if (!n) break;
    }
    if (bestHits) crowded = true;
    for (const col of cols) {
      col.els.forEach((el, j) => { el.setAttribute('y', String(best + ascent + (col.base + j) * lineH)); el.dataset.row = `${row.key}:${col.base + j}`; });
      const top = best + col.base * lineH, bottom = top + lineH * col.els.length;
      ink.push({ l: col.x - col.w / 2, r: col.x + col.w / 2, t: top, b: bottom });   // 下一排也要避開
      maxBottom = Math.max(maxBottom, bottom);
    }
  }
  // 最後一行的音名超出 SVG 的底:把 SVG 加高(不然會被切掉)
  const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb.every(Number.isFinite) && maxBottom + 6 > vb[1] + vb[3]) {
    const extra = maxBottom + 6 - (vb[1] + vb[3]);
    svg.setAttribute('viewBox', `${vb[0]} ${vb[1]} ${vb[2]} ${vb[3] + extra}`);
    const h = parseFloat(svg.getAttribute('height'));
    if (Number.isFinite(h)) svg.setAttribute('height', String(h + extra * k));
  }
  return { need, crowded };
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
    else fail(lastMessage.key, lastMessage.detail);
  }
  if (rules) populateKeyOptions();
  if (current) showMeta(current.score);
  setPlayState(player.playing);
  setAlongLabel();
  renderRhythmResult();
  updateHistoryInfo();
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

async function newTest() {
  prepToken += 1;
  stopCountdown();
  player.stop();
  alongStart = null;
  played = false;
  setAlongLabel();
  elements.along.hidden = true;
  resetAlongResult();
  stopFollowing();
  setPlayState(false);
  elements.along.hidden = !freeAlong();

  // Start fetching the piano samples now, so the first press of play is
  // immediate — same moment ScrollScore loads them, once there is a score.

  // '' (隨機調性) keeps the fully-random pickKey() behaviour; otherwise
  // every retry generateUnique makes is forced to the same chosen key,
  // same as it's forced to the same grade.
  const [tonic, keyMode] = mode === 'exam' && keyValue ? keyValue.split(':') : [];   // 視奏分頁:調性由 App 依範圍階段套用
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
    current = { score, xml: toMusicXml(score, { only: hand === 'right' ? 1 : hand === 'left' ? 2 : 0 }), free: true, key: freeKey() };
  }
  const score = current.score;
  setAlongLabel();
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
    if (!quiet) say(freeAlong() ? 'freeReady' : 'readyStatus');
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
  // Two frames: the first lets the browser paint the held opacity-0 state
  // (removing `transition: none` alone wouldn't stop the two class changes
  // from collapsing into one paint), the second flips to the visible state
  // so the opacity/transform change is what actually animates.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => elements.score.classList.remove('entering'));
  });
  showMeta(score);
  elements.countdown.hidden = freeAlong();
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
  elements.meta.innerHTML = [score.timeSignature.text, t('barsSuffix', { count: score.barCount }), `♩≈${score.tempoBpm}`]
    .map((value) => `<span class="q-tag">${escapeHtml(value)}</span>`).join('');

  // 視奏分頁:範圍內的規則是 App 的練習設定,不寫「這一級」的推估說明(那是檢定頁的)
  const warningKey = current && current.free ? null : CONFIDENCE_LABEL_KEY[score.confidence];
  elements.confidence.hidden = !warningKey;
  if (warningKey) elements.confidence.textContent = t(warningKey);
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
async function startCountdown() {
  if (!current) return;
  stopCountdown();
  player.stop();
  alongStart = null;
  elements.along.hidden = !freeAlong();
  resetAlongResult();
  setAlongLabel();
  elements.checklist.hidden = true;
  say('givingPitch');

  const token = ++prepToken;
  const finished = await player.playChord(tonicTriadMidis(current.score.key)).catch(() => false);
  // 給音被打斷(按了播放、停止、產生新題):不要再開始倒數
  if (token !== prepToken) return;
  if (!finished) {
    say(freeAlong() ? 'freeReady' : 'readyStatus');
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
  elements.prepFloat.style.top = `${Math.round((header ? header.getBoundingClientRect().bottom : 0) + 8)}px`;
  elements.prepFloatValue.textContent = String(seconds);
  elements.prepFloat.classList.toggle('low', seconds <= 5);
  elements.prepFloat.hidden = false;
}

function runPreparationCountdown() {
  let remaining = rules.exam.preparationSeconds;
  elements.countdownValue.textContent = String(remaining);
  showPrepFloat(remaining);
  elements.countdown.className = 'countdown running';
  elements.checklist.hidden = false;
  elements.checklist.innerHTML = PREPARATION_STEP_KEYS
    .map((key) => `<li>${escapeHtml(t(key))}</li>`)
    .join('');
  say(scoreFitsViewport() ? 'prepFitsScreen' : 'prepScrolls');
  bringScoreIntoView();

  countdownTimer = setInterval(() => {
    remaining -= 1;
    elements.countdownValue.textContent = String(Math.max(remaining, 0));
    showPrepFloat(Math.max(remaining, 0));
    if (remaining <= 0) {
      stopCountdown();
      elements.countdown.className = 'countdown done';
      elements.checklist.hidden = true;
      // Continuity outscores accuracy: going back to fix a slip is counted as
      // a second mistake.
      say('prepDone');
      recordPractice();
      elements.along.hidden = false;
    }
  }, 1000);
}

function stopCountdown() {
  clearInterval(countdownTimer);
  countdownTimer = null;
  elements.prepFloat.hidden = true;
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
  for (const n of perLineCandidates(totalBars)) {
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

function startFollowing(clock = () => player.elapsed, onFinish = null) {
  if (!current || !stage.begin()) return;
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
// 視奏分頁:這一題彈過(彈完或停止)了沒有。還沒彈之前不顯示 ▶(先自己讀、彈完再對照);新題目又藏起來
let played = false;

/* 視奏分頁(自由練習)的題目卡只有兩顆:左邊小的「新題目」、右邊大的「彈一遍」(進行中變停止);
   沒有 30 秒準備倒數(官方準備時間留在檢定頁),樂譜下面那張卡只留麥克風選項與結果。檢定頁照舊 */
function setAlongLabel() {
  const free = freeAlong();
  elements.playAlong.textContent = t(alongStart === null ? 'playAlong' : 'playAlongStop');
  elements.playAlong.hidden = free;
  $('playAlongTop').textContent = alongStart === null ? tr('彈一遍', 'Play it') : t('playAlongStop');
  $('playAlongTop').hidden = !free || !current;
  $('quiz').classList.toggle('free', free);
  elements.prepare.hidden = free;
  if (free) elements.countdown.hidden = true;
  elements.generate.classList.toggle('small', free);
  // ▶ 藏起來時保留位置(大標題那一行高度不跳)
  elements.play.style.visibility = free && !played ? 'hidden' : '';
  setPlayState(player.playing);
}

function stopPlayAlong(message) {
  recorder.cancel(); // 手動停止:丟掉這次錄音,不評分
  if (alongStart !== null && freeAlong()) played = true;
  alongStart = null;
  alongBeat = null;
  stopFollowing();
  setAlongLabel();
  if (message) say(message);
}

const recorder = createRecorder();
let alongStarting = false;
let lastRhythmResult = null;

async function togglePlayAlong() {
  if (!current || alongStarting) return;
  if (alongStart !== null) {
    stopPlayAlong(freeAlong() ? 'freeDone' : 'prepDone');
    return;
  }
  player.stop();
  stopFollowing();
  setPlayState(false);
  resetAlongResult();

  // 選了麥克風評分:先要權限(第一次會跳出系統詢問),拿到才開始數預備拍
  let scoring = false;
  if (elements.alongMic.checked) {
    alongStarting = true;
    try {
      await recorder.start();
      scoring = true;
    } catch {
      // 拒絕或找不到麥克風:把原因放在結果區(狀態訊息會馬上被預備拍蓋掉),這次照樣跟著彈、只是不評分
      lastRhythmResult = { denied: true };
      renderRhythmResult();
    }
    alongStarting = false;
    if (!current) { recorder.cancel(); return; }
  }

  const { secondsPerBar } = barTimings(current.score);
  alongStart = performance.now() / 1000 + secondsPerBar; // 一小節預備拍
  setAlongLabel();
  const beats = current.score.timeSignature.beats;
  startFollowing(() => {
    if (alongStart === null) return null;
    const elapsed = performance.now() / 1000 - alongStart;
    if (elapsed < 0) {
      const n = Math.min(beats, Math.ceil((-elapsed / secondsPerBar) * beats));
      if (n !== alongBeat) { alongBeat = n; say(scoring ? 'alongListening' : 'alongCountIn', { n }); }
    } else if (alongBeat !== 0) {
      alongBeat = 0;
      say('alongPlaying');
    }
    return elapsed;
  }, () => finishPlayAlong(scoring));
  // 沒有可跟的樂譜位置(還沒畫好)時,別讓按鈕卡在「停止彈奏」
  if (followFrame === null) stopPlayAlong();
}

/** 彈完:停麥克風、評分、顯示結果。 */
function finishPlayAlong(scoring) {
  const take = scoring ? recorder.finish() : null;
  const { score } = current;
  const firstNoteAt = alongStart;
  const free = freeAlong();
  stopPlayAlong(free ? 'freeDone' : 'alongDone');
  if (free) recordPractice();   // 視奏分頁沒有準備倒數:彈完一遍算練了一題
  if (!take) return;
  // 麥克風時間軸換算成「距離第一個音幾秒」,跟題目的預期起音同一把尺
  const detected = detectOnsets(take.samples, take.sampleRate).map((time) => take.startedAt + time - firstNoteAt);
  window.__lastTake = { expected: expectedOnsets(score), detected }; // debugging hook for scripts/mic-check.js
  lastRhythmResult = {
    silent: detected.length === 0,
    ...scoreRhythm(expectedOnsets(score), detected, { tempoBpm: score.tempoBpm }),
  };
  renderRhythmResult();
}

function renderRhythmResult() {
  const r = lastRhythmResult;
  if (!r) return;
  const box = elements.alongResult;
  if (r.denied) {
    box.innerHTML = `<p>${escapeHtml(t('alongMicDenied'))}</p>`;
  } else if (r.silent) {
    box.innerHTML = `<p>${escapeHtml(t('resultSilent'))}</p>`;
  } else {
    const advice = r.score >= 90 ? 'resultGreat' : r.score >= 70 ? 'resultOk' : 'resultLow';
    const lag = Math.abs(r.offsetMs) >= 80
      ? `<p>${escapeHtml(t(r.offsetMs > 0 ? 'resultLate' : 'resultEarly', { ms: Math.abs(r.offsetMs) }))}</p>`
      : '';
    box.innerHTML = `<div class="big">${r.score}<small>${escapeHtml(t('resultTitle'))}</small></div>`
      + `<p>${escapeHtml(t('resultHits', { hits: r.hits, total: r.total, missed: r.missed, extra: r.extra, err: r.meanErrorMs, tol: r.toleranceMs }))}</p>`
      + lag
      + `<p>${escapeHtml(t(advice))}</p>`
      + `<p class="disclaimer">${escapeHtml(t('resultDisclaimer'))}</p>`;
  }
  box.hidden = false;
}

function resetAlongResult() {
  recorder.cancel();
  lastRhythmResult = null;
  elements.alongResult.hidden = true;
}

function stopFollowing() {
  cancelAnimationFrame(followFrame);
  followFrame = null;
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

/*
 * 練習紀錄:每次 30 秒準備跑完算「練了一題」,按日期存在本機。徽章顯示今天幾題、
 * 連續幾天(昨天或今天有練就不斷),跟其他練習 App 的每日目標一樣,給人回來練的理由。
 */
const PRACTICE_KEY = 'pianodrill.sight.practice.v1';
const dayKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
function readPractice() {
  try { return JSON.parse(readKey(PRACTICE_KEY) ?? '{}'); } catch { return {}; }
}
function recordPractice() {
  const days = readPractice();
  const key = dayKey(new Date());
  days[key] = (days[key] ?? 0) + 1;
  try { localStorage.setItem(PRACTICE_KEY, JSON.stringify(days)); } catch { /* 存不了就算了 */ }
  updateHistoryInfo();
  if (ctx) ctx.examChanged();
}
function practiceStats() {
  const days = readPractice();
  const today = days[dayKey(new Date())] ?? 0;
  const cursor = new Date();
  if (!today) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days[dayKey(cursor)]) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
  return { today, streak };
}

/* 練習紀錄卡:連續天數、今天做了幾題(30 秒準備做完算一題)、出過幾題(不重複出題的紀錄) */
function updateHistoryInfo() {
  const { today, streak } = practiceStats();
  $('logStreak').textContent = streak;
  $('logToday').textContent = today;
  $('logTotal').textContent = history.size;
  // 最近 7 天(跟技巧、聽音的練習紀錄一樣)
  const days = readPractice(), names = t('weekdays').split(','), now = new Date();
  let html = '';
  for (let i = 6; i >= 0; i -= 1) {
    const x = new Date(now); x.setDate(x.getDate() - i);
    html += `<span class="${i === 0 ? 'today' : ''}"><i class="${days[dayKey(x)] ? 'on' : ''}"></i>${names[x.getDay()]}</span>`;
  }
  $('logWeek').innerHTML = html;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
}
