/**
 * Harmonic skeleton.
 *
 * Pitches are chosen against a chord progression rather than freely from the
 * scale. This is the single biggest factor in whether a generated test sounds
 * like music or like a random note-string.
 */

/*
 * How one chord tends to move to the next, weighted by how idiomatic the
 * progression is — not just legal, which a flat pool cannot tell apart from
 * common. Measured across 600 tests per grade, an unweighted uniform pick
 * over {I, ii, iii, IV, V, vi} put `iii` — the weakest and most tonally
 * ambiguous diatonic triad, sharing two tones with both I and V and pushing
 * toward neither — within a point of IV by Grade 5, and root motion by a
 * bare third (root motion with no strong directional pull) at 14-15% of all
 * chord changes, nearly matching the 15-18% that moved by a second. Motion by
 * a fourth/fifth — the progression that actually drives tonal harmony
 * forward — was already the largest single category (30-46%), but a random
 * walk has no notion that it *should* be, so it wandered into weak motion far
 * more than real practice does.
 *
 * The tables follow the functional order of classical harmony: tonic (I,
 * vi) → pre-dominant (IV, ii) → dominant (V) → tonic. Nothing moves backwards
 * against that flow — ii never returns to I, IV or vi; IV never goes to vi;
 * vi never falls back to I; V never falls to IV or ii (a retrogression). And
 * there is no iii at all: ABRSM's specimen tests are built on I, IV, V with ii
 * and vi from the middle grades, and classical writing uses iii only in a few
 * set places (a descending bass I–iii–IV, a circle of fifths) that a
 * bar-by-bar chord walk cannot place idiomatically. It came out as I–iii–ii–V,
 * which no textbook or test would write.
 */
const FOLLOWS = {
  I: [{ chord: 'IV', weight: 4 }, { chord: 'V', weight: 3 }, { chord: 'ii', weight: 2.5 }, { chord: 'vi', weight: 2.5 }],
  ii: [{ chord: 'V', weight: 1 }],
  IV: [{ chord: 'V', weight: 4 }, { chord: 'ii', weight: 3 }, { chord: 'I', weight: 2 }],
  V: [{ chord: 'I', weight: 3 }, { chord: 'vi', weight: 0.6 }],
  vi: [{ chord: 'ii', weight: 4 }, { chord: 'IV', weight: 3 }, { chord: 'V', weight: 1.5 }],
};

/** Grade <=3: primary chords plus vi — no ii yet. */
const FOLLOWS_SIMPLE = {
  I: [{ chord: 'V', weight: 4 }, { chord: 'IV', weight: 3 }, { chord: 'vi', weight: 1.5 }],
  IV: [{ chord: 'V', weight: 4 }, { chord: 'I', weight: 3 }],
  V: [{ chord: 'I', weight: 3 }, { chord: 'vi', weight: 1 }],
  vi: [{ chord: 'IV', weight: 3 }, { chord: 'V', weight: 1 }],
};

/*
 * Minor keys are written as harmonic minor, so iii would be the augmented
 * triad, and ii is diminished — in root position that is a bare tritone over
 * the bass, which this idiom avoids. iv is the minor-key pre-dominant here.
 */
const usable = (chord, minor) => !(minor && chord === 'ii');

/** Whether `to` may follow `from` (a held chord always may). */
export function mayMove(table, from, to, minor = false) {
  if (from === to) return true;
  return usable(to, minor) && (table[from] ?? []).some((entry) => entry.chord === to);
}

/** Weighted candidates for what may follow `previous`, excluding an immediate repeat. */
function mayFollow(table, previous, minor = false) {
  const candidates = (table[previous] ?? []).filter((entry) => entry.chord !== previous && usable(entry.chord, minor));
  if (candidates.length) return candidates;
  return [{ chord: 'V', weight: 1 }];
}

/**
 * One chord per bar (occasionally two — see `twoChordBarChance`): opens on
 * I, closes with a V–I cadence.
 *
 * The middle is not a free chord walk from end to end. Real sight-reading
 * tests are built as a **period**: an antecedent phrase that puts a comma
 * on the dominant (a half cadence), then a consequent that starts over and
 * finishes the sentence V–I. Without that comma every bar between the
 * opening and the cadence is harmonically interchangeable, and the test
 * reads as one undifferentiated span rather than as a question answered —
 * which is most of what makes a generated test feel assembled rather than
 * composed. `halfCadenceBar` marks the antecedent's last bar (V) and the
 * consequent then restarts on I, so the listener hears the phrase return.
 *
 * @param {ReturnType<import('./random.js').createRandom>} rng
 * @param {number} barCount
 * @param {{simple?: boolean, twoChordBarChance?: number}} [options]
 * @returns {(string|[string, string])[]} one roman numeral per bar, or a
 *   `[first, second]` pair for a bar whose harmony changes halfway through
 */
