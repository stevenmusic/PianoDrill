/* 音訊:取樣鋼琴(ScrollScore 的 Salamander Grand,直接讀 ScrollScore repo)+ 母帶鏈路,照 HarmonyHands / ScrollScore 的引擎。
   不用 Tone.js 單層鋼琴、不用合成音色。 */
/* ══ 音訊:母帶鏈路照 ScrollScore ══════════════════════════════════
   鋼琴/吉他 → 各自 EQ(+ 殘響)→ masterGain → 響度壓縮 → makeup → masterBus → 真峰值限幅器(AudioWorklet)→ masterOut
   限幅器上限 −1.3dBFS(4 倍超取樣量),真峰值 ≤ −1dBTP */
const MASTER = {
  compThreshold: -18, compKnee: 8, compRatio: 3, compAttack: 0.008, compRelease: 0.18, makeup: 1.82,
  ceilingDb: -1.3, lookahead: 0.005, release: 0.09, releaseSlow: 0.7
};
/* 母帶限幅器(AudioWorklet 處理器,用 Blob 載入,維持單檔)——原始碼照抄 ScrollScore 的 SSMasterLimiter:
   4 倍超取樣真峰值偵測(16 點 Kaiser sinc)、預讀 5ms、滑動最小值 + 移動平均、兩段放開、立體聲連動 */
