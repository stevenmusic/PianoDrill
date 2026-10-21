/* 麥克風自動打分(PianoDrill 視奏「彈一遍」;檢定頁與視奏分頁共用)。
   全部是純函式(沒有 DOM、沒有 AudioContext),node 可測:test/sight/micscore.test.js、tools/sight/micscore-check.mjs(Salamander 取樣算成的音訊)。

   不要求照譜上的速度:
   1. 音頭(js/shared/onsets.js 的 detectOnsets,兩個 App 共用,不改)第一個 = 時間 0;
   2. 用動態規劃把偵測到的音頭對到譜上每個音的拍位置(alignOnsets):容許漏彈、多彈、中途停,
      每一步的代價 = 這一段的速度跟前面的速度差多少(用拍的比例算,快慢都公平);
   3. 對好以後:你的速度 = 扣掉停頓後的直線擬合;節奏 = 每個音離鄰近幾個音的直線差幾分之幾拍;
      穩定 = 每小節的局部速度跟整體差多少;連貫 = 停頓(比該有的多 ≥ 1 拍)、重來(連續多出來的音)、沒彈完;
   4. 音高(初級–2 級,checkPitches):只檢查「該出現的音有沒有出現」(音頭後的頻譜變化跟預期音的諧波樣板比對),C4 以下不判錯。
   結果是練習回饋,不換算官方分數、不出現等第字眼。門檻都是練習設定(寫在下面的常數)。 */

/* ── 練習設定 ── */
const MISS = 1.0;          // 漏掉一個譜上的音
const EXTRA = 0.8;         // 中間多出一個音頭(開頭、結尾的雜音不算)
const W_LOCAL = 3.0;       // 這一段跟前面的速度差(相對誤差)的權重
const W_GLOBAL = 0.6;      // 跟整體速度差(對數)的權重;只是讓第一步有個依據
const PAUSE_CAP = 1.4;     // 變慢(含停頓)最多算這麼多:停頓不是漏音
const JITTER = 0.025;      // 秒:音頭偵測與手的自然誤差,不算速度變化
const ALPHA = 0.35;        // 局部速度跟著走的比例

const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** 譜上每個起音(兩手同時 = 一個):{ beat(四分音符拍,從 0 起), bar(1 起), pitches[midi], grace } */
export function expectedEvents(score) {
  const q = score.divisions;
  const raw = [];
  for (const staff of [1, 2]) {
    let offset = 0;
    (score.staves[staff] || []).forEach((bar, index) => {
      for (const ev of bar.events) {
        if (!ev.rest && ev.pitch && ev.tie !== 'stop' && ev.tie !== 'both') {
          raw.push({ beat: offset / q, bar: index + 1, pitches: [ev.pitch, ...(ev.chord ?? [])].map((p) => p.midi), grace: !!ev.grace });
        }
        offset += ev.dur;
      }
    });
  }
  raw.sort((a, b) => a.beat - b.beat);
  const out = [];
  for (const e of raw) {
    const last = out[out.length - 1];
    if (last && Math.abs(e.beat - last.beat) < 0.01) { last.pitches.push(...e.pitches); last.grace = last.grace || e.grace; } else out.push({ ...e, pitches: [...e.pitches] });
  }
  return { events: out, barBeats: score.barDuration / q, bars: score.barCount, bpm: score.tempoBpm };
}

