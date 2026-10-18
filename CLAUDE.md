# PianoDrill 專案規則

FingerDrill(技巧)、SightDrill(視奏)、EarDrill(聽音)三個工具合併成一個 App(2026-10,使用者要求),準備上架 App Store。
三個舊 repo 的完整歷史都合併進來了(`git log --follow` 查得到每個檔案的來歷)。
**改某個模組之前,先讀那個模組原本的規則**:`docs/tech/CLAUDE.md`、`docs/sight/CLAUDE.md`、`docs/ear/CLAUDE.md`
(記譜、指法、出題、視奏產生器的細節都在裡面,仍然有效;跟本檔衝突時以本檔為準)。

## 回覆
- 每次更新(每次 push)都要用中文條列解釋這次改了什麼、為什麼改(使用者要求,不能省略)
- 所有回覆一律用中文,不要用英文(包括進度回報、審查結果、測試結果;使用者 2026-10 再次要求)

## 架構
- 底部四個分頁,順序照考試的順序:**技巧 / 視奏 / 聽音 / 檢定**。頂欄下面的子項目分段鈕:技巧 = 音階/琶音/哈農、聽音 = 單音/音程/和弦、視奏 = 級數 1–8、檢定 = 音階琶音/視奏/聽力
- **檢定**:考試系統(ABRSM / Trinity)+ 級數在外框設一次(`js/main.js`),三個模組都照這一級;設定卡下面三格顯示各項進度,點了切過去
- 第一次打開問「你在準備鋼琴檢定嗎?」:選了 → 打開檢定分頁;不考 → 技巧分頁自由練習
- 外框 `js/main.js`:頂欄、分頁、主題、語言、考試設定、觸控(禁止連點放大)、音訊喚醒、螢幕常亮、快捷鍵轉給目前的模組
- 模組 `js/tech/app.js`、`js/sight/app.js`、`js/ear/app.js` 匯出同一組函式:`start(ctx)`、`enter(tab)`、`leave()`、`setExam(exam)`、`relang()`、`examStatus()`、`onKey(e)`
  - 離開模組(`leave`)一定要停止播放;模組看不到時不要量版面(寬度是 0)
  - 元素 id 加前綴:技巧 `t-`、視奏 `s-`、聽音 `e-`(index.html 裡三個模組放在 `#mod-tech`、`#mod-sight`、`#mod-ear`)
- 共用:`js/shared/audio.js`(ScrollScore 的 Salamander 取樣、拍點、主控限幅;三個模組用同一個 AudioContext)、`js/shared/i18n.js`
- 中英雙語(預設英文,切過就記住):外框字串在 `js/shared/i18n.js`;技巧、聽音的字串在 `js/tech/strings.js`、`js/ear/strings.js`(前綴 `tech.`、`ear.`);
  視奏沿用自己的字典 `js/sight/i18n.js`(HTML 用 `data-si18n`),語言跟外框同步。程式產生的文字用 `tr("中", "EN")`
- 頂欄:左 品牌名 PianoDrill + 副標;右 (考試標籤)→ 主題 → 語言
- 用詞:「檢定」「考試」,不用「考級」(只有 App Store 關鍵字可以放,因為有人這樣搜尋)
- localStorage:`pianodrill.v1`(外框)、`pianodrill.tech.v1`、`pianodrill.ear.v1`、`pianodrill.sight.*`;第一次打開會沿用同網域舊工具的紀錄(只讀不寫)

