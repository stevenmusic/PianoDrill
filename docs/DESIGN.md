# 設計規格(方向 B「填色層次」;2026-11 使用者選定)

兩個 App(PianoDrill / DrumDrill)共用。`css/app.css` 是 sync.json 的 `same`:改完複製到另一個 repo,跑 `node tools/test/sync.mjs`。
跟 CLAUDE.md「畫面設計」「系統化規則」衝突時以 CLAUDE.md 為準;這份只管「長什麼樣子」。
預覽:注入用的 CSS 與截圖(不在 repo)= 設計員的暫存資料夾 `design/css/final-B.css`、`design/final-B.png`。

## 1. 原則

像 iOS 的「分組清單」:**用底色與陰影分層,不用框線**。頁面底色最深(淺色主題最灰)、卡片浮起來一層、卡片裡「重點」凹進去一層,三層就夠。
**金色只給能按的**(主要鈕金底、次要鈕金色淡底、選中格金底、▶ 金底);不能按的資訊(標籤、卡片標題、數字)用象牙白 / 淡色。
唯一的例外是品牌:頂欄品牌名、題目大標題保留**金色襯線**(Noto Serif TC 700)— 一眼認得是這個 App,也是畫面上唯一最大的字。
字級只有五級,一級做一件事;字重只有 400 / 500 / 700(Noto Sans TC 只載入這三個,600 會變成 700)。
7 歲、70 歲:標籤 ≥ 14、狀態句 17、按鈕看起來就是按鈕(有底色)、標籤看起來不是按鈕(中性膠囊、沒有金色)。

## 2. 設計代幣(加在 app.css 開頭的 `:root` / `:root.light`)

### 2.1 字級:五級(rem,跟著系統字級;根字級 17px)

| 代幣 | 預設 | 上限 | 用在 |
|---|---|---|---|
| `--fs-title` | `calc(26rem / 17)` = 26 | **34px**(1.3 倍) | 題目大標題(金色襯線)、速度數字、練習紀錄數字、`.q-title.empty` 以外的大字 |
| `--fs-head` | `calc(19rem / 17)` = 19 | 38px | 空狀態大字 `.q-title.empty`、清單大項 `.ir-name` |
| `--fs-body` | `calc(17rem / 17)` = 17 | 34px | 狀態 / 下一步那一句、卡片標題(`.card-title b`)、段落內文 |
| `--fs-sub` | `calc(14rem / 17)` = 14 | 28px | **標籤 `.q-tag`**、所有按鈕文字、分段鈕、說明行、重點清單、提示 |
| `--fs-cap` | `calc(12rem / 17)` = 12 | 24px | ▶ 小字、`.card-title .sub`、7 天的星期、頁尾、熟練度小字 |

寫法:`--fs-title:min(calc(26rem / 17), 34px)`(其他同理)。
**過渡**:舊代幣先指到新的五級,不用一次改完所有規則:
`--fs-2xs / --fs-xs → --fs-cap`、`--fs-sm / --fs-md → --fs-sub`、`--fs-lg → --fs-body`、`--fs-xl → --fs-head`、`--fs-2xl → --fs-title`。
新規則只用五個新代幣;「主要資訊 ≥ `--fs-md`」改讀成「≥ `--fs-sub`」。
**例外(不跟字階)**:品牌名 `header h1` 改寫死 `clamp(12px, 3.7vw, min(calc(16rem / 17), 32px))`(要跟 ScrollScore / HarmonyMap 逐項相同;手機橫式那條寫死 `min(calc(13rem / 17), 26px)`);
譜面裡的字(音名、指法、OSMD)不動;手機橫式技巧大標題 = `calc(var(--fs-title) * .85)`。
要換成代幣的寫死 px 字級:app.css 15 處、sight.css 4 處、DrumDrill drum.css 11 處(`grep -n "font-size:[^;]*px" css/*.css`)。

### 2.2 字重
400 內文 · 500 次要按鈕、標籤、狀態句 · 700 題目大標題、卡片標題、主要按鈕、選中格、數字。不用 600。

### 2.3 間距(4 的倍數)
4 / 8 / 12 / 16 / 20。卡片內距照舊(`--card-py / --card-px`:16/14,手機 10/12);卡片之間:寬畫面 12、手機維持「緊湊」8;
題目卡裡列與列 8(手機 `.daily-step` gap 8);標籤之間 6;按鈕之間 6–8。

### 2.4 顏色與層次(只用現有品牌色衍生)

