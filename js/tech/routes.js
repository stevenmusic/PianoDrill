/* 今日練習的路線與關卡(PianoDrill;引擎 js/shared/daily.js、卡片 js/shared/dailycard.js、譜與指法 js/tech/patterns.js)。
   兩條路線:手指(33 關:第 0 組 2 + A–G 31)、左手伴奏(17 關;手指路線過了 PA5(A 組的基礎關)才開放)。
   第 0 組(初學基礎,系統化 2026-10):「找到中央 C」(配手位圖)→「手指號碼」(看數字按對手指,右手四分);快速通道照舊可以快速跳過;練的是找位置、不是速度:start = target、need: 2、review: false(不放進複習盒)。全部是 App 編排的練習(不是哪一本教材的譜),速度、重點都是練習設定。
   原則(使用者 2026-10 確認):主要客群是完全初學 → 第 1 關從最基本;時值由慢到快(四分 → 八分 → 後面才十六分);熟手靠快速通道。
   start / target = 起始 / 目標速度(♩,一拍一下拍點);check = 檢查重點(2–3 項,看得見、聽得到的事)。
   names = 這一組預設顯示音名(手指 A–C 組、伴奏 A–B 組;之後難度上升才預設關;使用者切過就照他的,每條路線記住)。

   ── 手指路線的寫法(rh / lh 字串;patterns.js 解析)──
   key = 調(C / G / F / a);手的五指位置 = 那個調的音階上連續五個音(@I 主音位置、@V 屬音位置)。
     右手:最低的、不低於中央 C 的那個音起;左手:最高的、拇指不超過 A3 的位置(C3–G3、G2–D3、F2–C3、D3–A3)
   一個記號一格(時值 = 目前的 @q / @e / @s / @t(三連音八分)/ @h / @w / @dq / @dh):
     1–5 = 手指(位置裡手指就是音:右手 1 = 位置最低音、左手 5 = 位置最低音)
     d=f = 位置裡第 d 個音(1 起算,可以超過 5)用手指 f(拇指穿越用)
     1+5 = 同時按(和弦)、r = 休止、R = 整小節休止、- = 前一個音再延長一格
     後綴 . 斷奏、> 重音、( 圓滑線開始、) 圓滑線結束;| = 小節線(檢查每小節拍數)
   hold = { rh: [手指…] }:同一譜表按住的音(第二聲部,每小節一個長音、小節之間連結線)
   dyn = { rh, lh }:每隻手自己的力度(p / mf / f)
   scale = 一個八度音階(上行八分 ×8、下行八分 ×6 + 四分;指法照 data/fingerings.json)

   ── 伴奏路線 ──
   key、time(4/4 或 3/4)、prog(級數)、lh(block4 四分柱式 / block2 二分柱式 / root5 根音五音 / broken 低中高中 / alberti / waltz / root 全音符根音 / r158)、
   rh(tones 每個和弦一個長音 / chords4 四分柱式 / chords2 二分柱式 / c332 3+3+2 節奏的柱式)。左手形狀照方法書常見的最近位置(patterns.js 的 SHAPE)。

   ── 複習的變化(vary[盒 − 1];同一段用不同方式練)──
   原樣 → 節奏型(附點 / 反附點)→ 觸鍵(斷奏)與強弱(p、f、漸強)→ 換調(C → G → F)→ 綜合(+ 拍點只響 1、3 拍 / 第 1 拍 / 中途消失)。
   q = 題目要改的欄位(rkey 調、rhythm、touch、dyn;不用 key:題目的 key 是熟練度的鍵),name = 「這次:…」(自動產生);換調時譜、指法、聲音都換,關卡名稱跟調無關 */

