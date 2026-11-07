/* 琴鍵條(2026-11 使用者選「專心練習畫面」A + 琴鍵條;純畫面元件,不 import、不放聲音、不能點)。
   今日練習的關卡譜下面一條琴鍵:這一關用到的鍵淡金色 + 手指號碼,播放示範時跟著音亮(金色;放開時淡出,減少動態效果時直接熄)。
   時間用播放用的同一條 AudioContext 時間線(now() = audio.audioNow()),每一格 requestAnimationFrame 照時間決定哪些鍵亮著,
   所以播放中改速度(cancel(from) 再重排)、停止(clear())都跟聲音一致。
   createKeystrip(el, { low, high, now }) → {
     range(low, high)               // 顯示的範圍(midi;頭尾是黑鍵會補到旁邊的白鍵)
     mark(map, soft)                // map: Map / 物件 midi → 手指號碼(null = 只亮不寫);soft: midi → 手指號碼(這個位置沒彈到的手指,只寫淡色號碼)
     label(midi, html)              // 那個鍵下面一行字(例:「▲ 中央 C / 右手大拇指放這裡」);null = 拿掉
     light(midi, when, dur)         // when 秒(AudioContext 時間)開始亮 dur 秒
     cancel(from)                   // from 秒之後才開始的都不亮了(播放中改速度)
     clear()                        // 全部熄掉(停止)
     redraw(), destroy()
   }
   外觀在 css/app.css 的 .keystrip(高度 --ks-h:手機 64、平板 / 桌機 132、手機橫式 44) */
const BLACK = [1, 3, 6, 8, 10];
export const isBlackKey = m => BLACK.includes(((m % 12) + 12) % 12);
const NS = "http://www.w3.org/2000/svg";
const toMap = x => x instanceof Map ? x : new Map(Object.entries(x || {}).map(([k, v]) => [+k, v]));
export function createKeystrip(el, { low = 48, high = 72, now = null } = {}){
  let lo = 48, hi = 72, marks = new Map(), soft = new Map(), lbl = null, sched = [], raf = 0, lit = new Set(), keys = new Map();
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("aria-hidden", "true"); svg.setAttribute("preserveAspectRatio", "none");
  const cap = document.createElement("div"); cap.className = "ks-lbl"; cap.hidden = true;
  el.classList.add("keystrip"); el.replaceChildren(svg, cap);
  const clock = () => (now ? now() : performance.now() / 1000);
  function setRange(l, h){
    lo = Math.min(l, h); hi = Math.max(l, h);
    if (isBlackKey(lo)) lo--;
    if (isBlackKey(hi)) hi++;
    draw();
  }
  function draw(){
    const r = svg.getBoundingClientRect(), W = Math.round(r.width), H = Math.round(r.height);
    if (!W || !H) return;   // 看不到(hidden、寬度 0):等 ResizeObserver 再畫
    const whites = []; for (let m = lo; m <= hi; m++) if (!isBlackKey(m)) whites.push(m);
    const kw = W / whites.length, bw = kw * 0.62, bh = H * 0.6;
    const fs = Math.max(12, Math.min(22, kw * 0.5, H * 0.3)), bfs = Math.max(12, Math.min(16, bw * 0.62));   // 指法數字不小於 12(70 歲看得清)
    let wh = "", bl = "";
    const cls = m => (marks.has(m) ? " on" : soft.has(m) ? " soft" : "") + (lit.has(m) ? " lit" : "");
    whites.forEach((m, i) => {
      const x = i * kw, f = marks.has(m) ? marks.get(m) : soft.get(m);
      wh += `<rect data-m="${m}" class="w${cls(m)}" x="${x + 0.5}" y="0.5" width="${kw - 1}" height="${H - 1}" rx="${Math.min(4, kw / 6)}"/>`;
      if (f != null) wh += `<text class="${marks.has(m) ? "" : "soft"}" x="${x + kw / 2}" y="${H - Math.max(4, H * 0.08)}" style="font-size:${fs}px">${f}</text>`;
    });
    whites.forEach((m, i) => {
      const b = m + 1; if (b > hi || !isBlackKey(b)) return;
      const x = (i + 1) * kw - bw / 2, f = marks.has(b) ? marks.get(b) : soft.get(b);
      bl += `<rect data-m="${b}" class="b${cls(b)}" x="${x}" y="0" width="${bw}" height="${bh}" rx="${Math.min(3, bw / 5)}"/>`;
      if (f != null) bl += `<text class="bt${marks.has(b) ? "" : " soft"}" x="${x + bw / 2}" y="${bh - Math.max(3, bh * 0.1)}" style="font-size:${bfs}px">${f}</text>`;
    });
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.innerHTML = wh + bl;
    keys = new Map([...svg.querySelectorAll("rect[data-m]")].map(k => [+k.dataset.m, k]));
    placeLabel(kw, whites);
  }
  function placeLabel(kw, whites){
    if (!lbl) { cap.hidden = true; return; }
    const i = whites.indexOf(lbl.m - (isBlackKey(lbl.m) ? 1 : 0));
    if (i < 0) { cap.hidden = true; return; }
    cap.hidden = false; cap.innerHTML = lbl.html;
    const W = whites.length * kw, x = (i + (isBlackKey(lbl.m) ? 1 : 0.5)) * kw;
    cap.style.left = (x / W * 100) + "%";
  }
  function paint(set){
    for (const m of lit) if (!set.has(m)) { const k = keys.get(m); if (k) k.classList.remove("lit"); }
    for (const m of set) if (!lit.has(m)) { const k = keys.get(m); if (k) k.classList.add("lit"); }
    lit = set;
  }
  function tick(){
    raf = 0;
    const t = clock(), set = new Set();
    sched = sched.filter(e => e.b > t);
    for (const e of sched) if (e.a <= t) set.add(e.m);
    paint(set);
    if (sched.length) raf = requestAnimationFrame(tick);
  }
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => draw()) : null;
  if (ro) ro.observe(el);
  setRange(low, high);
  return {
    el,
    range: setRange,
    mark(map, softMap){ marks = toMap(map); soft = toMap(softMap); draw(); },
    label(m, html){ lbl = m == null || !html ? null : { m, html }; draw(); },
    light(m, when, dur){
      sched.push({ m, a: when, b: when + Math.max(0.05, dur) });
      if (!raf) raf = requestAnimationFrame(tick);
    },
    cancel(from){ sched = sched.filter(e => e.a < from); sched.forEach(e => { if (e.b > from) e.b = from; }); },
    clear(){ sched = []; if (raf) cancelAnimationFrame(raf); raf = 0; paint(new Set()); },
    redraw: draw,
    destroy(){ this.clear(); if (ro) ro.disconnect(); el.replaceChildren(); }
  };
}
