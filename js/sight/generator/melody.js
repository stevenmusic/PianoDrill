/**
 * Pitch selection.
 *
 * Two things keep the result tonal rather than merely legal:
 *
 *  1. The hands are not written independently. The left hand goes first and
 *     becomes a sounding-bass timeline; every right-hand candidate is then
 *     checked against whatever is actually sounding underneath it, so seconds,
 *     sevenths and tritones cannot simply fall out of two separate walks.
 *  2. A non-chord note has to behave like one — approached by step and left by
 *     step. Anything leaping into or out of a dissonance is repaired to the
 *     nearest chord tone afterwards.
 */

import { chordDegrees, degreeOf, pitchAt } from './theory.js';
import { chordAt, firstChord } from './harmony.js';

/**
 * Interval classes that read as dissonant against the bass. A second, tritone
 * or minor seventh can pass off the beat; a semitone or major seventh between
 * the hands never can, at any of these grades.
 */
const HARSH_INTERVALS = new Set([1, 2, 6, 10, 11]);
const NEVER_INTERVALS = new Set([1, 11]);

/**
 * @param {object} params
 * @param {ReturnType<import('./random.js').createRandom>} params.rng
 * @param {ReturnType<import('./theory.js').createKey>} params.key
 * @param {Array<{events: object[], beatDuration: number}>} params.bars
 * @param {(string|[string, string])[]} params.progression roman numeral per
 *        bar, or a `[first, second]` pair for a bar that splits in half
 * @param {{low: number, high: number}} params.window allowed dstep window
 * @param {object} params.options
 * @param {Array<{start: number, end: number, midis: number[]}>} [params.against]
 *        sounding notes of the other hand, in absolute divisions
 */
/**
 * Plan the bass's downbeats for the whole piece before any bar is filled.
 *
 * Choosing each bar's first bass note on its own (root first, nearest to
 * wherever the last note was) is what made the bass hop between chord roots:
 * bar to bar it moved a fourth or more 57-61% of the time, by step 17-19%,
 * and kept direction only 31% of the time — a zigzag, which is what read as
 * mechanical. A small dynamic programme over the bars picks root or third
 * (plus octave) for every downbeat so the line moves by step and common tone
 * where it can, keeps going the way it was going, and sinks through each
 * phrase toward its cadence. Fixed points: the first bar, the cadential V and
 * the closing I take their roots. Never two inversions running.
 *
 * Returns `plan[barIndex] = dstep` (undefined for bars that do not start with
 * a note). It is offered to the walk as a *preference*, so every hard filter
 * there (leap limits, clashes) still applies.
 */
export function planBassLine({ rng, key, bars, progression, window, inversion = 0.5, phraseEnd = null }) {
  // The half cadence is a root-position V, the same as the final cadence's.
  const n = bars.length;
  const span = window.high - window.low;
  const steps = [];
  for (let d = window.low; d <= window.high; d++) steps.push(d);
  const phraseOf = (b) => (phraseEnd !== null && b > phraseEnd ? [phraseEnd + 1, n - 1] : [0, phraseEnd ?? n - 1]);
  const lineAt = (b) => {   // falls from upper-middle to lower-middle across each phrase
    const [a, z] = phraseOf(b);
    const t = z > a ? (b - a) / (z - a) : 0;
    return window.low + span * (0.62 - 0.3 * t);
  };
  const stages = [];
  bars.forEach((bar, b) => {
    const first = bar.events[0];
    if (!first || first.rest) return;
    const tones = chordDegrees(firstChord(progression[b] ?? 'I'));
    const fixed = b === 0 || b === n - 2 || b === n - 1 || b === phraseEnd || !stages.length;
    const options = [];
    for (const d of steps) {
      const degree = degreeOf(d, key);
      if (degree === tones[0]) options.push({ d, third: false });
      else if (!fixed && inversion > 0 && degree === tones[1] && degree !== 6) options.push({ d, third: true });
    }
    if (options.length) stages.push({ b, options, chord: firstChord(progression[b] ?? 'I') });
  });
  if (stages.length < 2) return [];
  const midi = (d) => pitchAt(d, key).midi;
  const moveCost = (from, to) => {
    const steps = Math.abs(to - from), semis = Math.abs(midi(to) - midi(from));
    if (semis > 12) return Infinity;
    return steps === 0 ? 1.2 : steps === 1 ? 0 : steps === 2 ? 1.6 : steps === 3 ? 3.2 : 3.6 + 0.5 * (steps - 4);
  };
  // State = (option at this stage, option at the previous stage), so direction can be scored.
  let layer = stages[0].options.map((o, i) => ({ cost: 0.2 * Math.abs(o.d - lineAt(stages[0].b)), path: [i], prev: null }));
  for (let k = 1; k < stages.length; k++) {
    const next = [];
    stages[k].options.forEach((o, j) => {
      let best = null;
      for (const state of layer) {
        const p = stages[k - 1].options[state.path[state.path.length - 1]];
        if (o.third && p.third) continue;                                      // never two inversions running
        let c = state.cost + moveCost(p.d, o.d);
        if (!Number.isFinite(c)) continue;
        if (state.prev !== null) {
          const before = Math.sign(p.d - state.prev), now = Math.sign(o.d - p.d);
          if (before && now && before === now) c -= 0.7;                       // keep going the way it was going
        }
        if (o.third) c += stages[k].chord === 'ii' ? 0.6 : stages[k].chord === 'I' ? 0.45 : 0.15;   // root position stays the norm (a tonic most of all)
        c += 0.2 * Math.abs(o.d - lineAt(stages[k].b)) + rng.next() * 0.5;
        if (!best || c < best.cost) best = { cost: c, path: [...state.path, j], prev: p.d };
      }
      if (best) next.push(best);
    });
    if (!next.length) return [];
    layer = next;
  }
  const win = layer.reduce((a, c) => (c.cost < a.cost ? c : a));
  const plan = [];
  win.path.forEach((j, k) => { plan[stages[k].b] = stages[k].options[j].d; });
  return plan;
}

/**
 * The melody's skeleton: one structural note per bar (its downbeat), planned
 * across the whole test before any bar is filled in.
 *
 * Choosing every note on the spot — a weighted step or leap from wherever the
 * last one landed, drawn faintly toward an arch — gives a line with no goals:
 * it circles the same two or three notes (A A A, then an unprepared leap down
 * and back), because nothing tells it where the next bar wants to be. Real
 * tunes are a few goal notes joined up: a line that rises through the
 * antecedent, comes to rest on 2 (or 7, or 5) at the half cadence, climbs to
 * one high point in the consequent and falls 3-2-1 into the tonic. A beam
 * search picks those downbeat notes — chord tones of each bar, moving mostly
 * by step or third, keeping direction, one climax, consonant with the bass
 * already written and never in parallel fifths or octaves with it — and bars
 * that restate an earlier bar take the matching transposed note. The walk
 * then aims each bar at the next bar's goal (see `assignPitches`).
 *
 * Returns `plan[barIndex] = dstep` for bars that open with a note.
 */
export function planMelodyLine({ rng, key, bars, progression, window, phraseEnd = null, form = [], against = null, barDuration = 0 }) {
  const n = bars.length;
  const span = window.high - window.low;
  const midi = (d) => soundingMidi(d, key);
  const lastPhrase = (b) => phraseEnd === null || b > phraseEnd;
  const targetAt = (b) => {
    const [a, z] = phraseEnd !== null && b > phraseEnd ? [phraseEnd + 1, n - 1] : [0, phraseEnd ?? n - 1];
    const t = z > a ? (b - a) / (z - a) : 0;
    const peak = lastPhrase(b) ? 0.85 : 0.55;
    const end = lastPhrase(b) ? 0.25 : 0.48;
    const h = t <= 0.6 ? 0.35 + (peak - 0.35) * (t / 0.6) : peak + (end - peak) * ((t - 0.6) / 0.4);
    return window.low + span * h;
  };
  const stages = [];
  bars.forEach((bar, b) => {
    const first = bar.events[0];
    if (!first || first.rest) return;
    const chord = firstChord(progression[b] ?? 'I');
    const tones = chordDegrees(chord);
    const sounding = against && barDuration ? soundingAt(against, b * barDuration, first.dur) : [];
    const atOnset = against && barDuration ? soundingAt(against, b * barDuration, 1) : [];
    const bass = atOnset.length ? Math.min(...atOnset) : null;
    const ceiling = sounding.length ? Math.max(...sounding) : null;
    const options = [];
    for (let d = window.low; d <= window.high; d++) {
      const degree = degreeOf(d, key);
      if (!tones.includes(degree)) continue;
      if (b === n - 1 && degree !== 0) continue;
      const m = midi(d);
      if (ceiling !== null && m < ceiling + 3) continue;   // a third clear of the accompaniment
      // Nothing the walk would refuse on a downbeat: no second, seventh or
      // tritone against anything the left hand is holding.
      if (sounding.some((o) => HARSH_INTERVALS.has(Math.abs(m - o) % 12))) continue;
      let cost = 0;
      if (bass !== null) {
        const vertical = (((m - bass) % 12) + 12) % 12;
        if (degree === 6 && sounding.some((o) => o % 12 === m % 12)) continue;   // doubled leading note
        if ([3, 4, 8, 9].includes(vertical)) cost -= 0.25;
        else if (vertical === 0 && b !== 0 && b !== n - 1) cost += 0.35;
      }
      if (stages.length === 0) cost += degree === 2 ? 0 : degree === 4 ? 0.15 : 0.3;
      else if (b === phraseEnd) cost += degree === 1 ? 0 : degree === 4 ? 0.3 : 0.5;
      else if (b === n - 2) cost += degree === 1 ? 0 : degree === 6 ? 0.3 : 0.6;
      options.push({ d, m, cost, bass });
    }
    if (options.length) stages.push({ b, options });
  });
  if (stages.length < 2) return [];
  const stageOf = new Map(stages.map((stage, k) => [stage.b, k]));
  const STEP = [1.0, 0, 0.4, 1.4, 2.2];
  let beam = stages[0].options.map((o) => ({
    cost: o.cost + 0.22 * Math.abs(o.d - targetAt(stages[0].b)) + rng.next() * 0.6,
    path: [o],
  }));
  for (let k = 1; k < stages.length; k++) {
    const { b, options } = stages[k];
    const boundary = phraseEnd !== null && stages[k - 1].b === phraseEnd;
    const plan = form[b] && form[b].transpose !== null && stageOf.has(form[b].source) ? form[b] : null;
    const next = [];
    for (const state of beam) {
      const p = state.path[k - 1];
      const p2 = k >= 2 ? state.path[k - 2] : null;
      for (const o of options) {
        const dd = Math.abs(o.d - p.d);
        if (!boundary && Math.abs(o.m - p.m) > 12) continue;
        let c = state.cost + o.cost + (boundary ? 0.2 * dd : STEP[dd] ?? 3 + (dd - 5));
        if (p2 && !boundary) {
          const before = Math.sign(p.d - p2.d), now = Math.sign(o.d - p.d);
          if (before && now === before && dd <= 2) c -= 0.25;                       // keeps going
          if (Math.abs(p.d - p2.d) >= 3 && now === -before) c -= 0.4;               // a leap turns back
          if (dd === 0 && p.d === p2.d) c += 2;                                     // three heads on one note
        }
        if (!boundary && o.bass !== null && p.bass !== null) {
          const mv = Math.sign(o.m - p.m), bv = Math.sign(o.bass - p.bass);
          const was = (((p.m - p.bass) % 12) + 12) % 12, is = (((o.m - o.bass) % 12) + 12) % 12;
          if (mv && mv === bv && was === is && (is === 0 || is === 7)) c += 4;     // parallel fifths/octaves
        }
        if (plan) {
          const want = state.path[stageOf.get(plan.source)].d + plan.transpose;
          if ((((o.d - want) % 7) + 7) % 7 !== 0) c += 6;                           // the restated bar's own note
        }
        c += 0.3 * Math.abs(o.d - targetAt(b)) + rng.next() * 0.6;
        next.push({ cost: c, path: [...state.path, o] });
      }
    }
    if (!next.length) return [];
    next.sort((x, y) => x.cost - y.cost);
    beam = next.slice(0, 48);
  }
  // One high point, and in the consequent where there is one.
  const total = (state) => {
    const top = Math.max(...state.path.map((o) => o.d));
    const at = state.path.map((o, k) => (o.d === top ? stages[k].b : -1)).filter((b) => b >= 0);
    let c = state.cost + 1.2 * (at.length - 1);
    // Reached first somewhere past the middle, never in the closing bars.
    if (at[0] < 0.45 * (n - 1)) c += 4;
    if (at.some((b) => b >= n - 2)) c += 2.5;                                       // the line falls into the cadence
    return c;
  };
  const best = beam.reduce((a, s) => (total(s) < total(a) ? s : a));
  const plan = [];
  best.path.forEach((o, k) => { plan[stages[k].b] = o.d; });
  return plan;
}

