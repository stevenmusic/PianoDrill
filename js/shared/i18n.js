/* 雙語(繁體中文 / English):跟 HarmonyHands、HarmonyMap 同一套做法——
   頂欄最右邊的語言按鈕(中文時顯示 EN、英文時顯示 中),選擇存在 localStorage,第一次一律英文(使用者要求)。
   靜態文字:HTML 上的 data-i18n="key"(文字)/ data-i18n-attr="aria-label:key,title:key";
   程式產生的文字:tr("中文", "English")。
   模組各自的字串用前綴分開:"tech.play"、"ear.play"(同一個字在不同模組意思不同),模組裡用 scoped("tech") 拿到只查自己那一組的 T。
   PianoDrill / DrumDrill 共用(tools/test/sync.mjs 檢查):@app 區段(LANG_KEY、OLD_KEYS、STR)以外兩邊一模一樣 */
// @app-begin
/* PianoDrill:技巧、聽音的字串在 js/tech/strings.js、js/ear/strings.js(前綴 tech.、ear.);視奏模組沿用自己的字典(js/sight/i18n.js),語言跟這裡同步 */
const LANG_KEY = "pianodrill-lang";
const OLD_KEYS = ["fingerdrill-lang", "eardrill-lang"];   // 同一個網域上的舊工具選過的語言,第一次打開沿用
// @app-end
let LANG = (() => {
  try {
    for (const k of [LANG_KEY, ...OLD_KEYS]) { const v = localStorage.getItem(k); if (v === "en" || v === "zh") return v; }
  } catch (e) {}
  return "en";   // 預設英文(使用者要求);切過語言就記住
})();
export const getLang = () => LANG;
export const tr = (zh, en) => LANG === "en" ? en : zh;