const MASTER_LIMITER_SRC = `
class SSMasterLimiter extends AudioWorkletProcessor {
  constructor(o) {
    super();
    const p = (o && o.processorOptions) || {};
    this.ceil = Math.pow(10, (p.ceilingDb != null ? p.ceilingDb : -1.2) / 20);
    this.L = Math.max(8, Math.round(sampleRate * (p.lookahead || 0.005)));
    this.relFast = Math.exp(-1 / (sampleRate * (p.release || 0.09)));
    this.relSlow = Math.exp(-1 / (sampleRate * (p.releaseSlow || 0.7)));
    this.hold = Math.exp(-1 / (sampleRate * 0.4)); this.pressUp = 1 - Math.exp(-1 / (sampleRate * 0.3));
    const T = 16, H = 7, beta = 8;
    const i0 = x => { let s = 1, t = 1; for (let k = 1; k < 30; k++) { t *= (x / 2) * (x / 2) / (k * k); s += t; } return s; };
    this.k = [0.25, 0.5, 0.75].map(f => {
      const c = new Float64Array(T); let sum = 0;
      for (let j = 0; j < T; j++) { const t = j - H - f, r = t / (T / 2), w = Math.abs(r) < 1 ? i0(beta * Math.sqrt(1 - r * r)) / i0(beta) : 0;
        c[j] = (t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t)) * w; sum += c[j]; }
      for (let j = 0; j < T; j++) c[j] /= sum;
      return c;
    });
    this.T = T; this.H = H;
    this.hist = [new Float64Array(2 * T), new Float64Array(2 * T)]; this.hp = 0;   // 兩倍長:寫在 hp 與 hp+T,讀取時連續
    this.W = this.L + T;
    this.D = this.L + 8;
    let sz = 1; while (sz < this.D + 1) sz <<= 1; this.dmask = sz - 1;
    this.dl = [new Float32Array(sz), new Float32Array(sz)]; this.di = 0;
    let qs = 1; while (qs < this.W + 2) qs <<= 1; this.qmask = qs - 1;
    this.qv = new Float64Array(qs); this.qt = new Float64Array(qs); this.qh = 0; this.qn = 0;
    this.ma = new Float64Array(this.L).fill(1); this.maSum = this.L; this.mi = 0;
    this.env = 1; this.press = 0; this.n = 0;
    this.grMax = 0; this.grSamples = 0; this.total = 0;
    this.port.onmessage = e => {
      if (e.data === "stats") this.port.postMessage({ grMaxDb: -20 * Math.log10(Math.max(1e-9, 1 - this.grMax)), grPct: 100 * this.grSamples / Math.max(1, this.total) });
      else if (e.data && e.data.release) {   // 匯出含鼓的曲子時改快放開(只削尖峰),匯出完再改回來
        this.relFast = Math.exp(-1 / (sampleRate * e.data.release));
        this.relSlow = Math.exp(-1 / (sampleRate * (e.data.releaseSlow || e.data.release)));
      }
    };
  }
  process(inputs, outputs) {
    const inp = inputs[0] || [], out = outputs[0], N = out[0].length;
    const iL = inp[0], iR = inp[1] || inp[0];
    const T = this.T, H = this.H, k0 = this.k[0], k1 = this.k[1], k2 = this.k[2], ceil = this.ceil, L = this.L, W = this.W;
    const hl = this.hist[0], hr = this.hist[1], qv = this.qv, qt = this.qt, qmask = this.qmask, ma = this.ma;
    const d0 = this.dl[0], d1 = this.dl[1], dmask = this.dmask, D = this.D;
    const relFast = this.relFast, relSlow = this.relSlow, hold = this.hold, pressUp = this.pressUp;
    const skip = ceil / 1.5;   // 取樣值都低於上限 −3.5dB 時,取樣之間的峰值不可能超過上限,省掉內插
    let hp = this.hp, qh = this.qh, qn = this.qn, maSum = this.maSum, mi = this.mi, env = this.env, press = this.press, n = this.n, di = this.di;
    let minEnv = 1, grS = 0;
    const oL = out[0], oR = out[1];
    for (let i = 0; i < N; i++) {
      let xl = iL ? iL[i] : 0, xr = iR ? iR[i] : 0;
      if (xl !== xl) xl = 0; if (xr !== xr) xr = 0;
      hl[hp] = xl; hl[hp + T] = xl; hr[hp] = xr; hr[hp + T] = xr;
      hp = (hp + 1) & (T - 1);
      // 最舊的在 hp,連續讀 hl[hp .. hp+T-1];中心 m = hp+H
      let raw = 0;
      for (let j = 0; j < T; j++) { const a = Math.abs(hl[hp + j]), b = Math.abs(hr[hp + j]); if (a > raw) raw = a; if (b > raw) raw = b; }
      let pk = Math.max(Math.abs(hl[hp + H]), Math.abs(hr[hp + H]));
      if (raw > skip) {
        let a0 = 0, a1 = 0, a2 = 0, b0 = 0, b1 = 0, b2 = 0;
        for (let j = 0; j < T; j++) { const vl = hl[hp + j], vr = hr[hp + j]; a0 += k0[j] * vl; a1 += k1[j] * vl; a2 += k2[j] * vl; b0 += k0[j] * vr; b1 += k1[j] * vr; b2 += k2[j] * vr; }
        pk = Math.max(pk, Math.abs(a0), Math.abs(a1), Math.abs(a2), Math.abs(b0), Math.abs(b1), Math.abs(b2));
      }
      const g = pk > ceil ? ceil / pk : 1;
      // 滑動最小值(單調佇列),視窗 W
      while (qn > 0 && qv[(qh + qn - 1) & qmask] >= g) qn--;
      const tail = (qh + qn) & qmask; qv[tail] = g; qt[tail] = n; qn++;
      while (qt[qh] <= n - W) { qh = (qh + 1) & qmask; qn--; }
      n++;
      // 移動平均(長度 L)
      const gmin = qv[qh];
      maSum += gmin - ma[mi]; ma[mi] = gmin; mi = mi + 1 === L ? 0 : mi + 1;
      const gs = Math.min(1, maSum / L);
      // press:最近 0.3 秒有多少時間「需要」壓 0.25dB 以上(看目標增益,不看放開中的尾巴)
      if (gs < 0.97) press += (1 - press) * pressUp; else { press *= hold; if (press < 1e-6) press = 0; }
      if (gs < env) env = gs;
      else { const r = relFast + (relSlow - relFast) * press; env = gs + (env - gs) * r; if (1 - env < 1e-7) env = 1; }
      // 延遲 D 後的音訊乘上增益
      d0[di] = xl; d1[di] = xr;
      const ro = (di - D) & dmask;
      oL[i] = d0[ro] * env; if (oR) oR[i] = d1[ro] * env;
      di = (di + 1) & dmask;
      if (env < minEnv) minEnv = env;
      if (env < 0.999) grS++;
    }
    this.hp = hp; this.qh = qh; this.qn = qn; this.maSum = maSum; this.mi = mi; this.env = env; this.press = press; this.n = n; this.di = di;
    if (1 - minEnv > this.grMax) this.grMax = 1 - minEnv;
    this.grSamples += grS; this.total += N;
    return true;
  }
}
registerProcessor("ss-master-limiter", SSMasterLimiter);
`;
const MASTER_CEIL_RANGE = 2, MASTER_CEIL_KNEE = 0.708, MASTER_CEIL = 0.85;   // 曲線涵蓋 ±2、−3dBFS 起彎、上限 −1.4dBFS
function buildCeilingCurve(){
  const n = 8193, c = new Float32Array(n), T = MASTER_CEIL_KNEE, C = MASTER_CEIL;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1) * 2 - 1) * MASTER_CEIL_RANGE, a = Math.abs(x);
    c[i] = a <= T ? x : Math.sign(x) * (T + (C - T) * Math.tanh((a - T) / (C - T)));
  }
  return c;
}

