/* 今日練習的引擎(PianoDrill / DrumDrill 共用,兩邊逐位元組相同;tools/test/sync.json same)。
   純邏輯:不碰 DOM、不 import 任何東西(node 可以直接測:tools/test/checks/daily.mjs)。畫面在 js/shared/dailycard.js,關卡內容在各 App 的資料。
   全部數字都是 App 的練習設定(不是考試要求);關卡、路線可以覆寫(up / down / need / click / vary)。

   ── 一關怎麼「學」(照專業練習的做法)──
   - 慢練優先:新的一關從起始速度(start)開始,不能直接跳到目標速度(target);
     快速通道例外:上一關從頭到過關每一次都穩(一次失手都沒有)→ 路線的 fast 打開,下一關從目標速度開始;任何一次不穩 → fast 關掉
   - 速度階梯:穩一次 → 加 up(預設 8,資料可以寫 4–8),到目標為止;太快了(slow)→ 馬上慢 down(預設 4);差一點(near)同一個速度,連續兩次不穩才慢 down;
     最慢 = max(MIN_BPM, start − down)
   - 連續穩定:到了目標速度,要連續 need 次(預設 3)都穩才過關;中間失手就重算
   - 同一個速度連續 4 次不穩 → 建議回上一關(只建議,不自動退)
   - 一次嘗試的結果:鼓墊 / 評分 score ≥ PASS = 穩、≥ NEAR = 差一點、其他 = 太快了;自評 self "ok" = 穩、"again" = 差一點
   ── 過了以後:間隔複習 + 變化 ──
   - 過關 → 複習盒 1,隔天複習;穩 → 下一盒(間隔 REVIEW_GAPS 1、3、7、14、30 天,盒 6 之後每 60 天一次);不穩 → 退回上一盒(上一個變化)、隔天再來
   - 每一盒用不同的變化練(vary[盒 − 1]):預設 DEFAULT_VARY = 原樣 → 拍點只響 2、4 拍 → 只響第 1 拍 → 中途消失 2 小節 → 中途消失 + 最快;
     各 App 的關卡資料可以換成自己的(鋼琴:附點、斷奏、強弱、換調;q = 題目要改的欄位,name = 顯示名稱 [中, 英])
   - 一天只排一題複習(到期日早的優先,同一天盒號小的優先);沒練的日子到期的會累積,但每天還是一題
   ── 每天的菜單(buildPlan,同一天不變)──
   - 暖身固定第一段(extras.warm 給項目;不過關、只記時間);其他段(每條開放的路線一段 + 到期的複習一段)照日子輪換順序(交錯)
   - 還沒開放的路線(unlock = { route, passed: 關卡 id })不算一段,它的秒數加到第一條路線那一段;卡片另外寫一行什麼時候開放
   - 每段預計秒數 SEG_SEC(只算真的在練的時間);到了只提示,不強制換段;一段裡過了關、還剩 CONT_SEC 秒以上 → 直接接下一關
   - 隔 WELCOME_DAYS(7)天以上回來:每條路線目前那一關從起始速度開始(關卡、複習盒都不變:沒練的日子不扣分)
   ── 拍點模式(clickPlays)── every 每拍、two-four 只響 2、4 拍(鼓)、one-three 只響 1、3 拍(鋼琴)、one 只響每小節第 1 拍、gap 中途消失 2 小節再回來 */
export const DAILY_V = 1;
export const STEP_UP = 8, STEP_DOWN = 4, NEED = 3, PASS_SCORE = 85, NEAR_SCORE = 60, MIN_BPM = 40, MAX_BPM = 300;
export const SUGGEST_AFTER = 4, CONT_SEC = 60;
export const REVIEW_GAPS = [1, 3, 7, 14, 30], RETIRE_GAP = 60, WELCOME_DAYS = 7, MAX_BOX = REVIEW_GAPS.length + 1;
export const SEG_SEC = { warm: 90, route: 180, review: 120 };
export const CLICK_MODES = ["every", "two-four", "one-three", "one", "gap"];
export const DEFAULT_VARY = [{}, { click: "two-four" }, { click: "one" }, { click: "gap" }, { click: "gap", fast: true }];

