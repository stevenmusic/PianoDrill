/**
 * 把一份視奏題印成看得懂的文字(審查旋律線條用,不用讀 MusicXML)
 *   node tools/sight/dump.js --grade 3 --seed 7          一份
 *   node tools/sight/dump.js --grade 3 --count 5          隨機 5 份
 * 每小節:和弦 | 右手 | 左手;音名後面是時值(w h q e s,. = 附點,r = 休止),和弦音用 + 連起來
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateTest } from '../../js/sight/generator/generate.js';

const args = process.argv.slice(2);
const val = (f, d) => { const i = args.indexOf(f); return i === -1 ? d : args[i + 1]; };
const rules = JSON.parse(readFileSync(fileURLToPath(new URL('../../data/sight-rules.json', import.meta.url)), 'utf8'));
const grade = Number(val('--grade', '1')), count = Number(val('--count', '1')), seed0 = val('--seed', null);

const T = { whole: 'w', half: 'h', quarter: 'q', eighth: 'e', '16th': 's', '32nd': 't' };
const ACC = { '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: 'x' };
const name = p => p.step + ACC[p.alter || 0] + p.octave;
const ev = e => {
  const d = (T[e.type] || e.type) + '.'.repeat(e.dots || 0) + (e.timeModification ? '3' : '');
  if (e.rest) return 'r' + d;
  const notes = [e.pitch, ...(e.chord || []).map(c => c.pitch || c)].filter(Boolean).map(name).join('+');
  return (e.grace ? '(' + name(e.grace.pitch) + ')' : '') + notes + d + (e.slur ? '~' : '') + ((e.articulations || []).includes('staccato') ? "'" : '');
};
for (let k = 0; k < count; k++) {
  const seed = seed0 === null ? Math.floor(Math.random() * 1e6) : Number(seed0) + k;
  const s = generateTest(rules, { grade, seed });
  console.log(`== Grade ${grade} seed ${seed} · ${s.key.tonic} ${s.key.mode} · ${s.timeSignature.beats}/${s.timeSignature.beatType} · ${s.barCount} bars · ${s.tempoTerm}${s.keyChange ? ' · modulates to ' + s.keyChange.tonic + ' at bar ' + (s.keyChange.barIndex + 1) + ', home at bar ' + (s.keyChange.endBarIndex + 1) : ''}`);
  for (let b = 0; b < s.barCount; b++) {
    const chord = Array.isArray(s.progression[b]) ? s.progression[b].join('/') : s.progression[b];
    console.log(`${String(b + 1).padStart(2)} ${String(chord).padEnd(7)}| RH ${s.staves[1][b].events.map(ev).join(' ').padEnd(46)}| LH ${s.staves[2][b].events.map(ev).join(' ')}`);
  }
}
