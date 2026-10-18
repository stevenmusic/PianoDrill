// 字被切掉檢查:overflow 不是 visible 的元素裡,文字實際的字框(含 g j p y 的下伸部、上方重音)超出元素可見範圍就列出來。
// 各尺寸 × 各分頁 × 中英文。用法:node tools/test/clip.mjs [尺寸名稱]
// PianoDrill / DrumDrill 共用(tools/test/sync.mjs 檢查):檢查函式一模一樣,畫面狀態腳本放在 @app 區段
import { open } from "./harness.mjs";
const ALL = [["se1-320", 320, 568, true], ["iphone-390", 390, 844, true], ["promax-430", 430, 932, true], ["iphone-land", 844, 390, true],
  ["ipad", 820, 1180, true], ["ipad-land", 1180, 820, true], ["laptop", 1280, 800, false], ["fhd", 1920, 1080, false]];
const only = process.argv[2];
const scan = page => page.evaluate(() => {
  const out = [];
  const clipBox = el => {   // 元素實際會切掉內容的範圍(往上找所有 overflow 不是 visible 的祖先,取交集)
    let r = { t: -1e9, b: 1e9, l: -1e9, r: 1e9 };
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.overflowY !== "visible" || s.overflowX !== "visible") {
        if (s.overflowY === "auto" || s.overflowY === "scroll") continue;   // 會捲的不算切掉
        const b = e.getBoundingClientRect();
        r = { t: Math.max(r.t, b.top), b: Math.min(r.b, b.bottom), l: Math.max(r.l, b.left), r: Math.min(r.r, b.right) };
      }
    }
    return r;
  };
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement, s = getComputedStyle(el);
    if (s.visibility === "hidden" || el.closest("[hidden]") || el.closest("svg") || el.closest(".stage") || el.closest("#t-osmd") || el.closest(".sr")) continue;   // .sr = 只給螢幕閱讀器(故意 1px、裁切)
    const rg = document.createRange(); rg.selectNodeContents(n);
    const rects = [...rg.getClientRects()].filter(r => r.width > 0 && r.height > 0);
    if (!rects.length) continue;
    const c = clipBox(el);
    if (c.b <= c.t || c.r <= c.l) continue;   // 整個被藏起來(收合)
    for (const r of rects) {
      if (r.bottom <= c.t || r.top >= c.b) continue;   // 整行在可見範圍外(捲動清單的其他列)
      const cutB = r.bottom - c.b, cutT = c.t - r.top;
      if (cutB > 1.5 || cutT > 1.5) { out.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${[...el.classList].join(".")} 「${n.textContent.trim().slice(0, 30)}」 ${cutB > 1.5 ? "下面切掉 " + cutB.toFixed(1) : "上面切掉 " + cutT.toFixed(1)}px`); break; }
    }
  }
  return out;
});
// @app-begin
const APP = "pianodrill";
const START = { onboarded: true, view: "tech", exam: { system: "abrsm", grade: 5 } };
const VIEWS = [["tech", ["scale", "arp", "hanon"]], ["sight", ["1", "5", "8"]], ["ear", ["note", "interval", "chord"]], ["exam", ["tech", "sight", "ear"]]];
// 同一個畫面再多看幾種內容
async function more(page, view, s, report){
  if (view === "tech") for (let i = 0; i < 6; i++) {   // 換幾題(不同長度、g j p y 的標題)
    const b = await page.evaluate(() => window.__scoreReady || 0);
    const btn = await page.$("#t-nextBtn:visible, #t-drawBtn:visible"); if (!btn) break;
    await btn.click(); await page.waitForFunction(b => (window.__scoreReady || 0) > b, b, { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(200);
    await report(`${view}/${s}`);
  }
}
// @app-end
let bad = 0;
for (const [name, w, h, mobile] of ALL.filter(v => !only || v[0] === only)) {
  const { page, close } = await open({ viewport: { width: w, height: h }, mobile });
  for (const lang of ["en", "zh"]) {
    await page.evaluate(([l, k, ls, st]) => { localStorage.clear(); localStorage.setItem(k, l); localStorage.setItem(ls, JSON.stringify(st)); }, [lang, APP + "-lang", APP + ".v1", START]);
    await page.reload(); await page.waitForFunction(() => window.__stageReady >= 1); await page.waitForTimeout(800);
    const seen = new Set();
    const report = async state => { for (const x of await scan(page)) { if (seen.has(x)) continue; seen.add(x); console.log(`${name} ${lang} ${state}: ${x}`); bad++; } };
    for (const [view, subs] of VIEWS) {
      await page.click(`#tabbar button[data-view="${view}"]`); await page.waitForTimeout(500);
      for (const s of subs) {
        if (s) await page.click(`#subSeg button[data-v="${s}"]`).catch(() => {});
        await page.waitForTimeout(view === "sight" ? 1500 : 600);
        await report(`${view}/${s}`);
        await more(page, view, s, report);
      }
    }
  }
  await close();
}
console.log(bad ? `✗ ${bad} 處文字被切掉` : "✓ 沒有文字被切掉");
process.exit(bad ? 1 : 0);