export function buildProgression(rng, barCount, options = {}) {
  const table = options.simple ? FOLLOWS_SIMPLE : FOLLOWS;
  const twoChordBarChance = options.twoChordBarChance ?? 0;
  if (barCount <= 1) return ['I'];
  if (barCount === 2) return ['I', 'I'];

  const progression = new Array(barCount);
  progression[0] = 'I';
  progression[barCount - 1] = 'I';
  progression[barCount - 2] = 'V';

  // Only worth articulating once there are two real phrases to divide: at
  // 4 bars the "antecedent" would end on the bar the final cadence already
  // owns, and the anti-static guard below would immediately undo it.
  const half = halfCadenceBar(barCount);

  // A middle bar occasionally splits into two chords, a beat-for-beat
  // harmonic rhythm real intermediate/advanced tests use — never the
  // opening or the closing cadence, which anchor the phrase.
  let previous = 'I';
  // How many bars running the harmony has already sat on `previous`,
  // counting the opening bar itself — see the prolongation comment below.
  let sameChordRun = 1;
  let deceptive = false;
  for (let bar = 1; bar < barCount - 2; bar++) {
    if (bar === half) {
      progression[bar] = 'V';
      previous = 'V';
      sameChordRun = 1;
      continue;
    }
    // The consequent begins by restating home, the way the piece opened.
    if (half !== null && bar === half + 1) {
      progression[bar] = 'I';
      previous = 'I';
      sameChordRun = 1;
      continue;
    }
    /*
     * Real tonal writing prolongs a chord across more than one bar — most
     * often the opening tonic, establishing the key before the harmony
     * starts moving — rather than changing on every single barline.
     * `mayFollow` below still refuses to *pick* a repeat when the harmony
     * does move on, which is correct (a "next chord" that's the same chord
     * isn't a move at all); without a separate chance to simply hold still
     * first, that meant harmony changed on 100% of bars, every time, which
     * is a far busier harmonic rhythm than these short, simple tests
     * actually have. Capped at two bars running the same chord — even a
     * held tonic opening rarely sits still longer than that here.
     */
    if (sameChordRun < 2 && rng.chance(bar === 1 && previous === 'I' ? 0.45 : 0.2)) {
      progression[bar] = previous;
      sameChordRun += 1;
      continue;
    }
    sameChordRun = 1;

    // A deceptive cadence (V-vi) is an event, not a habit: once per test at most.
    const follow = (from) => mayFollow(table, from, options.minor).filter((e) => !(from === 'V' && e.chord === 'vi' && deceptive));
    const first = rng.weighted(follow(previous)).chord;
    if (twoChordBarChance > 0 && rng.chance(twoChordBarChance)) {
      const second = rng.weighted(follow(first)).chord;
      progression[bar] = [first, second];
      previous = second;
    } else {
      progression[bar] = first;
      previous = first;
    }
    const entry = progression[bar];
    if ((Array.isArray(entry) ? entry : [entry]).some((c, i, all) => c === 'vi' && (i ? all[i - 1] : lastChord(progression[bar - 1])) === 'V')) deceptive = true;
  }

  /*
   * The consequent opens the way the antecedent did. This is what makes a
   * period hear as one sentence said twice rather than as two unrelated
   * halves — and, just as importantly, it is what lets the *melody* restate
   * itself literally there: a motif copied onto a bar carrying the same chord
   * needs no transposition and no adjustment, so it survives intact instead
   * of being bent note by note to fit a different harmony.
   */
  if (half !== null) {
    for (let position = 1; position <= 2; position++) {
      const source = progression[position];
      const destination = half + 1 + position;
      if (destination >= barCount - 2) break;
      progression[destination] = Array.isArray(source) ? [...source] : source;
    }
  }

  // Avoid a static V–V into the cadence — but never at the cost of the half
  // cadence itself, which is deliberate rather than accidental repetition.
  // Weighted toward ii/IV: the classic pre-dominant approach into a cadence,
  // rather than treated as just another equally-likely replacement.
  if (barCount >= 4 && barCount - 3 !== half && lastChord(progression[barCount - 3]) === 'V') {
    // Grade 1-3 have no ii at all (FOLLOWS_SIMPLE) — the fallback must not slip
    // one in: at Grade 1 this bar is where the first hand ends its half on the
    // tonic, and a held tonic under ii is a non-chord bass.
    progression[barCount - 3] = rng.weighted([
      { chord: 'ii', weight: options.simple || options.minor ? 0 : 3 }, { chord: 'IV', weight: 3 }, { chord: 'vi', weight: 1 }, { chord: 'I', weight: 1 },
    ]).chord;
  }
  /*
   * The overwrites above (the consequent copying the opening, the
   * pre-cadence fallback) never re-check what they now follow or lead into,
   * so a copied bar could sit after a chord it may not follow (V–IV, ii–I).
   * Every free bar is re-checked against both neighbours and, where either
   * join breaks the functional order, replaced by the likeliest chord that
   * fits between them. The opening I, the half cadence, the consequent's
   * restart and the closing V–I are fixed.
   */
  const fixed = new Set([0, barCount - 2, barCount - 1]);
  if (half !== null) { fixed.add(half); fixed.add(half + 1); }
  const minor = options.minor ?? false;
  const fits = (entry, before, after) => {
    const chords = Array.isArray(entry) ? entry : [entry];
    if (before !== undefined && !mayMove(table, lastChord(before), chords[0], minor)) return false;
    for (let i = 1; i < chords.length; i++) if (!mayMove(table, chords[i - 1], chords[i], minor)) return false;
    if (after !== undefined && !mayMove(table, chords[chords.length - 1], firstChord(after), minor)) return false;
    return chords.every((chord) => chord === 'I' || usable(chord, minor) && table[chord]);
  };
  /*
   * The consequent's copy can bring a deceptive V-vi back a second time; keep
   * the first and make any later one an ordinary V-I.
   */
  let seenDeceptive = false;
  for (let bar = 1; bar < barCount - 1; bar++) {
    const chords = Array.isArray(progression[bar]) ? progression[bar] : [progression[bar]];
    const before = [lastChord(progression[bar - 1]), ...chords];
    const hit = chords.some((c, i) => c === 'vi' && before[i] === 'V');
    if (hit && seenDeceptive) progression[bar] = Array.isArray(progression[bar]) ? progression[bar].map((c, i) => (c === 'vi' && before[i] === 'V' ? 'I' : c)) : 'I';
    else if (hit) seenDeceptive = true;
  }
  for (let bar = 1; bar < barCount - 1; bar++) {
    if (fixed.has(bar) || fits(progression[bar], progression[bar - 1], progression[bar + 1])) continue;
    const before = lastChord(progression[bar - 1]);
    const options2 = Object.keys(table)
      .filter((chord) => fits(chord, progression[bar - 1], progression[bar + 1]))
      .map((chord) => ({ chord, weight: (table[before] ?? []).find((e) => e.chord === chord)?.weight ?? 0.5 }));
    progression[bar] = options2.length ? rng.weighted(options2).chord : before;
  }
  return progression;
}