let audioCtx = null, masterGain = null, masterBus = null, masterOut = null, masterLimiterNode = null, masterReady = Promise.resolve(false);
let scheduled = [];     // 已排程的 audio nodes,停止時關閉
const REVERB_AMOUNT = 0.3;   // ScrollScore 殘響滑桿的預設值(30)
function buildMaster(){
  /* 鋼琴/吉他的總和先降到 0.48 留動態餘裕,再壓縮 + makeup(照 ScrollScore) */
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.48;
  const comp = audioCtx.createDynamicsCompressor();
  comp.threshold.value = MASTER.compThreshold; comp.knee.value = MASTER.compKnee; comp.ratio.value = MASTER.compRatio;
  comp.attack.value = MASTER.compAttack; comp.release.value = MASTER.compRelease;
  const makeup = audioCtx.createGain(); makeup.gain.value = MASTER.makeup;
  masterGain.connect(comp); comp.connect(makeup);
  masterBus = audioCtx.createGain(); makeup.connect(masterBus);
  masterOut = audioCtx.createGain(); masterOut.connect(audioCtx.destination);
  /* 備援(不支援 AudioWorklet 才用):快起音壓縮器 + 4 倍超取樣軟削波 */
  const fbLim = audioCtx.createDynamicsCompressor();
  fbLim.threshold.value = -3; fbLim.knee.value = 3; fbLim.ratio.value = 12; fbLim.attack.value = 0.001; fbLim.release.value = 0.25;
  const ceilPre = audioCtx.createGain(); ceilPre.gain.value = 1 / MASTER_CEIL_RANGE;
  const ceilShaper = audioCtx.createWaveShaper(); ceilShaper.curve = buildCeilingCurve(); ceilShaper.oversample = "4x";
  const fbTrim = audioCtx.createGain(); fbTrim.gain.value = Math.pow(10, -1.6 / 20);
  masterBus.connect(fbTrim); fbTrim.connect(fbLim); fbLim.connect(ceilPre); ceilPre.connect(ceilShaper); ceilShaper.connect(masterOut);
  const ctx = audioCtx;
  masterReady = (async () => {
    try {
      if (!ctx.audioWorklet || typeof AudioWorkletNode === "undefined") return false;
      const url = URL.createObjectURL(new Blob([MASTER_LIMITER_SRC], { type: "text/javascript" }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const lim = new AudioWorkletNode(ctx, "ss-master-limiter", {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: "explicit",
        processorOptions: { ceilingDb: MASTER.ceilingDb, lookahead: MASTER.lookahead, release: MASTER.release, releaseSlow: MASTER.releaseSlow }
      });
      masterBus.disconnect(fbTrim); masterBus.connect(lim); lim.connect(masterOut);
      masterLimiterNode = lim;
      return true;
    } catch (e) { console.warn("母帶限幅器載入失敗,使用備援:", e); return false; }
  })();
}
/* iPhone 側邊靜音開關打開時,網頁的 Web Audio 預設會被靜音(看起來像按播放沒反應);設成 playback 就照樣有聲音(Safari 17+) */
try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}
/* 在使用者手勢裡呼叫:讓 AudioContext 開始跑(iOS 要在手勢裡 resume + 播一個無聲的音才算解鎖) */
export function unlockAudio(){
  if (!audioCtx) { try { ensureAudio(); } catch (e) { return; } }
  if (audioCtx instanceof OfflineAudioContext || audioCtx.state === "running") return;
  try {
    audioCtx.resume().catch(() => {});
    const src = audioCtx.createBufferSource(); src.buffer = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
    src.connect(audioCtx.destination); src.start(0);
  } catch (e) {}
}
/* 取樣解碼用的離線 context:打開網頁就能先下載、解碼,真正的 AudioContext 等第一次點畫面才建立
   (iPhone 加到主畫面後,沒有手勢就建立的 AudioContext 常常永遠叫不醒 → 按播放沒聲音也沒反應)。AudioBuffer 可以跨 context 用 */
let decodeCtx = null;
function dec(){
  if (audioCtx) return audioCtx;
  if (!decodeCtx) { const O = window.OfflineAudioContext || window.webkitOfflineAudioContext; decodeCtx = new O(2, 1, 48000); }
  return decodeCtx;
}
export function ensureAudio(){
  if (audioCtx && !(audioCtx instanceof OfflineAudioContext)) return audioCtx;
  const AC = window.AudioContext || window.webkitAudioContext;
  audioCtx = new AC({ latencyHint: "interactive" });
  buildMaster();
  return audioCtx;
}
async function runLimited(jobs, limit){
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, jobs.length) }, async () => { while (i < jobs.length) { const j = jobs[i++]; await j(); } });
  await Promise.all(workers);
}
/* 取樣檔快取(Cache Storage):第一次下載後存在裝置上,之後直接從本機讀 */
export const SAMPLE_CACHE = "fingerdrill-samples-v1";
let sampleCachePromise = null;
function sampleCache(){
  if (!sampleCachePromise) sampleCachePromise = (typeof caches !== "undefined" && window.isSecureContext)
    ? caches.open(SAMPLE_CACHE).then(async c => { for (const k of await caches.keys()) if (k.startsWith("fingerdrill-samples-") && k !== SAMPLE_CACHE) caches.delete(k); return c; }).catch(() => null)
    : Promise.resolve(null);
  return sampleCachePromise;
}
async function fetchSample(url){
  const cache = await sampleCache();
  if (cache) { try { const hit = await cache.match(url); if (hit) return hit; } catch (e) {} }
  // 網路卡住時不要永遠等(以前會一直停在「準備中」):25 秒沒下載完就算失敗,再按一次重試
  const ac = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ac && setTimeout(() => ac.abort(), 25000);
  let res;
  try { res = await fetch(url, ac ? { signal: ac.signal } : undefined); if (res.ok) await res.clone().arrayBuffer(); }
  finally { if (timer) clearTimeout(timer); }
  if (res.ok && cache) { try { await cache.put(url, res.clone()); } catch (e) {} }
  return res;
}
const SAMPLE_FETCH_CONCURRENCY = (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) || (navigator.deviceMemory && navigator.deviceMemory <= 4)) ? 6 : 12;
const SAMPLE_ROOT = "https://raw.githubusercontent.com/stevenmusic/ScrollScore/main/";   // 音色直接讀 ScrollScore 的取樣(公開 repo,可跨網域)

