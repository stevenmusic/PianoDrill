/* 考試大綱 → 題目清單、篩選、隨機抽考。資料格式見 data/syllabus.json 的 _doc。 */

export function gradeOf(SY, system, grade){
  const s = SY.systems[system];
  return s && s.grades.find(g => g.grade === grade);
}

/* 精熟度的 key:同一個要求(不分系統/級數)共用一筆 */
export function masteryKey(q){
  return [q.type, q.tonic, q.quality || "-", q.form || "-", q.motion || "similar", q.hands, q.range || q.octaves, q.articulation,
    q.apart || 0, q.inversion || 0, q.lhStart || "-", q.rhStart || "-"].join("|");
}

/* 小調形式:考生自選 → 依偏好;考官指定 → 每種形式各一題 */
function pickForm(forms, pref){
  if (!forms) return null;
  return forms.includes(pref) ? pref : forms.includes("harmonic") ? "harmonic" : forms[0];
}

function base(item){
  const q = {
    itemId: item.id, cat: item.cat, type: item.type, quality: item.quality || null,
    motion: item.motion || "similar", octaves: item.octaves || null, range: item.range || null,
    apart: item.apart || 0, apartTenth: !!item.apartTenth, inversion: item.inversion || 0,
    forms: item.forms || null
  };
  if (item.lhStart) { q.lhStart = item.lhStart; q.rhStart = item.rhStart; }
  return q;
}
function finish(q){ q.sub = q.tempo.unit === "q." ? 3 : 2; q.key = masteryKey(q); return q; }

/* ABRSM:每個調 × 每種奏法 × (分手:右手、左手各一題) × (考官指定的小調形式) */
function expandAbrsm(g, item, prefs){
  const out = [];
  const forms = item.forms ? (item.examinerForms ? item.forms : [pickForm(item.forms, prefs.minorForm)]) : [null];
  const hands = item.hands === "HS" ? ["RH", "LH"] : ["HT"];
  for (const key of item.keys) for (const articulation of item.articulation) for (const form of forms) for (const h of hands) {
    const q = base(item);
    Object.assign(q, { sys: "abrsm", tonic: key, articulation, form, hands: h, tempo: g.tempo[item.tempo], examinerForms: !!item.examinerForms });
    out.push(finish(q));
  }
  return out;
}
/* Trinity:每一項就是一題(手、力度、奏法都固定) */
function expandTrinity(item, set, prefs){
  const q = base(item);
  Object.assign(q, { sys: "trinity", tonic: item.key, articulation: item.articulation, hands: item.hands, dynamic: item.dynamic,
    form: pickForm(item.forms, prefs.minorForm), tempo: item.tempo, set });
  return finish(q);
}

export function questionsFor(SY, system, g, prefs = {}){
  const mode = SY.systems[system].mode;
  if (mode === "sets") {
    const set = prefs.set && g.sets[prefs.set] ? prefs.set : "A";
    return g.sets[set].map(it => expandTrinity(it, set, prefs));
  }
  return g.items.flatMap(it => expandAbrsm(g, it, prefs));
}

/* 分類(篩選與清單分組) */
export const CATEGORIES = [
  { id: "scale", zh: "音階", en: "Scales" }, { id: "contrary", zh: "反向音階", en: "Contrary" }, { id: "apart", zh: "相隔三度/六度", en: "A 3rd / 6th apart" },
  { id: "double", zh: "雙音音階", en: "Double notes" }, { id: "chromatic", zh: "半音階", en: "Chromatic" }, { id: "wholetone", zh: "全音音階", en: "Whole-tone" },
  { id: "arpeggio", zh: "琶音", en: "Arpeggios" }, { id: "seventh", zh: "屬七/減七", en: "7th chords" }, { id: "broken", zh: "分解和弦", en: "Broken chords" }
];

/* filter = { quality: "all"|"major"|"minor", cats: Set, excludeMastered: bool } */
export function applyFilter(qs, filter, mastery){
  return qs.filter(q => {
    if (filter.quality !== "all") {
      if (!q.quality) return false;
      if (filter.quality !== q.quality) return false;
    }
    if (filter.cats && !filter.cats.has(q.cat)) return false;
    if (filter.excludeMastered && mastery[q.key] === "good") return false;
    return true;
  });
}

/* 隨機抽一題:不重複上一題;待加強的權重加倍 */
export function drawQuestion(pool, mastery, lastKey, rand = Math.random){
  if (!pool.length) return null;
  const cand = pool.length > 1 ? pool.filter(q => q.key !== lastKey) : pool;
  const w = cand.map(q => mastery[q.key] === "weak" ? 2 : 1);
  let r = rand() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < cand.length; i++) { r -= w[i]; if (r < 0) return { ...cand[i] }; }
  return { ...cand[cand.length - 1] };
}

/* 速度:unit q/h/q. → 每分鐘幾拍(畫面顯示用)與「每個音幾秒」(播放用) */
export const UNIT_SYM = { q: "♩", h: "𝅗𝅥", "q.": "♩.", q16: "♩", e16: "♪" };
export const NOTES_PER_UNIT = { q: 2, h: 4, "q.": 3, q16: 4, e16: 2 };   // e16:哈農拍點打在八分音符(一拍 2 個十六分音符)   // q16:哈農(一拍 4 個十六分音符)
