/* 今日練習的卡片與段落面板(PianoDrill / DrumDrill 共用,兩邊逐位元組相同;tools/test/sync.json same)。引擎在 js/shared/daily.js。
   不寫死前綴:用模組自己的 $ —— $("dailyCard")(卡片,放在 .mod-main 最上面)、$("dailyStep")(段落面板,放在題目卡裡)。
   卡片三種狀態:
   - 還沒開始 / 暫停:標題「今日練習 · 約 n 分鐘」、一段一行(<ol>,做完的打勾)、還沒開放的路線一行淡字、大按鈕「開始 / 繼續今天的練習」;
     第一次才有一行「漏練幾天沒關係,不會扣分」
   - 進行中(模組正在顯示這一段):縮成一行「今日練習 2/4 ●●○○ 剩約 7 分 [暫停] [下一段 ›]」;有 barHost(外框的 ctx.subBar)時這一行放在子項目列的位置(子項目列藏起來、卡片藏起來)
   - 練完了:今天練了幾段、幾分鐘、過了幾關(0 關不寫;沒過關但速度有升 = 一句「今天速度 60 → 72,離目標 100 再加油」,升最多的那一關)、最近 7 天練了幾天、新路線開放了(開放那一天)、明天練什麼、里程碑稱讚(milestone.js;一天最多一句,有練到才算)+ 次要按鈕「再練一下」(可以一直按)
   段落面板:狀態 / 下一步一句、為什麼練這個(路線的 why[組]:這一組第一關第一次出現時一句,看過的組記在 daily 的 why)、這次的變化(複習)、重點(關卡的 check;過關、複習完藏起來)、[回上一關](文字鈕,只在同一速度連續不穩 = seg().suggest 時)…[再練][穩了 ✓](各 App 的字)或 [下一段 ›];
   「穩了 / 做到了」要先用現在的速度播過一輪才能按(App 呼叫 ready(true);沒播之前不出現,不算嘗試)
   按鈕列 = 固定在畫面底部的一條(.daily-cta;2026-11 使用者選定,像 Duolingo):位置永遠不變、每一步只換字 ——
   「▶ 跟著彈 / 打一輪」(onPlay)→ 播放中還沒播滿一輪「■ 停止」→ 播過一輪「✓ 做到了 / 穩了」+ 左邊次要「還要練」→ 過關沒接下一關、複習完、暖身「下一段 ›」(最後一段「結束今天 ›」);
   App 開始 / 停止播放時呼叫 playing(true / false)
   文字都用 i18n 的 daily.*(兩個 App 一樣)+ 模組傳進來的 labels(穩了 / 做到了…);段落文字用 pairText(中英一樣高) */
import { tr, T, pairText } from "./i18n.js";
import { streak } from "./practicelog.js";
import { pick as pickMs, byId as msById } from "./milestone.js";

const fmt = (key, o = {}) => T("daily." + key).replace(/\{(\w+)\}/g, (_, k) => (o[k] != null ? o[k] : ""));
const L2 = v => (Array.isArray(v) ? tr(v[0], v[1]) : v == null ? "" : String(v));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ICON_PLAY = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>';
const ICON_PAUSE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>';
const ICON_OK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
const ICON_STOP = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>';

/* 拍點模式的名稱(daily.js 的 CLICK_MODES) */
export const clickName = mode => (mode && mode !== "every" ? fmt("click_" + mode.replace("-", "_")) : "");
/* 這一段的名稱:暖身 / 路線名 / 複習 */
export const segKind = s => (s.k === "warm" ? fmt("warm") : s.k === "review" ? fmt("review") : L2(s.level.route.name));
/* 複習的變化:「拍點只響 2、4 拍」「斷奏」「最快 ♩=88」… */
export function varyText(s){
  if (!s || s.k !== "review" || !s.vary) return "";
  const parts = [];
  if (s.vary.name) parts.push(L2(s.vary.name));
  if (s.vary.click) parts.push(clickName(s.vary.click));
  if (s.vary.fast) parts.push(fmt("fast", { b: s.bpm }));
  return parts.filter(Boolean).join(" · ");
}
/* 題目卡的標籤(HTML):[律動 3 / 28 + 細進度條] [速度 68 → 90](學)/ [律動 3 / 28] [速度 90] [穩 0 / 3](到了目標速度:連續穩幾次)/ [複習 · 律動 2 / 28] [速度 90](複習)。
   m = 這一段速度的寫法(12/8 的「♩.=」寫在數字前面;一般的只寫數字) */
