# 設計規格(方向 B「填色層次」;2026-11 使用者選定。**顏色以第 8 節為準**:2026-11-06 使用者選顏色規則乙 + 美觀方向 B「主角清楚」;**寬畫面(≥ 1100)以第 9 節為準**)

兩個 App(PianoDrill / DrumDrill)共用。`css/app.css` 是 sync.json 的 `same`:改完複製到另一個 repo,跑 `node tools/test/sync.mjs`。
跟 CLAUDE.md「畫面設計」「系統化規則」衝突時以 CLAUDE.md 為準;這份只管「長什麼樣子」。
預覽:注入用的 CSS 與截圖(不在 repo)= 設計員的暫存資料夾 `design/css/final-B.css`、`design/final-B.png`。

## 1. 原則

像 iOS 的「分組清單」:**用底色與陰影分層,不用框線**。頁面底色最深(淺色主題最灰)、卡片浮起來一層、卡片裡「重點」凹進去一層,三層就夠。
**(顏色被第 8 節取代:選中改中性、題目大標題改象牙白)** **金色只給能按的**(主要鈕金底、次要鈕金色淡底、選中格金底、▶ 金底);不能按的資訊(標籤、卡片標題、數字)用象牙白 / 淡色。
唯一的例外是品牌:頂欄品牌名保留**金色襯線**(Noto Serif TC 700)。題目大標題 2026-11 改**黑體 700**(Noto Sans TC,顏色照舊金色;使用者選「專心練習畫面」A,第 7 節):**襯線只留頂欄品牌名**,其他大字(難度數字、清單大項、第一次的問題標題、倒數、聽力作答鍵、時值作答鈕)一律黑體。
字級只有五級,一級做一件事;字重只有 400 / 500 / 700(Noto Sans TC 只載入這三個,600 會變成 700)。
7 歲、70 歲:標籤 ≥ 14、狀態句 17、按鈕看起來就是按鈕(有底色)、標籤看起來不是按鈕(中性膠囊、沒有金色)。
**分頁輔色(已被第 8 節取代:拿掉分頁輔色,選中一律中性)**(2026-11 使用者選 B):每個分頁一個輔色,**只用在**底部分頁列選中那格(圖示、字、淡底)與分段鈕(`.seg`:選中塊、沒選的字、分隔線;含各分頁裡的分段鈕,例如視奏難度、手的切換、考試系統與級數)。
技巧 = 金、視奏 = 天藍、聽力 = 紫、檢定 = 中性(iOS 灰白);主要按鈕、▶、次要鈕、chip / opt(例如「顯示音名」、認音的範圍快捷)一律維持金色。兩個 App 一樣(見 2.5)。

## 2. 設計代幣(加在 app.css 開頭的 `:root` / `:root.light`)

### 2.1 字級:五級(rem,跟著系統字級;根字級 17px)

| 代幣 | 預設 | 上限 | 用在 |
|---|---|---|---|
| `--fs-title` | `calc(26rem / 17)` = 26 | **34px**(1.3 倍) | 題目大標題(黑體;顏色 = 象牙白,第 8 節)、速度數字、練習紀錄數字、`.q-title.empty` 以外的大字 |
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
| `--fill-inset`(新) | `rgba(10,8,5,.55)` | `#ECE6D8`(= 淺色頁面底色 `--bg`;2026-11 使用者選「拉開底色」,原本 `#F3EEE3`) | 「重點」方塊(凹進去) |
| `--shadow-card`(新) | `inset 0 1px 0 rgba(255,255,255,.04), 0 6px 18px rgba(0,0,0,.35)` | `0 1px 3px rgba(90,72,30,.08), 0 8px 24px rgba(90,72,30,.06)` | 卡片 |
| `--shadow-primary`(新) | `0 4px 12px rgba(242,185,75,.25)` | `0 4px 12px rgba(122,92,22,.22)` | 主要按鈕 |
| `--shadow-play`(新) | `0 6px 16px rgba(242,185,75,.30)` | `0 6px 16px rgba(122,92,22,.25)` | 圓形 ▶ |
| `--radius-card`(新) | 20px | 同 | 卡片 |
| `--radius-inset`(新) | 14px | 同 | 重點方塊 |

題目卡頂端淡金漸層 `rgba(242,185,75,.05)` → 透明 140px(淺色 `rgba(122,92,22,.05)`);**不能超過 .05**(.06 起 `--muted` 小字對比 < 4.5)。
`--line` 只留給:分隔線(結果上面那條)、樂譜紙張的內框、輸入框。其他框線全拿掉。
對比(已算過,≥ 4.5):標籤字 / 膠囊 深 6.2、淺 7.3;次要鈕金字 深 7.7、淺 5.3;`--muted` / 卡片 深 5.0、淺 5.7;`--muted` / 頁面 深 5.5、淺 5.0;青綠標籤 深 6.4、淺 6.3。

### 2.5 分頁輔色(2026-11 使用者選 B;app.css 開頭)— **已被第 8 節取代**(2026-11-06 使用者:「有其他顏色和金色參在一起,感覺很怪」;下面只留作紀錄,不要照做)

外框(main.js 共用部分的 `showView`)在 body 加 `tab-tech` / `tab-sight` / `tab-ear` / `tab-exam`(不用 `:has`);沒有 class = 技巧。
代幣:`--acc-text`(沒選的分段鈕字、分頁列選中的圖示與字)、`--acc-fill`(分段鈕選中塊)、`--acc-on`(選中塊上的字)、`--acc-tint`(分頁列選中淡底、分段鈕按下)、`--acc-sep`(分段鈕分隔線)。

| 分頁 | `--acc-text` 深 / 淺 | `--acc-fill` 深 / 淺 | `--acc-on` | `--acc-tint` 深 / 淺 |
|---|---|---|---|---|
| 技巧 | `--gold` | `--gold-fill` | `--on-fill` | `rgba(242,185,75,.12)` / `rgba(133,100,24,.10)` |
| 視奏 | `#62B6F0` / `#0D5A8C` | `#62B6F0` | `#16110A` | `rgba(98,182,240,.14)` / `rgba(13,90,140,.10)` |
| 聽力 | `#B79AF5` / `#5B3DA8` | `#B79AF5` | `#16110A` | `rgba(183,154,245,.14)` / `rgba(91,61,168,.10)` |
| 檢定 | `#F4ECDA` / `#241E12` | `#5A5242` / `#FFFFFF` | `#F4ECDA` / `#241E12` | `rgba(244,236,218,.10)` / `rgba(36,30,18,.07)` |

`--acc-sep` = 技巧照 `--seg-sep`,其他 = 輔色 30%(檢定 22%)。對比(iphone-390 實測,最低):深色 選中塊 6.1–8.1、沒選的字 6.8 以上;淺色 沒選的字 4.7(技巧,原本就是)/ 5.1(視奏)/ 5.5(聽力)/ 11.6(檢定)。

## 3. 元件對照表

