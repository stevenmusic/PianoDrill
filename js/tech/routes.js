/* 今日練習的路線與關卡(PianoDrill;引擎 js/shared/daily.js、卡片 js/shared/dailycard.js)。
   **暫時的示範關卡**(第一階段:讓流程可以走一遍;正式的手指 / 左手伴奏路線下一階段換掉):2 條路線各 2 關,只用現有的五指位置、音階、哈農。
   q = 題目(js/tech/exercise.js 的欄位);start / target(拍點的速度)、check(重點)都是 App 的練習設定。
   vary = 複習的變化(複習盒 1–5:隔 1、3、7、14、30 天):原樣 → 節奏型(附點)或觸鍵 → 觸鍵 / 強弱 / 拍點只響 1、3 → 換調 → 中途消失 + 最快;
   q 是這一次要改的題目欄位,name 是畫面上寫的「這次:…」 */
const C5 = { type: "scale", tonic: "C", quality: "major", articulation: "legato", motion: "similar", range: "5th" };
const C1 = { type: "scale", tonic: "C", quality: "major", articulation: "legato", motion: "similar", octaves: 1 };
export const ROUTES = [
  { id: "finger", name: ["手指", "Fingers"], levels: [
    { id: "F1", name: ["右手五指 C 到 G", "RH five fingers C–G"], q: { ...C5, hands: "RH" }, start: 50, target: 72,
      check: [["一指一個鍵", "One finger per key"], ["每個音一樣大", "Every note even"]],
      vary: [{}, { q: { articulation: "staccato" }, name: ["斷奏", "Staccato"] }, { q: { dynamic: "p" }, name: ["弱(p)", "Soft (p)"], click: "one-three" },
        { q: { tonic: "G" }, name: ["換 G 大調", "In G major"] }, { click: "gap", fast: true }] },
    { id: "F2", name: ["哈農第 1 首 右手", "Hanon No. 1, RH"], q: { type: "hanon", no: 1, tonic: "C", quality: "major", hands: "RH", rhythm: "even", octaves: 1 }, start: 50, target: 72,
      check: [["手指抬起來再下鍵", "Lift each finger"], ["4、5 指一樣清楚", "Fingers 4–5 as clear"]],
      vary: [{}, { q: { rhythm: "dotted" }, name: ["附點節奏", "Dotted rhythm"] }, { q: { rhythm: "reverse" }, name: ["反附點", "Reverse dotted"] },
        { q: { tonic: "F" }, name: ["換 F 大調", "In F major"] }, { click: "gap", fast: true }] }] },
  { id: "scale", name: ["音階", "Scales"], unlock: { route: "finger", passed: "F1" }, levels: [
    { id: "C1", name: ["C 大調音階 右手", "C major scale, RH"], q: { ...C1, hands: "RH" }, start: 50, target: 76,
      check: [["大拇指穿過去不停頓", "Thumb passes smoothly"], ["音一樣大", "Notes even"]],
      vary: [{}, { q: { dynamic: "cresc-dim" }, name: ["漸強再漸弱", "Swell and fade"] }, { q: { articulation: "staccato" }, name: ["斷奏", "Staccato"] },
        { q: { tonic: "G" }, name: ["換 G 大調", "In G major"] }, { click: "gap", fast: true }] },
    { id: "C2", name: ["C 大調音階 雙手", "C major scale, hands together"], q: { ...C1, hands: "HT" }, start: 50, target: 76,
      check: [["兩手同時下鍵", "Hands exactly together"], ["換指的地方不停", "No bump at thumb turns"]] }] }
];

/* 暖身(不過關、只記時間):沒選考試時照日子輪流 C / G 大調五指位置雙手 */
export const WARM = [
  { q: { ...C5, hands: "HT" }, name: ["C 大調五指位置", "C five-finger position"] },
  { q: { ...C5, hands: "HT", tonic: "G" }, name: ["G 大調五指位置", "G five-finger position"] }
];
