/**
 * Test generator: rules table in, score object out.
 *
 * Pipeline (see docs/abrsm-sight-reading-analysis.md §3):
 *   key / meter / length  ->  harmonic skeleton  ->  rhythm cells (with
 *   motif reuse)  ->  pitches under contour constraints  ->  dynamics,
 *   articulation and tempo term.
 */

import { createRandom, randomSeed } from './random.js';
import { createKey, dstepRange, degreeOf, pitchAt, chordDegrees, LETTERS } from './theory.js';
import { buildProgression, firstChord, lastChord, halfCadenceBar, splitPoint } from './harmony.js';
import {
  assignPitches, stackChordTones, soundingTimeline, harmoniseLeadingNotes, harmoniseRepeatedLeadingNotes,
  revertClashingBassDecorations,
  relaxParallels, planBassLine, planMelodyLine,
} from './melody.js';
import { DIVISIONS, cellsFor, fillBar, wholeBarRest } from './rhythm.js';
import { meterInfo, rescaleCells } from './meter.js';

const TEMPO_BPM = {
  Grave: 46, Largo: 52, Adagio: 60, Lento: 58, Andante: 76, Andantino: 84,
  'Andante cantabile': 72, Cantabile: 72, Moderato: 96, 'Allegro moderato': 104,
  Allegretto: 112, 'Con moto': 112, Grazioso: 96, Scherzando: 126, Espressivo: 76,
  Allegro: 132, 'Allegro con brio': 138, 'Allegro vivace': 144, 'Allegro agitato': 138,
  Vivace: 152, Presto: 168, Maestoso: 80, Appassionato: 108,

  // English/Italian character words and dance-form titles that real ABRSM
  // sight-reading specimens print at least as often as a plain tempo word
  // (confirmed against the Grade 1-5 specimen books) — the fallback below
  // silently defaulted every one of these to 96bpm before they had entries.
  March: 100, Gently: 76, Fanfare: 108, Sadly: 66, Lively: 116, Dancing: 108,
  Delicately: 84, Grandly: 92, Smoothly: 84, Waltz: 126, Happily: 108,
  'Slowly and smoothly': 66, Dance: 108, 'Sadly and gently': 66,
  'Gently rocking': 72, 'Sadly and slowly': 60,
  Minuet: 108, 'Moderato espressivo': 92, Lullaby: 60, Flowing: 92,
  'Lively and strong': 120, 'Gently and expressively': 72, 'Sad waltz': 108,
  'Tempo di minuetto': 108,
  Leggiero: 116, Grandioso: 84, 'Rather sadly': 66, Playfully: 112,
  'Alla marcia': 104, 'Poco allegretto': 108, Tenderly: 72, Gracefully: 88,
  'Allegretto cantabile': 104, 'Andante grazioso': 80, 'Allegretto semplice': 108,
  'Allegro giocoso': 132, 'Valse lente': 126, 'Andante espressivo': 76,
  Steadily: 92, 'Allegretto capriccioso': 116, Slowly: 60,
  'Andantino espressivo': 80, 'Tempo di tango': 112, 'Allegretto ritmico': 116,
  Rhythmically: 100, 'Leggiero allegretto': 116, 'Adagio espressivo': 58,
  Lilting: 92, 'Molto moderato': 84, 'Allegretto grazioso': 108, Giocoso: 132,
  'Cantabile ed espressivo': 72, 'Moderato leggiero': 100, Mesto: 60,
  'Con brio': 138, 'Andantino leggiero': 88, Gigue: 144, Tango: 112,
  Ritmico: 108, 'Andante maestoso': 84, 'Moderato preciso': 96,
  'Poco vivace': 144, 'Allegro leggiero': 138, 'Andantino grazioso': 84,
  Sprightly: 116, 'Gently flowing': 84, 'Allegretto misterioso': 100,
  'Poco andante': 84, 'Molto andante': 66,

  // Grades 6-8: extrapolated alongside the term additions above (no specimen
  // PDF available), same conservative treatment as those grades' "inferred"
  // confidence marker.
  'Andante sostenuto': 66, Risoluto: 120, Semplice: 88, Dolce: 66,
  'Molto vivace': 160, 'Allegro appassionato': 132, 'Molto agitato': 144,
  'Allegro risoluto': 132, Tranquillo: 60,
};

/**
 * @param {object} rulesTable parsed abrsm-piano-grades.json
 * @param {{grade: number, seed?: number}} options
 */
export function generateTest(rulesTable, options) {
  const grade = options.grade;
  const rules = rulesTable.grades[String(grade)];
  if (!rules) throw new Error(`no rules for grade ${grade}`);

  const seed = options.seed ?? randomSeed();
  const rng = createRandom(seed);

  // A specific tonic/mode (the app's key selector) overrides the random
  // pick — resolved against this grade's own key list so it also picks up
  // the correct `fifths`, rather than trusting the caller to know it.
  const key = createKey(
    options.tonic && options.mode ? resolveKey(rules, options.tonic, options.mode) : pickKey(rng, rules),
  );
  const meter = meterInfo(pickTimeSignature(rng, rules, rulesTable));
  const barCount = pickBarCount(rng, rules, meter.text);
  // A bar splitting into two chords is a faster harmonic rhythm than
  // lower grades' one-chord-per-bar texture can support — reserved for
  // Grade 5+, the same range where pedal marking starts appearing.
  const progression = buildProgression(rng, barCount, {
    simple: grade <= 3,
    minor: key.mode === 'minor',
    twoChordBarChance: grade >= 5 ? 0.3 : 0,
  });

  /*
   * Which bars of the consequent restate the antecedent's opening, decided
   * once for the whole texture rather than per hand. Rolling it separately in
   * each hand meant the two agreed only about half the time, and a restated
   * melody over a left hand that had moved on is not a restatement the ear
   * can hear — worse, the right hand is checked against the left, so the
   * notes it is trying to bring back keep getting rejected against a bass
   * that no longer matches. A real period brings both hands back together.
   */
  const form = planForm(rng, barCount, progression);

  // Grade 1 only: the hands never sound together, so each takes half the
  // test. The split is decided up front so that each hand's line is written
  // over the bars it actually plays and cadences properly.
  const silence = rules.texture.handsPlayTogether === false
    ? splitBarsBetweenHands(barCount, rng)
    : { rightHand: new Set(), leftHand: new Set() };

  // The left hand is written first and becomes the bass the right hand is
  // checked against; writing them independently is what produced clashes.
  // Both rhythms first, so the left hand's can be drawn against the right
  // hand's; pitches are still written left hand first (see buildRhythm).
  const rightParams = { rng, rules, meter, barCount, hand: 'rightHand', progression, key, silentBars: silence.rightHand, form };
  const rightRhythm = buildRhythm(rightParams);
  const leftParams = { rng, rules, meter, barCount, hand: 'leftHand', progression, key, silentBars: silence.leftHand, form, partner: rightRhythm };
  const leftHand = pitchStaff(buildRhythm(leftParams), leftParams);
  /*
   * Where the left hand actually settled. The right hand's working range was
   * drawn independently of it, so at the upper grades — where both ranges are
   * wide — the two could end up more than two octaves apart in 40% of moments,
   * a gaping hole in the middle of the texture that no keyboard writing leaves.
   */
  cadenceBass(leftHand, key, rules, fastLeapCap(rules.grade), meter.beatDuration);
  mergeFinalStutter(leftHand, rules, meter.barDuration);
  if (!rules.texture.fiveFingerPosition) lowerFinalBass(leftHand, rules.range.leftHand.minMidi, fastLeapCap(rules.grade), meter.beatDuration);   // five-finger grades stay in their position
  const leftSteps = leftHand
    .flatMap((bar) => bar.events.filter((event) => !event.rest && event.dstep !== undefined))
    .map((event) => event.dstep);
  const rightHand = pitchStaff(rightRhythm, {
    ...rightParams,
    against: soundingTimeline(leftHand, meter.barDuration),
    above: leftSteps.length ? Math.max(...leftSteps) : null,
  });
  /*
   * The bass chose its decorations before the right hand existed, so this is
   * the first point a clash between the two can even be asked about — and it
   * has to be asked before the parallel/leading-note passes below, which
   * assume both hands are already vertically sound.
   */
  revertClashingBassDecorations(leftHand, key, meter.barDuration, soundingTimeline(rightHand, meter.barDuration));
  // Consecutive fifths and octaves put back by the repair passes inside each
  // hand — only visible now that both hands are final.
  relaxParallels(rightHand, leftHand, key, meter.barDuration, rightHand.window);
  harmoniseLeadingNotes([rightHand, leftHand], key, meter.barDuration);
  // The cross-hand reconciliation above can itself leave a repeated note
  // disagreeing with itself within one hand (it only checks the two hands
  // against each other, not a hand against its own immediate repeat).
  harmoniseRepeatedLeadingNotes(rightHand, key);
  harmoniseRepeatedLeadingNotes(leftHand, key);
  fixCadenceParallels(rightHand, leftHand, key, meter.barDuration, fastLeapCap(rules.grade), meter.beatDuration);
  resolveFinalLeadingNote(rightHand, leftHand, key);
  fixSixteenthStutters(rightHand, leftHand, key, meter.barDuration, meter.beatDuration, true);
  fixSixteenthStutters(leftHand, rightHand, key, meter.barDuration, meter.beatDuration);
  // Last, once every repair has settled the final pitches. The tune too: a final bar of tonic-then-tonic (the downbeat cannot step
  // into the tonic over the tonic chord) is one held note, so the line steps
  // into the last bar instead of stuttering inside it.
  mergeFinalStutter(rightHand, rules, meter.barDuration, false);

  // A dance word implies its metre: a Waltz in 4/4 or a March in 3/4 is a
  // contradiction on the page (64 of 97 Grade 2 waltz/minuet tests were in 2/4 or 4/4).
  // A slow heading (Grave, Adagio, Largo…) over bars full of fast notes is a
  // character mismatch: keep slow terms for tests that are mostly not fast.
  const fastBars = [...leftHand, ...rightHand].filter((bar) => bar.events.some((e) => !e.rest && e.dur <= meter.beatDuration / 4)).length;
  const busy = fastBars > 0.25 * 2 * barCount;
  // "Sadly", "Mesto", "Lamentoso" describe a minor-key piece.
  const sadInMajor = (term) => key.mode === 'major' && /sad|mesto|lament|dolente|doloroso/i.test(term);
  // A singing word over 32nds or a melody full of mid-bar rests contradicts itself.
  const midRests = rightHand.reduce((n, bar) => n + bar.events.filter((e, i) => e.rest && i > 0 && i < bar.events.length - 1).length, 0);
  const choppy = midRests >= 3 || [...leftHand, ...rightHand].some((bar) => bar.events.some((e) => !e.rest && e.type === '32nd'));
  const fitting = rules.tempoTerms.filter((term) => termFitsMetre(term, meter.text) && !(busy && (TEMPO_BPM[term] ?? 96) <= 66)
    && !sadInMajor(term) && !(choppy && (CANTABILE_WORDS.test(term) || /andante/i.test(term))));
  const tempoTerm = rng.pick(fitting.length ? fitting : rules.tempoTerms);
  const score = {
    seed,
    grade,
    confidence: rules.confidence,
    key: { tonic: key.tonic, mode: key.mode, fifths: key.fifths },
    timeSignature: { beats: meter.beats, beatType: meter.beatType, text: meter.text },
    barCount,
    divisions: DIVISIONS,
    beatDuration: meter.beatDuration,
    barDuration: meter.barDuration,
    tempoTerm,
    tempoBpm: TEMPO_BPM[tempoTerm] ?? 96,
    progression,
    staves: { 1: rightHand, 2: leftHand },
  };

  applyExpression(rng, rules, score);
  return score;
}

/** Weighted so the staple metres dominate and the rarities stay rare. */
function pickTimeSignature(rng, rules, rulesTable) {
  const weights = rulesTable.timeSignatureWeights ?? {};
  const candidates = rules.timeSignatures.map((text) => ({ text, weight: weights[text] ?? 1 }));
  return rng.weighted(candidates).text;
}

/**
 * Every key a grade allows, split by mode — the same list `pickKey` draws
 * from at random and the app's key selector offers explicitly, so both stay
 * in agreement about what "valid at this grade" means without duplicating
 * Grade 8's allKeys table in two places.
 * @returns {{major: {tonic: string, fifths: number}[], minor: {tonic: string, fifths: number}[]}}
 */
