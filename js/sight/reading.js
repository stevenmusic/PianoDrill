/* 視奏分頁的「認音」(子項目第一格;照學習順序:認音 → 右手 → 左手 → 雙手)。
   一題一個音(OSMD 畫一個全音符),點下面的琴鍵(一個八度,白鍵寫音名;答音名,不管八度)。答對馬上下一題;答錯:標出正確的鍵、寫音名、播那個音(Salamander 取樣)。
   設定全部是一直看得到的按鈕(不用下拉、不收起來),點一下就換題:
     範圍快捷鈕(= 視奏 4 階的範圍:高音譜表用右手、低音譜表用左手、大譜表兩手合起來)、自訂範圍(小鍵盤 C1–C7:點最低音、再點最高音;旁邊 ‹ › 微調)、
     譜號(高音 / 低音 / 大譜表)、位置(全部 / 只線 / 只間)、升降(只有白鍵 / 加升降)、模式(練習 / 60 秒 / 連對)
   挑戰、最高分、最常錯的 3 個(下一輪出現機率加倍)在 js/shared/drill.js;設定與紀錄存在 pianodrill.sight.v1 的 read(消毒)。
   都是 App 的練習設定;不寫級數、考試名稱 */
import { tr, pairText } from '../shared/i18n.js';
import * as audio from '../shared/audio.js';
import { createDrill } from '../shared/drill.js';
import { STAGES, midiName } from './stages.js';
import { frameStaff } from '../shared/staffframe.js';

const LOW = 24, HIGH = 96;   // 小鍵盤 C1–C7
const WHITE = [0, 2, 4, 5, 7, 9, 11];
const LETTER = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
const isBlack = (m) => !WHITE.includes(((m % 12) + 12) % 12);
const dstepOf = (m, alter) => { const w = m - alter; return Math.floor(w / 12) * 7 + WHITE.indexOf(((w % 12) + 12) % 12) - 7; };   // C4 = 28
/* 一個音的名字:alter = 1 升、−1 降(黑鍵)、0 白鍵 */
const nameOf = (m, alter) => { const w = m - alter; return LETTER[((w % 12) + 12) % 12] + (alter > 0 ? '♯' : alter < 0 ? '♭' : '') + (Math.floor(w / 12) - 1); };
const pcLabel = (pc, flat) => (WHITE.includes(pc) ? LETTER[pc] : flat ? LETTER[(pc + 1) % 12] + '♭' : LETTER[pc] + '♯');
const CLEFS = ['treble', 'bass', 'grand'];
const POS = ['all', 'line', 'space'];
const MODES = ['practice', 'time', 'streak'];
const quickRange = (clef, n) => { const st = STAGES[n - 1]; return clef === 'treble' ? [...st.rh] : clef === 'bass' ? [...st.lh] : [st.lh[0], st.rh[1]]; };

export function cleanRead(o) {
  const r = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  const ok = (v, list, d) => (list.includes(v) ? v : d);
  const out = { clef: ok(r.clef, CLEFS, 'treble'), pos: ok(r.pos, POS, 'all'), acc: r.acc === true, mode: ok(r.mode, MODES, 'practice'),
    lo: Number.isInteger(r.lo) ? r.lo : 60, hi: Number.isInteger(r.hi) ? r.hi : 67, best: r.best, miss: r.miss };
  out.lo = Math.max(LOW, Math.min(HIGH, out.lo)); out.hi = Math.max(LOW, Math.min(HIGH, out.hi));
  if (out.hi - out.lo < 4) out.hi = Math.min(HIGH, out.lo + 4);
  return out;
}