/* 整體速度的第一個估計(每拍幾秒):相鄰幾個音的「時間差 ÷ 拍數差」投票,最多票的那一格 */
function voteTempo(B, T) {
  const n = B.length, m = T.length;
  const STEP = 0.02;
  const votes = new Map();
  for (let i1 = 0; i1 < n; i1++) {
    const lo = Math.max(0, i1 - 4 - Math.round(i1 * 0.15)), hi = Math.min(m - 1, i1 + 4 + Math.round(i1 * 0.15));
    for (let k = 1; k <= 4 && i1 + k < n; k++) {
      const dB = B[i1 + k] - B[i1];
      if (dB < 0.24) continue;
      for (let j1 = lo; j1 <= hi; j1++) {
        for (let k2 = Math.max(1, k - 1); k2 <= k + 1 && j1 + k2 < m; k2++) {
          const r = (T[j1 + k2] - T[j1]) / dB;
          if (!(r > 0.12 && r < 3)) continue;
          const bin = Math.round(Math.log(r) / STEP);
          votes.set(bin, (votes.get(bin) || 0) + (k2 === k ? 1 : 0.5));
        }
      }
    }
  }
  const scored = [...votes.keys()].map((bin) => [bin, (votes.get(bin - 1) || 0) * 0.5 + votes.get(bin) + (votes.get(bin + 1) || 0) * 0.5]).sort((a, b) => b[1] - a[1]);
  const peaks = [];
  for (const [bin] of scored) { if (peaks.every((p) => Math.abs(p - bin) > 3)) peaks.push(bin); if (peaks.length >= 3) break; }
  const out = peaks.map((b) => Math.exp(b * STEP));
  if (out.length) out.push(out[0] * 2, out[0] / 2);
  if (n > 1 && m > 1) out.push(Math.max(0.12, (T[m - 1] - T[0]) / Math.max(0.5, B[n - 1] - B[0])));
  return out.length ? out : [0.75];
}

/**
 * 偵測到的音頭(秒)對到譜上的拍(B,遞增)。回傳 { pairs: [[i, j]], spb0 }。
 * 開頭、結尾多出來的音頭不扣分(按鈕聲、翻譜、彈完的雜音)。
 */
export function alignOnsets(B, T) {
  const n = B.length, m = T.length;
  if (!n || !m) return { pairs: [], spb0: 0 };
  // 整體速度先猜幾個(票數前三名、最高票的一半與兩倍、頭尾直線),每個都對一次,代價最小的那個
  let best = null;
  for (const G of voteTempo(B, T)) {
    const r = alignWith(B, T, G);
    if (!best || r.cost < best.cost) best = r;
  }
  return best;
}
function alignWith(B, T, G) {
  const n = B.length, m = T.length;
  const PI = 5, PJ = 6;
  const cost = new Float64Array(n * m).fill(Infinity);
  const tempo = new Float64Array(n * m);
  const back = new Int32Array(n * m).fill(-1);
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const k = i * m + j;
    let best = MISS * i, bestTempo = G, from = -1;   // 從這一對開始(前面的譜上的音都漏了,前面的音頭不算)
    for (let p = i - 1; p >= Math.max(0, i - PI); p--) {
      const dB = B[i] - B[p];
      for (let q = j - 1; q >= Math.max(0, j - PJ); q--) {
        const c0 = cost[p * m + q];
        if (c0 === Infinity) continue;
        const dT = T[j] - T[q];
        const prev = tempo[p * m + q];
        const want = dB * prev;
        const err = Math.max(0, Math.abs(dT - want) - JITTER) / Math.max(want, 0.15);
        let tc = dT > want ? Math.min(PAUSE_CAP, W_LOCAL * err) : W_LOCAL * err;
        tc += W_GLOBAL * Math.min(1, Math.abs(Math.log(dT / dB / G)));
        const c = c0 + MISS * (i - p - 1) + EXTRA * (j - q - 1) + tc;
        if (c < best) {
          best = c; from = p * m + q;
          const r = dT / dB;
          // 停頓(比該有的慢很多):速度不跟著變
          bestTempo = r > prev * 1.35 && dT - want > prev * 0.75 ? prev : prev * Math.exp(ALPHA * Math.log(r / prev));
        }
      }
    }
    cost[k] = best; tempo[k] = bestTempo; back[k] = from;
  }
  let end = -1, endCost = Infinity;
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const c = cost[i * m + j] + MISS * (n - 1 - i);
    if (c < endCost) { endCost = c; end = i * m + j; }
  }
  const pairs = [];
  for (let k = end; k >= 0; k = back[k]) pairs.push([Math.floor(k / m), k % m]);
  pairs.reverse();
  return { pairs, spb0: G, cost: endCost };
}