export function keyOptionsFor(rules) {
  if (rules.keys.allKeys) {
    // Grade 8: every key up to six accidentals.
    const majors = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'];
    const fifthsFor = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6 };
    // g#/d#/a# minor are left out: their leading notes need double sharps.
    const minors = { A: 0, E: 1, B: 2, 'F#': 3, 'C#': 4, D: -1, G: -2, C: -3, F: -4, Bb: -5, Eb: -6 };
    return {
      major: majors.map((tonic) => ({ tonic, fifths: fifthsFor[tonic] })),
      minor: Object.keys(minors).map((tonic) => ({ tonic, fifths: minors[tonic] })),
    };
  }
  return { major: rules.keys.major, minor: rules.keys.minor };
}

function pickKey(rng, rules) {
  const { major, minor } = keyOptionsFor(rules);
  const majors = major.map((k) => ({ ...k, mode: 'major' }));
  const minors = minor.map((k) => ({ ...k, mode: 'minor' }));
  // Majors are more common in the specimen books than minors — Grade 8's
  // allKeys table used a slightly different weight (0.6) than the rest
  // (0.65) even before this was factored out, so that stays grade-specific.
  return rng.chance(rules.keys.allKeys ? 0.6 : 0.65) ? rng.pick(majors) : rng.pick(minors);
}

/** Resolve a user-picked tonic/mode against this grade's own key list, so it
 * also picks up the correct `fifths` rather than trusting the caller to know it. */
function resolveKey(rules, tonic, mode) {
  const { major, minor } = keyOptionsFor(rules);
  const found = (mode === 'major' ? major : minor).find((k) => k.tonic === tonic);
  if (!found) throw new Error(`${tonic} ${mode} is not available at grade ${rules.grade}`);
  return { tonic: found.tonic, mode, fifths: found.fifths };
}

function pickBarCount(rng, rules, timeSignature) {
  const spec = rules.lengthBars[timeSignature] ?? rules.lengthBars.default;
  if (!spec) throw new Error(`no bar count for ${timeSignature} at grade ${rules.grade}`);
  const [min, max] = spec;
  // Even bar counts: phrases come in pairs.
  const count = rng.int(min, max);
  return count % 2 === 0 ? count : Math.min(count + 1, max % 2 === 0 ? max : max - 1) || min;
}

function buildStaff(params) {
  return pitchStaff(buildRhythm(params), params);
}

/**
 * A hand's rhythm, bar by bar, with no pitches yet. Split from the pitch pass
 * so both hands' rhythms exist before either is pitched: the left hand's
 * rhythm used to be drawn without ever seeing the right hand's, so the two
 * were equally busy (LH 0.87-0.93x the RH's notes) and busy together.
 * `partner` is the right hand's rhythm, when drawing the left hand.
 */
function buildRhythm({ rng, rules, meter, barCount, hand, progression, silentBars = new Set(), form = [], partner = null }) {
  const isLeft = hand === 'leftHand';
  const activity = rules.generatorHints.activity ?? 0.4;
  // A supportive accompaniment role only exists once the hands actually
  // sound together — Grade 1's hands alternate, so its "calm" hand is just
  // taking its turn at the tune, not accompanying anything underneath it.
  const isAccompaniment = isLeft && rules.grade < 4 && rules.texture.handsPlayTogether;
  const cells = rescaleCells(
    cellsFor(rules, {
      compound: meter.compound,
      // From Grade 4 the hands have independent rhythms, so the left hand is
      // no longer limited to long values.
      calmOnly: isLeft && rules.grade < 4,
    }),
    meter.scale,
    rules,
  );
  if (!cells.length) throw new Error(`no usable rhythm cells for ${hand} at grade ${rules.grade}`);

  const restBudget = Math.max(1, Math.round((rules.generatorHints.restDensityPercent / 100) * meter.cellBeats));
  // Fast (semiquaver) beats per bar: one through Grade 4, two for 5-6, free after.
  // The left hand accompanies: no semiquavers through Grade 5, one beat at most
  // after (17-28% of left-hand notes were 16ths from Grade 4 up).
  // In x/8 a "fast beat" is demisemiquavers: none in the accompaniment.
  // x/8 halves every value, so a "fast beat" there is demisemiquavers: none in
  // the accompaniment, one at most in the tune (Grade 7-8; none below).
  const maxFast = meter.scale < 1
    ? (isLeft ? 0 : rules.grade >= 7 ? 1 : 0)
    : isLeft ? (rules.grade <= 5 ? 0 : 1) : rules.grade <= 4 ? 1 : rules.grade <= 6 ? 2 : 4;
  const bars = [];

  /*
   * A real accompaniment (Grade 2-3's left hand under the melody) reads as
   * one consistent figure for the whole piece — an Alberti-bass-style
   * pattern, not a fresh rhythm drawn bar by bar — so pick that figure once
   * and reuse it everywhere it applies, rather than leaving it to chance.
   */
  const ostinato = isAccompaniment
    ? fillBar(rng, cells, meter.cellBeats, { restBudget, maxFast, activity: activity * 0.7 }).events
    : null;
  let ostinatoSource = null;
  // How many bars the accompaniment figure has run without a break, and how
  // many it has taken overall.
  let ostinatoRun = 0;
  let ostinatoBars = 0;
  /*
   * A hard ceiling on how much of a test the accompaniment figure may occupy.
   * Capping only the consecutive run stopped three identical bars in a row but
   * not the figure owning four of six bars in alternation, which is what a
   * reader actually notices. A probability cannot give this guarantee — over
   * enough tests some will always land badly — so it is a count, not a roll.
   */
  const ostinatoBudget = Math.max(2, Math.round(barCount * 0.4));
  /*
   * The antecedent's last bar. A period breathes here — the half cadence is
   * an arrival, and real writing lands on it with a longer note and lets the
   * accompaniment figure break, which is the whole reason the phrase reads as
   * a question answered by the consequent rather than a run of bars.
   * Measured before this: the half-cadence bar carried 0.97-1.04x the notes
   * of an ordinary bar at every grade from 3 up, and its closing note was no
   * longer than anywhere else, so nothing marked the phrase boundary at all
   * and a test ran at flat density from bar 1 to the double bar. `buildStaff`
   * already gives the *final* bar exactly this treatment; the half cadence is
   * the same event one phrase earlier, only gentler — it is a comma, not a
   * full stop, so the activity reduction is milder than the cadence bar's and
   * rests stay available.
   */
  const phraseEnd = halfCadenceBar(barCount);
  let figure = null;

  for (let barIndex = 0; barIndex < barCount; barIndex++) {
    const isFinalBar = barIndex === barCount - 1;
    const isCadenceBar = isFinalBar || (silentBars.size && silentBars.has(barIndex + 1));
    const isPhraseEndBar = phraseEnd !== null && barIndex === phraseEnd && !isCadenceBar;
    let events;
    let motif = null;
    let usedOstinato = false;
    let formSource = null;

    if (silentBars.has(barIndex)) {
      events = wholeBarRest(meter.barDuration);
    } else if (isCadenceBar) {
      /*
       * Cadence bar: short values first, then a held note of at least half
       * the bar. Drawing calm cells was not enough — `ee` and `dq_e` are calm
       * too, and nothing put the long value last, so 53-62% of tests ended on
       * a note shorter than half a bar (a quaver in 23% at Grade 2). The left
       * hand usually just holds its final note for the whole bar.
       */
      const calm = cells.filter((cell) => cell.calm && !cell.rests);
      const draw = () => fillBar(rng, calm.length ? calm : cells, meter.cellBeats, {
        restBudget: 0,
        maxFast,
        activity: activity * 0.4,
      }).events;
      const endsLong = (drawn) => !drawn[drawn.length - 1].rest && drawn[drawn.length - 1].dur >= meter.barDuration / 2;
      const held = noteOfDuration(meter.barDuration, rules);
      events = null;
      if (isFinalBar && isLeft && rules.texture.handsPlayTogether && held && rng.chance(0.6)) events = [held];   // Grade 1's LH is a tune, not a bass
      // At Grade 1-2 a tune ends on one held note more often than not: a two-note
      // last bar cannot step into the tonic (its downbeat must be a chord tone).
      if (!events && !isLeft && rules.grade <= 2 && held && rng.chance(0.5)) events = [held];
      for (let attempt = 0; !events && attempt < 30; attempt++) {
        const candidate = draw();
        if (endsLong(candidate)) events = candidate;
      }
      if (!events) events = held ? [held] : draw();
    } else if (isPhraseEndBar) {
      // The phrase's arrival: calm cells so the bar ends long, but unlike the
      // final bar it may still rest, and it is not driven all the way down to
      // a single held note.
      const calm = cells.filter((cell) => cell.calm);
      const pool = calm.length ? calm : cells;
      const draw = () => fillBar(rng, pool, meter.cellBeats, {
        restBudget: Math.max(restBudget, 1),
        maxFast,
        activity: activity * 0.55,
      }).events;
      events = draw();
      // The accompaniment arrives on the half cadence's dominant with its bass note.
      for (let attempt = 0; isLeft && events[0]?.rest && attempt < 12; attempt++) {
        const again = draw();
        if (!again[0].rest && again[again.length - 1].dur >= events[events.length - 1].dur) events = again;
      }
      /*
       * The breath itself. A longer note at the half cadence is most of the
       * gesture, but a real antecedent usually also *lifts* before the
       * consequent answers it — and the melodic hand was measured resting in
       * 0.1-0.6% of its bars at Grade 3 and up, i.e. essentially never, so
       * the phrase ran straight into the next one with no gap anywhere.
       * Redraw a few times looking for a bar that ends in a rest rather than
       * forcing one: the cell library may hold no resting cell the grade can
       * use, and a phrase that arrives on a held note is a perfectly good
       * ending too, so this stays a preference. The accompaniment is left
       * alone — it is the tune that breathes.
       */
      /*
       * Gated to Grade 3 and up, where the period is a real two-hands event —
       * the same boundary the audit asserts the phrase breath at. At Grade
       * 1-2 the lift competes with the arrival note instead of complementing
       * it: those tests are four or six bars with a tiny cell vocabulary, so
       * a bar that ends in a rest is usually a bar whose *sounding* note got
       * shorter, and the half-cadence bar stopped arriving on a longer note
       * than its neighbours at all (measured 1.11 -> 1.02 at Grade 2).
       */
      const endsResting = (drawn) => drawn[drawn.length - 1]?.rest === true;
      if (rules.grade >= 3 && !isAccompaniment && !endsResting(events) && rng.chance(0.5)) {
        for (let attempt = 0; attempt < 6; attempt++) {
          const candidate = draw();
          if (endsResting(candidate)) { events = candidate; break; }
        }
      }
    } else if (ostinato && (ostinatoSource === null || (ostinatoRun < 2 && ostinatoBars < ostinatoBudget && rng.chance(0.55)))) {
      /*
       * The accompaniment figure, but not in *every* bar. Reusing it
       * unconditionally — which is what this did — put 85-89% of an
       * accompaniment's bars on one identical rhythm, and a Grade 2 test came
       * out with the same half-plus-quarter in all six bars. A real Alberti or
       * chordal accompaniment is a recognisable figure that still breaks: at
       * phrase ends, where the harmony moves faster, or simply for variety.
       * Keeping the figure in a clear majority of bars leaves it recognisable
       * while giving the hand somewhere to go.
       */
      usedOstinato = true;
      ostinatoBars += 1;
      events = ostinato.map((event) => ({ ...event }));
      // An accompaniment figure keeps its *shape* from chord to chord — that
      // is what makes an Alberti-style bass one recognisable pattern rather
      // than a new arpeggio every bar. The restatement is anchor-relative
      // (see melody.js), so each bar re-seats the same shape on whatever
      // chord tone the new harmony offers.
      if (ostinatoSource === null) ostinatoSource = barIndex;
      else motif = { sourceBarIndex: ostinatoSource, transpose: pitchTreatment(rng, progression, ostinatoSource, barIndex) ?? 0 };
    } else if (form[barIndex] && (form[barIndex].opening || !isAccompaniment)
      && !silentBars.has(form[barIndex].source) && bars[form[barIndex].source]) {
      /*
       * The bar comes back from earlier in the piece (see planForm): bars 1-2
       * returning as bars 3-4, the consequent opening as the antecedent did.
       * Both hands follow the same plan, so the whole texture returns, not
       * just the tune. A varied return keeps the source's first half and
       * finds a new ending.
       */
      const plan = form[barIndex];
      formSource = plan.source;
      const source = bars[plan.source].events;
      const varied = plan.variant
        ? varyBar(rng, source, cells, meter, { restBudget, maxFast, activity: isLeft ? activity * 0.7 : activity })
        : null;
      events = (varied?.events ?? source).map((event) => ({ ...event }));
      motif = plan.transpose === null ? null : {
        sourceBarIndex: plan.source,
        transpose: plan.transpose,
        limit: varied ? varied.kept : Infinity,
      };
    } else {
      /*
       * A bar meant to be *fresh* has to actually come out fresh. The calm
       * cell set a low-grade left hand draws from holds only six or seven
       * cells, and their weights concentrate hard, so an independent draw
       * reproduced the bar before it often enough that a Grade 2 test could
       * show the same figure in four of its six bars even with the ostinato
       * turned down — the vocabulary, not the ostinato, was the binding
       * constraint. Redraw when a bar duplicates what it is meant to be
       * relieving. Restatements are excluded by construction: they are
       * handled in the branches above, where repetition is the intent.
       */
      /*
       * A tune that rests in bar after bar reads as choppy (12-18% of Grade 2-4
       * tests rested in half their bars): once about a third of the melody's
       * bars have had a rest, its remaining ordinary bars play through.
       */
      const restedBars = bars.filter((bar) => bar.events.some((e) => e.rest) && bar.events.some((e) => !e.rest)).length;
      const restsLeft = isLeft || restedBars < Math.ceil(barCount * 0.3) ? restBudget : 0;
      const options = { restBudget: restsLeft, maxFast, activity: isLeft ? activity * 0.7 : activity,
        // Grade 1-2: an ordinary bar carries at least two notes (four dotted minims is not a tune).
        minNotes: rules.grade <= 2 ? (meter.cellBeats >= 3 ? 3 : 2) : 1 };
      // The phrase's accompaniment figure (Grade 4 up): set by the first fresh bar of each phrase.
      if (isLeft && phraseEnd !== null && barIndex === phraseEnd + 1) figure = null;
      // The figure may sound twice running, then breaks (like the Grade 2-3 ostinato).
      const sigOf = (b) => (bars[b] ? rhythmSignature(bars[b].events) : null);
      const figureRun = figure && sigOf(barIndex - 1) === rhythmSignature(figure) && sigOf(barIndex - 2) === rhythmSignature(figure);
      const figureBars = figure ? bars.filter((bar) => rhythmSignature(bar.events) === rhythmSignature(figure)).length : 0;
      if (isLeft && rules.grade >= 4 && figure && !figureRun && figureBars < barCount * 0.45) { options.figure = rhythmSignature(figure); options.figureEvents = figure; }
      const avoid = [bars[barIndex - 1]?.events, bars[barIndex - 2]?.events, ostinato];
      events = isLeft && partner
        ? drawComplementaryBar(rng, cells, meter, options, avoid, partner[barIndex]?.events ?? [],
          Array.isArray(progression[barIndex]) ? splitPoint(meter.barDuration, meter.beatDuration) : null)
        : drawContrastingBar(rng, cells, meter.cellBeats, options, avoid);
      if (isLeft && rules.grade >= 4 && !figure && events.filter((e) => !e.rest).length > 1) figure = events.map((e) => ({ ...e }));
    }

    /*
     * The figure may state itself twice running, but a third identical bar is
     * where an accompaniment stops being a pattern and starts being a stuck
     * record — which is how a six-bar test ended up with four bars alike.
     */
    ostinatoRun = usedOstinato ? ostinatoRun + 1 : 0;

    // The bass states a split bar's second chord: a note held across the change
    // is re-struck there (8% of split bars held the old bass under the new chord).
    if (isLeft && Array.isArray(progression[barIndex])) events = strikeAt(events, splitPoint(meter.barDuration, meter.beatDuration), rules);
    bars.push({ events, beatDuration: meter.beatDuration, directions: [], motif, formSource });
  }

  return bars;
}

