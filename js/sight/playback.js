/**
 * 視奏的示範播放:把產生的題目排成「哪個音、什麼時候按、什麼時候放、踏板」,
 * 聲音交給共用的音訊引擎(js/shared/audio.js:ScrollScore 的 Salamander 取樣、殘響、主控限幅)。
 * 樂譜上的力度、漸強漸弱、斷奏/持音/重音、圓滑線、踏板、rit./a tempo、倚音都會影響播放。
 */
import * as audio from '../shared/audio.js';

const within = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
/** Sustain pedal: a touch louder — every damper is off the strings, not just the held note's. */
const PEDAL_GAIN_BOOST = 1.1;
/** How much softer/louder each printed dynamic is against mf (the usual unmarked default) left at 1. */
const DYNAMIC_GAIN = {
  ppp: 0.4, pp: 0.5, p: 0.65, mp: 0.8, mf: 1, f: 1.25, ff: 1.55, fff: 1.9,
};
/** How much slower a mid-piece rit./rall. gets at its deepest point, before "a tempo" (or the piece's end) restores it. */
const MIN_RIT_SCALE = 0.68;
const MIN_RALL_SCALE = 0.55;
/** An acciaccatura is crushed against the note it decorates — played just before it, not given its own beat. */
const GRACE_LEAD = 0.09;

export function createPlayer({ onStatus } = {}) {
  /* 合併成 PianoDrill 後:跟技巧、聽音模組用同一個音訊引擎(js/shared/audio.js,ScrollScore 的 Salamander 取樣、
     同一個 AudioContext 與主控限幅)。這裡只負責把樂譜排成「什麼時候按、放、踏板」:速度變化、力度、奏法、踏板照舊 */
  let playingUntil = 0;
  let stopTimer = null;
  let chordResolve = null;
  /** AudioContext time of musical position zero, for visual sync. */
  let startTime = null;
  let preloadJob = null;

  const notesOf = (score) => {
    const out = [];
    for (const staffNumber of [1, 2]) {
      for (const bar of score.staves[staffNumber]) {
        for (const event of bar.events) {
          if (event.rest || !event.pitch) continue;
          for (const pitch of [event.pitch, ...(event.chord ?? [])]) out.push({ midi: pitch.midi, vel: 64 });
          if (event.grace) out.push({ midi: event.grace.pitch.midi, vel: 56 });
        }
      }
    }
    return out;
  };
  /* 取樣:只載這一題用得到的音(打開題目就先在背景載,按播放時接著等同一個工作) */
  const loadFor = (notes) => {
    const key = notes.map((n) => n.midi).sort((a, b) => a - b).join(',');
    if (preloadJob && preloadJob.key === key) return preloadJob.p;
    onStatus?.('loadingSamples');
    const job = { key, p: null };
    job.p = audio.loadPianoFor(notes, 6)
      .then(() => { if (preloadJob === job) onStatus?.(null); return true; })
      .catch(() => { if (preloadJob === job) { preloadJob = null; onStatus?.('samplesFailed'); } return false; });
    preloadJob = job;
    return job.p;
  };
  const ready = async (notes) => {
    const ctx = audio.ensureAudio();
    if (ctx.state !== 'running') await within(ctx.resume().catch(() => {}), 1500);
    const ok = await loadFor(notes);
    await within(audio.masterReady, 1500);
    return ok ? ctx : null;
  };

  const stop = () => {
    if (chordResolve) {
      const resolve = chordResolve;
      chordResolve = null;
      resolve(false);
    }
    if (playingUntil) audio.stopAll();
    playingUntil = 0;
    startTime = null;
    clearTimeout(stopTimer);
    stopTimer = null;
  };

  /* 一個音:力度(相對 mf 的音量倍數)換成 MIDI 力度;keyUp = 放鍵,踏板中的音等踏板放開才停 */
  const note = (midi, at, sustain, gainScale, pedalEnd) => {
    const vel = Math.max(18, Math.min(124, Math.round(64 * Math.sqrt(gainScale))));
    const keyUp = at + Math.max(0.05, sustain);
    audio.playPianoNote(midi, at, keyUp, pedalEnd ? Math.max(keyUp, pedalEnd) : keyUp, vel, !!pedalEnd);
    playingUntil = Math.max(playingUntil, (pedalEnd || keyUp) + 0.4);
  };

  return {
    get playing() {
      return playingUntil > 0;
    },
    /** Seconds since the first note, or null when not playing. */
    get elapsed() {
      const ctx = audio.getCtx();
      if (startTime === null || !ctx) return null;
      return ctx.currentTime - startTime;
    },
    /** Start fetching the samples before anyone presses play. */
    preload(score) { if (score) loadFor(notesOf(score)); },
    stop,
    /**
     * 主音三和弦(30 秒準備前給音,像考官先彈主和弦)。回傳 true = 響完;被停止或換題 = false
     * @param {number[]} midis
     * @returns {Promise<boolean>}
     */
    async playChord(midis, { duration = 1.3 } = {}) {
      stop();
      const ctx = await ready(midis.map((midi) => ({ midi, vel: 64 })));
      if (!ctx) return false;
      const at = ctx.currentTime + 0.08;
      for (const midi of midis) note(midi, at, duration, 1, 0);
      return new Promise((resolve) => {
        chordResolve = resolve;
        stopTimer = setTimeout(() => {
          playingUntil = 0;
          chordResolve = null;
          resolve(true);
        }, (at + duration - ctx.currentTime + 0.5) * 1000);
      });
    },
    /**
     * @param {object} score
     * @param {{onEnd?: () => void, tempoScale?: number}} [options]
     */
    async play(score, options = {}) {
      stop();
      const ctx = await ready(notesOf(score));
      if (!ctx) throw new Error('piano samples');

      const bpm = score.tempoBpm * (options.tempoScale ?? 1);
      const secondsPerDivision = 60 / bpm / score.divisions;
      const start = ctx.currentTime + 0.15;
      startTime = start;
      playingUntil = start;
      let end = start;

      const timeline = scoreDirectionTimeline(score);
      const timeAt = buildTimeMap(score, timeline, secondsPerDivision, start);
      const gainAt = buildDynamicsEnvelope(timeline);
      const pedalRanges = buildPedalRanges(timeline);

      for (const staffNumber of [1, 2]) {
        const { notes, slurRanges } = layOutStaff(score.staves[staffNumber], score.barDuration);
        const legatoAt = (offset) => slurRanges.some((range) => offset >= range.start && offset < range.end);
        const pedalAt = (offset) => pedalRanges.find((range) => offset >= range.start && offset < range.end);

        for (const { event, offset, dur } of notes) {
          const at = timeAt(offset);
          const duration = timeAt(offset + dur) - at;
          const pedal = pedalAt(offset);
          const legato = !pedal && legatoAt(offset);
          const { sustain, gain } = applyArticulation(duration * (legato ? 1.04 : 0.94), duration, event.articulations, 0);
          const gainScale = gainAt(offset) * gain * (pedal ? PEDAL_GAIN_BOOST : 1);
          const pedalEnd = pedal ? timeAt(pedal.end) : 0;
          for (const pitch of [event.pitch, ...(event.chord ?? [])]) note(pitch.midi, at, sustain, gainScale, pedalEnd);
          if (event.grace) {
            const graceDuration = Math.min(GRACE_LEAD, duration * 0.4);
            note(event.grace.pitch.midi, Math.max(start, at - graceDuration), graceDuration, gainScale * 0.85, 0);
          }
          end = Math.max(end, at + duration);
        }
      }
      audio.pruneScheduled();

      stopTimer = setTimeout(() => {
        playingUntil = 0;
        options.onEnd?.();
      }, (end - ctx.currentTime + 0.6) * 1000);
    },
  };
}