/* 直線擬合 y = a + s·x(最小平方;去掉離群點再算一次) */
function fitLine(xs, ys, reject = Infinity) {
  let idx = xs.map((_, i) => i);
  let a = 0, s = 0;
  for (let pass = 0; pass < 3; pass++) {
    const k = idx.length;
    if (k < 2) break;
    let mx = 0, my = 0;
    for (const i of idx) { mx += xs[i]; my += ys[i]; }
    mx /= k; my /= k;
    let sxx = 0, sxy = 0;
    for (const i of idx) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
    if (sxx <= 1e-9) break;
    s = sxy / sxx; a = my - s * mx;
    const keep = idx.filter((i) => Math.abs(ys[i] - (a + s * xs[i])) <= reject * s);
    if (keep.length === idx.length || keep.length < Math.max(2, k * 0.6)) break;
    idx = keep;
  }
  return { a, s };
}

/**
 * 打分。expected = expectedEvents(score);onsets = 偵測到的音頭(秒,同一把尺,第一個 = 時間 0 也可以不是)。
 * pitchOk(可選)= checkPitches 的結果(每個譜上的起音 true / false / null)。
 */
export function scorePerformance(expected, onsets, { pitchOk = null } = {}) {
  const { events, barBeats, bars, bpm } = expected;
  const n = events.length;
  const base = { scoreBpm: bpm, total: n, barIssues: {} };
  if (!onsets.length) return { ...base, silent: true };
  const B = events.map((e) => e.beat);
  const T = onsets;
  const { pairs } = alignOnsets(B, T);
  if (pairs.length < Math.min(3, n)) return { ...base, silent: false, tooFew: true, hits: pairs.length, missed: n - pairs.length, extra: T.length - pairs.length, accuracy: 0 };

  const matchOf = new Array(n).fill(-1);
  for (const [i, j] of pairs) matchOf[i] = j;
  const usedJ = new Set(pairs.map(([, j]) => j));

  /* 局部速度(每拍秒數):每一步的 時間差 ÷ 拍數差,取附近幾步的中位數 */
  const steps = [];
  for (let k = 1; k < pairs.length; k++) {
    const [p, q] = pairs[k - 1], [i, j] = pairs[k];
    steps.push({ k, p, i, dB: B[i] - B[p], dT: T[j] - T[q], r: (T[j] - T[q]) / (B[i] - B[p]) });
  }
  const refAt = (k) => {
    const near = [];
    for (let d = 1; near.length < 6 && d < steps.length; d++) {
      for (const x of [k - d, k + d]) if (x >= 0 && x < steps.length && steps[x].dB >= 0.24) near.push(steps[x].r);
    }
    return near.length ? median(near) : steps[k].r;
  };
  const issue = (bar, kind) => { (base.barIssues[bar] ||= new Set()).add(kind); };

  /* 連貫:停頓 = 某兩個音之間比該有的多出 ≥ 1 拍(而且慢了三成以上),或多出 ≥ 2 拍 */
  const pauses = [];
  const pauseExcess = new Map();   // step k → 多出來的秒數
  steps.forEach((st, k) => {
    const ref = refAt(k);
    const excess = st.dT - st.dB * ref;
    if ((excess >= ref && st.dT >= 1.3 * st.dB * ref) || excess >= 2 * ref) {
      pauses.push(events[st.i].bar);
      pauseExcess.set(k, excess);
      issue(events[st.i].bar, 'pause');
    }
  });
  /* 重來 / 一大段多出來的音:兩個對到的音之間連續 ≥ 3 個沒對到的音頭 */
  const restarts = [];
  for (let k = 1; k < pairs.length; k++) {
    const gap = pairs[k][1] - pairs[k - 1][1] - 1;
    if (gap >= 3) { restarts.push(events[pairs[k][0]].bar); issue(events[pairs[k][0]].bar, 'restart'); }
  }
  const lastI = pairs[pairs.length - 1][0];
  const unfinished = n - 1 - lastI >= Math.max(2, Math.round(n * 0.1));

  /* 扣掉停頓的時間 */
  const Tc = new Map();
  let shift = 0;
  Tc.set(pairs[0][0], T[pairs[0][1]]);
  for (let k = 1; k < pairs.length; k++) {
    if (pauseExcess.has(k - 1)) shift += pauseExcess.get(k - 1);
    Tc.set(pairs[k][0], T[pairs[k][1]] - shift);
  }
  const mi = pairs.map(([i]) => i);
  const xs = mi.map((i) => B[i]), ys = mi.map((i) => Tc.get(i));
  const fit = fitLine(xs, ys, 0.3);
  const spb = fit.s > 0 ? fit.s : median(steps.map((s) => s.r)) || 0.75;

  /* 節奏:每個音離「附近的音(不含自己)」的直線差幾拍 */
  const W = Math.max(2, barBeats);
  const errs = new Array(n).fill(null);
  for (const i of mi) {
    const nb = mi.filter((x) => x !== i && Math.abs(B[x] - B[i]) <= W);
    let pred, s = spb;
    const span = nb.length ? Math.max(...nb.map((x) => B[x])) - Math.min(...nb.map((x) => B[x])) : 0;
    if (nb.length >= 2 && span >= 1) {
      const f = fitLine(nb.map((x) => B[x]), nb.map((x) => Tc.get(x)), 0.3);
      if (f.s > 0) { s = f.s; pred = f.a + f.s * B[i]; }
    }
    if (pred === undefined) {
      const off = nb.length ? median(nb.map((x) => Tc.get(x) - spb * B[x])) : fit.a;
      pred = off + spb * B[i];
    }
    errs[i] = (Tc.get(i) - pred) / s;
  }
  let credit = 0;
  for (let i = 0; i < n; i++) {
    if (matchOf[i] < 0) { issue(events[i].bar, 'miss'); continue; }
    const e = Math.abs(errs[i]);
    credit += 1 - 0.8 * clamp((e - 0.07) / 0.28, 0, 1);
    if (e > 0.25) issue(events[i].bar, 'rhythm');
  }
  const hits = pairs.length;
  const innerExtra = (() => {   // 開頭、結尾的雜音不算
    let c = 0;
    for (let j = pairs[0][1]; j <= pairs[pairs.length - 1][1]; j++) if (!usedJ.has(j)) c++;
    return c;
  })();
  const rhythm = Math.round(100 * (credit / n) * (hits / (hits + 0.5 * innerExtra)));

  /* 穩定:每小節的局部速度(這一小節的音 + 下一小節第一個音的直線斜率)跟整體差多少 */
  const barDev = {};
  for (let bar = 1; bar <= bars; bar++) {
    const own = mi.filter((i) => events[i].bar === bar);
    const next = mi.find((i) => events[i].bar > bar);
    const pts = next !== undefined ? [...own, next] : own;
    if (pts.length < 2) continue;
    const span = B[pts[pts.length - 1]] - B[pts[0]];
    if (span < 1) continue;
    const f = fitLine(pts.map((i) => B[i]), pts.map((i) => Tc.get(i)));
    if (f.s > 0) barDev[bar] = f.s / spb - 1;
  }
  const devs = Object.values(barDev);
  const meanDev = devs.length ? devs.reduce((a, d) => a + Math.abs(d), 0) / devs.length : 0;
  for (const [bar, d] of Object.entries(barDev)) {
    const kinds = base.barIssues[bar];
    if (kinds && (kinds.has('pause') || kinds.has('restart'))) continue;
    if (d <= -0.12) issue(Number(bar), 'fast');
    else if (d >= 0.15) issue(Number(bar), 'slow');
  }
  // 整體趨勢:前三分之一 vs 後三分之一的速度
  let trend = null;
  const ordered = Object.keys(barDev).map(Number).sort((a, b) => a - b);
  if (ordered.length >= 3) {
    const third = Math.max(1, Math.floor(ordered.length / 3));
    const first = median(ordered.slice(0, third).map((b) => barDev[b]));
    const last = median(ordered.slice(-third).map((b) => barDev[b]));
    const ratio = (1 + first) / (1 + last);   // > 1 = 後面每拍比較短 = 變快
    if (ratio >= 1.15) trend = 'faster'; else if (ratio <= 1 / 1.15) trend = 'slower';
  }
  const stability = Math.round(clamp(100 - 500 * Math.max(0, meanDev - 0.02) - (trend ? 10 : 0), 0, 100));
  const continuity = Math.round(clamp(100 - 25 * pauses.length - 25 * restarts.length - (unfinished ? 30 : 0), 0, 100));

  /* 音高 */
  let pitch = null, wrong = 0, checked = 0;
  if (pitchOk) {
    pitchOk.forEach((ok, i) => {
      if (ok === null || ok === undefined || matchOf[i] < 0) return;
      checked++;
      if (!ok) { wrong++; issue(events[i].bar, 'wrong'); }
    });
    if (checked) pitch = Math.round((100 * (checked - wrong)) / checked);
  }
  const parts = pitch === null ? [[rhythm, 0.5], [stability, 0.25], [continuity, 0.25]] : [[rhythm, 0.4], [stability, 0.2], [continuity, 0.2], [pitch, 0.2]];
  const accuracy = Math.round(parts.reduce((a, [v, w]) => a + v * w, 0));
  return {
    ...base, silent: false, accuracy, rhythm, stability, continuity, pitch, wrong, checked,
    bpmEst: 60 / spb, spb, hits, missed: n - hits, extra: innerExtra,
    pauses, restarts, unfinished, trend, barDev, errs, pairs,
    barIssues: Object.fromEntries(Object.entries(base.barIssues).map(([k, v]) => [k, [...v]])),
  };
}

