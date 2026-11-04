// 本週摘要(js/shared/digest.js)的檢查;兩個 App 同一份(sync.json same),verify.mjs 會呼叫;也可以單獨跑:node tools/test/checks/digest.mjs
//   0 天(一句鼓勵、不列分頁)、有資料(天數、分鐘、每個分頁一行、正確率)、7 天以外的不算、中英、英文單複數、過關最多 5 個
import { build } from "../../../js/shared/digest.js";

export default function check(ok){
  const days = ["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"];
  const app = "PianoDrill";
  // 0 天
  for (const lang of ["zh", "en"]) {
    const s = build({ app, days, mods: { tech: {}, sight: {}, ear: {} }, daily: [], lang });
    const ls = s.split("\n");
    ok(ls[0] === (lang === "zh" ? "PianoDrill 本週練習(10/29–11/4)" : "PianoDrill practice this week (10/29–11/4)"), `0 天 ${lang}:標題 ${ls[0]}`);
    ok(ls.length === 3 && ls[2] === "— PianoDrill", `0 天 ${lang}:標題 + 一句 + App 名:\n${s}`);
    ok(!/NaN|undefined|null/.test(s), `0 天 ${lang}:沒有 NaN / undefined`);
  }
  ok(build({ app, days, mods: {}, lang: "zh" }).includes("還沒有練習紀錄"), "0 天 zh:一句");
  ok(build({ app, days, mods: { tech: { "2026-10-01": { n: 9, sec: 9999 } } }, lang: "zh" }).includes("還沒有練習紀錄"), "7 天以外的不算");

  // 有資料
  const mods = {
    tech: { "2026-10-29": { n: 2, sec: 300 }, "2026-11-04": { n: 1, sec: 150 }, "2026-10-20": { n: 5, sec: 900 } },
    sight: { "2026-11-01": { n: 1, sec: 120 } },
    ear: { "2026-11-01": { n: 12, sec: 200, hits: 10, total: 12 }, "2026-11-03": { n: 8, sec: 100, hits: 6, total: 8 } }
  };
  const names = [["找到中央 C", "Find middle C"], ["手指號碼", "Finger numbers"]];
  const zh = build({ app, days, mods, daily: names, lang: "zh" }).split("\n");
  ok(zh[1] === "練了 4 / 7 天 · 共 14 分鐘", "zh 天數 / 分鐘:" + zh[1]);
  ok(zh[2] === "技巧:7 分鐘", "zh 技巧:" + zh[2]);
  ok(zh[3] === "視奏:1 題 · 2 分鐘", "zh 視奏:" + zh[3]);
  ok(zh[4] === "聽力:20 題 · 正確率 80%", "zh 聽力:" + zh[4]);
  ok(zh[5] === "今日練習過關:找到中央 C、手指號碼", "zh 過關:" + zh[5]);
  ok(zh[6] === "— PianoDrill" && zh.length === 7, "zh 最後一行 App 名");
  const en = build({ app, days, mods, daily: names, lang: "en" }).split("\n");
  ok(en[1] === "Practiced 4 of 7 days · 14 min in all", "en:" + en[1]);
  ok(en[2] === "Technique: 7 min", "en 技巧:" + en[2]);
  ok(en[3] === "Sight-reading: 1 question · 2 min", "en 單數:" + en[3]);
  ok(en[4] === "Aural: 20 questions · 80% right", "en 複數:" + en[4]);
  ok(en[5] === "Levels passed: Find middle C, Finger numbers", "en 過關:" + en[5]);

  // 有一個分頁沒練、不到 1 分鐘、沒有過關
  const s2 = build({ app, days, mods: { tech: { "2026-11-04": { n: 1, sec: 40 } } }, lang: "zh" }).split("\n");
  ok(s2[1] === "練了 1 / 7 天 · 共 不到 1 分鐘" || s2[1] === "練了 1 / 7 天 · 共不到 1 分鐘", "不到 1 分鐘:" + s2[1]);
  ok(s2[3] === "視奏:這週沒練" && s2[4] === "聽力:這週沒練", "沒練的分頁:" + s2.slice(3, 5));
  ok(!s2.some(l => l.startsWith("今日練習過關")), "沒有過關不寫那一行");
  const e2 = build({ app, days, mods: { ear: { "2026-11-04": { n: 1, sec: 30, hits: 1, total: 1 } } }, lang: "en" }).split("\n");
  ok(e2[1] === "Practiced 1 of 7 days · under 1 min in all" && e2[4] === "Aural: 1 question · 100% right" && e2[2] === "Technique: not this week", "en 單數 / 沒練:" + e2.join(" | "));

  // 過關最多 5 個
  const many = Array.from({ length: 7 }, (_, i) => [`第${i + 1}關`, `L${i + 1}`]);
  ok(build({ app, days, mods, daily: many, lang: "zh" }).includes("今日練習過關:第1關、第2關、第3關、第4關、第5關 等 7 關"), "zh 最多 5 個");
  ok(build({ app, days, mods, daily: many, lang: "en" }).includes("Levels passed: L1, L2, L3, L4, L5 and 2 more"), "en 最多 5 個");
  // 壞資料不出錯
  ok(!/NaN|undefined/.test(build({ app, days, mods: { tech: { "2026-11-04": { n: "x", sec: -5 } }, ear: null }, daily: [null, 3, ""], lang: "en" })), "壞資料");
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let fails = 0, n = 0;
  check((c, m) => { n++; if (!c) { fails++; console.log("✗ " + m); } return c; });
  console.log(fails ? `✗ ${fails} / ${n} 項失敗` : `✓ 本週摘要 ${n} 項`);
  process.exit(fails ? 1 : 0);
}
