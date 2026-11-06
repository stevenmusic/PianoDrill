/* 里程碑稱讚(PianoDrill / DrumDrill 共用,兩邊逐位元組相同;tools/test/sync.json same)。七個目標第 6 條:讓人想一直用、不懲罰。
   純函式:不碰 DOM、不 import(node 可以直接測:tools/test/checks/daily.mjs)。畫面在 dailycard.js 的「練完了」卡最後一行。
   - 門檻:連續練 3 / 7 / 14 / 30 / 100 天(練習紀錄的連續天數)、今日練習累計過 5 / 10 / 20 / 30 關
   - 一次最多一句:先挑今天剛達成的(連續天數剛好等於門檻、今天過的關跨過門檻),再挑數字大的;每個 id 只出現一次(seen)
   - 同一類挑了比較大的門檻,比它小的一起算看過(also;例如第一次用就已經連續 30 天,不會隔天再說 14 天)
   - 句子:老師的口吻、具體說練了有什麼用;不形容聲音、不比較別人、不寫徽章;中文 ≤ 16 字、英文 ≤ 40 字(兩個 App 都通用:不寫琴、鼓) */
export const MILESTONES = [
  { id: "s3", k: "streak", n: 3, zh: "連續練 3 天了，習慣開始養成！", en: "3 days in a row: a habit is forming!" },
  { id: "s7", k: "streak", n: 7, zh: "連續練 7 天了，手開始記住了！", en: "7 days in a row: your hands remember!" },
  { id: "s14", k: "streak", n: 14, zh: "連續練 14 天，越練越順手！", en: "14 days in a row: it's getting easier!" },
  { id: "s30", k: "streak", n: 30, zh: "連續練 30 天，練習成了習慣！", en: "30 days in a row: practice is a habit!" },
  { id: "s100", k: "streak", n: 100, zh: "連續練 100 天，好有毅力！", en: "100 days in a row: real dedication!" },
  { id: "p5", k: "passed", n: 5, zh: "累計 5 關，一步一步來！", en: "5 levels in all: step by step!" },
  { id: "p10", k: "passed", n: 10, zh: "累計 10 關，基本功越來越穩！", en: "10 levels in all: solid basics!" },
  { id: "p20", k: "passed", n: 20, zh: "累計 20 關，會的越來越多！", en: "20 levels in all: you know so much now!" },
  { id: "p30", k: "passed", n: 30, zh: "累計 30 關，慢慢練真的有用！", en: "30 levels in all: slow practice works!" }
];
export const MS_IDS = MILESTONES.map(m => m.id);
const num = v => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/* pick({ streak, passed, passedToday, seen }) → { id, zh, en, also: [比它小、同一類、還沒看過的 id] } | null
   streak = 連續天數;passed = 今日練習累計過了幾關;passedToday = 其中今天過的(判斷「剛達成」);seen = 看過的 id */
export function pick({ streak = 0, passed = 0, passedToday = 0, seen = [] } = {}){
  const s = num(streak), p = num(passed), pt = Math.min(num(passedToday), p);
  const saw = new Set(Array.isArray(seen) ? seen.filter(x => typeof x === "string") : []);
  const val = { streak: s, passed: p };
  const fresh = m => (m.k === "streak" ? s === m.n : p - pt < m.n);
  const cand = MILESTONES.filter(m => val[m.k] >= m.n && !saw.has(m.id))
    .sort((a, b) => (fresh(b) - fresh(a)) || (b.n - a.n) || (a.k === "streak" ? -1 : 1));
  const m = cand[0];
  if (!m) return null;
  const also = MILESTONES.filter(x => x.k === m.k && x.n < m.n && !saw.has(x.id)).map(x => x.id);
  return { id: m.id, zh: m.zh, en: m.en, also };
}
/* id → 句子(同一天重畫用;不認得的 id = null) */
export const byId = id => { const m = MILESTONES.find(x => x.id === id); return m ? { id: m.id, zh: m.zh, en: m.en } : null; };