const NOTE_OF = { 96: ['whole', 0], 72: ['half', 1], 48: ['half', 0], 36: ['quarter', 1], 24: ['quarter', 0], 18: ['eighth', 1], 12: ['eighth', 0], 6: ['16th', 0] };
/** Split the note sounding across `at` into two attacks, when both halves are printable at this grade. */
function strikeAt(events, at, rules) {
  let offset = 0;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (offset === at) return events;
    if (offset < at && offset + event.dur > at && !event.rest && !event.timeModification) {
      const a = NOTE_OF[at - offset], b = NOTE_OF[offset + event.dur - at];
      const ok = (n) => n && rules.rhythm.noteValues.includes(n[0]) && (!n[1] || (rules.rhythm.dottedValues ?? []).includes(n[0]));
      if (!ok(a) || !ok(b)) return events;
      const first = { ...event, dur: at - offset, type: a[0], dots: a[1] };
      const second = { ...event, dur: offset + event.dur - at, type: b[0], dots: b[1] };
      return [...events.slice(0, i), first, second, ...events.slice(i + 1)];
    }
    offset += event.dur;
  }
  return events;
}

/** Pitches (and chords) for a hand whose rhythm `buildRhythm` has drawn. */
function pitchStaff(bars, { rng, rules, meter, hand, progression, key, against = null, above = null, form = [] }) {
  const isLeft = hand === 'leftHand';
  const range = rules.range[hand];
  const { low, high } = dstepRange(key, range.minMidi, range.maxMidi);
  /*
   * The left hand has a home register, not the whole permitted range picked
   * uniformly: real tests keep it on the bass staff around C3-G3 at the low
   * grades (a uniform pick put Grade 2 on E2-G2 in 14% of tests) and only dip
   * low occasionally later. Window starts are weighted toward `center`, and the
   * left hand's working span is capped at about an octave and a half.
   */
  // Window centres: the bass around E3, the tune around B4 (a tune sitting in
  // G3-E4 over the bass is a tenor line, not a treble melody).
  const center = isLeft ? 23 : rules.texture.fiveFingerPosition ? null : 34;
  // The accompaniment stays on the bass staff's side of middle C (D4 at most,
  // through Grade 5): reaching F4-G4 under a tune that sits around C5 put the
  // hands within a tone of each other at 7-14% of attacks.
  const top = isLeft && !rules.texture.fiveFingerPosition ? Math.max(low + 6, Math.min(high, 29)) : high;
  const window = rules.texture.fiveFingerPosition
    ? fiveFingerWindow(rng, key, low, high, above, center === null ? null : center + 1)
    : tessituraWindow(rng, key, low, top, isLeft ? Math.min(10, 8 + rules.grade) : 8 + rules.grade, above, center);

  // The bass line is planned bar to bar first (melody.js planBassLine), then filled.
  const bassPlan = isLeft
    ? planBassLine({ rng, key, bars, progression, window, inversion: (rules.generatorHints.bassInversionPercent ?? 0) / 100, phraseEnd: halfCadenceBar(bars.length) })
    : null;
  const melodyPlan = isLeft
    ? null
    : planMelodyLine({ rng, key, bars, progression, window, phraseEnd: halfCadenceBar(bars.length), form, against, barDuration: meter.barDuration });
  assignPitches({
    rng,
    key,
    bars,
    progression,
    window,
    options: {
      bassPlan,
      melodyPlan,
      halfBar: halfCadenceBar(bars.length),
      stepwiseBias: rules.generatorHints.stepwiseBiasPercent / 100,
      // Largest leap between short notes (hand has no time to travel): a
      // fourth through Grade 4, a fifth at 5-6, a sixth from 7.
      fastLeapSemitones: rules.grade <= 4 ? 5 : rules.grade <= 6 ? 7 : 9,
      maxLeapSemitones: isLeft
        ? Math.min(rules.generatorHints.maxLeapSemitones, 12)
        : rules.generatorHints.maxLeapSemitones,
      chordToneOnly: isLeft,
      // Only the bass is chord-tone-restricted, so only the bass reads this.
      bassDecoration: isLeft ? (rules.generatorHints.bassDecorationPercent ?? 0) / 100 : 0,
      bassInversion: isLeft ? (rules.generatorHints.bassInversionPercent ?? 0) / 100 : 0,
      endOnTonic: true,
      barDuration: meter.barDuration,
      // The tune is shaped as an arch across the whole test; the bass that
      // supports it should stay put underneath rather than arch with it.
      // The bass gets a gentle *inverted* arch: it sinks while the tune climbs
      // and comes back as the tune falls — contrary motion at the scale of the
      // phrase (a flat target left it hopping round the window centre).
      arch: isLeft ? -0.4 : 1,
    },
    against,
  });

  /*
   * The accompaniment takes chords from Grade 3, where two-note chords first
   * appear. The melody only starts taking them once the grade declares a
   * simultaneous-note total (`maxNotesTotal`, Grade 5) — that is the point the
   * syllabus describes as four-part writing, "two notes per hand", and until
   * then chords belong under the tune rather than in it. Leaving the melody
   * out of this entirely is why the right hand never played a chord at any
   * grade and Grade 8 read no thicker than Grade 3.
   */
  if (rules.texture.maxNotesPerChord >= 2 && (isLeft || rules.texture.maxNotesTotal)) {
    stackChordTones({
      bars, key, progression, rng, window,
      maxNotes: rules.texture.maxNotesPerChord,
      // A melody is mostly single notes even where chords are allowed, so it
      // takes them a good deal less often than the accompaniment does.
      density: isLeft ? 0.18 + 0.02 * rules.grade : 0.05 + 0.015 * rules.grade,
      barDuration: meter.barDuration,
      against,
      maxTotal: rules.texture.maxNotesTotal ?? Infinity,
      // Only the lower hand actually sets the bass, and so the inversion.
      bassVoicing: isLeft,
    });
  }

  // The cross-hand parallel repair runs once both hands exist and has to keep
  // its replacements inside this hand's working range, so carry it along.
  bars.window = window;
  return bars;
}

/** A bar's rhythm, as a comparable string. */
function rhythmSignature(events) {
  return events.map((event) => `${event.rest ? 'r' : 'n'}${event.dur}`).join(',');
}

/**
 * Draw a bar of rhythm that differs from the ones given in `avoid` — the two
 * bars before it, and the accompaniment figure it is supposed to be breaking
 * up. Looking back two bars rather than one matters most in the short metres,
 * where a bar holds two or three beats and the handful of available fillings
 * would otherwise alternate ABAB and still read as one repeated figure.
 * Falls back to the first draw when the cell vocabulary is too small to
 * offer anything else, which is a real situation at Grade 1-2 rather than a
 * failure: better a repeated bar than a bar that does not fill. The attempt
 * count is generous because the draw is weighted, not uniform — in a two-beat
 * bar drawn from the calm cells, quarter-plus-quarter carries most of the
 * probability mass on its own, so a handful of tries kept returning it.
 */
function drawContrastingBar(rng, cells, cellBeats, options, avoid) {
  const unwanted = new Set(avoid.filter(Boolean).map(rhythmSignature));
  let first = null;
  for (let attempt = 0; attempt < 24; attempt++) {
    const { events } = fillBar(rng, cells, cellBeats, options);
    if (events.filter((e) => !e.rest).length < (options.minNotes ?? 1) && attempt < 20) continue;
    // More than three different note values in one bar is a rhythm puzzle, not a tune.
    if (new Set(events.map((e) => `${e.dur}`)).size > 3 && attempt < 20) continue;
    if (first === null) first = events;
    if (!unwanted.has(rhythmSignature(events))) return events;
  }
  return first;
}

/**
 * The left hand's bar chosen against the right hand's: of several drawn
 * candidates, the one that best complements it — thinner (about two thirds of
 * the RH's notes), moving where the RH holds, holding where the RH runs, and
 * sounding at a split bar's chord change. Real tests are a tune over a plainer
 * accompaniment; drawing the LH blind made both hands equally busy, busy
 * together in 30-46% of the RH's busy beats, and the bass missed a mid-bar
 * chord change in a quarter of split bars.
 */