| 元件 | 現在 | 改成 |
|---|---|---|
| `header` | panel 底 + 下框線 | `--bg` 底、無框線(捲動時照舊 sticky) |
| `.card` | 1px `--line` 框 + 頂端 tint 漸層、圓角 14 | 無框、無漸層、`--shadow-card`、圓角 `--radius-card` 20 |
| `.quiz`(題目卡) | 同卡片 | 卡片 + 頂端淡金漸層(2.4)→ **第 8 節拿掉漸層** |
| `.card-title b` | 襯線 16 金色 | Noto Sans 700、`--fs-body`、`--ivory`、letter-spacing .02em |
| `.card-title .sub` | 12 | `--fs-cap`、`--muted-bright`(不變) |
| `.btn.primary` | 金底 | 金底 + `--shadow-primary`;字 700 |
| `.btn`(次要) | 1px 金框、透明底 | **無框、`--fill-btn` 底、金字、500**;`:active` 照舊金底 |
| `.btn.ghost` | `--line` 框、淡字 | 同次要(`--fill-btn` 底、金字);它也能按 |
| `.btn:disabled` | — | 不加底色,`opacity` 照舊 |
| `.chip`、`.opt`、`.mbtn` | 1px `--line` 框、inset 底 | 無框、`--fill-btn` 底;選中 = 金底(**第 8 節改中性**) `--on-fill` 字 700(刪掉 `:root.light .chip[aria-pressed]` 的淡底覆寫,淺色也是金底) |
| `.mbtn` 選中 | 青綠 / 橘 | 不變(會了 = 青綠、再練 = 橘)→ **第 8 節:再練改中性,不用橘** |
| `.goal .chip` | 灰字淡底(像標籤) | 金字 500 + 右邊線稿鉛筆 16(`::after` mask;2026-11 使用者選 B,看得出能點) |
| `.goal .chip.done` | 青綠框 | 青綠字 + `rgba(63,191,174,.14)` 底(淺色 `.10`),無框 |
| `.sel`、`.field select` | 框 | 照舊(輸入框保留框線) |
| `.seg` | iOS 原生 | 形狀**不動**(已定案);顏色 = 分頁輔色(2.5)→ **第 8 節:中性** |
| `#themeToggle`、`#langToggle` | 框 | 無框、`--fill-tag` 底、`--muted-bright` 字;**不管哪種主題 / 語言都是中性底**(不換金色:金色只給主要動作,第 7 輪);點擊區 `::after` 44 |
| `.qrow`(檢定清單一列) | 1px `--line` 框 | 無框、`--fill-btn` 底(跟 DrumDrill `button.xitem` 一樣);(**第 8 節:目前這一題內圈改象牙白**)目前這一題 `inset 0 0 0 2px --gold` |
| `.modal-card`(第一次的問題) | panel + 框 | 無框;深色比卡片亮一層 `#2A2316` + 上緣 1px 亮線(遮罩後分得出邊緣);「開始準備考試」= 主要(選好級數才金底)、「不考試」= 次要 |
| `.log-week i`(7 天空點) | `--line` 外圈 | `--muted` 外圈(對比 ≥ 3:1,深淺主題) |
| `.play-round` | 金底 52 | 加 `--shadow-play`;大小不動 |
| `.play-round[data-cap]::after` | 置中在 ▶ 下 | **右緣對齊 ▶ 右緣**(`left:auto;right:0;transform:none;text-align:right`)、`--fs-cap`、`--muted-bright`;不超出卡片內距 |
| `.q-title` | 襯線金 `clamp(26px,7.4vw,40px)` | **黑體 700**(顏色:**第 8 節改象牙白**)(2026-11 第 7 節;原本襯線)、`--fs-title`(上限 34)、line-height 1.35;固定高度改成 `calc(var(--fs-title) * 1.35)`;`#mod-tech .q-title` 的 margin-top 改成 `max(0px, calc((52px - var(--fs-title) * 1.35) / 2))`;`#mod-ear .q-title` 也用 `--fs-title`(拿掉 clamp) |
| `.q-tag` | 金字 700、金色淡底、`clamp(14px,4.2vw,18px)`、圓角 8 | **中性膠囊**:`--fill-tag` 底、`--muted-bright` 字、500、`calc(var(--fs-sub) * var(--tag-scale, 1))`、line-height 1.4、圓角 999、內距 4 × 11(`#mod-tech` 縮字時左右內距 `calc(11px * var(--tag-scale, 1))`);`.q-tags` min-height 改 `calc(var(--fs-sub) * 1.4 + 8px)` |
| `.q-tag.dyn` | 青綠 | 青綠字 + 青綠淡底(深 .14 / 淺 .10),無框 |
| `.q-tag.best` | 金框 | 同 `.dyn`(青綠 = 達成,跟「本週達標」同一個意思);金色不給不能按的 |
| `.q-tag .lv-bar` | — | left / right 11px、bottom 1、高 2 |
| `.daily-status` | 16 | `--fs-body`、500 |
| `.daily-tip`、`.daily-why`、`.q-intro` | 13–14 | `--fs-sub`、`--muted-bright` |
| `.daily-check`(重點) | 上框線 + 清單 | **一行**(2026-11 第 7 節;原本凹進去的方塊):小標「重點」`--fs-cap` 700 `--muted-bright` letter-spacing .06em + 每項 `--fs-sub` `--ivory` 用「 · 」接起來,放不下在項目之間換行(不切);PianoDrill 放在琴鍵條下面 |
| `.daily-step` | 上框線 | 拿掉上框線(卡片已經分層),padding-top 2 |
| `.daily-bar b` | 襯線 | Noto Sans 700、`--fs-sub`、`--ivory` |
| 速度卡 `.bpm b` | 襯線金 30–40 | Noto Sans 700、`--fs-title`、`--ivory`;`.bpm small` `--fs-cap` |
| 速度卡(今日練習進行中) | 有拍點小點 | `#mod-tech.daily-on #t-metroCard .beats{display:none}` |
| `.log-stats b` | 襯線金 | Noto Sans 700、`--ivory`、`--fs-title`(手機不超過一格寬的 2/5:`min(var(--fs-title), calc(11vw - 4px))`) |
| `.log-week i.on` | 金底 | ~~不動~~ → 第 8 節:練過的點改象牙白(7 天點不能按,是資訊) |
| 譜卡 `.paper` | 圓角 8 | 圓角 12;紙張內框保留 |
| `.item-row` | — | 不是卡片(照 CLAUDE.md),不加底色;`.ir-name` `--fs-head` |
| `.quiz.hint-empty .q-hint` | 14 | `--fs-sub` → 建議 `--fs-body`(一句提示是主要資訊;中英同高要重量) |
| `footer` | 一直顯示 | 今日練習進行中藏起來:外框在 `ctx.setSubActive(on, view)` 時給 body 加 `daily-on`,`body.daily-on footer{display:none}`(不用 `:has`,iPhone 舊版不吃) |
| `.daily-cta`(今日練習底部按鈕列,2026-11 新增) | 按鈕列在題目卡裡 | `position:fixed` 貼在分頁列正上方(手機橫式貼底、左邊讓出分頁列 68 + safe area);`--panel` 底 + 往上的陰影(深 `0 -8px 24px rgba(0,0,0,.25)`、淺 `0 -6px 18px rgba(90,72,30,.10)`),不畫框;z-index 比分頁列高(蓋住分頁列上緣那條線,接成一塊);內距 8 × 10(> 600 寬 14;≥ 1100 寬按鈕跟一欄的卡片同寬置中,最寬 1100);主要按鈕 `flex:1`、高 52(手機橫式 44)、`--fs-body`,左邊最多一顆次要(「還要練」,最小 6.5em);「■ 停止」用次要外觀、同一個位置;`body.daily-on main` 底部留白多 68 |
| `.cta-bar`(題目卡最後一行固定在底部,2026-11 使用者選定) | 視奏、聽力的 `.q-foot`、技巧的 `.q-last`、檢定頁空狀態那一行在題目卡裡,狀態句、結果插進來會被往下推 | 手機(直式 ≤ 600 寬、手機橫式)外觀照上面的 `.daily-cta`(固定在分頁列正上方 / 橫式貼底讓出左邊分頁列、`--panel` 底 + 往上的陰影、z-index 31);外框(main.js 共用部分的 `syncCta`)只給目前模組第一張看得到的題目卡最後一個有按鈕的列加 `.cta-bar`、body 加 `has-cta` 與 `--cta-h`(`body.has-cta main` 底部留白 = 84 + 這一列的高;橫式 = 這一列 + 12);今日練習段落進行中(`body.daily-on`)不加,只有 `.daily-cta`;左 = 次要(≥ 44)、右 = 主要 `flex:1`、高 52(橫式 44)、`--fs-body`;放不下時主要按鈕整條換到下一行(折疊機「會了 / 再練」+「隨機抽考」兩行),不截字;平板、桌機照舊在題目卡裡;模組的自動捲動扣掉這一列(視奏 `floorY`、技巧 `ctaEl`) |
| `.daily-road-btn`(今日卡「路線」,2026-11 新增) | — | 次要 ghost(`--fill-btn` 底、金字)、滿寬、≥ 44、`aria-expanded`;在「開始 / 繼續今天的練習」或練完卡「再練一下」下面;進行中不顯示 |
| `.daily-road`(路線圖,卡內展開) | — | 每條路線一段:小標(路線名,`--fs-sub` 700 `--muted-bright`)→ 一列一組 `.road-gb`(`--fill-btn` 底、圓角 12、≥ 44:狀態圖示 20 + 組名 + 「3 / 6」+ ⌄);組裡一關一行 `.road-lb`(無底、≥ 44,關名換行不截字),點一關展開重點 `.road-chk`(同 `.daily-check` 的凹進去方塊);狀態圖示線稿 24 格 stroke 2:過了 = 圈 + 勾(青綠)、目前 = 圈 + 實心點(象牙白、字 700)、還沒到 = 空圈(淡色)、還沒開放 = 鎖(淡色一行寫開放條件);預設只展開每條路線目前那一組 |
| `.celebrate`(過關慶祝,2026-11 新增) | — | 段落面板狀態句上面一條膠囊:青綠字 + 青綠淡底疊在卡片色上(不透明;深 .14 / 淺 .10)、`--fs-sub` 700、高 36;`position:absolute` 疊在狀態句上面那一列(標籤列)左邊,不佔位置(出現、消失時下面都不跳;第 9 輪);線稿星星 24 用 stroke-dashoffset 畫出來 0.55 秒、整條淡入放大再淡出,共約 1.6 秒後拿掉;不動 = 靜態;只在過關(複習升盒、做到了不放);狀態句不重複「過關 ✓」(只寫「接著練 / 下一關:名稱」),橫幅的字讀得到(星星 aria-hidden) |
| `.verify-badge` | 橘框膠囊 | 不動(只在檢定頁「考試內容」) |