/* ── 鋼琴:Salamander Grand Piano V3(ScrollScore piano/,48k FLAC)──
   30 個取樣音(每 3 個半音一個:A0、C1、D♯1…)× 16 層力度;只載入用得到的(音 × 力度層),截短到需要的長度 */
const PIANO_BASE = SAMPLE_ROOT + "piano/";
let PIANO_GAIN = 1.9;   // 單音音階很稀疏,沿用 HarmonyHands 稀疏伴奏的增益
const PIANO_VERB_SEND = 0.5;
const PIANO_NOTE_NAMES = ["C","Cs","D","Ds","E","F","Fs","G","Gs","A","As","B"];
let pianoMan = null, pianoManPromise = null;
const pianoBuf = {};      // "C4-v8" -> { buf, len, c, L }
function pianoNoteName(m){ return PIANO_NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }
function pianoCenterFor(m){ return Math.max(21, Math.min(108, 21 + 3 * Math.round((m - 21) / 3))); }
function pianoLayerFor(vel){
  const r = pianoMan ? pianoMan.velRanges : [[1, 127]];
  for (let i = 0; i < r.length; i++) if (vel <= r[i][1] + 0.5) return i + 1;
  return r.length;
}
// 音量 = 0.015 + 0.985 ×(力度/127)²(原廠 amp_veltrack 98.5;各層錄音已校正成一樣大聲)
function pianoVelGain(vel){ const v = Math.max(1, Math.min(127, vel)) / 127; return 0.015 + 0.985 * v * v; }
// 制音器落下後的衰減時間常數:低音弦粗重、尾巴長,高音很快停
function pianoDamperTau(m){ return m <= 48 ? 0.16 - (m - 21) / 27 * 0.06 : m <= 72 ? 0.10 - (m - 48) / 24 * 0.04 : Math.max(0.045, 0.06 - (m - 72) / 16 * 0.015); }
// 半踏板(制音器輕碰琴弦)的衰減時間常數
let PIANO_HALF_PEDAL = 0.7;
function pianoHalfPedalTau(m){ return PIANO_HALF_PEDAL * Math.max(0.35, 1.3 - (m - 21) / 87 * 0.95); }
async function fetchPianoBuffer(file, lenSec){
  const res = await fetchSample(PIANO_BASE + file);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const buf = await dec().decodeAudioData(await res.arrayBuffer());
  const n = Math.min(buf.length, Math.round((lenSec || 1e9) * buf.sampleRate));
  if (n === buf.length) return buf;
  const nc = buf.numberOfChannels, out = dec().createBuffer(nc, n, buf.sampleRate);
  const fade = Math.min(n >> 2, Math.round(0.8 * buf.sampleRate));
  for (let c = 0; c < nc; c++) {
    const d = out.getChannelData(c);
    d.set(buf.getChannelData(c).subarray(0, n));
    for (let i = 0; i < fade; i++) d[n - fade + i] *= Math.pow(Math.cos(i / fade * Math.PI / 2), 2);
  }
  return out;
}
function loadPianoManifest(){
  if (!pianoManPromise) pianoManPromise = (async () => {
    const r = await fetch(PIANO_BASE + "manifest.json", typeof AbortSignal !== "undefined" && AbortSignal.timeout ? { signal: AbortSignal.timeout(15000) } : undefined);
    if (!r.ok) throw new Error("manifest " + r.status);
    pianoMan = await r.json();
    return pianoMan;
  })().catch(e => { pianoManPromise = null; throw e; });
  return pianoManPromise;
}
function pianoSampleFor(m, L){
  const c0 = pianoCenterFor(m);
  for (const c of [c0, c0 + (m >= c0 ? 3 : -3), c0 - (m >= c0 ? 3 : -3)]) {
    for (let d = 0; d < 16; d++) for (const l of d ? [L - d, L + d] : [L]) {
      const s = l >= 1 && l <= 16 && pianoBuf[pianoNoteName(c) + "-v" + l];
      if (s) return s;
    }
  }
  // 播放中換調、新調的取樣還在背景下載:先用已載好、音高最近的取樣移調代替,不要沒聲音
  let best = null;
  for (const v of Object.values(pianoBuf)) if (!best || Math.abs(v.c - m) + Math.abs(v.L - L) * 0.1 < Math.abs(best.c - m) + Math.abs(best.L - L) * 0.1) best = v;
  return best;
}
/* 這份練習要用的取樣(notes = [{ midi, vel }]):先每個音各載一層(用最多次的那層,載完就能播),其餘的層在背景補 */
export async function loadPianoFor(notes, lenSec, onProgress){
  await loadPianoManifest();
  const need = new Map();
  for (const n of notes) {
    const c = pianoCenterFor(n.midi), Lr = pianoLayerFor(n.vel), k = pianoNoteName(c) + "-v" + Lr;
    const p = need.get(k) || { key: k, c, L: Lr, uses: 0 }; p.uses++; need.set(k, p);
  }
  const first = [], rest = [], seen = new Set();
  for (const p of [...need.values()].sort((a, b) => b.uses - a.uses)) {
    const have = pianoBuf[p.key];
    if (have && have.len >= lenSec - 0.01) { seen.add(p.c); continue; }
    (seen.has(p.c) ? rest : first).push(p); seen.add(p.c);
  }
  let done = 0; const total = first.length;
  const load = async p => { try { const b = await fetchPianoBuffer("pf-" + pianoNoteName(p.c) + "-v" + p.L + ".flac", lenSec); pianoBuf[p.key] = { buf: b, len: lenSec, c: p.c, L: p.L }; } catch (e) {} };
  await runLimited(first.map(p => async () => { await load(p); done++; if (onProgress && total) onProgress(Math.min(1, done / total)); }), SAMPLE_FETCH_CONCURRENCY);
  if (first.length && !first.some(p => pianoBuf[p.key])) throw new Error("piano samples failed");
  return { rest: runLimited(rest.map(p => () => load(p)), 6) };
}
/* 鋼琴 EQ(照 ScrollScore):450Hz −2dB 箱子聲、2.8kHz −3.5dB 手機喇叭共振峰、9kHz 以上 +1.5dB 空氣感 */
const PIANO_EQ = { mudFreq: 450, mudGain: -2, mudQ: 1.0, harshFreq: 2800, harshGain: -3.5, harshQ: 0.8, airFreq: 9000, airGain: 1.5 };
let pianoBusIn = null, pianoBusCtx = null;
function getPianoBus(){
  if (pianoBusIn && pianoBusCtx === audioCtx) return pianoBusIn;
  const E = PIANO_EQ;
  const peq = (f, g, q) => { const n = audioCtx.createBiquadFilter(); n.type = "peaking"; n.frequency.value = f; n.gain.value = g; n.Q.value = q; return n; };
  const mud = peq(E.mudFreq, E.mudGain, E.mudQ), harsh = peq(E.harshFreq, E.harshGain, E.harshQ);
  const air = audioCtx.createBiquadFilter(); air.type = "highshelf"; air.frequency.value = E.airFreq; air.gain.value = E.airGain;
  mud.connect(harsh); harsh.connect(air); air.connect(masterGain);
  pianoBusIn = mud; pianoBusCtx = audioCtx;
  return mud;
}
/* 鋼琴殘響(照 ScrollScore 的 buildPianoHallIR):同極性早期反射、四頻段各自衰減、低音左右相關,固定亂數種子 */
const PIANO_VERB = { seconds: 2.2, preDelay: 0.008, highpass: 180, wet: 0.33,
  bands: [[0, 350, 1.5, 1.0, 0.75], [350, 1500, 1.3, 0.9, 0.35], [1500, 5000, 0.95, 0.6, 0.15], [5000, 0, 0.55, 0.35, 0.08]],
  early: [[3.1, 3.6, 0.55], [6.7, 7.9, 0.45], [9.8, 9.1, 0.42], [13.4, 14.6, 0.34], [17.9, 16.8, 0.3], [23.5, 25.2, 0.24], [31.0, 29.4, 0.2], [38.6, 40.3, 0.16]] };
