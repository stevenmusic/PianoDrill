import test from 'node:test';
import assert from 'node:assert/strict';

import { generateTest } from '../../js/sight/generator/generate.js';
import { toMusicXml } from '../../js/sight/generator/musicxml.js';
import { STAGES, rulesForStage, soloScore } from '../../js/sight/stages.js';
import { rules } from './helpers.js';

const SEEDS = Array.from({ length: 60 }, (_, i) => i * 7919 + 13);
const notes = (bars) => bars.flatMap((b) => b.events).filter((e) => !e.rest).flatMap((e) => [e.pitch, ...(e.chord ?? [])]);

// 視奏分頁的範圍階段:每一階每一級都出得了題、音都在選的範圍裡(小調的導音升高可以超出半音)、階 1 只有 C 大調
for (const st of STAGES) for (const g of st.grades) {
  test(`範圍 ${st.n} · 用 ${g} 級的規則:音在範圍內`, () => {
    for (const seed of SEEDS) {
      const s = generateTest(rulesForStage(rules, st, g), { grade: g, seed, ...(st.cOnly ? { tonic: 'C', mode: 'major' } : {}) });
      if (st.cOnly) assert.equal(s.key.tonic + s.key.mode, 'Cmajor');
      for (const [staff, [lo, hi]] of [[1, st.rh], [2, st.lh]]) for (const p of notes(s.staves[staff])) {
        assert.ok(p.midi >= lo - 1 && p.midi <= hi + 1, `seed ${seed} staff ${staff}: ${p.midi} 不在 ${lo}–${hi}`);
      }
    }
  });
}

// 單手:另一手全部休止;階 1(兩手輪流)每一小節都有音、移過來的句子還在這一手的範圍;MusicXML 只有一個譜表
test('單手題:只有那一手、階 1 不會半首休止', () => {
  for (const st of STAGES) for (const seed of SEEDS.slice(0, 20)) {
    const g = st.grades[0];
    const s = generateTest(rulesForStage(rules, st, g), { grade: g, seed, ...(st.cOnly ? { tonic: 'C', mode: 'major' } : {}) });
    for (const [hand, mine, other, range] of [['right', 1, 2, st.rh], ['left', 2, 1, st.lh]]) {
      const so = soloScore(s, hand);
      assert.equal(notes(so.staves[other]).length, 0);
      if (st.n === 1) {
        assert.ok(so.staves[mine].every((b) => b.events.some((e) => !e.rest)), `seed ${seed} ${hand}: 有整小節休止`);
        for (const p of notes(so.staves[mine])) assert.ok(p.midi >= range[0] && p.midi <= range[1], `seed ${seed} ${hand}: ${p.midi}`);
      }
      const xml = toMusicXml(so, { only: mine });
      assert.ok(!xml.includes('<staves>2</staves>') && !xml.includes('<staff>2</staff>'));
    }
  }
});