## 4. 已定案、不能動
- 分段鈕 iOS 原生樣式(`.seg`:`--seg-track` 軌道圓角 10、選中塊圓角 8 + 陰影、分隔線);選中塊顏色 = 中性(第 8 節;2.5 分頁輔色已取代)
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

## 7. 專心練習畫面(2026-11-06 使用者選 A「保守整理」+ 琴鍵條)

比較圖:設計師的 `focus-compare.png`(現況 / A / B / C)。選 A:版型、字、按鈕都不動,只把一個練習畫面整理成「一張練習卡」,再加琴鍵條。

1. **一張練習卡**:題目卡 + 樂譜卡 + 速度卡(技巧自由練習與今日練習段落)、設定列 + 題目卡 + 樂譜卡 + 麥克風卡(視奏)、設定列 + 題目卡(聽力)在畫面上合成一張:
   同一塊 `--panel` 底、中間一條 1px `--line` 細線(`inset 0 1px 0`)、沒有各自的陰影與圓角(只有整張的頭尾圓角 `--radius-card`);內距不變(模組量「卡片頂到琴鍵 / 樂譜」的距離跟合不合無關,聽力手機橫式的琴鍵高度才不會中英差 3px);題目卡頂端的淡金漸層只在整張最上面(**第 8 節拿掉漸層**)。
   做法:index.html 給可以合的卡片 `data-join`;外框(main.js 共用部分的 `syncJoin`,跟 `syncCta` 同一個時機)把**同一欄上下相鄰、中間沒有別張看得到的卡**的那幾張加 `.j-top` / `.j-mid` / `.j-bot`;只有一張不加;檢定頁不合;寬畫面(≥ 1100)只合同一欄的。
   卡片之間的間距 `--mod-gap`(12 / 手機 10 / 手機橫式 8)用負的 margin 吃掉。不用 clip-path(題目卡裡有 `position:fixed` 的底部按鈕列,clip-path 會把它切掉、也會改變疊放順序)
2. **譜紙貼齊卡片左右**:合起來的卡片裡的 `.paper` 左右伸到卡片外緣(`margin: -card-px - 1px`、圓角 0);譜卡標題「樂譜」與標示開關照舊(今日練習的關卡照舊只有工具列 [音名] …[右手|左手|雙手])
3. **重點一行**(`.daily-check`,上面第 3 節)
4. **譜放大**:`js/tech/app.js` 的 `fitWrap`(只改排法的縮放,**不用 CSS zoom / transform**:播放軸照 OSMD 的座標走):短譜最多正常大小的 `WRAP_FILL` 倍(手機 1.6、≥ 700 寬 2.2)、譜高 ≤ 畫面高 `WRAP_FILL_H`(手機 0.34、≥ 700 寬 0.42;第一個畫面還看得到題目、譜、琴鍵條與底部主要按鈕)
5. **琴鍵條**(`js/shared/keystrip.js` 純畫面元件 + app.css 的 `.keystrip`;今日練習的關卡譜下面、「重點」上面):
   - `createKeystrip(el, { low, high, now })` → `range` / `mark(midi → 手指號碼, 沒彈到的手指)` / `label(midi, html)` / `light(midi, when, dur)` / `cancel(from)` / `clear()`
   - 至少 15 個白鍵(看得出兩個、三個一組的黑鍵);高 `--ks-h`:手機 64、≥ 700 寬 132、手機橫式 44;只顯示、不能點(`role="img"` + 說明)
   - 用到的鍵淡金(白鍵 `#F6DFA0`、黑鍵 `#7A5C16`)+ 手指號碼(白鍵深字、黑鍵白字;同一個鍵不同手指 = 不寫號碼);五指位置沒彈到的手指寫淡色號碼(`#6f6248`,對比 ≥ 4.5);鍵的顏色深淺主題一樣
   - 示範播放時跟著音亮(金 `#F2B94B`):App 排音的時候用同一條 AudioContext 時間線排 `light`,元件每一格 requestAnimationFrame 照時間決定亮哪些鍵;放開淡出 .3 秒;改速度 `cancel`、停止 `clear`;只有拍點的時候、App 彈的旋律不亮;減少動態效果時只亮不淡出
   - 取代:譜卡標題列的小手位圖(`#t-handPos`)與第 0 組的大中央 C 鍵盤(`syncBigKb`)— 同一件事一個畫面只說一次;第 0 組在中央 C 下面寫「▲ 中央 C」(「找到中央 C」再加「右手大拇指放這裡」)
   - 伴奏關:亮用到的鍵,左手和弦照指法資料標號碼(同一個鍵兩種手指就不標);旋律不標
6. **過關**:照舊「過關 ✓」橫幅(celebrate.js),一起加:譜紙一道金色掃光 0.4 秒(`.paper.cel-sweep::after`)、標籤的關卡進度條從舊位置補到新位置(Web Animations,0.7 秒)、底部主要按鈕放大 1.04 一下 + 左邊勾勾描線(`.cel-pop`、`.cel-tick`;字左邊放不下勾勾就只放大);不彩帶、不跳視窗、不推版面;`prefers-reduced-motion` 全部靜態(只留靜態勾勾,進度條直接到新位置)
7. **字**:題目大標題改黑體 700(第 1 節),襯線只留頂欄品牌名;**顏色改象牙白(第 8 節取代「金色標題」)**

DrumDrill:共用的 app.css、main.js(syncJoin)、celebrate.js、dailycard.js、keystrip.js 照搬;它的 index.html 要自己標 `data-join`(技巧路線段的題目卡 + 鼓譜卡 + 速度卡、視奏、聽力);琴鍵條換成鼓的對應元件(建議:鼓件條,見交接說明)。

## 8. 顏色規則乙 + 方向 B「主角清楚」(2026-11-06 使用者選定;**取代 2.5 分頁輔色與「金色題目大標題」**)

使用者:「有的頁面,有其他顏色和金色參在一起,感覺很怪」「顏色看起來很亂」。選了顏色規則乙(全部金色、拿掉分頁輔色)+ 美觀方向 B(主角清楚)+ 題目大標題象牙白。
比較圖與注入用 CSS(設計師暫存,不在 repo):`…/scratchpad/design12/cmp-dark.png`、`cmp-light.png`、`yi.css`;`…/scratchpad/design11/cmp-1-today.png`…`cmp-5-drum.png`、`B.css`
(完整路徑 `/tmp/claude-0/-home-user/57ddd9dc-2132-5999-a5a7-37258561f000/scratchpad/`)。**照這一節做,不要照 CSS 檔逐字抄**:B.css 與 yi.css 互相覆寫、用了 `!important`,下面已經合成一份並修掉問題(8.6)。
兩個 App 一樣;app.css 是 sync.json 的 `same`,改完複製到 DrumDrill。

### 8.1 一句話規則

畫面上**有彩度的顏色只有三種**:**金 = 動作**(按了會發生事)、**青綠 = 對 / 過關 / 達標**、**紅 = 錯**。其他一律中性(象牙白、淡色、灰塊)。