const x2 = s => s + " | " + s;
/* ── 複習變化的名稱(自動)── */
const KEY_NAME = { C: ["C 大調", "C major"], G: ["G 大調", "G major"], F: ["F 大調", "F major"], a: ["a 小調", "A minor"] };
const VNAME = {
  rhythm: { dotted: ["附點節奏", "Dotted rhythm"], reverse: ["反附點", "Reverse dotted"] },
  touch: { stacc: ["斷奏", "Staccato"], legato: ["圓滑奏", "Legato"] },
  dyn: { p: ["小聲(p)", "Soft (p)"], f: ["大聲(f)", "Loud (f)"], cresc: ["漸強", "Crescendo"], balance: ["右手大聲、左手小聲", "RH over LH"] }
};
export function varyName(q){
  const parts = [];
  if (q.rkey) parts.push(KEY_NAME[q.rkey]);
  for (const k of ["rhythm", "touch", "dyn"]) if (q[k]) parts.push(VNAME[k][q[k]]);
  return parts.length ? [parts.map(p => p[0]).join("、"), parts.map(p => p[1]).join(", ")] : null;
}
const V = (q = {}, click = null) => { const v = {}; if (Object.keys(q).length) { v.q = q; v.name = varyName(q); } if (click) v.click = click; return v; };
/* 變化表:k = 這一關在路線裡的序號(輪流用附點 / 反附點、p / f / 漸強) */
const RH = k => (k % 2 ? "reverse" : "dotted"), DY = k => ["p", "f", "cresc"][k % 3];
const vary = {
  // 一般(C 大調的關):原樣 → 節奏型 → 觸鍵 + 強弱 → 換 G → 換 F + 綜合 → 換 G + 中途消失
  std: (k, o = {}) => [V(), V(o.noRhythm ? { dyn: DY(k + 1) } : { rhythm: RH(k) }), V({ ...(o.noTouch ? {} : { touch: "stacc" }), ...(o.noDyn ? {} : { dyn: DY(k) }) }),
    V({ rkey: "G" }), V({ rkey: o.onlyG ? "G" : "F", ...(o.noRhythm ? {} : { rhythm: RH(k + 1) }) }, "one-three"), V({ rkey: "G", ...(o.noTouch ? {} : { touch: "stacc" }) }, "gap")],
  // 已經是 G / F / a 的關(關卡本身就是那個調):不換調,改用拍點模式
  fixed: (k, o = {}) => [V(), V(o.noRhythm ? { dyn: "p" } : { rhythm: RH(k) }), V({ ...(o.noTouch ? {} : { touch: "stacc" }), dyn: DY(k) }),
    V({ dyn: "cresc" }, "one-three"), V(o.noRhythm ? { dyn: "f" } : { rhythm: RH(k + 1) }, "one"), V({}, "gap")],
  // 伴奏:原樣 → 節奏型(八分音符的型)或斷奏 → 強弱(有右手 = 右手大聲、左手小聲)→ 換 G → 換 F + 拍點只響 1、3 拍 → 換 G + 只響第 1 拍
  acc: (k, o = {}) => [V(), V(o.eighths ? { rhythm: RH(k) } : { touch: "stacc" }), V(o.rh ? { dyn: "balance" } : { dyn: DY(k) }),
    V({ rkey: "G" }), V({ rkey: "F", ...(o.rh ? { dyn: "balance" } : {}) }, "one-three"), V({ rkey: "G" }, "one")],
  accFixed: (k, o = {}) => [V(), V(o.eighths ? { rhythm: RH(k) } : { touch: "stacc" }), V(o.rh ? { dyn: "balance" } : { dyn: DY(k) }),
    V({ dyn: "cresc" }, "one-three"), V({}, "one"), V({}, "gap")]
};
const C = (zh, en) => [zh, en];