function drawComplementaryBar(rng, cells, meter, options, avoid, partnerEvents, splitAt) {
  const unwanted = new Set(avoid.filter(Boolean).map(rhythmSignature));
  const attacks = (events) => {
    const out = []; let offset = 0;
    for (const event of events) { if (!event.rest) out.push({ at: offset, dur: event.dur }); offset += event.dur; }
    return out;
  };
  const right = attacks(partnerEvents);
  const beat = meter.beatDuration;
  /*
   * Beats where a hand plays a triplet. Three against two between the hands is
   * a separate skill (polyrhythm), not sight-reading at these grades: the other
   * hand either holds through that beat or plays the same triplet.
   */
  const tupletBeats = (events) => {
    const out = new Map(); let offset = 0;
    for (const event of events) {
      const b = Math.floor(offset / beat);
      if (!out.has(b)) out.set(b, { tuplet: false, inner: false });
      if (event.timeModification) out.get(b).tuplet = true;
      if (!event.rest && offset % beat !== 0) out.get(b).inner = true;
      offset += event.dur;
    }
    return out;
  };
  const rightBeats = tupletBeats(partnerEvents);
  const crossRhythm = (events) => {
    for (const [b, l] of tupletBeats(events)) {
      const r = rightBeats.get(b) ?? { tuplet: false, inner: false };
      if (l.tuplet !== r.tuplet && ((l.tuplet && r.inner) || (r.tuplet && l.inner))) return true;
    }
    return false;
  };
  const busyBeat = (t) => right.filter((a) => Math.floor(a.at / beat) === Math.floor(t / beat)).length >= 2;
  const score = (events) => {
    const left = attacks(events);
    let value = 0;
    if (right.length) value -= 4 * Math.abs(left.length / right.length - 0.65);
    for (const a of left) {
      const holding = right.find((b) => b.at < a.at && b.at + b.dur > a.at);
      if (holding) value += holding.dur >= meter.barDuration / 2 ? 1.2 : 0.5;     // moves while the tune holds
      else if (a.at % beat !== 0 && busyBeat(a.at)) value -= 0.8;                // off-beat chatter under a busy beat
    }
    if (splitAt !== null && !left.some((a) => a.at === splitAt)) value -= 5;     // the bass states the new chord
    value -= 1.5 * events.filter((event) => !event.rest && event.dur <= beat / 4).length / 4;   // fast notes belong to the tune
    if (crossRhythm(events)) value -= 1000;                                       // never 3 against 2
    if (events.filter((e) => !e.rest).length < (options.minNotes ?? 1)) value -= 10;   // Grade 1-2 bars carry notes
    // Both hands silent on the same off-beat is a hiccup in the texture.
    {
      let o = 0; const rests = [];
      for (const e of partnerEvents) { if (e.rest) rests.push([o, o + e.dur]); o += e.dur; }
      o = 0;
      for (const e of events) { if (e.rest && rests.some(([a, z]) => a < o + e.dur && z > o)) value -= 2; o += e.dur; }
    }
    // An accompaniment keeps its figure through a phrase (Grade 4 up).
    if (options.figure && rhythmSignature(events) === options.figure) value += 1.0;
    if (events[0]?.rest && partnerEvents.some((event) => !event.rest)) value -= 3; // the bass states the harmony on the downbeat
    return value + rng.next() * 0.5;
  };
  let best = null, bestScore = -Infinity, fallback = null;
  for (let attempt = 0; attempt < 16; attempt++) {
    const events = attempt === 0 && options.figureEvents
      ? options.figureEvents.map((e) => ({ ...e }))
      : fillBar(rng, cells, meter.cellBeats, options).events;
    if (unwanted.has(rhythmSignature(events)) && !crossRhythm(events) && rhythmSignature(events) !== options.figure) { fallback ??= events; continue; }
    const value = score(events);
    if (value > bestScore) { best = events; bestScore = value; }
  }
  return best ?? fallback;
}

/**
 * Which bars return from earlier in the piece, as `form[bar] = {source,
 * variant, transpose}` — decided once for the whole texture, so both hands
 * bring a bar back together.
 *
 * Real sight-reading tests are economical: the opening two-bar idea comes
 * back straight away (bars 3-4 restating or sequencing bars 1-2), and the
 * consequent phrase opens the way the antecedent did. Drawing every bar fresh
 * — and, worse, redrawing any bar that happened to match the two before it —
 * is what made a test read as a string of unrelated bars: nothing in it was
 * an idea, because nothing ever came back. The bars just before a phrase's
 * arrival stay free, so the line can head somewhere new into each cadence.
 *
 *   8 bars:  a b a' HC | a b c  V-I
 *  12 bars:  a b a' b' c HC | a b a' b' c' V-I
 */
function planForm(rng, barCount, progression) {
  const half = halfCadenceBar(barCount);
  const anteEnd = half ?? barCount - 1;
  const form = [];
  const set = (bar, source, chance, variant = 0, literal = false) => {
    if (bar <= source || bar >= barCount - 1 || form[bar] || !rng.chance(chance)) return false;
    const transpose = literal ? rootDistance(progression, source, bar) : pitchTreatment(rng, progression, source, bar);
    form[bar] = { source, variant: rng.chance(variant), transpose, opening: literal };
    return true;
  };
  // The basic idea, said twice.
  if (2 < anteEnd) set(2, 0, 0.75, 0.35);
  if (3 < anteEnd) set(3, 1, 0.4, 0.35);
  // A long antecedent (8 bars) repeats its continuation's first bar too.
  if (5 < anteEnd && anteEnd >= 7) set(5, 4, 0.35, 0.4);
  if (half !== null) {
    for (let k = 0; half + 1 + k < barCount - 2; k++) {
      const destination = half + 1 + k;
      if (k <= 1) set(destination, k, k === 0 ? 0.9 : 0.75, 0, true);   // the consequent opens as the antecedent did, note for note
      else if (form[k]) set(destination, form[k].source, 0.6, 0.35);
      else break;
    }
  }
  return form;
}

/**
 * A varied return: the source bar's opening (up to a beat boundary at or past
 * the middle of the bar) with a freshly drawn ending. Returns the new events
 * and how many sounding notes were kept, or null when the bar cannot be split
 * (one long note, or no event boundary on a beat in the second half).
 */
function varyBar(rng, events, cells, meter, options) {
  const cellDur = meter.barDuration / meter.cellBeats;
  let offset = 0;
  let keep = 0;
  for (let i = 0; i < events.length - 1; i++) {
    offset += events[i].dur;
    if (offset >= meter.barDuration / 2 && offset % cellDur === 0) { keep = i + 1; break; }
  }
  if (!keep) return null;
  const prefix = events.slice(0, keep);
  const from = Math.round(offset / cellDur);
  const fastBeats = new Set();
  let at = 0;
  for (const event of prefix) {
    if (!event.rest && event.dur <= cellDur / 4) fastBeats.add(Math.floor(at / cellDur));
    at += event.dur;
  }
  const original = rhythmSignature(events.slice(keep));
  for (let attempt = 0; attempt < 8; attempt++) {
    const tail = fillBar(rng, cells, meter.cellBeats, {
      ...options,
      from,
      afterRest: prefix[prefix.length - 1].rest === true,
      maxFast: Math.max(0, options.maxFast - fastBeats.size),
    }).events;
    if (rhythmSignature(tail) !== original) {
      return { events: [...prefix, ...tail], kept: prefix.filter((event) => !event.rest).length };
    }
  }
  return null;
}

/**
 * How a bar that reuses an earlier bar's rhythm should treat that bar's
 * *pitches*. Reusing the rhythm alone — which is all this used to do — gives
 * the ear a rhythmic rhyme with no melodic one: bar 3 has bar 1's rhythm but
 * an unrelated tune, so nothing is recognisable as a restatement and the test
 * reads as a row of separately-invented bars. Measured at 1-5% of bars
 * sharing any melodic contour with an earlier bar, against real specimens
 * where restating the opening motif in bar 3-4 is close to a formal
 * requirement (`docs/abrsm-sight-reading-analysis.md §3.3`, and the rules
 * table's long-unused `motifRepeatBars`).
 *
 * The shift is not a free choice: it is the diatonic distance between the two
 * bars' chord roots. That is the one shift that maps the source bar's chord
 * tones onto *this* bar's chord tones, because a diatonic triad is a stack of
 * thirds — moving {root, +2, +4} up by k gives the triad rooted at root+k. A
 * freely-picked shift (±1, ±2) instead lands the restatement's strong beats on
 * notes the new harmony does not contain, and the chord-tone filters in
 * `pickWeighted` then reject it note by note: measured at only 14% of motif
 * bars keeping their contour, versus the near-total preservation a
 * root-distance shift gets. When the two bars share a chord the shift is zero
 * and the motif restates literally; when they differ it comes out as a tonal
 * sequence — which is exactly the pair of operations the analysis describes.
 *
 * Returning null is the analysis's third operation (same rhythm, new pitches),
 * kept as a minority case so a test is not wall-to-wall restatement.
 */
function pitchTreatment(rng, progression, sourceBarIndex, barIndex) {
  if (rng.chance(0.2)) return null;
  return rootDistance(progression, sourceBarIndex, barIndex);
}

/** Diatonic shift from one bar's chord root to another's, the nearer way round. */
function rootDistance(progression, sourceBarIndex, barIndex) {
  const rootOf = (entry) => chordDegrees(firstChord(entry ?? 'I'))[0];
  const diff = (((rootOf(progression[barIndex]) - rootOf(progression[sourceBarIndex])) % 7) + 7) % 7;
  // Take the shift as the nearer of the two directions, so a motif sequences
  // by a third down rather than a sixth up.
  return diff > 3 ? diff - 7 : diff;
}

/**
 * Above the five-finger grades, a test still sits in one region of the
 * keyboard rather than roaming the whole permitted range — otherwise the line
 * wanders and collects ledger lines no real test would print. Pick a working
 * tessitura inside the range, wider at each grade.
 */
/**
 * Two semiquavers on one pitch (E4s E4s) read as a misprint, especially at
 * Grade 3-5 where semiquavers are new: 22-38% of tests there had one, about
 * half from motif restatement and half from the repair passes, which is why
 * this runs last. The second note moves a step (toward the note after it
 * where possible) when that is clear of the other hand, writes no augmented
 * second, stays in the window and leaves the next move within a third.
 */
function fixSixteenthStutters(bars, other, key, barDuration, beatDuration, triples = false) {
  const flat = [];
  bars.forEach((bar, b) => { let o = 0; for (const e of bar.events) { if (!e.rest && e.pitch) flat.push({ e, at: b * barDuration + o }); o += e.dur; } });
  const otherSpans = [];
  other.forEach((bar, b) => { let o = 0; for (const e of bar.events) { if (!e.rest && e.pitch) otherSpans.push({ from: b * barDuration + o, to: b * barDuration + o + e.dur, midis: [e.pitch.midi, ...(e.chord ?? []).map((c) => c.midi)] }); o += e.dur; } });
  const window = bars.window;
  for (let k = 1; k < flat.length; k++) {
    const a = flat[k - 1], b = flat[k], next = flat[k + 1];
    const fast = (e) => e.dur <= beatDuration / 4;   // 16ths in x/4, 32nds in x/8
    // Three on one pitch at any speed (A-A-A) is a stutter too: the middle one
    // becomes a neighbour note (A-B-A), as in the 16th case.
    const triple = triples && next && a.e.pitch.midi === b.e.pitch.midi && next.e.pitch.midi === b.e.pitch.midi;
    if ((!triple && (!fast(a.e) || !fast(b.e))) || a.e.pitch.midi !== b.e.pitch.midi || b.e.chord?.length) continue;
    if (b.at % beatDuration === 0) continue;   // a note on the beat keeps its chord tone
    const dirs = next ? [Math.sign(next.e.dstep - b.e.dstep) || 1, -(Math.sign(next.e.dstep - b.e.dstep) || 1)] : [1, -1];
    for (const dir of dirs) {
      const dstep = b.e.dstep + dir;
      if (window && (dstep < window.low || dstep > window.high)) continue;
      const degree = degreeOf(dstep, key);
      if (degree === 6) continue;   // never introduce a leading note here (its raised/natural form is reconciled earlier)
      const pitch = pitchAt(dstep, key);
      if (Math.abs(pitch.midi - a.e.pitch.midi) === 3) continue;                         // augmented 2nd
      if (next && (Math.abs(next.e.dstep - dstep) > 2 || Math.abs(next.e.pitch.midi - pitch.midi) === 3)) continue;
      if (next && next.e.dstep === dstep) continue;   // fixing one repeat must not write the next one
      const clash = otherSpans.some((s) => s.from < b.at + b.e.dur && s.to > b.at
        && s.midis.some((m) => [1, 2, 6, 10, 11].includes((((pitch.midi - m) % 12) + 12) % 12)));
      if (clash) continue;
      b.e.dstep = dstep;
      b.e.pitch = pitch;
      b.e.raiseSeventh = false;
      break;
    }
  }
}

/**
 * With the bass now 5-1 into the final chord, the tune is free to take the
 * leading note at the end of the V bar — and then must rise to the tonic.
 * When the final bar opens on something else, move that first note to the
 * tonic a step above (same pitch class as the final note, so the harmony is
 * untouched), provided it stays in the hand's window and joins what follows.
 */
function resolveFinalLeadingNote(bars, lower, key) {
  const last = bars.length - 1;
  const before = bars.slice(0, last).flatMap((bar) => bar.events).filter((e) => !e.rest && e.pitch).pop();
  const finalNotes = bars[last].events.filter((e) => !e.rest && e.pitch);
  const first = finalNotes[0];
  if (!before || !first || degreeOf(before.dstep, key) !== 6 || first.dstep === before.dstep + 1) return;
  const dstep = before.dstep + 1;
  const window = bars.window;
  if (window && (dstep < window.low || dstep > window.high)) return;
  const next = finalNotes[1];
  const pitch = pitchAt(dstep, key);
  if (next && Math.abs(next.pitch.midi - pitch.midi) > 7) return;
  // Clear of whatever the left hand sounds under it (a raised 7th still moving there, say).
  const span = (events, target) => { let o = 0; for (const e of events) { if (e === target) return [o, o + e.dur]; o += e.dur; } return null; };
  const [from, to] = span(bars[last].events, first);
  let o = 0;
  for (const e of lower[last].events) {
    const start = o; o += e.dur;
    if (e.rest || !e.pitch || start >= to || o <= from) continue;
    for (const m of [e.pitch.midi, ...(e.chord ?? []).map((c) => c.midi)]) {
      if ([1, 2, 6, 10, 11].includes((((pitch.midi - m) % 12) + 12) % 12)) return;
    }
  }
  first.dstep = dstep;
  first.pitch = pitch;
  first.raiseSeventh = false;
  delete first.chord;
}