| 類別 | 顏色 | 包含 |
|---|---|---|
| 動作(金) | 主要鈕金底 `--gold-fill` + `--on-fill` 字;次要 / ghost 鈕 `--fill-btn` 底金字;▶ 金底;**底部分頁列選中那格**金字 + 金淡底(導覽也是動作) | `.btn`、`.btn.primary`、`.btn.ghost`、`.text-btn`(8.5-6)、`.play-round`、`.goal .chip`(每週目標)、`.qrow` / DD `.xitem`(點一項就練)、可展開的摘要箭頭(`details summary .chev`、`.setup-summary svg`、`.exam-sum svg`、DD `.xitem svg`)、滑桿、勾選框 `accent-color`、焦點框 `:focus-visible` |
| 動作的延伸(金,保留) | ▶ 按下去以後「正在響」的狀態 | 播放軸(PD 樂譜 cursor `#F2B94B`、DD `#B8860B` playline、`--paper-gold` 小節底色)、`.beats i.on` 拍點燈、`.play-ring`、作答琴鍵 / 琴鍵條**亮起** `.lit` / `.kbd .wk.on`、鼓墊 `.tap-pad`(本身是按鈕)、DD `#e-stage.you` / `.along.you .tap-pad`(輪到你打)、視奏倒數中的主要鈕 `.s-along-top.counting` 與浮動倒數 `.prep-float`(= 主要鈕的狀態)、過關掃光 `.cel-sweep` |
| 選中(中性) | 見 8.2 的 `--sel-*` | `.seg` 選中塊、`.chip` / `.opt` / `.btn[aria-pressed]` 選中、`.mbtn` 再練選中、`.qrow.cur`、`.test .chip.cur`、今日清單目前那一段 |
| 資訊(中性) | `--ivory`(主要)、`--muted-bright`(次要)、`--muted`(最淡) | 題目大標題、清單大項、數字、標籤、卡片標題、說明、進度條、7 天點 |
| 語意 | 青綠 `--teal` / `--teal-fill`;紅 `--red` / `--red-fill`(8.2) | 對、會了、過關、本週達標、正確率條;錯(作答錯、認音錯、聽力答錯) |
| 樂器與譜紙(不算介面色) | 照舊,深淺主題同色 | 譜紙 `--paper`、琴鍵條白黑鍵與「這一關用到的鍵」淡金 `#F6DFA0` / `#7A5C16`、作答琴鍵本體 |

**不再有橘、天藍、紫**。「再練」不是錯,不用紅也不用橘:中性(不用懲罰的顏色,七個目標第 6 條)。

例外(實作時定的):視奏速度旁的「回到預設」`#s-bpmReset` 是動作,但外觀照 `.chip` 走中性(只在改過速度時出現、很次要,不跟主要鈕搶金色)。
寬畫面(≥ 900 寬、> 500 高)字放大 `--fs-k` 以後:單行切字的 `.q-title` 行高與高度 1.5、`.qrow` 的字 1.45(中文字框比較高,不然上緣被切 2px);窄格子(技巧「種類」4 欄、認音範圍 4 格、認音模式 3 格)直接寫原本的字級(字級代幣在 `:root` 算好,子元素改 `--fs-k` 沒有用)。

### 8.2 代幣(app.css 開頭;深色 / 淺色)

| 代幣 | 深色 | 淺色 | 用在 |
|---|---|---|---|
| `--acc-text`(保留名字,改中性) | `var(--ivory)` | `#241E12` | 分段鈕沒選的字 |
| `--acc-fill` | `#5A5242` | `#FFFFFF` | 分段鈕選中塊(iOS 原生:深色灰塊、淺色白塊) |
| `--acc-on` | `#F4ECDA` | `#241E12` | 選中塊上的字(對比 深 6.6 / 淺 16.5) |
| `--acc-tint` | `rgba(244,236,218,.10)` | `rgba(36,30,18,.07)` | 分段鈕按下 |
| `--acc-sep`、`--seg-sep` | `rgba(244,236,218,.22)` | `rgba(36,30,18,.22)` | 分段鈕分隔線(原本金色 .28 / .3) |
| `--sel-fill`(新) | `#F4ECDA` | `#2F2817` | chip / opt / `.btn[aria-pressed]` / `.mbtn` 再練 選中底(反白:比分段鈕更醒目,因為它們是獨立的鈕) |
| `--sel-on`(新) | `#16110A` | `#FFFDF8` | 上面那塊的字(對比 深 16.0 / 淺 14.4) |
| `--sel-ring`(新) | `var(--ivory)` | 同 | 「目前這一個」的內圈 2px(`.qrow.cur`、`.test .chip.cur`、DD `.mock-res div.cur`) |
| `--tab-tint`(新) | `rgba(242,185,75,.12)` | `rgba(133,100,24,.10)` | 底部分頁列選中淡底(金字對比 深 8.0 / 淺 5.8) |
| `--red`(新,字) | `#E07A5F` | `#A33A22` | 錯的字(卡片上 深 6.2 / 淺 6.5;頁面上 深 6.8 / 淺 5.3) |
| `--red-fill`(新,底) | `#BF4A33` | 同 | 錯的底色 + 白字(**白字 4.95**;原本 `#C8553D` 只有 4.35,聽力音程答錯的小字不過) |
| `--red-tint`(新) | `rgba(191,74,51,.16)` | `rgba(163,58,34,.10)` | 錯的淡底(上面放 `--red` 字:深 5.3 / 淺 5.6) |

- **刪掉** `body.tab-sight / tab-ear / tab-exam` 與 `:root.light body.tab-*` 六行(app.css 94–99 附近)。`--acc-*` 名字保留(`.seg` 用,改動最少);main.js 共用部分 `showView` 給 body 加 `tab-*` 那一行可以留著,註解改成「目前沒有樣式用到」。
- sight.css 的 `--error / --error-bg / --error-line` 改指到 `--red` / `--red-tint` / `rgba(191,74,51,.45)`(淺色 `rgba(163,58,34,.35)`),不另外定義紅色。
- `--gold`、`--gold-fill`、`--fill-btn`、`--teal*` 不動。

### 8.3 逐條改法(選擇器 → 改成;沒列的照舊)

**外框、共用(app.css)**
| 選擇器 | 現在 | 改成 |
|---|---|---|
| `.tabbar button[aria-selected="true"]`(兩處 + 520 / 532 的 background) | `--acc-text` / `--acc-tint` | `color:var(--gold);background:var(--tab-tint)` |
| `.chip:not(.done)`、`.opt:not(.right):not(.wrong)` 沒選 | `--fill-btn` 底(金淡) | `background:var(--fill-tag);color:var(--ivory)`(選擇 = 中性;按鈕外形照舊圓角 12) |
| `.chip[aria-pressed="true"]`、`.opt[aria-pressed="true"]`、`.btn[aria-pressed="true"]` | 金底 | `background:var(--sel-fill);color:var(--sel-on);font-weight:700`;**刪掉** `:root.light .chip[aria-pressed]` 的舊覆寫(如果還在);`#themeToggle` / `#langToggle` 照舊中性規則優先 |
| `.chip:active`、`.opt:active`、`.ans:active` | 金淡底 .16 / .12 | `var(--acc-tint)` |
| `.goal .chip:not(.done)` | 金字 | 不動(動作;要寫在 chip 中性規則**後面**才贏) |
| `.mbtn`(沒選) | `--fill-btn` | `--fill-tag` 底、`--muted-bright` 字 |
| `.mbtn[data-m="weak"][aria-pressed="true"]` | 橘 `#E8A25B` | `--sel-fill` 底、`--sel-on` 字(會了照舊青綠) |
| `.dot.weak`(清單「再練」點) | 橘 | `background:var(--ivory);border-color:var(--ivory)`(沒標 = 空心 `--muted` 圈;會了 = 青綠實心) |
| `.srow .bar i.low` | 橘 | `var(--muted)` |
| `.verify-badge` | 橘字橘框 | `--muted-bright` 字、`--fill-tag` 底、無框;`.ok` 青綠字 + `rgba(63,191,174,.14)`(淺 `.10`)底 |
| `.qrow.cur` | 金內圈 | `inset 0 0 0 2px var(--sel-ring)` |
| `.test .chip.cur` | 金框金字 | `box-shadow:inset 0 0 0 2px var(--sel-ring);color:var(--ivory)` |
| `.test h3 b`(題號) | 金 | `--muted-bright` |
| `.group h3` | 金 | `--muted-bright` |
| `.quick .qhead b` | 金 | `--ivory` |
| `.q-title`、`.modal-card h2`、`.item-row .ir-name`、`.lvl-row .lvl b`(難度數字;▼▲ 是按鈕照舊金) | 金 / 亮金 | `--ivory` |
| `.diff-msg` | 亮金 | `--ivory` |
| `.card.quiz`(兩條,深淺) | 頂端淡金漸層 | **拿掉漸層**,只有 `var(--panel)`(裝飾;第 7 節「只在整張最上面」也一起拿掉) |
| `body` 背景(深淺各一條) | 左下金光暈 + 右下青綠光暈 | **拿掉**兩個 radial-gradient,只留 `var(--bg)`(頁面裡亂的來源之一) |
| `.log-week i.on`(練過的那天) | 金底 | `--ivory` 底與框(7 天點不能按,是資訊) |
| `.log-week span.today` | 金字 | `--ivory`、700 |
| `.goal .progress i` | 金 | `--ivory`;`.done` 照舊青綠 |
| `.kbd-dots i.on` | 金 | `--ivory`;`.wrong` 改 `--red-fill` |
| `.q-tag .lv-bar b`(關卡進度條) | 金 | `--ivory`(慶祝時 Web Animations 照舊補到新位置) |
| `.daily-k` | 金 | 見 8.5-1(`--muted-bright`) |
| `.daily-list li.done .daily-mark` | 金底 | 見 8.5-1(象牙白底) |
| `.daily-list li[aria-current="step"] .daily-mark` | 金框 | 見 8.5-1(象牙白框) |
| `.daily-dots i.on` / `i.cur` | 金底 / 金框 | `--ivory` 底 / `2px solid var(--ivory)` |
| `.daily-left.up` | 金 | `--ivory`、700 |
| `.daily-vary`(「這次:…」) | 金 700 | `--ivory` 700 |
| `.chord-table b` | 金 | `--ivory` 700 |
| `.ks-lbl .ks-up`(▲ 中央 C) | 金 | `--ivory` |
| `footer .foot-note`(已複製) | 金 | `--muted-bright` |
| `.mock-res b` | 金 | `--ivory`;`.mock-res i.no` → `--red` |
| `.ans.wrong` | `#C8553D` 白字 | `background:var(--red-fill);border-color:var(--red-fill);color:#fff` |
| `.feedback.no`(深淺兩條) | `#E07A5F` / `#A33A22` | `var(--red)`(一條就好) |
| `.kbd .wk.wrong` / `.bk.wrong` | `#C8553D` 漸層與光暈 | 漸層終點與光暈改 `#BF4A33` / `rgba(191,74,51,.8)`(樂器區,顏色跟 `--red-fill` 同一個) |