/**
 * The bar carrying the antecedent's half cadence, or null when the test is
 * too short to divide into two phrases. Exported so the melodic side can
 * shape its line toward the same comma the harmony puts there.
 */
export function halfCadenceBar(barCount) {
  if (barCount < 6) return null;
  const bar = Math.floor(barCount / 2) - 1;
  // Must leave room for the consequent's own restart and V–I cadence.
  return bar >= 1 && bar < barCount - 3 ? bar : null;
}

/** The chord sounding at the very start of a (possibly split) bar entry. */
export function firstChord(entry) {
  return Array.isArray(entry) ? entry[0] : entry;
}

/** The chord sounding at the very end of a (possibly split) bar entry. */
export function lastChord(entry) {
  return Array.isArray(entry) ? entry[entry.length - 1] : entry;
}

/**
 * Where a split bar's second chord arrives: on a beat, never mid-beat. Half
 * the bar works for 2/4, 4/4, 6/8, 12/8, but in 3/4 that is halfway through
 * beat 2 — so the change goes to the beat after the middle (3/4 → beat 3,
 * 5/4 → 3+2, 9/8 → 6+3). Without `beatDuration` it falls back to half.
 */
export function splitPoint(barDuration, beatDuration) {
  if (!beatDuration) return barDuration / 2;
  const beats = Math.round(barDuration / beatDuration);
  return Math.ceil(beats / 2) * beatDuration;
}

/** The chord in effect at `offset` divisions into a bar of `barDuration`. */
export function chordAt(entry, offset, barDuration, beatDuration) {
  if (!Array.isArray(entry)) return entry;
  return offset < splitPoint(barDuration, beatDuration) ? entry[0] : entry[1];
}
