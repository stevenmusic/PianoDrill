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

// The onset finder and the scorer live in the shared module so DrumDrill uses the very same code.
export { detectOnsets, scoreRhythm } from '../shared/onsets.js';
