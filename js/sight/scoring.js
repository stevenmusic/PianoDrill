/**
 * Rhythm scoring: did the player's notes land where the score says?
 *
 * Deliberately rhythm only. The microphone is asked "when did a new note start?",
 * never "which note was it?" — onset timing is robust for a piano in a normal
 * room, while naming pitches in two-hand chords is not. Everything here is a
 * pure function (no DOM, no audio context), so it is unit-tested with synthetic
 * signals in `test/scoring.test.js`.
 *
 * The result is practice feedback, not an examiner's mark.
 */

/** Times, in seconds from the first note, at which the score starts a note in either hand. */
export function expectedOnsets(score) {
  const quarterSeconds = 60 / score.tempoBpm;
  const times = [];
  for (const staff of [1, 2]) {
    let offset = 0;
    for (const bar of score.staves[staff]) {
      for (const event of bar.events) {
        // A tied continuation is not a new attack.
        if (!event.rest && event.tie !== 'stop' && event.tie !== 'both') times.push((offset / score.divisions) * quarterSeconds);
        offset += event.dur;
      }
    }
  }
  times.sort((a, b) => a - b);
  // Both hands striking together is one onset to the ear.
  return times.filter((time, index) => index === 0 || time - times[index - 1] > 0.04);
}

/**
 * Note starts found in raw mono samples, as seconds from the first sample.
 *
 * Short-time energy in 10 ms hops; a note start is a sharp rise in log energy
 * over the quietest of the previous few frames (so an attack on top of a ringing
 * note still counts), above an adaptive noise floor, with a refractory gap so
 * one strike is not reported twice.
 */
export function detectOnsets(samples, sampleRate, { refractory = 0.09 } = {}) {
  const hop = Math.round(sampleRate * 0.01);
  const frames = Math.floor(samples.length / hop);
  if (frames < 5) return [];

  const rms = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const start = f * hop;
    for (let i = start; i < start + hop; i++) sum += samples[i] * samples[i];
    rms[f] = Math.sqrt(sum / hop);
  }
  const sorted = [...rms].sort((a, b) => a - b);
  const floor = Math.max(sorted[Math.floor(frames * 0.5)], 1e-5);
  const peak = sorted[frames - 1];
  if (peak < 0.004) return []; // silence: nothing was played

  const gate = Math.max(floor * 4, peak * 0.04);
  const logs = Array.from(rms, (value) => Math.log(value + 1e-6));
  const onsets = [];
  let last = -Infinity;
  for (let f = 3; f < frames - 1; f++) {
    if (rms[f] < gate) continue;
    const before = Math.min(logs[f - 1], logs[f - 2], logs[f - 3]);
    const rise = logs[f] - before;
    // Peak-pick the rise: the strongest frame of a run, not its first.
    if (rise > 0.7 && logs[f] >= logs[f + 1] - 0.05) {
      const time = f * 0.01;
      if (time - last >= refractory) {
        onsets.push(time);
        last = time;
      }
    }
  }
  return onsets;
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};

/**
 * Compare what was played with what was written.
 *
 * A constant lag (the device's audio latency, or starting a hair after the
 * count-in) is not a rhythm mistake, so the median offset is estimated and
 * removed first and reported separately. What remains is judged against a
 * tolerance that scales with the tempo.
 *
 * @param {number[]} expected seconds from the first note
 * @param {number[]} detected seconds on the same clock, before offset removal
 */
export function scoreRhythm(expected, detected, { tempoBpm = 80 } = {}) {
  const beat = 60 / tempoBpm;
  const tolerance = Math.min(0.16, Math.max(0.07, beat * 0.25));
  if (!expected.length) return { score: 0, hits: 0, total: 0, missed: 0, extra: 0, meanErrorMs: 0, offsetMs: 0, toleranceMs: Math.round(tolerance * 1000) };

  /*
   * The constant lag is the shift that lines up the most notes. Taking each
   * written note's *nearest* played onset instead, and the median of those, is
   * wrong in dense passages: when notes are closer together than the lag, the
   * nearest onset is often a neighbour, and the estimate lands anywhere.
   * Every pairwise difference is tried as a candidate, and the one that puts
   * the most notes within half a tolerance wins (the smaller lag on a tie).
   */
  let offset = 0;
  if (detected.length && expected.length >= 3) {
    const candidates = new Set();
    for (const e of expected) for (const d of detected) if (Math.abs(d - e) < 0.6) candidates.add(Math.round((d - e) * 1000) / 1000);
    let best = { count: -1, lag: 0 };
    for (const lag of candidates) {
      let count = 0;
      for (const e of expected) if (detected.some((d) => Math.abs(d - lag - e) <= tolerance / 2)) count += 1;
      if (count > best.count || (count === best.count && Math.abs(lag) < Math.abs(best.lag))) best = { count, lag };
    }
    // Refine on the notes that matched, so one stray pairing cannot skew it.
    const residuals = expected
      .map((e) => detected.map((d) => d - e).filter((lag) => Math.abs(lag - best.lag) <= tolerance / 2).sort((x, y) => Math.abs(x - best.lag) - Math.abs(y - best.lag))[0])
      .filter((lag) => lag !== undefined);
    offset = residuals.length >= 3 ? median(residuals) : best.lag;
  }
  const shifted = detected.map((time) => time - offset);

  const used = new Set();
  const errors = [];
  for (const time of expected) {
    let bestIndex = -1;
    let bestError = Infinity;
    shifted.forEach((value, index) => {
      const error = Math.abs(value - time);
      if (!used.has(index) && error < bestError) {
        bestError = error;
        bestIndex = index;
      }
    });
    if (bestIndex !== -1 && bestError <= tolerance) {
      used.add(bestIndex);
      errors.push(bestError);
    }
  }

  const hits = errors.length;
  const extra = shifted.length - hits;
  const meanError = errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : 0;
  const coverage = hits / expected.length;
  const timing = 1 - 0.3 * (meanError / tolerance);
  const precision = hits / Math.max(1, hits + extra * 0.5);
  const score = Math.max(0, Math.min(100, Math.round(100 * coverage * timing * (0.5 + 0.5 * precision))));
  return {
    score,
    hits,
    total: expected.length,
    missed: expected.length - hits,
    extra,
    meanErrorMs: Math.round(meanError * 1000),
    offsetMs: Math.round(offset * 1000),
    toleranceMs: Math.round(tolerance * 1000),
  };
}