/* ══ 手指路線(33 關)══ */
const FINGER = [
  // 0 初學基礎(右手、四分音符;C 位置)
  { id: "P02", g: "0", name: C("找到中央 C", "Find middle C"), hands: "RH", value: "q", rh: "1 1 1 1 | 1 - - -", start: 50, target: 50, need: 2, review: false,
    check: [C("中央 C:兩個黑鍵左邊的白鍵", "Middle C: the white key left of the two black keys"), C("右手大拇指放在中央 C", "Right thumb on middle C")] },
  { id: "P01", g: "0", name: C("手指號碼", "Finger numbers"), hands: "RH", value: "q", rh: "1 3 2 4 | 5 3 4 2", start: 50, target: 50, need: 2, review: false,
    check: [C("先看手指號碼再按", "Read the finger number first"), C("大拇指 = 1、小指 = 5", "Thumb = 1, little finger = 5")] },
  // A 五指位置(四分音符 → 最後一關八分音符)
  { id: "PA1", g: "A", name: C("右手五指上下", "RH: five fingers up and down"), hands: "RH", value: "q", rh: "1 2 3 4 | 5 4 3 2", start: 60, target: 100,
    check: [C("手指彎、用指尖", "Curved fingers, tips"), C("每個音一樣大", "Every note even"), C("前一個放開、下一個才按", "Lift one as the next goes down")] },
  { id: "PA2", g: "A", name: C("左手五指上下", "LH: five fingers up and down"), hands: "LH", value: "q", lh: "5 4 3 2 | 1 2 3 4", start: 60, target: 100,
    check: [C("手指彎、用指尖", "Curved fingers, tips"), C("小指不要塌", "Finger 5 stays firm"), C("每個音一樣大", "Every note even")] },
  { id: "PA3", g: "A", name: C("雙手反向(同一個手指)", "Mirror: same fingers"), hands: "HT", value: "q", rh: "1 2 3 4 | 5 4 3 2", lh: "1 2 3 4 | 5 4 3 2", start: 60, target: 96,
    check: [C("兩手同一個手指一起按", "Same finger in both hands"), C("兩手一樣大聲", "Hands equally loud")] },
  { id: "PA4", g: "A", name: C("雙手同方向", "Hands together, same way"), hands: "HT", value: "q", rh: "1 2 3 4 | 5 4 3 2", lh: "5 4 3 2 | 1 2 3 4", start: 56, target: 92,
    check: [C("兩手同時下去", "Hands exactly together"), C("兩手的手指號碼不一樣:先看清楚", "Different fingers: look first")] },
  { id: "PA5", g: "A", name: C("八分音符雙手", "Eighth notes, hands together"), hands: "HT", value: "e", rh: x2("1 2 3 4 5 4 3 2"), lh: x2("5 4 3 2 1 2 3 4"), start: 50, target: 84,
    check: [C("不要越彈越快", "Don't rush"), C("手腕不上下", "Quiet wrists")] },
  // 兩音圓滑(審查定案 2026-10:A 組最後一關;方法書的「按下—抬起」)
  { id: "PA6", g: "A", name: C("按下—抬起", "Press–lift"), hands: "RH", value: "q", rh: "1( 2) 3( 4) | 5( 4) 3( 2)", start: 56, target: 88,
    check: [C("按下第二個音的同時放開第一個音,中間沒有空隙", "Release the first note as the second sounds: no gap"), C("第二個音輕一點,彈完手腕抬起來", "Second note lighter, then lift the wrist")] },
  // B 弱指 4、5(八分音符)
  { id: "PB1", g: "B", name: C("右手 3-4-5-4", "RH 3-4-5-4"), hands: "RH", value: "e", rh: x2("3 4 5 4 3 4 5 4"), start: 50, target: 84,
    check: [C("4、5 指跟 3 指一樣大聲", "4 and 5 as loud as 3"), C("指尖站穩、第一指節不凹", "Firm tips, no caving joint")] },
  { id: "PB2", g: "B", name: C("左手 3-4-5-4", "LH 3-4-5-4"), hands: "LH", value: "e", lh: x2("3 4 5 4 3 4 5 4"), start: 50, target: 84,
    check: [C("4、5 指跟 3 指一樣大聲", "4 and 5 as loud as 3"), C("指尖站穩、第一指節不凹", "Firm tips, no caving joint")] },
  { id: "PB3", g: "B", name: C("4、5 指交替(兩手輪流)", "Fingers 4–5, hands in turn"), hands: "HT", value: "e", rh: "4 5 4 5 4 5 4 5 | R", lh: "R | 4 5 4 5 4 5 4 5", start: 50, target: 72,
    check: [C("慢慢抬、慢慢放", "Lift and drop evenly"), C("手不歪向小指", "Hand doesn't tip to 5"), C("累了就停 · 手腕跟著轉", "Stop if tired · wrist turns along")] },
  { id: "PB4", g: "B", name: C("跳一個指頭", "Skipping a finger"), hands: "HT", value: "e", rh: x2("1 3 2 4 3 5 4 2"), lh: x2("5 3 4 2 3 1 2 4"), start: 44, target: 80,
    check: [C("跳過去的手指不要先按下去", "Skipped finger stays up"), C("兩手同時下去", "Hands exactly together")] },
  { id: "PB5", g: "B", name: C("重音給 4 指", "Accent on finger 4"), hands: "HT", value: "e", rh: x2("4> 3 2 1 4> 3 2 1"), lh: x2("4> 3 2 1 4> 3 2 1"), start: 50, target: 84,
    check: [C("4 指重音清楚", "Clear accent on 4"), C("其他的音輕", "Other notes light")] },
  // C 按住一個音(手指獨立;原理:Cortot 第 1 章「按住不動的手指」,內容是 App 編的)
  { id: "PC1", g: "C", name: C("右手按住大拇指", "RH: hold the thumb"), hands: "RH", value: "e", hold: { rh: [1] }, rh: x2("2 3 4 5 4 3 2 3"), start: 50, target: 80,
    check: [C("大拇指按住 C:輕輕按、不壓到底", "Thumb holds C, lightly"), C("每個音一樣大", "Every note even"), C("手腕放鬆", "Loose wrist")] },
  { id: "PC3", g: "C", name: C("左手按住小指", "LH: hold finger 5"), hands: "LH", value: "e", hold: { lh: [5] }, lh: x2("4 3 2 1 2 3 4 3"), start: 50, target: 80,
    check: [C("小指按住 C:輕輕按、不壓到底", "Finger 5 holds C, lightly"), C("大拇指不要用力壓", "Thumb doesn't press")] },
  { id: "PC5", g: "C", name: C("右手按住 1 和 5", "RH: hold 1 and 5"), hands: "RH", value: "e", hold: { rh: [1, 5] }, rh: x2("2 3 4 3 2 3 4 3"), start: 44, target: 72,
    check: [C("1、5 按住 C、G:輕輕按、不壓到底", "1 and 5 hold C and G, lightly"), C("中間三指輪流、一樣大", "Middle three even")] },
  { id: "PC7", g: "C", name: C("右手按住 3 指", "RH: hold finger 3"), hands: "RH", value: "e", hold: { rh: [3] }, rh: x2("2 4 2 4 2 4 2 4"), start: 44, target: 72,
    check: [C("3 指按住 E:輕輕按、不壓到底", "Finger 3 holds E, lightly"), C("2、4 指一樣大", "2 and 4 even")] },
  // D 3、4 指(最後一關才有十六分音符)
  { id: "PD1", g: "D", name: C("右手 3、4 交替", "RH 3–4"), hands: "RH", value: "e", rh: x2("3 4 3 4 3 4 3 4"), start: 50, target: 88,
    check: [C("兩指一樣大", "Both fingers even"), C("4 指抬得起來", "Finger 4 lifts")] },
  { id: "PD2", g: "D", name: C("左手 3、4 交替", "LH 3–4"), hands: "LH", value: "e", lh: x2("3 4 3 4 3 4 3 4"), start: 50, target: 88,
    check: [C("兩指一樣大", "Both fingers even"), C("4 指抬得起來", "Finger 4 lifts")] },
  { id: "PD3", g: "D", name: C("2-3-4 接 3-4-5", "Rolling 2-3-4, then 3-4-5"), hands: "RH", value: "e", rh: "2 3 4 3 2 3 4 3 | 3 4 5 4 3 4 5 4", start: 50, target: 84,
    check: [C("換組時不停", "No gap between groups"), C("每個音一樣大", "Every note even")] },
  { id: "PD4", g: "D", name: C("3、4 短顫音", "Short 3–4 trill"), hands: "RH", value: "s", rh: x2("@s 3 4 3 4 @q 3 @s 3 4 3 4 @q 3"), start: 44, target: 76,
    check: [C("快的四下平均", "Four quick notes even"), C("停的那下放鬆", "Relax on the long note")] },
  // E 拇指穿越(音階的準備)
  { id: "PE1", g: "E", name: C("拇指穿過去再回來", "Thumb under and back"), hands: "RH", value: "e", rh: x2("1=1 2=2 3=3 4=1 5=2 4=1 3=3 2=2"), start: 50, target: 84,
    check: [C("大拇指提早移過去", "Thumb moves early"), C("換位置那下不停、不重", "No bump at the turn")] },
  { id: "PE2", g: "E", name: C("右手一個八度", "RH: one octave"), hands: "RH", scale: true, start: 50, target: 84,
    check: [C("手肘跟著走", "Elbow travels along"), C("3 指之後不要停頓", "No pause after 3")] },
  { id: "PE3", g: "E", name: C("左手一個八度", "LH: one octave"), hands: "LH", scale: true, start: 50, target: 84,
    check: [C("3 指跨過大拇指", "3 crosses over the thumb"), C("音量平均", "Even tone")] },
  // F 兩手不同(雙手獨立)
  { id: "PF1", g: "F", name: C("左手長音、右手動", "LH holds, RH moves"), hands: "HT", value: "e", lh: "@w 5 | 5", rh: x2("1 2 3 4 5 4 3 2"), start: 56, target: 92,
    check: [C("左手按到小節結束", "LH holds to the barline"), C("右手每個音一樣大", "RH notes even")] },
  { id: "PF2", g: "F", name: C("左手四分、右手八分", "LH quarters, RH eighths"), hands: "HT", value: "e", lh: "@q 5 3 1 3 | 5 3 1 3", rh: x2("1 2 3 4 5 4 3 2"), start: 56, target: 92,
    check: [C("左手跟右手第 1、3、5、7 個音一起", "LH with RH notes 1, 3, 5, 7"), C("不要越彈越快", "Don't rush")] },
  { id: "PF3", g: "F", name: C("左手斷奏、右手圓滑", "LH staccato, RH legato"), hands: "HT", value: "e", lh: "@q 5. 1. 5. 1. | 5. 1. 5. 1.", rh: x2("1( 2 3 4 5 4 3 2)"), start: 56, target: 92,
    check: [C("左手短", "LH short"), C("右手連著、不斷掉", "RH connected")] },
  { id: "PF4", g: "F", name: C("右手大聲、左手小聲", "RH loud, LH soft"), hands: "HT", value: "q", dyn: { rh: "f", lh: "p" }, rh: "1 2 3 4 | @h 5 3", lh: "@w 5+1 | 5+1", start: 60, target: 96,
    check: [C("右手唱出來", "RH sings out"), C("左手像背景", "LH in the background")] },
  { id: "PF5", g: "F", name: C("右手在反拍", "RH on the off-beats"), hands: "HT", value: "e", lh: "@q 5 1 5 1 | 5 1 5 1", rh: "r 3 r 3 r 4 r 4 | r 5 r 5 r 4 r 4", start: 50, target: 84,
    check: [C("右手在反拍(每一拍的 &,唸 and = 拍子的後半)", "RH on the off-beats (the & of each beat)"), C("不被左手拉走", "Don't follow the LH")] },
  // 兩對三移到之後再做(審查定案 2026-10);換成兩手輪流接句
  { id: "PF6", g: "F", name: C("兩手輪流接句(右手接左手)", "Pass the phrase, LH to RH"), hands: "HT", value: "e", lh: "5 4 3 2 1 2 3 4 | R", rh: "R | 1 2 3 4 5 4 3 2", start: 56, target: 92,
    check: [C("接的地方不停", "No gap at the hand-over"), C("兩手一樣大聲", "Hands equally loud")] },
  // G 換位置
  { id: "PG1", g: "G", name: C("G 位置", "G position"), key: "G", hands: "HT", value: "e", rh: x2("1 2 3 4 5 4 3 2"), lh: x2("5 4 3 2 1 2 3 4"), start: 56, target: 92,
    check: [C("看清楚新的位置再開始", "Find the new position first"), C("每個音一樣大", "Every note even")] },
  { id: "PG2", g: "G", name: C("F 位置(有 B♭)", "F position (B♭)"), key: "F", hands: "HT", value: "e", rh: x2("1 2 3 4 5 4 3 2"), lh: x2("5 4 3 2 1 2 3 4"), start: 56, target: 92,
    check: [C("右手 4 指、左手 2 指彈黑鍵 B♭", "B♭: RH finger 4, LH finger 2"), C("黑鍵往裡面按", "Play the black key further in")] },
  { id: "PG3", g: "G", name: C("換到屬音位置再回來", "Shift to the V position and back"), hands: "HT", value: "e", rh: "1 2 3 4 5 4 3 2 | @V 1 2 3 4 5 4 3 2", lh: "5 4 3 2 1 2 3 4 | @V 5 4 3 2 1 2 3 4", start: 50, target: 84,
    check: [C("換位置前一拍就看下一個位置", "Look ahead a beat early"), C("換的那一下不停", "No gap at the shift")] }
];

