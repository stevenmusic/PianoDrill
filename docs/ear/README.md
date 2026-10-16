# EarDrill 聽音特訓

聽音練習工具:**單音、音程、和弦**三個練習分頁,加上 **ABRSM / Trinity 檢定聽力測驗**。和 FingerDrill 手指特訓同一系列(黑金設計、中英雙語、取樣鋼琴、手機直式優先、之後上架 App Store)。

線上版(GitHub Pages,main 根目錄):<https://stevenmusic.github.io/EarDrill/>

## 架構:三個練習分頁 + 檢定

| 分頁 | 內容 | 作答 |
|---|---|---|
| **單音** | 選要出的音(白鍵 / 全部 / 自選)、音域 1 / 2 / 4 個八度、參考音(先聽 C、先聽 A、不給 = 絕對音感) | 點一個八度的鍵盤 |
| **音程** | 小二度到八度自選(入門 / 全部)、上行 / 下行 / 同時 / 混合、起音隨機或固定 C | 選擇題 |
| **和弦** | 大三、小三、減三、增三、屬七、大七、小七、半減七、減七;原位或含轉位;同時 / 分解 / 分解再同時 | 選擇題 |
| **檢定** | ABRSM、Trinity 初級–8 級:每一級列出官方聽力測驗,每一項可以練的題型一鍵出題,或「隨機抽一題」 | 選擇題 / 鍵盤 / 節拍鍵 |

- 每一題:取樣鋼琴出題(可重聽)、自動批改、答錯顯示答案;答完點選項可以聽那個選項比較
- **答對自動下一題**、**加強弱項**(錯得多的項目多出)
- **各項正確率**(每個分頁 / 每一級)與**練習紀錄**(連續天數、今天題數、正確率、最近 7 天)

## 檢定:依官方大綱整理

| 系統 | 依據 | 頁碼 |
|---|---|---|
| ABRSM | *Piano Practical Grades Qualification Specification 2025 & 2026*(2027 & 2028 版聽力測驗逐字比對,相同) | 初級、1 級 p.46;2、3 級 p.47;4 級 p.48 … 8 級 p.52 |
| Trinity | *Piano Syllabus — Qualification specifications for graded exams from 2023*,Supporting tests: Aural | 初級 p.99、1 級 p.102 … 8 級 p.123 |

資料在 `data/aural.json`(每一級的測驗摘要 + 可以練的題型)。App 能產生並批改的題型:

| 題型 | 用在 | 怎麼批改 |
|---|---|---|
| 跟著打拍子 | ABRSM 初級–3 級 A;Trinity 初級–5 級 | 播放時按節拍鍵:速度要對、穩定度 ≥ 75% |
| 幾拍子 / 拍號 | ABRSM 1–7 級;Trinity 5–8 級 | 選擇題(二/三/四/6/8;Trinity 寫拍號,8 級含 5/4) |
| 拍出節奏 | ABRSM 初級 B(回聲)、4–7 級 | 節拍鍵:數量對、每個間隔誤差 ≤ 35%(整體快慢不限) |
| 聽完彈回來 | ABRSM 初級–3 級回聲、4–5 級背奏、6 級上聲部、7 級下聲部、8 級最低聲部 | 鍵盤彈出每個音(整段高/低八度也算對) |
| 力度、奏法、速度變化、大調/小調、調性改變 | ABRSM 初級–7 級;Trinity 初級–8 級 | 選擇題 |
| 找出改變 | ABRSM 1–3 級 C;Trinity 1–8 級 | 開頭/結尾、音高/節奏、第幾小節(Trinity 6–8 級兩到三處) |
| 最高/最低音、最後一音高或低 | Trinity 初級–2 級 | 選擇題 |
| 音程 | Trinity 3–5 級 | 3 級只說度數;4 級到大六度;5 級到八度 |
| 終止式 | ABRSM 6–8 級;Trinity 4–5 級 | 完全 / 不完全 / 阻礙 / 變格 |
| 和弦 | ABRSM 7 級(兩個,I IV V V7 vi)、8 級(三個,含轉位) | 逐個選 |
| 轉調 | ABRSM 7–8 級;Trinity 6–7 級 | 屬調 / 下屬調 / 關係調 |

**App 不出題的項目**(只列出要求,請跟老師練習):ABRSM 4–8 級的看譜唱、性格 / 風格與時期 / 織體 / 曲式的口頭描述、8 級 D 描述特徵;Trinity 6–8 級「評論其他特徵」。Trinity 3 級起的「找出改變」考試時會給樂譜,App 目前只用聽的。

## 之後

- [ ] 打分系統:用麥克風判斷彈的音對不對(使用者要求,架構做完後加)
- [ ] 看譜唱 / 找改變的樂譜(OSMD,跟 FingerDrill 同一套)
- [ ] 上架 App Store(見 `docs/APPSTORE.md`)

## 檔案結構(沒有 build step,直接部署)

```
index.html          頁面
css/app.css         樣式(設計代幣照 FingerDrill / HarmonyHands)
js/app.js           主程式(分頁、設定、題目卡、播放、批改、正確率、練習紀錄)
js/ear.js           單音 / 音程 / 和弦 的題目
js/aural.js         檢定題型(依 data/aural.json 出題)+ 節拍鍵、鍵盤的批改
js/music.js         旋律、和聲、終止式、轉調產生器
js/audio.js         取樣鋼琴與母帶鏈路(照抄 FingerDrill)
js/i18n.js          中英雙語
js/store.js         localStorage
data/aural.json     檢定聽力要求
tools/build/        stamp.mjs(版本指紋)、app-www.mjs(App 打包)
tools/test/         verify.mjs、smoke.mjs、icons.mjs
app/                Capacitor iOS 外殼設定
```

## 驗證

```
node tools/test/verify.mjs                  # 檢定 10100 題、練習 6000 題、旋律 5000 句的規則檢查 + 版本指紋
python3 -m http.server 8765 &               # 根目錄
cd tools/test && npm i && node smoke.mjs    # 瀏覽器:第一次打開、三個分頁作答、檢定每一級每個題型、中英切換、沒有錯誤
node tools/build/stamp.mjs                  # 改了 css/js/data 之後更新版本指紋
```

## 授權

- 鋼琴:Accurate-Salamander Grand Piano V6.2(Salamander Grand Piano V3 by Alexander Holm,CC-BY 3.0),經 ScrollScore 整理
- 拍點:Naked Drums(Wilkinson Audio,CC-BY 4.0)side-stick,經 ScrollScore 整理
- 檢定要求為練習用整理摘要,未經 ABRSM / Trinity College London 審定;題目由 App 產生,不是官方題目
