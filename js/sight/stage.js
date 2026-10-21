/**
 * The reading stage: geometry, playhead and the bar highlight.
 *
 * The whole test renders in normal page flow — no fullscreen, no cropped
 * follow-window — so the reader can see the entire piece and just scrolls the
 * page like any other document. During playback the current bar is tinted
 * and a moving playhead sweeps across it; when playback moves to a new
 * system, that system is scrolled into view.
 *
 * Geometry comes from the rendered SVG rather than OSMD's graphic model:
 * every bar is a `g.vf-measure` whose id is its bar number, and it appears
 * once per staff, so the union of both is the bar's full height.
 */

/** How far down the window the line being played sits (the rest shows what comes next). */
const LEAD_RATIO = 0.16;

export function createStage(elements) {
  // osmd(可選):回傳目前的 OSMD,用來找每個音在小節裡的拍位置,播放軸才對準符頭正中央(沒有就照小節平均走)
  const { score, playline, highlight, osmd: osmdOf } = elements;

  /** @type {{bars: Map<number, object>, systems: object[], scale: number}} */
  let layout = { bars: new Map(), systems: [], scale: 1, origin: { x: 0, y: 0 } };
  let active = false;
  let currentSystem = -1;

  /** Read bar and system boxes out of the rendered SVG. */
  function measure() {
    const svg = score.querySelector('svg');
    layout = { bars: new Map(), systems: [], scale: 1, origin: { x: 0, y: 0 } };
    if (!svg) return layout;

    // getBBox is in SVG user units; the element may be laid out at another size.
    const viewBox = svg.viewBox?.baseVal;
    const rect = svg.getBoundingClientRect();
    const scale = viewBox?.width ? rect.width / viewBox.width : 1;

    const boxes = new Map();
    const contentLefts = new Map();
    for (const element of svg.querySelectorAll('g.vf-measure')) {
      const number = Number(element.id);
      // OSMD draws a mid-piece key change (Grade 8 modulation) as an extra
      // measure box with id -1; it is not a bar and must not be counted as one.
      if (!Number.isFinite(number) || number < 1) continue;
      const box = element.getBBox();
      const existing = boxes.get(number);
      boxes.set(number, existing ? union(existing, box) : toRect(box));

      /*
       * A bar's own box starts at the stave lines, which run under whatever
       * comes before its notes too — the clef, key and time signature that
       * VexFlow draws inside bar 1 of every system. The playhead and the
       * highlight block both need to start at the first actual note, not at
       * that leading furniture, or on every system's opening bar they
       * visibly start from the clef instead of beat one.
       */
      const noteLefts = [...element.children]
        .filter((child) => child.getAttribute('class') === 'vf-stavenote')
        .map((child) => child.getBBox().x);
      if (noteLefts.length) {
        const contentLeft = Math.min(...noteLefts);
        contentLefts.set(number, Math.min(contentLefts.get(number) ?? Infinity, contentLeft));
      }
    }
    if (!boxes.size) return layout;
    for (const [number, box] of boxes) box.contentLeft = contentLefts.get(number) ?? box.left;


    // Cluster bars into systems by vertical position.
    const ordered = [...boxes.entries()].sort((a, b) => a[1].top - b[1].top || a[1].left - b[1].left);
    const systems = [];
    for (const [number, box] of ordered) {
      const last = systems[systems.length - 1];
      const sameRow = last && box.top < last.bottom - (box.bottom - box.top) * 0.4;
      if (sameRow) {
        last.bars.push(number);
        last.top = Math.min(last.top, box.top);
        last.bottom = Math.max(last.bottom, box.bottom);
        last.left = Math.min(last.left, box.left);
        last.right = Math.max(last.right, box.right);
      } else {
        systems.push({ bars: [number], ...box });
      }
    }

    systems.forEach((system, index) => {
      for (const number of system.bars) boxes.get(number).system = index;
    });

    /*
     * A bar's box covers its notes, but slurs, hairpins and dynamics are drawn
     * outside it and can hang well below the staff. Grow each system to cover
     * every staff group it overlaps, or the highlight clips those.
     */
    for (const staffline of svg.querySelectorAll('g.staffline')) {
      const box = toRect(staffline.getBBox());
      const middle = (box.top + box.bottom) / 2;
      const system = systems.find((candidate) => middle >= candidate.top && middle <= candidate.bottom)
        ?? systems.find((candidate) => box.top < candidate.bottom && box.bottom > candidate.top);
      if (!system) continue;
      system.top = Math.min(system.top, box.top);
      system.bottom = Math.max(system.bottom, box.bottom);
    }

    /*
     * Where the SVG's own origin sits inside the box the highlight and the
     * playhead are positioned against.
     *
     * Both are absolutely positioned siblings of `#score`, so their `top`/
     * `left` are measured from `.score-frame`'s padding box — but the numbers
     * fed to them come from `getBBox`, which is measured from the *SVG's*
     * origin. Those two origins are not the same point: the frame carries its
     * own padding (room for the grade selector and countdown pinned to its
     * corners), and `#score` carries the padding `pinScoreTop` adds to hold
     * the staff at a fixed height. Ignoring the difference put the highlight
     * 78px above the bar it was meant to be tinting, with the block's lower
     * edge cutting through the middle of the bass stave.
     *
     * `clientLeft`/`clientTop` are the frame's border widths, since an
     * absolutely positioned offset starts at the padding box rather than the
     * border box.
     */
    const frame = highlight.offsetParent ?? score.parentElement;
    let origin = { x: 0, y: 0 };
    if (frame) {
      const frameRect = frame.getBoundingClientRect();
      origin = {
        x: rect.left - (frameRect.left + frame.clientLeft),
        y: rect.top - (frameRect.top + frame.clientTop),
      };
    }

    layout = { bars: boxes, systems, scale, origin };
    if (active) buildAnchors();   // 播放中重排(轉螢幕):錨點跟著重算
    return layout;
  }

  /*
   * 播放軸對準符頭正中央:每小節每個起音在小節裡的位置(0–1)與符頭中心 x(SVG 單位)。
   * 開始播放時才算(排版時 measure 會跑很多次)。同一時間有音就只看音(兩手、和弦取平均),
   * 只有休止符才用休止符;整小節休止、裝飾音不算(整小節休止的小節照小節平均走)。
   */
  function buildAnchors() {
    const at = new Map();
    try {
      for (const row of osmdOf?.()?.GraphicSheet?.MeasureList ?? []) {
        for (const gm of row ?? []) {
          const dur = gm?.parentSourceMeasure?.Duration?.RealValue;
          if (!dur || !layout.bars.has(gm.MeasureNumber)) continue;
          const bar = at.get(gm.MeasureNumber) || new Map();
          at.set(gm.MeasureNumber, bar);
          for (const entry of gm.staffEntries ?? []) {
            const f = Math.round((entry.relInMeasureTimestamp.RealValue / dur) * 1e4) / 1e4;
            for (const voice of entry.graphicalVoiceEntries ?? []) {
              for (const note of voice.notes ?? []) {
                const src = note.sourceNote;
                if (src?.IsGraceNote) continue;
                const rest = !!src?.isRest?.();
                if (rest && src.Length?.RealValue >= dur - 1e-9) continue;
                const x = noteCenter(note);
                if (x === null) continue;
                const a = bar.get(f) || { f, notes: [], rests: [] };
                (rest ? a.rests : a.notes).push(x);
                bar.set(f, a);
              }
            }
          }
        }
      }
    } catch { /* 沒有 OSMD 的圖形資料:照小節平均走 */ }
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    for (const [number, box] of layout.bars) {
      box.anchors = [...(at.get(number)?.values() ?? [])].map((a) => ({ f: a.f, x: mean(a.notes.length ? a.notes : a.rests) })).sort((a, b) => a.f - b.f);
    }
  }

  let half = 1;
  function begin() {
    if (!layout.systems.length) return false;
    buildAnchors();
    half = (playline.offsetWidth || 2) / 2;
    active = true;
    currentSystem = -1;
    playline.style.display = 'block';
    highlight.style.display = 'block';
    return true;
  }

  function end() {
    active = false;
    currentSystem = -1;
    playline.style.display = '';
    highlight.style.display = '';
  }

  /**
   * @param {number} bar 1-based bar number
   * @param {number} progress 0–1 through that bar
   */
  function update(bar, progress) {
    if (!active) return;
    const box = layout.bars.get(bar);
    if (!box) return;
    const { scale, origin } = layout;
    const system = layout.systems[box.system];

    if (box.system !== currentSystem) {
      currentSystem = box.system;
      /*
       * Look-ahead scrolling. The line being played sits near the top of the
       * window (LEAD_RATIO of the way down) instead of the middle, so the
       * line after it is already on screen while the player is still on this
       * one — a reader's eyes run ahead of their hands, and a line that only
       * appears once the playhead reaches it is read too late. It fires only
       * on a line change, so the reader can still scroll freely in between.
       */
      const viewport = window.innerHeight || document.documentElement.clientHeight;
      // 頂欄(含子項目列)固定在上方:目前這一行要在頂欄下面,不被蓋住
      const header = document.querySelector('header');
      const covered = header ? header.getBoundingClientRect().bottom : 0;
      const lineTop = highlight.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: Math.max(0, lineTop - covered - (viewport - covered) * LEAD_RATIO), behavior: 'smooth' });
    }

    const left = origin.x + box.contentLeft * scale;
    const width = (box.right - box.contentLeft) * scale;
    const top = origin.y + system.top * scale;
    const height = (system.bottom - system.top) * scale;

    highlight.style.left = `${left}px`;
    highlight.style.width = `${width}px`;
    highlight.style.top = `${top}px`;
    highlight.style.height = `${height}px`;

    const p = Math.min(Math.max(progress, 0), 1);
    const x = box.anchors?.length ? origin.x + anchorX(bar, box, p) * scale : left + width * p;
    playline.style.transform = `translateX(${x - half}px)`;   // 線的中心對準(線寬 2px)
    playline.style.top = `${top}px`;
    playline.style.height = `${height}px`;
  }

  /*
   * 小節裡的位置 → x(SVG 單位):在相鄰兩個起音的符頭中心之間內插;
   * 最後一個音之後走到下一小節第一個音(同一行),行尾走到小節線。
   */
  function anchorX(bar, box, p) {
    const list = box.anchors;
    if (p <= list[0].f) return list[0].x;
    const next = layout.bars.get(bar + 1);
    const endX = next && next.system === box.system && next.anchors?.length && next.anchors[0].f === 0 ? next.anchors[0].x : box.right;
    for (let i = 0; i < list.length; i++) {
      const a = list[i], b = list[i + 1] ?? { f: 1, x: Math.max(endX, a.x) };
      if (p <= b.f) return a.x + ((b.x - a.x) * (p - a.f)) / Math.max(b.f - a.f, 1e-9);
    }
    return list[list.length - 1].x;
  }

  return {
    measure,
    begin,
    end,
    update,
    get active() { return active; },
    get systems() { return layout.systems.length; },
  };
}