export function assignPitches({ rng, key, bars, progression, window, options, against }) {
  const {
    stepwiseBias = 0.7,
    maxLeapSemitones = 7,
    chordToneOnly = false,
    // How often a chord-tone-only hand (the bass) may take an off-beat
    // passing/neighbour tone. 0 restores the old chord-tones-only bass.
    bassDecoration = 0,
    fastLeapSemitones = 99,
    // How often the bass takes an inversion at a harmony arrival, where doing
    // so keeps the line stepwise. 0 restores root position as the only option.
    bassInversion = 0,
    endOnTonic = true,
    barDuration = 0,
    arch = 0,
    bassPlan = null,
    // The melody's planned downbeat notes (planMelodyLine): each bar aims at
    // the next one's.
    melodyPlan = null,
    // The antecedent's half-cadence bar (harmony.js halfCadenceBar), or null.
    halfBar = null,
    // Whether the last bar's downbeat must be the root (a bass, not Grade 1's
    // left-hand tune, which may close 3-2-1).
    closingRoot = true,
  } = options;

  const centre = (window.low + window.high) / 2;
  const allSteps = [];
  for (let dstep = window.low; dstep <= window.high; dstep++) allSteps.push(dstep);
  const aim = archTargets(window, centre, arch);

  // The cadence note is the last one that actually sounds, which is not
  // necessarily in the last bar — at Grade 1 a hand may rest through the
  // second half of the test.
  const soundingEvents = bars.flatMap((bar) => bar.events.filter((event) => !event.rest));
  const finalEvent = soundingEvents[soundingEvents.length - 1] ?? null;
  const penultimateEvent = soundingEvents.length >= 2
    ? soundingEvents[soundingEvents.length - 2]
    : null;
  const noteTotal = soundingEvents.length;
  // Where the closing tonic will land, worked out before the walk starts so
  // the note before it can aim to be a step away from it (see below).
  const cadenceTonic = endOnTonic ? (melodyPlan?.[bars.length - 1] ?? nearestWithDegree(allSteps, key, 0, aim(1))) : null;
  let noteIndex = 0;

  let previous = null;
  // The note before `previous`, so the bass can be kept from see-sawing A-B-A-B.
  let beforePrevious = null;
  let previousLeap = 0;
  let repeatRun = 0;
  // Direction and length of the current run of consecutive same-direction
  // steps — see pickWeighted for why this matters.
  let runDirection = 0;
  let runLength = 0;
  // Same idea, for consecutive same-direction leaps that stay on chord
  // tones — an arpeggio/broken-chord figure rather than a run of scale
  // steps. See pickWeighted for why leaps need this tracked separately.
  let arpeggioDirection = 0;
  let arpeggioLength = 0;
  // The chord the previous note belonged to, so a harmony arrival can be told
  // from a note merely continuing under the same chord.
  let previousChord = null;
  /*
   * Whether the previous note was a chord tone *of the chord that was
   * sounding when it was chosen*. `pickWeighted` used to recompute this
   * against the incoming note's chord, which is a different question: at
   * every harmony change the previous note usually does not belong to the new
   * chord, so a perfectly good chord tone was read as an unresolved passing
   * tone and the resolution force fired. That override beat every other
   * preference — motif, cadence, and the bass's root — and it fired at
   * exactly the moments those matter most, the harmony arrivals.
   */
  let previousWasChordTone = true;
  /*
   * The leading note is a tendency tone — it wants the tonic a step above —
   * and the bass of the previous moment is what a parallel fifth or octave is
   * measured against. Neither was tracked, so neither could be honoured.
   */
  let previousWasLeadingNote = false;
  let previousBass = null;
  let previousDur = null;

  const walkBar = (bar, barIndex) => {
    const entry = progression[barIndex] ?? 'I';
    let offset = 0;
    /*
     * A bar restating an earlier bar's motif (see generate.js's `buildStaff`)
     * carries `bar.motif = {sourceBarIndex, transpose}`, where `transpose` is
     * the distance between the two bars' chord roots and therefore maps the
     * source bar's chord tones exactly onto this bar's. Every note is placed
     * from that transposition directly — `source[j] + transpose + octave` —
     * and not relative to whatever this bar's first note turned out to be.
     *
     * Re-basing on the realised first note is the obvious alternative and it
     * is a trap: when the first note is rejected for some reason of its own
     * (unreachable by leap, clashing with the left hand), every later note
     * inherits that arbitrary displacement, lands off the chord, gets
     * rejected by the chord-tone filters in turn, and is finally relocated by
     * `repairNonChordTones`. One unlucky note took the whole bar with it —
     * measured as roughly halving the number of restatements that survived.
     * Placing each note absolutely means a rejected note costs only itself.
     */
    const motif = bar.motif ?? null;
    const motifSource = motif
      ? bars[motif.sourceBarIndex]?.events.filter((e) => !e.rest && e.dstep !== undefined) ?? null
      : null;
    let motifIndex = 0;
    let motifOctave = null;
    // The bar carrying the cadential dominant, where the bass must take the
    // root: a V-I whose bass is on the leading note or the second degree is
    // not the cadence the rest of the test has been heading toward.
    const isCadentialBar = barIndex === bars.length - 2;
    /*
     * The closing tonic needs its root in the bass for the same reason the
     * dominant before it does: the whole test has been heading here, and a
     * final I sitting in first inversion does not land. Both bars are
     * therefore off-limits to the smooth-inversion preference below — without
     * this, offering an inversion wherever it buys a stepwise bass took the
     * final bar's root position from 92% down to 81-85%.
     */
    const isClosingBar = barIndex === bars.length - 1;

    bar.events.forEach((event) => {
      if (event.rest) {
        offset += event.dur;
        return;
      }

      // A bar that splits into two chords (see harmony.js's `chordAt`)
      // hands each half its own tones — a note picks its governing chord
      // by when it starts, same as any other harmonic-rhythm change.
      const tones = chordDegrees(chordAt(entry, offset, barDuration, bar.beatDuration));
      const absolute = barIndex * barDuration + offset;
      const sounding = soundingAt(against, absolute, event.dur);
      const onBeat = offset % bar.beatDuration === 0;
      const isDownbeat = offset === 0;
      const isFinalNote = event === finalEvent;
      const position = noteTotal > 1 ? noteIndex / (noteTotal - 1) : 0;
      /*
       * With a planned skeleton the line is drawn from this bar's goal note
       * toward the next bar's, so each bar travels somewhere and arrives at the
       * barline a step or so from where the next bar begins.
       */
      const planHere = melodyPlan?.[barIndex];
      const planNext = melodyPlan?.[barIndex + 1];
      const target = melodyPlan && (planHere !== undefined || planNext !== undefined)
        ? (planHere ?? planNext) + ((planNext ?? planHere) - (planHere ?? planNext)) * (offset / (barDuration || 1))
        : aim(position);

      /*
       * The pitch this note would ideally take, offered to `pickWeighted` and
       * used only if it survives every hard filter there. Two things ask for
       * one: a motif restatement (shape), and the approach to the closing
       * tonic (cadence). A cadence is approached by step in real writing —
       * the leading note rising to the tonic, or the supertonic falling to it
       * — and both of those degrees belong to the V chord that is virtually
       * always sounding underneath, so the preference usually survives.
       */
      /*
       * The bass takes the root of the chord where the harmony arrives. Not
       * doing so was the single largest fault the Monte-Carlo audit found:
       * the bass line was picked as *melody* — nearest chord tone, weighted
       * for stepwise motion — with no notion of root position at all, so only
       * the very first note of a piece ever deliberately took a root. The
       * cadential V got its own root barely a third of the time, which is why
       * the closing V-I did not sound like a cadence.
       *
       * Root position is the norm rather than the rule: leaving a fifth of
       * harmony arrivals to the ordinary weighting is what keeps first and
       * second inversions in the language. The cadence is not up for a roll.
       */
      const chordHere = chordAt(entry, offset, barDuration, bar.beatDuration);
      // A bar that opens with a rest still states its harmony with its first note.
      const firstSounding = bar.events.find((e) => !e.rest) === event;
      const harmonyArrives = isDownbeat || firstSounding || chordHere !== previousChord;
      previousChord = chordHere;

      let preferred = null;
      const lastInBar = bar.events.slice(bar.events.indexOf(event) + 1).every((e) => e.rest);
      const nextPlan = bassPlan?.[barIndex + 1];
      if (chordToneOnly && isDownbeat && bassPlan?.[barIndex] !== undefined) {
        preferred = bassPlan[barIndex];
      } else if (chordToneOnly && lastInBar && !isDownbeat && barIndex === halfBar) {
        // The half cadence lands: the bass ends the antecedent on the dominant's root.
        preferred = nearestWithDegree(allSteps, key, tones[0], previous ?? target);
      } else if (chordToneOnly && lastInBar && !isDownbeat && nextPlan !== undefined && !harmonyArrives) {
        // Lead into the next planned downbeat: the chord tone nearest it (by step
        // where possible), so bar joins bar instead of the bass jumping at the line.
        const near = allSteps.filter((d) => tones.includes(degreeOf(d, key)) && d !== nextPlan
          && (degreeOf(d, key) !== 6 || d + 1 === nextPlan))   // a leading note only where it rises to the tonic
          .sort((a, b) => Math.abs(a - nextPlan) - Math.abs(b - nextPlan));
        if (near.length) preferred = near[0];
      } else if (chordToneOnly && harmonyArrives) {
        /*
         * An inversion is not a coin toss against root position — in real
         * writing the bass takes the third (far less often the fifth)
         * *because* doing so keeps the line conjunct: vi6 or IV6 appears
         * where the third happens to lie a step from where the bass already
         * is. Rolling a flat chance for "some inversion" and then picking the
         * nearest chord tone, which is what leaving a fifth of arrivals to
         * the ordinary weighting amounted to, lands back on the root most of
         * the time anyway: measured 87-93% root position at downbeats across
         * the grades, against roughly 60-70% in classical practice.
         *
         * So the inversion is offered only where it actually buys a step,
         * which is both the reason to use one and the thing that makes the
         * bass sing. The cadential V is never up for it — that one needs its
         * root — and neither is the opening note, handled below.
         */
        /*
         * Second inversion is not simply a rarer first inversion — a 6/4 is
         * rule-bound in this idiom (cadential, passing or pedal), not a
         * colour available wherever the fifth happens to lie a step away.
         * Offering the third and the fifth on equal terms doubled the 6/4
         * rate against the pre-change generator; this keeps it a minority of
         * an already-conditional choice.
         */
        // Never the fifth: a 6/4 outside the cadential formula is a fault on the page.
        const smooth = previous === null || isCadentialBar || isClosingBar || barIndex === halfBar
          ? null
          : smoothInversion(allSteps, key, tones, previous, false);
        if (smooth !== null && rng.chance(bassInversion)) preferred = smooth;
        else if (isCadentialBar || isClosingBar || barIndex === halfBar || rng.chance(0.88)) {
          preferred = nearestWithDegree(allSteps, key, tones[0], previous ?? target);
        }
      } else if (event === penultimateEvent && cadenceTonic !== null) {
        preferred = cadenceApproach(cadenceTonic, previous, window);
      } else if (motifSource && !isFinalNote) {
        const source = motifIndex < (motif.limit ?? Infinity) ? motifSource[motifIndex] : null;
        if (source) {
          // The octave is settled once for the whole bar, by how well the
          // entire shape fits the window rather than by where its first note
          // would like to sit. Placing it by the first note alone reliably
          // wrecked restatements that reach upward: starting the motif an
          // octave high because the previous note happened to be high pushed
          // everything after it off the top of the window, where it was
          // rejected note by note and replaced by the lottery — the left hand
          // would restate a bar perfectly while the right hand, whose window
          // is the binding one, kept only its first note.
          if (motifOctave === null) {
            // The skeleton already chose where this restatement sits.
            motifOctave = planHere !== undefined && !chordToneOnly && motifIndex === 0
              ? Math.round((planHere - (motifSource[0].dstep + motif.transpose)) / 7) * 7
              : fitMotifOctave(motifSource, motif.transpose, window, previous ?? target);
          }
          preferred = isDownbeat && planHere !== undefined && !chordToneOnly
            ? planHere
            : source.dstep + motif.transpose + motifOctave;
        }
      }
      if (preferred === null && melodyPlan && !chordToneOnly && !isFinalNote) {
        if (isDownbeat && planHere !== undefined) preferred = planHere;
        else if (lastInBar && planNext !== undefined && previous !== null) {
          // Arrive at the next goal by step, from the side the line is on — or,
          // on a beat (where a non-chord note must be a passing step), by the
          // nearest chord tone that leads there.
          const side = previous <= planNext ? -1 : 1;
          const options = [planNext + side, planNext - side, planNext + 2 * side, planNext - 2 * side];
          // A chord tone may sit anywhere; a passing note must be stepped into
          // on its way to the goal, so that resolving it *is* arriving there.
          preferred = options.find((d) => d !== previous && d >= window.low && d <= window.high
            && (tones.includes(degreeOf(d, key))
              || (Math.abs(d - previous) === 1 && Math.sign(d - previous) === Math.sign(planNext - d)))) ?? null;
        }
      }

      let chosen;
      if (isFinalNote && endOnTonic) {
        chosen = nearestWithDegree(allSteps, key, 0, previous ?? target);
      } else if (previous === null) {
        if (chordToneOnly && bassPlan?.[barIndex] !== undefined && offset === 0) {
          chosen = bassPlan[barIndex];
        } else if (chordToneOnly) {
          // The harmonic foundation (bass) opens in root position: a real
          // test's opening low note is the chord's root, not whichever
          // chord member happens to sit closest to the middle of the range.
          // `tones[0]` is always the root — chordDegrees() builds a triad
          // as [root, root+2, root+4].
          chosen = nearestWithDegree(allSteps, key, tones[0], target);
        } else {
          const openings = allSteps.filter((dstep) => tones.includes(degreeOf(dstep, key)));
          chosen = leastDistant(openings.length ? openings : allSteps, target);
        }
      } else {
        const fast = event.dur <= bar.beatDuration / 2 || (previousDur !== null && previousDur <= bar.beatDuration / 2);
        const cadenceRoot = ((isCadentialBar || barIndex === halfBar) && chordHere === 'V') || (closingRoot && isClosingBar && isDownbeat);
        let widen = 0;
        if (chordToneOnly && harmonyArrives && previous !== null) {
          const limit = Math.min(maxLeapSemitones, fast ? fastLeapSemitones : 99);
          const from = soundingMidi(previous, key);
          const wanted = cadenceRoot ? [tones[0]] : [tones[0], tones[1]];
          const reachable = allSteps.some((d) => wanted.includes(degreeOf(d, key)) && Math.abs(soundingMidi(d, key) - from) <= limit);
          if (!reachable) widen = cadenceRoot ? 12 : 7;
        }
        chosen = pickWeighted({
          rng,
          key,
          allSteps,
          previous,
          previousLeap,
          repeatRun,
          runDirection,
          runLength,
          arpeggioDirection,
          arpeggioLength,
          previousWasChordTone,
          previousWasLeadingNote,
          previousBass,
          tones,
          onBeat,
          isDownbeat,
          centre: target,
          stepwiseBias,
          // Where the harmony arrives and the bass cannot reach a root or third
          // within its usual leap, it may leap a fifth (I-V is 1 up to 5 inside
          // a five-finger hand) rather than open on the fifth, a 6/4. A
          // cadence's dominant and the closing tonic may leap up to an octave
          // for the root.
          maxLeapSemitones: widen ? Math.max(maxLeapSemitones, widen) : maxLeapSemitones,
          // Moving the hand a long way between short notes is the hardest
          // thing in sight-reading: cap how far a leap may go when either
          // note is an eighth or shorter, by grade.
          fastLeapLimit: fast ? (widen ? Math.max(fastLeapSemitones, 7) : fastLeapSemitones) : 99,
          chordToneOnly,
          bassDecoration,
          sounding,
          preferred,
          beforePrevious,
          shortNote: event.dur <= bar.beatDuration / 4 ? 'sixteenth' : event.dur <= bar.beatDuration / 2 ? 'eighth' : null,
          pull: melodyPlan && !chordToneOnly ? 0.45 : 0.12,
          arrival: chordToneOnly && harmonyArrives,
          // A cadence (half or full) arrives on a root-position dominant.
          rootOnly: chordToneOnly && cadenceRoot,
        });
      }

      if (motifSource) motifIndex += 1;
      noteIndex += 1;

      // Captured before `previousWasChordTone` is overwritten below: this is
      // whether the note we are moving *from* was itself a chord tone, which
      // an arpeggio's continuation needs on both ends of the leap.
      const fromWasChordTone = previousWasChordTone;
      previousWasChordTone = tones.includes(degreeOf(chosen, key));
      /*
       * A leading note only *functions* as one when it sits on dominant
       * harmony. The 7th degree passing downward through a descending scale
       * over the tonic is an ordinary passing note and must stay free to fall
       * — demanding that every degree-7 rise would rewrite exactly the writing
       * the idiom expects.
       */
      previousWasLeadingNote = degreeOf(chosen, key) === 6
        && (chordHere === 'V' || chordHere === 'viio');
      previousBass = sounding.length ? Math.min(...sounding) : null;
      const interval = previous === null ? 0 : chosen - previous;
      repeatRun = interval === 0 ? repeatRun + 1 : 0;
      const stepDirection = Math.abs(interval) === 1 ? Math.sign(interval) : 0;
      if (stepDirection !== 0 && stepDirection === runDirection) {
        runLength += 1;
      } else {
        runDirection = stepDirection;
        runLength = stepDirection !== 0 ? 1 : 0;
      }
      const leapDirection = Math.abs(interval) >= 2 ? Math.sign(interval) : 0;
      const continuesArpeggio = leapDirection !== 0 && fromWasChordTone && previousWasChordTone;
      if (continuesArpeggio && leapDirection === arpeggioDirection) {
        arpeggioLength += 1;
      } else {
        arpeggioDirection = continuesArpeggio ? leapDirection : 0;
        arpeggioLength = continuesArpeggio ? 1 : 0;
      }
      previousLeap = interval;
      beforePrevious = previous;
      previous = chosen;
      previousDur = event.dur;

      event.dstep = chosen;
      // Written as harmonic minor throughout: the leading note is raised
      // wherever it occurs, not just under a dominant-function chord.
      // `pitchAt` only actually applies this for a minor key, so the flag
      // is harmless (a no-op) in major keys.
      event.raiseSeventh = degreeOf(chosen, key) === 6;
      event.chordDegrees = tones;
      event.pitch = pitchAt(chosen, key, { raiseSeventh: event.raiseSeventh });
      offset += event.dur;
    });
  };

  const snapshot = () => ({
    noteIndex, previous, beforePrevious, previousLeap, repeatRun, runDirection, runLength, arpeggioDirection,
    arpeggioLength, previousChord, previousWasChordTone, previousWasLeadingNote, previousBass, previousDur,
  });
  const restore = (state) => {
    ({
      noteIndex, previous, beforePrevious, previousLeap, repeatRun, runDirection, runLength, arpeggioDirection,
      arpeggioLength, previousChord, previousWasChordTone, previousWasLeadingNote, previousBass, previousDur,
    } = state);
  };
  /*
   * How well a written bar serves the plan: on its own goal note, and arriving
   * at the next bar's goal by step (a passing note there has to be heading
   * into it). Turning back and forth, repeated notes and wide leaps cost a
   * little — a line that goes somewhere, rather than one that circles.
   */
  const scoreBar = (bar, barIndex, start) => {
    const notes = bar.events.filter((event) => !event.rest);
    const here = melodyPlan[barIndex];
    const next = melodyPlan[barIndex + 1];
    let cost = 0;
    if (!bar.events[0].rest && here !== undefined && notes[0].dstep !== here) cost += 2;
    const last = notes[notes.length - 1];
    if (next !== undefined && last !== finalEvent) {
      const d = Math.abs(last.dstep - next);
      cost += d === 1 ? 0 : d === 0 ? 1.2 : d === 2 ? 0.6 : 1.5 + 0.5 * (d - 3);
      const before = notes.length > 1 ? notes[notes.length - 2].dstep : start.previous;
      if (!last.chordDegrees.includes(degreeOf(last.dstep, key))
        && (d !== 1 || before === null || Math.sign(last.dstep - before) !== Math.sign(next - last.dstep))) cost += 2.5;
    }
    // One pitch struck four or more times in a bar (E-B-B-E-B-B) is a stutter.
    const counts = {};
    for (const note of notes) counts[note.dstep] = (counts[note.dstep] ?? 0) + 1;
    for (const k in counts) if (counts[k] >= 4) cost += 1.5 * (counts[k] - 3);
    // The antecedent ends on the dominant: its last note is 2, 5 or 7.
    if (barIndex === halfBar && ![1, 4, 6].includes(degreeOf(last.dstep, key))) cost += 3;
    // Nothing overshoots the planned climax before the climax bar is reached.
    if (barIndex < climaxBar) cost += 1.5 * notes.filter((note) => note.dstep >= climax).length;
    let previousNote = start.previous;
    let direction = 0;
    let before = start.beforePrevious;
    for (const note of notes) {
      if (previousNote !== null) {
        const interval = note.dstep - previousNote;
        if (interval === 0 && before === previousNote) cost += 4;                 // three on one pitch
        if (interval === 0) cost += 0.4;
        else {
          if (direction && Math.sign(interval) !== direction) cost += 0.25;
          direction = Math.sign(interval);
          if (Math.abs(interval) >= 4) cost += 0.3;
        }
      }
      before = previousNote;
      previousNote = note.dstep;
    }
    return cost;
  };
  const planned = melodyPlan ? melodyPlan.filter((d) => d !== undefined) : [];
  const climax = planned.length ? Math.max(...planned) : Infinity;
  const climaxBar = melodyPlan ? melodyPlan.findIndex((d) => d === climax) : -1;
  const FIELDS = ['dstep', 'raiseSeventh', 'chordDegrees', 'pitch'];
  bars.forEach((bar, barIndex) => {
    // The bass, and a melody without a plan, are written in one pass.
    if (!melodyPlan || chordToneOnly || !bar.events.some((event) => !event.rest)) {
      walkBar(bar, barIndex);
      return;
    }
    // A planned melody tries a bar several ways and keeps the one that best
    // reaches its goals — composing the bar, rather than accepting whatever
    // a single run of note-by-note choices happened to produce.
    const start = snapshot();
    let best = null;
    for (let trial = 0; trial < 12; trial++) {
      restore(start);
      walkBar(bar, barIndex);
      const cost = scoreBar(bar, barIndex, start);
      if (!best || cost < best.cost) {
        best = {
          cost,
          state: snapshot(),
          notes: bar.events.map((event) => (event.rest ? null : Object.fromEntries(FIELDS.map((f) => [f, event[f]])))),
        };
      }
      if (cost <= 0.3) break;
    }
    restore(best.state);
    bar.events.forEach((event, i) => { if (best.notes[i]) Object.assign(event, best.notes[i]); });
  });

  repairNonChordTones(bars, key, window, { against, barDuration, finalEvent: endOnTonic ? finalEvent : null });
  fixAugmentedSeconds(bars, key);
  // Both repairs move pitches after the vertical check, so verify once more.
  resolveClashes({ bars, key, window, against, barDuration, finalEvent: endOnTonic ? finalEvent : null });
  // resolveClashes can relocate a note onto the raised 7th next to the natural
  // 6th, so the augmented-2nd rule has to be re-checked after it rather than
  // only before — it writes raised 7ths now, where it used to force naturals.
  fixAugmentedSeconds(bars, key);
  // The cadence is settled last, and by construction rather than by
  // preference: every pass above can move the note before the tonic, so a
  // stepwise approach merely *asked* for during the walk survived only about
  // a fifth of the time. A melody arriving at its final tonic by leap is the
  // single most audible way an ending sounds arbitrary.
  if (endOnTonic && !chordToneOnly) {
    shapeCadence({ bars, key, window, against, barDuration, soundingEvents });
  }
  // resolveClashes can leave a repeated note disagreeing with itself (see
  // harmoniseRepeatedLeadingNotes) — check that last, since it depends on
  // whatever resolveClashes just decided.
  harmoniseRepeatedLeadingNotes(bars, key);
  return bars;
}

