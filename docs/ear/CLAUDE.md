# EarDrill 專案規則

## 回覆
- 每次更新(每次 push)都要用中文條列解釋這次改了什麼、為什麼改(使用者要求,不能省略)

## 定位與架構(照 FingerDrill)
- 底部四個分頁:單音 / 音程 / 和弦 / 檢定。三個練習分頁同等重要,檢定 = ABRSM、Trinity 聽力測驗
- 第一次打開問「在準備聽力檢定嗎?」:選了 → 打開檢定分頁;不考 → 自由練習
- 中英雙語(預設英文,切過就記住):頂欄 左:品牌名 + 副標;右:(考試標籤)→ 主題 → 語言。新字串一律走 js/i18n.js(data-i18n 或 tr("中", "EN"))
- 用詞:「檢定」「考試」,不用「考級」
- 題目格式統一(js/aural.js 開頭):play(要播的音)+ steps(選擇題)/ keys(鍵盤彈回來)/ tap(節拍鍵);app.js 統一播放、批改、記錄
- 之後要加:打分系統(用麥克風判斷彈的音對不對)——使用者說晚點加,先把架構做完

## 絕不能做的事
- **不要有 build step**:多檔 ES modules + data/*.json,直接部署 GitHub Pages(main 根目錄)
- **檢定要求只能照官方大綱**:`data/aural.json` 每一級有 source(頁碼);沒辦法自動出題/批改的項目(看譜唱、口頭描述風格)只列出要求,不要自己發明
  - ABRSM:Piano Practical Grades Qualification Specification 2025 & 2026,聽力 p.45–52(2027 & 2028 版逐字比對過,相同)。網站有 Cloudflare,要用 Playwright 開頁面再在頁內 fetch PDF
  - Trinity:Piano Syllabus from 2023(https://www.trinitycollege.com/resource/?id=9079),Supporting tests: Aural,初級 p.99 … 8 級 p.123
- **不要用合成鋼琴音**:鋼琴讀 ScrollScore 的 Salamander 取樣(js/audio.js 照抄 FingerDrill),拍點用 Naked Drums xstick
- 外觀照 FingerDrill / HarmonyHands 的設計代幣(css/app.css 開頭那段逐項相同),圖示用線稿 SVG(24 格、stroke 2、圓端點)

## 出題規則
- 旋律、和聲、終止式、轉調都由 js/music.js 產生(級數運算,結束在主音、跳進不超過五度);不要逐題手寫
- 回聲 / 背奏用鍵盤作答:整段高或低八度也算對(考試可以用不同八度唱)
- 單音分頁在作答前點鍵盤不出聲(不然可以試音找答案);答完才出聲比較
- 答完點選項可以聽那個選項(比較差在哪)

## 工作方式(省 token)
- 改好、測試沒問題就直接 push 到 main(使用者要求,不用另開分支);改了 css/js/data 一定要跑 `node tools/build/stamp.mjs`(版本指紋,不然手機拿到新舊混雜的檔案)
- 測試:`node tools/test/verify.mjs`(不用瀏覽器);`cd tools/test && npm i && node smoke.mjs`(要先在根目錄 `python3 -m http.server 8765`)