/**
 * The cadence's bass is 5-1: the left hand's last note before the final bar
 * on the root of V, a fifth above or fourth below... i.e. a falling fifth or
 * rising fourth into the tonic. Measured 29-38% before (the leading note or a
 * leap of more than a fifth otherwise). Nearest such root to where the note
 * was, inside the hand's window, without breaking the short-note leap cap.
 */
function cadenceBass(bars, key, rules, fastCap, beatDuration) {
  const last = bars.length - 1;
  const final = bars[last].events.find((e) => !e.rest && e.pitch);
  const before = bars.slice(0, last).flatMap((bar) => bar.events).filter((e) => !e.rest && e.pitch);
  const target = before[before.length - 1], prior = before[before.length - 2];
  if (!final || !target || degreeOf(target.dstep, key) === 4) return;
  const window = bars.window;
  let best = null;
  for (const dstep of [final.dstep - 3, final.dstep + 4]) {   // rising 4th / falling 5th into the tonic
    if (window && (dstep < window.low || dstep > window.high)) continue;
    const pitch = pitchAt(dstep, key);
    if (pitch.midi < rules.range.leftHand.minMidi || pitch.midi > rules.range.leftHand.maxMidi) continue;
    const fixedHand = window && window.high - window.low <= 4;
    if (prior) {
      const leap = Math.abs(pitch.midi - prior.pitch.midi);
      if (leap > 12) continue;
      if (!fixedHand && (prior.dur <= beatDuration / 2 || target.dur <= beatDuration / 2) && leap > fastCap) continue;
    }
    // ...and on into the final tonic: a short V root may not leap further than the grade's cap.
    if (!fixedHand && target.dur <= beatDuration / 2 && Math.abs(pitch.midi - final.pitch.midi) > fastCap) continue;
    if (!best || Math.abs(pitch.midi - target.pitch.midi) < Math.abs(best.midi - target.pitch.midi)) best = pitch;
  }
  if (!best) return;
  target.dstep = best.dstep;
  target.pitch = best;
  target.raiseSeventh = false;
  delete target.chord;
}

/**
 * A final left-hand bar of one pitch struck over and over (G2q G2q G2h) is a
 * stutter, not a cadence: hold it as one note when the grade can print one.
 */
function mergeFinalStutter(bars, rules, barDuration, octaveDrop = true) {
  const bar = bars[bars.length - 1];
  const sounding = bar.events.filter((e) => !e.rest);
  if (sounding.length < 2) return;
  if (!sounding.every((e) => e.pitch && e.pitch.midi === sounding[0].pitch.midi)) return;
  const held = noteOfDuration(barDuration, rules);
  if (held) { bar.events = [{ ...sounding[sounding.length - 1], ...held, rest: false }]; return; }
  if (!octaveDrop) return;
  // No single note value fills the bar (5/4, 7/8…): make it an octave drop
  // into the final note instead, the earlier notes an octave up.
  const up = (p) => ({ ...p, octave: p.octave + 1, dstep: p.dstep + 7, midi: p.midi + 12 });
  if (sounding[0].pitch.midi + 12 > rules.range.leftHand.maxMidi) return;
  for (const event of sounding.slice(0, -1)) { event.dstep += 7; event.pitch = up(event.pitch); delete event.chord; }
}

/**
 * Both hands now arrive on the final chord together (a held note each), so the
 * step into it is a real outer-voice succession — and D-C over D-C is parallel
 * octaves into the cadence (89 of 95 Grade 2 parallel octaves sat exactly
 * here). Re-voice the bass's last note before the final bar onto the root of V
 * (the textbook 5-1 bass), nearest to where it was, when that removes the
 * parallel and stays within an octave of the final bass and clear of the RH.
 */
function fixCadenceParallels(rightHand, leftHand, key, barDuration, fastCap = 12, beatDuration = Infinity) {
  const lastBar = rightHand.length - 1;
  const lastBefore = (bars) => bars.slice(0, lastBar).flatMap((bar) => bar.events).filter((e) => !e.rest && e.pitch).pop();
  const firstIn = (bars) => bars[lastBar].events.find((e) => !e.rest && e.pitch);
  const top = (e) => Math.max(e.pitch.midi, ...(e.chord ?? []).map((n) => n.midi));
  const bottom = (e) => Math.min(e.pitch.midi, ...(e.chord ?? []).map((n) => n.midi));
  const r0 = lastBefore(rightHand), r1 = firstIn(rightHand), l0 = lastBefore(leftHand), l1 = firstIn(leftHand);
  if (!r0 || !r1 || !l0 || !l1 || l0.chord?.length) return;
  const parallel = (bass) => {
    const up = Math.sign(top(r1) - top(r0)), down = Math.sign(bottom(l1) - bass);
    const before = (((top(r0) - bass) % 12) + 12) % 12, after = (((top(r1) - bottom(l1)) % 12) + 12) % 12;
    return up !== 0 && up === down && before === after && (before === 0 || before === 7);
  };
  if (!parallel(bottom(l0))) return;
  /*
   * The bass is 5-1 on purpose (cadenceBass), so fix the tune first: approach
   * the final tonic from the supertonic (falling) or the leading note (rising)
   * rather than from the dominant in octaves with the bass.
   */
  if (!r0.chord?.length) {
    const window = rightHand.window;
    const priorR = rightHand.slice(0, lastBar).flatMap((bar) => bar.events).filter((e) => !e.rest && e.pitch).slice(-2)[0];
    for (const dstep of [r1.dstep + 1, r1.dstep - 1]) {
      if (window && (dstep < window.low || dstep > window.high)) continue;
      const degree = degreeOf(dstep, key);
      const pitch = pitchAt(dstep, key, { raiseSeventh: degree === 6 });
      const interval = (((pitch.midi - bottom(l0)) % 12) + 12) % 12;
      if ([1, 2, 6, 10, 11].includes(interval)) continue;                       // no clash with the bass
      if (degree === 6 && bottom(l0) % 12 === pitch.midi % 12) continue;           // no doubled leading note
      const up = Math.sign(top(r1) - pitch.midi), down = Math.sign(bottom(l1) - bottom(l0));
      if (up === down && interval === (((top(r1) - bottom(l1)) % 12) + 12) % 12) continue;
      if (priorR && priorR !== r0 && Math.abs(priorR.pitch.midi - pitch.midi) > 9) continue;
      r0.dstep = pitch.dstep;
      r0.pitch = pitch;
      r0.raiseSeventh = degree === 6;
      return;
    }
  }
  let best = null;
  for (let dstep = l0.dstep - 7; dstep <= l0.dstep + 7; dstep++) {
    const degree = degreeOf(dstep, key);
    // The root of V (5-1 bass), or its third — the leading note rising to the
    // tonic, contrary to the melody — when the tune isn't holding it too.
    if (degree !== 4 && degree !== 6) continue;
    if (leftHand.window && (dstep < leftHand.window.low || dstep > leftHand.window.high)) continue;   // stay in the hand's position
    const pitch = pitchAt(dstep, key, { raiseSeventh: degree === 6 });
    if (degree === 6 && (pitch.midi % 12 === top(r0) % 12 || dstep + 1 !== l1.dstep)) continue;
    if (Math.abs(pitch.midi - bottom(l1)) > 12 || pitch.midi >= top(r0) - 2 || parallel(pitch.midi)) continue;
    // The note it replaces sits between two neighbours: neither leap may break the short-note cap.
    // Within a five-finger position nothing moves the hand, so the cap is moot.
    const fixedHand = leftHand.window && leftHand.window.high - leftHand.window.low <= 4;
    const shortInto = (from, to) => !fixedHand && (from.dur <= beatDuration / 2 || to.dur <= beatDuration / 2);
    if (shortInto(l0, l1) && Math.abs(pitch.midi - bottom(l1)) > fastCap) continue;
    const beforeL0 = leftHand.slice(0, lastBar).flatMap((bar) => bar.events).filter((e) => !e.rest && e.pitch);
    const prior = beforeL0[beforeL0.length - 2];
    if (prior && shortInto(prior, l0) && Math.abs(pitch.midi - prior.pitch.midi) > fastCap) continue;
    const harsh = [1, 2, 6, 10, 11].includes((((top(r0) - pitch.midi) % 12) + 12) % 12);
    if (harsh) continue;
    // Prefer the root; take the leading note only when no root fits.
    const rank = (p) => (degreeOf(p.dstep, key) === 4 ? 0 : 100) + Math.abs(p.dstep - l0.dstep);
    if (!best || rank(pitch) < rank(best)) best = pitch;
  }
  if (!best) {
    // No bass note fits (a five-finger left hand often has neither): re-voice
    // the tune's approach instead — the mediant falling a third, or the
    // leading note rising — so the hands no longer move in octaves.
    if (r0.chord?.length) return;
    const window = rightHand.window;
    let tune = null;
    for (const dstep of [r1.dstep + 2, r1.dstep - 1]) {
      if (window && (dstep < window.low || dstep > window.high)) continue;
      const degree = degreeOf(dstep, key);
      const pitch = pitchAt(dstep, key, { raiseSeventh: degree === 6 });
      const interval = (((pitch.midi - bottom(l0)) % 12) + 12) % 12;
      if ([0, 1, 2, 6, 7, 10, 11].includes(interval)) continue;   // no new perfect interval, no clash
      const prior = rightHand.slice(0, lastBar).flatMap((bar) => bar.events).filter((e) => !e.rest && e.pitch).slice(-2)[0];
      if (prior && prior !== r0 && Math.abs(prior.pitch.midi - pitch.midi) > 12) continue;
      tune = pitch; break;
    }
    if (!tune) return;
    r0.dstep = tune.dstep;
    r0.pitch = tune;
    r0.raiseSeventh = degreeOf(tune.dstep, key) === 6;
    return;
  }
  l0.dstep = best.dstep;
  l0.pitch = best;
  l0.raiseSeventh = degreeOf(best.dstep, key) === 6;
}

/**
 * The final chord's bass belongs low. With the left hand centred around E3,
 * the closing tonic landed on G3 or above in 22-28% of tests — a cadence that
 * doesn't land. Drop the whole final bar an octave when its lowest note is
 * that high and the octave below stays in range, joins the previous bar by no
 * more than an octave, and keeps any chord open below C3 (a fifth or wider).
 */
/** Widest leap (semitones) between short notes, by grade — same caps the pitch walk uses. */
function fastLeapCap(grade) { return grade <= 4 ? 5 : grade <= 6 ? 7 : 9; }

function lowerFinalBass(bars, minMidi, fastCap = 12, beatDuration = Infinity) {
  const last = bars[bars.length - 1];
  const sounding = last.events.filter((event) => !event.rest && event.pitch);
  if (!sounding.length) return;
  const midis = (event) => [event.pitch.midi, ...(event.chord ?? []).map((note) => note.midi)];
  const all = sounding.flatMap(midis);
  if (Math.min(...sounding.map((event) => event.pitch.midi)) < 55 || Math.min(...all) - 12 < minMidi) return;
  const before = bars.slice(0, -1).flatMap((bar) => bar.events).filter((event) => !event.rest && event.pitch).pop();
  const leap = before ? Math.abs(before.pitch.midi - (sounding[0].pitch.midi - 12)) : 0;
  if (leap > 12) return;
  // Between short notes the hand has no time to travel: keep the grade's cap.
  if (before && (before.dur <= beatDuration / 2 || sounding[0].dur <= beatDuration / 2) && leap > fastCap) return;
  for (const event of sounding) {
    const lowered = midis(event).map((midi) => midi - 12).sort((a, b) => a - b);
    if (lowered.length > 1 && lowered[0] < 48 && lowered[1] - lowered[0] < 7) return;
  }
  const down = (pitch) => ({ ...pitch, octave: pitch.octave - 1, dstep: pitch.dstep - 7, midi: pitch.midi - 12 });
  for (const event of sounding) {
    event.dstep -= 7;
    event.pitch = down(event.pitch);
    if (event.chord) event.chord = event.chord.map(down);
  }
}