export function createReading({ $, store, save, onAnswered = () => {} }) {
  const R = store;   // pianodrill.sight.v1 的 read
  const drill = createDrill({ store: R, save, onEnd: (res) => showEnd(res) });
  let osmd = null, q = null, last = null, pendingLo = null, active = false, lock = false, nextTimer = 0, session = { ok: 0, n: 0 }, endRes = null, t0 = 0;
  const setting = () => `${R.clef}:${R.lo}-${R.hi}:${R.pos}:${R.acc ? 'acc' : 'w'}`;

  /* ── 題庫:範圍內(白鍵 / 加黑鍵),照位置篩(線上 / 間上;C4 在加線上)── */
  function items() {
    const out = [];
    for (let m = R.lo; m <= R.hi; m++) {
      const spells = isBlack(m) ? (R.acc ? [1, -1] : []) : [0];
      for (const a of spells) {
        const d = dstepOf(m, a), line = ((d - 30) % 2 + 2) % 2 === 0;
        if (R.pos === 'line' && !line) continue;
        if (R.pos === 'space' && line) continue;
        out.push(`${m}:${a}`);
      }
    }
    // 加升降:白鍵也有一些(升降一半一半出現在題目裡,太多黑鍵會只練黑鍵)
    return out;
  }
  const parse = (id) => { const [m, a] = id.split(':').map(Number); return { m, a, name: nameOf(m, a) }; };
  /* 範圍的最高音在最上面的譜表上面幾條加線、最低音在最下面的譜表下面幾條(譜框的上下留白) */
  function sideLedgers() {
    const hiD = dstepOf(R.hi, isBlack(R.hi) ? -1 : 0), loD = dstepOf(R.lo, isBlack(R.lo) ? 1 : 0);
    const topLine = R.clef === 'bass' ? 26 : 38, bottomLine = R.clef === 'treble' ? 30 : 18;
    return { above: hiD > topLine ? Math.floor((hiD - topLine) / 2) : 0, below: loD < bottomLine ? Math.floor((bottomLine - loD) / 2) : 0 };
  }
  /* 範圍內最多幾條加線(高音譜表 E4–F5、低音譜表 G2–A3;大譜表:中央 C 以上算高音譜表) */
  function ledgers() {
    const count = (d, treble) => { const lo = treble ? 30 : 18, hi = treble ? 38 : 26; return d < lo ? Math.floor((lo - d) / 2) : d > hi ? Math.floor((d - hi) / 2) : 0; };
    let n = 0;
    for (const m of [R.lo, R.hi]) {
      const d = dstepOf(m, isBlack(m) ? 1 : 0), treble = R.clef === 'treble' || (R.clef === 'grand' && m >= 60);
      n = Math.max(n, count(d, treble));
    }
    return n;
  }

  /* ── 畫一個音(OSMD;大譜表:中央 C 以上在高音譜表) ── */
  function xmlFor(m, a) {
    const w = m - a, step = LETTER[((w % 12) + 12) % 12], oct = Math.floor(w / 12) - 1;
    const grand = R.clef === 'grand', staff = grand ? (m >= 60 ? 1 : 2) : 1;
    const clefs = grand ? '<staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef>'
      : R.clef === 'bass' ? '<clef><sign>F</sign><line>4</line></clef>' : '<clef><sign>G</sign><line>2</line></clef>';
    const acc = a > 0 ? '<accidental>sharp</accidental>' : a < 0 ? '<accidental>flat</accidental>' : '';
    const note = `<note><pitch><step>${step}</step>${a ? `<alter>${a}</alter>` : ''}<octave>${oct}</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type>${acc}${grand ? `<staff>${staff}</staff>` : ''}</note>`;
    const other = grand ? `<backup><duration>4</duration></backup><note print-object="no"><rest/><duration>4</duration><voice>2</voice><type>whole</type><staff>${3 - staff}</staff></note>` : '';
    return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name></part-name></score-part></part-list><part id="P1"><measure number="1">`
      + `<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time print-object="no"><beats>4</beats><beat-type>4</beat-type></time>${clefs}</attributes>`
      + `${note}${other}<barline location="right"><bar-style>none</bar-style></barline></measure></part></score-partwise>`;
  }
  let drawSeq = 0;
  async function draw() {
    if (!q || typeof opensheetmusicdisplay === 'undefined') return;
    const box = $('rdScore');
    if (!osmd) {
      osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(box, { autoResize: false, drawTitle: false, drawPartNames: false, drawMeasureNumbers: false, drawingParameters: 'compacttight' });
    }
    const my = ++drawSeq;
    try {
      await osmd.load(xmlFor(q.m, q.a));
      if (my !== drawSeq) return;   // 載入中又換了題目:交給新的那一次畫
      // 大譜表兩個譜表的距離固定(不跟著音的位置變),譜框裡的譜表才不會動
      const er = osmd.EngravingRules;
      er.StaffDistance = er.BetweenStaffDistance = 7; er.MinSkyBottomDistBetweenStaves = 0;
      osmd.zoom = 1;
      osmd.render();
      fit();
    } catch (e) { console.error(e); }
  }
  /* 譜框:這個設定允許的最多加線(上下一樣多,譜表垂直置中);同一個設定換題時框與譜表一動都不動(js/shared/staffframe.js) */
  function fit() {
    const svg = $('rdScore').querySelector('svg');
    if (!svg || !$('rdScore').clientWidth) return;
    const { above, below } = sideLedgers();
    const pad = Math.max(above, below, 1) + 2 + (R.acc ? 1.8 : 0);   // 升降記號(降記號比符頭高)
    const land = matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
    const maxH = land ? Math.max(130, innerHeight - 200) : Math.max(150, Math.min(270, innerHeight * 0.32));
    frameStaff(svg, $('rdScore'), { key: setting(), above: pad, below: pad, symmetric: true, spPx: R.clef === 'grand' ? 10 : 12, maxH, left: R.clef === 'grand' ? 1.2 : 0 });
  }

  /* ── 出題 / 作答 ── */
  function next() {
    clearTimeout(nextTimer); lock = false;
    const list = items();
    if (!list.length) { q = null; $('rdScore').innerHTML = ''; say(() => tr('這個範圍沒有符合的音,換一個範圍或位置。', 'No notes match — change the range or position.')); return; }
    const id = drill.pick(list, setting(), Math.random, last);
    last = id; q = { id, ...parse(id) }; t0 = performance.now();
    // 譜和琴鍵之間這一行不空著:平常寫題目,答了寫對錯
    say(() => tr('這是什麼音?點琴鍵作答', 'Which note? Tap a key'));
    paintKeys();
    draw();
  }
  function answer(pc) {
    if (!q || lock || !active) return;
    if (R.mode !== 'practice' && !drill.running) return;
    const target = ((q.m % 12) + 12) % 12, ok = pc === target;
    const flat = q.a < 0;
    // 「最常把 F3 看成 A3」:回答的音放在離題目最近的八度
    let gm = pc; while (gm < q.m - 6) gm += 12; while (gm > q.m + 6) gm -= 12;
    const givenName = nameOf(gm, isBlack(gm) ? (flat ? -1 : 1) : 0);
    session.n++; if (ok) session.ok++;
    onAnswered((performance.now() - t0) / 1000);
    paintKeys(pc, ok);
    lock = true;
    wrongName = ok ? null : q.name;
    if (ok) { say(() => tr('對了', 'Right'), 'ok'); }
    else { const nm = q.name; say(() => tr(`答案是 ${nm}`, `It was ${nm}`), 'no'); play(q.m); }
    const res = drill.answer(setting(), q.name, givenName, ok);
    paintTop(); paintMiss();
    if (res) return;   // 挑戰結束(showEnd 已經畫了)
    if (R.mode !== 'practice' && !drill.running) return;
    nextTimer = setTimeout(() => { if (active) next(); }, ok ? 450 : 1500);
  }
  async function play(m) {
    try {
      const ctx = audio.ensureAudio();
      if (ctx.state !== 'running') await ctx.resume().catch(() => {});
      await audio.loadPianoFor([{ midi: m, vel: 72 }], 1);
      const t = audio.audioNow() + 0.02;
      audio.playPianoNote(m, t, t + 0.9, t + 0.9, 72, false);
    } catch (e) { /* 取樣載不到就不出聲 */ }
  }
  let msgFn = null;
  function toTop(card) {
    const r = card.getBoundingClientRect(), head = document.querySelector('header'), top = head ? head.getBoundingClientRect().bottom : 0;
    if (r.top < top || r.bottom > innerHeight - 60) window.scrollTo({ top: Math.max(0, scrollY + r.top - top - 8) });
  }
  function say(fn, cls = '') { msgFn = fn; const el = $('rdMsg'); el.classList.remove('ok', 'no'); if (cls) el.classList.add(cls); pairText(el, fn); }

  /* ── 作答鍵盤:一個八度(C–B),白鍵寫音名 ── */
  function paintKeys(tapped = null, ok = null) {
    const kb = $('rdKbd');
    if (!kb.children.length) {
      const w = 100 / 7;
      let html = WHITE.map((pc) => `<div class="k wk" data-pc="${pc}"><b>${LETTER[pc]}</b></div>`).join('');
      [1, 3, 6, 8, 10].forEach((pc) => { const i = WHITE.indexOf(pc - 1) + 1; html += `<div class="k bk" data-pc="${pc}" style="left:calc(${i * w}% - ${w * 0.39}%);width:${w * 0.78}%"></div>`; });
      kb.innerHTML = html;
    }
    for (const k of kb.querySelectorAll('.k')) {
      const pc = Number(k.dataset.pc);
      k.classList.toggle('off', !R.acc && isBlack(pc));
      k.classList.toggle('wrong', tapped != null && ok === false && pc === tapped);
      k.classList.toggle('right', tapped != null && q && pc === ((q.m % 12) + 12) % 12);
    }
  }

  /* ── 設定(一直看得到的按鈕)── */
  const segHTML = (opts, cur) => opts.map(([v, zh, en]) => `<button type="button" class="opt" data-v="${v}" aria-pressed="${String(v) === String(cur)}">${tr(zh, en)}</button>`).join('');
  function paintOpts() {
    const quick = [1, 2, 3, 4].map((n) => { const [lo, hi] = quickRange(R.clef, n); return [n, n === 4 ? '全範圍' : `${midiName(lo)}–${midiName(hi)}`, n === 4 ? 'Full' : `${midiName(lo)}–${midiName(hi)}`, lo, hi]; });
    const curQ = quick.find((x) => x[3] === R.lo && x[4] === R.hi);
    $('rdQuick').innerHTML = segHTML(quick.map((x) => x.slice(0, 3)), curQ ? curQ[0] : '');
    $('rdClef').innerHTML = segHTML([['treble', '高音', 'Treble'], ['bass', '低音', 'Bass'], ['grand', '大譜表', 'Grand']], R.clef);
    $('rdPos').innerHTML = segHTML([['all', '全部', 'All'], ['line', '只線', 'Lines'], ['space', '只間', 'Spaces']], R.pos);
    $('rdAcc').innerHTML = segHTML([['w', '只有白鍵', 'White keys'], ['acc', '加升降', '♯ and ♭']], R.acc ? 'acc' : 'w');
    $('rdMode').innerHTML = segHTML([['practice', '練習', 'Practice'], ['time', '60 秒', '60 s'], ['streak', '連對', 'Streak']], R.mode);
    $('rdLo').textContent = midiName(R.lo); $('rdHi').textContent = midiName(R.hi);
    pairText($('rdLedger'), () => (ledgers() ? tr(`最多 ${ledgers()} 條加線`, `Up to ${ledgers()} ledger line${ledgers() > 1 ? 's' : ''}`) : tr('沒有加線', 'No ledger lines')));
    for (const [id, zh, en] of [['rdQuickLbl', '範圍', 'Range'], ['rdClefLbl', '譜號', 'Clef'], ['rdPosLbl', '位置', 'Notes on'], ['rdAccLbl', '升降', 'Sharps/flats'], ['rdModeLbl', '模式', 'Mode'], ['rdLoLbl', '最低音', 'Lowest'], ['rdHiLbl', '最高音', 'Highest']]) $(id).textContent = tr(zh, en);
    pairText($('rdNote'), () => tr('用 ‹ › 調最低音與最高音,按住可以連續移動。題目、範圍與最常錯的加倍出現都是 App 的練習設定。', 'Set the lowest and highest notes with ‹ › (hold to move fast). Ranges and doubled misses are App practice settings.'));
    for (const [id, zh, en] of [['rdLoDown', '最低音降一個', 'Lowest down'], ['rdLoUp', '最低音升一個', 'Lowest up'], ['rdHiDown', '最高音降一個', 'Highest down'], ['rdHiUp', '最高音升一個', 'Highest up']]) $(id).setAttribute('aria-label', tr(zh, en));
  }
  /* 題目卡上一行寫目前的設定(例如「高音譜表 C4–C5 · 只出線上」)+ 分數 */
  function setText() {
    const clef = { treble: tr('高音譜表', 'Treble'), bass: tr('低音譜表', 'Bass'), grand: tr('大譜表', 'Grand staff') }[R.clef];
    const pos = { all: '', line: tr(' · 只出線上', ' · lines only'), space: tr(' · 只出間上', ' · spaces only') }[R.pos];
    return `${clef} ${midiName(R.lo)}–${midiName(R.hi)}${pos}${R.acc ? tr(' · 加升降', ' · ♯/♭') : ''}`;
  }
  function paintTop() {
    pairText($('rdSet'), setText);
    const run = drill.running, k = R.mode;
    let s = '';
    if (k === 'practice') s = session.n ? tr(`答對 ${session.ok} / ${session.n}`, `${session.ok} / ${session.n} right`) : '';
    else if (run) s = k === 'time' ? tr(`${drill.score} 題 · 剩 ${drill.left()} 秒`, `${drill.score} · ${drill.left()} s left`) : tr(`連對 ${drill.score}`, `Streak ${drill.score}`);
    else s = tr(`最高 ${drill.best(setting(), k)}`, `Best ${drill.best(setting(), k)}`);
    $('rdScoreTxt').textContent = s;
    // 挑戰模式還沒開始 / 結束:大按鈕「開始」蓋在譜上(作答鍵先不能按)
    const waiting = k !== 'practice' && !run;
    $('rdStart').hidden = !waiting;
    $('rdKbd').classList.toggle('idle', waiting);
    if (waiting) $('rdStartLbl').textContent = endRes ? tr('再挑戰一次', 'Try again') : k === 'time' ? tr('開始 60 秒挑戰', 'Start 60 s challenge') : tr('開始連對挑戰', 'Start streak challenge');
  }
  function paintMiss() {
    const t = drill.top(setting());
    pairText($('rdMiss'), () => (t.length ? tr('最常錯:', 'Most missed: ') + t.map((x) => tr(`把 ${x.target} 看成 ${x.answer}(${x.n} 次)`, `${x.target} read as ${x.answer} (${x.n}×)`)).join(tr(';', '; ')) + tr('。下一輪這幾個會多出現(練習設定)。', '. These come up more often next round (practice setting).') : ''));
  }
  let wrongName = null;
  function showEnd(res) {
    endRes = res;
    clearTimeout(nextTimer); lock = true;
    const wn = res.reason === 'wrong' ? wrongName : null;
    if (res.reason === 'stop' || res.reason === 'restart') { paintTop(); return; }
    say(() => (wn ? tr(`答案是 ${wn}。`, `It was ${wn}. `) : '') + (res.kind === 'time' ? tr(`時間到:答對 ${res.score} 題`, `Time's up: ${res.score} right`) : tr(`連對 ${res.score} 題`, `Streak: ${res.score}`))
      + (res.newBest ? tr(' · 新紀錄!', ' · New best!') : tr(` · 最高 ${res.best}`, ` · best ${res.best}`)), res.newBest ? 'ok' : '');
    paintTop(); paintMiss();
  }
  function changed() {
    if (drill.running) drill.stop();
    endRes = null; session = { ok: 0, n: 0 };
    save(); paintOpts(); paintTop(); paintMiss(); next();
  }

  /* 事件 */
  const segClick = (id, fn) => $(id).addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (b) fn(b.dataset.v); });
  segClick('rdQuick', (v) => { const [lo, hi] = quickRange(R.clef, Number(v)); R.lo = lo; R.hi = hi; pendingLo = null; changed(); });
  segClick('rdClef', (v) => {
    if (v === R.clef) return;
    // 換譜號:目前的範圍是快捷鈕的話,換成新譜號同一格的範圍
    const n = [1, 2, 3, 4].find((k) => { const [lo, hi] = quickRange(R.clef, k); return lo === R.lo && hi === R.hi; });
    R.clef = v;
    if (n) [R.lo, R.hi] = quickRange(v, n);
    changed();
  });
  segClick('rdPos', (v) => { R.pos = v; changed(); });
  segClick('rdAcc', (v) => { R.acc = v === 'acc'; changed(); });
  // 換成挑戰模式:把題目卡捲到畫面上(「開始挑戰」的大按鈕在譜上)
  segClick('rdMode', (v) => { R.mode = v; changed(); if (v !== 'practice') toTop($('rdCard')); });
  const step = (m, d) => { let x = m + d; while (isBlack(x)) x += d; return x; };
  // 移一個白鍵;按住時只更新範圍顯示,放開才重新出題
  const adj = (which, d) => {
    if (which === 'lo') { const v = step(R.lo, d); if (v >= LOW && v <= R.hi - 4) R.lo = v; else return false; }
    else { const v = step(R.hi, d); if (v <= HIGH && v >= R.lo + 4) R.hi = v; else return false; }
    pendingLo = null; return true;
  };
  const hold = (id, which, d) => {
    const el = $(id); let t1 = 0, t2 = 0, moved = false, byPointer = false;
    const stop = () => { clearTimeout(t1); clearInterval(t2); t1 = t2 = 0; if (moved) { moved = false; changed(); } };
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      byPointer = true; moved = adj(which, d) || moved; paintOpts();
      t1 = setTimeout(() => { t2 = setInterval(() => { if (adj(which, d)) { moved = true; paintOpts(); } }, 110); }, 380);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, stop);
    // 鍵盤 Enter / 空白鍵、螢幕閱讀器:click 一次移一格(手指點的那一下 pointerdown 已經處理過)
    el.addEventListener('click', () => { if (byPointer) { byPointer = false; return; } if (adj(which, d)) changed(); });
  };
  // 轉向、改視窗寬度:譜框跟著容器寬重算(只改 viewBox,不重畫)
  let lastW = innerWidth, rzT = 0;
  addEventListener('resize', () => { if (innerWidth === lastW) return; lastW = innerWidth; clearTimeout(rzT); rzT = setTimeout(() => { if (active) fit(); }, 150); });
  hold('rdLoDown', 'lo', -1); hold('rdLoUp', 'lo', 1); hold('rdHiDown', 'hi', -1); hold('rdHiUp', 'hi', 1);
  $('rdKbd').addEventListener('pointerdown', (e) => { const k = e.target.closest('.k'); if (!k || k.classList.contains('off')) return; e.preventDefault(); answer(Number(k.dataset.pc)); });
  $('rdStart').onclick = () => {
    endRes = null; session = { ok: 0, n: 0 };
    drill.start(R.mode, setting(), () => paintTop());
    paintTop(); next();
  };

  return {
    /* 從右手 / 左手 / 雙手某一階切過來:預設範圍 = 那一階(右手 → 高音譜表、左手 → 低音、雙手 → 大譜表) */
    fromStage(hand, n) {
      R.clef = hand === 'right' ? 'treble' : hand === 'left' ? 'bass' : 'grand';
      [R.lo, R.hi] = quickRange(R.clef, n);
      save();
    },
    enter() {
      active = true;
      paintOpts(); paintTop(); paintMiss();
      if (!q) next(); else draw();
    },
    leave() { active = false; clearTimeout(nextTimer); if (drill.running) drill.stop(); },
    relang() { paintOpts(); paintTop(); paintMiss(); if (msgFn) say(msgFn); },
    onKey(e) {
      const i = 'cdefgab'.indexOf((e.key || '').toLowerCase());
      if (i >= 0) { answer(WHITE[i]); return true; }
      return false;
    },
    get state() { return { q: q && q.name, mode: R.mode, running: drill.running, score: drill.score, session: { ...session }, setting: setting() }; },
    answer, next
  };
}