function buildPianoHallIR(cfg = PIANO_VERB){   // 吉他也用同一套演算法,只換房間參數(GTR_VERB)
  const rate = audioCtx.sampleRate, len = Math.floor(rate * cfg.seconds);
  const ir = audioCtx.createBuffer(2, len, rate);
  const rand = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const coef = (kind, f0) => {
    const w = 2 * Math.PI * f0 / rate, al = Math.sin(w) / (2 * 0.707), c = Math.cos(w), a0 = 1 + al;
    const b = kind === "lp" ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : [(1 + c) / 2, -(1 + c), (1 + c) / 2];
    return [b[0] / a0, b[1] / a0, b[2] / a0, -2 * c / a0, (1 - al) / a0];
  };
  const filt = (x, k) => { const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const v = k[0] * x[i] + k[1] * x1 + k[2] * x2 - k[3] * y1 - k[4] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y; };
  const noise = seed => { const r = rand(seed), n = new Float32Array(len); for (let i = 0; i < len; i++) n[i] = r() * 2 - 1; return n; };
  const common = noise(1234), own = [noise(4321), noise(8765)];
  const Lc = ir.getChannelData(0), Rc = ir.getChannelData(1), out = [Lc, Rc];
  const t0 = Math.floor(0.005 * rate), ramp = Math.floor(0.035 * rate);
  for (const [lo, hi, rt, g, rho] of cfg.bands) {
    const shape = x => { let s = x; if (lo) { const k = coef("hp", lo); s = filt(filt(s, k), k); } if (hi) { const k = coef("lp", hi); s = filt(filt(s, k), k); } return s; };
    const c = shape(common), dec = Math.pow(10, -3 / (rt * rate)), a = Math.sqrt(rho), bq = Math.sqrt(1 - rho);
    for (let ch = 0; ch < 2; ch++) {
      const u = shape(own[ch]), d = out[ch];
      let env = g;
      for (let i = 0; i < len; i++) {
        const on = i < t0 ? 0 : Math.min(1, (i - t0) / ramp);
        d[i] += (a * c[i] + bq * u[i]) * env * on; env *= dec;
      }
    }
  }
  let ref = 0; for (let i = t0 + ramp; i < t0 + ramp + Math.floor(0.01 * rate); i++) ref = Math.max(ref, Math.abs(Lc[i]));
  cfg.early.forEach(([ml, mr, lv], k) => {
    const taps = 2 + 2 * k, amp = lv * ref * 2.2 / taps;
    [[Lc, ml], [Rc, mr]].forEach(([d, ms]) => { const at = Math.floor(ms / 1000 * rate); for (let j = 0; j < taps; j++) if (at + j < len) d[at + j] += amp * (1 - j / taps) * 2; });
  });
  const fadeOut = Math.floor(0.3 * rate);
  for (const d of out) for (let i = 0; i < fadeOut; i++) d[len - fadeOut + i] *= Math.pow(Math.cos(i / fadeOut * Math.PI / 2), 2);
  return ir;
}
let pianoVerbIn = null, pianoVerbCtx = null;
function getPianoVerb(){
  if (pianoVerbIn && pianoVerbCtx === audioCtx) return pianoVerbIn;
  const input = audioCtx.createGain();
  const hp = audioCtx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = PIANO_VERB.highpass;
  const pre = audioCtx.createDelay(0.1); pre.delayTime.value = PIANO_VERB.preDelay;
  const conv = audioCtx.createConvolver(); conv.buffer = buildPianoHallIR();
  const wet = audioCtx.createGain(); wet.gain.value = REVERB_AMOUNT * PIANO_VERB.wet;
  input.connect(hp); hp.connect(pre); pre.connect(conv); conv.connect(wet); wet.connect(masterGain);
  pianoVerbIn = input; pianoVerbCtx = audioCtx;
  return input;
}
function pianoConnect(node, sendAmt){
  node.connect(getPianoBus());
  if (sendAmt) { const s = audioCtx.createGain(); s.gain.value = sendAmt; node.connect(s); s.connect(getPianoVerb()); }
}
let pianoLastByKey = {};
function pianoKill(v, at){
  v.g.gain.cancelScheduledValues(at);
  v.g.gain.setTargetAtTime(0, at, 0.04);
  v.end = at + 0.3;
  try { v.src.stop(at + 0.35); } catch (e) {}
}
/* when:按鍵;keyUp:放鍵;damperAt:制音器落下(踩踏板時 = 換和弦放踏板的時間);pedal:真的踩著踏板 */
export function playPianoNote(m, when, keyUp, damperAt, vel, pedal){
  if (!pianoMan) return false;
  const now = audioCtx.currentTime;
  when = Math.max(when, now); keyUp = Math.max(keyUp, when + 0.04); damperAt = Math.max(damperAt, keyUp);
  const s = pianoSampleFor(m, pianoLayerFor(vel));
  if (!s) return false;
  const rate = Math.pow(2, (m - s.c + ((pianoMan.tune[m] || 0) / 100)) / 12);
  const gain = PIANO_GAIN * pianoVelGain(vel);
  const noDamper = m >= 89;
  const tau = noDamper ? 3.0 : pianoDamperTau(m);
  const bufEnd = when + s.buf.duration / rate;
  const end = Math.min(bufEnd, damperAt + tau * 7);
  const prev = pianoLastByKey[m];   // 同一個鍵再彈:前一個音被琴槌打斷
  if (prev && prev.end > when) pianoKill(prev, when);
  const src = audioCtx.createBufferSource();
  src.buffer = s.buf; src.playbackRate.value = rate;
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(gain, when);
  if (!pedal && !noDamper && damperAt > keyUp + 0.02) g.gain.setTargetAtTime(0, keyUp, pianoHalfPedalTau(m));
  if (damperAt < end) g.gain.setTargetAtTime(0, damperAt, tau);
  src.connect(g);
  pianoConnect(g, PIANO_VERB_SEND * (pedal ? 1.7 : 1));
  src.start(when); src.stop(end + 0.05);
  src._at = when; scheduled.push(src);
  pianoLastByKey[m] = { src, g, end, at: when };
  return true;
}