/** One note lasting `dur` divisions (24 = crotchet), or null if no single note value fits (e.g. 5/4). */
function noteOfDuration(dur, gradeRules) {
  const types = new Set(gradeRules.rhythm.noteValues), dotted = new Set(gradeRules.rhythm.dottedValues ?? []);
  for (const [type, base] of [['whole', 96], ['half', 48], ['quarter', 24], ['eighth', 12]]) {
    if (dur === base && types.has(type)) return { type, dur, dots: 0, rest: false };
    if (dur === base * 1.5 && types.has(type) && dotted.has(type)) return { type, dur, dots: 1, rest: false };
  }
  return null;   // the grade can't print one note this long: leave the bar to the redraw
}

/** Pick a window start, weighted toward `center` (dstep of the window's middle) when given. */
function pickNear(rng, starts, span, center) {
  if (center === null || center === undefined) return rng.pick(starts);
  return rng.weighted(starts.map((start) => ({ start, weight: Math.exp(-((start + span / 2 - center) ** 2) / 18) }))).start;
}

function tessituraWindow(rng, key, low, high, span, above = null, center = null) {
  if (high - low <= span) return { low, high };
  const starts = [];
  for (let dstep = low; dstep + span <= high; dstep++) {
    const hasTonic = Array.from({ length: span + 1 })
      .some((_, step) => degreeOf(dstep + step, key) === 0);
    if (hasTonic) starts.push(dstep);
  }
  if (!starts.length) return { low, high };
  const start = pickNear(rng, reachableFrom(starts, above), span, center);
  return { low: start, high: start + span };
}

/**
 * Keep a hand's working range within reach of the one already written, so the
 * texture holds together instead of leaving a hole in the middle. A little
 * overlap below is allowed — the hands share the middle of the keyboard — and
 * about an octave and a half above is as far as the upper hand should sit.
 */
function reachableFrom(starts, above) {
  if (above === null) return starts;
  const near = starts.filter((dstep) => dstep >= above - 2 && dstep <= above + 8);
  return near.length ? near : starts;
}

/**
 * Choose a five-note window, preferring one that starts on the tonic.
 * The window must contain the tonic somewhere, or the test could not cadence
 * on it — a five-note span starting on the 2nd or 3rd degree has no tonic.
 */
function fiveFingerWindow(rng, key, low, high, above = null, center = null) {
  const all = [];
  for (let dstep = low; dstep + 4 <= high; dstep++) {
    const hasTonic = [0, 1, 2, 3, 4].some((step) => degreeOf(dstep + step, key) === 0);
    if (hasTonic) all.push(dstep);
  }
  if (!all.length) return { low, high };
  const starts = reachableFrom(all, above);
  const tonicStarts = starts.filter((dstep) => degreeOf(dstep, key) === 0);
  const start = tonicStarts.length && rng.chance(0.7) ? pickNear(rng, tonicStarts, 4, center) : pickNear(rng, starts, 4, center);
  return { low: start, high: start + 4 };
}

/** Which bars each hand sits out, when the hands alternate (Grade 1). */
function splitBarsBetweenHands(barCount, rng) {
  const split = Math.ceil(barCount / 2);
  const leadWithRight = rng.chance(0.7);
  const rightHand = new Set();
  const leftHand = new Set();

  for (let barIndex = 0; barIndex < barCount; barIndex++) {
    const rightPlays = leadWithRight ? barIndex < split : barIndex >= split;
    (rightPlays ? leftHand : rightHand).add(barIndex);
  }
  return { rightHand, leftHand };
}

/** Whether a tempo/character word is compatible with the metre (dance names imply one). */
function termFitsMetre(term, metre) {
  if (/waltz|valse|minuet|minuetto/i.test(term)) return metre === '3/4' || metre === '3/8';
  if (/march|marcia/i.test(term)) return ['2/4', '4/4', '2/2', '6/8'].includes(metre);
  if (/gigue/i.test(term)) return ['6/8', '9/8', '12/8'].includes(metre);
  if (/tango/i.test(term)) return ['2/4', '4/4'].includes(metre);
  return true;
}

/** How a tempo/character word sounds: 'cantabile' (singing, slow), 'lively', or 'neutral'. */
const CANTABILE_WORDS = /adagio|largo|lento|grave|cantabile|espressivo|sostenuto|tranquillo|dolce|mesto|sadly|gently|smoothly|tenderly|lullaby|flowing|slowly|valse lente/i;
const LIVELY_WORDS = /leggiero|scherzando|giocoso|vivace|presto|playfully|sprightly|staccato|capriccioso|ritmico|rhythmically|march|marcia|brio|happily|lively/i;
export function tempoCharacter(term, bpm) {
  if (CANTABILE_WORDS.test(term) || bpm <= 76) return 'cantabile';
  if (LIVELY_WORDS.test(term) || bpm >= 116) return 'lively';
  return 'neutral';
}

/** Dynamics, wedges, slurs and staccato, within what the grade allows. */
function applyExpression(rng, rules, score) {
  // Hang expression marks off whichever staff actually sounds in bar 1 —
  // at Grade 1 the right hand may be resting there.
  const sounds = (staffNumber, barIndex) =>
    score.staves[staffNumber][barIndex].events.some((event) => !event.rest);
  const bars = sounds(1, 0) ? score.staves[1] : score.staves[2];

  const opening = rng.pick(rules.dynamics.filter((d) => d !== 'ff' && d !== 'fff'));
  bars[0].directions.push({ kind: 'dynamics', value: opening });

  if (score.barCount >= 4 && rng.chance(0.45)) {
    const wedge = rng.pick(
      rules.dynamicFeatures.filter((f) => f === 'crescendo' || f === 'diminuendo'),
    );
    if (wedge) {
      const start = Math.floor(score.barCount / 2) - 1;
      bars[start].directions.push({ kind: 'wedge', value: wedge, type: 'start' });
      bars[Math.min(start + 1, score.barCount - 1)].directions.push({ kind: 'wedge', type: 'stop' });
      const target = wedge === 'crescendo'
        ? louderThan(rules.dynamics, opening, rng)
        : softerThan(rules.dynamics, opening, rng);
      if (target) {
        bars[Math.min(start + 2, score.barCount - 1)].directions.push({ kind: 'dynamics', value: target });
      }
    }
  }

  const canSlur = rules.articulations.includes('slur');
  const canStaccato = rules.articulations.includes('staccato');
  const canTenuto = rules.articulations.includes('tenuto');
  const canAccent = rules.articulations.includes('accent');
  const canStaccatissimo = rules.articulations.includes('staccatissimo');
  // The rules table calls this "marcato"; MusicXML (and the playback engine
  // that reads `event.articulations` straight through as tag names) calls
  // the same mark `<strong-accent/>`, so that's the string written here.
  const canMarcato = rules.articulations.includes('marcato');

  /*
   * Articulation is a decision about the whole piece, not a coin flip per
   * bar-pair per hand. A real test is either mostly legato (the tune slurred
   * in phrases) or has a detached section, and the two hands agree on it: one
   * hand carries the staccato while the other stays plain or slurred. Rolling
   * every pair independently printed slurs, dots, tenuto and accents side by
   * side in neighbouring bars, which no examiner writes.
   */
  const marksOf = (events) => events.filter((event) => !event.rest);
  const unbrokenRun = (events) => {
    const first = events.findIndex((event) => !event.rest);
    if (first === -1) return false;
    const last = events.length - 1 - [...events].reverse().findIndex((event) => !event.rest);
    return events.slice(first, last + 1).every((event) => !event.rest);
  };
  // Phrase length in bars: two-bar groups in short tests, four-bar once there is room.
  const phraseBars = score.barCount >= 8 ? 4 : 2;
  const slurredBars = new Set();
  const addSlurs = (staffNumber, chance) => {
    const staff = score.staves[staffNumber];
    // Decided once for the hand: a phrase slurred in the antecedent is slurred
    // when the consequent brings it back.
    if (!rng.chance(chance)) return;
    for (let barIndex = 0; barIndex < staff.length; barIndex += phraseBars) {
      const span = staff.slice(barIndex, barIndex + phraseBars);
      const events = span.flatMap((bar) => bar.events);
      const sounding = marksOf(events);
      if (sounding.length < 3 || !unbrokenRun(events)) continue;
      // A slur from a note into the same pitch reads as a tie: start after it.
      const same = (a, b) => a?.pitch && b?.pitch && a.pitch.midi === b.pitch.midi;
      while (sounding.length >= 3 && same(sounding[0], sounding[1])) sounding.shift();
      while (sounding.length >= 3 && same(sounding[sounding.length - 1], sounding[sounding.length - 2])) sounding.pop();
      if (sounding.length < 3 || same(sounding[0], sounding[1])) continue;
      sounding[0].slur = 'start';
      sounding[sounding.length - 1].slur = 'stop';
      // Concurrent slurs in one part must not share a number, or the renderer
      // pairs a right-hand start with a left-hand stop.
      sounding[0].slurNumber = staffNumber;
      sounding[sounding.length - 1].slurNumber = staffNumber;
      for (let i = 0; i < span.length; i++) slurredBars.add(`${staffNumber}:${barIndex + i}`);
    }
  };
  const addRun = (staffNumber, mark, firstBar, lastBar, types) => {
    for (let barIndex = firstBar; barIndex <= lastBar; barIndex++) {
      if (slurredBars.has(`${staffNumber}:${barIndex}`)) continue;
      const eligible = marksOf(score.staves[staffNumber][barIndex]?.events ?? [])
        .filter((event) => types.includes(event.type) && !event.slur && !event.dots);
      if (eligible.length < 2) continue;   // a lone dot in a plain bar reads as a stray mark
      for (const event of marksOf(score.staves[staffNumber][barIndex]?.events ?? [])) {
        // Never on a dotted value: a dot of length and a dot of detachment on
        // one note contradict each other at sight.
        if (types.includes(event.type) && !event.slur && !event.dots) {
          event.articulations = [...(event.articulations ?? []), mark];
        }
      }
    }
  };

  /*
   * The tempo/character word decides how detached the piece may be. A
   * singing or slow term (Adagio, Sadly, Lullaby, Cantabile…) is legato or
   * plain — staccato under it contradicts the heading (35-50% of such tests
   * carried it when style was a pure weighted roll). A lively term keeps the
   * old freedom; anything in between gets staccato for one phrase at most.
   */
  const character = tempoCharacter(score.tempoTerm, score.tempoBpm);
  const style = rng.weighted([
    { value: 'legato', weight: canSlur ? 5 : 0 },
    { value: 'detached', weight: canStaccato && character !== 'cantabile' ? 2 : 0 },
    { value: 'mixed', weight: canSlur && canStaccato && character !== 'cantabile' ? 3 : 0 },
    { value: 'plain', weight: 1.5 },
  ]).value;

  const lastBar = score.barCount - 1;
  const lastPhraseStart = Math.max(0, Math.floor(score.barCount / phraseBars) - 1) * phraseBars;
  const detachedHand = rng.chance(0.55) ? 1 : 2;
  if (style === 'legato') {
    addSlurs(1, 0.85);
    addSlurs(2, 0.3);
  } else if (style === 'detached') {
    // The detached hand is dotted for a whole phrase; the other stays plain.
    const from = rng.chance(0.5) ? 0 : lastPhraseStart;
    addRun(detachedHand, 'staccato', from, Math.min(lastBar - 1, from + phraseBars - 1), ['quarter', 'eighth']);
  } else if (style === 'mixed') {
    // Tune slurred, accompaniment detached (or the reverse) — the classic
    // piano texture, with both hands marked consistently across the piece.
    addSlurs(detachedHand === 1 ? 2 : 1, 0.85);
    // A whole-piece staccato hand only for a lively right hand; a detached
    // accompaniment is one phrase (dotting every left-hand note for the whole
    // test reads as a mechanism, not a phrase), never the final bar.
    if (detachedHand === 1 && character === 'lively') addRun(1, 'staccato', 0, lastBar - 1, ['quarter', 'eighth']);
    else {
      const from = rng.chance(0.5) ? 0 : lastPhraseStart;
      addRun(detachedHand, 'staccato', from, Math.min(lastBar - 1, from + phraseBars - 1), ['quarter', 'eighth']);
    }
  }

  /*
   * A bar that comes back keeps its articulation: if the antecedent's opening
   * was detached, so is the consequent's, and the other way round. Copied note
   * for note where the rhythm is the same and neither bar sits under a slur.
   */
  for (const staffNumber of [1, 2]) {
    const staff = score.staves[staffNumber];
    staff.forEach((bar, barIndex) => {
      const sourceIndex = bar.formSource;
      if (sourceIndex === null || sourceIndex === undefined || barIndex === lastBar) return;
      const source = staff[sourceIndex];
      if (slurredBars.has(`${staffNumber}:${barIndex}`) || slurredBars.has(`${staffNumber}:${sourceIndex}`)) return;
      if (source.events.length !== bar.events.length
        || source.events.some((event, i) => event.dur !== bar.events[i].dur || !event.rest !== !bar.events[i].rest)) return;
      const dotted = (event) => (event.articulations ?? []).includes('staccato');
      const either = bar.events.some((event, i) => dotted(event) || dotted(source.events[i]));
      if (!either) return;
      bar.events.forEach((event, i) => {
        for (const target of [event, source.events[i]]) {
          if (target.rest || target.dots || target.slur || dotted(target)) continue;
          if (dotted(event) || dotted(source.events[i])) target.articulations = [...(target.articulations ?? []), 'staccato'];
        }
      });
    });
  }

  // Single marks: at most one of each per piece, on a phrase's opening note.
  const lone = [];
  if (canTenuto && style !== 'detached' && rng.chance(0.2)) lone.push('tenuto');
  if (canAccent && rng.chance(0.25)) lone.push('accent');
  if (canStaccatissimo && rng.chance(0.15)) lone.push('staccatissimo');
  if (canMarcato && rng.chance(0.15)) lone.push('strong-accent');
  for (const mark of lone.slice(0, 1)) {
    const barIndex = rng.chance(0.5) ? 0 : Math.min(lastPhraseStart, lastBar - 1);
    const target = marksOf(score.staves[1][barIndex]?.events ?? [])[0];
    if (target && !target.slur && !(target.articulations ?? []).length) target.articulations = [mark];
  }

  if (rules.otherFeatures.some((feature) => feature.includes('rall'))) {
    if (rng.chance(0.5)) {
      score.staves[1][score.barCount - 2]?.directions.push({ kind: 'words', value: 'rall.' });
    }
  }

  // Grade 5's otherFeatures happen to be written in English ('sustaining
  // pedal markings') where grade 6-8's are in Chinese ('踏板') — match both,
  // or grade 5 (which already documents wanting it) would silently never get one.
  if (rules.otherFeatures.some((feature) => feature.includes('踏板') || /pedal/i.test(feature))) {
    addPedalMarking(rng, score);
  }

  // Real Grade 6-8 specimens pull the tempo around mid-piece (rit. ... a
  // tempo), not just at the final cadence the way lower grades' rall. does.
  if (rules.grade >= 6 && rng.chance(0.4)) {
    addMidPieceTempoChange(rng, score);
  }

  if (rules.grade >= 7) {
    addOrnaments(rng, score);
  }

  // Grade 6's otherFeatures describe either hand ('偶爾出現短暫換譜號'), Grade
  // 7's specifically the left hand going up ('左手上行進入高音譜號') — both are
  // the same underlying mechanism (a hand sitting persistently in the other
  // staff's comfortable register), so one gate covers both wordings.
  if (rules.otherFeatures.some((feature) => feature.includes('換譜號') || feature.includes('譜號變換'))) {
    addClefChanges(score);
  }

  // Modulation runs before the chromatic group, and the two are made
  // mutually exclusive on one test (see addModulation's doc comment) —
  // addChromaticGroup reads score.key directly, and a candidate landing
  // in an already-modulated span would be spelled against the wrong key.
  let modulated = false;
  if (rules.otherFeatures.some((feature) => feature.includes('轉調') || /modulat/i.test(feature))) {
    modulated = addModulation(rng, rules, score);
  }

  if (!modulated && rules.otherFeatures.some((feature) => feature.includes('半音音群') || /chromatic/i.test(feature))) {
    addChromaticGroup(rng, score);
  }

  // Runs last so it sees final pitches (post-modulation) and the final bar
  // layout (post-chromatic-group) — it only reads MIDI values and sets a
  // flag, so it doesn't need excluding from either of those.
  if (rules.otherFeatures.some((feature) => feature.includes('跨譜表'))) {
    addCrossStaffWriting(rng, score);
  }
}