/**
 * Flattens one staff's bars into notated-offset (divisions from the piece's
 * start, not seconds — real timing is resolved later, once for both hands,
 * by `buildTimeMap`) note events plus the offset spans its slurs cover. A
 * slur only marks its first and last note (`event.slur = 'start'`/`'stop'`),
 * not the notes in between, and the first note can't know where its own
 * span ends until the matching `stop` is reached walking forward — so
 * ranges are collected in this same pass and every note's `legato` state is
 * decided afterward by testing its onset against them, the same two-phase
 * approach ScrollScore's MusicXML reader uses rather than tracking "am I
 * inside a slur" as running state.
 */
function layOutStaff(bars, barDuration) {
  const notes = [];
  const slurRanges = [];
  const slurStarts = {};
  bars.forEach((bar, barIndex) => {
    let local = 0;
    for (const event of bar.events) {
      const offset = barIndex * barDuration + local;
      if (!event.rest) {
        const number = event.slurNumber ?? 1;
        if (event.slur === 'start') slurStarts[number] = offset;
        // A tied note is one sound: lengthen the note it continues instead of striking again.
        const last = notes[notes.length - 1];
        if ((event.tie === 'stop' || event.tie === 'both') && last && last.event.pitch?.midi === event.pitch?.midi) last.dur += event.dur;
        else notes.push({ event, offset, dur: event.dur });
        if (event.slur === 'stop' && slurStarts[number] !== undefined) {
          slurRanges.push({ start: slurStarts[number], end: offset + event.dur });
          delete slurStarts[number];
        }
      }
      local += event.dur;
    }
  });
  return { notes, slurRanges };
}

