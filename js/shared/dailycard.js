/* 今日練習的卡片與段落面板(PianoDrill / DrumDrill 共用,兩邊逐位元組相同;tools/test/sync.json same)。引擎在 js/shared/daily.js。
   不寫死前綴:用模組自己的 $ —— $("dailyCard")(卡片,放在 .mod-main 最上面)、$("dailyStep")(段落面板,放在題目卡裡)。
   卡片三種狀態:
   - 還沒開始 / 暫停:標題「今日練習 · 約 n 分鐘」、一段一行(<ol>,做完的打勾)、還沒開放的路線一行淡字、大按鈕「開始 / 繼續今天的練習」;
     第一次才有一行「關卡是 App 編排的練習;沒練的日子不扣分」
   - 進行中(模組正在顯示這一段):縮成一行「今日練習 2/4 ●●○○ 剩約 7 分 [下一段 ›]」
   - 練完了:今天練了幾段、幾分鐘、過了幾關、最近 7 天練了幾天、明天練什麼 + 次要按鈕「再練一下」(可以一直按)
   段落面板:狀態 / 下一步一句、這次的變化(複習)、重點(關卡的 check)、[回上一關](文字鈕)…[再練][穩了 ✓](各 App 的字)或 [下一段 ›]
   文字都用 i18n 的 daily.*(兩個 App 一樣)+ 模組傳進來的 labels(穩了 / 做到了…);段落文字用 pairText(中英一樣高) */
import { tr, T, pairText } from "./i18n.js";

const fmt = (key, o = {}) => T("daily." + key).replace(/\{(\w+)\}/g, (_, k) => (o[k] != null ? o[k] : ""));
const L2 = v => (Array.isArray(v) ? tr(v[0], v[1]) : v == null ? "" : String(v));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ICON_PLAY = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>';
const ICON_OK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

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
/* 題目卡的標籤:[律動 第 3 關] [♩=68 → 90](學)/ [律動 第 3 關] [♩=90] [穩 ●○○](到了目標速度:連續穩幾次)/ [複習 · 律動 第 2 關] [♩=90](複習) */
export function segTags(s){
  if (!s || s.k === "warm") return s ? [fmt("warm")] : [];
  const lv = L2(s.level.route.name) + " " + fmt("level", { n: s.level.n });
  if (s.k === "review") return [fmt("review") + " · " + lv, "♩=" + s.bpm];
  if (s.bpm < s.target) return [lv, `♩=${s.bpm} → ${s.target}`];
  const need = s.need || 3, k = Math.min(need, s.streak || 0);
  return [lv, "♩=" + s.bpm, fmt("streakTag", { d: "●".repeat(k) + "○".repeat(need - k) })];
}
/* 一次嘗試的結果 → 狀態那一句 */
export function resultText(res, s){
  if (!res) return "";
  if (s.k === "review") return res.counted === false && s.extra ? fmt("revExtra") : res.verdict === "steady" ? fmt("revOk") : fmt("revBack");
  if (res.passed) return fmt("passed", { n: s.level.n }) + (res.cont && res.nextLevel ? " · " + fmt("cont", { n: s.level.n + 1 }) : "");
  let t = res.verdict === "steady" ? (res.nextBpm > s.bpm ? fmt("steady", { b: res.nextBpm }) : fmt("streak", { k: Math.max(1, res.need - res.streak) }))
    : res.nextBpm < s.bpm ? fmt("down", { b: res.nextBpm }) : fmt("near");
  if (res.suggestBack) t += " " + fmt("suggest");
  return t;
}

/* createDailyCard({ $, daily, labels, warmName, log, onStart, onNext, onMore, onOk, onAgain, onBack, announce, acts, mark })
   - labels = { ok: [中, 英], again: [中, 英], hint: [中, 英](學的時候的下一步), solo: [中, 英](只有拍點的時候) }
   - warmName(item) → [中, 英]:暖身項目的名稱(各 App 自己寫)
   - log() → 模組的練習紀錄(最近 7 天練了幾天)
   - mark(s) → 這一段速度的寫法(預設「♩=」;DrumDrill 12/8 的關「♩.=」):標籤、狀態、結果的速度都照這個寫
   - acts = { left(s, o), right(s, o) } → App 自己額外的按鈕(元素陣列):left 接在「回上一關」後面、right 放在最右邊(例如 DrumDrill 的「沒有鼓?用手機鼓墊」「打一遍」);
     元素由 App 建立、一直留在文件裡:這一次沒用到的(或面板收起來時)放在面板裡藏起來的 .daily-park,App 用 id 找得到 */
