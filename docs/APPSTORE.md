# 上架 App Store 準備(PianoDrill 鋼琴檢定特訓)

三個工具(FingerDrill 手指特訓、SightDrill 視奏、EarDrill 聽音特訓)合併成一個 App 上架。
合併的好處之一:同一個開發者送三個外觀、架構幾乎一樣的 App,容易被審核當成 **4.3 重複 App(Spam)** 退件;合成一個就沒有這個問題,
而且「同一個級數同時練音階、視奏、聽力」本身就是單一工具做不到的功能(對 **4.2 最低功能要求** 也有幫助)。

## 這邊已經準備好的
| 項目 | 位置 |
|---|---|
| iOS 外殼設定(Capacitor 8) | `app/capacitor.config.json`、`app/package.json`(Bundle ID `io.github.stevenmusic.pianodrill`) |
| 把網頁複製成 App 內容 | `node tools/build/app-www.mjs` → `app/www/`(網頁本身仍然沒有 build step) |
| 鋼琴取樣打包進 App | `app-www.mjs` 會一起執行 `tools/build/app-samples.mjs` → `app/www/samples/`(5 層力度 × 30 個音 + 拍點,約 35MB;第一次要連網下載到 `tools/build/samples/`,有 ffmpeg 會截成 6.5 秒) |
| App 圖示 | `icons/icon-1024.png`(預設,金底)、`icon-1024-dark.png`(深色模式)、`icon-1024-tinted.png`(著色模式);`cd tools/test && node icons.mjs` 重新產生 |
| 隱私權政策(中英) | `privacy.html` → 上線後 `https://stevenmusic.github.io/PianoDrill/privacy.html` |
| 商店截圖(中文,五張)| `app/screenshots/`:iPhone 1290×2796(6.9 / 6.7 吋欄位都能用)、iPad 13 吋 2064×2752;`cd tools/test && node appshots.mjs` 重新產生 |

## 2026 年的硬性規定(先看)
- **2026-04-28 起,上傳到 App Store Connect 的版本必須用 Xcode 26 以上、iOS 26 SDK 建置**(舊版 Xcode 建的會在上傳時就被擋)。
  Deployment target 可以比較低(Capacitor 8 最低 iOS 15),不影響舊 iPhone 安裝。
- 所以外殼從原本的 Capacitor 6 升到 **Capacitor 8**(Capacitor 8 需要 Xcode 26、Node 22 以上)。
- 圖示:Xcode 26 的 AppIcon 用「單一尺寸 1024」,在 Appearances 選 **Any, Dark, Tinted**,三格各放上面的三個 PNG(不透明、直角,系統自己切圓角)。
  之後想做 iOS 26 的 Liquid Glass 立體效果,可以用 Icon Composer 把「底色 / 琴鍵 / 勾」分三層重做(設計已經是分層的,`tools/test/icons.mjs`)。

## 圖示為什麼這樣設計
- 三個工具合併後,原本的耳朵、手、眼睛都只代表一部分;硬把三個符號擠在一起,縮到 40px 就糊了。改畫三者的共同點:**鋼琴(三白兩黑鍵)+ 考試結果(勾 = 答對、通過)**,勾也跟 App 裡的自動批改同一個意思。
- 小尺寸(主畫面 60pt、Spotlight 40pt、設定 29pt)還認得出來:只有 3 白 2 黑鍵、勾的筆畫很粗。
- 預設**金底**:在彩色、淺色、深色桌布上都清楚,App Store 搜尋結果裡跟一般紅、藍、紫底的鋼琴 App 分得開;**深色模式黑底金勾**,跟 App 介面同色,打開時從圖示到畫面的轉場一致;著色模式給灰階前景。
- 不放文字,不用 ABRSM / Trinity 的標誌或配色(商標)。