/* ── 日期(本地時間的 YYYY-MM-DD;跟 practicelog.js 的 dayKey 一樣)── */
export const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const isDay = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)));
export const dayNum = s => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5);
export function addDays(s, n){ const d = new Date((dayNum(s) + n) * 864e5); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`; }

/* ── 拍點模式:第 b 拍(0 起算,預備拍不算;預備拍一律每拍都響)要不要響 ──
   perBar = 一小節幾個拍點;total = 全部幾個拍點(gap 用來找中間的 2 小節) */
export function gapBars(bars){
  if (bars < 3) return [0, 0];
  const from = Math.max(1, Math.floor((bars - 2) / 2));
  return [from, Math.min(from + 2, bars - 1)];   // 第一小節、最後一小節一定響
}
export function clickPlays(mode, b, perBar = 4, total = Infinity){
  if (b < 0) return true;
  const pos = ((b % perBar) + perBar) % perBar, bar = Math.floor(b / perBar);
  switch (mode) {
    case "two-four": return pos % 2 === 1;
    case "one-three": return pos % 2 === 0;
    case "one": return pos === 0;
    case "gap": { const [a, z] = gapBars(Math.ceil(total / perBar)); return !(bar >= a && bar < z); }
    default: return true;
  }
}

/* ── 一次嘗試的結果 ── */
export function verdictOf({ score = null, self = null } = {}){
  if (self === "ok") return "steady";
  if (self === "again") return "near";
  if (typeof score !== "number" || !Number.isFinite(score)) return "slow";   // 整體偏移太大沒有分數
  return score >= PASS_SCORE ? "steady" : score >= NEAR_SCORE ? "near" : "slow";
}

/* ── 讀進來先消毒 ── */
const int = (v, lo, hi, def) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : def);
const keyOf = (r, id) => r + "/" + id;
const findRoute = (routes, r) => routes.find(x => x.id === r) || null;
const findLevel = (routes, r, id) => { const R = findRoute(routes, r); return R ? R.levels.find(l => l.id === id) || null : null; };
export function cleanDaily(raw, routes, today = null){
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const d = { v: DAILY_V, prog: {}, lv: {}, today: null, last: isDay(src.last) ? src.last : null, seen: src.seen === true };
  for (const R of routes) {
    const p = src.prog && src.prog[R.id] && typeof src.prog[R.id] === "object" ? src.prog[R.id] : {};
    const done = p.done === true;
    const at = R.levels.some(l => l.id === p.at) ? p.at : R.levels[0].id;
    d.prog[R.id] = { at, fast: p.fast === true, done };
  }
  if (src.lv && typeof src.lv === "object") for (const [k, v] of Object.entries(src.lv)) {
    const [r, id] = k.split("/"), L = findLevel(routes, r, id);
    if (!L || !v || typeof v !== "object") continue;
    const e = { tries: int(v.tries, 0, 1e6, 0), miss: int(v.miss, 0, 1e6, 0), streak: int(v.streak, 0, 1e3, 0), unsteady: int(v.unsteady, 0, 1e3, 0), same: int(v.same, 0, 1e3, 0) };
    const bpm = int(v.bpm, MIN_BPM, MAX_BPM, null); if (bpm != null) e.bpm = bpm;
    const best = int(v.best, MIN_BPM, MAX_BPM, null); if (best != null) e.best = best;
    const lastBpm = int(v.lastBpm, MIN_BPM, MAX_BPM, null); if (lastBpm != null) e.lastBpm = lastBpm;
    if (isDay(v.passed)) { e.passed = v.passed; e.box = int(v.box, 1, MAX_BOX, 1); e.due = isDay(v.due) ? v.due : addDays(v.passed, 1); }
    if (isDay(v.rev)) e.rev = v.rev;
    d.lv[k] = e;
  }
  const t = src.today;
  if (t && typeof t === "object" && isDay(t.date) && (!today || t.date === today) && Array.isArray(t.plan)) {
    const plan = t.plan.filter(s => s && typeof s === "object" && (s.k === "warm" || ((s.k === "route" || s.k === "review") && findLevel(routes, s.r, s.lv))))
      .map(s => {
        const e = { k: s.k, sec: int(s.sec, 0, 3600, SEG_SEC[s.k]) };
        if (s.k === "warm") e.item = s.item && typeof s.item === "object" ? s.item : null;
        else { e.r = s.r; e.lv = s.lv; }
        if (s.k === "review") { e.box = int(s.box, 1, MAX_BOX, 1); if (s.extra === true) e.extra = true; }
        return e;
      });
    if (plan.length) {
      const arr = (a, lo, hi) => plan.map((_, i) => int(Array.isArray(a) ? a[i] : 0, lo, hi, 0));
      d.today = { date: t.date, plan, i: int(t.i, 0, plan.length, 0), done: arr(t.done, 0, 2), sec: arr(t.sec, 0, 86400),
        started: t.started === true, passed: Array.isArray(t.passed) ? t.passed.filter(k => typeof k === "string" && findLevel(routes, ...k.split("/"))) : [],
        extra: int(t.extra, 0, 20, 0), welcome: t.welcome === true, tries: arr(t.tries, 0, 1e4) };
    }
  }
  return d;
}

/* ── 路線開放、複習挑題(純函式)── */
export function isOpen(R, d, routes){
  if (!R.unlock) return true;
  const L = findLevel(routes, R.unlock.route, R.unlock.passed);
  if (!L) return true;
  const e = d.lv[keyOf(R.unlock.route, R.unlock.passed)];
  return !!(e && e.passed);
}
export function pickReview(d, today, routes){
  let best = null;
  for (const [k, e] of Object.entries(d.lv)) {
    if (!e.passed || !e.due || e.due > today) continue;
    if (!best || e.due < best.e.due || (e.due === best.e.due && e.box < best.e.box)) best = { k, e };
  }
  if (!best) return null;
  const [r, lv] = best.k.split("/");
  return findLevel(routes, r, lv) ? { r, lv, box: best.e.box } : null;
}
/* 今天的菜單:暖身第一;其他段照日子輪換(交錯) */
export function buildPlan({ routes, daily: d, today, extras = {} }){
  const plan = [];
  const warm = extras.warm ? extras.warm(d, today) : null;
  if (warm) plan.push({ k: "warm", item: warm, sec: SEG_SEC.warm });
  const open = routes.filter(R => isOpen(R, d, routes) && !d.prog[R.id].done);
  const spare = (routes.length - open.length) * SEG_SEC.route;   // 還沒開放 / 全部過完的路線:秒數加到第一條開放的路線
  const rest = open.map((R, i) => ({ k: "route", r: R.id, lv: d.prog[R.id].at, sec: SEG_SEC.route + (i === 0 ? spare : 0) }));
  const rv = pickReview(d, today, routes);
  if (rv) rest.push({ k: "review", r: rv.r, lv: rv.lv, box: rv.box, sec: SEG_SEC.review });
  const n = rest.length, shift = n ? ((dayNum(today) % n) + n) % n : 0;
  for (let i = 0; i < n; i++) plan.push(rest[(i + shift) % n]);
  return plan;
}

/* ══ 引擎 ══
   createDaily({ routes, load, save, now, extras })
   - routes = [{ id, name: [中, 英], unlock?, up?, down?, need?, vary?, levels: [{ id, name, start, target, up?, down?, need?, click?, vary?, check? }] }]
   - load() → 存的原始資料(各模組 localStorage 的 daily);save(d) 存回去
   - extras.warm(d, today) → 暖身項目(各 App 自己挑;沒有就不排暖身) */
export function createDaily({ routes, load = () => null, save = () => {}, now = () => new Date(), extras = {} }){
  const todayKey = () => dayKey(now());
  let d = cleanDaily(load(), routes);
  const put = () => save(d);
  const route = r => findRoute(routes, r);
  const cfg = (R, L, k, def) => (L && L[k] != null ? L[k] : R && R[k] != null ? R[k] : def);
  const lvState = k => d.lv[k] || (d.lv[k] = { tries: 0, miss: 0, streak: 0, unsteady: 0, same: 0 });

  function ensure(){
    const t = todayKey();
    if (d.today && d.today.date === t) return d.today;
    const welcome = !!(d.last && dayNum(t) - dayNum(d.last) >= WELCOME_DAYS);
    if (welcome) for (const R of routes) {   // 歡迎回來:目前那一關從起始速度開始(關卡、盒號不變)
      const e = d.lv[keyOf(R.id, d.prog[R.id].at)];
      if (e) { delete e.bpm; e.streak = 0; e.unsteady = 0; e.same = 0; }
    }
    const plan = buildPlan({ routes, daily: d, today: t, extras });
    d.today = { date: t, plan, i: 0, done: plan.map(() => 0), sec: plan.map(() => 0), tries: plan.map(() => 0), started: false, passed: [], extra: 0, welcome };
    put();
    return d.today;
  }
  function levelOf(r, id){
    const R = route(r); if (!R) return null;
    const i = R.levels.findIndex(l => l.id === id); if (i < 0) return null;
    return { ...R.levels[i], n: i + 1, of: R.levels.length, route: R };
  }
  const floorOf = (R, L) => Math.max(MIN_BPM, L.start - cfg(R, L, "down", STEP_DOWN));
  const varyOf = (R, L, box) => { const v = cfg(R, L, "vary", DEFAULT_VARY); return v[Math.min(v.length, Math.max(1, box)) - 1] || {}; };
  /* 這一關現在的速度(學的時候);複習用 reviewBpm */
  function bpmFor(r, id){
    const R = route(r), L = R && R.levels.find(l => l.id === id); if (!L) return null;
    const e = d.lv[keyOf(r, id)];
    if (e && e.bpm != null) return e.bpm;
    return d.prog[r].fast ? L.target : L.start;
  }
  function reviewBpm(r, id, box){
    const R = route(r), L = R.levels.find(l => l.id === id), v = varyOf(R, L, box), e = d.lv[keyOf(r, id)] || {};
    return v.fast ? Math.min(MAX_BPM, Math.max(e.best || 0, L.target + cfg(R, L, "up", STEP_UP))) : L.target;
  }
  function state(){
    const t = ensure();
    if (t.done.every(x => x)) return t.started ? "done" : t.plan.length ? "idle" : "done";
    return t.started ? "run" : "idle";
  }
  /* 目前這一段(畫面用的完整資料) */
  function seg(){
    const t = ensure(); if (t.i >= t.plan.length) return null;
    const s = t.plan[t.i], out = { ...s, i: t.i, of: t.plan.length, sec: s.sec, left: s.sec - t.sec[t.i], tries: t.tries[t.i] };
    if (s.k === "warm") return out;
    const L = levelOf(s.r, s.lv), R = L.route;
    out.level = L;
    if (s.k === "review") { out.vary = varyOf(R, L, s.box); out.bpm = reviewBpm(s.r, s.lv, s.box); out.click = out.vary.click || L.click || "every"; }
    else {
      out.bpm = bpmFor(s.r, s.lv); out.click = L.click || "every"; out.target = L.target; out.need = cfg(R, L, "need", NEED);
      const e = d.lv[keyOf(s.r, s.lv)] || {}; out.streak = e.streak || 0;
      out.welcome = t.welcome && !t.tries[t.i];
    }
    return out;
  }
  function begin(i){
    const t = ensure();
    if (i == null) { i = t.done.findIndex(x => !x); if (i < 0) i = t.plan.length; }
    t.i = Math.max(0, Math.min(t.plan.length, i)); t.started = true; d.seen = true;
    put(); return seg();
  }
  /* 一次嘗試(目前這一段):{ bpm, score?, self? } → { verdict, passed, nextBpm, nextLevel, cont, suggestBack, box, due, streak, need } */
  function attempt({ bpm, score = null, self = null } = {}){
    const t = ensure(), s = t.plan[t.i]; if (!s || s.k === "warm") return null;
    const day = t.date, R = route(s.r), L = R.levels.find(l => l.id === s.lv), k = keyOf(s.r, s.lv), e = lvState(k);
    const verdict = verdictOf({ score, self }), steady = verdict === "steady";
    bpm = int(bpm, MIN_BPM, MAX_BPM, bpmFor(s.r, s.lv));
    t.tries[t.i]++; d.last = day;
    const res = { verdict, passed: false, nextBpm: bpm, nextLevel: null, cont: false, suggestBack: false };
    if (s.k === "review") {
      // 一天只算第一次(之後可以再打,不改排程);加練的複習(extra)不改排程
      if (!s.extra && e.rev !== day) {
        e.rev = day;
        if (steady) { e.box = Math.min(MAX_BOX, (e.box || 1) + 1); e.due = addDays(day, e.box <= REVIEW_GAPS.length ? REVIEW_GAPS[e.box - 1] : RETIRE_GAP); }
        else { e.box = Math.max(1, (e.box || 1) - 1); e.due = addDays(day, 1); }
        if (steady) e.best = Math.max(e.best || 0, bpm);
      }
      Object.assign(res, { box: e.box, due: e.due, counted: !s.extra && e.rev === day });
      put(); return res;
    }
    const up = cfg(R, L, "up", STEP_UP), down = cfg(R, L, "down", STEP_DOWN), need = cfg(R, L, "need", NEED);
    e.tries++;
    let next = bpm;
    if (steady) {
      e.unsteady = 0; e.same = 0; e.best = Math.max(e.best || 0, bpm);
      if (bpm < L.target) { e.streak = 0; next = Math.min(L.target, bpm + up); }
      else e.streak++;
    } else {
      e.miss++; e.streak = 0; d.prog[s.r].fast = false;
      e.same = e.lastBpm === bpm ? e.same + 1 : 1;
      e.unsteady++;
      if (verdict === "slow" || e.unsteady >= 2) { next = Math.max(floorOf(R, L), bpm - down); e.unsteady = 0; }
    }
    e.lastBpm = bpm; e.bpm = next;
    res.nextBpm = next; res.streak = e.streak; res.need = need; res.suggestBack = e.same >= SUGGEST_AFTER;
    if (steady && bpm >= L.target && e.streak >= need) {
      res.passed = true;
      // 快速通道:這一關一次失手都沒有
      d.prog[s.r].fast = e.miss === 0;
      e.streak = 0;
      if (!e.passed) { e.passed = day; e.box = 1; e.due = addDays(day, 1); }
      if (!t.passed.includes(k)) t.passed.push(k);
      const i = R.levels.findIndex(l => l.id === s.lv);
      if (d.prog[s.r].at === s.lv) {
        if (i + 1 < R.levels.length) d.prog[s.r].at = R.levels[i + 1].id; else d.prog[s.r].done = true;
      }
      res.box = e.box; res.due = e.due;
      if (i + 1 < R.levels.length) {
        res.nextLevel = R.levels[i + 1].id;
        res.cont = s.sec - t.sec[t.i] >= CONT_SEC;
        if (res.cont) s.lv = res.nextLevel;   // 這一段還有時間:直接接下一關
      }
    }
    put(); return res;
  }
  /* 回上一關(這一段換成上一關;原本那一關的速度與次數保留) */
  function back(){
    const t = ensure(), s = t.plan[t.i]; if (!s || s.k !== "route") return null;
    const R = route(s.r), i = R.levels.findIndex(l => l.id === s.lv); if (i <= 0) return null;
    s.lv = R.levels[i - 1].id; d.prog[s.r].at = s.lv; d.prog[s.r].done = false;
    put(); return s.lv;
  }
  const canBack = () => { const t = ensure(), s = t.plan[t.i]; return !!(s && s.k === "route" && route(s.r).levels.findIndex(l => l.id === s.lv) > 0); };
  function addSec(sec){
    const t = ensure(); if (!t.started || t.i >= t.plan.length || !(sec > 0)) return;
    t.sec[t.i] += Math.round(sec); d.last = t.date; put();
  }
  const segLeft = () => { const t = ensure(); return t.i < t.plan.length ? t.plan[t.i].sec - t.sec[t.i] : 0; };
  /* 下一段:練過(有秒數或試過)= 完成,沒練 = 跳過;回傳下一段(沒有了 = null) */
  function next(){
    const t = ensure(); if (t.i >= t.plan.length) return null;
    t.done[t.i] = t.sec[t.i] > 0 || t.tries[t.i] > 0 ? 1 : 2;
    const j = t.done.findIndex(x => !x);
    t.i = j < 0 ? t.plan.length : j;
    put(); return seg();
  }
  /* 再練一下(今天練完以後,可以一直按):再排一小份,約 5 分鐘 = 還沒過的那一關(進度比較慢的路線)+ 一題沒到期的複習
     (加練的複習 extra = true:照它現在那一盒的變化練,不改複習盒與到期日);回傳這一份的第一段 */
  function addExtra(){
    const t = ensure(), add = [];
    const open = routes.filter(R => isOpen(R, d, routes) && !d.prog[R.id].done);
    if (open.length) {
      const pos = R => R.levels.findIndex(l => l.id === d.prog[R.id].at) / R.levels.length;
      const R = open.reduce((a, b) => (pos(b) < pos(a) ? b : a));
      add.push({ k: "route", r: R.id, lv: d.prog[R.id].at, sec: SEG_SEC.route });
    }
    let pick = null;
    for (const [k, e] of Object.entries(d.lv)) if (e.passed && (!pick || e.due < pick.e.due)) pick = { k, e };
    if (pick) { const [r, lv] = pick.k.split("/"); add.push({ k: "review", r, lv, box: pick.e.box, sec: SEG_SEC.review, extra: true }); }
    if (!add.length) return null;
    const first = t.plan.length;
    for (const s of add) { t.plan.push(s); t.done.push(0); t.sec.push(0); t.tries.push(0); }
    t.extra++; t.i = first; t.started = true;
    put(); return seg();
  }
  /* 還沒開放的路線:{ route, after: 要先過的那一關 } */
  const locked = () => routes.filter(R => !isOpen(R, d, routes)).map(R => ({ route: R, after: levelOf(R.unlock.route, R.unlock.passed) }));
  /* 完成畫面:段數、秒數、今天過了幾關、最近 7 天練了幾天(log = 模組的練習紀錄)、明天要練的 */
  function summary(log = {}){
    const t = ensure(), today = t.date;
    let week = 0;
    for (let i = 0; i < 7; i++) { const e = log[addDays(today, -i)]; if (e && (e.n || e.sec)) week++; }
    const tomorrow = routes.filter(R => isOpen(R, d, routes) && !d.prog[R.id].done).map(R => levelOf(R.id, d.prog[R.id].at));
    const rv = pickReview(d, addDays(today, 1), routes);
    return { segs: t.done.filter(x => x === 1).length, sec: t.sec.reduce((a, b) => a + b, 0), passed: t.passed.length, week,
      tomorrow, review: rv ? levelOf(rv.r, rv.lv) : null };
  }
  const minutes = () => { const t = ensure(); let s = 0; t.plan.forEach((p, i) => { if (!t.done[i]) s += Math.max(0, p.sec - t.sec[i]); }); return Math.max(1, Math.round(s / 60)); };
  return { get data(){ return d; }, plan: () => ensure().plan, today: ensure, state, seg, begin, attempt, back, canBack, addSec, segLeft, next, addExtra,
    levelOf, bpmFor, reviewBpm, locked, summary, minutes, isOpen: R => isOpen(R, d, routes),
    reset(raw){ d = cleanDaily(raw, routes); put(); } };
}