export function createDailyCard({ $, daily, labels = {}, warmName = () => "", log = () => ({}), onStart, onNext, onMore, onOk, onAgain, onBack, announce = () => {}, acts = {}, mark = () => "♩=" }){
  const M = (s, t) => { const m = s ? mark(s) : "♩="; return m === "♩=" || !t ? t : String(t).replace(/♩=/g, m); };
  const card = $("dailyCard"), step = $("dailyStep");
  const park = document.createElement("div"); park.className = "daily-park"; park.hidden = true;
  /* App 的按鈕:先全部收進 park,再把這一次要的放進按鈕列 */
  function placeActs(s, o){
    step.querySelectorAll(".daily-acts > [data-app-act]").forEach(el => park.appendChild(el));
    if (!park.isConnected) step.appendChild(park);
    const row = step.querySelector(".daily-acts"); if (!row || !s) return;
    const sp = row.querySelector(".daily-sp");
    for (const el of (acts.left ? acts.left(s, o) : []) || []) { el.dataset.appAct = "1"; row.insertBefore(el, sp); }
    for (const el of (acts.right ? acts.right(s, o) : []) || []) { el.dataset.appAct = "1"; row.appendChild(el); }
  }
  const tid = card.id + "-title";
  card.setAttribute("role", "region"); card.setAttribute("aria-labelledby", tid);
  let showing = false, lastStatus = null, lastOpts = {};
  const segText = s => (s.k === "warm" ? L2(warmName(s.item)) : `${fmt("level", { n: s.level.n })} · ${L2(s.level.name)}`);

  function render(){
    const st = daily.state();
    card.hidden = false;
    card.classList.toggle("daily-run", showing && st === "run");
    card.classList.toggle("daily-done", st === "done");
    if (showing && st === "run") return renderBar();
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
  /* 進行中:一行進度 */
  function renderBar(){
    const t = daily.today(), n = t.plan.length, i = Math.min(t.i, n - 1);
    const left = Math.max(0, Math.ceil(t.plan.reduce((a, p, k) => a + (t.done[k] || k < i ? 0 : Math.max(0, p.sec - t.sec[k])), 0) / 60));
    const dots = t.plan.map((_, k) => `<i class="${t.done[k] ? "on" : k === i ? "cur" : ""}"></i>`).join("");
    const time = daily.segLeft() <= 0 ? fmt("timeUp") : fmt("left", { n: Math.max(1, left) });
    card.innerHTML = `<div class="daily-bar"><b id="${tid}">${esc(fmt("title"))} ${i + 1}/${n}</b>` +
      `<span class="daily-dots" role="img" aria-label="${esc(fmt("of", { i: i + 1, n }))}">${dots}</span>` +
      `<span class="daily-left${daily.segLeft() <= 0 ? " up" : ""}">${esc(time)}</span>` +
      `<button class="btn small daily-next">${esc(fmt("next"))}</button></div>`;
    card.querySelector(".daily-next").onclick = () => onNext && onNext();
  }
  /* 練完了 */
  function renderDone(){
    const s = daily.summary(log() || {});
    const tom = s.tomorrow.map(l => `${L2(l.route.name)} ${fmt("level", { n: l.n })}`).concat(s.review ? [fmt("review")] : []);
    card.innerHTML = `<div class="card-title"><b id="${tid}">${esc(fmt("title"))} ✓</b></div>` +
      `<p class="daily-sum"></p><p class="daily-sub"></p>` + (tom.length ? `<p class="daily-sub daily-tom"></p>` : "") +
      `<button class="btn daily-more">${esc(fmt("more"))}</button>`;
    // 一段都沒練(全部按「下一段」跳過):只寫「今天還沒練到」;不到 1 分鐘寫秒;最近 7 天 0 天不寫那一行
    const time = () => (s.sec < 60 ? fmt("sec", { n: Math.round(s.sec) }) : fmt("min", { n: Math.round(s.sec / 60) }));
    pairText(card.querySelector(".daily-sum"), () => (s.segs ? fmt("done", { s: fmt(s.segs === 1 ? "part1" : "parts", { n: s.segs }), t: time(), p: s.passed }) : fmt("none")));
    const wk = card.querySelector(".daily-sub:not(.daily-tom)");
    if (s.week > 0) pairText(wk, () => fmt("week", { d: s.week })); else wk.remove();
    const tm = card.querySelector(".daily-tom");
    if (tm) pairText(tm, () => fmt("tomorrow", { list: s.tomorrow.map(l => `${L2(l.route.name)} ${fmt("level", { n: l.n })}`).concat(s.review ? [fmt("review")] : []).join(" · ") }));
    card.querySelector(".daily-more").onclick = () => onMore && onMore();
  }

  /* ── 段落面板(題目卡裡)── status = () => 一句話(換語言重算);result = attempt 的結果(有就顯示結果) ── */
  function renderStep(s, { status = null, passedDone = false } = {}){
    step.querySelectorAll("[data-app-act]").forEach(el => park.appendChild(el));
    if (!s) { step.hidden = true; step.innerHTML = ""; step.appendChild(park); return; }
    lastStatus = status; lastOpts = { status, passedDone };
    step.hidden = false;
    // 重點:關卡的 check(前面加關卡的 handsLine,例如「右手 Hi-hat、左手小鼓」);暖身 = 項目自己的 check
    const warm = s.k === "warm", list = warm ? (s.item && s.item.check) || [] : [...(s.level.handsLine ? [s.level.handsLine] : []), ...(s.level.check || [])];
    const check = list.length ? list : null;
    const vary = varyText(s);
    // 暖身:只有進度條上那一顆「下一段 ›」(按鈕列整列不放);過關、複習完 = 主要按鈕「下一段 ›」
    const primaryNext = passedDone;
    step.innerHTML = `<p class="daily-status"></p>` + (vary ? `<p class="daily-vary"></p>` : "") + (check ? `<p class="daily-check"></p>` : "") +
      `<div class="daily-acts"${warm ? " hidden" : ""}>` + (!warm && s.k === "route" && daily.canBack() && !passedDone ? `<button class="text-btn daily-back">${esc(fmt("back"))}</button>` : "") +
      `<span class="daily-sp"></span>` +
      (primaryNext ? `<button class="btn primary daily-go">${esc(fmt("next"))}</button>`
        : `<button class="btn daily-again">${esc(L2(labels.again))}</button><button class="btn primary daily-ok">${ICON_OK}<span class="btn-label">${esc(L2(labels.ok))}</span></button>`) + `</div>`;
    paintStatus(s);
    if (vary) pairText(step.querySelector(".daily-vary"), () => fmt("vary", { v: varyText(s) }));
    if (check) pairText(step.querySelector(".daily-check"), () => fmt("check", { list: check.map(L2).join(" · ") }));
    const on = (sel, fn) => { const b = step.querySelector(sel); if (b) b.onclick = () => fn && fn(); };
    on(".daily-back", onBack); on(".daily-again", onAgain); on(".daily-ok", onOk); on(".daily-go", onNext);
    step.appendChild(park);
    placeActs(s, lastOpts);
  }
  function paintStatus(s){
    const el = step.querySelector(".daily-status"); if (!el) return;
    pairText(el, lastStatus || (() => M(s, defaultStatus(s))));
  }
  /* 還沒試過的時候那一句(短:fold-280 不超過兩行):暖身 / 歡迎回來 / 只有拍點 / 學的時候的下一步。
     過關的規則(到目標速度後連續穩幾次)不每次寫:到了目標速度,標籤後面顯示「穩 ●○○」 */
  function defaultStatus(s){
    if (s.k === "warm") return fmt("warmHint");
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
    /* 換語言:只重寫文字 */
    relang(s){ render(); if (s && !step.hidden) renderStep(s, lastOpts); },
    hide(){ card.hidden = true; step.hidden = true; },
    announce: text => announce(text),
    segTags: s => segTags(s).map(t => M(s, t)), resultText: (res, s) => M(s, resultText(res, s)), varyText: s => M(s, varyText(s)), segKind,
    defaultStatus: s => M(s, defaultStatus(s))
  };
}