/**
 * Grade 8's declared "半音音群" (chromatic note group): a brief chromatic
 * scalar run filling a melodic third, e.g. C-C#-D-D#-E in place of a plain
 * leap from C to E. Decorative and melody-only, the same precedent
 * `addOrnaments`' grace notes set (not clash-checked against the other
 * hand — a passing chromatic figure is not a harmony event).
 *
 * Only a *major* third (4 semitones) whose passed-through diatonic degree
 * splits it into two clean whole tones is filled — this is deliberately
 * conservative rather than attempting every possible third: a minor third
 * (3 semitones) doesn't divide evenly into equal chromatic steps without a
 * triplet, and an uneven diatonic split (e.g. a semitone plus a tone, which
 * happens near some scale degrees) would place the middle passing note
 * off the exact chromatic midpoint. Filtering to the clean case rather than
 * forcing the uneven ones keeps every note built from `pitchAt` — its
 * `chromaticAlter` raises/lowers a real diatonic degree by a semitone, so
 * the spelling is always the *next* scale degree's accidental (C#, D#),
 * never a stacked double-sharp on one letter.
 */
function addChromaticGroup(rng, score) {
  const key = createKey(score.key);
  const bars = score.staves[1];

  const flat = [];
  bars.forEach((bar, barIndex) => {
    let offset = 0;
    bar.events.forEach((event, eventIndex) => {
      if (!event.rest && event.pitch) flat.push({ bar, barIndex, eventIndex, event, offset });
      offset += event.dur;
    });
  });
  if (flat.length < 4) return;

  /*
   * What the left hand is holding while the group would sound. This pass used
   * to skip the cross-hand check entirely, on the precedent set by the grace
   * notes in `addOrnaments` — "a passing chromatic figure is not a harmony
   * event". That precedent does not carry: an acciaccatura is over in an
   * instant, while these are four real 16ths, and raising a letter the other
   * hand is sounding *naturally* at that moment is a false relation — F
   * against F# — which is precisely the error `harmoniseLeadingNotes` exists
   * to prevent elsewhere in the texture. It was the dominant cause of the
   * cross-hand semitone clashes the false-relation test kept turning up at
   * Grade 8, and at no other grade, because no other grade writes these.
   */
  const against = soundingTimeline(score.staves[2], score.barDuration);
  const clashesWithLeft = (midi, start, duration) => against.some((entry) => (
    entry.start < start + duration && entry.end > start
    && entry.midis.some((other) => {
      const interval = Math.abs(midi - other) % 12;
      return interval === 1 || interval === 11;
    })
  ));

  const candidates = [];
  for (let i = 1; i < flat.length - 2; i++) {
    const a = flat[i];
    const b = flat[i + 1];
    // Plain (undotted) quarter only — a dotted quarter's duration is 1.5x
    // and doesn't quarter evenly into four true 16ths (caught as a real
    // failure: `dur/4` on a dotted quarter produced a 16th 1.5x too long).
    if (a.event.type !== 'quarter' || a.event.dots) continue;
    // Must start on a clean beat boundary, or the four inserted 16ths
    // straddle two beats and `computeBeams` correctly refuses to beam them
    // together — caught as a real "beam crosses a beat boundary" failure,
    // from a quarter note that started off-beat (e.g. after a pickup rest).
    if (a.offset % a.bar.beatDuration !== 0) continue;
    // A plain note only — not already decorated, slurred, or chorded, so
    // there is nothing else on this event that a four-way split would orphan.
    if (a.event.slur || a.event.grace || a.event.chord || (a.event.articulations?.length)) continue;
    const semitones = b.event.pitch.midi - a.event.pitch.midi;
    if (Math.abs(semitones) !== 4) continue;
    const direction = Math.sign(semitones);
    const midStep = a.event.dstep + direction;
    const midNatural = pitchAt(midStep, key);
    if (midNatural.midi !== a.event.pitch.midi + 2 * direction) continue;
    // The two chromatic passing tones raise/lower `a`'s own letter and
    // `midStep`'s letter by `direction`. If the key signature already
    // alters either letter the same way (e.g. F# in a sharp key), applying
    // `direction` again writes a double sharp/flat instead of the intended
    // single accidental — skip rather than write that.
    const letterA = ((a.event.dstep % 7) + 7) % 7;
    const letterMid = ((midStep % 7) + 7) % 7;
    if (key.alters[letterA] === direction || key.alters[letterMid] === direction) continue;
    // Every note of the group has to clear the left hand for its own slice of
    // the beat, not just the note the group replaces.
    const groupPitches = [
      a.event.pitch,
      pitchAt(a.event.dstep, key, { chromaticAlter: direction }),
      midNatural,
      pitchAt(midStep, key, { chromaticAlter: direction }),
    ];
    const sixteenthDur = a.event.dur / 4;
    const groupStart = a.barIndex * score.barDuration + a.offset;
    if (groupPitches.some((pitch, step) => (
      clashesWithLeft(pitch.midi, groupStart + step * sixteenthDur, sixteenthDur)
    ))) continue;
    candidates.push({ ...a, direction, midStep, midNatural });
  }
  if (!candidates.length) return;

  const { bar, eventIndex, event, direction, midStep, midNatural } = rng.pick(candidates);
  const sixteenth = event.dur / 4;
  const pitches = [
    event.pitch,
    pitchAt(event.dstep, key, { chromaticAlter: direction }),
    midNatural,
    pitchAt(midStep, key, { chromaticAlter: direction }),
  ];
  const group = pitches.map((pitch) => ({
    type: '16th', dur: sixteenth, dots: 0, rest: false, pitch, dstep: pitch.dstep,
    // Matches how every other pitch-assignment path tags this (melody.js) —
    // a same-dstep repeat elsewhere in the piece is checked against it, and
    // an unset field there reads as a disagreement even when the two notes
    // are otherwise identical.
    raiseSeventh: degreeOf(pitch.dstep, key) === 6,
  }));
  bar.events.splice(eventIndex, 1, ...group);
}

/**
 * Grade 8's declared "曲中轉調" (mid-piece modulation): the consequent
 * phrase (from the period's half cadence onward, `halfCadenceBar` — the
 * same split point the period structure already uses) moves to the
 * dominant major key for the rest of the piece.
 *
 * This does not generate a second phrase in a second key — the whole piece
 * is built once, in one key, by the ordinary unmodified pipeline, and this
 * rigidly transposes an already-fully-validated span (+4 diatonic steps, a
 * perfect fifth) rather than re-deriving it. That is what makes it safe:
 * transposition does not change any note's relationship to any other note
 * (interval to the other hand, position in its own chord, distance from a
 * neighbour), only its absolute level and notated spelling — so every
 * invariant already checked for this span (no clash, no parallel motion,
 * cadence shape) still holds afterwards for free. `progression`'s roman
 * numerals need no change either, since they are already key-relative: a
 * transposed ii-V-I reads as ii-V-I in the new key exactly as it did in the
 * old one.
 *
 * Scope is deliberately narrow for a first real implementation: major-key
 * pieces only (a minor piece's most natural modulation, to the relative
 * major, shares the outgoing key's signature and so would print no visible
 * change — a weaker fit for a sight-reading feature about *reading* a key
 * change), and only when there is a real period structure with room to
 * modulate into (`halfCadenceBar` non-null, plus at least two bars left
 * after the pivot for a real cadence in the new key).
 */
function addModulation(rng, rules, score) {
  if (score.key.mode !== 'major') return false;
  if (!rng.chance(0.35)) return false;

  const startBar = halfCadenceBar(score.barCount);
  if (startBar === null) return false;
  const pivotBar = startBar + 1;
  if (pivotBar > score.barCount - 3) return false;

  const originalKey = createKey(score.key);
  const newFifths = originalKey.fifths + 1;
  if (Math.abs(newFifths) > 6) return false; // stay within a printable key signature
  // The new tonic's *letter* doesn't depend on which key spells it (a fifth
  // above is always 4 letters up), but its accidental does — spelling it
  // via the original key's own alteration for that degree (e.g. Gb major's
  // dominant is Db, not D) matches how every other key.tonic in this
  // codebase is written ("F#", "Bb", never a bare letter that needs one).
  const dominantInOriginalKey = pitchAt(originalKey.tonicLetter + 4, originalKey);
  const newTonic = dominantInOriginalKey.step
    + (dominantInOriginalKey.alter === 1 ? '#' : dominantInOriginalKey.alter === -1 ? 'b' : '');
  const newKey = createKey({ tonic: newTonic, mode: 'major', fifths: newFifths });

  const transposePitch = (pitch) => pitchAt(pitch.dstep + 4, newKey);

  // A transposed note can walk past the grade's declared range even though
  // the untransposed original never did — checked before touching anything,
  // since this is a dry run over the same events the mutation pass below
  // would otherwise commit regardless.
  for (const hand of ['rightHand', 'leftHand']) {
    const staffNumber = hand === 'rightHand' ? 1 : 2;
    const { minMidi, maxMidi } = rules.range[hand];
    for (let barIndex = pivotBar; barIndex < score.barCount; barIndex++) {
      for (const event of score.staves[staffNumber][barIndex].events) {
        if (event.rest || !event.pitch) continue;
        const midi = transposePitch(event.pitch).midi;
        if (midi < minMidi || midi > maxMidi) return false;
        // Up a fifth must not lift the bass out of the bass register.
        if (hand === 'leftHand' && midi > 64) return false;
      }
    }
  }

  for (const staffNumber of [1, 2]) {
    for (let barIndex = pivotBar; barIndex < score.barCount; barIndex++) {
      for (const event of score.staves[staffNumber][barIndex].events) {
        if (event.grace) event.grace.pitch = transposePitch(event.grace.pitch);
        if (event.rest || !event.pitch) continue;
        event.pitch = transposePitch(event.pitch);
        event.dstep = event.pitch.dstep;
        event.raiseSeventh = false; // major key throughout — no harmonic-minor 7th to raise
        if (event.chord) event.chord = event.chord.map(transposePitch);
      }
    }
  }

  // A key-signature change is part-wide (one <key> for both staves), unlike
  // a clef change — stored at the score level rather than per-staff bar.
  score.keyChange = { barIndex: pivotBar, fifths: newFifths, mode: 'major', tonic: newKey.tonic };
  return true;
}