**sight.css**
| 選擇器 | 改成 |
|---|---|
| `#mod-sight .countdown`、`.countdown.running` | `--ivory`(`.done` 照舊淡色);`.prep-float`、`.s-along-top.counting` 照舊金(= 主要鈕) |
| `#mod-sight .along-result .big`、`.rd-score`、`.rd-end b` | `--ivory` |
| `.along-result .r-head`、`.practice-only`、`.s-check-title`(sight.css 有的話) | `--muted-bright` |
| `.rd-msg.no`(認音答錯那句) | `var(--red)` |
| `.rd-beats .opt.wrong` | `color:var(--red);background:var(--red-tint);border-color:transparent` |
| 認音作答 `.rd-ans-grid .opt.wrong`(如果 PD 也有) | 同上 |

### 8.4 不用改、刻意保留的金
主要 / 次要 / ghost 鈕、▶ 與外圈、底部分頁列選中、每週目標鈕、檢定清單列(能點)、可展開卡的箭頭、滑桿與勾選框、焦點框、8.1「動作的延伸」整列、琴鍵條與作答琴鍵(樂器區)。
**判斷新元素**:「按了會發生事嗎?」會 → 金;「它在響嗎(▶ 按下去的結果)」是 → 金;其他 → 中性;對 / 過關 / 達標 → 青綠;錯 → 紅。

### 8.5 方向 B 的每一項

1. **今日卡:每段一塊 + 編號**(`.daily-list`,只在今日卡;兩個 App 共用,選擇器用 `.daily-list` 不寫 `#t-dailyCard`,DD 同 id 也可以)
   - 卡片標題 `.daily .card-title b`(還沒開始 / 暫停 / 練完那張,不含進行中那一行)→ `--fs-head`
   - `.daily-list{counter-reset:s;gap:8px;margin:4px 0 14px}`
   - `.daily-list li`:`display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:12px;row-gap:0;align-items:center;min-height:56px;padding:10px 14px;border-radius:var(--radius-inset);background:var(--fill-inset)`;淺色 `background:#F3EEE3`(`--fill-inset` 淺色 = 頁面色,在卡片上太重)
   - 編號:`.daily-list li:not(.locked){counter-increment:s}`(**算在 li 上**;B.css 寫在 `:empty::before` 會讓打勾的那段不算號,後面的號碼錯)、`.daily-mark:empty::before{content:counter(s)}`
   - `.daily-mark`:`grid-row:1 / span 2;width:30px;height:30px;border:2px solid var(--muted);font-size:var(--fs-sub);font-weight:700;color:var(--muted-bright)`
   - 目前那一段 `li[aria-current="step"] .daily-mark`:`border-color:var(--ivory);color:var(--ivory)`(B.css 是 `:first-child` 金框:改成 aria-current、中性)
   - 做完的 `li.done .daily-mark`:`background:var(--ivory);border-color:var(--ivory);color:var(--panel)`(勾勾 = 卡片色,深淺都看得到)
   - `.daily-k`(種類小字:暖身 / 手指 / 伴奏):`grid-column:2;font-size:var(--fs-cap);font-weight:700;letter-spacing:.04em;line-height:1.3;color:var(--muted-bright)`
   - `.daily-t`:`grid-column:2;font-size:var(--fs-body);font-weight:500;line-height:1.35;color:var(--ivory);white-space:normal`(放不下換行,不切「…」)
   - 還沒開放 `li.locked`:`background:transparent;box-shadow:inset 0 0 0 1.5px var(--line)`、`.daily-t` `--fs-sub` `--muted-bright`、編號圈虛線照舊(沒有號碼)
   - 手機橫式那段 `.daily-list{margin-bottom:8px}` 照舊
2. **開始鈕高 56**:`.daily-btn{min-height:56px;font-size:var(--fs-body)}`;手機橫式(那個 media 裡的 `.daily-btn{min-height:44px}`)照舊 44;「再練一下」如果也是 `.daily-btn` 一樣 56
3. **連續天數**:B.css 給它金色 —— **算違反**(數字不能按)。改法:不用顏色,用層次:`.log-stats > div:first-child b` 照舊 `--ivory`,**另外兩格數字改 `--muted-bright`**(同字級、同字重;連續天數自然變主角);「重新開始」那格照舊
4. **歡迎全螢幕**(`#onboard`;只改 CSS,DOM 不動)
   - `#onboard.modal{background:var(--bg);-webkit-backdrop-filter:none;backdrop-filter:none;padding:0}`
   - `#onboard .modal-card{width:min(460px,100%);height:100%;max-height:none;overflow-y:auto;background:transparent;box-shadow:none;border-radius:0;display:flex;flex-direction:column;text-align:center;padding:calc(64px + env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom))}`(上面讓出頂欄:頂欄 z-index 60 在對話框上面,主題 / 語言鈕照舊能按)
   - 大圖示:`#onboard .modal-card::before{content:"";flex:none;width:120px;height:120px;margin:auto auto 24px;border-radius:28px;background:url(../icons/icon-512.png) center/cover;box-shadow:0 12px 32px rgba(0,0,0,.35)}`,淺色陰影 `rgba(90,72,30,.18)`(**不用金光暈**;路徑相對 css/,兩個 App 各用自己的 icons/icon-512.png,sw.js 已預快取)
   - `#onboard .modal-card h2{font-size:var(--fs-title);line-height:1.35;color:var(--ivory)}`、`#onboard .modal-sub{font-size:var(--fs-body);margin-top:8px}`
   - 按鈕在下:`#onboard .modal-actions{margin-top:auto;padding-top:24px}`(主要鈕 52 照舊)
   - 展開「我在準備檢定」(`#obExamPane` 出現):內容變高就捲動;**不用 `:has`**,圖示縮成 64(`obMode` 在 `.modal-card` 加 class `ob-exam-on`,`.ob-exam-on::before{width:64px;height:64px;border-radius:16px;margin:0 auto 12px}`)— 這是 main.js 共用部分一行
   - 矮畫面 `@media (max-height:500px)`:圖示 56、`margin:0 auto 8px`;padding-top `calc(52px + env(safe-area-inset-top))`;手機橫式左邊分頁列在對話框下面,不用讓
5. **聽力作答琴鍵加高**(只有 PD 聽力;認音 `.rd-kbd` **不加高**):`@media (max-width:600px){ #mod-ear .kbd{height:clamp(150px, 26vh, 210px)} }`(iphone-390 ≈ 210、fold-280 653 高 ≈ 170;B.css 寫死 210 會把 fold-280 的第一個畫面擠掉)。B.css 的 `#mod-sight .kbd{190px}` 不做
6. **麥克風開關、文字鈕改成小按鈕**(`.text-btn`:PD「麥克風聽你彈:開 / 關」`#t-micBtn`、「回上一關」;DD「沒有鼓?用手機打」`#t-rModeBtn`、`#t-rKitBtn`)
   - `.text-btn{min-height:44px;margin-top:6px;padding:0 14px;border-radius:var(--radius-btn);background:var(--fill-btn);color:var(--gold);font-size:var(--fs-sub);font-weight:500;text-decoration:none}`
   - **圓角用 12,不用 B.css 的 999 膠囊**:按鈕一律圓角方形是 2026-10-22 已定案(第 4 節),膠囊外形留給不能按的標籤 `.q-tag`(能按 / 不能按一眼分得出來)
   - `≤ 340` 那條 `.daily-acts .text-btn{padding-left:0;padding-right:0}` 改成 `padding:0 10px`;DD drum.css 531 的 `min-height:44px` 照舊
