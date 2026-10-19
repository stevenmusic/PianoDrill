/* 視奏分頁的「認音」(PianoDrill)/「認譜」(DrumDrill)共用的計分、挑戰、最常錯(兩個 App 逐位元組相同,tools/test/sync.json)。
   - 一題一題:pick(項目, 設定) 抽題 —「最常錯的 3 個」出現機率加倍(練習設定);answer(設定, 正確, 回答) 記對錯
   - 挑戰模式:"time" = 60 秒內答對幾題、"streak" = 連對幾題(答錯就結束);最高分照設定分開記
   - 存在模組自己的 store:store.best = { 設定: { time, streak } }、store.miss = { 設定: { "正確>回答": 次數 } }(每個設定最多留 40 種);讀進來先消毒
   - 純邏輯,不碰 DOM;畫面文字由模組自己寫(認音:「最常把 F3 看成 A3」/ 認譜:「最常把落地鼓看成中筒鼓」) */
export const CHALLENGE_SEC = 60;
export const MISS_TOP = 3;
const obj = o => (o && typeof o === "object" && !Array.isArray(o) ? o : {});
const cnt = v => (Number.isInteger(v) && v > 0 ? v : 0);

export function createDrill({ store, save, now = () => performance.now(), onEnd = () => {} }){
  store.best = obj(store.best); store.miss = obj(store.miss);
  for (const [k, v] of Object.entries(store.best)) { const o = obj(v); store.best[k] = { time: cnt(o.time), streak: cnt(o.streak) }; }
  for (const [k, v] of Object.entries(store.miss)) {
    const o = obj(v), clean = {};
    for (const [p, n] of Object.entries(o)) if (/^[^>]+>[^>]+$/.test(p) && cnt(n)) clean[p] = cnt(n);
    store.miss[k] = clean;
  }
  let run = null;   // 挑戰進行中:{ kind, setting, score, endAt, timer }
  const top = setting => Object.entries(store.miss[setting] || {}).map(([p, n]) => { const [target, answer] = p.split(">"); return { target, answer, n }; })
    .sort((a, b) => b.n - a.n).slice(0, MISS_TOP);
  function end(reason){
    if (!run) return null;
    const r = run; run = null; clearInterval(r.timer);
    const b = store.best[r.setting] || (store.best[r.setting] = { time: 0, streak: 0 });
    const newBest = r.score > b[r.kind];
    if (newBest) b[r.kind] = r.score;
    save();
    const res = { kind: r.kind, score: r.score, best: b[r.kind], newBest, reason };
    onEnd(res);
    return res;
  }
  return {
    get running(){ return !!run; },
    get kind(){ return run ? run.kind : null; },
    get score(){ return run ? run.score : 0; },
    /* 挑戰剩幾秒(60 秒模式) */
    left(){ return run && run.kind === "time" ? Math.max(0, Math.ceil((run.endAt - now()) / 1000)) : null; },
    best: (setting, kind) => ((store.best[setting] || {})[kind] || 0),
    top,
    /* 抽一題:items = 可以出的項目(字串 id),最常錯的 3 個權重 2;avoid = 上一題(連續兩題不一樣,能避就避) */
    pick(items, setting, rnd = Math.random, avoid = null){
      if (!items.length) return null;
      const hot = new Set(top(setting).map(x => x.target));
      const pool = items.length > 1 && avoid != null ? items.filter(x => x !== avoid) : items;
      const w = pool.map(x => (hot.has(x) ? 2 : 1)), sum = w.reduce((a, b) => a + b, 0);
      let r = rnd() * sum;
      for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r < 0) return pool[i]; }
      return pool[pool.length - 1];
    },
    /* 記一題;回傳挑戰結束的結果(連對模式答錯 = 結束)或 null */
    answer(setting, target, given, ok){
      if (!ok) {
        const m = store.miss[setting] || (store.miss[setting] = {}), k = `${target}>${given}`;
        m[k] = (m[k] || 0) + 1;
        const ks = Object.keys(m);
        if (ks.length > 40) { ks.sort((a, b) => m[a] - m[b]); for (const x of ks.slice(0, ks.length - 40)) delete m[x]; }
      }
      save();
      if (!run) return null;
      if (ok) run.score++;
      if (!ok && run.kind === "streak") return end("wrong");
      if (run.kind === "time" && now() >= run.endAt) return end("time");
      return null;
    },
    start(kind, setting, onTick = () => {}){
      end("restart");
      run = { kind, setting, score: 0, endAt: now() + CHALLENGE_SEC * 1000, timer: 0 };
      if (kind === "time") run.timer = setInterval(() => { if (!run) return; onTick(); if (now() >= run.endAt) end("time"); }, 250);
      return run;
    },
    stop: () => end("stop")
  };
}