/**
 * Every direction (dynamics, wedges, pedal, tempo words) from both staves,
 * in one notated-offset-ordered list. Each kind is only ever written to
 * whichever staff `applyExpression`/`addPedalMarking` chose (dynamics and
 * wedges to whichever hand sounds first in bar 1, pedal always to the bass,
 * tempo words always to the treble), but all of them apply to the whole
 * texture — so the envelope builders below read from this shared list
 * rather than each staff building its own, which would simply see nothing
 * for the directions that live on the other one.
 */
function scoreDirectionTimeline(score) {
  const list = [];
  for (const staffNumber of [1, 2]) {
    score.staves[staffNumber].forEach((bar, barIndex) => {
      const eventOffset = (index) => {
        let sum = 0;
        for (let i = 0; i < index && i < bar.events.length; i++) sum += bar.events[i].dur;
        return sum;
      };
      for (const direction of bar.directions ?? []) {
        list.push({ offset: barIndex * score.barDuration + eventOffset(direction.atEventIndex ?? 0), direction });
      }
    });
  }
  list.sort((a, b) => a.offset - b.offset);
  return list;
}

/**
 * Tempo multiplier (1 = written tempo) as a function of notated offset.
 * `rit.` ramps down toward the following `a tempo` (or, lacking one, the
 * end of the piece); `rall.` ramps down toward the end with nothing to
 * restore it, matching how each is actually used in `generate.js` — a
 * mid-piece rit./a tempo pair (Grade 6+), or a `rall.` into the final bars.
 */
function tempoScaleFn(timeline, totalOffset) {
  const marks = timeline
    .filter(({ direction }) => direction.kind === 'words'
      && (direction.value === 'rit.' || direction.value === 'a tempo' || direction.value === 'rall.'))
    .map(({ offset, direction }) => ({ offset, value: direction.value }));

  const segments = [];
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i];
    if (mark.value === 'rit.') {
      const next = marks[i + 1];
      const to = next?.value === 'a tempo' ? next.offset : totalOffset;
      if (to > mark.offset) segments.push({ from: mark.offset, to, fromScale: 1, toScale: MIN_RIT_SCALE });
    } else if (mark.value === 'rall.') {
      if (totalOffset > mark.offset) segments.push({ from: mark.offset, to: totalOffset, fromScale: 1, toScale: MIN_RALL_SCALE });
    }
  }

  return (offset) => {
    for (const segment of segments) {
      if (offset >= segment.from && offset < segment.to) {
        const fraction = (offset - segment.from) / (segment.to - segment.from);
        return segment.fromScale + (segment.toScale - segment.fromScale) * fraction;
      }
    }
    return 1;
  };
}

/**
 * Notated offset (divisions) -> real seconds, integrating the tempo curve
 * instead of a flat `secondsPerDivision` multiply. A rit. changes how much
 * real time a division takes, not just where the words sit on the page —
 * building this once up front is what makes every later note in *either*
 * hand both start later and last longer under it, which is what actually
 * reads as slowing down rather than just a label. The curve is piecewise
 * linear in *tempo*, not in time, so it's integrated numerically (trapezoid
 * rule at sixteenth-note-ish steps) rather than sampled directly.
 */
function buildTimeMap(score, timeline, secondsPerDivision, start) {
  const totalOffset = score.barCount * score.barDuration;
  const scaleAt = tempoScaleFn(timeline, totalOffset);
  const step = Math.max(1, score.barDuration / 16);

  const offsets = [0];
  const times = [start];
  let offset = 0;
  let time = start;
  while (offset < totalOffset) {
    const next = Math.min(offset + step, totalOffset);
    const costHere = 1 / scaleAt(offset);
    const costNext = 1 / scaleAt(next);
    time += secondsPerDivision * (next - offset) * (costHere + costNext) / 2;
    offset = next;
    offsets.push(offset);
    times.push(time);
  }

  return (target) => {
    const clamped = Math.max(0, Math.min(totalOffset, target));
    let i = 1;
    while (i < offsets.length - 1 && offsets[i] < clamped) i++;
    const t0 = offsets[i - 1];
    const t1 = offsets[i];
    return t1 === t0 ? times[i - 1] : times[i - 1] + (times[i] - times[i - 1]) * (clamped - t0) / (t1 - t0);
  };
}

/**
 * Loudness as a function of notated offset: a step at every printed
 * dynamic, ramped smoothly across a crescendo/diminuendo wedge's span
 * toward whichever dynamic follows it — `generate.js` always adds one 1-2
 * bars after a wedge's stop — rather than jumping the instant the wedge
 * ends.
 */