/** Absolute-time index of one hand's sounding notes, for vertical checks. */
export function soundingTimeline(bars, barDuration) {
  const timeline = [];
  bars.forEach((bar, barIndex) => {
    let offset = 0;
    for (const event of bar.events) {
      if (!event.rest && event.pitch) {
        const start = barIndex * barDuration + offset;
        timeline.push({
          start,
          end: start + event.dur,
          midis: [event.pitch.midi, ...(event.chord ?? []).map((p) => p.midi)],
        });
      }
      offset += event.dur;
    }
  });
  return timeline;
}

function soundingAt(timeline, start, duration) {
  if (!timeline?.length) return [];
  const end = start + duration;
  const midis = [];
  for (const entry of timeline) {
    if (entry.start < end && entry.end > start) midis.push(...entry.midis);
  }
  return midis;
}

/** The pitch a dstep will actually sound at, per the always-raised harmonic-minor policy. */
function soundingMidi(dstep, key) {
  return pitchAt(dstep, key, { raiseSeventh: degreeOf(dstep, key) === 6 }).midi;
}

/**
 * The moving pitch the line is drawn toward, as a function of how far
 * through the piece a note is (0 at the first note, 1 at the last).
 *
 * A fixed attraction to the middle of the tessitura — what this used to be —
 * gives every note the same target, so the line has no reason to go anywhere:
 * it mills about the centre and touches its highest note two or three times
 * at arbitrary places. Real melodies, and ABRSM's specimens in particular,
 * are shaped: they start in the lower-middle of their range, rise to a single
 * climax roughly two thirds through (inside the consequent phrase), then fall
 * away to the cadence. Interpolating the target along that arch is what makes
 * the line read as going somewhere rather than as bars stitched end to end.
 *
 * `amount` scales the whole effect back toward the flat centre, so a bass
 * line — which should stay put underneath the tune, not arch — can pass 0
 * and keep exactly the old behaviour.
 */