/* ── 音高:該出現的音有沒有出現(初級–2 級)── */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}
function spectrum(samples, start, size, N) {
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let k = 0; k < size; k++) {
    const x = samples[start + k];
    if (x === undefined) break;
    re[k] = x * (0.5 - 0.5 * Math.cos((2 * Math.PI * k) / (size - 1)));
  }
  fft(re, im);
  const mag = new Float64Array(N / 2);
  for (let k = 0; k < N / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
  return mag;
}
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
function salience(nov, midi, rate, N, H = 6) {
  let s = 0;
  for (let h = 1; h <= H; h++) {
    const f = hz(midi) * h * Math.sqrt(1 + 0.0004 * h * h);
    if (f > rate / 2 - 200) break;
    const c = (f * N) / rate, w = Math.max(1, c * (2 ** (0.3 / 12) - 1));
    let peak = 0;
    for (let b = Math.floor(c - w); b <= Math.ceil(c + w); b++) if (b > 0 && b < nov.length) peak = Math.max(peak, nov[b]);
    s += peak / Math.sqrt(h);
  }
  return s;
}
const RELATED = [0, 12, 19, 24, 28, 31, 36, -12, -19, -24];   // 八度、五度泛音:分不出來的不拿來比

/**
 * 每個譜上的起音:預期的音(C4 以上)有沒有出現。true / false / null(沒對到、C4 以下、太短分析不了)。
 * samples / rate = 錄音;onsets = 偵測到的音頭(錄音的秒數);pairs = alignOnsets 的配對。
 */