function buildDynamicsEnvelope(timeline) {
  const marks = timeline
    .filter(({ direction }) => direction.kind === 'dynamics')
    .map(({ offset, direction }) => ({ offset, level: DYNAMIC_GAIN[direction.value] ?? 1 }));
  const wedges = [];
  let open = null;
  for (const { offset, direction } of timeline) {
    if (direction.kind !== 'wedge') continue;
    if (direction.type === 'start') open = offset;
    else if (direction.type === 'stop' && open !== null) {
      wedges.push({ start: open, end: offset });
      open = null;
    }
  }

  const levelBefore = (offset) => {
    let level = marks.length ? marks[0].level : 1;
    for (const mark of marks) {
      if (mark.offset > offset) break;
      level = mark.level;
    }
    return level;
  };
  const levelAtOrAfter = (offset) => {
    for (const mark of marks) if (mark.offset >= offset) return mark.level;
    return marks.length ? marks[marks.length - 1].level : 1;
  };

  return (offset) => {
    const wedge = wedges.find((range) => offset >= range.start && offset < range.end);
    if (!wedge) return levelBefore(offset);
    const from = levelBefore(wedge.start);
    const to = levelAtOrAfter(wedge.end);
    const fraction = wedge.end > wedge.start ? (offset - wedge.start) / (wedge.end - wedge.start) : 1;
    return from + (to - from) * fraction;
  };
}

/**
 * Sustain-pedal spans, in notated-offset terms. The mid-span `change`
 * notches `addMidBarPedalChange`/`addPedalMarking` write at each harmony
 * change mark a lift-and-immediately-redepress for the *engraving*, but the
 * pedal is never actually up in between, so the whole start-to-stop run
 * counts as one continuously pedalled span for the audio envelope.
 */
function buildPedalRanges(timeline) {
  const ranges = [];
  let open = null;
  for (const { offset, direction } of timeline) {
    if (direction.kind !== 'pedal') continue;
    if (direction.type === 'start') open ??= offset;
    else if (direction.type === 'stop' && open !== null) {
      ranges.push({ start: open, end: offset });
      open = null;
    }
  }
  return ranges;
}



/**
 * Duration and gain shaping for engraved articulation marks, matching
 * ScrollScore's `applyArticulation` — the same vocabulary this project's
 * MusicXML output already writes (`musicxml.js` pushes MusicXML tag names
 * straight into `event.articulations`, so the strings checked here are
 * `staccato`/`tenuto`/`staccatissimo`/`accent`/`strong-accent`, not the
 * rules table's `marcato` label). `sustain` is carved out of the note's own
 * written duration; the gap to the next note's onset — left untouched — is
 * what actually makes a shortened note audible as detached rather than just
 * quieter.
 *
 * `tail` also has to shrink for a detached mark, which ScrollScore's own
 * `applyArticulation` does not do — there `tail` is fixed per voice/pedal
 * state and never touched by articulation at all. That is fine when `tail`
 * is small relative to the notes it sits between, but this app's default
 * release (`TAIL`, 0.4s) is not: at a routine tempo an eighth note is
 * 0.2-0.3s apart from the next one, so halving `sustain` for staccato still
 * leaves `sustain + tail` well over half a second — the note keeps ringing
 * (through the reverb send too, which follows the same envelope) long past
 * the next note's onset, and the shortening is barely audible under that.
 * ScrollScore's own pizzicato guitar technique caps `tail` at 0.12s for
 * exactly this reason (a damped, short note needs its *release* short too,
 * not just its sustain) — the same fix, applied to staccato/staccatissimo.
 *
 * `staccato`'s 0.5 was the textbook rule ("half the written value"), but a
 * real pianist cuts a staccato note noticeably shorter than that, especially
 * in a light/quick sight-reading piece — closer to a third of the value, so
 * the gap before the next note's onset reads as a real detachment rather
 * than just a slightly shorter note. Narrowed to 0.35 (tail correspondingly
 * to 0.15s) while keeping a clear gap above staccatissimo's 0.25/0.12s, so
 * the two marks still sound distinct from each other.
 */
function applyArticulation(sustain, duration, articulations, tail) {
  if (!articulations?.length) return { sustain, gain: 1, tail };
  let s = sustain;
  let gain = 1;
  let t = tail;
  if (articulations.includes('staccatissimo')) { s = duration * 0.25; t = Math.min(t, 0.12); }
  else if (articulations.includes('staccato')) { s = duration * 0.35; t = Math.min(t, 0.15); }
  // Tenuto overrides even a competing shortening mark: holding a note its
  // full value is the entire point of the sign.
  if (articulations.includes('tenuto')) s = Math.max(s, duration * 0.98);
  if (articulations.includes('strong-accent')) gain = 1.5;
  else if (articulations.includes('accent')) gain = 1.3;
  return { sustain: s, gain, tail: t };
}