/* ── 節拍器:真的鼓棒敲鼓框(Naked Drums xstick,ScrollScore drums/,CC-BY 4.0),重拍大聲一點 ── */
const CLICK_FILES = ["nk-xstick-L1.01.flac", "nk-xstick-L1.02.flac", "nk-xstick-L1.03.flac"];
let clickBufs = null, clickPromise = null;
export function loadClick(){
  if (!clickPromise) clickPromise = (async () => {
    const bufs = [];
    for (const f of CLICK_FILES) {
      try { const r = await fetchSample(SAMPLE_ROOT + "drums/" + f); if (r.ok) bufs.push(await dec().decodeAudioData(await r.arrayBuffer())); } catch (e) {}
    }
    if (!bufs.length) throw new Error("click samples failed");
    clickBufs = bufs;
    return bufs;
  })().catch(e => { clickPromise = null; throw e; });
  return clickPromise;
}
let clickBus = null, clickBusCtx = null, clickRR = 0;
export function playClick(when, strong){
  if (!clickBufs) return false;
  if (!clickBus || clickBusCtx !== audioCtx) {
    clickBus = audioCtx.createGain(); clickBus.gain.value = 1.6; clickBus.connect(masterBus); clickBusCtx = audioCtx;
  }
  const src = audioCtx.createBufferSource();
  src.buffer = clickBufs[clickRR++ % clickBufs.length];
  const g = audioCtx.createGain(); g.gain.value = strong ? 1 : 0.45;
  src.connect(g); g.connect(clickBus);
  src.start(Math.max(when, audioCtx.currentTime));
  src.stop(Math.max(when, audioCtx.currentTime) + 0.4);
  src._at = when; scheduled.push(src);
  return true;
}