function archTargets(window, centre, amount) {
  if (!amount) return () => centre;
  const span = window.high - window.low;
  const PEAK_AT = 0.68;
  const START = 0.34;
  const PEAK = 0.86;
  const END = 0.30;

  return (position) => {
    const height = position <= PEAK_AT
      ? START + (PEAK - START) * (position / PEAK_AT)
      : PEAK + (END - PEAK) * ((position - PEAK_AT) / (1 - PEAK_AT));
    const arched = window.low + span * height;
    return centre + (arched - centre) * amount;
  };
}

/**
 * Put a real cadence on the end of the melodic line: the last note on the
 * tonic, the one before it a step away from that tonic.
 *
 * Almost every closing gesture in tonal music approaches the final tonic by
 * step — the leading note rising to it, or the supertonic falling to it — and
 * in a minor key that rising leading note is exactly what the harmonic-minor
 * policy already raises. Both of those degrees also belong to the dominant
 * chord that the progression puts under the penultimate bar, so the approach
 * agrees with the harmony rather than fighting it.
 *
 * The bass is deliberately excluded (`chordToneOnly`): a bass line is
 * *supposed* to leap V–I at the cadence, and stepping it down onto the tonic
 * would flatten the one leap that belongs there.
 */
function shapeCadence({ bars, key, window, against, barDuration, soundingEvents }) {
  if (soundingEvents.length < 2) return;
  const final = soundingEvents[soundingEvents.length - 1];
  const penultimate = soundingEvents[soundingEvents.length - 2];
  if (!final?.pitch || !penultimate?.pitch) return;

  const sounding = soundingAtEvent(bars, against, barDuration, penultimate);
  const before = soundingEvents[soundingEvents.length - 3] ?? null;
  const tonic = final.dstep;
  // The melody has to clear the other hand here as much as anywhere else;
  // this pass runs after resolveClashes, so nothing downstream would catch it.
  const ceiling = sounding.length ? Math.max(...sounding) : null;
  /*
   * When the note before the tonic is itself the final bar's downbeat, it sits
   * on the tonic chord's strongest beat: a 2 or 7 there is an accented
   * dissonance on the last chord (15-18% of tests ended that way). Only a
   * chord tone may take that beat, so the step approach is left out there.
   */
  const onDownbeat = bars.some((bar) => bar.events.find((event) => !event.rest) === penultimate && bar.events[0] === penultimate);
  // The leading note first: 7–1 is the stronger of the two approaches.
  for (const candidate of [tonic - 1, tonic + 1]) {
    if (candidate < window.low || candidate > window.high) continue;
    if (onDownbeat && !(penultimate.chordDegrees ?? []).includes(degreeOf(candidate, key))) continue;
    let raiseSeventh = degreeOf(candidate, key) === 6;
    /*
     * This runs after `fixAugmentedSeconds`, so it has to keep that rule
     * itself: raising the 7th when the note before it is the natural 6th a
     * step below makes a melodic augmented 2nd, which these tests never
     * write. Falling back to the natural 7th still reaches the tonic by step,
     * which is what this function is actually for.
     */
    if (raiseSeventh && before
      && degreeOf(before.dstep, key) === 5
      && Math.abs(candidate - before.dstep) === 1) {
      raiseSeventh = false;
    }
    const pitch = pitchAt(candidate, key, { raiseSeventh });
    if (clashesWith(pitch.midi, sounding)) continue;
    if (ceiling !== null && pitch.midi < ceiling) continue;
    /*
     * The preferred approach *is* the leading note, and the chord underneath
     * it at a cadence is the dominant — which contains the leading note too.
     * So this is the one place in the generator that reaches for a doubled
     * leading note by design, and it was the last source of them left.
     * The supertonic above is tried next and descends to the tonic just as
     * properly.
     */
    if (raiseSeventh && sounding.some((other) => (other % 12) === (pitch.midi % 12))) continue;
    penultimate.dstep = candidate;
    penultimate.raiseSeventh = raiseSeventh;
    penultimate.pitch = pitch;
    break;
  }
  keepCadenceClose({ bars, key, window, against, barDuration, before, penultimate, final });
}

/**
 * The cadence is pinned to the tonic's octave after the walk is done, so a line
 * that finished high can be followed by a final step that sits an octave and
 * more below it (G5 then D#4-E4). Real endings do not drop two octaves in one
 * breath: when the closing pair is far from the note before it, move the pair
 * (approach and tonic together, keeping their step) an octave toward it.
 */
function keepCadenceClose({ bars, key, window, against, barDuration, before, penultimate, final }) {
  if (!before?.pitch || final.chord || penultimate.chord) return;
  const gap = penultimate.pitch.midi - before.pitch.midi;
  if (Math.abs(gap) <= 9) return;
  const shift = gap > 0 ? -7 : 7;
  const moved = [penultimate, final].map((event) => {
    const dstep = event.dstep + shift;
    return { event, dstep, pitch: pitchAt(dstep, key, { raiseSeventh: event.raiseSeventh }) };
  });
  for (const { dstep, pitch, event } of moved) {
    if (dstep < window.low || dstep > window.high) return;
    const sounding = soundingAtEvent(bars, against, barDuration, event);
    if (clashesWith(pitch.midi, sounding)) return;
    if (sounding.length && pitch.midi < Math.max(...sounding)) return;
  }
  if (Math.abs(moved[0].pitch.midi - before.pitch.midi) >= Math.abs(gap)) return;
  for (const { dstep, pitch, event } of moved) {
    event.dstep = dstep;
    event.pitch = pitch;
  }
}

/** What the other hand is sounding while `event` sounds. */
function soundingAtEvent(bars, against, barDuration, event) {
  if (!against?.length) return [];
  for (let barIndex = 0; barIndex < bars.length; barIndex++) {
    let offset = 0;
    for (const candidate of bars[barIndex].events) {
      if (candidate === event) {
        return soundingAt(against, barIndex * barDuration + offset, candidate.dur);
      }
      offset += candidate.dur;
    }
  }
  return [];
}

/**
 * The octave displacement that lets the most of a transposed motif land
 * inside the hand's window, breaking ties toward starting near `near` (the
 * note the line is coming from, so the restatement is reachable).
 */
function fitMotifOctave(source, transpose, window, near) {
  let best = 0;
  let bestScore = -Infinity;
  for (let shift = -14; shift <= 14; shift += 7) {
    let inside = 0;
    for (const note of source) {
      const dstep = note.dstep + transpose + shift;
      if (dstep >= window.low && dstep <= window.high) inside += 1;
    }
    // Fitting the shape dominates; proximity only settles ties between
    // octaves that fit equally well.
    const score = inside * 100 - Math.abs(source[0].dstep + transpose + shift - near);
    if (score > bestScore) {
      bestScore = score;
      best = shift;
    }
  }
  return best;
}

/**
 * The note to aim for immediately before the closing tonic: a step above or
 * below it, whichever is nearer to where the line already is, preferring the
 * leading note below on a tie (7–1 is the strongest of the two).
 */
function cadenceApproach(tonicDstep, previous, window) {
  const below = tonicDstep - 1;
  const above = tonicDstep + 1;
  const inRange = (dstep) => dstep >= window.low && dstep <= window.high;
  if (!inRange(below)) return inRange(above) ? above : null;
  if (!inRange(above)) return below;
  if (previous === null) return below;
  return Math.abs(above - previous) < Math.abs(below - previous) ? above : below;
}