/* 一個音的符頭中心 x(SVG 單位);休止符用整個符號。升降記號、附點不算(.vf-modifiers) */
function noteCenter(note) {
  const g = note.getSVGGElement?.();
  if (!g) return null;
  const heads = [...g.querySelectorAll('.vf-notehead')].filter((h) => !h.closest('.vf-modifiers'));
  const boxes = (heads.length ? heads : [g]).map((h) => h.getBBox()).filter((b) => b.width > 0);
  if (!boxes.length) return null;
  return boxes.reduce((s, b) => s + b.x + b.width / 2, 0) / boxes.length;
}

/**
 * Where each bar starts and ends, in seconds from the first note.
 * Every bar lasts the same time — the generator never changes metre mid-test.
 */
export function barTimings(score) {
  const secondsPerBar = (60 / score.tempoBpm) * (score.barDuration / score.divisions);
  return { secondsPerBar, total: secondsPerBar * score.barCount };
}

function toRect(box) {
  return { left: box.x, right: box.x + box.width, top: box.y, bottom: box.y + box.height };
}

function union(rect, box) {
  return {
    left: Math.min(rect.left, box.x),
    right: Math.max(rect.right, box.x + box.width),
    top: Math.min(rect.top, box.y),
    bottom: Math.max(rect.bottom, box.y + box.height),
  };
}