export function audioNow(){ return audioCtx ? audioCtx.currentTime : 0; }
export function getCtx(){ return audioCtx; }
export function stopAll(){
  const now = audioCtx ? audioCtx.currentTime : 0;
  for (const s of scheduled) { try { s.stop(now + 0.02); } catch (e) {} }
  scheduled = [];
  for (const k of Object.keys(pianoLastByKey)) { const v = pianoLastByKey[k]; try { v.g.gain.cancelScheduledValues(now); v.g.gain.setTargetAtTime(0, now, 0.03); } catch (e) {} }
  pianoLastByKey = {};
}
/* 播放中改速度:把還沒開始的音與拍點取消(正在響的不動),再照新速度重排 */
export function cancelFrom(t){
  for (const s of scheduled) if (s._at >= t) { try { s.stop(); } catch (e) {} }
  scheduled = scheduled.filter(s => s._at < t);
  for (const k of Object.keys(pianoLastByKey)) if (pianoLastByKey[k].at >= t) delete pianoLastByKey[k];
}
/* 排程過的節點會一直累積:超過一定數量時把已經結束的清掉 */
export function pruneScheduled(){ if (scheduled.length > 400) scheduled = scheduled.slice(-200); }
export { masterReady };
/* 測試用:目前排程中的音訊節點數(連點播放不會變兩份) */
export function scheduledCount(){ return scheduled.length; }
