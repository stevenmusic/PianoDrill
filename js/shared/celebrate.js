/* 過關慶祝(PianoDrill / DrumDrill 共用,兩邊逐位元組相同;tools/test/sync.json same)。
   今日練習過關時,題目卡狀態句上面一條短橫幅「過關 ✓」+ 一顆線稿星星畫出來(約 1.5 秒後自己消失);只在過關,複習升盒、穩了 / 做到了不放。
   不推版面(app.css 絕對定位疊在狀態句上面那一列;不蓋住狀態句、題目與底部固定按鈕)、不跳視窗;狀態句不再寫「過關 ✓」(只寫接著練 / 下一關),所以橫幅的字讀得到(星星 aria-hidden)。
   prefers-reduced-motion:不動,只顯示靜態的星星與字(app.css 的 .celebrate)。聲音由各 App 自己放(琴 Salamander 琶音、鼓的鼓聲)。
   celebrate(host, text, { before, ms }) → { el, cancel() }:放在 host 裡 before 的前面(沒給 = 最前面);同一個 host 只留一條 */
export const CELEBRATE_MS = 1600;
const STAR = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path pathLength="1" d="M12 3.5l2.6 5.3 5.9.9-4.25 4.15 1 5.85L12 16.95 6.75 19.7l1-5.85L3.5 9.7l5.9-.9z"/></svg>';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export function celebrate(host, text, { before = null, ms = CELEBRATE_MS } = {}){
  if (!host) return null;
  host.querySelectorAll(":scope > .celebrate").forEach(el => el.remove());
  const el = document.createElement("div");
  el.className = "celebrate";
  el.style.setProperty("--cel-ms", ms + "ms");
  el.innerHTML = STAR + `<span>${esc(text)}</span>`;
  host.insertBefore(el, before && before.parentNode === host ? before : host.firstChild);
  const t = setTimeout(() => el.remove(), ms);
  return { el, cancel(){ clearTimeout(t); el.remove(); } };
}
