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
export function alignOnsets(B, T, pairCost = null) {
  const n = B.length, m = T.length;
  if (!n || !m) return { pairs: [], spb0: 0 };
  // 整體速度先猜幾個(票數前三名、最高票的一半與兩倍、頭尾直線),每個都對一次,代價最小的那個
  let best = null;
  for (const G of voteTempo(B, T)) {
    const r = alignWith(B, T, G, pairCost);
    if (!best || r.cost < best.cost) best = r;
  }
  return best;
}
function alignWith(B, T, G, pairCost = null) {   // pairCost(i, j):這一對另外的代價(今日練習用音高;視奏沒有 = 0,行為不變)
  const n = B.length, m = T.length;
  const PI = 5, PJ = 6;
  const cost = new Float64Array(n * m).fill(Infinity);
  const tempo = new Float64Array(n * m);
  const back = new Int32Array(n * m).fill(-1);
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const k = i * m + j;
    const pc = pairCost ? pairCost(i, j) : 0;
    let best = MISS * i + pc, bestTempo = G, from = -1;   // 從這一對開始(前面的譜上的音都漏了,前面的音頭不算)
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
        const c = c0 + MISS * (i - p - 1) + EXTRA * (j - q - 1) + tc + pc;
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
/* 對到譜上的音不到這個比例 = 沒聽到在彈這首(雜音的音頭也會被對到幾個,不能拿來打分) */
export const MATCH_MIN = 0.4;
/* pitchMatchRate 低於這個 = 聽不出譜上的音(沒彈琴只有講話、碰撞聲 ≤ 0.38;彈對的琴聲 ≥ 0.70,micscore-check / micscore-stress) */
export const PM_MIN = 0.5;
export function scorePerformance(expected, onsets, { pitchOk = null } = {}) {
  const { events, barBeats, bars, bpm } = expected;
  const n = events.length;
  const base = { scoreBpm: bpm, total: n, barIssues: {} };
  if (!onsets.length) return { ...base, silent: true };
  const B = events.map((e) => e.beat);
  const T = onsets;
  const { pairs } = alignOnsets(B, T);
  if (pairs.length < Math.min(n, Math.max(3, Math.ceil(n * MATCH_MIN)))) return { ...base, silent: false, tooFew: true, hits: pairs.length, missed: n - pairs.length, extra: T.length - pairs.length, accuracy: 0 };

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
const PM_RATIO = 1;   // pitchMatchRate:譜上的音要比附近 ±9 半音最突出的那個大才算「聽得出來」
const RELATED = [0, 12, 19, 24, 28, 31, 36, -12, -19, -24];
/**
 * 錄到的是不是這首曲子的琴聲:對到的音頭裡,譜上那個音(所有音域)聽得出來的比例(0–1;能比的不到 4 個 = null)。
 * 講話、碰撞聲、電視的音頭也會被對到譜上,但音高幾乎都對不上;彈錯幾個音不影響(看的是整體比例)。
 */
export function pitchMatchRate(samples, rate, events, onsets, pairs, ratio = PM_RATIO) {
  const ok = checkPitches(samples, rate, events, onsets, pairs, { minMidi: 0, ratio }).filter((v) => v !== null);
  return ok.length >= 4 ? ok.filter(Boolean).length / ok.length : null;
}   // 八度、五度泛音:分不出來的不拿來比

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
const ON_GATE = 0.15;      // 整段分析:線性頻譜增加量 < 第 80 百分位 × 0.15 的不算(strength[k] 對應 onsets[k])
const ON_SNR = 3.2;        // 整段分析:音頭之後的音量要比底噪大 3.2 倍(約 10 dB);底噪 = 最安靜的 100 ms,最多到琴聲(第 95 百分位)× ON_NF_CAP
const ON_NF_CAP = 0.1;     // 按下去就彈、曲子很密(沒有安靜的地方):底噪不會被估成琴聲的延音
/* 即時版(miclisten.js:只決定「聽到了」「彈完了」)沒有整段篩選,用保守的門檻,講話、雜音才不會一直重設「停 2 秒」的計時 */
export const LIVE = { delta: 0.03, floor: 0.0015 };
export function createNoteOnsets(rate, { delta = ON_DELTA, rel = 0.3, level = 0, floor = ON_FLOOR } = {}) {
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
    if (en < Math.max(noise * 3, loud * 0.02, floor)) return;
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
  const hop = Math.round(rate * HOP_S), rms = [];
  for (let k = 0; k + hop <= samples.length; k += hop) { let e = 0; for (let q = k; q < k + hop; q++) e += samples[q] * samples[q]; rms.push(Math.sqrt(e / hop)); }
  const r = [...rms].sort((a, b) => a - b);
  const d = createNoteOnsets(rate, { ...opts, level: r[Math.floor(r.length * 0.95)] || 0 });
  d.push(samples);
  d.push(new Float32Array(Math.round(rate * 0.05)));
  // 底噪 = 最安靜的 100 ms 的音量(麥克風、電扇、冷氣;沒彈的時候一直都在。錄音前後一定有空檔:按下去到第一個音、彈完停 2 秒;
  // 不用百分位:長又密的曲子安靜的地方不到一成,百分位會落在琴聲的延音上):
  // 音頭之後 80 ms 內最大聲的地方要比底噪大 ON_SNR 倍,不然是雜音的起伏(沒彈琴也會被當成音)
  let nf = Infinity;
  for (let k = 0; k + 10 <= rms.length; k++) { let e = 0; for (let q = k; q < k + 10; q++) e += rms[q] * rms[q]; nf = Math.min(nf, Math.sqrt(e / 10)); }
  if (!isFinite(nf)) nf = 0;
  nf = Math.min(nf, ON_NF_CAP * (r[Math.floor(r.length * 0.95)] || 0));
  const peakAfter = (t) => { let m = 0; const a = Math.max(0, Math.floor(t / HOP_S) - 2); for (let k = a; k <= a + 10 && k < rms.length; k++) m = Math.max(m, rms[k]); return m; };
  const keep = d.onsets.map((t) => peakAfter(t) >= ON_SNR * nf);
  const on = d.onsets.filter((_, k) => keep[k]), st = d.strength.filter((_, k) => keep[k]);
  // 比這段錄音大部分的音(第 80 百分位)小很多的音頭 = 旁邊的講話聲、雜音,不算
  // 音頭太少(< 6)不篩:第 80 百分位會接近最大的那個,小聲的音會被誤刪
  // opts.skip = 已知的拍點時間(今日練習聽你彈:App 自己放的拍點):拍點附近的音頭不拿來當「大部分的音」(拍點比小聲的琴聲大,會把琴聲篩掉);沒給 = 原本的行為
  const ref0 = opts.skip ? st.filter((_, k) => !opts.skip.some((c) => Math.abs(c - on[k]) <= (opts.skipWin ?? 0.05))) : st;
  if (ref0.length < 6) return on;
  const ref = [...ref0].sort((a, b) => a - b)[Math.floor(ref0.length * 0.8)];
  return on.filter((_, k) => st[k] >= ON_GATE * ref);
}

/**
 * 整段錄音 → 結果(App 與測試同一條路):音頭 → 對到譜上 → 是不是琴聲(音高)→ 打分(初級–2 級加上音高)。
 * 沒聽到琴聲(沒有音頭、對到的太少、音高幾乎都對不上)= { silent: true }。
 */
export function scoreRecording(samples, rate, score) {
  const exp = expectedEvents(score);
  const onsets = detectNotes(samples, rate);
  if (!onsets.length) return { silent: true };
  const { pairs } = alignOnsets(exp.events.map((e) => e.beat), onsets);
  const pm = pitchMatchRate(samples, rate, exp.events, onsets, pairs);
  if (pm !== null && pm < PM_MIN) return { silent: true, notPiano: true };
  const pitchOk = score.grade <= 2 ? checkPitches(samples, rate, exp.events, onsets, pairs) : null;
  const r = scorePerformance(exp, onsets, { pitchOk });
  return r.tooFew ? { silent: true, tooFew: true, hits: r.hits, total: r.total } : { ...r, onsets };
}

/* ── 今日練習「App 聽你彈」(右手單音的關;js/tech/patterns.js 的 listenExpected 給預期的音)──
   跟視奏的「彈一遍」不一樣:不打分,只判斷「這一輪有沒有彈對」(彈對 = 自動算「做到了」)。拿不準就給過,只有確定沒彈、確定彈錯才不過。
   一樣不要求照拍點的速度(音頭照樣用 alignOnsets 對到譜上);聽的時候 App 還在放拍點(xstick):
   opts.clicks = 錄音裡每一下拍點的時間(秒;App 自己排的,知道在哪裡),拍點附近、聽不出音高的音頭不算;opts.t0 = 錄音裡第 1 拍(預備拍之後)的時間,更早的音頭不算。
   門檻(DAILY)照 tools/tech/listen-stress.mjs 掃出來的:誤過 0 的前提下過關率最大。 */
export const DAILY = {
  match: 0.8,      // 對到譜上的音 ≥ 8 成
  miss: 2,         // 漏彈最多 2 個(八分音符的關一輪 32 個音,放遠、小聲時最後一兩個輕的音會聽不到;2026-11 掃描:1 → 2,誤過照樣 0)
  extra: 1,        // 多彈(聽得出音高、不是譜上那個音)最多 1 個
  pitch: 0.85,     // 聽得出來的音裡,對的 ≥ 85%
  okMin: 0.7,      // 譜上的音確定聽到的至少這個比例(彈對的 ≥ 0.94;講話、敲桌子、只有拍點 ≤ 0.31,彈一半、彈別的關 = 0.5;取中間)
  ratio: 1,        // 譜上那個音要比附近 ±9 半音最突出的大這麼多倍才算「聽到了」(= pitchMatchRate 的 PM_RATIO)
  wrongRatio: 0.35,// 譜上那個音比聽到的那個音小這麼多,而且聽到的音很清楚 = 彈錯
  clear: 2,        // 「很清楚的音」:最突出的音比附近其他的音大這麼多倍
  clickWin: 0.05,  // 秒:拍點前後這麼近、聽不出音高的音頭 = 拍點
  clickPost: 0.08, // 秒:拍點附近的音頭晚這麼多再看一次音高
  clickClear: 1.3, // 拍點附近的音頭,最突出的音要比附近其他的大這麼多倍才算琴聲
  pitchCost: 1,    // 對音頭時,不像譜上的音多加的代價(< 漏一個 + 多一個 = 1.8)
  near: 0.12,      // 秒:對到的音頭前後這麼近的音頭都拿來看音高(拍點跟琴聲幾乎同時,可能被當成兩個音頭)
  early: 0.6,      // 第 1 拍之前多早的音頭還算(拍數)
  floor: 0.02,     // 音高比較的下限 = 琴聲音量的 2%(聲音停掉、只剩底噪的地方不會比出很大的倍數)
  octLow: 0.3,     // 低一個八度的證據(octaveLowAt):彈對 ≤ 0.16、彈低八度 ≥ 0.5
  octShare: 0.5,   // 譜上的音有這個比例「聽到的是低八度」= 整段彈低了一個八度
  octKeep: 1.2,    // 拍點附近的音頭:低八度的證據這麼清楚才留下來(只有拍點 ≤ 0.8、彈低八度 ≥ 1.4)
};
/* 音頭 at(秒)之後的頻譜比之前多出來的部分(checkPitches 同一種算法);room = 到下一個音頭的秒數 */
function noveltyAt(samples, rate, at, room, postS = 0.03) {
  const size = Math.round(rate * 0.085);
  let N = 1; while (N < size * 2) N <<= 1;
  const pre = Math.round(rate * 0.012), post = Math.round(rate * postS);
  const a = Math.round(at * rate);
  const len = Math.min(size, Math.round(room * rate) - post);
  if (len < rate * 0.04) return null;
  const after = spectrum(samples, a + post, len, N);
  const before = spectrum(samples, Math.max(0, a - pre - len), len, N);
  return { nov: after.map((v, k) => Math.max(0, v - before[k])), N };
}
/* 這個音比附近 ±9 半音(八度、五度泛音不算)最突出的那個大幾倍;floor = 比較的下限(聲音停掉的地方兩邊都接近 0,比出來的倍數沒有意義) */
function pitchRatio(nov, N, p, rate, floor = 1e-12) {
  const sp = salience(nov, p, rate, N);
  let rival = 0;
  for (let q = p - 9; q <= p + 9; q++) if (q !== p && !RELATED.includes(q - p)) rival = Math.max(rival, salience(nov, q, rate, N));
  return sp / Math.max(rival, floor);
}
/* 這幾個諧波(hs)的大小加起來(salience 同一種算法,只看指定的諧波) */
function partials(nov, midi, rate, N, hs) {
  let s = 0;
  for (const h of hs) {
    const f = hz(midi) * h * Math.sqrt(1 + 0.0004 * h * h);
    if (f > rate / 2 - 200) break;
    const c = (f * N) / rate, w = Math.max(1, c * (2 ** (0.3 / 12) - 1));
    let peak = 0;
    for (let b = Math.floor(c - w); b <= Math.ceil(c + w); b++) if (b > 0 && b < nov.length) peak = Math.max(peak, nov[b]);
    s += peak / Math.sqrt(h);
  }
  return s;
}
/* 低一個八度的證據:p − 12 的第 1、3、5 諧波(p 自己沒有的頻率)比 p 的第 1–3 諧波(兩個音都有)。彈對 ≈ 0,彈低八度 ≈ 0.5 以上 */
function octaveLowAt(nov, N, p, rate, floor) {
  return partials(nov, p - 12, rate, N, [1, 3, 5]) / Math.max(partials(nov, p, rate, N, [1, 2, 3]), floor);
}
/* 聽到最突出的音(lo–hi 之間)與它有多清楚 */
function heardPitch(nov, N, rate, lo, hi, floor) {
  let best = -1, bs = 0;
  for (let p = lo; p <= hi; p++) { const s = salience(nov, p, rate, N); if (s > bs) { bs = s; best = p; } }
  return best < 0 ? { midi: null, clear: 0 } : { midi: best, clear: pitchRatio(nov, N, best, rate, floor) };
}
/**
 * 分析(不判斷):每個譜上的音對到哪個音頭、那個音聽到了沒有(ratio)、聽到的是什麼音(heard / clear);多出來的音頭。
 * expected = { events: [{ beat, midi, pitches }], bpm }(listenExpected)。判斷在 decideDaily(門檻可以換,掃描用)。
 */
export function analyseDaily(samples, rate, expected, opts = {}) {
  const P = { ...DAILY, ...(opts.limits || {}) };
  const ev = expected.events, n = ev.length;
  const spb = 60 / (expected.bpm || 60);
  const clicks = opts.clicks || [];
  const raw = detectNotes(samples, rate, clicks.length ? { skip: clicks, skipWin: P.clickWin } : {});
  const out = { total: n, onsets: raw.length, details: ev.map((e, i) => ({ i, midi: e.midi, beat: e.beat, at: null, ratio: null, heard: null, clear: null, low: null })), extras: [] };
  if (!raw.length) return out;
  const lo = Math.min(...ev.map((e) => e.midi)) - 14, hi = Math.max(...ev.map((e) => e.midi)) + 14;
  // 比較的下限:這段錄音琴聲(每 10 ms 音量的第 95 百分位)的 P.floor 倍換算成頻譜的大小(漢寧窗 0.085 秒的正弦波峰值 ≈ 振幅 × 取樣數 / 4)
  const hop = Math.round(rate * 0.01), lv = [];
  for (let k = 0; k + hop <= samples.length; k += hop) { let e = 0; for (let q = k; q < k + hop; q++) e += samples[q] * samples[q]; lv.push(Math.sqrt(e / hop)); }
  lv.sort((x, y) => x - y);
  const floor = Math.max(1e-12, P.floor * (lv[Math.floor(lv.length * 0.95)] || 0) * Math.round(rate * 0.085) / 4);
  const all = raw.map((t, k) => {
    const room = (k + 1 < raw.length ? raw[k + 1] : samples.length / rate) - t;
    const click = clicks.some((c) => Math.abs(c - t) <= P.clickWin);
    let nv = noveltyAt(samples, rate, t, Math.min(room, 0.2));
    let h = nv ? heardPitch(nv.nov, nv.N, rate, lo, hi, floor) : { midi: null, clear: 0 };
    let late = null;
    if (click) {   // 拍點的聲音很短:晚一點再看一次(琴聲還在、拍點已經沒了),取比較清楚的
      const nv2 = noveltyAt(samples, rate, t, Math.min(room, 0.25), P.clickPost);
      const h2 = nv2 ? heardPitch(nv2.nov, nv2.N, rate, lo, hi, floor) : null;
      if (h2) late = { nv: nv2, midi: h2.midi };
      if (h2 && h2.clear > h.clear) { nv = nv2; h = h2; }
    }
    return { t, nv, ...h, click, late };
  });
  // 拍點:拍點附近、聽不出音高的音頭不算;第 1 拍之前太早的(預備拍)不算
  // 例外:拍點已經沒了的地方(late)聽到的是譜上某個音的低八度、而且低八度的證據很清楚(octaveLowAt ≥ octKeep)
  // = 琴聲彈低了一個八度(低音區的音 clear 比較小,會被當成拍點),留下來
  const lowOct = (o) => !!o.late && o.late.midi != null && ev.some((e) => e.midi === o.late.midi + 12) && octaveLowAt(o.late.nv.nov, o.late.nv.N, o.late.midi + 12, rate, floor) >= P.octKeep;
  out.list = all.map((o) => ({ t: o.t, midi: o.midi, clear: o.clear, click: o.click }));
  const kept = all.filter((o) => !(o.click && o.clear < P.clickClear && !lowOct(o)) && (opts.t0 == null || o.t >= opts.t0 - P.early * spb));
  out.kept = kept.length;
  if (!kept.length) return out;
  const T = kept.map((o) => o.t);
  // 每個音頭聽起來像不像譜上的某個音:這個音頭與前後很近的音頭(拍點、琴聲可能各一個音頭)取最像的
  const memo = new Map();
  const like = (p, j) => {
    const key = p * 100000 + j;
    if (memo.has(key)) return memo.get(key);
    let best = null;
    for (const c of all) {
      if (Math.abs(c.t - T[j]) > P.near || !c.nv) continue;
      const r = pitchRatio(c.nv.nov, c.nv.N, p, rate, floor);
      if (!best || r > best.r) best = { r, c };
    }
    memo.set(key, best);
    return best;
  };
  // 對的時候也看音高(音都一樣長的時候只看節奏會整排錯開一個音):不像譜上的音多一點代價(比漏一個 + 多一個小,彈錯的音照樣對得上)
  const { pairs } = alignOnsets(ev.map((e) => e.beat), T, (i, j) => { const b = like(ev[i].midi, j); return P.pitchCost * clamp(1 - (b ? b.r : 0), 0, 1); });
  const used = new Set();
  for (const [i, j] of pairs) {
    const d = out.details[i], o = kept[j];
    used.add(j);
    d.at = o.t;
    const best = like(ev[i].midi, j);
    if (best) { d.ratio = best.r; d.heard = o.midi; d.clear = o.clear; if (best.c.clear > (d.clear ?? 0) && best.c.midi !== ev[i].midi) { d.heard = best.c.midi; d.clear = best.c.clear; } }
    if (best) d.low = octaveLowAt(best.c.nv.nov, best.c.nv.N, ev[i].midi, rate, floor);   // 低一個八度的證據(decideDaily 的 octaveLow)
  }
  // 多出來的音頭:對到的第一個與最後一個之間、沒對到、離對到的音頭不近
  if (pairs.length) {
    const j0 = pairs[0][1], j1 = pairs[pairs.length - 1][1];
    for (let j = j0 + 1; j < j1; j++) {
      if (used.has(j)) continue;
      const o = kept[j];
      if (pairs.some(([, q]) => Math.abs(kept[q].t - o.t) <= P.near)) continue;
      out.extras.push({ at: o.t, heard: o.midi, clear: o.clear, click: o.click });
    }
  }
  return out;
}
/** 判斷(純函式):{ ok, reason, matched, total, wrong, missed, extra, low, details, note }。reason:ok / silent / notPiano / missed / wrongPitch / octaveLow / extra;note = 第一個有問題的音 { i, midi, heard } */
export function decideDaily(a, limits = {}) {
  const P = { ...DAILY, ...limits };
  const n = a.total, det = a.details;
  const matched = det.filter((d) => d.at !== null).length;
  const sure = det.filter((d) => d.ratio !== null && d.ratio >= P.ratio);
  const wrongs = det.filter((d) => d.ratio !== null && d.ratio < P.wrongRatio && d.clear >= P.clear && d.heard !== null && d.heard !== d.midi);
  const extras = a.extras.filter((x) => x.clear >= P.clear && !x.click);   // 跟拍點同時的不算(拍點的餘音也聽得出音高,拿不準)
  // 低一個八度(音名對、位置錯):聽到的是譜上那個音的低八度,而且低八度的證據清楚
  const lows = det.filter((d) => d.low != null && d.low >= P.octLow && d.heard === d.midi - 12);
  const res = { ok: false, matched, total: n, wrong: wrongs.length, missed: n - matched, extra: extras.length, sure: sure.length, low: lows.length, details: det };
  const first = (arr) => (arr.length ? { i: arr[0].i, midi: arr[0].midi, heard: arr[0].heard ?? null } : null);
  if (!a.onsets || !a.kept) return { ...res, reason: 'silent' };
  if (lows.length >= P.octShare * n) return { ...res, reason: 'octaveLow', note: first(lows) };
  // 跟 scoreRecording 一樣的兩關:對到的太少 = 沒聽到在彈;譜上的音聽得出來的不到一半 = 聽不出譜上的音(講話、敲東西、只有拍點)
  const analysable = det.filter((d) => d.ratio !== null).length;
  if (matched < Math.min(n, Math.max(3, Math.ceil(n * MATCH_MIN)))) return { ...res, reason: wrongs.length >= matched / 2 && matched ? 'wrongPitch' : sure.length ? 'missed' : 'silent', note: first(wrongs.length ? wrongs : det.filter((d) => d.at === null)) };
  if (analysable >= 4 && sure.length / analysable < PM_MIN) return { ...res, reason: wrongs.length >= analysable / 2 ? 'wrongPitch' : 'notPiano', note: first(wrongs) };
  if (matched < P.match * n || n - matched > P.miss) return { ...res, reason: 'missed', note: first(det.filter((d) => d.at === null)) };
  if (sure.length < P.okMin * n) return { ...res, reason: wrongs.length ? 'wrongPitch' : 'notPiano', note: first(wrongs) };
  const checked = sure.length + wrongs.length;
  if (checked && sure.length / checked < P.pitch) return { ...res, reason: 'wrongPitch', note: first(wrongs) };
  if (extras.length > P.extra) return { ...res, reason: 'extra', note: extras[0] ? { i: null, midi: null, heard: extras[0].heard } : null };
  return { ...res, ok: true, reason: 'ok', note: null };
}
/** 整段錄音 → 這一輪有沒有彈對(App 與 tools/tech/listen-stress.mjs 同一條路) */
export function scoreDaily(samples, rate, expected, opts = {}) {
  return decideDaily(analyseDaily(samples, rate, expected, opts), opts.limits);
}