export function checkPitches(samples, rate, events, onsets, pairs, { minMidi = 60, ratio = 0.4, detail = null } = {}) {
  const out = new Array(events.length).fill(null);
  const size = Math.round(rate * 0.085);
  let N = 1; while (N < size * 2) N <<= 1;
  const pre = Math.round(rate * 0.012), post = Math.round(rate * 0.03);
  pairs.forEach(([i, j], idx) => {
    const ev = events[i];
    const targets = ev.pitches.filter((p) => p >= minMidi);
    if (!targets.length) return;
    const at = Math.round(onsets[j] * rate);
    const nextJ = idx + 1 < pairs.length ? pairs[idx + 1][1] : -1;
    const room = nextJ >= 0 ? Math.round(onsets[nextJ] * rate) - at - post : Infinity;
    const len = Math.min(size, room);
    if (len < rate * 0.04) return;
    const after = spectrum(samples, at + post, len, N);
    const before = spectrum(samples, Math.max(0, at - pre - len), len, N);
    const nov = after.map((v, k) => Math.max(0, v - before[k]));
    const others = ev.pitches;
    let ok = true;
    for (const p of targets) {
      const sp = salience(nov, p, rate, N);
      let rival = 0;
      for (let q = p - 9; q <= p + 9; q++) {
        if (q === p) continue;
        if (others.some((o) => RELATED.includes(q - o))) continue;
        rival = Math.max(rival, salience(nov, q, rate, N));
      }
      if (detail) detail.push({ i, p, r: sp / Math.max(rival, 1e-9) });
      if (sp < ratio * rival) ok = false;
    }
    out[i] = ok;
  });
  return out;
}

