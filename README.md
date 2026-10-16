# PianoDrill 鋼琴檢定特訓

準備鋼琴檢定(ABRSM / Trinity)的練習 App:**技巧(音階、琶音、哈農)、視奏、聽音**三個練習,加上把三者照同一個級數串起來的**檢定**分頁。
由三個工具合併而成(2026-10):FingerDrill 手指特訓、SightDrill 視奏、EarDrill 聽音特訓(三個 repo 的完整歷史都在這裡)。
中英雙語、黑金設計系統(與 ScrollScore / HarmonyMap / HarmonyHands 同一系列),手機直式優先(iPhone 放在譜架上看),準備上架 App Store(`docs/APPSTORE.md`)。

線上版(GitHub Pages,main 根目錄):<https://stevenmusic.github.io/PianoDrill/>

## 四個分頁(順序照考試的順序)

| 分頁 | 子項目 | 內容 |
|---|---|---|
| **技巧** | 音階 / 琶音 / 哈農 | 五線譜 + 每個音的指法、取樣鋼琴示範(預備拍、拍點、播放軸)、速度階梯、熟練標記 |
| **視奏** | — | 依 ABRSM 官方視奏範例整理的規則隨機出題(1–8 級、可指定調性),30 秒準備(先給主和弦)、聽正確版本比對、跟著彈(選用麥克風評節奏) |
| **聽音** | 單音 / 音程 / 和弦 | 取樣鋼琴出題、鍵盤或選項作答、自動批改、加強弱項、每日目標 |
| **檢定** | 音階琶音 / 視奏 / 聽力 | 考試系統 + 級數設一次,三項都照這一級:音階琶音抽考與模擬考、該級視奏、聽力測驗(拍子、回聲、找出改變、終止式、和弦、轉調…)與模擬考 |

- 第一次打開會問「你在準備鋼琴檢定嗎?」:選了考試和級數 → 打開檢定分頁;不考 → 自由練習
- 檢定設定卡下面三格顯示各項進度(音階琶音通過幾項、今天做了幾題視奏、聽力正確率),點了切過去
- Trinity 與 ABRSM 初級的視奏還沒有出題規則:檢定分頁照實說明,不拿 ABRSM 的規則充數

## 檔案

```
index.html                 外框 + 三個模組的卡片(id 前綴:t- 技巧、s- 視奏、e- 聽音)
css/app.css                共用樣式(設計代幣、外框、技巧、聽音);css/sight.css 視奏
js/main.js                 外框:分頁、子項目、考試設定、主題、語言、第一次打開的問題
js/shared/audio.js         取樣鋼琴(ScrollScore 的 Salamander)、拍點、主控限幅
js/shared/i18n.js          中英雙語
js/tech/                   技巧(原 FingerDrill):大綱、指法、哈農、記譜
js/sight/                  視奏(原 SightDrill):播放、跟著彈、評分;generator/ 出題產生器
js/ear/                    聽音(原 EarDrill):聽音題目、聽力測驗、旋律/和聲產生
data/                      syllabus.json、fingerings.json(技巧)、aural.json(聽力)、sight-rules.json(視奏)
vendor/                    OpenSheetMusicDisplay 2.1.0
icons/                     App 圖示(tools/test/icons.mjs 產生)
app/                       iOS 外殼(Capacitor 8)與商店截圖
tools/build/               stamp.mjs(版本指紋)、app-www.mjs(複製網頁給 App)、syllabus_src.py 等
tools/test/                瀏覽器與資料測試;tools/sight/ 視奏的統計與繪譜檢查;test/sight/ 視奏單元測試
docs/                      APPSTORE.md;tech/、sight/、ear/ 各模組原本的說明與規則
```

沒有 build step:多檔 ES modules,直接部署 GitHub Pages。改了 css / js / data 之後執行 `node tools/build/stamp.mjs`(版本指紋,不然手機會拿到新舊混雜的檔案)。

## 測試

```bash
npm test                                   # 技巧大綱/指法/記譜、聽力題目、視奏產生器(不用瀏覽器)
cd tools/test && npm i && cd ../..         # 第一次:Playwright
node tools/test/layout.mjs                 # 19 種尺寸 × 每個畫面
node tools/test/bilingual.mjs              # 中英版面一致
node tools/test/human.mjs 150 3            # 模擬真人隨機操作
node tools/test/notation.mjs               # 大綱 443 題實際畫譜比對
node tools/test/fingers.mjs                # 指法數字位置
node tools/sight/smoke.js                  # 視奏 1–8 級繪譜;engraving-check / highlight-check / staff-metrics / mic-check
node tools/sight/audit.js                  # 視奏的統計分布(改產生器後要跑)
```

各模組的設計與依據(大綱頁碼、指法來源、視奏規則的分析)見 `docs/tech/README.md`、`docs/sight/README.md`、`docs/ear/README.md`。

## 授權

鋼琴音色 Accurate-Salamander Grand Piano V6.2(Salamander Grand Piano V3 by Alexander Holm,CC-BY 3.0);拍點 Naked Drums(Wilkinson Audio,CC-BY 4.0);
OpenSheetMusicDisplay(BSD-3-Clause,`vendor/OSMD-LICENSE.txt`)。ABRSM、Trinity 為各自的商標,本 App 與其無關。