/* ══ 左手伴奏路線(17 關;有右手的關,重點固定有「左手不要比右手大聲」)══ */
const I4 = ["I", "IV", "V7", "I"], LOUD = C("左手不要比右手大聲", "LH softer than RH");
const ACCOMP = [
  // A 柱式和弦(四分音符起)
  { id: "AA1", g: "A", chordName: true, name: C("主和弦和屬七和弦", "I and V7 chords"), prog: ["I", "I", "V7", "I"], lh: "block2", start: 60, target: 88,
    check: [C("三個音同時下去", "All three notes together"), C("換和弦只動要動的手指", "Move only the fingers that must move")] },
  { id: "AA2", g: "A", chordName: true, name: C("加上下屬和弦", "Add the IV chord"), prog: I4, lh: "block4", start: 60, target: 100,
    check: [C("I 到 IV:小指不動", "I to IV: finger 5 stays"), C("手腕放鬆", "Loose wrist")] },
  { id: "AA3", g: "A", name: C("右手加長音", "Add a right-hand note"), prog: I4, lh: "block4", rh: "tones", start: 60, target: 100,
    check: [LOUD, C("右手按滿四拍", "RH holds all four beats")] },
  { id: "AA4", g: "A", chordName: true, name: C("G 大調柱式和弦", "Block chords in G"), key: "G", prog: I4, lh: "block4", rh: "tones", start: 60, target: 100,
    check: [C("新的形狀先看清楚", "Look at the new shapes first"), C("V7 最低音是 F♯", "V7 starts on F♯"), LOUD] },
  { id: "AA5", g: "A", chordName: true, name: C("F 大調柱式和弦", "Block chords in F"), key: "F", prog: I4, lh: "block4", rh: "tones", start: 60, target: 100,
    check: [C("IV 和弦的 B♭ 用 2 指", "B♭ in IV with finger 2"), C("V7 最低音是 E", "V7 starts on E"), LOUD] },
  // B 分解和弦與 Alberti(根音五音四分 → 八分)
  { id: "AB1", g: "B", name: C("根音和五音", "Root and fifth"), prog: I4, lh: "root5", start: 60, target: 100,
    check: [C("跳之前先看下一個位置", "Look before you jump"), C("根音比五音清楚", "Root clearer than the 5th")] },
  { id: "AB2", g: "B", name: C("低中高中", "Low–mid–high–mid"), prog: I4, lh: "broken", start: 56, target: 96,
    check: [C("低音清楚、其他輕", "Bass clear, the rest light"), C("每個音一樣長", "Notes even")] },
  { id: "AB3", g: "B", name: C("Alberti 低音(低高中高)", "Alberti bass"), prog: I4, lh: "alberti", start: 56, target: 96,
    check: [C("手腕左右轉", "Wrist rocks side to side"), C("不要每個手指都用力", "Don't press every finger")] },
  { id: "AB4", g: "B", name: C("Alberti 加右手", "Alberti with a right-hand note"), prog: I4, lh: "alberti", rh: "tones", start: 52, target: 88,
    check: [C("右手在上面唱、左手在背景", "RH sings, LH in the background"), LOUD] },
  { id: "AB5", g: "B", name: C("G 大調 Alberti", "Alberti in G"), key: "G", prog: I4, lh: "alberti", start: 56, target: 96,
    check: [C("新的調先慢", "New key: start slow"), C("V7 的 F♯ 用小指", "F♯ in V7 with finger 5")] },
  // C 華爾茲(3/4)
  { id: "AC1", g: "C", name: C("華爾茲伴奏:低音、和弦、和弦", "Waltz: bass, chord, chord"), time: [3, 4], prog: I4, lh: "waltz", start: 80, target: 132,
    check: [C("第 1 拍重、後兩拍輕", "Beat 1 strong, 2 and 3 light"), C("和弦短一點、手輕輕彈起", "Light, lifted chords")] },
  { id: "AC2", g: "C", name: C("華爾茲加右手", "Waltz with a right-hand note"), time: [3, 4], prog: I4, lh: "waltz", rh: "tones", start: 80, target: 120,
    check: [C("一小節一個大拍的感覺", "Feel one big beat per bar"), LOUD] },
  { id: "AC3", g: "C", name: C("F 大調華爾茲", "Waltz in F"), key: "F", time: [3, 4], prog: I4, lh: "waltz", start: 80, target: 126,
    check: [C("B♭ 用 2 指", "B♭ with finger 2"), C("第 1 拍重、後兩拍輕", "Beat 1 strong, 2 and 3 light")] },
  // D 流行伴奏
  { id: "AD1", g: "D", name: C("左手根音、右手和弦", "LH roots, RH chords"), prog: ["I", "V", "vi", "IV"], lh: "root", rh: "chords4", start: 60, target: 96,
    check: [C("右手換和弦只動最少的手指", "RH moves as few fingers as possible"), C("左手按滿四拍", "LH holds all four beats")] },
  { id: "AD2", g: "D", name: C("左手 1-5-8", "LH 1-5-8"), prog: ["I", "V", "vi", "IV"], lh: "r158", rh: "chords2", start: 52, target: 88,
    check: [C("左手撐開時手腕放鬆", "Loose wrist on the stretch"), C("手小可以移過去,不必撐開", "Small hands: move, don't stretch"), LOUD] },
  { id: "AD3", g: "D", name: C("3+3+2 節奏", "3+3+2 rhythm"), prog: ["I", "V", "vi", "IV"], lh: "root", rh: "c332", start: 56, target: 88,
    check: [C("數 1-2-3 1-2-3 1-2", "Count 1-2-3 1-2-3 1-2"), C("左手按滿四拍", "LH holds all four beats")] },
  { id: "AD4", g: "D", chordName: true, name: C("a 小調", "In A minor"), key: "a", prog: ["i", "iv", "V7", "i"], lh: "block2", rh: "tones", start: 60, target: 96,
    check: [C("V7 有 G♯", "V7 has G♯"), LOUD] }
];