## 要在 Mac 上做的(需要 Xcode 26 與 Apple 開發者帳號,年費 US$99)
```bash
cd app
npm install
npx cap add ios          # 第一次:產生 app/ios(Xcode 專案,建議 commit)
npm run sync             # 之後每次改網頁:複製 www + 同步到 iOS
npm run open             # 用 Xcode 打開
```
Xcode 裡:
1. Signing & Capabilities 選自己的 Team,Bundle ID `io.github.stevenmusic.pianodrill`
2. Assets → AppIcon:Appearances 選 Any, Dark, Tinted,放三個 1024 圖示
3. **Info.plist 加 `NSMicrophoneUsageDescription`**(視奏「跟著彈」可選用麥克風評節奏;沒寫這個 key,一用麥克風 App 就會被系統關掉,審核也會退件):
   `用麥克風聽你彈的起音時間來評分節奏;聲音只在裝置上分析,不錄音、不上傳。`
   (英文 InfoPlist.strings:`Listens to when you play each note to score your rhythm. Audio is analysed on the device only — never recorded or uploaded.`)
4. Product ▸ Archive ▸ Distribute App ▸ App Store Connect

## App Store Connect 填寫
- **名稱**(30 字內):PianoDrill 鋼琴檢定特訓
- **副標題**(30 字內):音階、視奏、聽力一次練好
- **類別**:教育(次要:音樂);**年齡分級**:4+
- **App 隱私**:不收集任何資料(Data Not Collected)——麥克風只在裝置上即時分析、不存不傳,不算「收集」
- **關鍵字**(100 字元內,逗號分隔、不重複名稱裡的字):音階,琶音,哈農,視奏,聽音,聽力,練耳,音程,和弦,指法,ABRSM,Trinity,英國皇家,考級,樂理
- **描述**:
  > 準備鋼琴檢定的學生、上課抽考的老師,或只想好好練琴的人,都可以用。
  > 技巧:音階、琶音、哈農 1–20 首都標指法(三度、六度照哈農原書),取樣鋼琴示範附預備拍,速度可以慢慢加。
  > 視奏:依 ABRSM 官方視奏範例整理的規則隨機出題(1–8 級),30 秒準備、聽正確版本比對,可以選用麥克風評節奏。
  > 聽音:單音、音程、和弦聽音練習,鍵盤作答、自動批改,錯得多的項目多練。
  > 檢定:選好考試(ABRSM / Trinity)和級數一次,音階琶音、視奏、聽力測驗都照這一級出題,還有模擬考。
  > 第一次下載鋼琴音色後可以離線使用;不需要登入、沒有廣告。
- **英文描述**:Scales, arpeggios and Hanon with fingering on every note; random sight-reading tests modelled on ABRSM specimens (Grades 1–8); ear training for notes, intervals and chords plus ABRSM / Trinity aural tests — all set to your exam grade in one place. Sampled piano, instant marking, works offline once the piano sound has downloaded, no sign-in, no ads.
- 「考級」只放在關鍵字(有人這樣搜尋),App 內一律用「檢定」「考試」。

## 審核備註(4.2 最低功能)可以寫
- 離線可用(樂譜引擎、出題規則、資料、鋼琴取樣都在 App 裡;第一次打開、沒網路也有聲音)
- 題目即時產生:依官方大綱產生音階琶音考題、依規則產生視奏題(不是靜態圖片)、聽力題的旋律/和聲/終止式/轉調即時產生並自動批改
- 取樣鋼琴示範、播放軸、速度階梯、練習紀錄、正確率統計、模擬考
- 若還是被以 4.2 退件,可再加原生功能:每日練習提醒(@capacitor/local-notifications)、觸覺回饋(@capacitor/haptics)

## 授權與商標提醒
- 鋼琴取樣 Salamander Grand(CC-BY 3.0)、節拍器 Naked Drums(CC-BY 4.0)、OSMD(BSD-3):App 內頁尾已署名
- 檢定大綱內容只整理「要求清單」(調、八度、奏法、測驗項目),不含官方譜例;視奏題目是 App 依規則產生的,不是官方題目
- ABRSM、Trinity 是各自的商標,描述中只當說明用途使用;頁尾已註明本 App 與其無關