## 絕不能做的事
- **不要有 build step**:多檔 ES modules + data/*.json,直接部署 GitHub Pages(main 根目錄);App 版只是把同樣的檔案複製到 `app/www`
- **檢定要求只能照官方大綱**,沒辦法自動出題/批改的只列出要求,不要自己發明:
  - 音階琶音:改 `tools/build/syllabus_src.py` 再產生 `data/syllabus.json`,照 `docs/tech/CLAUDE.md` 核對
  - 聽力:`data/aural.json` 每一級有 source(頁碼)
  - 視奏:`data/sight-rules.json` 照 ABRSM 官方視奏範例整理(1–8 級)。**Trinity 與 ABRSM 初級的視奏還沒有規則 → 檢定分頁只說明還沒有,不拿 ABRSM 的規則充數**
- **不要用合成鋼琴音**:一律用 `js/shared/audio.js`(ScrollScore 的 Salamander 取樣),拍點用 Naked Drums xstick(視奏原本另一套 tonejs 取樣已經換掉)
- 外觀照 HarmonyHands / HarmonyMap 的設計代幣(`css/app.css` 開頭那段),圖示用線稿 SVG(24 格、stroke 2、圓端點)
- App 圖示(`icons/`)不放文字、不用考試機構的標誌或配色;改圖示改 `tools/test/icons.mjs` 再重新產生

## 版面(所有工具共用的規則)
- 適配所有尺寸:折疊機 280、SE 320 到 iPad、桌機、1080p,手機直式與橫式;沒有橫向捲動、元素不超出畫面、按鈕文字不被截斷、點擊區域至少 28×28、底部分頁列不蓋住內容
- **中英文版面要一模一樣**:英文長就縮短文字;段落用 `pairText`(保留兩種語言比較高的高度);會跟著字寬換行的選項列改用固定寬度的格子
- **每種裝置都要飽滿**(使用者要求):每個模組的卡片分 `.mod-side`(設定、紀錄、清單)與 `.mod-main`(題目、樂譜/作答、速度、正確率)。
  寬度 ≥1100(平板橫式、筆電、桌機)兩欄、內容最寬 1480;以下一欄(兩個容器 display:contents,卡片照 CSS order 排),設定卡收成一行。
  第一個畫面題目卡要在上半部(layout.mjs 會檢查)
- **手機橫式**(orientation:landscape 且高度 ≤ 500;使用者:比例怪、底部被四個欄位卡住):分頁列改成左邊直的一欄(不佔高度)、頂欄一行(藏副標與考試標籤)、
  檢定分頁的考試設定與各模組的檢定說明左右並排、視奏題目卡標題/標籤/▶ 擠成一行;技巧樂譜依「樂譜框到畫面底」放大(fitLandZoom),播放時再放大到滿版。
  layout.mjs 檢查內容不被左邊分頁列蓋住
- 分頁列一律滿版(使用者要求):直式與寬畫面(平板橫式、電腦)貼底、左右到邊,四格平均分配整個寬度;手機橫式是左邊從上到下的一欄
- **三個模組的排版要一致**(使用者:不然像拼圖硬拼在一起):頂欄下一列是子項目(視奏 = 級數 1–8)→ 設定卡(手機收成一行)→ 題目卡
  (大標題 + 右邊圓形 ▶、下面一排標籤、左下次要動作、右下主要動作)→ 內容卡(樂譜 / 作答)→ 練習紀錄(三格數字 + 最近 7 天);題目大標題三個模組同一個大小
- **視奏譜面要像印出來的考卷**(使用者要求,取代 SightDrill 原本「譜表大小固定、放不下就一小節一行」的規則):
  先決定每行幾小節(目標 4;整除優先、不留單獨一小節,太密才退到 3、2),再縮放到放得下寬度;整份要在「樂譜卡捲到頂欄下」時一眼看完,
  放不下再縮,但不小於 0.55(口袋總譜大小;每行 2 小節的最後手段 0.45)。同形狀的題目沿用同一個排法與大小(只縮不放大)。`js/sight/app.js` 的 fitScore
- 快取:改了 css/js/data 一定要跑 `node tools/build/stamp.mjs`(index.html 的 importmap 與 ?v= 版本指紋;verify 會檢查),不然手機會拿到新舊混雜的檔案

## 工作方式(省 token)
- 改好、測試沒問題就直接 push 到 main(使用者要求,不用另開分支)
- 不用瀏覽器的測試:
  - `node tools/test/verify.mjs`(技巧:大綱、指法、記譜 + 版本指紋)
  - `node tools/test/ear-verify.mjs`(聽音:檢定、練習、旋律)
  - `node --test test/sight/*.test.js`(視奏產生器);`node tools/sight/audit.js`(視奏的統計分布,改產生器後要跑)
- 瀏覽器測試(`cd tools/test && npm i` 一次;Playwright):
  - `node tools/test/layout.mjs`(19 種尺寸 × 每個畫面;`ONLY=fold-280,se1-320` 只跑幾種)
  - `node tools/test/bilingual.mjs [尺寸]`(中英版面一致)
  - `node tools/test/human.mjs 150 3`(模擬真人隨機操作;換幾個種子)
  - `node tools/test/clip.mjs [尺寸]`(文字被切掉:g j p y 下伸部、上方重音超出 overflow 的範圍;所有分頁 × 中英 × 8 種尺寸)
  - `node tools/test/notation.mjs`(大綱 443 題實際用 OSMD 畫出來比對)
  - `node tools/test/playback.mjs`(技巧、聽音、視奏播放中換語言:不停播,只換文字)
  - `node tools/sight/smoke.js`、`engraving-check.js`、`highlight-check.js`、`staff-metrics.js`、`mic-check.js`(視奏的繪譜、重疊、播放色塊、麥克風評分)
- 上架:`docs/APPSTORE.md`