// @app-begin
const STR = {
  pageTitle: ["PianoDrill 鋼琴檢定特訓", "PianoDrill — piano exam trainer"],
  tagline: ["鋼琴檢定特訓", "Piano exam trainer"],
  themeToggleLabel: ["淺色模式", "Light mode"], themeToggleTitle: ["切換淺色/深色主題", "Switch light/dark theme"],
  langToggleText: ["EN", "中"], langToggleLabel: ["切換為英文", "Switch to Chinese"], langToggleTitle: ["切換語言", "Switch language"],
  tabTech: ["技巧", "Technique"], tabSight: ["視奏", "Sight-read"], tabEar: ["聽力", "Aural"], tabExam: ["檢定", "Exams"],
  lblSystem: ["考試系統", "Exam board"], lblGrade: ["級數", "Grade"],
  examSetupTitle: ["準備的考試", "Your exam"],
  examNone: ["還沒選考試", "No exam chosen"],
  examClear: ["不考試", "No exam"],
  licenses: ["授權與出處", "Licenses"],
  privacy: ["隱私權政策", "Privacy"],
  support: ["支援", "Support"],
  // 第一次打開 = 歡迎(主要「開始練習」= 自由練習);按「我在準備檢定」才展開系統 + 級數(標題換成 obTitle、說明換成 obSub、「開始練習」換成次要的 obNo)
  obWelcome: ["每天 10 分鐘，跟著彈就會", "10 minutes a day. Play along."],
  obWelcomeSub: ["App 一步一步帶你練技巧、視奏、聽力", "Technique, sight-reading and aural, step by step"],
  obStart: ["開始練習", "Start practicing"], obExam: ["我在準備檢定", "I'm preparing for an exam"],
  obTitle: ["你在準備鋼琴檢定嗎？", "Taking an exam?"],
  obSub: ["選好後會打開「檢定」分頁，技巧、視奏、聽力都照這一級練。", "Opens the Exams tab; technique, sight-reading and aural use this grade."],
  obYes: ["開始準備考試", "Start exam prep"], obNo: ["不考試，自由練習", "No exam — free practice"],
  obHint: ["不確定？先自由練習，之後再選", "Not sure? Practice freely, choose later"],
  examHelp: ["看檢定書封面或問老師；不考試可以直接用前三個分頁", "Check the exam book or ask your teacher — or just use the other tabs"],
  examInfo: ["考試內容", "Exam details"],   // 檢定頁最下面那張收起來的卡(出處、規格;畫面設計 2026-10)
  // 按了 ▶ 鋼琴聲音還沒載入好 / 載入失敗(技巧、視奏、聽力同一句,題目卡標題下面一行 .q-load;2026-11 第 4 輪健檢)
  loadWait: ["鋼琴聲音載入中，好了會自動播放", "Loading the piano — plays when ready"],
  loadOffline: ["現在沒有網路，連上網路後再按 ▶", "No internet — connect, then tap ▶"],
  loadFailed: ["鋼琴聲音沒有載入成功，再按一次 ▶ 試試", "The piano didn't load — tap ▶ to try again"]
};
/* wait = true:按了 ▶ 還在載入;false:載入失敗(沒有網路跟其他失敗分開說) */
export const loadMsg = wait => T(wait ? "loadWait" : typeof navigator !== "undefined" && navigator.onLine === false ? "loadOffline" : "loadFailed");
// @app-end
/* 模組的字串:addStrings("tech", { play: ["播放示範", "Play"] }) → "tech.play" */
export function addStrings(ns, dict){ for (const [k, v] of Object.entries(dict)) STR[ns + "." + k] = v; }
/* 今日練習(js/shared/dailycard.js;兩個 App 一樣):{n} 之類的位置由 dailycard 填 */
addStrings("daily", {
  title: ["今日練習", "Today"], about: ["約 {n} 分鐘", "About {n} min"],
  start: ["開始今天的練習", "Start today's practice"], resume: ["繼續今天的練習", "Continue today's practice"],
  next: ["下一段 ›", "Next part ›"], finish: ["結束今天 ›", "Finish ›"], left: ["剩約 {n}\u00a0分", "~{n}\u00a0min left"], timeUp: ["可以進下一段了", "Ready for the next"],
  of: ["第 {i} 段，共 {n} 段", "Part {i} of {n}"],
  warm: ["暖身", "Warm-up"], review: ["複習", "Review"], level: ["第 {n} 關", "Level {n}"], lvOf: ["{r} {n} / {of}", "{r} {n} / {of}"],
  tempo: ["速度", "Tempo"], tempoTip: ["速度 {b} = 每分鐘 {b} 拍", "Tempo {b} = {b} beats a minute"], pause: ["暫停", "Pause"],
  locked: ["{r}過了第 {n} 關就開始", "After {r} level {n}"],
  note: ["漏練幾天沒關係，不會扣分", "Missed days don't count against you"],
  steady: ["{w}下一次速度 {b}", "{w} Next: tempo {b}"], streak: ["{w}再連續 {k} 次就過關", "{w} {k} more in a row to pass"],
  near: ["差一點，速度不變", "Close. Same tempo"], go: ["按 ▶ 再{v}一次", "Tap ▶ again"], down: ["先慢一點：速度 {b}", "Slow down: tempo {b}"],
  passed: ["下一關：{name}", "Next level: {name}"], passedLast: ["這條路線練完了", "Route complete"], passedCont: ["接著練下一關", "Next level"], start1: ["按 ▶ 跟著{v}一輪", "Tap ▶ and play along"],
  // 底部固定的主要按鈕(dailycard 的 .daily-cta):還沒播 =「▶ 跟著彈 / 打一輪」(拍點模式「自己…一輪」)、播放中還沒播滿一輪 =「■ 停止」;英文在 390 一行
  ctaPlay: ["跟著{v}一輪", "Play along"], ctaSolo: ["自己{v}一輪", "Play it alone"], ctaStop: ["停止", "Stop"],
  back: ["回上一關", "Easier level"], suggest: ["要不要先回上一關暖身？", "Try the level before?"],
  welcome: ["歡迎回來，先從速度 {b} 開始。", "Welcome back. Start at tempo {b}."],
  welcomeCard: ["歡迎回來！先從慢一點的速度開始", "Welcome back! Starting slower."],   // 今日卡開始前 / 暫停(隔 7 天以上回來那天)
  streakTag: ["穩 {d}", "Steady {d}"],
  warmHint: ["跟著{v} 1–2 分鐘就換下一段", "Play along 1–2 min, then next part"],
  revOk: ["複習穩了 ✓ 下次間隔更久", "Review steady ✓ Next one later"], revBack: ["明天再複習一次", "Review again tomorrow"],
  revExtra: ["加練（不改複習日期）", "Extra (reviews unchanged)"],
  vary: ["這次：{v}", "This time: {v}"], fast: ["比目標快一點：速度 {b}", "a bit above goal: tempo {b}"], selfCount: ["其他拍自己數", "count the other beats"], selfGap: ["沒拍點時自己數", "keep counting in the gap"], checkMore: ["還有 {n} 項", "+{n} more"], check: ["重點：{list}", "Check: {list}"], checkTitle: ["重點", "Check"],
  click_two_four: ["拍點只在第 2、4 拍響", "click on beats 2 & 4 only"], click_one_three: ["拍點只在第 1、3 拍響", "click on beats 1 & 3 only"],
  click_one: ["拍點只在第 1 拍響", "click on beat 1 only"], click_gap: ["拍點中途消失 2 小節", "click drops out for 2 bars"],
  // 練完了那一行:{s} = parts / part1(英文單複數)、{t} = 分鐘或秒(不到 1 分鐘寫秒,不進位成 1 分鐘)、{p} = passedN(0 關不寫);一段都沒練 = none
  done: ["練完 {s} · {t}{p}。今天到這裡就好", "Done: {s} · {t}{p}. That's enough for today"], doneShort: ["練完 {s} · {t}{p}", "Done: {s} · {t}{p}"], passedN: [" · 過了 {n} 關", " · {n} passed"],
  parts: ["{n} 段", "{n} parts"], part1: ["{n} 段", "{n} part"], min: ["{n} 分鐘", "{n} min"], sec: ["{n} 秒", "{n} s"],
  none: ["今天還沒練到", "Nothing practiced today"],
  // 沒過關但速度有升(升最多的那一關;{a} 今天第一次、{b} 今天最快、{t} 目標):不寫「還差幾格」
  climb: ["今天速度 {a} → {b}，離目標 {t} 再加油", "Tempo today {a} → {b} — keep going toward {t}"], climbTop: ["今天速度 {a} → {b}，到目標速度了！", "Tempo today {a} → {b} — target tempo reached!"],
  week: ["最近 7 天練了 {d} 天", "Practiced {d} of the last 7 days"], tomorrow: ["明天：{list}", "Tomorrow: {list}"],
  tomLv: ["{r}「{name}」", "{r} “{name}”"], tomRev: ["複習「{name}」", "Review “{name}”"],   // 明天那一行的每一項(路線 + 關名;複習哪一關)
  opened: ["新路線開放了：{r}！", "New route unlocked: {r}!"],
  more: ["再練一下", "Practice a bit more"],
  // 路線圖(今日卡的「路線」鈕,在卡內往下展開;js/shared/roadmap.js):組名沒有資料時寫 roadG;每一組「3 / 6」的讀法 roadCount;每一關、每一組的狀態 road_*(圖示的名稱)
  road: ["路線", "Route"], roadG: ["{g} 組", "Group {g}"], roadCount: ["過了 {a} / {n} 關", "{a} of {n} passed"],
  road_pass: ["過了", "Passed"], road_cur: ["正在練", "Now"], road_todo: ["還沒練", "Not yet"], road_lock: ["還沒開放", "Locked"], roadNow: ["現在", "Now"],
  // 過關慶祝(js/shared/celebrate.js;題目卡標籤列換成一條橫幅「過關 ✓ 關名」,約 1.6 秒;cheer = 找不到關名時)
  cheer: ["過關 ✓", "Passed ✓"], cheerLv: ["過關 ✓ {name}", "Passed ✓ {name}"]
});
/* 練習紀錄備份(頁尾「備份紀錄」;js/shared/backup.js + main.js 共用部分;兩個 App 一樣):{f} = 檔名;err_* = backup.js 的錯誤代碼 */
addStrings("bak", {
  link: ["備份紀錄", "Backup"],
  why: ["換手機或清除資料前先存一份", "Save a copy before you change phones or clear data"],
  save: ["存成檔案", "Save to file"], load: ["從檔案還原", "Restore from file"],
  file: ["紀錄", "backup"],
  saved: ["存好了：{f}", "Saved: {f}"],
  confirm: ["會用檔案裡的紀錄取代這台裝置現在的紀錄，確定嗎？", "This will replace the practice history on this device with the one in the file. Continue?"],
  err_notfile: ["這不是備份檔，請選「存成檔案」存下來的那個檔", "That isn't a backup file. Pick the file you saved with “Save to file”."],
  err_otherapp: ["這是別的 App 的備份檔，不能還原到這裡", "That backup is from a different app."],
  err_newer: ["這個檔是新版 App 存的，請先更新 App", "That file is from a newer version. Please update the app first."],
  err_damaged: ["這個檔壞掉了，沒辦法還原", "That file is damaged and can't be restored."],
  err_toolarge: ["檔案太大，不是備份檔", "That file is too big to be a backup."],
  err_write: ["存不進去（裝置空間可能不夠），原本的紀錄沒有動", "Couldn't restore (the device may be full). Your history is unchanged."],
  err_save: ["沒有存成功，請再試一次", "Couldn't save. Please try again."]
});
/* 本週摘要(頁尾「分享本週摘要」;內文在 js/shared/digest.js(純函式,自己帶中英);兩個 App 一樣):分享不了就複製,旁邊寫「已複製」2 秒 */
/* localStorage 不能寫(私密瀏覽、空間滿;main.js 共用部分啟動時試寫一次):頁尾最上面一行淡字,能寫就不出現(兩個 App 一樣) */
addStrings("store", {
  nosave: ["這個瀏覽器不能存紀錄（可能是私密瀏覽），關掉就不見", "This browser can't save your progress (private mode?) — it's gone when you close it"]
});
addStrings("digest", {
  link: ["分享本週摘要", "Share this week"],
  copied: ["已複製", "Copied"], fail: ["沒辦法分享", "Couldn't share"]
});
export const T = key => (STR[key] ? STR[key][LANG === "en" ? 1 : 0] : key);
export const scoped = ns => key => (STR[ns + "." + key] ? T(ns + "." + key) : T(key));

