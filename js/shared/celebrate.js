/* 過關慶祝(PianoDrill / DrumDrill 共用,兩邊逐位元組相同;tools/test/sync.json same)。
   今日練習過關時,題目卡標籤那一列換成一條橫幅「過關 ✓ 關名」+ 一顆線稿星星畫出來(約 1.6 秒後自己消失);只在過關,複習升盒、穩了 / 做到了不放。
   不推版面、不跳視窗、不彩帶:over = 標籤列(疊在它上面、拉滿整排;那段時間標籤整排淡出 .cel-under,不留半顆);不蓋住狀態句、題目與底部固定按鈕;
   狀態句不再寫「過關 ✓」(只寫接著練 / 下一關),所以橫幅的字讀得到(星星 aria-hidden)。字級 --fs-body;放不下先縮成 --fs-sub,再放不下換行(不切成「…」;往上長)。
   2026-11 使用者選「專心練習畫面」A,一起加(都不佔位置、不彩帶、不跳視窗):
   - sweep:譜紙上一道金色掃光 0.4 秒(app.css 的 .cel-sweep)
   - btn:主要按鈕的圖示換成勾勾描線出來(▷ 那段時間藏起來,勾勾取代它;沒有圖示 = 放在左邊內距)+ 輕微放大一下(.cel-pop / .cel-tick / .cel-swap)
   - bar:關卡進度條(標籤「手指 6 / 33」下面那條)從舊的位置補到新的位置({ el, from, to },百分比);進度條在 over 裡 = 橫幅收掉才補(看得到)
   prefers-reduced-motion:不動,只顯示靜態的星星、勾勾與字,橫幅留 2.5 秒(STILL_MS;70 歲才看得到);進度條直接到新位置、沒有掃光。聲音由各 App 自己放(琴 Salamander 琶音、鼓的鼓聲)。
   celebrate(host, text, { before, ms, sweep, btn, bar, over }) → { el, cancel() }:放在 host 裡 before 的前面(沒給 = 最前面);同一個 host 只留一條 */
export const CELEBRATE_MS = 1600;
export const STILL_MS = 2500;   // 減少動態效果:靜態橫幅留久一點
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
export function celebrate(host, text, { before = null, ms = CELEBRATE_MS, sweep = null, btn = null, bar = null, over = null } = {}){
  if (!host) return null;
  if (host._cel) host._cel.cancel();   // 上一條還在:整個收掉(含它的計時器與 class),不讓舊的計時器提早拿掉新橫幅的 cel-under
  host.querySelectorAll(":scope > .celebrate").forEach(el => el.remove());
  const calm = still(), extra = [], undo = [];
  if (calm) ms = Math.max(ms, STILL_MS);
  const el = document.createElement("div");
  el.className = "celebrate";
  el.style.setProperty("--cel-ms", ms + "ms");
  el.innerHTML = STAR + `<span>${esc(text)}</span>`;
  host.insertBefore(el, before && before.parentNode === host ? before : host.firstChild);
  // 疊在標籤列上、拉滿整排;標籤整排淡出。量的是 host 的頂(狀態句之後才重畫、面板變高也不會跑掉)
  let o = null, h = null;
  if (over && over.getClientRects().length) {
    h = host.getBoundingClientRect(); o = over.getBoundingClientRect();
    Object.assign(el.style, { left: (o.left - h.left - host.clientLeft) + "px", width: o.width + "px", right: "auto", bottom: "auto", minHeight: o.height + "px" });
    over.classList.add("cel-under"); undo.push(() => over.classList.remove("cel-under"));
  }
  // 放不下:先縮字,再換行(不切成「…」)
  if (el.scrollWidth > el.clientWidth + 1) { el.classList.add("cel-s"); if (el.scrollWidth > el.clientWidth + 1) el.classList.add("cel-wrap"); }
  // 底對齊標籤列底(換行時往上長,不碰狀態句)
  if (o) el.style.top = (o.bottom - h.top - host.clientTop - el.offsetHeight) + "px";
  if (sweep && !calm) replay(sweep, "cel-sweep", 500);
  if (btn) {
    if (!calm) replay(btn, "cel-pop", 400);
    btn.querySelectorAll(":scope > .cel-tick").forEach(t => t.remove());
    // 勾勾取代按鈕的圖示(▷ 先藏起來,同一個位置);沒有圖示:放在左邊的內距裡(字的左邊沒有 34px 就不放)
    const ico = [...btn.children].find(c => c.tagName.toLowerCase() === "svg"), b = btn.getBoundingClientRect();
    const lbl = btn.querySelector(".btn-label") || btn, room = lbl.getBoundingClientRect().left - b.left;
    let x = null;
    if (ico && ico.getClientRects().length) { const r = ico.getBoundingClientRect(); x = r.left - b.left - btn.clientLeft + (r.width - 22) / 2; }
    else if (room >= 34) x = 12;
    if (x != null) {
      btn.classList.add("cel-host"); if (ico) btn.classList.add("cel-swap");
      btn.insertAdjacentHTML("beforeend", TICK); const t = btn.lastElementChild; t.style.setProperty("--cel-ms", ms + "ms"); t.style.left = x + "px"; extra.push(t);
      undo.push(() => btn.classList.remove("cel-swap"));
    }
  }
  if (bar && bar.el && bar.to !== bar.from) {
    const to = Math.max(0, Math.min(100, bar.to)), from = Math.max(0, Math.min(100, bar.from));
    bar.el.style.width = to + "%";
    // 進度條在標籤列裡(被橫幅蓋住、淡出)= 橫幅收掉以後才補,才看得到
    const late = !!(over && over.contains(bar.el));
    if (!calm && bar.el.animate) bar.el.animate([{ width: from + "%" }, { width: to + "%" }], { duration: 700, delay: late ? ms + 100 : 150, easing: "cubic-bezier(.2,.7,.2,1)", fill: "backwards" });
  }
  const end = () => { el.remove(); extra.forEach(x => x.remove()); undo.forEach(f => f()); if (host._cel === handle) host._cel = null; };
  const t = setTimeout(end, ms);
  const handle = { el, cancel(){ clearTimeout(t); end(); if (host._cel === handle) host._cel = null;
    for (const [n, c] of [[sweep, "cel-sweep"], [btn, "cel-pop"]]) if (n) { clearTimeout(n["_" + c]); n.classList.remove(c); } } };
  return (host._cel = handle);
}