function pickWeighted(ctx) {
  const {
    rng, key, allSteps, previous, previousLeap, repeatRun, runDirection, runLength, tones,
    arpeggioDirection, arpeggioLength, onBeat, isDownbeat, centre, stepwiseBias, maxLeapSemitones,
    chordToneOnly, sounding, previousWasChordTone, previousWasLeadingNote, previousBass, preferred = null,
    bassDecoration = 0, fastLeapLimit = 99, beforePrevious = null, shortNote = null, pull = 0.12, arrival = false, rootOnly = false,
  } = ctx;
  const bass = sounding.length ? Math.min(...sounding) : null;
  // On a planned line, which way the bar's goal lies (0 when already close):
  // momentum only counts when it carries the line toward it.
  const planned = pull > 0.12;
  const toward = planned && Math.abs(centre - previous) >= 1.5 ? Math.sign(centre - previous) : 0;
  const runCounts = !planned || toward === 0 || runDirection === toward;

  const previousMidi = soundingMidi(previous, key);
  const ceiling = sounding.length ? Math.max(...sounding) : null;

  /*
   * Whether *this* bass note is allowed to be a decoration, rolled once for
   * the note rather than left to the weighting inside the loop below. The
   * rate has to be gated here because the category lottery at the end of this
   * function weights step-versus-leap by `stepwiseBias` alone and ignores the
   * individual candidates' weights entirely: merely admitting non-chord steps
   * as candidates would hand the bass the melody's own 62-75% stepwise bias
   * wholesale, overshooting as badly in one direction as the old outright ban
   * did in the other. A per-note roll is what actually makes
   * `bassDecorationPercent` mean "this share of eligible bass notes".
   */
  const decorateBass = chordToneOnly && bassDecoration > 0 && rng.chance(bassDecoration);

  const repeats = [];
  const steps = [];
  const leaps = [];
  const tight = [];
  let preferredCandidate = null;
  let heldBass = null;

  for (const dstep of allSteps) {
    const interval = dstep - previous;
    const distance = Math.abs(interval);
    // The pitch this candidate will actually sound at — harmonic minor
    // raises the leading note unconditionally (see assignPitches), so a
    // degree-7 candidate has to be clash-checked at its raised pitch here,
    // not its natural one. Screening against the natural form let this
    // function happily pick a degree-7 dstep that clashed once raised,
    // leaving a later repair pass (resolveClashes) to quietly un-raise it
    // back to natural — which defeated the harmonic-minor policy far more
    // than the rare, deliberate exceptions (an unavoidable clash, or
    // avoiding an augmented 2nd) ever should.
    const midi = soundingMidi(dstep, key);
    const semitones = Math.abs(midi - previousMidi);
    if (semitones > maxLeapSemitones) continue;
    if (semitones > fastLeapLimit) continue;
    /*
     * A melodic tritone — an augmented 4th or diminished 5th leapt bare — is
     * as much a part-writing error in this idiom as the augmented 2nd already
     * guarded against, and nothing was stopping it.
     */
    if (semitones === 6) continue;
    // Nor any other augmented or diminished interval (C-G# in A minor).
    if (alteredInterval(previous, previousMidi, dstep, midi)) continue;

    const isChordTone = tones.includes(degreeOf(dstep, key));
    /*
     * The bass used to be restricted to chord tones outright, and that single
     * `continue` is what made its line read as arpeggio rubble rather than a
     * bass part. Within one triad the smallest available move is a third, so
     * stepwise motion was only ever reachable when the harmony changed and
     * the two roots happened to sit a second apart. Measured before this:
     * 100.0% of left-hand notes were chord tones at every grade from 2 up,
     * and only 8-14% of its moves were steps -- against 21-36% and 41-73% in
     * the melody, which has always been allowed to decorate. The two hands
     * were speaking different languages, and the audit could not see it
     * because it only ever asked what the bass did *at downbeats*.
     *
     * Real bass writing decorates exactly the way the melody already does,
     * only more sparingly: a passing or neighbour tone, off the beat, stepped
     * into and stepped out of. The conditions below are what hold it to that
     * and nothing looser -- never on a beat (so every harmony arrival,
     * including the second half of a split bar, is still a real chord tone),
     * never leapt into, and never two running, so the harmony the bass is
     * stating is never in doubt. `stackChordTones` already refuses to build a
     * chord on a non-chord tone, so a decorated bass note stays a single
     * note; `repairNonChordTones` already exempts a note that is both stepped
     * into and stepped out of, so a well-behaved one survives to the page.
     */
    if (chordToneOnly && !isChordTone) {
      if (onBeat || isDownbeat) continue;
      if (distance !== 1) continue;
      if (!previousWasChordTone) continue;
      if (!decorateBass) continue;
    }
    /*
     * In a minor key, stepping between the natural 6th and the raised 7th is
     * the melodic augmented 2nd this repertoire never writes. `fixAugmented-
     * Seconds` used to be the only thing standing against it, and it repairs
     * the interval by un-raising the 7th — which quietly leaves the piece
     * writing both C natural and C sharp in the same D minor test, a cross
     * relation that sounds worse than the interval being avoided. It was by
     * far the largest source of those: 2462 un-raisings across ~970 minor
     * tests, against ~180 from every other cause combined. Declining the step
     * here means the interval never has to be repaired, so the raised 7th
     * stays raised everywhere it occurs, as the harmonic-minor policy says.
     */
    if (key.isMinor && distance === 1) {
      const degree = degreeOf(dstep, key);
      const previousDegree = degreeOf(previous, key);
      if ((degree === 6 && previousDegree === 5) || (degree === 5 && previousDegree === 6)) continue;
    }
    // A non-chord note on a strong beat is only allowed as a passing step.
    if (onBeat && !isChordTone && distance !== 1) continue;
    if (isDownbeat && !isChordTone) continue;
    if (distance === 0 && repeatRun >= 1) {
      // A bass may still hold its note under a new chord (I to vi6) when the
      // only other way in is the fifth, a 6/4 — readmitted below if so.
      if (chordToneOnly && arrival && isChordTone) heldBass = { dstep, weight: 1, clash: false };
      continue;
    }

    /*
     * Consecutive fifths and octaves against the other hand. Two voices moving
     * the same way into the same perfect consonance is the first prohibition
     * of tonal part-writing: the voices stop sounding independent and briefly
     * collapse into one. Nothing here had any notion of what the two hands did
     * *between* one note and the next, only of what they sounded together at a
     * single instant, so the audit found them in 1.3-3.9% of moving pairs.
     */
    if (previousBass !== null && bass !== null) {
      const melodyDirection = Math.sign(midi - previousMidi);
      const bassDirection = Math.sign(bass - previousBass);
      if (melodyDirection !== 0 && melodyDirection === bassDirection) {
        const beforeInterval = (((previousMidi - previousBass) % 12) + 12) % 12;
        const afterInterval = (((midi - bass) % 12) + 12) % 12;
        if (beforeInterval === afterInterval && (afterInterval === 0 || afterInterval === 7)) continue;
      }
    }

    /*
     * Never double the leading note against the other hand. An octave is not a
     * dissonance, so the vertical check below waves it through — but two voices
     * on the leading note both owe the tonic a resolution, and discharging that
     * in the same direction writes a parallel octave. This is where most of the
     * doubling came from: Grade 2 carries no chords at all and still doubled it
     * in 4% of the chords containing one, purely melody against bass.
     */
    if (degreeOf(dstep, key) === 6 && sounding.some((other) => (other % 12) === (midi % 12))) continue;

    // Vertical check against whatever the other hand is holding.
    let clash = false;
    let forbidden = false;
    for (const other of sounding) {
      const vertical = Math.abs(midi - other) % 12;
      if (NEVER_INTERVALS.has(vertical)) { forbidden = true; break; }
      if (HARSH_INTERVALS.has(vertical)) clash = true;
    }
    if (forbidden) continue;
    // A milder dissonance is only tolerable off the beat, as a step.
    if (clash && (onBeat || distance !== 1)) continue;
    // Keep the hands out of each other's way: the melody stays above
    // everything the left hand is holding, not just its lowest note.
    // Keep the hands out of each other's way: the tune sits a third clear of the
    // accompaniment's top note when it can (unisons and seconds between the
    // hands at 8-11% of Grade 5-8 tests); the bare minimum is not crossing.
    if (ceiling !== null && midi < ceiling) continue;
    if (ceiling !== null && !chordToneOnly && midi < ceiling + 3) tight.push(dstep);

    /*
     * On the beat, prefer a chord tone — that's correct harmony. Off the
     * beat is where real melodic writing puts its passing and neighbour
     * tones, so give those a slight edge there instead.
     */
    let weight = isChordTone ? (onBeat ? 1.6 : 0.85) : 1;
    /*
     * A passing/neighbour tone has to actually resolve, or the later repair
     * pass (repairNonChordTones) discards it and replaces it with the
     * nearest chord tone — measured at 23-44% of all off-beat passing tones
     * getting thrown away this way, because the note after one was picked
     * with no memory of it needing to step onward. Continuing the same
     * direction by another step is exactly how a passing tone resolves (it
     * lands on the chord tone the passing tone was heading toward), so give
     * that specific continuation a strong boost rather than leaving it to
     * ordinary stepwise-motion weighting to stumble onto by chance.
     */
    if (!previousWasChordTone && distance === 1 && Math.sign(interval) === Math.sign(previousLeap)) {
      weight *= 3;
    }
    /*
     * A real scale passage keeps going in the same direction for several
     * notes, not just one — measured at only 4-6% of stepwise motion
     * forming a run of 4+ consecutive same-direction steps, against
     * real specimens where a scale run spanning most of a beat or bar is a
     * routine figure. Scoring every step independently on a roughly 50/50
     * up-or-down basis (once a direction isn't forced) is why: nothing
     * carried a run's momentum forward from one note to the next. This
     * boosts continuing the run, growing with how long it has already run
     * and capped so it tapers off rather than producing an unbroken
     * octave-plus scale every time.
     */
    if (distance === 1 && runDirection !== 0 && Math.sign(interval) === runDirection && runCounts) {
      weight *= 1 + Math.min(runLength, 4) * 0.6;
    }
    // A passing note heading away from the goal starts a run the wrong way.
    if (planned && !isChordTone && toward !== 0 && Math.sign(interval) === -toward) weight *= 0.4;
    /*
     * Having sounded the leading note, go to the tonic. It is the strongest
     * tendency in the idiom — and in a minor key the raised 7th exists for no
     * other reason — but it was weighted no differently from any other step,
     * so it resolved in as little as a fifth of cases at the upper grades.
     * A preference rather than a rule: a leading note in an inner part, or one
     * turned back down mid-phrase, is ordinary enough to leave available.
     */
    if (previousWasLeadingNote) {
      if (dstep === previous + 1) weight *= 8;
      else if (dstep < previous) weight *= 0.35;
    }
    if (clash) weight *= 0.3;
    /*
     * An isolated big leap wants compensating by stepping back — ordinary
     * vocal-style part-writing practice. But a leap that *continues* an
     * arpeggio already in progress (same direction, both ends chord tones)
     * is a different thing entirely: broken-chord figures (Alberti bass,
     * arpeggiated melody) are keyboard-idiomatic writing that keeps going
     * the same direction for several notes, and applying the reversal rule
     * to it as well was quietly forbidding exactly that figure — after one
     * leap outlining a chord, the very next note was 6x more likely to turn
     * back than to complete the triad. Boost continuation instead, capped
     * like the step-run bonus so it tapers off rather than running forever.
     */
    const continuesArpeggio = arpeggioDirection !== 0 && distance >= 2
      && Math.sign(interval) === arpeggioDirection && isChordTone;
    if (continuesArpeggio) {
      weight *= 1 + Math.min(arpeggioLength, 3) * 0.8;
    } else if (Math.abs(previousLeap) >= 3) {
      // After a leap of a fourth or more the line turns back by step: the
      // reversal is strongly preferred, a second leap or a continued run in
      // the same direction is rare (it was 22% of leap pairs).
      const reverses = Math.sign(interval) === -Math.sign(previousLeap);
      weight *= reverses ? (distance === 1 ? 6 : 1.2) : (distance === 1 ? 0.5 : 0.08);
    }
    // A planned line (pull above the default) is held to its course more
    // firmly: the pull grows with the square of the distance, so a run can
    // carry on a little past the target but not wander off it.
    weight *= pull > 0.12 ? 1 / (1 + (Math.abs(dstep - centre) * pull) ** 2) : 1 / (1 + Math.abs(dstep - centre) * pull);
    // Within the leap category, a smaller leap still outweighs a bigger one.
    if (distance > 1) weight /= distance - 1;
    /*
     * A bass hopping between the same two chord tones (D-G-D-G, E-B-E-B) is
     * the most mechanical thing in the texture — 55-65% of bass moves were
     * leaps and direction reversed half the time, a random walk. Going back to
     * the note two before is strongly discouraged in the bass.
     */
    if (chordToneOnly && beforePrevious !== null && distance > 0 && dstep === beforePrevious && previous !== beforePrevious) weight *= 0.2;
    /*
     * Outer voices: when the bass has just moved, the melody going the other
     * way is the classic two-part texture; going the same way (similar motion)
     * is fine but less valued. Measured before: contrary 17%, similar 14-15% —
     * nothing favoured contrary motion at all.
     */
    if (!chordToneOnly && previousBass !== null && bass !== null && bass !== previousBass && distance > 0) {
      weight *= Math.sign(midi - previousMidi) === -Math.sign(bass - previousBass) ? 2 : 0.6;
    }

    // Where the harmony arrives the bass is the root or the third, almost never
    // the fifth: a 6/4 outside the cadential formula is a fault on the page.
    if (arrival && degreeOf(dstep, key) === tones[2]) weight *= 0.03;
    const candidate = { dstep, weight, clash };
    if (dstep === preferred && !clash) preferredCandidate = candidate;
    if (distance === 0) repeats.push(candidate);
    else if (distance === 1) steps.push(candidate);
    else leaps.push(candidate);
  }

  if (tight.length) {
    const clear = (c) => !tight.includes(c.dstep);
    if ([...steps, ...leaps, ...repeats].some(clear)) {
      for (const list of [steps, leaps, repeats]) {
        const keep = list.filter(clear); list.length = 0; list.push(...keep);
      }
      if (preferredCandidate && tight.includes(preferredCandidate.dstep)) preferredCandidate = null;
    }
  }
  // The weight above only matters inside a category, and the category is drawn
  // first: take the fifth out entirely wherever anything else is playable.
  if (rootOnly) {
    // Every bass note of a cadential dominant bar is its root or fifth, never the leading note.
    const isRoot = (c) => degreeOf(c.dstep, key) !== tones[1] && (!arrival || degreeOf(c.dstep, key) === tones[0]);
    if ([...steps, ...leaps, ...repeats].some(isRoot)) {
      for (const list of [steps, leaps, repeats]) {
        const keep = list.filter(isRoot); list.length = 0; list.push(...keep);
      }
    }
  }
  if (arrival) {
    const notFifth = (c) => degreeOf(c.dstep, key) !== tones[2];
    if (heldBass && notFifth(heldBass) && ![...steps, ...leaps, ...repeats].some(notFifth)) {
      repeats.push(heldBass);
      if (heldBass.dstep === preferred) preferredCandidate = heldBass;
    }
    if ([...steps, ...leaps, ...repeats].some(notFifth)) {
      for (const list of [steps, leaps, repeats]) {
        const keep = list.filter(notFifth); list.length = 0; list.push(...keep);
      }
    }
  }
  if (!steps.length && !leaps.length && !repeats.length) {
    /*
     * Nothing survived the filters. This last resort used to reach for the
     * nearest chord tone with no regard for the other hand at all, which is
     * how the melody could end up underneath the accompaniment — rare while
     * few candidates were ever fully eliminated, but the augmented-2nd rule
     * above empties the set often enough in minor keys to make it matter.
     * Keep the vertical constraints even here; only the melodic preferences
     * are worth abandoning.
     */
    const safe = allSteps.filter((dstep) => {
      const midi = soundingMidi(dstep, key);
      if (ceiling !== null && midi < ceiling) return false;
      return !sounding.some((other) => NEVER_INTERVALS.has(Math.abs(midi - other) % 12));
    });
    return nearestWithDegreeSet(safe.length ? safe : allSteps, key, tones, previous);
  }

  /*
   * A passing/neighbour tone must resolve by step in the direction it was
   * approached from — that is what makes it a passing tone rather than a
   * wrong note. Leaving that to the category lottery below meant the
   * (1 - stepwiseBias) chance of a leap could fire right when the previous
   * note needed resolving, and repairNonChordTones then discards that
   * previous note and relocates it to the nearest chord tone anyway,
   * quietly turning an intended stepwise pair into two leaps. Forcing the
   * resolution here, before the lottery, is what actually stops that.
   *
   * There is exactly one step candidate in the resolving direction (never
   * two), so if it happens to clash with the other hand there is no
   * alternative resolution to fall back on — better to let the ordinary
   * (clash-weighted) lottery below have this one note than to force a
   * clash unconditionally every time.
   */
  if (!previousWasChordTone && previousLeap !== 0) {
    const resolving = steps.filter((s) => Math.sign(s.dstep - previous) === Math.sign(previousLeap) && !s.clash);
    if (resolving.length) {
      /*
       * A motif restatement usually *is* the resolution: the source bar
       * resolved its own passing tones, and a diatonic transposition of that
       * bar resolves them the same way. When the two agree, following the
       * motif and resolving the dissonance are the same act — so check that
       * before overriding the motif with an arbitrary weighted resolution.
       * This was the single largest cause of restatements breaking up.
       */
      const preferredResolves = resolving.find((s) => s.dstep === preferred);
      if (preferredResolves) return preferredResolves.dstep;
      return rng.weighted(resolving).dstep;
    }
  }

  /*
   * A leading note on dominant harmony resolves up to the tonic. Weighting it
   * inside the step category was not enough: the category lottery below picks
   * step-versus-leap *first*, so by Grade 8 it discarded the whole step
   * category — resolution included — nearly half the time, and the melody
   * resolved its leading note at the V-I arrival only 41% of the time. Forcing
   * it here, ahead of the lottery, is the same treatment the passing-tone
   * resolution already gets and for the same reason. Not absolute: an inner
   * voice or a phrase that turns the note back down is ordinary enough to
   * leave a share of.
   */
  if (previousWasLeadingNote) {
    const resolution = steps.find((step) => step.dstep === previous + 1 && !step.clash);
    if (resolution && rng.chance(0.85)) return resolution.dstep;
  }

  /*
   * A motif restatement or a cadential approach asked for this exact pitch,
   * and it came through every filter above — range, leap limit, chord tone
   * on the beat, and the vertical check against the other hand — so it is as
   * legal as anything the lottery below could return. Take it. Leaving it to
   * the lottery with a mere weight boost is not enough: a motif is only
   * audible as a restatement if it is heard more or less intact, and a shape
   * that survives in three notes out of five is not a restatement of
   * anything. This is checked *after* the passing-tone resolution above, so
   * motif-following never breaks the dissonance treatment that
   * `repairNonChordTones` would otherwise undo anyway.
   */
  if (preferredCandidate) return preferredCandidate.dstep;

  /*
   * Decide step vs. leap vs. repeat as a category first, weighted by
   * stepwiseBias, and only then pick a candidate within it. There are
   * always exactly two possible step candidates (previous ± 1) but often
   * a dozen+ legal leap candidates — weighing every candidate individually
   * on the same scale let the leap candidates' combined weight dwarf the
   * steps' even at a high stepwiseBias, since summing a dozen modest
   * weights beats two: measured at 70-80% leaps by Grade 5+ versus a
   * configured stepwiseBias of 62-65%. Deciding the category first is what
   * actually makes stepwiseBias mean "this fraction of moves are steps."
   */
  // A run in progress should also make "keep stepping" itself more likely,
  // not just which direction to step in once that category is chosen —
  // otherwise a run this same weighting just made attractive within the
  // step category could still get cut short by an unrelated leap roll.
  const runBoost = runDirection !== 0 && runCounts ? 1 + Math.min(runLength, 4) * 0.5 : 1;
  // Same reasoning for an arpeggio in progress: the within-category boost
  // above only matters if the leap category is even rolled in the first
  // place.
  const leapBoost = arpeggioDirection !== 0
    ? 1 + Math.min(arpeggioLength, 3) * 0.5
    : (Math.abs(previousLeap) >= 3 ? 0.25 : 1);
  const categories = [];
  if (steps.length) categories.push({ items: steps, weight: 10 * stepwiseBias * runBoost });
  if (leaps.length) categories.push({ items: leaps, weight: 10 * (1 - stepwiseBias) * leapBoost });
  // A repeated note on a semiquaver (either hand) or a bass quaver is a stutter
  // (C#6-C#6-C#6, A3-A3-A3), not a figure: offer it only as a last resort.
  const repeatWeight = shortNote === 'sixteenth' || (chordToneOnly && shortNote === 'eighth') ? 0.1 : 1;
  if (repeats.length) categories.push({ items: repeats, weight: (steps.length || leaps.length) ? repeatWeight : 1 });
  return rng.weighted(rng.weighted(categories).items).dstep;
}