/* 語言改變時要重畫的東西(各模組登記) */
const listeners = [];
export const onLang = fn => listeners.push(fn);

/* 段落文字:兩種語言的行數不一定一樣,所以量兩種語言的高度,保留比較高的(min-height),
   切換語言時版面完全不動。寬度改變(旋轉、視窗縮放、從隱藏變顯示)時重量 */
const RO = typeof ResizeObserver !== "undefined" ? new ResizeObserver(es => es.forEach(e => equalize(e.target))) : null;
let lastW = new WeakMap();
function equalize(el){
  if (el._eq || !el._pair || !el.offsetWidth) return;
  const w = el.offsetWidth;
  if (lastW.get(el) === w && el.style.minHeight && el._pairDone === el._pair) return;
  el._eq = true;
  const cur = el.textContent;
  el.style.minHeight = "";
  const h1 = el.getBoundingClientRect().height;
  el.textContent = el._pair[LANG === "en" ? 0 : 1];
  const h2 = el.getBoundingClientRect().height;
  el.textContent = cur;
  el.style.minHeight = Math.ceil(Math.max(h1, h2)) + "px";
  lastW.set(el, w); el._pairDone = el._pair;
  el._eq = false;
}
/* 字型載好(或載入失敗改用備用字型)之後字寬會變:成對的段落全部重量一次 */
const paired = new Set();
const reEqualize = () => { for (const el of paired) { if (!el.isConnected) { paired.delete(el); continue; } lastW.delete(el); equalize(el); } };
if (typeof document !== "undefined" && document.fonts) {
  document.fonts.ready.then(reEqualize);
  document.fonts.addEventListener?.("loadingdone", reEqualize);
  document.fonts.addEventListener?.("loadingerror", reEqualize);
}
/* 設定段落文字:fn 會用中文、英文各跑一次(裡面用 tr) */
export function pairText(el, fn){
  const keep = LANG;
  LANG = "zh"; const zh = fn(); LANG = "en"; const en = fn(); LANG = keep;
  el.textContent = LANG === "en" ? en : zh;
  el._pair = [zh, en];
  if (RO && !el._observed) { RO.observe(el); el._observed = true; }
  paired.add(el);
  equalize(el);
}
export function unpair(el){ el._pair = null; el.style.minHeight = ""; }
export function applyStatic(root = document){
  if (root === document) { document.documentElement.lang = LANG === "en" ? "en" : "zh-Hant"; document.title = T("pageTitle"); }
  root.querySelectorAll("[data-i18n]").forEach(el => {
    if (el.hasAttribute("data-i18n-pair")) { const k = el.dataset.i18n; pairText(el, () => T(k)); }
    else el.textContent = T(el.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-attr]").forEach(el => {
    for (const pair of el.dataset.i18nAttr.split(",")) { const [a, k] = pair.split(":"); el.setAttribute(a, T(k)); }
  });
  const btn = document.getElementById("langToggle");
  if (btn) btn.setAttribute("aria-pressed", String(LANG === "en"));
}
export function setLang(lang){
  LANG = lang;
  try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
  applyStatic();
  for (const fn of listeners) { try { fn(lang); } catch (e) { console.error(e); } }
}