/* 每一關的題目欄位與變化(複習)、音名預設 */
const NAMES_ON = { finger: ["0", "A", "B", "C"], accomp: ["A", "B"] };
function finish(route, list){
  list.forEach((L, k) => {
    const fixedKey = !!L.key && L.key !== "C";
    L.q = { type: "route", r: route, id: L.id, hands: route === "accomp" ? (L.rh ? "HT" : "LH") : L.hands };
    L.names = NAMES_ON[route].includes(L.g);
    if (L.vary) return;
    if (L.g === "0") { L.vary = [V(), V({ dyn: "p" }), V({}, "one-three"), V({ dyn: "f" }, "one"), V({}, "gap")]; return; }   // 第 0 組:只有強弱與拍點模式
    if (route === "finger") {
      const o = {
        noRhythm: ["PB3", "PD4", "PF5", "PF6"].includes(L.id),
        noTouch: L.id === "PF3", noDyn: L.id === "PF4"
      };
      if (L.id === "PE1") {   // 拇指穿越在 F 大調會把拇指放到 B♭ 上:只換到 G
        L.vary = [V(), V({ rhythm: RH(k) }), V({ touch: "stacc", dyn: DY(k) }), V({ rkey: "G" }), V({ rkey: "G", rhythm: RH(k + 1) }, "one-three"), V({ touch: "stacc" }, "gap")];
      } else L.vary = fixedKey ? vary.fixed(k, o) : vary.std(k, o);
    } else {
      const o = { eighths: ["broken", "alberti", "r158"].includes(L.lh), rh: !!L.rh };
      L.vary = fixedKey ? vary.accFixed(k, o) : vary.acc(k, o);
    }
  });
  return list;
}
/* 為什麼練這個(每一組一句;老師的口吻、具體說練了有什麼用,≤ 24 個中文字;dailycard 在這一組第一關第一次出現時寫在段落面板;checks/routes.mjs 檢查) */
const WHY_FINGER = {
  "0": C("先認得中央 C 和手指號碼,看譜才找得到鍵", "Know middle C and finger numbers to find notes from the page"),
  A: C("五指放好不移動,先把每個音彈清楚", "Keep five fingers in place and play every note clearly"),
  B: C("4、5 指最弱,單獨練才會變強", "Fingers 4 and 5 are weakest; train them alone to get stronger"),
  C: C("按住一個音再彈,手指才不會互相牽動", "Hold one note so the other fingers stop moving together"),
  D: C("3、4 指最難分開,練好以後快的音群才彈得順", "Fingers 3 and 4 are hardest to separate; fast runs need them"),
  E: C("學會拇指穿越,才能彈超過五個音的音階", "Thumb-under lets you play scales longer than five notes"),
  F: C("兩手做不同的事,才能一手彈旋律、一手伴奏", "Hands doing different jobs: one melody, one accompaniment"),
  G: C("換到別的位置和調,不是 C 大調的歌也彈得了", "New positions and keys, for songs that aren't in C major")
};
const WHY_ACCOMP = {
  A: C("學會 I、IV、V7 三個和弦,很多兒歌就能配伴奏", "With I, IV and V7 you can accompany lots of simple songs"),
  B: C("同樣的和弦拆開彈,就是古典小奏鳴曲常見的伴奏", "Broken chords like these accompany many classical sonatinas"),
  C: C("生日快樂歌是三拍子,學會華爾茲伴奏就能配", "Happy Birthday is in 3/4; the waltz bass lets you accompany it"),
  D: C("很多流行歌用 I–V–vi–IV,學會就能自彈自唱", "Many pop songs use I–V–vi–IV; learn it to play and sing")
};
export const ROUTES = [
  { id: "finger", name: ["手指", "Fingers"], why: WHY_FINGER, levels: finish("finger", FINGER) },
  { id: "accomp", name: ["伴奏", "Accomp."], unlock: { route: "finger", passed: "PA5" }, why: WHY_ACCOMP, levels: finish("accomp", ACCOMP) }
];