7. **頁尾不加底線**:`footer a, footer .foot-link{text-decoration:none;color:var(--muted)}`(對比:頁面上 深 5.5 / 淺 4.7);點擊區 44 照舊
8. **寬畫面根字級 20**(≥ 900 寬而且 > 500 高;手機橫式最寬 932 × 430,要排除)
   - **不改 `html` 的 font-size**(B.css 的 `html{font-size:125%!important}` 會蓋掉 iPad 的 `-apple-system-body` 動態字級,也會放大品牌名,品牌名要跟 ScrollScore 逐項相同)。改成字級代幣乘一個係數:
     `:root{--fs-k:1}`;五級寫成 `--fs-title:min(calc(26rem / 17 * var(--fs-k)), 34px)`(其他四級同理,上限不變);`body` 的預設字級 `min(calc(16rem / 17 * var(--fs-k)), 32px)`;
     `@media (min-width:900px) and (min-height:501px){ :root{--fs-k:1.176} }`(= 20 / 17;題目大標題 30.6、內文 20、標籤 16.5)。分頁列、品牌名、譜面字照舊不放大
   - 寬度(**≥ 1100 的部分已被第 9 節取代**,這段只留紀錄):同一個 media `main,footer{max-width:1040px}`(取代 ≥ 1100 的 1480);`≥ 1100` 一欄置中 `.mod.one-col > .mod-main` 1100 → **880**、今日還沒開始 760 → **880**、跟著它的 footer、`.subnav .sub-bar`、`.daily-cta` / `.cta-bar` 的置中公式 1100 → 880;檢定頁沒選考試的 760 照舊
9. **B 的其他項**:題目大標題、第一次的問題標題 = 象牙白(上面 8.3);每週目標鈕金字(照舊)

### 8.6 合成時我自己的取捨(B.css + yi.css 沒寫到或互相衝突的)
- 選中:分段鈕 = 灰塊(深)/ 白塊(淺)(iOS 原生),chip / opt = 反白塊(yi.css 的值);B.css 的 `--acc-fill` 選中被 yi 蓋掉,以 yi 為準
- 「再練」= 中性反白(不用橘、不用紅)
- 拿掉:題目卡頂端淡金漸層、頁面兩個角落的金 / 青綠光暈、歡迎圖示的金光暈(都是裝飾)
- 7 天點、今日清單的打勾、進度點、關卡進度條 = 象牙白(不能按)
- 連續天數不用金(8.5-3);文字鈕圓角 12 不用膠囊(8.5-6);寬畫面用 `--fs-k` 不改 html 字級(8.5-8);聽力琴鍵高度用 clamp(8.5-5);今日清單編號算在 li 上(8.5-1)

### 8.7 驗收
每一步:`node tools/build/stamp.mjs` → app.css 複製到 DrumDrill → `DRUMDRILL=/home/user/drumdrill node tools/test/verify.mjs`(版本指紋 + sync)。
- **對比**:DrumDrill `node tools/test/a11y.mjs`(深淺主題量實際背景,共用 app.css);PianoDrill 沒有對比測試 → 聽力音程答錯(紅底白字 + 小字)、淺色分頁列、chip 選中、今日清單 `.daily-k` 用設計師暫存的 `design12/inv.mjs`(`CON=1 THEME=dark,light`)或手算,全部 ≥ 4.5(大字 3)
- **色彩清單**:同一支 `INV=1` 跑完,譜面、琴鍵以外**只能出現 gold / teal / red 三種色相**(不能有 blue、purple、orange)
- `node tools/test/tasks.mjs`(第一個畫面:今日卡變高、聽力琴鍵變高、歡迎頁)、`node tools/test/newbie.mjs`(歡迎 → 開始練習 → 今日每一段;底部按鈕不跳)、
  `node tools/test/layout.mjs` 全套(含字級 200%;fold-280 / se1-320 的今日清單與聽力;ipad 橫式 / desktop / 1080p 的 880 / 1040)、`node tools/test/bilingual.mjs`(今日清單每段兩行、文字鈕、歡迎副標中英同高)、`node tools/test/clip.mjs`、`node tools/test/human.mjs 150 3`
- DrumDrill 同一套:`tasks.mjs`、`newbie.mjs`、`layout.mjs`、`bilingual.mjs`、`clip.mjs`、`a11y.mjs`
- **截圖比對**(iphone-390 深 / 淺、desktop 1400):歡迎、今日還沒開始、今日進行中(PA1)、過關、認音答錯、視奏右手、聽力單音答對、聽力音程答錯、檢定音階琶音出了題目、DD 視奏小鼓譜、DD 聽力過門、DD 認譜答錯;
  對照 `design12/s/yi-*.png`(顏色)與 `design11/s/B-*.png`(版面),差別只能是 8.6 列的取捨;上架截圖用 `appshots.mjs` 重拍

### 8.8 DrumDrill 要同步的地方
- **app.css**(same):整份複製(8.2、8.3 共用部分、8.5 全部;8.5-5 選擇器 `#mod-ear .kbd` 在 DD 不存在,沒影響)
- **main.js 共用部分**:`obMode` 加 / 拿 `ob-exam-on`(8.5-4);`tab-*` 那行註解
- **drum.css**(DD 專屬):
  - 改中性:`.opt.rud b` → `--muted-bright`;`.xid` → `--fill-tag` 底 `--ivory` 字;`.xname`、`.target-text` → `--ivory`;`.target-ico` → `--muted-bright`;`.kl-cell.pending .kl-src` → `--muted`;
    `.s-check-title`、三處 `.along-result .r-head`、`.practice-only` → `--muted-bright`;三處 `.along-result .big`、`.rd-score` → `--ivory`;`#mod-sight` / `#mod-ear` `.countdown`(含 `.running`)→ `--ivory`;
    `.mock-res i.cur` → `--ivory`、`.mock-res div.cur` → `--sel-ring`;`#e-answers .e-letter`(選項字母圈)→ `--muted-bright` 框與字;`.mic-row .along-note.warn` → `--ivory`;刪掉 `#t-mockOneBar:not([aria-pressed="true"]){color:var(--gold)}`(chip 中性規則)
  - 改紅:`#e-answers .e-opt.wrong` 框、`.e-letter` 底 → `--red-fill`;`.rd-msg.no` → `--red`;`.rd-ans-grid .opt.wrong` → `color:var(--red);background:var(--red-tint);border-color:transparent`
  - 保留金:`.pads .tap-pad`、`#e-stage.you`、`.along.you .tap-pad`、playline `#B8860B`、`--paper-gold`、`.xitem svg`、勾選框、`.prep-float` 類(drum.css 100、299)
  - `#t-bestTempo` 青綠(達成)照舊
- DD 的歡迎大圖示自動用 DD 自己的 `icons/icon-512.png`(小鼓 + 勾)

### 8.9 CLAUDE.md 要跟著改的句子(主代理改,兩個 repo)
七個目標第 3 條「選中塊顏色 = 分頁輔色(技巧金、視奏天藍、聽力紫、檢定中性…)」→「選中塊 = 中性(深色灰塊、淺色白塊;docs/DESIGN.md 第 8 節)」;
畫面設計「題目大標題黑體 700」後加「象牙白」;「寬畫面(≥1100)…內容最寬 1480」→ 1040、一欄 880、今日還沒開始 760 → 880。

### 8.10 實作順序(一步一個 commit)
1. 代幣(8.2)+ 刪分頁輔色 + 分頁列金 + chip / opt / seg / mbtn / 清單點中性 + 紅(8.3 前半):最容易看出整體;測 a11y、bilingual、layout 手機 4 種
2. 資訊改象牙白 + 拿掉漸層與光暈(8.3 後半、sight.css、drum.css):測 a11y、clip
3. 今日卡 + 開始鈕 + 連續天數(8.5-1~3):測 tasks、newbie、bilingual、layout fold-280 / se1-320
4. 歡迎全螢幕(8.5-4,main.js 一行):測 newbie、tasks、layout 全部尺寸(含手機橫式、字級 200%)
5. 聽力琴鍵、文字鈕、頁尾(8.5-5~7):測 tasks、layout fold-280、bilingual、human
6. 寬畫面(8.5-8):測 layout(ipad 橫式、desktop、1080p)、bilingual、`playhead.mjs`(字變大不影響譜,確認一次)
完成後叫審查員(共用檔、兩個 App = 大改)。

## 9. 寬畫面丙「一個框、框裡並排」(2026-11-07 使用者選定;**取代第 8.5-8 的寬度與 app.css 現有的 ≥ 1100 兩欄排法**)