/**
 * Final vertical sweep. The non-chord-tone and augmented-second repairs both
 * move notes after candidates were scored, so a semitone against the other
 * hand can reappear. Anything still clashing is moved to the nearest pitch
 * that does not.
 */
function resolveClashes({ bars, key, window, against, barDuration, finalEvent }) {
  if (!against?.length) return;

  bars.forEach((bar, barIndex) => {
    let offset = 0;
    for (const event of bar.events) {
      if (event.rest) { offset += event.dur; continue; }

      const absolute = barIndex * barDuration + offset;
      const sounding = soundingAt(against, absolute, event.dur);
      offset += event.dur;
      // The melody must clear the other hand's top note as well as avoid
      // semitone clashes; both repairs above can undo either.
      const ceiling = sounding.length ? Math.max(...sounding) : null;
      const wrong = (midi) => clashesWith(midi, sounding)
        || (ceiling !== null && midi < ceiling);
      if (!wrong(event.pitch.midi)) continue;

      // The cadence note stays on the tonic whatever else has to move.
      const tones = event === finalEvent ? [0] : (event.chordDegrees ?? []);
      const findReplacement = (requireTone) => {
        let replacement = null;
        let bestDistance = Infinity;
        for (let dstep = window.low; dstep <= window.high; dstep++) {
          if (requireTone && tones.length && !tones.includes(degreeOf(dstep, key))) continue;
          /*
           * Judge — and later write — a degree-7 replacement at the pitch it
           * will actually sound, which under the harmonic-minor policy is the
           * raised one. Screening candidates at their natural form let this pass
           * relocate a note onto the 7th precisely *because* the natural form
           * did not clash, and then write it natural: the same trap `pickWeighted`
           * documents, silently undoing the policy from the other end.
           */
          const raiseSeventh = degreeOf(dstep, key) === 6;
          const candidate = pitchAt(dstep, key, { raiseSeventh });
          if (wrong(candidate.midi)) continue;
          // Relocating a note must not double the other hand's leading note —
          // this pass runs after selection, where that rule is enforced, and
          // was quietly reintroducing what selection had avoided.
          if (raiseSeventh && sounding.some((other) => (other % 12) === (candidate.midi % 12))) continue;
          const distance = Math.abs(dstep - event.dstep);
          if (distance < bestDistance) {
            bestDistance = distance;
            replacement = { dstep, pitch: candidate, raiseSeventh };
          }
        }
        return replacement;
      };
      /*
       * A held note in the other hand can outlast the harmony it belonged to
       * (a bass note sustained across a mid-bar chord change, e.g.) and land
       * a semitone from *every* tone of the new chord at once — vi against a
       * still-ringing raised-7th V is a real case, not a hypothetical one.
       * Restricting the search to chord tones then finds nothing and used to
       * leave the clash written, the one place in this pass a `wrong` note
       * could survive. Widen to the whole window, same as `pickWeighted`'s
       * own last-resort fallback, rather than accept a note that clashes.
       * The final tonic keeps its strict search — better a clash there than
       * a cadence that doesn't land on the tonic.
       */
      const replacement = findReplacement(true) ?? (event === finalEvent ? null : findReplacement(false));
      if (replacement) {
        event.dstep = replacement.dstep;
        event.raiseSeventh = replacement.raiseSeventh;
        event.pitch = replacement.pitch;
      }
    }
  });
}

function clashesWith(midi, sounding) {
  return sounding.some((other) => NEVER_INTERVALS.has(Math.abs(midi - other) % 12));
}

/**
 * Take back a bass decoration that the right hand turned out to clash with.
 *
 * The bass is written *first*, against nothing, so unlike every other pitch
 * in the texture its notes are chosen with no vertical information at all.
 * That was harmless while the bass could only take chord tones — a chord tone
 * is consonant with the harmony by definition, and the right hand is then
 * checked against it. An off-beat passing tone is not, and the right hand
 * cannot always dodge it: its own final tonic is deliberately exempt from
 * `resolveClashes` (better a clash than a cadence that misses the tonic), and
 * `shapeCadence` pins the approach to it. A real case, caught by the false-
 * relation test rather than reasoned about: grade 4 seed 245502 put a bass
 * G#3 passing tone under the held A5 the melody ends on, a semitone apart
 * with nothing downstream positioned to repair either note.
 *
 * A decoration is by nature the optional note in the texture, so it is the
 * one that gives way: revert it to the nearest chord tone that clears the
 * right hand, which is the note the bass would have taken before decoration
 * existed. Runs once both hands are final, since that is the first moment the
 * question can be asked at all.
 */
export function revertClashingBassDecorations(bars, key, barDuration, against) {
  if (!against?.length) return;

  bars.forEach((bar, barIndex) => {
    let offset = 0;
    for (const event of bar.events) {
      const start = barIndex * barDuration + offset;
      offset += event.dur;
      if (event.rest || event.dstep === undefined) continue;
      const tones = event.chordDegrees;
      // Only a decoration is up for reverting: a chord tone that clashes is a
      // harmony problem, not an ornament, and is not this pass's to solve.
      if (!tones?.length || tones.includes(degreeOf(event.dstep, key))) continue;

      const sounding = soundingAt(against, start, event.dur);
      if (!clashesWith(event.pitch.midi, sounding)) continue;

      let replacement = null;
      let bestDistance = Infinity;
      for (const tone of tones) {
        for (let dstep = event.dstep - 3; dstep <= event.dstep + 3; dstep++) {
          if (degreeOf(dstep, key) !== tone) continue;
          const raiseSeventh = degreeOf(dstep, key) === 6;
          const candidate = pitchAt(dstep, key, { raiseSeventh });
          if (clashesWith(candidate.midi, sounding)) continue;
          // Never double the other hand's leading note (see resolveClashes).
          if (raiseSeventh && sounding.some((other) => (other % 12) === (candidate.midi % 12))) continue;
          const distance = Math.abs(dstep - event.dstep);
          if (distance < bestDistance) {
            bestDistance = distance;
            replacement = { dstep, pitch: candidate, raiseSeventh };
          }
        }
      }
      if (replacement) {
        event.dstep = replacement.dstep;
        event.raiseSeventh = replacement.raiseSeventh;
        event.pitch = replacement.pitch;
      }
    }
  });
}

/**
 * A repeated note — the melody landing on the same scale degree twice in a
 * row — has to agree with itself on whether the 7th is raised. Both
 * `resolveClashes` (dodging a clash against the other hand) and
 * `harmoniseLeadingNotes` (reconciling a clash between the hands) can flip
 * just one occurrence to its natural form, leaving the immediately
 * adjacent repeat still raised: an F# followed immediately by F-natural
 * (or the reverse), which no real melody writes. The natural form is
 * always safe — the same rule `harmoniseLeadingNotes` uses between the
 * hands — so force both occurrences to it rather than leaving one raised.
 * Called once per hand inside `assignPitches` (catching what
 * `resolveClashes` does) and once more after the cross-hand
 * `harmoniseLeadingNotes` pass (catching what that introduces).
 */
