/* 麥克風測試用的「學生彈奏」:照題目的譜,用 Salamander 取樣(ScrollScore piano/,App 同一套)在瀏覽器的 OfflineAudioContext 算成音訊。
   只給測試用(node 側打分、Chromium 假麥克風),不給使用者聽。
   performance(score, scenario) → notes [{ midi, time, dur, vel }];renderInPage(page, notes, seconds) → Float32Array(48 kHz)/ WAV */
import { expectedEvents } from '../../js/sight/micscore.js';

const rand = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** 譜上每個音(合併連結線):{ beat, len(拍), midi, staff, bar } */
export function scoreNotes(score) {
  const q = score.divisions, out = [];
  for (const staff of [1, 2]) {
    let offset = 0;
    const open = new Map();
    (score.staves[staff] || []).forEach((bar, bi) => {
      for (const ev of bar.events) {
        if (!ev.rest && ev.pitch) {
          for (const p of [ev.pitch, ...(ev.chord ?? [])]) {
            const cont = (ev.tie === 'stop' || ev.tie === 'both') && open.get(p.midi);
            if (cont) cont.len += ev.dur / q;
            else { const n = { beat: offset / q, len: ev.dur / q, midi: p.midi, staff, bar: bi + 1 }; out.push(n); open.set(p.midi, n); }
          }
        }
        offset += ev.dur;
      }
    });
  }
  return out.sort((a, b) => a.beat - b.beat || a.midi - b.midi);
}

/**
 * scenario: { tempo(倍數,1 = 譜上速度), accel(整首從 1 加到 1+accel 倍), pauseAt(在第幾個起音前停 pauseBeats 拍), drop(漏掉第幾個起音), wrong({ 起音序號: 半音 }), jitter(秒), lead(第一個音前幾秒), seed,
 *   rubato(速度隨樂句起伏的幅度,0.1 = ±10%,週期 8 拍), vel([最小, 最大] 力度), pedal(踏右踏板:每個音多響 3 拍) }
 * 回傳 { notes, truth: { spb, onsets(每個起音的真實時間,漏掉的是 null) } }
 */
export function performance(score, s = {}) {
  const r = rand(s.seed ?? 7);
  const exp = expectedEvents(score).events;
  const spb0 = 60 / score.tempoBpm / (s.tempo ?? 1);
  const total = exp.length ? exp[exp.length - 1].beat + 1 : 1;
  const accel = s.accel ?? 0;
  const rub = s.rubato ?? 0;
  // 越彈越快:每拍秒數 = spb0 / (1 + accel·b/total),積分算時間;rubato:每拍秒數 × (1 + rub·sin(2πb/8)),積分
  const timeOf = (b) => (accel ? (spb0 * total / accel) * Math.log(1 + (accel * b) / total) : spb0 * b) + (rub ? spb0 * rub * (8 / (2 * Math.PI)) * (1 - Math.cos((2 * Math.PI * b) / 8)) : 0);
  const [vLo, vHi] = s.vel ?? [62, 84];
  const lead = s.lead ?? 1.0;
  const evTime = exp.map((e, k) => {
    let t = lead + timeOf(e.beat);
    if (s.pauseAt !== undefined && k >= s.pauseAt) t += (s.pauseBeats ?? 2) * spb0;
    return t + (r() - 0.5) * 2 * (s.jitter ?? 0.008);
  });
  const notes = [];
  for (const n of scoreNotes(score)) {
    const k = exp.findIndex((e) => Math.abs(e.beat - n.beat) < 0.01);
    if (s.drop && s.drop.includes(k)) continue;
    const t = evTime[k];
    const end = lead + timeOf(n.beat + n.len) + (s.pauseAt !== undefined && k >= s.pauseAt ? (s.pauseBeats ?? 2) * spb0 : 0);
    const shift = s.wrong && s.wrong[k] !== undefined && n.midi >= 60 ? s.wrong[k] : 0;
    const pedalEnd = s.pedal ? lead + timeOf(n.beat + n.len + 3) : 0;
    notes.push({ midi: n.midi + shift, time: t + (n.staff === 2 ? (r() - 0.5) * 0.02 : 0), dur: Math.max(0.08, (end - t) * 0.92, pedalEnd - t), vel: Math.round(vLo + r() * (vHi - vLo)) });
  }
  return { notes, truth: { spb: spb0, onsets: evTime.map((t, k) => (s.drop && s.drop.includes(k) ? null : t)) } };
}

