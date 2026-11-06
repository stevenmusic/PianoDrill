/* 過關慶祝(PianoDrill / DrumDrill 共用,兩邊逐位元組相同;tools/test/sync.json same)。
   今日練習過關時,題目卡狀態句上面一條短橫幅「過關 ✓」+ 一顆線稿星星畫出來(約 1.5 秒後自己消失);只在過關,複習升盒、穩了 / 做到了不放。
   不推版面(app.css 絕對定位疊在狀態句上面那一列;不蓋住狀態句、題目與底部固定按鈕)、不跳視窗;狀態句不再寫「過關 ✓」(只寫接著練 / 下一關),所以橫幅的字讀得到(星星 aria-hidden)。
   2026-11 使用者選「專心練習畫面」A,一起加(都不佔位置、不彩帶、不跳視窗):
   - sweep:譜紙上一道金色掃光 0.4 秒(app.css 的 .cel-sweep)
   - btn:主要按鈕左邊一個勾勾描線出來 + 輕微放大一下(.cel-pop / .cel-tick;勾勾放不下就只放大)
   - bar:關卡進度條(標籤「手指 6 / 33」下面那條)從舊的位置補到新的位置({ el, from, to },百分比)
   prefers-reduced-motion:不動,只顯示靜態的星星、勾勾與字(進度條直接到新位置、沒有掃光)。聲音由各 App 自己放(琴 Salamander 琶音、鼓的鼓聲)。
   celebrate(host, text, { before, ms, sweep, btn, bar }) → { el, cancel() }:放在 host 裡 before 的前面(沒給 = 最前面);同一個 host 只留一條 */
export const CELEBRATE_MS = 1600;
const STAR = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path pathLength="1" d="M12 3.5l2.6 5.3 5.9.9-4.25 4.15 1 5.85L12 16.95 6.75 19.7l1-5.85L3.5 9.7l5.9-.9z"/></svg>';
const TICK = '<svg class="cel-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path pathLength="1" d="M20 6 9 17l-5-5"/></svg>';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const still = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
/* 重新觸發一次 CSS 動畫:拿掉 class、讓瀏覽器量一次、再加回去 */
function replay(el, cls, ms){
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  clearTimeout(el["_" + cls]); el["_" + cls] = setTimeout(() => el.classList.remove(cls), ms);
}
export function celebrate(host, text, { before = null, ms = CELEBRATE_MS, sweep = null, btn = null, bar = null } = {}){
  if (!host) return null;
  host.querySelectorAll(":scope > .celebrate").forEach(el => el.remove());
  const el = document.createElement("div");
  el.className = "celebrate";
  el.style.setProperty("--cel-ms", ms + "ms");
  el.innerHTML = STAR + `<span>${esc(text)}</span>`;
  host.insertBefore(el, before && before.parentNode === host ? before : host.firstChild);
  const calm = still(), extra = [];
  if (sweep && !calm) replay(sweep, "cel-sweep", 500);
  if (btn) {
    if (!calm) replay(btn, "cel-pop", 400);
    // 勾勾放在按鈕左邊的內距裡(不擠字);字的左邊沒有 30px 空間就不放
    const lbl = btn.querySelector(".btn-label") || btn, room = lbl.getBoundingClientRect().left - btn.getBoundingClientRect().left;
    btn.querySelectorAll(":scope > .cel-tick").forEach(t => t.remove());
    if (room >= 34) { btn.classList.add("cel-host"); btn.insertAdjacentHTML("beforeend", TICK); const t = btn.lastElementChild; t.style.setProperty("--cel-ms", ms + "ms"); extra.push(t); }
  }
  if (bar && bar.el && bar.to !== bar.from) {
    const to = Math.max(0, Math.min(100, bar.to)), from = Math.max(0, Math.min(100, bar.from));
    bar.el.style.width = to + "%";
    if (!calm && bar.el.animate) bar.el.animate([{ width: from + "%" }, { width: to + "%" }], { duration: 700, delay: 150, easing: "cubic-bezier(.2,.7,.2,1)", fill: "backwards" });
  }
  const t = setTimeout(() => { el.remove(); extra.forEach(x => x.remove()); }, ms);
  return { el, cancel(){ clearTimeout(t); el.remove(); extra.forEach(x => x.remove());
    for (const [n, c] of [[sweep, "cel-sweep"], [btn, "cel-pop"]]) if (n) { clearTimeout(n["_" + c]); n.classList.remove(c); } } };
}