/**
 * Grade 8's declared "跨譜表寫作" (cross-staff writing): a single note that
 * already sits in the *other* staff's comfortable register gets printed on
 * that staff instead of stacking ledger lines — the same underlying idea
 * as `addClefChanges` (Grade 6/7), but for a reach too brief (one isolated
 * note, not a multi-bar span) to justify changing the whole staff's clef.
 * The two features don't overlap in practice: `addClefChanges` only runs
 * for Grade 6/7, this only for Grade 8.
 *
 * `musicxml.js` renders a marked event with `<staff>` set to the *other*
 * staff and a voice number reserved for crossed notes, so it visually
 * lands on the target staff without disturbing either staff's own
 * duration bookkeeping (`<staff>`/`<voice>` are pure placement metadata —
 * they don't affect the `<backup>` timing math at all).
 */
function addCrossStaffWriting(rng, score) {
  const timelines = {
    1: soundingTimeline(score.staves[1], score.barDuration),
    2: soundingTimeline(score.staves[2], score.barDuration),
  };
  const candidates = [];

  for (const staffNumber of [1, 2]) {
    const otherStaff = staffNumber === 1 ? 2 : 1;
    const flat = [];
    score.staves[staffNumber].forEach((bar, barIndex) => {
      let offset = 0;
      bar.events.forEach((event, eventIndex) => {
        const start = barIndex * score.barDuration + offset;
        offset += event.dur;
        if (!event.rest && event.pitch) flat.push({ bar, eventIndex, event, start });
      });
    });

    for (let i = 1; i < flat.length - 1; i++) {
      const { bar, eventIndex, event, start } = flat[i];
      // A plain, undecorated single note only — nothing else on it that
      // crossing staves would orphan or misplace. Restricted to note values
      // that are never beamed (quarter or longer) — a beamed eighth/16th
      // crossed alone would leave its beam reaching across to a staff its
      // beam partners never moved to.
      if (event.chord || event.grace || event.slur || (event.articulations?.length)) continue;
      if (['eighth', '16th', '32nd', '64th'].includes(event.type)) continue;
      const extreme = staffNumber === 1 ? event.pitch.midi <= 55 : event.pitch.midi >= 62;
      if (!extreme) continue;
      // Isolated, not sustained: the notes immediately either side of it in
      // the *same* hand stay in that hand's own normal register — a whole
      // extreme span is what `addClefChanges` is for, not this.
      const prevExtreme = staffNumber === 1 ? flat[i - 1].event.pitch.midi <= 55 : flat[i - 1].event.pitch.midi >= 62;
      const nextExtreme = staffNumber === 1 ? flat[i + 1].event.pitch.midi <= 55 : flat[i + 1].event.pitch.midi >= 62;
      if (prevExtreme || nextExtreme) continue;
      // Clear of whatever the target staff is actually sounding at that
      // instant — the whole point of crossing there is that it is free.
      const clash = timelines[otherStaff].some((entry) => (
        entry.start < start + event.dur && entry.end > start
        && entry.midis.some((midi) => Math.abs(midi - event.pitch.midi) <= 2)
      ));
      if (clash) continue;
      candidates.push({ bar, eventIndex, event, targetStaff: otherStaff });
    }
  }
  if (!candidates.length) return;

  const { event, targetStaff } = rng.pick(candidates);
  event.crossStaff = targetStaff;
}

const HOME_CLEF = { 1: { sign: 'G', line: 2 }, 2: { sign: 'F', line: 4 } };
const AWAY_CLEF = { 1: { sign: 'F', line: 4 }, 2: { sign: 'G', line: 2 } };

/**
 * A hand's line occasionally sits persistently in the *other* staff's
 * comfortable register — the left hand's contour reaching toward the top of
 * its window, or the right hand's toward the bottom of its own. Real
 * engraving switches that staff's clef for the span rather than stacking
 * ledger lines. This is a pure rendering decision keyed off pitches the
 * ordinary window/arch machinery already produced (`buildStaff`, untouched
 * here) — not a forced detour into the other register — which is exactly
 * why it reads as "occasionally": it only fires where a hand's own window
 * for this particular test already happens to sit high (or low) enough that
 * a multi-bar span of it crosses the threshold on its own.
 */
function addClefChanges(score) {
  for (const staffNumber of [1, 2]) {
    const bars = score.staves[staffNumber];
    const qualifies = (bar) => {
      // A stacked chord (melody.js's `stackChordTones`) lives in `event.chord`
      // on the same event, not as separate `bar.events` entries — missing it
      // here would let a bar qualify on its melody note alone while a chord
      // tone stacked underneath sits well outside the target clef's comfort
      // zone, which is exactly the kind of unreadable notation this feature
      // exists to avoid, not produce.
      const midis = [];
      for (const event of bar.events) {
        if (event.rest || !event.pitch) continue;
        midis.push(event.pitch.midi);
        for (const chordPitch of event.chord ?? []) midis.push(chordPitch.midi);
      }
      if (!midis.length) return false;
      return staffNumber === 1
        ? midis.every((midi) => midi <= 58) // Bb3 or below: bass clef territory
        : midis.every((midi) => midi >= 59); // B3 or above: treble clef territory
    };

    // The longest qualifying contiguous span, excluding the very first and
    // last bar — a change right at the opening or the closing cadence reads
    // as odd, and the final bar's pitch is pinned by `endOnTonic` regardless.
    let bestStart = -1;
    let bestLen = 0;
    let runStart = -1;
    for (let i = 1; i < bars.length - 1; i++) {
      if (qualifies(bars[i])) {
        if (runStart === -1) runStart = i;
        const len = i - runStart + 1;
        if (len > bestLen) {
          bestLen = len;
          bestStart = runStart;
        }
      } else {
        runStart = -1;
      }
    }

    // More than four bars stops reading as "occasionally reaches over" and
    // starts reading as "this piece changed clef" — left alone rather than
    // forced past that point.
    if (bestLen < 1 || bestLen > 4) continue;

    bars[bestStart].clefChange = AWAY_CLEF[staffNumber];
    const after = bestStart + bestLen;
    if (after < bars.length) bars[after].clefChange = HOME_CLEF[staffNumber];
  }
}

/**
 * A sustain-pedal span over a legato passage, shown under the bass staff
 * (real engraving convention) rather than tied to any one hand's notes).
 * Holding one continuous pedal across a span used to ignore the harmony
 * changing underneath it entirely — with one chord per bar and the
 * progression essentially never repeating a chord bar-to-bar, a plain
 * start/stop pair could smear three or four unrelated harmonies together,
 * something no real pedalling would do. A real legato pedal instead lifts
 * and immediately redepresses at every harmony change — MusicXML's
 * `<pedal type="change"/>` is exactly that notch — so this now walks the
 * span and drops one wherever the chord actually changes, including
 * *inside* a bar that itself splits into two chords (`buildProgression`'s
 * `twoChordBarChance`), only using a plain `stop` at the very end.
 */
function addPedalMarking(rng, score) {
  if (score.barCount < 3) return;
  /*
   * Pedal belongs to legato writing: a staccato dot under a held pedal is a
   * contradiction (the pedal sustains exactly what the dot asks to be cut
   * short). Only a stretch where neither hand is detached is pedalled — a
   * few tries, and none at all when the whole test is detached.
   */
  const detached = (bar) => [1, 2].some((staff) => score.staves[staff][bar].events.some((event) =>
    (event.articulations ?? []).some((mark) => mark === 'staccato' || mark === 'staccatissimo')));
  let start = -1;
  let end = -1;
  for (let attempt = 0; attempt < 8 && start < 0; attempt++) {
    const span = Math.min(rng.int(2, 4), score.barCount - 1);
    const from = rng.int(0, score.barCount - 1 - span);
    let clear = true;
    for (let bar = from; bar < from + span; bar++) if (detached(bar)) clear = false;
    if (clear) { start = from; end = from + span; }
  }
  if (start < 0) return;
  const bass = score.staves[2];

  bass[start].directions.push({ kind: 'pedal', type: 'start' });
  addMidBarPedalChange(bass[start], score.progression[start], score.barDuration);

  for (let bar = start + 1; bar < end; bar++) {
    if (firstChord(score.progression[bar]) !== lastChord(score.progression[bar - 1])) {
      bass[bar].directions.push({ kind: 'pedal', type: 'change' });
    }
    addMidBarPedalChange(bass[bar], score.progression[bar], score.barDuration);
  }

  bass[end].directions.push({ kind: 'pedal', type: 'stop' });
}

/**
 * A split bar's own harmony turns over partway through it — drop the
 * change notch at the first note starting in the second half, the same
 * point `chordAt` (harmony.js) hands that half its own chord tones. If
 * nothing starts there (a single note sustained through the whole bar),
 * there is no attack to anchor a change to, so none is added.
 */
function addMidBarPedalChange(bar, entry, barDuration) {
  if (!Array.isArray(entry)) return;
  let offset = 0;
  for (let index = 0; index < bar.events.length; index++) {
    if (offset >= splitPoint(barDuration, bar.beatDuration)) {
      bar.directions.push({ kind: 'pedal', type: 'change', atEventIndex: index });
      return;
    }
    offset += bar.events[index].dur;
  }
}

/**
 * A temporary tempo pull mid-piece (rit. then a tempo a bar or two later),
 * not just the single final rall. lower grades get — real Grade 6-8
 * specimens fluctuate tempo within the piece itself.
 */
function addMidPieceTempoChange(rng, score) {
  if (score.barCount < 6) return;
  const around = Math.floor(score.barCount * 0.5) + rng.int(-1, 1);
  const bar = Math.max(1, Math.min(score.barCount - 3, around));
  score.staves[1][bar]?.directions.push({ kind: 'words', value: 'rit.' });
  score.staves[1][bar + 1]?.directions.push({ kind: 'words', value: 'a tempo' });
}

/**
 * A short acciaccatura (crushed grace note, a step above or below) into one
 * or two melody notes — the rules table already listed ornaments as a
 * Grade 7+ feature with no generation logic behind it.
 */
function addOrnaments(rng, score) {
  const notes = score.staves[1].flatMap((bar) => bar.events.filter((event) => !event.rest));
  if (notes.length < 4) return;

  const key = createKey(score.key);
  const candidates = notes.slice(1, -1).filter((event) => event.type === 'quarter' || event.type === 'eighth');
  if (!candidates.length) return;

  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const count = Math.min(shuffled.length, rng.int(1, 2));
  let added = 0;
  for (const event of shuffled) {
    if (added >= count) break;
    const before = notes[notes.indexOf(event) - 1];
    const graceDstep = event.dstep + (rng.chance(0.5) ? 1 : -1);
    // A grace note on the pitch just played reads as a misprinted repeat.
    if (before && before.dstep === graceDstep) continue;
    event.grace = { pitch: pitchAt(graceDstep, key, { raiseSeventh: false }) };
    added += 1;
  }
}

const ORDER = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'];

/*
 * Where a wedge lands. One step is the norm, but always taking exactly one
 * step means a grade's extreme markings can never be reached from any opening
 * dynamic the generator will pick — Grade 8 declared fff and printed it in
 * none of 1500 tests. An occasional wider swing is also simply how a
 * crescendo behaves.
 */
function louderThan(allowed, from, rng) {
  const candidates = allowed.filter((d) => ORDER.indexOf(d) > ORDER.indexOf(from));
  if (!candidates.length) return null;
  return rng.chance(0.8) ? candidates[0] : rng.pick(candidates);
}
function softerThan(allowed, from, rng) {
  const candidates = allowed.filter((d) => ORDER.indexOf(d) < ORDER.indexOf(from));
  if (!candidates.length) return null;
  return rng.chance(0.8) ? candidates[candidates.length - 1] : rng.pick(candidates);
}