/* ══ 複習的變化只用學過的(系統化規則;daily.js 的 extras.vary)══
   附點 / 反附點:還沒有教的關 → 不用;斷奏:過了 PF3;換到 G / F:學過那個調(手指 PG1 / PG2 或伴奏 AA4 / AA5)。
   拿掉以後什麼都不剩 → 退回拍點模式的變化(盒 2 只響 1、3 拍、盒 3 只響第 1 拍、之後中途消失) */
const LEARNED_KEY = { G: p => p("finger", "PG1") || p("accomp", "AA4"), F: p => p("finger", "PG2") || p("accomp", "AA5"), a: p => p("accomp", "AD4"), C: () => true };
export const keyLearned = (k, passed) => !!(LEARNED_KEY[k] && LEARNED_KEY[k](passed));
const FALLBACK = ["one-three", "one", "gap"];
export function adaptVary(v, { level, box, passed }){
  if (!v || !v.q) return v;
  const q = { ...v.q };
  if (q.rhythm) delete q.rhythm;
  if (q.touch === "stacc" && !passed("finger", "PF3")) delete q.touch;
  if (q.rkey && q.rkey !== (level.key || "C") && !keyLearned(q.rkey, passed)) delete q.rkey;
  if (JSON.stringify(q) === JSON.stringify(v.q)) return v;
  const out = V(q, v.click || null);
  if (!out.q && !out.click) out.click = FALLBACK[(Math.max(2, box) - 2) % FALLBACK.length];
  return out;
}