export function segTags(s, m = "♩="){
  if (!s || s.k === "warm") return s ? [fmt("warm")] : [];
  const L = s.level, pct = Math.round((L.n - 1) / L.of * 100);
  const lv = esc(fmt("lvOf", { r: L2(L.route.name), n: L.n, of: L.of })) + `<i class="lv-bar" aria-hidden="true"><b style="width:${pct}%"></b></i>`;
  const sp = b => fmt("tempo") + " " + (m === "♩=" ? "" : m) + b;
  if (s.k === "review") return [esc(fmt("review")) + " · " + lv, sp(s.bpm)];
  if (s.bpm < s.target) return [lv, `${sp(s.bpm)} → ${s.target}`];
  // 到了目標速度:「穩 0 / 3」併進速度那一格(「速度 80 · 穩 0 / 3」),標籤一行放得下
  const need = s.need || 3, k = Math.min(need, s.streak || 0);
  return [lv, sp(s.bpm) + " · " + fmt("streakTag", { d: `${k} / ${need}` })];
}
/* 一次嘗試的結果 → 狀態那一句;過關寫「下一關:名稱」(next = 下一關的名稱 [中, 英],最後一關 = null;good = 「很穩!」/「很好!」) */
export function resultText(res, s, next = null, good = "很穩!"){
  if (!res) return "";
  if (s.k === "review") return res.counted === false && s.extra ? fmt("revExtra") : res.verdict === "steady" ? fmt("revOk") : fmt("revBack");
  if (res.passed) return next ? fmt("passed", { name: L2(next) }) : fmt("passedLast");
  let t = res.verdict === "steady" ? (res.nextBpm > s.bpm ? fmt("steady", { w: good, b: res.nextBpm }) : fmt("streak", { w: good, k: Math.max(1, res.need - res.streak) }))
    : res.nextBpm < s.bpm ? fmt("down", { b: res.nextBpm }) : fmt("near");
  if (res.suggestBack) t += " " + fmt("suggest");
  return t;
}

/* createDailyCard({ $, daily, labels, warmName, levelName, log, onStart, onNext, onPause, onMore, onOk, onAgain, onBack, onPlay, announce, acts, mark, barHost })
   - labels = { ok: [中, 英], again: [中, 英], hint: [中, 英](學的時候的下一步), solo: [中, 英](只有拍點的時候), verb: [中, 英](暖身提示的動詞:打 / 彈),
     good: [中, 英](穩了的稱讚:鼓「很穩!」、琴「很好!」), wait: [中, 英](「穩了 / 做到了」還不能按時按鈕的 title;沒給就用 hint),
     play: [中, 英](底部按鈕「▶ …一輪」的字,App 可以換;沒給 = daily.ctaPlay / 拍點模式 daily.ctaSolo,動詞照 verb) }
   - onPlay() → 底部按鈕的「▶ …一輪 / ■ 停止」(App 的播放 / 停止,跟題目卡的圓形 ▶ 同一個);沒給 = 底部按鈕照舊只有「做到了」(還不能按時 disabled)
   - warmName(item) → [中, 英]:暖身項目的名稱(各 App 自己寫)
   - log() → 模組的練習紀錄(最近 7 天練了幾天)
   - mark(s) → 這一段速度的寫法(預設「♩=」;DrumDrill 12/8 的關「♩.=」):標籤、狀態、結果的速度都照這個寫
   - levelName(s) → 關卡顯示的名稱 [中, 英](預設 s.level.name;鋼琴伴奏的關寫實際和弦,換調複習跟著換)
   - barHost(el | null) → 進行中那一行放到外框的子項目列(main.js 的 ctx.subBar);沒給就留在卡片裡
   - acts = { left(s, o), right(s, o), primary(s, o, st) } → App 自己額外的按鈕:left(元素陣列)放在底部按鈕列左邊(次要,例如 DrumDrill 的「沒有鼓?」)、right(元素陣列)放在最右邊;
     primary → 一個元素或 null:取代底部的主要按鈕(例如 DrumDrill 手機鼓墊模式的「打一遍」;st = { ready, playing, done, warm },狀態一變就重新問);
     元素由 App 建立、一直留在文件裡:這一次沒用到的(或面板收起來時)放在面板裡藏起來的 .daily-park,App 用 id 找得到 */