export function harmoniseRepeatedLeadingNotes(bars, key) {
  if (!key.isMinor) return;
  const notes = bars.flatMap((bar) => bar.events.filter((event) => !event.rest));
  for (let i = 1; i < notes.length; i++) {
    const previous = notes[i - 1];
    const current = notes[i];
    if (current.dstep !== previous.dstep) continue;
    if (current.raiseSeventh === previous.raiseSeventh) continue;
    for (const note of [previous, current]) {
      note.raiseSeventh = false;
      note.pitch = pitchAt(note.dstep, key, { raiseSeventh: false });
    }
  }
}

/**
 * A passing note that leaps in or out is not a passing note, it is a wrong
 * note. Replace those with the nearest chord tone.
 */
function repairNonChordTones(bars, key, window, { against = null, barDuration = 0, finalEvent = null } = {}) {
  const notes = bars.flatMap((bar) => bar.events.filter((event) => !event.rest));
  // Where each note sits in absolute time, so a replacement can be checked
  // against the other hand. This pass is otherwise vertically blind, which is
  // usually safe because `resolveClashes` follows it — but that pass only
  // repairs semitone clashes, and an octave doubling of the leading note is
  // perfectly consonant, so nothing downstream was catching it.
  const times = new Map();
  bars.forEach((bar, barIndex) => {
    let offset = 0;
    for (const event of bar.events) {
      if (!event.rest) times.set(event, { start: barIndex * barDuration + offset, dur: event.dur });
      offset += event.dur;
    }
  });

  notes.forEach((note, index) => {
    if (!note.chordDegrees) return;
    if (note.chordDegrees.includes(degreeOf(note.dstep, key))) return;
    /*
     * The deliberately-forced final tonic is exempt, the same way
     * `resolveClashes` already treats it specially. A hand whose own part
     * ends before the piece's actual cadence (Grade 1's alternating hands,
     * whichever hand finishes first) still gets `endOnTonic` applied to its
     * own last note — landing on tonic is right even though the *local*
     * harmony there hasn't reached the true final I yet, so tonic genuinely
     * isn't one of that harmony's chord tones. Treating that mismatch as a
     * fault to correct relocated the note off tonic entirely — silently
     * undoing the forced ending — and `shapeCadence` (which runs later,
     * trusting this note's dstep to still be the tonic it approaches) then
     * built its leading-tone approach around the wrong anchor, writing a
     * fresh augmented 2nd that nothing downstream was positioned to catch.
     */
    if (note === finalEvent) return;

    const previous = notes[index - 1];
    const next = notes[index + 1];
    const steppedInto = !previous || Math.abs(note.dstep - previous.dstep) === 1;
    const steppedOut = !next || Math.abs(next.dstep - note.dstep) === 1;
    if (steppedInto && steppedOut) return;

    const at = times.get(note);
    const sounding = at && against ? soundingAt(against, at.start, at.dur) : [];
    const options = [];
    for (let dstep = window.low; dstep <= window.high; dstep++) {
      if (!note.chordDegrees.includes(degreeOf(dstep, key))) continue;
      const raiseSeventh = degreeOf(dstep, key) === 6;
      if (raiseSeventh && sounding.length) {
        const midi = pitchAt(dstep, key, { raiseSeventh: true }).midi;
        if (sounding.some((other) => (other % 12) === (midi % 12))) continue;
      }
      // Relocating this note must not write an augmented 2nd against its own
      // neighbours — a real case, not a hypothetical one: a note forced onto
      // an harmonically foreign degree (a hand's own part ending on tonic
      // under harmony that has moved past I, at Grade 1's alternating hands)
      // gets flagged as a non-chord tone here, and the nearest actual chord
      // tone to relocate it to can easily be the raised 7th sitting a step
      // from the note's own natural-6th neighbour. `moveOffParallel` already
      // guards its relocations this way; this pass moves notes too and had
      // no such guard at all.
      if (writesAugmentedSecond(notes, index, dstep, raiseSeventh, key)) continue;
      options.push(dstep);
    }
    if (!options.length) return;

    const replacement = leastDistant(options, note.dstep);
    note.dstep = replacement;
    // Harmonic minor throughout — the leading note is raised by degree
    // alone, not carried over from whatever the note being replaced had.
    note.raiseSeventh = degreeOf(replacement, key) === 6;
    note.pitch = pitchAt(replacement, key, { raiseSeventh: note.raiseSeventh });
  });
}

function leastDistant(steps, target) {
  return steps.reduce((best, dstep) =>
    Math.abs(dstep - target) < Math.abs(best - target) ? dstep : best,
  );
}

function nearestWithDegree(steps, key, degree, target) {
  const matches = steps.filter((dstep) => degreeOf(dstep, key) === degree);
  return matches.length ? leastDistant(matches, target) : leastDistant(steps, target);
}

/**
 * The chord's third — or, only when `allowFifth` says so, its fifth — if it
 * sits exactly a step from where the bass already is, which is the reason a
 * real bass line takes an inversion at all. First inversion is ordinary;
 * second inversion is a rule-bound special case (cadential, passing or pedal
 * 6/4), so the caller gates it behind its own low roll rather than letting it
 * stand in whenever the third does not give the step.
 */
function smoothInversion(steps, key, tones, previous, allowFifth = false) {
  for (const degree of allowFifth ? [tones[1], tones[2]] : [tones[1]]) {
    for (const dstep of [previous - 1, previous + 1]) {
      if (!steps.includes(dstep)) continue;
      if (degreeOf(dstep, key) === degree) return dstep;
    }
  }
  return null;
}

function nearestWithDegreeSet(steps, key, degrees, target) {
  const matches = steps.filter((dstep) => degrees.includes(degreeOf(dstep, key)));
  return matches.length ? leastDistant(matches, target) : leastDistant(steps, target);
}

/**
 * In minor keys a raised 7th next to a natural 6th makes an augmented 2nd,
 * which ABRSM tests do not write. Drop the raise unless it resolves upward
 * to the tonic.
 */
function fixAugmentedSeconds(bars, key) {
  if (!key.isMinor) return;
  const notes = bars.flatMap((bar) => bar.events.filter((event) => !event.rest));
  for (let i = 0; i < notes.length; i++) {
    const current = notes[i];
    if (!current.raiseSeventh) continue;
    const next = notes[i + 1];
    const previous = notes[i - 1];
    const resolvesUp = next && next.dstep === current.dstep + 1;
    const approachedFromSixth = previous && degreeOf(previous.dstep, key) === 5
      && Math.abs(current.dstep - previous.dstep) === 1;
    const leavesToSixth = next && degreeOf(next.dstep, key) === 5
      && Math.abs(next.dstep - current.dstep) === 1;
    // Stepping to or from the natural 6th makes the augmented 2nd either way;
    // resolving upward afterwards does not undo the approach.
    if (approachedFromSixth || (leavesToSixth && !resolvesUp)) {
      current.raiseSeventh = false;
      current.pitch = pitchAt(current.dstep, key, { raiseSeventh: false });
    }
  }
}

/**
 * Turn single notes into chords by stacking chord tones underneath.
 *
 * This used to consider exactly one candidate — the diatonic third below —
 * which quietly capped every chord at two notes no matter what the grade
 * allowed, so Grade 6-8's declared three- and four-note chords never appeared
 * and Grade 8's texture came out identical to Grade 3's. It now walks down a
 * full octave and takes the nearest chord tones it finds, which is also what
 * produces a real close voicing: from the root, the nearest members below are
 * the fifth and the third, not another third.
 *
 * `maxTotal` caps how many notes sound across *both* hands at once, and
 * `against` is what the other hand is already holding — the melody may not be
 * voiced down through the accompaniment, so a stack stops at the other hand's
 * top note rather than crossing it.
 */
export function stackChordTones({
  bars, key, progression, maxNotes, rng, window, density = 0.4, barDuration = 0,
  against = null, maxTotal = Infinity, bassVoicing = false,
}) {
  bars.forEach((bar, barIndex) => {
    const entry = progression[barIndex] ?? 'I';
    let offset = 0;
    bar.events.forEach((event) => {
      const tones = chordDegrees(chordAt(entry, offset, barDuration, bar.beatDuration));
      const sounding = against ? soundingAt(against, barIndex * barDuration + offset, event.dur) : [];
      offset += event.dur;
      if (event.rest || event.dstep === undefined) return;
      if (maxNotes < 2 || !rng.chance(density)) return;
      if (!tones.includes(degreeOf(event.dstep, key))) return;

      // Room left under the grade's limit on simultaneous notes.
      const room = Math.min(maxNotes, maxTotal - sounding.length);
      if (room < 2) return;
      const ceiling = sounding.length ? Math.max(...sounding) : null;
      /*
       * How thick *this* chord is. Taking the grade's maximum every time made
       * the upper grades read as a chorale rather than a sight-reading test —
       * six three-note chords in a seven-note bar — because the maximum is a
       * ceiling the syllabus permits occasionally, not a target. Most chords
       * are the thinnest the texture allows and the full stack stays an event.
       */
      // A chord on a 16th is not playable at sight; a three-note chord wants
      // at least a crotchet (both appeared in the left hand from Grade 5 up).
      if (event.type === '16th' || event.type === '32nd') return;
      const roomHere = event.type === 'eighth' ? Math.min(room, 2) : room;
      let want = 2;
      while (want < roomHere && rng.chance(0.35)) want += 1;

      /*
       * In the bass, a stacked note becomes the *lowest* sounding note and so
       * decides the chord's inversion. Adding the third below a root-position
       * chord silently turns it into first inversion — which is how a
       * cadential V that had correctly taken its root in the bass still ended
       * up sounding inverted a third of the time. Under the bass, only the
       * chord root may go below; everything else would rewrite the harmony
       * the bass line was just at pains to state.
       */
      const rootDegree = tones[0];
      const mainIsRoot = degreeOf(event.dstep, key) === rootDegree;

      const extras = [];
      for (let below = event.dstep - 1; below >= event.dstep - 7; below--) {
        if (extras.length >= want - 1) break;
        if (below < window.low) break;
        if (!tones.includes(degreeOf(below, key))) continue;
        if (bassVoicing && mainIsRoot && degreeOf(below, key) !== rootDegree) continue;
        // An inversion the bass line chose on purpose (planBassLine) must stay
        // the lowest note: stacking the root under it silently undid it.
        if (bassVoicing && !mainIsRoot) break;
        // A stacked note can itself land on the leading note (a V or vii°
        // chord contains it) — harmonic minor raises it there same as anywhere.
        const pitch = pitchAt(below, key, { raiseSeventh: degreeOf(below, key) === 6 });
        /*
         * Never double the leading note. Both copies are tendency tones owing
         * the tonic a resolution, and two voices discharging that debt in the
         * same direction is a parallel octave by construction — which is part
         * of how the octaves the audit also reports came about. This only
         * became reachable once both hands could carry chords, and by Grade 8
         * it was in 17% of the chords containing a leading note.
         */
        if (degreeOf(below, key) === 6
          && (degreeOf(event.dstep, key) === 6
            || sounding.some((midi) => midi % 12 === pitch.midi % 12))) continue;
        const interval = event.pitch.midi - pitch.midi;
        if (interval <= 0 || interval > 12) continue;
        if (HARSH_INTERVALS.has(interval % 12)) continue;
        if (ceiling !== null && pitch.midi < ceiling) break;
        /*
         * Consonant with its own chord is not the same as consonant with what
         * the other hand is holding. In a bar whose harmony turns over halfway
         * (`twoChordBarChance`) the other hand may still be sounding the
         * previous chord, and in a minor key it may be sounding the leading
         * note raised where this chord wants it natural — either way a stacked
         * note can land a semitone from it.
         */
        if (clashesWith(pitch.midi, sounding)) continue;
        // A note stacked under the tune stays a third clear of the accompaniment
        // (most remaining hand collisions were the melody's own chord notes).
        if (!bassVoicing && ceiling !== null && pitch.midi < ceiling + 3) continue;
        /*
         * Low thirds are mud. Below C3 the two lowest notes of a chord must be
         * at least a fifth apart (fifth, sixth, octave) — close position only
         * from C3 up. 21-32% of stacked LH intervals broke this before.
         */
        const lowestSoFar = extras.length ? extras[extras.length - 1].midi : event.pitch.midi;
        if (pitch.midi < 48 && lowestSoFar - pitch.midi < 7) continue;
        extras.push(pitch);
      }
      if (extras.length) event.chord = extras;
    });
  });
  return bars;
}

