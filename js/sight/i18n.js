/**
 * Two-language dictionary + tiny apply/lookup helpers, shared shape with
 * ScrollScore/HarmonyMap/LoudMaster's own i18n modules.
 *
 * `sm_lang` is a deliberately shared localStorage key — all four sibling
 * tools and the hub live on the same origin (stevenmusic.github.io/<tool>/),
 * so a language chosen in one carries over to the others. Default is "zh"
 * (this app's original language) whenever nothing is stored yet; there is no
 * browser-language auto-detection.
 *
 * Two kinds of markup consume this:
 *  - `data-i18n="key"` on an element sets its textContent to `t(key)`.
 *  - `data-i18n-attr="attr1:key1,attr2:key2"` sets one or more attributes
 *    (aria-label, title, ...) from their own keys.
 * `applyLanguage()` walks both, then updates `<html lang>` and notifies
 * anything that registered via `onLanguageChange` — used by app.js to
 * re-render the text it builds itself (status messages, select options,
 * the checklist, ...) that no static attribute can reach.
 */

import { getLang } from '../shared/i18n.js';

export const I18N = {
  zh: {
    gradeN: '{n} 級',
    logTitle: '練習紀錄',
    logStreak: '連續天數',
    logToday: '今天題數',
    logTotal: '出過的題目',
    examReady: '按「產生新題目」開始',
    examNotYet: '這一級還沒有視奏題目',
    unsupportedTrinity: 'Trinity 的視奏還沒有出題規則:目前的規則是照 ABRSM 官方視奏範例(1–8 級)整理的,Trinity 的要求不同,不拿來充數。想練看譜可以先用「視奏」分頁自由練習 ABRSM 的題目。',
    unsupportedInitial: 'ABRSM 初級的視奏還沒有出題規則(目前只照官方範例做了 1–8 級)。可以先用「視奏」分頁練 1 級。',
    pageTitle: 'SightDrill — 視奏隨機題目生成器',
    homeAria: '回首頁',
    homeText: '首頁',
    contactLabel: '問題回報：',
    generateLabel: '產生新題目',
    prepareLabel: '開始 30 秒準備',
    playAriaPlay: '播放',
    playTitlePlay: '播放正確版本',
    playAriaStop: '停止',
    playTitleStop: '停止播放',
    stopAria: '停止',
    stopTitle: '停止並回到開頭',
    gradeLabel: '級數',
    keyLabel: '調性',
    randomKey: '隨機調性',
    majorKey: '{tonic} 大調',
    minorKey: '{tonic} 小調',
    // Same content as majorKey/minorKey — the meta strip's fixed-width
    // field doesn't need a separate compact form in Chinese the way English
    // does (see the `en` block below).
    metaKeyMajor: '{tonic} 大調',
    metaKeyMinor: '{tonic} 小調',
    barsSuffix: '{count} 小節',
    countdownUnit: '秒',
    clearHistory: '清除出題紀錄',
    themeToggleAria: '切換淺色/深色主題',
    themeToggleTitle: '切換淺色/深色主題',
    langToggleLabel: 'EN',
    langToggleAria: '切換為英文介面',
    langToggleTitle: '切換為英文介面',

    loadingOSMD: '找不到樂譜渲染函式庫 OSMD（vendor/opensheetmusicdisplay.min.js 未載入）。'
      + '請確認該檔案存在，並透過 http 開啟頁面（直接以 file:// 開啟不會運作）',
    failLoadRules: '無法載入規則表',
    failInitRenderer: '無法初始化樂譜渲染器',
    errorGeneric: '發生錯誤',
    errorDetail: '{text}（{detail}）',
    renderingStatus: '渲染中…',
    readyStatus: '流程:①「開始 30 秒準備」看譜 → ②時間到,自己彈一遍 → ③按 ▶ 聽正確版本比對。想換題按「產生新題目」。',
    failRender: '渲染失敗',
    givingPitch: '給音中……',
    prepFitsScreen: '準備時間：整份樂譜已經在畫面上，時間到會提示開始。',
    prepScrolls: '準備時間：可上下捲動看完整份樂譜，時間到會提示開始。',
    alongMic: '用麥克風評分節奏(選用)',
    alongMicNote: '只看起音的時間,不判斷音高;聲音只在這台裝置上分析,不會上傳。',
    alongMicDenied: '沒有取得麥克風權限,這次不評分。到瀏覽器/系統設定允許麥克風後再試。',
    alongListening: '預備……請開始彈;播放軸會帶你走,彈完自動評分。',
    resultTitle: '節奏分數',
    resultHits: '命中 {hits}/{total}・漏掉 {missed}・多彈 {extra}・平均誤差 {err} 毫秒(容許 {tol} 毫秒)',
    resultLate: '整體比播放軸慢約 {ms} 毫秒(可能是裝置延遲或習慣晚半拍;已先扣掉再評分)。',
    resultEarly: '整體比播放軸快約 {ms} 毫秒(可能是裝置延遲或搶拍;已先扣掉再評分)。',
    resultSilent: '沒有聽到琴聲——把裝置放近琴、音量調高、環境安靜些,再試一次。',
    resultGreat: '節奏很穩,可以加快一點點速度再練。',
    resultOk: '大致跟上了。看看漏掉的地方,放慢一點再彈一次。',
    resultLow: '先放慢速度、分手練,穩了再合起來。',
    resultDisclaimer: '僅供練習參考,不是官方評分;只評節奏(起音時間),不評音高。',
    playAlong: '開始彈奏(播放軸帶你走)',
    playAlongStop: '停止彈奏',
    alongCountIn: '預備……{n}',
    alongPlaying: '彈奏中——播放軸照速度自己走、自動換行,不用點螢幕。',
    alongDone: '完成!按 ▶ 聽正確版本比對。',
    prepDone: '時間到——不要停、不要回頭改，彈完再按播放比對。',
    playingStatus: '播放中——目前小節以色塊標示，同時顯示下一行。',
    failPlayback: '播放失敗',
    historyCount: '已紀錄{count}題',
    practiceStats: '今日 {today} 題・連續 {streak} 天',
    confidencePartial: '此級數部分參數為推估值',
    confidenceInferred: '此級數參數為推估值，尚待官方大綱核對',
    loadingSamples: '載入鋼琴音色中…',
    samplesFailed: '鋼琴音色載入失敗，暫用備援音色',

    prepStep1: '調號 — 幾個升降記號？主音在哪？',
    prepStep2: '拍號 — 幾拍子？複拍子用大拍感覺（6/8 是兩大拍）',
    prepStep3: '速度術語 — 決定起頭速度',
    prepStep4: '把位 — 兩手從哪裡開始，中途換不換',
    prepStep5: '掃描難點 — 臨時記號、最密的一小節、最大的跳進',
    prepStep6: '用最難的那一小節決定速度，然後心裡數一小節',
  },
  en: {
    gradeN: 'Grade {n}',
    logTitle: 'Practice log',
    logStreak: 'Day streak',
    logToday: 'Today',
    logTotal: 'Tests seen',
    examReady: 'Tap New test to start',
    examNotYet: 'No sight-reading tests for this grade yet',
    unsupportedTrinity: "Trinity sight-reading isn't covered yet: the rules here are modelled on ABRSM's official specimen tests (Grades 1–8), and Trinity's requirements differ, so we don't fake them. For reading practice, use the Sight-read tab with ABRSM tests.",
    unsupportedInitial: "ABRSM Initial sight-reading isn't covered yet (only Grades 1–8 so far, modelled on the official specimens). Try Grade 1 in the Sight-read tab.",
    pageTitle: 'SightDrill — Sight-Reading Test Generator',
    homeAria: 'Back to home',
    homeText: 'Home',
    contactLabel: 'Feedback: ',
    generateLabel: 'New test',
    prepareLabel: '30s prep',
    playAriaPlay: 'Play',
    playTitlePlay: 'Play reference',
    playAriaStop: 'Stop',
    playTitleStop: 'Stop playback',
    stopAria: 'Stop',
    stopTitle: 'Stop and return to start',
    gradeLabel: 'Grade',
    keyLabel: 'Key',
    randomKey: 'Random key',
    majorKey: '{tonic} major',
    minorKey: '{tonic} minor',
    // Tighter than majorKey/minorKey above: `.meta-key` is a fixed-width
    // field (sized for Chinese's "Gb 大調") and the full word "major"/
    // "minor" routinely overflowed it — "maj"/"min" reads fine at this
    // field's own compact, label-free style (see showMeta in app.js).
    metaKeyMajor: '{tonic} maj',
    metaKeyMinor: '{tonic} min',
    barsSuffix: '{count} bars',
    countdownUnit: 's',
    clearHistory: 'Clear history',
    themeToggleAria: 'Switch light/dark theme',
    themeToggleTitle: 'Switch light/dark theme',
    langToggleLabel: '中',
    langToggleAria: 'Switch to Chinese interface',
    langToggleTitle: 'Switch to Chinese interface',

    loadingOSMD: 'Could not find the OSMD score-rendering library '
      + '(vendor/opensheetmusicdisplay.min.js did not load). Make sure that file '
      + "exists and open this page over http (opening it directly as file:// won't work)",
    failLoadRules: 'Could not load the rules table',
    failInitRenderer: 'Could not initialise the score renderer',
    errorGeneric: 'Something went wrong',
    errorDetail: '{text} ({detail})',
    renderingStatus: 'Rendering…',
    readyStatus: 'Steps: 1) "30s prep" and study the score → 2) when time is up, play it → 3) press ▶ to hear the model. New test: "New test".',
    failRender: 'Render failed',
    givingPitch: 'Playing starting pitch…',
    prepFitsScreen: "Prep time: the whole score is on screen — you'll be prompted when time is up.",
    prepScrolls: "Prep time: scroll to see the whole score — you'll be prompted when time is up.",
    alongMic: 'Score my rhythm with the microphone (optional)',
    alongMicNote: 'Only note start times are checked, not pitch; audio is analysed on this device and never uploaded.',
    alongMicDenied: 'Microphone access was not granted, so this take is not scored. Allow it in browser/system settings and try again.',
    alongListening: 'Get ready… start playing; the playhead guides you and scores when you finish.',
    resultTitle: 'Rhythm score',
    resultHits: 'Hit {hits}/{total} · missed {missed} · extra {extra} · mean error {err} ms (tolerance {tol} ms)',
    resultLate: 'You were about {ms} ms behind the playhead overall (device latency or a late habit; removed before scoring).',
    resultEarly: 'You were about {ms} ms ahead of the playhead overall (device latency or rushing; removed before scoring).',
    resultSilent: 'No piano heard — put the device closer, raise the volume, and try somewhere quieter.',
    resultGreat: 'Very steady. Try a slightly faster tempo next.',
    resultOk: 'Mostly with it. Look at where you missed and play it again a little slower.',
    resultLow: 'Slow down and practise hands separately first, then put them together.',
    resultDisclaimer: 'For practice only, not an official mark; rhythm (note start times) only, not pitch.',
    playAlong: 'Start playing (playhead guides you)',
    playAlongStop: 'Stop',
    alongCountIn: 'Get ready… {n}',
    alongPlaying: 'Playing — the playhead follows the tempo and scrolls by itself; no tapping needed.',
    alongDone: 'Done! Press ▶ to hear the model and compare.',
    prepDone: "Time's up — keep going, don't go back to fix mistakes; compare with playback once you're done.",
    playingStatus: 'Playing — the current bar is highlighted and the next line shown.',
    failPlayback: 'Playback failed',
    historyCount: '{count} recorded',
    practiceStats: 'Today {today} · {streak}-day streak',
    confidencePartial: 'Some parameters for this grade are estimated',
    confidenceInferred: 'Parameters for this grade are inferred, pending verification against the official syllabus',
    loadingSamples: 'Loading piano samples…',
    samplesFailed: 'Piano samples failed to load, using a fallback sound',

    prepStep1: 'Key signature — how many sharps/flats? Where is the tonic?',
    prepStep2: 'Time signature — how many beats? Feel compound time in big beats (6/8 is two)',
    prepStep3: 'Tempo marking — set your starting speed',
    prepStep4: 'Hand position — where do both hands start, and does it change',
    prepStep5: 'Scan for hazards — accidentals, the densest bar, the biggest leap',
    prepStep6: 'Set the tempo from the hardest bar, then count yourself in',
  },
};

/** 語言跟外框同一個(js/shared/i18n.js 的 getLang);這個檔只放視奏模組自己的字典 */
export function getLanguage() {
  return getLang();
}

/** Look up `key` in the active dictionary (falling back to zh, then the key
 * itself), substituting any `{name}` placeholders from `params`. */
export function t(key, params) {
  const dict = I18N[getLang()] ?? I18N.zh;
  let str = dict[key] ?? I18N.zh[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      str = str.replaceAll(`{${name}}`, String(value));
    }
  }
  return str;
}

/** 視奏模組裡的靜態文字:data-si18n="key"(文字)/ data-si18n-attr="aria-label:key,title:key"
 *(跟外框的 data-i18n 分開,兩邊的字典不同) */
export function applySightStatic(root = document.getElementById('mod-sight')) {
  if (!root) return;
  root.querySelectorAll('[data-si18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-si18n'));
  });
  root.querySelectorAll('[data-si18n-attr]').forEach((el) => {
    for (const pair of el.getAttribute('data-si18n-attr').split(',')) {
      const [attr, key] = pair.split(':').map((part) => part.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  });
}