/** 在頁面裡算音訊(取樣從 ScrollScore 下載,harness 會快取)。format: 'f32' → Float32Array;'wav' → Buffer(16-bit) */
export async function renderInPage(page, notes, seconds, { format = 'f32', noise = 0.0006, gain = 1, room = 0 } = {}) {
  const b64 = await page.evaluate(async ({ notes, seconds, format, noise, gain, room }) => {
    const SR = 48000;
    const ROOT = 'https://raw.githubusercontent.com/stevenmusic/ScrollScore/main/piano/';
    const NAMES = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];
    const nm = (m) => NAMES[m % 12] + (Math.floor(m / 12) - 1);
    const center = (m) => Math.max(21, Math.min(108, 21 + 3 * Math.round((m - 21) / 3)));
    const cache = window.__pfBufs || (window.__pfBufs = {});
    const dec = new OfflineAudioContext(1, 1, SR);
    const LAYERS = [4, 8, 9, 12];
    async function buf(c, vel) {
      const want = vel < 50 ? 4 : vel < 70 ? 8 : vel < 90 ? 9 : 12;
      for (const L of [want, ...LAYERS]) {
        const f = `pf-${nm(c)}-v${L}.flac`;
        if (cache[f] === null) continue;
        if (!cache[f]) {
          const res = await fetch(ROOT + f);
          if (!res.ok) { cache[f] = null; continue; }
          cache[f] = await dec.decodeAudioData(await res.arrayBuffer());
        }
        return cache[f];
      }
      throw new Error('no sample ' + c);
    }
    const ctx = new OfflineAudioContext(1, Math.ceil(seconds * SR), SR);
    // 手機麥克風:低頻少一點
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 90;
    hp.connect(ctx.destination);
    if (room) {
      // 房間殘響:指數衰減的雜訊脈衝響應(RT60 約 0.9 秒)
      const len = Math.round(SR * 1.2), ir = ctx.createBuffer(1, len, SR), d = ir.getChannelData(0);
      let z = 7; const rn = () => { z = (z * 1664525 + 1013904223) >>> 0; return z / 4294967296 - 0.5; };
      for (let k = 0; k < len; k++) d[k] = rn() * Math.exp(-k / (SR * 0.13));
      const conv = ctx.createConvolver(); conv.normalize = true; conv.buffer = ir;
      const wet = ctx.createGain(); wet.gain.value = room;
      hp.connect(conv).connect(wet).connect(ctx.destination);
    }
    for (const n of notes) {
      const c = center(n.midi);
      const b = await buf(c, n.vel);
      const src = ctx.createBufferSource(); src.buffer = b;
      src.playbackRate.value = 2 ** ((n.midi - c) / 12);
      const g = ctx.createGain();
      const v = n.vel / 127, amp = (0.015 + 0.985 * v * v) * 0.35 * gain;
      g.gain.setValueAtTime(amp, n.time);
      g.gain.setValueAtTime(amp, n.time + n.dur);
      g.gain.setTargetAtTime(0, n.time + n.dur, 0.08);
      src.connect(g).connect(hp);
      src.start(n.time); src.stop(n.time + n.dur + 0.6);
    }
    const out = (await ctx.startRendering()).getChannelData(0);
    let s = 99;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
    let peak = 0;
    for (let k = 0; k < out.length; k++) { out[k] += rnd() * 2 * noise; peak = Math.max(peak, Math.abs(out[k])); }
    const norm = peak > 0.9 ? 0.9 / peak : 1;
    let bytes;
    if (format === 'f32') { const f = new Float32Array(out.length); for (let k = 0; k < out.length; k++) f[k] = out[k] * norm; bytes = new Uint8Array(f.buffer); }
    else {
      const n = out.length, ab = new ArrayBuffer(44 + n * 2), dv = new DataView(ab), w = (o, str) => { for (let k = 0; k < str.length; k++) dv.setUint8(o + k, str.charCodeAt(k)); };
      w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
      dv.setUint32(24, SR, true); dv.setUint32(28, SR * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 2, true);
      for (let k = 0; k < n; k++) dv.setInt16(44 + k * 2, Math.max(-32767, Math.min(32767, Math.round(out[k] * norm * 32767))), true);
      bytes = new Uint8Array(ab);
    }
    let bin = ''; for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(k, k + 0x8000));
    return btoa(bin);
  }, { notes, seconds, format, noise, gain, room });
  const buf = Buffer.from(b64, 'base64');
  return format === 'f32' ? new Float32Array(Uint8Array.from(buf).buffer) : buf;
}
