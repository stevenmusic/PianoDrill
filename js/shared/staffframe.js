/* 認音(PianoDrill)/ 認譜(DrumDrill)的譜框:一題一個音 / 一個記號,不管出什麼題目,譜框高度與譜表位置都不變(兩個 App 逐位元組相同;sync.json same)。
   OSMD 畫完以後改 SVG 的 viewBox:
     - 垂直:以第一條譜線為準,上面留 above 個間距、最後一條譜線下面留 below 個間距(容納設定允許的最多加線、符桿、記號);
       symmetric = 上下一樣多(譜表在框裡垂直置中)
     - 水平:以譜表左端為準,這一種設定第一次畫出來的譜表寬度置中(之後的題目有升降記號、譜表變長,左端也不動)
     - 大小:一個間距最多 spPx 個 CSS px;框最高 maxH px、寬度 = 容器寬
   萬一某一題的墨跡超出預留的範圍(大譜號、臨時記號比預估的高):這一種設定(key)的留白往外加,之後都用加大的(只增不減,不會再跳) */
const memo = new Map();

/* SVG 裡的水平線(譜線):OSMD / VexFlow 的 `M x y L x2 y`,在 g.vf-measure 底下 */
function staffLines(svg){
  const ys = [], xs = [];
  for (const p of svg.querySelectorAll("g.vf-measure > path")) {
    const m = /^M\s*([-\d.]+)[ ,]([-\d.]+)\s*L\s*([-\d.]+)[ ,]([-\d.]+)$/.exec((p.getAttribute("d") || "").trim());
    if (!m || Math.abs(+m[2] - +m[4]) > 0.01 || Math.abs(+m[3] - +m[1]) < 20) continue;
    ys.push(+m[2]); xs.push(+m[1], +m[3]);
  }
  if (ys.length < 2) return null;
  const u = [...new Set(ys.map(y => Math.round(y * 100) / 100))].sort((a, b) => a - b);
  let sp = Infinity;
  for (let i = 1; i < u.length; i++) sp = Math.min(sp, u[i] - u[i - 1]);
  return { top: u[0], bottom: u[u.length - 1], left: Math.min(...xs), right: Math.max(...xs), sp };
}

/* 墨跡的上下界(SVG 單位;改 viewBox 之前量) */
function inkBox(svg){
  const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
  if (!r.height || !vb || !vb.height) return null;
  const k = vb.height / r.height;
  let top = Infinity, bottom = -Infinity;
  for (const el of svg.querySelectorAll("path, text, rect, circle, ellipse, line")) {
    const b = el.getBoundingClientRect();
    if (!b.width && !b.height) continue;
    top = Math.min(top, vb.y + (b.top - r.top) * k);
    bottom = Math.max(bottom, vb.y + (b.bottom - r.top) * k);
  }
  return Number.isFinite(top) ? { top, bottom } : null;
}

export function frameStaff(svg, box, { key = "", above = 3, below = 3, symmetric = false, spPx = 12, maxH = 240, left = 0 } = {}){
  if (!svg || !box) return false;
  const L = staffLines(svg);
  if (!L || !Number.isFinite(L.sp) || L.sp <= 0) return false;
  const sp = L.sp, m = memo.get(key) || { above: 0, below: 0, width: 0 };
  let a = Math.max(above, m.above), b = Math.max(below, m.below);
  const ink = inkBox(svg);
  if (ink) {
    a = Math.max(a, (L.top - ink.top) / sp + 0.4);
    b = Math.max(b, (ink.bottom - L.bottom) / sp + 0.4);
  }
  if (symmetric) a = b = Math.max(a, b);
  const width = m.width || (L.right - L.left);
  memo.set(key, { above: a, below: b, width });
  const vbTop = L.top - a * sp, vbH = (L.bottom - L.top) + (a + b) * sp;
  const boxW = Math.max(60, box.clientWidth || 0);
  const contentW = width + left * sp;   // left = 譜表左邊還有的東西(大譜表的大括號),以間距算
  const s = Math.max(0.2, Math.min(spPx / sp, maxH / vbH, (boxW - 16) / (contentW + 2 * sp)));
  // 寬高取整數 px,viewBox 照同一個比例(不讓 preserveAspectRatio 再縮放、置中,譜表才不會差 1 px)
  const W = Math.floor(boxW), H = Math.round(vbH * s), vbW = W / s, cx = L.left - left * sp + contentW / 2;
  svg.setAttribute("viewBox", `${(cx - vbW / 2).toFixed(3)} ${vbTop.toFixed(3)} ${vbW.toFixed(3)} ${(H / s).toFixed(3)}`);
  svg.setAttribute("width", String(W));
  svg.setAttribute("height", String(H));
  svg.style.display = "block";
  return true;
}