使用者問題(BACKLOG PD 第 136、155、175–177、179 行,DD 第 71 行):今日卡 760 太小、按「開始」變 1100 版面跳、檢定頁左欄清單很長右欄空、進行中頂列字和暫停鈕離很遠、1080p 字小。
比較圖與注入用 CSS(設計師暫存,不在 repo):`/tmp/claude-0/-home-user/57ddd9dc-2132-5999-a5a7-37258561f000/scratchpad/wide1/cmp-3-bing.png`(對照 `cmp-0-now.png`)、`bing.css`。
**照這一節做,不要照 bing.css 逐字抄**(它用 `!important` 蓋掉現有規則;正式做是改掉現有規則,不疊上去)。兩個 App 一樣;app.css 是 `same`,main.js 共用部分要同步。

### 9.1 一句話規則
寬畫面**所有畫面(今日還沒開始 / 進行中 / 練完、視奏、聽力、檢定)用同一個框**,一欄、照手機的順序排(跟 iPad 直式一樣);
框裡**小卡並排填滿**(今日的段落、紀錄的數字與 7 天點、檢定的考試卡與題目卡),**不再分左右兩欄**。按「開始」前後框的寬度不變。

### 9.2 斷點(只在 ≥ 1100 寬;手機、手機橫式、iPad 直式 820 / 1024 完全不變)
| 斷點 | 框(卡片外緣) | `--fs-k` | 包含 |
|---|---|---|---|
| W1 `(min-width:1100px)` | `--wide-w:1040px` | 照第 8 節 1.176 | iPad 橫 1180×820、筆電 1280×800、桌機 1400×900、iPad Pro 橫 1366×1024 |
| W2 `(min-width:1600px) and (min-height:1000px)` | `--wide-w:1200px` | **1.3** | 1080p 1920×1080 以上 |

- `--wide-w` 是新代幣(app.css 開頭 `:root` 預設 1040px,W2 改 1200px);`main` 的 `max-width:calc(var(--wide-w) + 28px)`(main 左右內距 14)。
- W2 的 `--fs-k:1.3` 跟第 8 節相容:題目大標題 33.8(上限 34)、內文 22.1、標籤 18.2、小字 15.6;控制項的上限(app.css 388 的 1.3 倍:15.6 / 18.2 / 22.1 / 24.7)剛好等於 1.3 倍,不會卡住也不會超過;
  8.1 的例外照舊:`.q-title` 行高 / 高度 1.5、`.qrow` 1.45 是用代幣算的,自動跟著變;窄格子(技巧「種類」4 欄、認音範圍 4 格、認音模式 3 格)寫死原本字級,W2 也不放大。手機橫式高度 ≤ 500 碰不到 W2。
- 901–1099 的 `main{max-width:900px}`、視奏 1180(app.css 757)照舊(iPad 直式 1024)。

### 9.3 逐條改法(app.css;行號是 2026-11-07 的)
| 位置 | 現在 | 改成 |
|---|---|---|
| 824 `@media (max-width:1099px){ .setup-summary… }`(設定卡收成一行) | 只有一欄時 | **拿掉 media 外殼,所有寬度都收成一行**(寬畫面設定卡跟 iPad 直式一樣;視奏右手 / 左手 / 雙手的設定卡照舊一直展開,JS 不用改) |
| 831–839 ≥ 1100 兩欄(`.mod` grid 300–360 + 1fr、`.mod-side,.mod-main{display:flex}`、`.mod-side .prow / .fields`、`#examSetup .exam-body` 兩欄) | 兩欄 | `main,footer{max-width:calc(var(--wide-w) + 28px)}`;`.mod`、`.mod-side`、`.mod-main` **不再有 ≥ 1100 規則**(維持 `display:contents`,卡片照 820 那行的 `order` 排,跟手機同順序);`.mod{--mod-gap:12px}`(1319)照舊 |
| 841–846 ≥ 1100 `.mod-side .picker .opts` 固定寬格子 | 左欄窄用 | 刪掉(一欄夠寬,照手機 / iPad 的格子) |
| 923 `.item-row` ≥ 1100 `grid-column:1 / -1;padding:0 17px` | — | 只留在檢定頁格子裡(見下面檢定頁),`padding:4px 0 0` |
| 1084 `.daily-cta` 置中公式 `100% - 1100px` | 1100 | `100% - var(--wide-w)` |
| 1161–1170 `.mod.one-col…`、今日還沒開始 760、footer 1100 / 760 | 一欄置中 | **全部刪掉**(沒有 one-col 了);footer 一律 `calc(var(--wide-w) + 28px)`、`padding:0 17px`(字切齊卡片內文)照舊 |
| 1171–1177 檢定頁考試卡 360 / 沒選考試 760 置中 | — | 換成下面「檢定頁」;**沒選考試**的考試卡也是整個框寬(系統兩顆、級數一排伸滿;跟 iPad 直式一樣,不再 760) |
| 1213 `.subnav .sub-bar` ≥ 1100 `min(1100px,100%)` | 字靠左、暫停靠右,中間 1000px 空 | `width:min(var(--wide-w),100%);justify-content:center;gap:14px`,`.subnav .daily-left{flex:0 1 auto;margin-right:12px}`(進度、剩約 n 分、暫停、下一段 › 靠在一起置中);`.daily-left` 照舊在空白處換行 |

**今日卡(還沒開始 / 暫停 / 練完;`.daily-list` 在 ≥ 1100,兩個 App 同一個選擇器)**
- `.daily-list{grid-auto-flow:column;grid-auto-columns:minmax(0,1fr)}`:段落橫排一排(暖身 → 路線 → 複習,順序不變;還沒開放那條也是一格)。
  **4 格以上**(暖身 + 兩條路線 + 複習)改兩欄:`.daily-list:has(> li:nth-child(4)){grid-auto-flow:row;grid-template-columns:repeat(2,minmax(0,1fr))}`
- **中英同高**:每格固定留兩行關卡名的高度 `.daily-list li{min-height:calc(var(--fs-cap) * 1.3 + var(--fs-body) * 1.35 * 2 + 20px);align-content:center}`(實測英文「Level 3 · Right: five fingers up and down」在 1180 寬三格時是兩行、中文一行;不留就中英差 12px)。
  英文關卡名在 1180 寬三格超過兩行 → 照 CLAUDE.md「英文長就縮短文字」改字串,不讓格子變高
- 開始鈕、「路線」鈕、「再練一下」照舊整個卡寬(跟底部按鈕列同寬,位置一樣)
- 路線圖展開(`.daily-road`)照舊一欄清單,不橫排

**練習紀錄(`[id$="logCard"]:not(.log-empty)`,三個模組;≥ 1100)**
- `display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:32px;align-items:center`;
  卡片標題、`.goal` `grid-column:1 / -1`;`.log-stats` 左(第 2 列)、`.log-week` 右(第 2 列,`margin-top:0`);`.goal` 第 3 列 `margin-top:10px`
- `.log-empty`(一行淡字)照舊

**視奏、聽力、技巧自由練習**:一欄,跟 iPad 直式同一個順序(設定卡 → 題目卡 → 譜 / 作答 → 麥克風 → 紀錄);`syncJoin` 會把設定卡、題目卡、譜卡合成一張(第 7 節「一張練習卡」,跟手機一樣)。聽力琴鍵最寬 900 置中照舊。

**檢定頁(`body.view-exam`,≥ 1100)**:上面一列 = 考試卡(左半)+ 本項列與題目卡(右半),下面整列 = 譜、清單、設定卡、考試內容
- `body.view-exam main{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:12px;align-items:start}`;`main > *{grid-column:1 / -1}`;footer `order:99`
- `#examSetup{grid-column:1;grid-row:1 / span 2}`(`.exam-body` 一欄:系統一排、級數一排伸滿)
- `main > .mod:not([hidden]){display:contents}`;`.item-row{grid-column:2;grid-row:1}`;**第一張 `.quiz`**(PD 題目卡 / `.hint-empty`;DD `.x-empty` 也有 `.quiz` class)`grid-column:2;grid-row:2;margin-top:8px`
- 其他卡(`.mod-main > :not(.quiz)`、`.mod-side > *`)`grid-column:1 / -1;margin-top:12px`,照現有的 `order`(題目卡 → 譜 → 清單 → 抽考設定 → 考試內容,app.css 1217–1219)
- 本級要求清單照現有 auto-fit 格子(1040 寬自動 4 欄;實測 PD 檢定技巧頁高 2809 → 1355)
- 沒選考試(沒有模組):考試卡 `grid-column:1 / -1`(整個框)
- 手機橫式的檢定並排(app.css 867–874)不動