/* ══ 暖身(不過關、只記時間):照手指路線的進度,初學從四分音符開始 ══
   只用已經過的關:過了第 0 組 → 手指號碼;過了 PA2 → 五指位置兩手輪流(四分);過了 PA4 → 雙手(四分);過了 PA5 → 雙手八分;過了 E 組 → 一個八度音階雙手八分。
   調 = 今天伴奏那一關的調(暖身跟今天的伴奏同一個調);名稱前面加調名(app.js 的 warmItem)*/
export const WARM_LEVELS = {
  w0: { id: "w0", name: C("手指號碼(右手)", "finger numbers, RH"), hands: "RH", value: "q", rh: "1 3 2 4 | 5 3 4 2" },
  w5s: { id: "w5s", name: C("五指位置(兩手輪流)", "five fingers, hands in turn"), hands: "HT", value: "q", rh: "1 2 3 4 | 5 4 3 2 | R | R", lh: "R | R | 5 4 3 2 | 1 2 3 4" },
  w5q: { id: "w5q", name: C("五指位置", "five fingers"), hands: "HT", value: "q", rh: "1 2 3 4 | 5 4 3 2", lh: "5 4 3 2 | 1 2 3 4" },
  w5e: { id: "w5e", name: C("五指位置", "five fingers"), hands: "HT", value: "e", rh: x2("1 2 3 4 5 4 3 2"), lh: x2("5 4 3 2 1 2 3 4") },
  wsc: { id: "wsc", name: C("音階 1 個八度", "scale, one octave"), hands: "HT", scale: true }
};
for (const W of Object.values(WARM_LEVELS)) W.q = { type: "route", warm: W.id, hands: W.hands };
/* 暖身只用已經過的關(系統化規則:不能等於目前或下一關);一關都還沒過(第一天)= 不排暖身,直接從第 0 組開始 */
export function warmFor(passed){
  return passed("finger", "PE3") ? "wsc" : passed("finger", "PA5") ? "w5e" : passed("finger", "PA4") ? "w5q" : passed("finger", "PA2") ? "w5s" : passed("finger", "P01") ? "w0" : null;
}
export const KEYS = KEY_NAME;
export function findLevel(q){
  if (q.warm) return WARM_LEVELS[q.warm] || null;
  const R = ROUTES.find(r => r.id === q.r);
  return R ? R.levels.find(l => l.id === q.id) || null : null;
}
