/* 譜表下面的音名(字母;PianoDrill 視奏分頁的「顯示音名」、技巧分頁今日練習的關卡共用)。畫在 OSMD 的 SVG 上(每次 render、畫完指法之後再畫)。
   規則:每個譜表下面一排(右手在高音譜表下、左手在低音譜表下),同一行同一條水平線、對齊各自的音;
   用實際畫出來的 SVG 外框找第一個「每個字母都不碰到任何筆畫」(符桿、符尾、符槓、加線、重音、跳音、連結線 / 圓滑線、力度、指法、下一個譜表)的高度;
   音太密交錯成兩層、和弦一個音一層;字最小 minPx CSS px(預設 10);不寫進符頭(手機上符頭只有約 5px)。
   回傳 { need: 要幾排, crowded: 有沒有找不到空位 }(呼叫的人照這個多留空間再排一次) */
const NOTE_LETTER = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };
export function paintNoteNames(svg, osmd, { cls = 'note-name', size: wantSize = null, minPx = 10, units = 1.3, skip = null } = {}) {
  svg.querySelectorAll('.' + cls).forEach((el) => el.remove());
  if (!osmd || !osmd.GraphicSheet) return null;
  // 位置用畫面座標量,再換回 SVG 自己的座標(OSMD 的 SVG 有 viewBox 縮放;SVG 座標 = VexFlow 座標,一個譜線間距 = 10)
  const ctm = svg.getScreenCTM();
  if (!ctm || !ctm.a) return;
  const k = ctm.a, toX = (cx) => (cx - ctm.e) / k, toY = (cy) => (cy - ctm.f) / (ctm.d || k);
  const NS = 'http://www.w3.org/2000/svg', size = wantSize || Math.max(minPx / k, units * 10), padX = Math.max(2.5, 2 / k), padY = Math.max(3, 3 / k), gapX = size * 0.35;   // 留白至少 2–3 CSS px
  // 譜上所有筆畫的外框(SVG 座標)
  const ink = [];
  for (const el of svg.querySelectorAll('path, rect, text, ellipse, circle, line, polyline, polygon, use')) {
    const b = el.getBoundingClientRect();
    if (!b.width && !b.height) continue;
    ink.push({ l: toX(b.left), r: toX(b.right), t: toY(b.top), b: toY(b.bottom) });
  }
  // 每一行、每一個譜表一排:{ top, bottom(譜表第一條、最後一條線), next(下面那個譜表的第一條線), items }
  const rows = new Map();
  for (const measures of osmd.GraphicSheet.MeasureList) {
    for (const m of measures) {
      if (!m || !m.getVFStave) continue;
      const line = m.ParentStaffLine;
      const vf = m.getVFStave();
      const key = `${line && line.PositionAndShape ? Math.round(line.PositionAndShape.AbsolutePosition.y * 10) : 0}`;
      if (!rows.has(key)) rows.set(key, { key, top: vf.getYForLine(0), bottom: vf.getYForLine(4), items: [] });
      const row = rows.get(key);
      for (const se of m.staffEntries) {
        for (const gve of se.graphicalVoiceEntries) {
          if (skip && skip(gve)) continue;   // 呼叫的人不要寫的(例如有和弦表時的柱式和弦、按住的音)
          for (const gn of gve.notes) {
            const src = gn.sourceNote;
            if (!src || src.isRest() || !src.Pitch || src.IsGraceNote) continue;
            if (src.NoteTie && src.NoteTie.StartNote !== src) continue;   // 連結線後面的音不再寫
            const head = gn.getSVGGElement && gn.getSVGGElement();
            const nh = head && (head.querySelector('.vf-notehead') || head);
            if (!nh) continue;
            const box = nh.getBoundingClientRect();
            const p = src.Pitch, letter = NOTE_LETTER[p.FundamentalNote] ?? '';
            const acc = p.AccidentalHalfTones > 0 ? '♯' : p.AccidentalHalfTones < 0 ? '♭' : '';
            row.items.push({ x: toX(box.left + box.width / 2), y: toY(box.top + box.height / 2), h: p.getHalfTone ? p.getHalfTone() : 0, text: letter + acc });
          }
        }
      }
    }
  }
  const list = [...rows.values()].sort((a, b) => a.top - b.top);
  list.forEach((row, i) => { row.next = i + 1 < list.length ? list[i + 1].top : Infinity; });
  let maxBottom = 0, need = 1, crowded = false;
  for (const row of list) {
    // 同一個位置的音(和弦)排成一欄:高的音在上面(照音高排:和弦的每個音拿到的是同一個符頭群組,不能照 y 排);同一個字只寫一次
    const cols = [];
    for (const it of row.items.sort((a, b) => a.x - b.x)) {
      let col = cols.find((c) => Math.abs(c.x - it.x) < 4);
      if (!col) { col = { x: it.x, notes: [] }; cols.push(col); }
      col.notes.push(it);
    }
    for (const col of cols) col.texts = [...new Set(col.notes.sort((a, b) => b.h - a.h || a.y - b.y).map((it) => it.text))];
    if (!cols.length) continue;
    // 先畫出來量字的大小(基線到頂端的距離、寬度),再決定高度
    let lineH = 0, ascent = 0;
    for (const col of cols) {
      col.els = col.texts.map((text) => {
        const el = document.createElementNS(NS, 'text');
        el.setAttribute('class', cls);
        el.setAttribute('x', String(col.x)); el.setAttribute('y', '0');
        el.setAttribute('text-anchor', 'middle'); el.setAttribute('font-size', String(size));
        el.setAttribute('aria-hidden', 'true');
        el.textContent = text;
        svg.appendChild(el);
        return el;
      });
      col.w = 0;
      for (const el of col.els) { const bb = el.getBBox(); col.w = Math.max(col.w, bb.width); lineH = Math.max(lineH, bb.height); ascent = Math.max(ascent, -bb.y); }
    }
    // 音很密(十六分音符)時字比音距寬:相鄰的字會碰在一起的,下一個字往下一層(交錯);和弦一個音一層。
    // 每一欄找最上面一個放得下(這幾層在這個寬度裡都還空著)的層
    const levelRight = [];
    for (const col of cols) {
      const l = col.x - col.w / 2, n = col.els.length;
      let base = 0;
      while (Array.from({ length: n }, (_, j) => levelRight[base + j] ?? -Infinity).some((r) => r + gapX > l)) base++;
      for (let j = 0; j < n; j++) levelRight[base + j] = col.x + col.w / 2;
      col.base = base;
      // 每一欄只看水平方向會碰到的筆畫
      col.ink = ink.filter((b) => b.r > l - padX && b.l < col.x + col.w / 2 + padX);
    }
    const levels = levelRight.length;
    need = Math.max(need, levels);
    // 從譜表最下面那條線往下找第一個整排都不碰到筆畫的高度(字的頂端 = y)
    const hits = (y) => {
      let n = 0;
      for (const col of cols) {
        const t = y + col.base * lineH - padY, b = y + (col.base + col.els.length) * lineH + padY;
        for (const box of col.ink) if (box.b > t && box.t < b) n++;
      }
      return n;
    };
    const start = row.bottom + 3, limit = Number.isFinite(row.next) ? row.next - levels * lineH - 2 : row.bottom + 400;
    let best = start, bestHits = Infinity;
    for (let y = start; y <= Math.max(start, limit); y += 1) {
      const n = hits(y);
      if (n < bestHits) { best = y; bestHits = n; }
      if (!n) break;
    }
    if (bestHits) crowded = true;
    for (const col of cols) {
      col.els.forEach((el, j) => { el.setAttribute('y', String(best + ascent + (col.base + j) * lineH)); el.dataset.row = `${row.key}:${col.base + j}`; });
      const top = best + col.base * lineH, bottom = top + lineH * col.els.length;
      ink.push({ l: col.x - col.w / 2, r: col.x + col.w / 2, t: top, b: bottom });   // 下一排也要避開
      maxBottom = Math.max(maxBottom, bottom);
    }
  }
  // 最後一行的音名超出 SVG 的底:把 SVG 加高(不然會被切掉)
  const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb.every(Number.isFinite) && maxBottom + 6 > vb[1] + vb[3]) {
    const extra = maxBottom + 6 - (vb[1] + vb[3]);
    svg.setAttribute('viewBox', `${vb[0]} ${vb[1]} ${vb[2]} ${vb[3] + extra}`);
    const h = parseFloat(svg.getAttribute('height'));
    if (Number.isFinite(h)) svg.setAttribute('height', String(h + extra * k));
  }
  return { need, crowded };
}