/* ── 音頭(鋼琴用):頻譜通量 ──
   js/shared/onsets.js 的 detectOnsets 用音量的跳升找音頭,適合鼓和斷奏;鋼琴圓滑奏前一個音還在響,整段音量差不多,幾乎找不到。
   這裡用「頻譜通量」(每個頻率比前一格多出來的量,對數壓縮)+ 往前看的自適應門檻 + 晚 3 格的找峰,
   一邊錄一邊算(createNoteOnsets:決定什麼時候停)跟整段分析(detectNotes:打分)用同一份程式。
   對數壓縮照這段錄音的琴聲大小調(ON_NORM / 音量):固定的壓縮會把比琴聲小 20 dB 的講話聲放大到跟琴聲差不多;
   整段分析再用線性的頻譜增加量篩一次(ON_GATE)。門檻照 tools/sight/micscore-stress.mjs(手的誤差、踏板、小聲、放遠、電扇、講話)調的。 */
const HOP_S = 0.01;
const ON_NORM = 0.1;       // 對數壓縮:λ = ON_NORM / 琴聲的 RMS(以前固定 100)
const ON_DELTA = 0.01;     // 頻譜通量要比附近的中位數多出這麼多
const ON_FLOOR = 0.0004;   // 音量的絕對下限(手機放遠、彈得小聲也要聽得到;以前 0.0015)
const ON_GATE = 0.15;      // 整段分析:線性頻譜增加量 < 第 80 百分位 × 0.15 的不算
export function createNoteOnsets(rate, { delta = ON_DELTA, rel = 0.3, level = 0 } = {}) {
  const hop = Math.round(rate * HOP_S);
  const size = 2048;
  const lo = Math.max(1, Math.floor((40 * size) / rate)), hi = Math.min(size / 2, Math.ceil((5000 * size) / rate));
  const win = new Float64Array(size);
  for (let k = 0; k < size; k++) win[k] = 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / (size - 1));
  const ring = new Float32Array(size);
  let filled = 0, sinceHop = 0, frame = 0;
  let zeros = 0, gapAt = -Infinity, validFrom = 0;   // mic.js 在瀏覽器跳過的地方補的靜音(一整段剛好是 0):碰到的那幾格不找音頭
  let prev = null;
  const flux = [], energy = [], linf = [];
  let noise = 1e-4, loud = level, last = -Infinity;   // 雜音底:一開始就彈也不會把第一個音當成雜音;loud = 琴聲多大(整段分析先給)
  const re = new Float64Array(size), im = new Float64Array(size);
  const found = [], lins = [];
  function analyse() {
    if (filled - gapAt < size + hop) {
      prev = null;
      flux.push(0); energy.push(0); linf.push(0);
      validFrom = flux.length + 1;   // 補的靜音之後:第一格沒有比較對象,再多等幾格才有門檻
      return;
    }
    let e = 0;
    for (let k = 0; k < size; k++) { const x = ring[(filled + k) % size]; re[k] = x * win[k]; im[k] = 0; e += x * x; }
    fft(re, im);
    const rms = Math.sqrt(e / size);
    loud = Math.max(loud * 0.9997, rms);
    const lam = ON_NORM / Math.max(loud, 0.002);
    const raw = new Float32Array(hi - lo);
    let f = 0, lf = 0;
    const had = !!prev;
    for (let b = lo; b < hi; b++) {
      const m = Math.hypot(re[b], im[b]);
      raw[b - lo] = m;
      if (prev) { const d = Math.log(1 + lam * m) - Math.log(1 + lam * prev[b - lo]); if (d > 0) f += d; const dl = m - prev[b - lo]; if (dl > 0) lf += dl; }
    }
    linf.push(had ? lf : 0);
    prev = raw;
    if (!had) f = 0;
    flux.push(f / (hi - lo));
    energy.push(rms);
    noise = Math.min(noise * 1.0005 + 1e-7, Math.max(rms, 1e-6));
    // 晚 3 格決定 frame - 3 是不是峰
    const t = flux.length - 1 - 3;
    if (t < validFrom + 6) return;
    const v = flux[t];
    for (let d = -3; d <= 3; d++) if (d && flux[t + d] !== undefined && flux[t + d] > v) return;
    const past = flux.slice(Math.max(validFrom, t - 20), t);
    const base = median(past);
    const en = Math.max(energy[t], energy[t + 1] ?? 0, energy[t + 2] ?? 0);
    const time = (t * hop + size / 2) / rate;
    if (v < base + delta + rel * base) return;
    if (en < Math.max(noise * 3, loud * 0.02, ON_FLOOR)) return;
    if (time - last < 0.07) return;
    last = time;
    found.push(time);
    lins.push(Math.max(linf[t - 1] ?? 0, linf[t], linf[t + 1] ?? 0, linf[t + 2] ?? 0));
  }
  return {
    push(chunk) {
      const before = found.length;
      for (let k = 0; k < chunk.length; k++) {
        const x = chunk[k];
        ring[filled % size] = x;
        filled++;
        if (x === 0) { if (++zeros >= 32) gapAt = filled; } else zeros = 0;
        if (filled >= size && ++sinceHop >= hop) { sinceHop = 0; frame++; analyse(); }
      }
      return found.slice(before);
    },
    get onsets() { return found; },
    get strength() { return lins; },
    get time() { return filled / rate; },
  };
}
/** 整段錄音的音頭(秒,從第一個取樣算) */
export function detectNotes(samples, rate, opts = {}) {
  // 琴聲有多大:整段每 10 ms 的 RMS 取第 95 百分位(第一個音之前的雜音才不會被放大)
  const hop = Math.round(rate * HOP_S), r = [];
  for (let k = 0; k + hop <= samples.length; k += hop) { let e = 0; for (let q = k; q < k + hop; q++) e += samples[q] * samples[q]; r.push(Math.sqrt(e / hop)); }
  r.sort((a, b) => a - b);
  const d = createNoteOnsets(rate, { ...opts, level: r[Math.floor(r.length * 0.95)] || 0 });
  d.push(samples);
  d.push(new Float32Array(Math.round(rate * 0.05)));
  // 比這段錄音大部分的音(第 80 百分位)小很多的音頭 = 旁邊的講話聲、雜音,不算
  const st = d.strength, ref = [...st].sort((a, b) => a - b)[Math.floor(st.length * 0.8)] || 0;
  return d.onsets.filter((_, k) => st[k] >= ON_GATE * ref);
}