export function createDailyCard({ $, daily, labels = {}, warmName = () => "", levelName = s => s.level.name, log = () => ({}), onStart, onNext, onPause, onMore, onOk, onAgain, onBack, onPlay = null, announce = () => {}, acts = {}, mark = () => "♩=", barHost = null }){
  const M = (s, t) => { const m = s ? mark(s) : "♩="; return m === "♩=" || !t ? t : String(t).replace(/♩=/g, m); };
  const card = $("dailyCard"), step = $("dailyStep");
  const park = document.createElement("div"); park.className = "daily-park"; park.hidden = true;
  /* 底部按鈕列(.daily-cta,固定在畫面底部):[App 的 left][還要練][主要按鈕][App 的 right]。
     按鈕元素一段裡一直是同一顆(只換字、換樣子):鍵盤焦點不會掉;App 的按鈕先全部收進 park,再把這一次要的放進來 */
  function paintActs(){
    const row = step.querySelector(".daily-cta"); if (!row) return;
    row.querySelectorAll("[data-app-act]").forEach(el => park.appendChild(el));
    if (!park.isConnected) step.appendChild(park);
    const s = lastSeg; if (!s) return;
    const o = lastOpts, warm = s.k === "warm", done = !!o.passedDone;
    const again = row.querySelector(".daily-again"), main = row.querySelector(".daily-main");
    // 這一步:next = 下一段 / 結束今天(暖身、過關沒接下一關、複習完);ok = 做到了(播過一輪);stop = 播放中還沒播滿一輪;play = ▶ …一輪
    const mode = warm || done ? "next" : okReady || !onPlay ? "ok" : playing ? "stop" : "play";
    panelNext = mode === "next";
    const app = acts.primary ? acts.primary(s, o, { ready: okReady, playing, done, warm }) : null;
    for (const el of (acts.left ? acts.left(s, o) : []) || []) { el.dataset.appAct = "1"; row.insertBefore(el, again); }
    again.hidden = mode !== "ok" || !okReady;   // 「還要練」也要先播過一輪(沒彈就按 = 不算一次;下一步只有一個)
    if (app) { app.dataset.appAct = "1"; row.insertBefore(app, main); main.hidden = true; }
    else {
      main.hidden = false;
      const lbl = mode === "next" ? fmt(isLast() ? "finish" : "next") : mode === "ok" ? L2(labels.ok) : mode === "stop" ? fmt("ctaStop")
        : labels.play ? L2(labels.play) : fmt(s.click && s.click !== "every" ? "ctaSolo" : "ctaPlay", { v: L2(labels.verb || ["彈", "play"]) });   // 拍點模式:「自己彈一輪」
      const icon = mode === "ok" ? ICON_OK : mode === "stop" ? ICON_STOP : mode === "play" ? ICON_PLAY : "";
      main.className = "btn daily-main daily-" + mode + (mode === "stop" ? "" : " primary");   // 停止 = 次要的樣子(同一個位置);其他 = 主要(金底)
      if (main.dataset.mode !== mode) main._at = performance.now();   // 剛換字:這一下之後 0.7 秒內再按不算(連點兩下不會「做到了」之後直接跳段 / 開始播)
      main.dataset.mode = mode;
      main.innerHTML = icon + `<span class="btn-label">${esc(lbl)}</span>`;
      main.disabled = mode === "ok" && !okReady;
      if (main.disabled) { main.title = L2(labels.wait || labels.hint || ["", ""]); main.setAttribute("aria-describedby", `${step.id}-status`); }
      else { main.removeAttribute("title"); main.removeAttribute("aria-describedby"); }
    }
    for (const el of (acts.right ? acts.right(s, o) : []) || []) { el.dataset.appAct = "1"; row.appendChild(el); }
    syncNext();
  }
  const tid = card.id + "-title";
  card.setAttribute("role", "region"); card.setAttribute("aria-labelledby", tid);
  let showing = false, lastStatus = null, lastOpts = {}, okReady = true, whyCur = null, panelNext = false, lastBar = null, lastSeg = null, playing = false;
  /* 底部按鈕是「下一段 ›」(暖身、過關、複習完)時,進度那一行的「下一段 ›」藏起來(同一畫面不放兩顆) */
  const syncNext = () => { const b = lastBar && lastBar.querySelector(".daily-next"); if (b) b.hidden = panelNext && !step.hidden; };
  /* 為什麼練這個:路線的 why[組](每組一句);只在這一組的第一關、第一次出現的那一段(同一段重畫、換語言照樣顯示;複習、暖身不寫) */
  function whyOf(s){
    const L = s && s.k === "route" ? s.level : null, R = L && L.route, txt = R && R.why && R.why[L.g];
    if (!txt || !R.levels.length || R.levels.find(l => l.g === L.g).id !== L.id) return null;
    const key = R.id + "/" + L.g, at = `${daily.today().date}/${s.i}/${key}`;
    if (whyCur !== at) { if (daily.whySeen(key)) return null; whyCur = at; daily.markWhy(key); }
    return txt;
  }
  const isLast = () => { const t = daily.today(); return t.i >= t.plan.length - 1; };   // 最後一段:「結束今天 ›」
  const segText = s => (s.k === "warm" ? L2(warmName(s.item)) : `${fmt("level", { n: s.level.n })} · ${L2(levelName(s))}`);

  function render(){
    const st = daily.state(), run = showing && st === "run";
    card.hidden = !!(run && barHost);
    card.classList.toggle("daily-run", run);
    card.classList.toggle("daily-done", st === "done");
    if (barHost && !run) barHost(null);
    if (run) return renderBar();
    if (st === "done") return renderDone();
    renderList(st);
  }
  /* 還沒開始 / 暫停 */
  function renderList(st){
    const t = daily.today(), plan = daily.plan();
    const items = plan.map((p, i) => {
      const s = p.k === "warm" ? p : { ...p, level: daily.levelOf(p.r, p.lv) };
      const done = t.done[i], cur = st === "run" && i === t.i;
      return `<li class="${done ? "done" : ""}"${cur ? ' aria-current="step"' : ""}><span class="daily-mark" aria-hidden="true">${done ? ICON_OK : ""}</span>` +
        `<span class="daily-k">${esc(segKind(s))}</span><span class="daily-t" title="${esc(segText(s))}">${esc(segText(s))}</span></li>`;
    }).join("");
    const locks = daily.locked().map(x => `<li class="locked"><span class="daily-mark" aria-hidden="true"></span><span class="daily-k">${esc(L2(x.route.name))}</span>` +
      `<span class="daily-t">${esc(fmt("locked", { r: L2(x.after.route.name), n: x.after.n }))}</span></li>`).join("");
    card.innerHTML = `<div class="card-title"><b id="${tid}">${esc(fmt("title"))}</b><span class="sub">${esc(fmt("about", { n: daily.minutes() }))}</span></div>` +
      `<ol class="daily-list">${items}${locks}</ol>` +
      `<button class="btn primary daily-btn">${ICON_PLAY}<span class="btn-label">${esc(fmt(st === "run" ? "resume" : "start"))}</span></button>` +
      (daily.data.seen ? "" : `<p class="daily-note"></p>`);
    const note = card.querySelector(".daily-note"); if (note) pairText(note, () => fmt("note"));
    card.querySelector(".daily-btn").onclick = () => onStart && onStart();
  }
  /* 進行中:一行進度(暫停 = 回到卡片「繼續今天的練習」;下一段 ›) */
  function renderBar(){
    const t = daily.today(), n = t.plan.length, i = Math.min(t.i, n - 1);
    const left = Math.max(0, Math.ceil(t.plan.reduce((a, p, k) => a + (t.done[k] || k < i ? 0 : Math.max(0, p.sec - t.sec[k])), 0) / 60));
    const dots = t.plan.map((_, k) => `<i class="${t.done[k] ? "on" : k === i ? "cur" : ""}"></i>`).join("");
    const time = daily.segLeft() <= 0 ? fmt("timeUp") : fmt("left", { n: Math.max(1, left) });
    const html = `<b${barHost ? "" : ` id="${tid}"`}>${esc(fmt("title"))} ${i + 1}/${n}</b>` +
      `<span class="daily-dots" role="img" aria-label="${esc(fmt("of", { i: i + 1, n }))}">${dots}</span>` +
      `<span class="daily-left${daily.segLeft() <= 0 ? " up" : ""}">${esc(time)}</span>` +
      (onPause ? `<button class="btn small daily-pause" aria-label="${esc(fmt("pause"))}" title="${esc(fmt("pause"))}">${ICON_PAUSE}</button>` : "") +
      `<button class="btn small daily-next">${esc(fmt(isLast() ? "finish" : "next"))}</button>`;   // 最後一段:「結束今天 ›」(按了就是練完卡,不要讓人以為還有下一段)
    let bar;
    if (barHost) { bar = document.createElement("div"); bar.className = "daily-bar"; bar.setAttribute("role", "region"); bar.setAttribute("aria-label", fmt("title")); bar.innerHTML = html; barHost(bar); }
    else { card.innerHTML = `<div class="daily-bar">${html}</div>`; bar = card; }
    bar.querySelector(".daily-next").onclick = () => onNext && onNext();
    lastBar = bar; syncNext();
    const p = bar.querySelector(".daily-pause"); if (p) p.onclick = () => onPause && onPause();
  }
  /* 練完了 */
  function renderDone(){
    const s = daily.summary(log() || {});
    const tom = s.tomorrow.map(l => `${L2(l.route.name)} ${fmt("level", { n: l.n })}`).concat(s.review ? [fmt("review")] : []);
    const ms = s.segs ? milestone(log() || {}, s) : null;
    const news = s.segs ? daily.opened() : [];   // 今天開放的路線(開放那一天一次;daily.js 的 opened)
    const up = s.segs && !s.passed ? s.climb : null;   // 沒過關但速度有升:進步句(有過關已經寫「過了 n 關」)
    card.innerHTML = `<div class="card-title"><b id="${tid}">${esc(fmt("title"))}${s.segs ? " ✓" : ""}</b></div>` +   // 一段都沒練:不打勾
      `<p class="daily-sum"></p>` + (up ? `<p class="daily-sum daily-ms daily-up"></p>` : "") + `<p class="daily-sub"></p>` + (news.length ? `<p class="daily-sum daily-ms daily-new"></p>` : "") +
      (tom.length ? `<p class="daily-sub daily-tom"></p>` : "") + (ms ? `<p class="daily-sum daily-ms"></p>` : "") +
      `<button class="btn primary daily-more">${esc(fmt("more"))}</button>`;   // 練完卡唯一的按鈕 = 主要(2026-11 使用者:練完不知道該點什麼)
    // 一段都沒練(全部按「下一段」跳過):只寫「今天還沒練到」;不到 1 分鐘寫秒;最近 7 天 0 天不寫那一行
    const time = () => (s.sec < 60 ? fmt("sec", { n: Math.round(s.sec) }) : fmt("min", { n: Math.round(s.sec / 60) }));
    const enough = s.sec >= daily.today().plan.reduce((a, p) => a + (p.sec || 0), 0) * 0.6;   // 練了預計時間的 6 成以上才說「今天到這裡就好」(19 秒不說)
    pairText(card.querySelector(".daily-sum"), () => (s.segs ? fmt(enough ? "done" : "doneShort", { s: fmt(s.segs === 1 ? "part1" : "parts", { n: s.segs }), t: time(), p: s.passed ? fmt("passedN", { n: s.passed }) : "" }) : fmt("none")));
    const wk = card.querySelector(".daily-sub:not(.daily-tom)");
    if (s.week > 0) pairText(wk, () => fmt("week", { d: s.week })); else wk.remove();
    const tm = card.querySelector(".daily-tom");
    if (tm) pairText(tm, () => fmt("tomorrow", { list: s.tomorrow.map(l => `${L2(l.route.name)} ${fmt("level", { n: l.n })}`).concat(s.review ? [fmt("review")] : []).join(" · ") }));
    if (news.length) pairText(card.querySelector(".daily-new"), () => news.map(R => fmt("opened", { r: L2(R.name) })).join(" "));
    if (up) pairText(card.querySelector(".daily-up"), () => fmt(up.to >= up.target ? "climbTop" : "climb", { a: up.from, b: up.to, t: up.target }));
    if (ms) pairText(card.querySelector(".daily-ms:not(.daily-new):not(.daily-up)"), () => tr(ms.zh, ms.en));
    card.querySelector(".daily-more").onclick = () => onMore && onMore();
  }
  /* 里程碑稱讚:今天已經有一句 → 同一句(重畫、換語言);還沒有 → 挑一句,當下記成看過(milestone.js;連續天數照練習紀錄卡) */
  function milestone(lg, s){
    const id = daily.msToday();
    if (id) return msById(id);
    const m = pickMs({ streak: streak(lg), passed: daily.passedAll(), passedToday: s.passed, seen: daily.data.ms });
    if (m) daily.markMs(m.id, m.also);
    return m;
  }

  /* ── 段落面板(題目卡裡)── status = () => 一句話(換語言重算);result = attempt 的結果(有就顯示結果) ── */
  function renderStep(s, { status = null, passedDone = false } = {}){
    step.querySelectorAll("[data-app-act]").forEach(el => park.appendChild(el));
    if (!s) { step.hidden = true; step.innerHTML = ""; step.appendChild(park); lastSeg = null; panelNext = false; syncNext(); return; }
    lastStatus = status; lastOpts = { status, passedDone }; lastSeg = s;
    step.hidden = false;
    // 重點:關卡的 check(前面加關卡的 handsLine,例如「右手 Hi-hat、左手小鼓」);暖身 = 項目自己的 check
    const warm = s.k === "warm", list = warm ? (s.item && s.item.check) || [] : [...(s.level.handsLine ? [s.level.handsLine] : []), ...(s.level.check || [])];
    const check = list.length && !passedDone ? list : null;   // 過關、複習完:重點是剛練完那一關的,藏起來(狀態寫「下一關:…」,下一段 / 下一關才出現新的重點)
    const tip = !warm && !daily.data.tip && s.bpm;   // 第一次:速度的小字說明「速度 56 = 每分鐘 56 拍」(試過一次就不再出現)
    // 小字一次只放一行:第一次的速度說明在的時候「為什麼練這個」等試過一次再出現(whyOf 那時才記成看過;第 7 輪健檢:狀態句下面疊三行字,長輩不知道讀哪句)
    const vary = varyText(s), why = tip ? null : whyOf(s);
    const back = !warm && s.k === "route" && s.suggest && daily.canBack() && !passedDone;
    // 面板的內容換掉;底部按鈕列(.daily-cta)整段留著同一個元素(鍵盤焦點不掉),只換字
    step.querySelectorAll(":scope > :not(.daily-cta):not(.daily-park)").forEach(el => el.remove());
    let cta = step.querySelector(".daily-cta");
    if (!cta) {
      cta = document.createElement("div"); cta.className = "daily-acts daily-cta";
      cta.setAttribute("role", "group"); cta.setAttribute("aria-label", fmt("title"));
      cta.innerHTML = `<button class="btn daily-again"></button><button class="btn primary daily-main"></button>`;
      cta.querySelector(".daily-again").onclick = () => onAgain && onAgain();
      cta.querySelector(".daily-main").onclick = e => {
        const m = e.currentTarget.dataset.mode;
        if (performance.now() - (e.currentTarget._at || 0) < 700) return;
        if (m === "next") onNext && onNext(); else if (m === "ok") onOk && onOk(); else onPlay && onPlay();   // play / stop:App 的播放鈕(切換)
      };
      step.appendChild(cta);
    }
    cta.setAttribute("aria-label", fmt("title"));
    cta.querySelector(".daily-again").textContent = L2(labels.again);
    // 重點:每項一行的清單(系統化規則:主要資訊字級 ≥ --fs-md);「回上一關」是面板裡的文字鈕(底部那一列只放主要 + 一顆次要)
    cta.insertAdjacentHTML("beforebegin", `<p class="daily-status" id="${step.id}-status"></p>` + (tip ? `<p class="daily-tip"></p>` : "") + (why ? `<p class="daily-why"></p>` : "") + (vary ? `<p class="daily-vary"></p>` : "") +
      (check ? `<div class="daily-check"><b>${esc(fmt("checkTitle"))}</b><ul>${check.map(() => "<li></li>").join("")}</ul></div>` : "") +
      (back ? `<p class="daily-backrow"><button class="text-btn daily-back">${esc(fmt("back"))}</button></p>` : ""));
    paintStatus(s);
    if (tip) pairText(step.querySelector(".daily-tip"), () => fmt("tempoTip", { b: s.bpm }));
    if (why) pairText(step.querySelector(".daily-why"), () => L2(why));
    if (vary) pairText(step.querySelector(".daily-vary"), () => fmt("vary", { v: varyText(s) }));
    if (check) step.querySelectorAll(".daily-check li").forEach((li, i) => { li.textContent = L2(check[i]); });   // 每項一行(不用 pairText:英文比較長時中文會多出空行;換語言時 relang 重畫)
    const b = step.querySelector(".daily-back"); if (b) b.onclick = () => onBack && onBack();
    step.appendChild(park);
    paintActs();
  }
  function paintStatus(s){
    const el = step.querySelector(".daily-status"); if (!el) return;
    pairText(el, lastStatus || (() => M(s, defaultStatus(s))));
  }
  /* 還沒試過的時候那一句(短:fold-280 不超過兩行):暖身 / 歡迎回來 / 只有拍點 / 學的時候的下一步。
     過關的規則(到目標速度後連續穩幾次)不每次寫:到了目標速度,標籤後面顯示「穩 0 / 3」 */
  function defaultStatus(s){
    if (s.k === "warm") return fmt("warmHint", { v: L2(labels.verb) });
    const parts = [];
    if (s.welcome) parts.push(fmt("welcome", { b: s.bpm }));
    if (s.click && s.click !== "every") parts.push(L2(labels.solo));
    else parts.push(L2(labels.hint));
    return parts.join(tr("", " "));
  }
  return {
    /* 模組正在顯示今天的段落(進行中縮成一行) */
    set showing(v){ showing = !!v; }, get showing(){ return showing; },
    render, renderStep,
    /* 「穩了 / 做到了」能不能按(先用現在的速度播過一輪):App 播過 2 小節呼叫 ready(true);換段、換速度 ready(false) */
    ready(v){
      const was = okReady; okReady = !!v; if (was !== okReady) paintActs();
      // 剛播完一輪(不能按 → 能按):狀態句換成「彈得順就按「做到了」…」,下一步接得上(暖身、過關後不換)
      if (okReady && !was && labels.ask && lastSeg && lastSeg.k !== "warm" && !lastOpts.passedDone && !step.hidden) {
        const ask = labels.ask; if (ask) { lastStatus = () => L2(ask); lastOpts = { ...lastOpts, status: lastStatus }; paintStatus(lastSeg); }
      }
    },
    get isReady(){ return okReady; },
    /* App 開始 / 停止播放(題目卡的 ▶ 或底部按鈕):底部按鈕換成「■ 停止」/「▶ …一輪」 */
    playing(v){ if (playing === !!v) return; playing = !!v; paintActs(); },
    /* 換語言:只重寫文字 */
    relang(s){ render(); if (s && !step.hidden) renderStep(s, lastOpts); },
    hide(){ card.hidden = true; step.hidden = true; if (barHost) barHost(null); },
    announce: text => announce(text),
    segTags: s => segTags(s, s ? mark(s) : "♩="),
    resultText: (res, s) => {
      const nl = res && res.passed && res.nextLevel && s.level ? daily.levelOf(s.r || s.level.route.id, res.nextLevel) : null;
      const v = L2(labels.verb || ["彈", "play"]);
      // 過關、這一段還有時間 = 直接換到下一關(res.cont):寫「接著練:名稱」+ 下一步「按 ▶ 跟著彈一輪」(畫面已經是下一關,不要讓人以為還在同一關)
      if (res && res.passed && res.cont && nl) return M(s, fmt("passedCont", { name: L2(levelName({ k: "route", level: nl })) }) + tr("。", ". ") + fmt("start1", { v }));
      const t = resultText(res, s, nl ? levelName({ k: "route", level: nl }) : null, L2(labels.good || ["很穩!", "Steady!"]));
      // 還沒過關:每一句都接下一步「按 ▶ 再彈 / 打一次」(自評後要再播一輪才能再按)
      if (!t || !res || res.passed || s.k === "review") return M(s, t);
      const sep = /[??!!]$/.test(t) ? tr("", " ") : tr("。", ". ");
      const go = labels.go;   // App 可以換下一步的說法(DrumDrill 手機鼓墊:「按「打一遍」再打一次」)
      return M(s, t + sep + (go ? L2(go) : fmt("go", { v })));
    },
    varyText: s => M(s, varyText(s)), segKind, levelName,
    defaultStatus: s => M(s, defaultStatus(s))
  };
}