/**
 * Remove consecutive fifths and octaves left behind by the repair passes.
 *
 * `pickWeighted` already refuses to *choose* one, but `repairNonChordTones`,
 * `resolveClashes` and `shapeCadence` all move notes afterwards with no view
 * of what the other hand is doing between one attack and the next, and they
 * put them back: measured at 27-45% of tests containing at least one, even
 * though only about half a percent of moving pairs were affected. That gap
 * between the per-pair rate and the per-test rate is the whole point — a
 * reader meets one test, not an average.
 *
 * Only the upper voice is moved, only to a neighbouring chord tone, and never
 * the notes that close the piece: the cadence has already been settled by
 * `shapeCadence` and is not worth trading for this. Where nothing legal
 * removes the parallel the note is left alone.
 */
export function relaxParallels(upper, lower, key, barDuration, window) {
  const timeline = outerVoiceTimeline(upper, lower, barDuration);
  /*
   * The closing gesture is off limits. `shapeCadence` has already settled the
   * final tonic and its stepwise approach, and an entry in this timeline marks
   * a *moment* rather than a note — the last moment can belong to a bass
   * attack under a melody note that sounded earlier — so the two notes are
   * held out by identity rather than by position.
   */
  const melody = upper.flatMap((bar) => bar.events.filter((e) => !e.rest && e.pitch));
  const protectedNotes = new Set(melody.slice(-2));

  for (let i = 1; i < timeline.length; i++) {
    const before = timeline[i - 1];
    const now = timeline[i];
    if (!before.event || !now.event || before.bass === null || now.bass === null) continue;
    if (!parallelPerfect(before, now)) continue;

    const neighbours = upper.flatMap((bar) => bar.events.filter((e) => !e.rest && e.pitch));
    /*
     * Try the second note of the pair first — moving it disturbs only what
     * follows — and fall back to the first. Either one breaks the parallel,
     * and having both to try roughly doubles the chance that some legal note
     * exists: on the later note alone, the chord-tone and no-clash conditions
     * frequently leave nothing available.
     */
    if (!protectedNotes.has(now.event)
      && moveOffParallel(now, before, now, neighbours, key, window)) continue;
    if (!before.isFirst && !protectedNotes.has(before.event)) {
      moveOffParallel(before, timeline[i - 2] ?? null, now, neighbours, key, window, true);
    }
  }
}

/**
 * Shift one of the two notes making a parallel onto a neighbouring chord
 * tone. `guardAgainst` is the moment on the *other* side of the moved note,
 * so relieving this parallel does not write another one there instead.
 */
function moveOffParallel(target, guardAgainst, pair, neighbours, key, window, movingEarlier = false) {
  const event = target.event;
  const tones = event.chordDegrees ?? [];
  const index = neighbours.indexOf(event);

  for (const delta of [1, -1, 2, -2, 3, -3]) {
    const dstep = event.dstep + delta;
    if (dstep < window.low || dstep > window.high) continue;
    if (tones.length && !tones.includes(degreeOf(dstep, key))) continue;
    const raiseSeventh = degreeOf(dstep, key) === 6;
    const pitch = pitchAt(dstep, key, { raiseSeventh });
    if (target.bass !== null && pitch.midi < target.bass) continue;
    if (clashesWith(pitch.midi, target.sounding)) continue;
    // This pass must honour the no-doubled-leading-note rule too, or it
    // relieves a parallel by writing the cause of another one.
    if (degreeOf(dstep, key) === 6
      && target.sounding.some((midi) => (midi % 12) === (pitch.midi % 12))) continue;

    const moved = { ...target, top: pitch.midi };
    if (movingEarlier ? parallelPerfect(moved, pair) : parallelPerfect(pair, moved)) continue;
    if (guardAgainst && guardAgainst.event
      && (movingEarlier ? parallelPerfect(guardAgainst, moved) : parallelPerfect(moved, guardAgainst))) continue;
    // Moving a note can write an augmented 2nd against its own neighbours.
    if (writesAugmentedSecond(neighbours, index, dstep, raiseSeventh, key)) continue;

    event.dstep = dstep;
    event.raiseSeventh = raiseSeventh;
    event.pitch = pitch;
    /*
     * The notes stacked under this one were spelled against where it used to
     * be — an interval and a chord membership that no longer hold. They are
     * decoration and the parallel is a fault, so drop them rather than try to
     * re-voice a chord around a note that has just moved.
     */
    delete event.chord;
    return true;
  }
  return false;
}

function parallelPerfect(before, now) {
  const upperDirection = Math.sign(now.top - before.top);
  const lowerDirection = Math.sign(now.bass - before.bass);
  if (upperDirection === 0 || upperDirection !== lowerDirection) return false;
  const beforeInterval = (((before.top - before.bass) % 12) + 12) % 12;
  const afterInterval = (((now.top - now.bass) % 12) + 12) % 12;
  return beforeInterval === afterInterval && (afterInterval === 0 || afterInterval === 7);
}

/**
 * An augmented or diminished melodic interval (judged by letter distance
 * against semitones): augmented 2nd, diminished 4th or 7th, augmented 5th,
 * tritone. Harmonic minor writes them wherever the raised 7th meets the 3rd,
 * 4th or 6th — C to G# in A minor is a diminished 4th a teacher marks.
 */
const PLAIN = [[0], [1, 2], [3, 4], [5], [7], [8, 9], [10, 11]];
export function alteredInterval(fromDstep, fromMidi, toDstep, toMidi) {
  let g = Math.abs(toDstep - fromDstep), sem = Math.abs(toMidi - fromMidi);
  while (g >= 7) { g -= 7; sem -= 12; }
  return !PLAIN[g].includes(sem);
}

function writesAugmentedSecond(notes, index, dstep, raiseSeventh, key) {
  const midi = pitchAt(dstep, key, { raiseSeventh }).midi;
  for (const neighbour of [notes[index - 1], notes[index + 1]]) {
    if (neighbour?.pitch && alteredInterval(neighbour.dstep, neighbour.pitch.midi, dstep, midi)) return true;
  }
  if (!key.isMinor) return false;
  for (const neighbour of [notes[index - 1], notes[index + 1]]) {
    if (!neighbour) continue;
    if (Math.abs(neighbour.dstep - dstep) !== 1) continue;
    const raisedHere = raiseSeventh && degreeOf(dstep, key) === 6;
    const raisedThere = neighbour.raiseSeventh && degreeOf(neighbour.dstep, key) === 6;
    if ((raisedHere && degreeOf(neighbour.dstep, key) === 5)
      || (raisedThere && degreeOf(dstep, key) === 5)) return true;
  }
  return false;
}

/**
 * Outer voices at every attack in *either* hand.
 *
 * Walking only the upper hand's attacks misses most of it. When the bass moves
 * under a held melody note and the melody then moves, the succession the ear
 * hears runs from the bass's new note to the next sonority — a pair this never
 * examined, which is why an earlier version of the repair changed almost
 * nothing while the audit went on reporting parallels. The moments that matter
 * are wherever the sounding chord changes, whichever hand caused it.
 */
function outerVoiceTimeline(upper, lower, barDuration) {
  const spans = [];
  const collect = (bars, staff) => bars.forEach((bar, barIndex) => {
    let offset = 0;
    for (const event of bar.events) {
      if (!event.rest && event.pitch) {
        const start = barIndex * barDuration + offset;
        spans.push({ staff, start, end: start + event.dur, event });
      }
      offset += event.dur;
    }
  });
  collect(upper, 1);
  collect(lower, 2);

  const bottomSpans = spans.filter((s) => s.staff === 2);
  const times = [...new Set(spans.map((s) => s.start))].sort((a, b) => a - b);
  const entries = [];
  for (const time of times) {
    const sounding = spans.filter((s) => s.start <= time && s.end > time);
    const top = sounding.filter((s) => s.staff === 1);
    const bottom = sounding.filter((s) => s.staff === 2);
    if (!top.length || !bottom.length) continue;
    const highest = top.reduce((best, s) => {
      const midi = Math.max(s.event.pitch.midi, ...(s.event.chord ?? []).map((p) => p.midi));
      return midi > best.midi ? { midi, event: s.event, span: s } : best;
    }, { midi: -Infinity, event: null, span: null });
    const bassMidis = bottom.flatMap((s) => [s.event.pitch.midi, ...(s.event.chord ?? []).map((p) => p.midi)]);
    /*
     * `sounding` guards candidate replacement pitches against a clash (used
     * by `moveOffParallel`'s `clashesWith` check), so it has to cover the
     * *whole* duration of the top event this entry is keyed to, not just the
     * bass notes active at this one instant. A held melody note can outlast
     * several bass attacks; checking only the first left `moveOffParallel`
     * free to relocate a note onto a pitch that clashed against a bass note
     * that hadn't attacked yet at `time` but was still within the moved
     * note's own sounding duration. `bass` (used for parallel-motion
     * detection between consecutive entries) stays instant-based — that one
     * is correctly about the vertical interval formed at each attack.
     */
    const fullBassMidis = bottomSpans
      .filter((s) => s.start < highest.span.end && s.end > highest.span.start)
      .flatMap((s) => [s.event.pitch.midi, ...(s.event.chord ?? []).map((p) => p.midi)]);
    entries.push({
      event: highest.event,
      top: highest.midi,
      bass: Math.min(...bassMidis),
      sounding: fullBassMidis,
    });
  }
  entries.forEach((entry, i) => {
    entry.isFirst = i === 0;
    entry.isLast = i === entries.length - 1;
    entry.isPenultimate = i === entries.length - 2;
  });
  return entries;
}

/**
 * Both hands must agree about the leading note. Repairing augmented seconds
 * per hand can leave one hand raising the 7th while the other does not, and
 * the two sounding together is a false relation — the harshest thing the
 * generator can produce.
 *
 * A single pairwise pass isn't enough once three or more degree-7 notes
 * overlap in time across the two hands (denser textures — faster harmonic
 * rhythm, syncopation — make this routine): fixing one disagreeing pair by
 * un-raising both notes can silently break a THIRD note's previously-fine
 * agreement with one of them. Since every fix only ever moves a note from
 * raised to natural (never back), repeating the sweep until a pass finds
 * nothing left to fix always terminates and leaves every mutually-
 * overlapping cluster fully reconciled, not just the first pair checked.
 */
export function harmoniseLeadingNotes(staves, key, barDuration) {
  if (!key.isMinor) return;
  const timelines = staves.map((bars) => leadingNoteVoices(bars, key, barDuration));

  let changed = true;
  while (changed) {
    changed = false;
    for (const a of timelines[0]) {
      for (const b of timelines[1]) {
        if (a.start >= b.end || a.end <= b.start) continue;
        if (a.isRaised() === b.isRaised()) continue;
        // Follow the natural form: it is always available, the raised one is not.
        a.lower();
        b.lower();
        changed = true;
      }
    }
  }
}

/**
 * Every sounding 7th-degree voice in a staff, main notes and stacked chord
 * notes alike, as something that can report whether it is raised and be put
 * back to natural.
 *
 * Chord notes have to be included. They are raised by the same harmonic-minor
 * rule as any other note, so once both hands can carry chords a stacked
 * leading note in one hand will eventually sound against the natural 7th in
 * the other — a false relation, and the harshest thing the generator can
 * produce. Reconciling only the main notes left exactly that hole.
 */
function leadingNoteVoices(bars, key, barDuration) {
  const voices = [];
  bars.forEach((bar, barIndex) => {
    let offset = 0;
    for (const event of bar.events) {
      if (event.rest || !event.pitch) {
        offset += event.dur;
        continue;
      }
      const start = barIndex * barDuration + offset;
      const end = start + event.dur;

      if (degreeOf(event.dstep, key) === 6) {
        voices.push({
          start,
          end,
          isRaised: () => Boolean(event.raiseSeventh),
          lower: () => {
            event.raiseSeventh = false;
            event.pitch = pitchAt(event.dstep, key, { raiseSeventh: false });
          },
        });
      }

      (event.chord ?? []).forEach((pitch, index) => {
        if (degreeOf(pitch.dstep, key) !== 6) return;
        const natural = pitchAt(pitch.dstep, key, { raiseSeventh: false });
        voices.push({
          start,
          end,
          isRaised: () => event.chord[index].alter > natural.alter,
          lower: () => { event.chord[index] = natural; },
        });
      });
      offset += event.dur;
    }
  });
  return voices;
}