| 代幣 | 深色 | 淺色 | 說明 |
|---|---|---|---|
| `--bg` | `#0A0805`(原 #0C0A07) | `#F3EEE3`(原 #FBF7EE) | 頁面底色;比卡片深 / 灰一層 |
| `--panel` | `#1A150C`(原 #161209) | `#FFFDF8`(原 #F4EEE0) | 卡片 |
| `--fill-btn`(新) | `rgba(242,185,75,.14)` | `rgba(122,92,22,.10)` | 次要按鈕、沒選的 chip / opt / mbtn |
| `--fill-tag`(新) | `rgba(255,255,255,.07)`(= seg-track) | `rgba(60,45,10,.08)` | 標籤膠囊、主題 / 語言鈕 |
| `--fill-inset`(新) | `rgba(10,8,5,.55)` | `#F3EEE3` | 「重點」方塊(凹進去) |
| `--shadow-card`(新) | `inset 0 1px 0 rgba(255,255,255,.04), 0 6px 18px rgba(0,0,0,.35)` | `0 1px 3px rgba(90,72,30,.08), 0 8px 24px rgba(90,72,30,.06)` | 卡片 |
| `--shadow-primary`(新) | `0 4px 12px rgba(242,185,75,.25)` | `0 4px 12px rgba(122,92,22,.22)` | 主要按鈕 |
| `--shadow-play`(新) | `0 6px 16px rgba(242,185,75,.30)` | `0 6px 16px rgba(122,92,22,.25)` | 圓形 ▶ |
| `--radius-card`(新) | 20px | 同 | 卡片 |
| `--radius-inset`(新) | 14px | 同 | 重點方塊 |

題目卡頂端淡金漸層 `rgba(242,185,75,.05)` → 透明 140px(淺色 `rgba(122,92,22,.05)`);**不能超過 .05**(.06 起 `--muted` 小字對比 < 4.5)。
`--line` 只留給:分隔線(結果上面那條)、樂譜紙張的內框、輸入框。其他框線全拿掉。
對比(已算過,≥ 4.5):標籤字 / 膠囊 深 6.2、淺 7.3;次要鈕金字 深 7.7、淺 5.3;`--muted` / 卡片 深 5.0、淺 5.7;`--muted` / 頁面 深 5.5、淺 5.0;青綠標籤 深 6.4、淺 6.3。

## 3. 元件對照表

| 元件 | 現在 | 改成 |
|---|---|---|
| `header` | panel 底 + 下框線 | `--bg` 底、無框線(捲動時照舊 sticky) |
| `.card` | 1px `--line` 框 + 頂端 tint 漸層、圓角 14 | 無框、無漸層、`--shadow-card`、圓角 `--radius-card` 20 |
| `.quiz`(題目卡) | 同卡片 | 卡片 + 頂端淡金漸層(2.4) |
| `.card-title b` | 襯線 16 金色 | Noto Sans 700、`--fs-body`、`--ivory`、letter-spacing .02em |
| `.card-title .sub` | 12 | `--fs-cap`、`--muted-bright`(不變) |
| `.btn.primary` | 金底 | 金底 + `--shadow-primary`;字 700 |
| `.btn`(次要) | 1px 金框、透明底 | **無框、`--fill-btn` 底、金字、500**;`:active` 照舊金底 |
| `.btn.ghost` | `--line` 框、淡字 | 同次要(`--fill-btn` 底、金字);它也能按 |
| `.btn:disabled` | — | 不加底色,`opacity` 照舊 |
| `.chip`、`.opt`、`.mbtn` | 1px `--line` 框、inset 底 | 無框、`--fill-btn` 底;選中 = 金底 `--on-fill` 字 700(刪掉 `:root.light .chip[aria-pressed]` 的淡底覆寫,淺色也是金底) |
| `.mbtn` 選中 | 青綠 / 橘 | 不變(會了 = 青綠、再練 = 橘) |
| `.goal .chip.done` | 青綠框 | 青綠字 + `rgba(63,191,174,.14)` 底(淺色 `.10`),無框 |
| `.sel`、`.field select` | 框 | 照舊(輸入框保留框線) |
| `.seg` | iOS 原生 | **不動**(已定案) |
| `#themeToggle`、`#langToggle` | 框 | 無框、`--fill-tag` 底、`--muted-bright` 字;選中照舊金底 |
| `.play-round` | 金底 52 | 加 `--shadow-play`;大小不動 |
| `.play-round[data-cap]::after` | 置中在 ▶ 下 | **右緣對齊 ▶ 右緣**(`left:auto;right:0;transform:none;text-align:right`)、`--fs-cap`、`--muted-bright`;不超出卡片內距 |
| `.q-title` | 襯線金 `clamp(26px,7.4vw,40px)` | 襯線金(保留)、`--fs-title`(上限 34)、line-height 1.35;固定高度改成 `calc(var(--fs-title) * 1.35)`;`#mod-tech .q-title` 的 margin-top 改成 `max(0px, calc((52px - var(--fs-title) * 1.35) / 2))`;`#mod-ear .q-title` 也用 `--fs-title`(拿掉 clamp) |
| `.q-tag` | 金字 700、金色淡底、`clamp(14px,4.2vw,18px)`、圓角 8 | **中性膠囊**:`--fill-tag` 底、`--muted-bright` 字、500、`calc(var(--fs-sub) * var(--tag-scale, 1))`、line-height 1.4、圓角 999、內距 4 × 11(`#mod-tech` 縮字時左右內距 `calc(11px * var(--tag-scale, 1))`);`.q-tags` min-height 改 `calc(var(--fs-sub) * 1.4 + 8px)` |
| `.q-tag.dyn` | 青綠 | 青綠字 + 青綠淡底(深 .14 / 淺 .10),無框 |
| `.q-tag.best` | 金框 | 同 `.dyn`(青綠 = 達成,跟「本週達標」同一個意思);金色不給不能按的 |
| `.q-tag .lv-bar` | — | left / right 11px、bottom 1、高 2 |
| `.daily-status` | 16 | `--fs-body`、500 |
| `.daily-tip`、`.daily-why`、`.q-intro` | 13–14 | `--fs-sub`、`--muted-bright` |
| `.daily-check`(重點) | 上框線 + 清單 | **凹進去的方塊**:`--fill-inset` 底、圓角 `--radius-inset`、內距 10 × 14、`--fs-sub`、`--ivory`;小標「重點」`--fs-cap` 700 `--muted-bright` letter-spacing .06em |
| `.daily-step` | 上框線 | 拿掉上框線(卡片已經分層),padding-top 2 |
| `.daily-bar b` | 襯線 | Noto Sans 700、`--fs-sub`、`--ivory` |
| 速度卡 `.bpm b` | 襯線金 30–40 | Noto Sans 700、`--fs-title`、`--ivory`;`.bpm small` `--fs-cap` |
| 速度卡(今日練習進行中) | 有拍點小點 | `#mod-tech.daily-on #t-metroCard .beats{display:none}` |
| `.log-stats b` | 襯線金 | Noto Sans 700、`--ivory`;大小照「緊湊」那條(只把 px 換 rem) |
| `.log-week i.on` | 金底 | 不動(7 天點是圓形按鈕) |
| 譜卡 `.paper` | 圓角 8 | 圓角 12;紙張內框保留 |
| `.item-row` | — | 不是卡片(照 CLAUDE.md),不加底色;`.ir-name` `--fs-head` |
| `.quiz.hint-empty .q-hint` | 14 | `--fs-sub` → 建議 `--fs-body`(一句提示是主要資訊;中英同高要重量) |
| `footer` | 一直顯示 | 今日練習進行中藏起來:外框在 `ctx.setSubActive(on, view)` 時給 body 加 `daily-on`,`body.daily-on footer{display:none}`(不用 `:has`,iPhone 舊版不吃) |
| `.verify-badge` | 橘框膠囊 | 不動(只在檢定頁「考試內容」) |

## 4. 已定案、不能動
- 分段鈕 iOS 原生樣式(`.seg`:`--seg-track` 軌道圓角 10、選中塊圓角 8 + 陰影、`--seg-sep` 分隔線)
- 按鈕圓角 `--radius-btn` 12(`.btn .chip .opt .mbtn .sel`);只有圖示的圓形鈕(主題、語言、▶、7 天點)維持圓形
- 品牌色:金(深 `#F2B94B` / 淺 `#7A5C16`)、深底與淺底;品牌名的 CSS 跟 ScrollScore / HarmonyMap 逐項相同;Salamander 譜面(白紙 `--paper`)
- 會用到的點擊區 ≥ 44(最低 28);按鈕高度用 `min-height`,字級放大換行不截字
- 中英版面同高(`pairText`、固定格子、題目一行 + `fitTitle` 縮字、標籤 `--tag-scale` 0.82 下限再換行)
- 第一個畫面看得到子項目列、題目、▶、主要按鈕(`tasks.mjs` 的 `first`、`layout.mjs` 題目卡在上半部)
- 手機「緊湊」:卡片內距 10/12、卡片之間 8;不縮按鈕點擊範圍、譜面、內文字級
- 小字對比 ≥ 4.5(兩種主題)

## 5. 短譜放大(今日練習 / 技巧的換行譜)

現在 `js/tech/app.js` 的 `fitWrap()` 只縮不放(上限 `base` = 手機 0.85),一兩小節的關卡在手機上只佔譜框一半寬。改法:

1. 常數 `const WRAP_FILL = 1.35;`(放大上限 = base × 1.35)、`WRAP_FILL_H = 0.34;`(譜高不超過畫面高 34%,第一個畫面還看得到題目卡與主要按鈕)
2. 在 `pick` 決定之後、手機橫放那段之前:**不是手機橫放**、`pick.z >= base`(原本就放得下)、`pick.n === bars`(整份一行)時,
   用同一個 `fits()` 在 `[base, base * WRAP_FILL]` 二分 6 次,另外檢查 `svg.getBoundingClientRect().height <= innerHeight * WRAP_FILL_H`,取最大的;`Math.floor(z * 100) / 100`
3. 手機橫放照舊(只縮不放);`window.__wrap` 照舊記 `zoom`
4. DrumDrill 對應:`js/tech/route.js` 的換行排法(`ONE_MIN` / `WRAP_MIN1` 那段)同樣加;視奏 `fitScore` 不改(考卷排法)
5. 跑:`node tools/test/dailyfit.mjs`(SVG 不超出譜框、不左右捲)、`node tools/test/playhead.mjs 390` 與 `430`(≤ 2 px)、`node tools/test/tasks.mjs`(第一個畫面)、`ONLY=fold-280,se1-320,iphone-390,promax-430 node tools/test/layout.mjs`

## 6. 實作順序(一步一個 commit;每步跑完再下一步)

每步共同:`node tools/build/stamp.mjs` → `node tools/test/verify.mjs`(含版本指紋)→ app.css 複製到 DrumDrill → `DRUMDRILL=/home/user/drumdrill node tools/test/sync.mjs`。

1. **代幣**:`:root` / `:root.light` 加 2.1 五級字階與 2.4 新代幣、改 `--bg` / `--panel`;舊字級代幣指到五級;品牌名寫死。
   測:`node tools/test/bilingual.mjs`、`node tools/test/clip.mjs`、`layout.mjs` 全套(含「字級 200%」)— fs-sm 13 → 14 最可能在 fold-280 擠掉格子(技巧選單、級數 9 格、聽力作答鈕),擠的地方只在那一處用 `--fs-cap`,不改代幣
2. **卡片**:`.card`、`.quiz`、`header`、`.card-title b`、`.paper`、`.daily-step`。測:`layout.mjs`(ONLY 手機 4 種 + 寬畫面 1 種)、`tasks.mjs`
3. **按鈕**:`.btn` 次要 / ghost / primary、`.chip`、`.opt`、`.mbtn`、主題語言鈕、`.goal .chip.done`、`.play-round` 陰影與小字靠右。測:`bilingual.mjs`、`clip.mjs`、`node tools/test/human.mjs 150 3`
4. **標籤**:`.q-tag`(含 `.dyn` `.best` `.lv-bar`、`#mod-tech` 內距、`.q-tags` min-height;DrumDrill drum.css 的 `#t-qTags .q-tag.fold`、`#mod-ear .q-tag` 寫死 14px 那條)。
   測:`bilingual.mjs`(標籤縮字後中英同高)、`clip.mjs`、`layout.mjs` fold-280 / se1-320
5. **字級**:`.q-title`(高度、margin-top、ear 的 clamp)、`.daily-status / tip / why / check`、`.bpm b`、`.log-stats b`、寫死 px 的 30 處換代幣、`.hint-empty .q-hint`。
   測:`bilingual.mjs`、`clip.mjs`(g j p y 下伸)、`layout.mjs` 全套(字級 200%)、`tasks.mjs`、`node tools/test/playback.mjs`
6. **譜**:第 5 節。測:`dailyfit.mjs`、`playhead.mjs 390`、`playhead.mjs 430`、`tasks.mjs`
7. **各分頁細節**:練習中藏頁尾(main.js 共用部分,markers 區段外)、速度卡藏拍點小點、`.daily-check` 方塊、`.item-row` / `.ir-name`、檢定頁空狀態。
   測:`tasks.mjs`、`layout.mjs` 全套、`bilingual.mjs`、`human.mjs`;DrumDrill 同一套再跑一次(它的 tasks / layout / bilingual / clip / a11y)

完成後:叫審查員看 diff(跨兩個 App、共用檔 = 大改);用 `appshots.mjs` 重拍上架截圖。