### 9.4 main.js 共用部分(兩個 App)
- `balanceCols`(PD 245–262、DD 255–272)**整段拿掉**:沒有兩欄了,練習紀錄卡不再搬家(留在 index.html 原位,照 `order` 排);`.one-col` class 不再加。
  `balanceSoon` 改成只呼叫 `ctaSoon()`(+ `syncJoin` 照舊);`WIDE` matchMedia 的 change 監聽改成呼叫同一個 `balanceSoon`(換寬度要重算 join 與 cta)。
  舊版存過的狀態沒有影響(紀錄卡的位置不存檔)
- 其他 JS 不用改(fitScore / fitWrap / score.js 照容器寬度算;9.6 例外)

### 9.5 DrumDrill 自己的地方(drum.css)
- 16 `≥ 1100 #mod-tech .picker .opts[data-k="no"]` 兩欄:刪掉(一欄照手機)
- 404、413、414 `.rd-quick` 4 欄、`.rd-pieces` 4 / 5 欄的 `max-width:1099px` 上限拿掉(寬畫面也用)
- 322–324 模擬考卡「≥ 1100 在左欄」的註解改「照 order」;`#t-mockCard{order:4}`、`#s-mockCard,#e-mockCard{order:2}` 照舊
- 534 `#t-rStage{max-width:820px}` 照舊(滾奏等的單線譜不要拉太開)
- 今日練習進行中:`#t-rScoreCard`(鼓譜 + 圖例)、`#t-rPadCard`(手機鼓墊模式)跟 PD 的 `#t-scoreCard` 一樣在題目卡下面一欄;9.6 的驗收 DD 也要過(鼓譜卡沒有琴鍵條,實測 1400×900 已經放得下)
- CLAUDE.md「寬畫面(≥1100)鼓墊卡在左欄」→ 鼓墊卡在譜卡下面(照 order)

### 9.6 譜照畫面高度縮(fitWrap;只有 PianoDrill 今日練習 / 技巧)
**問題**:一欄 1040 寬時,今日練習進行中的譜放大到 `WRAP_FILL_H`(畫面高的 0.42),琴鍵條(≥ 700 寬 132 高)與「重點」掉到底部按鈕列下面(實測 1400×900:譜卡底 964 > 底部按鈕列頂 767;iPad 橫 1180×820 同)。
**要達到**(深淺、中英;PA1「右手五指上下」與手指 0 組、伴奏 A 組各一關;不捲動、剛按「開始」與按 ▶ 後):
| 尺寸 | 第一個畫面要完整看得到(底 ≤ 底部按鈕列頂 − 4) | 等級 |
|---|---|---|
| 桌機 1400×900 | 題目大標題 + ▶、標籤、狀態句、譜、琴鍵條、「重點」、底部按鈕 | 必須 |
| iPad 橫 1180×820 | 同上 | 必須 |
| 1080p 1920×1080(W2 字 1.3) | 同上 | 必須 |
| 筆電 1280×800 | 同上;做不到時至少琴鍵條的手指號碼看得到 | 盡量(tasks.mjs `soft`) |
**可以用的手段**(照順序,夠了就停;具體寫法由迭代員看 `js/tech/app.js` 的 `fitWrap` 決定):
1. 放大上限改成照「剩下的高度」算:譜高 ≤ 底部按鈕列頂 − 譜卡在畫面上的頂 − 譜卡裡譜以外的高度(標題列、琴鍵條、重點、內距),取代寬畫面的固定 `WRAP_FILL_H`
2. ≥ 1100 而且高度 < 1000:琴鍵條 `--ks-h` 132 → 88(css/app.css 1330 附近;手機 64、手機橫式 44 照舊)
3. ≥ 1100:題目卡的「麥克風聽你彈:開」文字鈕(`acts.panel`)跟「為什麼 / 重點小字」那行同一列靠右,省一列
4. ≥ 1100:譜卡標題列的 [音名] 開關放到譜紙右上角(絕對定位,點擊區 44),省一列
**不能違反**:CLAUDE.md 的下限(換行時每行 3–4 小節 ≥ 正常大小的 85%、每行 2 小節 ≥ 0.55、一小節一行 ≥ 0.45);**短譜(一行放得下)縮到正常大小的 85% 就停**,再不夠就用上面 2–4,不再縮譜;
不用 CSS zoom / transform(播放軸要對得準);`playhead.mjs` ≤ 2 px、`dailyfit.mjs` 照舊過。

### 9.7 驗收
每一步:`node tools/build/stamp.mjs` → app.css、main.js 共用部分同步到 DrumDrill → `DRUMDRILL=/home/user/drumdrill node tools/test/verify.mjs`。
- **寬度不跳**:1180 / 1400 / 1920 三種寬,今日還沒開始的今日卡、進行中的題目卡、視奏題目卡、檢定題目卡上面那一列,**左緣與寬度一樣**(= 框;W2 1200);今日練習那一行的「暫停」離進度文字 ≤ 200px
- **手機不變**:`layout.mjs ONLY=fold-280,se1-320,iphone-390,iphone-land,ipad`(ipad = 820 直式)截圖與改前逐像素相同(DD 可用 `shots.mjs --save / --compare`)
- `layout.mjs` 全套(ipad 橫、desktop、1080p、字級 200%):**layout.mjs 90–91 行用 `innerWidth < 1100` 判斷「設定卡展開算不算」要改**(寬畫面設定卡也收起來了,條件拿掉 1100);
  `bilingual.mjs` 加 1180 與 1920(今日三格中英同高、紀錄卡、檢定考試卡與題目卡那一列);`clip.mjs`(W2 字 1.3 的單行切字)
- `tasks.mjs`(ipad 橫、desktop:設定卡收起來後,需要改設定的任務多一下「打開設定」,仍要 ≤ 3 下開始、不點到收起來的卡以外的東西;檢定頁第一個畫面看得到考試卡 + 題目卡 + 主要按鈕)
- 9.6 的四種尺寸量:題目標題、▶、`.keystrip` 底、「重點」底、`.daily-cta` 頂(newbie.mjs 可以加一輪 desktop 1400×900);`playhead.mjs 1400`、`dailyfit.mjs`
- DrumDrill 同一套:`layout.mjs`、`bilingual.mjs`、`tasks.mjs`、`a11y.mjs 1400`、`newbie.mjs`

### 9.8 CLAUDE.md 要跟著改的句子(主代理改,兩個 repo)
- 版面「每種裝置都要飽滿」:「寬度 ≥1100(平板橫式、筆電、桌機)兩欄、內容最寬 1480;以下一欄…設定卡收成一行(檢定頁的考試卡例外,一直展開)」→
  「所有寬度一欄,卡片照 CSS order 排;≥ 1100 一個框 1040(≥ 1600 寬而且 ≥ 1000 高:1200、字級係數 1.3),框裡小卡並排(今日段落、紀錄、檢定考試卡 + 題目卡;docs/DESIGN.md 第 9 節);設定卡一律收成一行(檢定頁的考試卡例外)。`.mod-side` / `.mod-main` 只是分組,寬畫面不再分欄」
- 架構「緊湊」:「寬畫面(≥ 1100)兩欄高度接近:練習紀錄卡放在比較矮的那一欄最下面…`balanceCols`、`.mod.one-col`;左欄只剩練習紀錄 = 一欄…今日還沒開始時一欄最寬 760(2026-11)」→ 刪掉,改「寬畫面見 docs/DESIGN.md 第 9 節(一個框,開始前後同寬)」
- 第三輪審查「平板、桌機的今日練習那一行跟下面卡片的內容對齊」→ 加「(≥ 1100:進度與暫停、下一段靠在一起置中)」
- 每週目標、手機的規則都不動;DD「鼓墊卡在左欄」見 9.5

### 9.9 實作順序(一步一個 commit;大改:先叫規劃員,做完叫審查員)
1. 一欄 + 框(9.2 W1、9.3 表格、9.4 拿掉 balanceCols):最大的一步;測 layout 全套(手機逐像素不變)、tasks、bilingual 1180 / 1400
2. 今日卡橫排 + 紀錄卡一列 + 今日練習那一行置中(9.3 今日卡 / 紀錄):測 bilingual(中英同高)、newbie
3. 檢定頁上面一列(9.3 檢定頁):測 tasks、layout、bilingual
4. W2 1080p(框 1200 + `--fs-k:1.3`):測 clip、layout 1080p
5. 譜照畫面高度縮(9.6,只有 PD 的 js/tech/app.js 與琴鍵條高度):測 dailyfit、playhead、newbie desktop
6. DrumDrill drum.css(9.5)+ 兩邊 CLAUDE.md(9.8)
