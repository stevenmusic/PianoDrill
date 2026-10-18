# 上架 App Store 準備(PianoDrill 鋼琴檢定特訓)

> 這份是 **App Store Connect 要填的內容與送審準備**;iOS 原生步驟(Xcode、AppDelegate、Info.plist、隱私清單、TestFlight、實機檢查清單)在 `docs/IOS.md`。
> DrumDrill 的 `docs/APPSTORE.md` 用同一個格式(章節一樣,內容各自的)。查證日期 2026-10-18。

三個工具(FingerDrill 手指特訓、SightDrill 視奏、EarDrill 聽音特訓)合併成一個 App 上架。
合併的好處之一:同一個開發者送三個外觀、架構幾乎一樣的 App,容易被審核當成 **4.3 重複 App(Spam)** 退件;合成一個就沒有這個問題,
而且「同一個級數同時練音階、視奏、聽力」本身就是單一工具做不到的功能(對 **4.2 最低功能要求** 也有幫助)。

## 1. 這邊已經準備好的

| 項目 | 位置 / 內容 |
|---|---|
| iOS 外殼(Capacitor 8) | `app/capacitor.config.json`、`app/package.json`;Bundle ID `io.github.stevenmusic.pianodrill` |
| 把網頁複製成 App 內容 | `cd app && npm run www`(= `tools/build/app-www.mjs`:複製網頁、**拿掉 Google Fonts 改用系統字型**、寫入版本號、打包取樣);`node tools/test/app-www.mjs` 檢查完整 |
| 取樣打包進 App | `tools/build/app-samples.mjs`:5 層力度 × 30 個音 + 拍點,153 個檔、約 35 MB(第一次要連網下載到 `tools/build/samples/`,有 ffmpeg 會截成 6.5 秒) |
| 版本號 | repo 根目錄的 `VERSION`(1.0.0);app-www 寫進 Xcode 的 `MARKETING_VERSION`,build 號 = git commit 數(`docs/IOS.md` 第 6 節) |
| App 圖示 | `icons/icon-1024.png`(預設,金底)、`icon-1024-dark.png`(深色模式)、`icon-1024-tinted.png`(著色模式);`cd tools/test && node icons.mjs` 重新產生 |
| 隱私權政策(中英) | `privacy.html` → `https://stevenmusic.github.io/PianoDrill/privacy.html` |
| 支援頁(中英) | `support.html` → `https://stevenmusic.github.io/PianoDrill/support.html`(常見問題、GitHub 回報;支援信箱設好才顯示寄信) |
| 授權與出處(中英) | `licenses.html`(Salamander CC BY 3.0、Naked Drums CC BY 4.0 + 修改說明、OSMD BSD-3 全文、檢定要求出處、商標聲明) |
| 麥克風 | 視奏「跟著彈」可選用:**要加** `NSMicrophoneUsageDescription` 與中英文 InfoPlist.strings(`docs/IOS.md` 第 4 節)、AudioSession 外掛(第 3b 節) |
| 商店截圖(中文,五張) | `app/screenshots/`:iPhone 1290×2796、iPad 13 吋 2064×2752;`cd tools/test && node appshots.mjs` 重新產生(英文版還沒有,第 7 節) |

### 圖示為什麼這樣設計
- 三個工具合併後,原本的耳朵、手、眼睛都只代表一部分;硬把三個符號擠在一起,縮到 40px 就糊了。改畫三者的共同點:**鋼琴(三白兩黑鍵)+ 考試結果(勾 = 答對、通過)**,勾也跟 App 裡的自動批改同一個意思。
- 小尺寸(主畫面 60pt、Spotlight 40pt、設定 29pt)還認得出來:只有 3 白 2 黑鍵、勾的筆畫很粗。
- 預設**金底**:在彩色、淺色、深色桌布上都清楚,App Store 搜尋結果裡跟一般紅、藍、紫底的鋼琴 App 分得開;**深色模式黑底金勾**,跟 App 介面同色,打開時從圖示到畫面的轉場一致;著色模式給灰階前景。
- 不放文字,不用 ABRSM / Trinity 的標誌或配色(商標)。
- Xcode 26 的 AppIcon 用單一尺寸 1024,Appearances 選 Any, Dark, Tinted;之後想做 iOS 26 的 Liquid Glass 立體效果,可以用 Icon Composer 把「底色 / 琴鍵 / 勾」分三層重做(設計已經是分層的,`tools/test/icons.mjs`)。

## 2. 2026 年的硬性規定(先看)

- 2026-04-28 起,上傳的版本必須用 **Xcode 26 / iOS 26 SDK** 建置;外殼因此從 Capacitor 6 升到 Capacitor 8(最低 iOS 15、Node 22)(`docs/IOS.md` 第 1、2 節)。
- 年齡分級改成 4+ / 9+ / 13+ / 16+ / 18+,問卷題目也改了(第 8 節)。
- 歐盟要先在「商務」填 **DSA 交易者身分**,沒填不會在歐盟上架(`docs/IOS.md` 第 1 節)。

## 3. App 資訊

| 欄位(上限) | English (U.S.)(主要語言) | 繁體中文 |
|---|---|---|
| 名稱(30 字) | PianoDrill: Piano Exam Prep | PianoDrill 鋼琴檢定特訓 |
| 副標題(30 字) | Scales, Sight-reading & Aural | 音階、視奏、聽力一次練好 |
| 類別 | 教育 Education(次要:音樂 Music) | 同左 |
| 價格 | 免費、沒有內購、沒有廣告 | 同左 |

- 名稱在 App Store 必須是唯一的;被用掉就改成「PianoDrill – Piano Exam Trainer」之類,中文名稱不變。
- 用詞:App 內一律「檢定」「考試」;「考級」只放在關鍵字(有人這樣搜尋)。

## 4. 描述

**繁體中文**
> 準備鋼琴檢定的學生、上課抽考的老師,或只想好好練琴的人,都可以用。
> 技巧:音階、琶音、哈農 1–20 首都標指法(三度、六度照哈農原書),取樣鋼琴示範附預備拍,速度可以慢慢加。
> 視奏:依官方視奏範例整理的規則隨機出題(1–8 級),30 秒準備、聽正確版本比對,可以選用麥克風評節奏。
> 聽音:單音、音程、和弦聽音練習,鍵盤作答、自動批改,錯得多的項目多練。
> 檢定:選好考試(ABRSM / Trinity)和級數一次,音階琶音、視奏、聽力測驗都照這一級出題,還有模擬考(ABRSM、Trinity 為各自的商標,本 App 與其無關;僅供練習,實際要求以官方大綱為準)。
> 鋼琴音色內建在 App 裡,不用網路也能用;不需要登入、沒有廣告、不收集任何資料。

**English**
> For piano students preparing for a grade exam, teachers giving spot checks, and anyone who simply wants to practise well.
> Technique: scales, arpeggios and Hanon 1–20 with fingering on every note (thirds and sixths as in Hanon's original), sampled piano demos with a count-in and a tempo you can raise step by step.
> Sight-reading: random tests generated from rules modelled on the official specimen tests (Grades 1–8), 30 seconds' preparation, compare with the correct version, optional microphone rhythm scoring.
> Ear training: notes, intervals and chords answered on a keyboard with instant marking; your weak spots come up more often.
> Exams: set your board (ABRSM / Trinity) and grade once and scales, sight-reading and aural tests all follow it, plus a mock exam (ABRSM and Trinity are trademarks of their owners; this app is not affiliated with them. Practice only — the official syllabus is final).
> Sampled piano built in and works offline. No sign-in, no ads, no data collected.

- **描述只寫 App 裡真的有的功能**(審核 2.3.1)。
- 宣傳文字(Promotional Text,170 字,可以隨時改不用送審):先留空,有新功能時再寫。

## 5. 關鍵字(100 字元,逗號分隔、不重複名稱裡的字)

- **繁體中文**:`音階,琶音,哈農,視奏,聽音,聽力,練耳,音程,和弦,指法,考級,樂理,練琴,節拍器,scales,sight reading`(63 字)
- **English**:`scales,arpeggios,hanon,sight reading,ear training,aural,intervals,chords,fingering,grade,theory`(95 字)
- **不放考試機構與其他組織的名稱**:ABRSM、Trinity、英國皇家、RSL、Rockschool(審核 2.3.7:關鍵字不能放別人的商標;本 App 與它們無關,放了容易被當成冒用而退件)。舊版關鍵字有 ABRSM、Trinity、英國皇家,已經拿掉。

## 6. 審核備註(App Review Information ▸ Notes,貼英文)

```text
- No sign-in, no account, no network needed: the piano samples, notation engine, syllabus data and test rules are inside the app. It works fully offline from the first launch.
- Exam board names (ABRSM, Trinity College London) are used only to describe which syllabus the practice follows. This app is not affiliated with, endorsed by, or sponsored by them; it uses none of their logos, colours or copyrighted test material. Scale and aural requirements cite the public syllabus, and screens say the official syllabus is final.
- Sight-reading tests are generated on the device from rules modelled on the boards' public specimen tests; scale questions and aural tests (melodies, cadences, modulations) are generated and marked by the app. They are not official test pieces.
- Microphone (optional): only in sight-reading "play along", only after the user ticks it and allows access; audio is analysed on the device for note onsets and never recorded or uploaded.
- Native functionality beyond a web page: native audio session (plays with the silent switch on), bundled multi-velocity piano samples, instant marking, mock exam, practice statistics, offline use.
- No data is collected; no tracking; no analytics or advertising SDKs. Practice settings stay on the device.
- How to test: open the Technique tab and press play; open Exams, choose a board and grade, then try Sight-reading and Aural.
```

- 聯絡資訊填自己的姓名、電話、Email(只給審核員看,不公開)。
- 不需要示範帳號(沒有登入)。
- 如果還是被以 4.2(最低功能)退件:可以加原生功能,例如每日練習提醒(`@capacitor/local-notifications`)、觸覺回饋(`@capacitor/haptics`);加外掛要同步更新隱私清單。
- 如果被以 5.2.1(智慧財產)問考試機構名稱:回覆上面第 2 點,並附寄給 ABRSM、Trinity 的說明信紀錄(見第 13 節)。

## 7. 截圖清單(真實畫面,中英各一套)

| 尺寸 | 像素(直式) | 狀態 |
|---|---|---|
| iPhone 6.9 吋 | 1320×2868(或 1290×2796、1260×2736) | 中文已有(`app/screenshots/iphone-*.png`,1290×2796);英文要做 |
| iPhone 6.5 吋 | 1284×2778(或 1242×2688) | 要做(沒有 6.9 吋時才是必填,一起準備比較保險) |
| iPad 13 吋 | 2064×2752(或 2048×2732) | 中文已有(`app/screenshots/ipad13-*.png`);英文要做 |

- 每個尺寸 1–10 張,PNG / JPEG,**不能有透明通道**。Apple 會把最大尺寸縮給較小的裝置用。
- Apple 的規格頁(2026-10)同時寫了「iPhone 至少一張 Dynamic Island(中尺寸,6.3 吋 1206×2622)」;上傳時看 App Store Connect 實際要求哪一格,要的話用同一組畫面輸出 1206×2622。
- 一定要是 App 的真實畫面(審核 2.3.3),不要放考試機構的標誌;可以加簡短的說明文字,但不要寫「官方」。
- 現有 5 張:檢定、音階、視奏、聽音、聽力測驗(`appshots.mjs`)。英文版用同一支程式切英文產生。

## 8. 年齡分級

新制問卷(2025 年改版;每一題照實回答):
- 暴力、性、髒話、恐怖、藥物酒精菸草、賭博、競賽:**沒有**
- 醫療或健康資訊:**沒有**
- 使用者產生的內容、使用者之間的通訊、在 App 內不受限制地上網:**沒有**(頁尾、支援頁的 GitHub 連結會打開外部的 Safari,不是 App 內瀏覽器)
- 內購、廣告、AI 產生內容:**沒有**
- 家長控制、年齡驗證:**沒有**

預期結果 **4+**。

## 9. App 隱私

- **Data Not Collected(不收集任何資料)**:沒有分析、沒有當機回報 SDK、沒有帳號;練習紀錄只存在裝置上。
- 麥克風只在裝置上即時分析、不存不傳,不算「收集」。
- 跟 `PrivacyInfo.xcprivacy`(全部空的,`docs/IOS.md` 第 5 節)、`privacy.html` 一致。
- App 版不載入 Google Fonts(app-www 拿掉了);網頁版的 Google Fonts、GitHub 取樣下載寫在 `privacy.html`。
- 隱私權政策網址:`https://stevenmusic.github.io/PianoDrill/privacy.html`

## 10. 網址

| 欄位 | 網址 |
|---|---|
| 支援網址(必填) | `https://stevenmusic.github.io/PianoDrill/support.html` |
| 行銷網址(選填) | `https://stevenmusic.github.io/PianoDrill/` |
| 隱私權政策(必填) | `https://stevenmusic.github.io/PianoDrill/privacy.html` |

## 11. 版本說明(What's New)

- 1.0 第一版不用填。
- 之後的範本(兩種語言都要):
  - 中文:`修正:…;新增:…。檢定要求核對到 <大綱版本>。`
  - English:`Fixes: … New: … Exam requirements checked against <syllabus edition>.`
- 檢定資料改了一定要寫,因為網頁版會先更新,App 要等這一版。

## 12. 價格與供應地區

- 免費,沒有內購。
- 供應地區:**中國大陸**上架需要 ICP 備案(據審查員所知,未查證),沒有備案就在「價格與供應」取消勾選中國大陸。
- 簡體中文:目前沒有,簡中使用者看到英文介面。

## 13. 授權與商標提醒

- 鋼琴取樣 Salamander Grand(CC BY 3.0)、拍點 Naked Drums(CC BY 4.0)、OSMD(BSD-3-Clause):`licenses.html` 有授權連結、修改說明、BSD 全文;頁尾有署名。
- 檢定大綱內容只整理「要求清單」(調、八度、奏法、測驗項目),不含官方譜例;視奏題目是 App 依規則產生的,不是官方題目。
- ABRSM、Trinity 是各自的商標:描述只當說明用途,頁尾與 `licenses.html` 註明無關;App 圖示不用它們的標誌或配色。
- 建議:寫信給 ABRSM、Trinity College London 說明用途(免費練習工具、不用標誌配色),留著寄信紀錄,審核問起時可以附上。

## 14. 實機測試結果

照 `docs/IOS.md` 第 8 節的 20 項(第 17–20 項是麥克風:權限視窗的語言、拒絕後照常、錄音時從喇叭出聲、用完切回混音),用 TestFlight 版測完把結果填在這裡(✓ / ✗ + 備註)。

| # | iPhone SE | 一般 iPhone | iPad | 備註 |
|---|---|---|---|---|
| 1–20 | 未測 | 未測 | 未測 | |

## 15. 需要你自己做或決定的

1. Apple Developer Program 帳號、App Store Connect 的 App 記錄、DSA 交易者身分。
2. 在 Mac 上照 `docs/IOS.md` 做:`cap add ios`、AppDelegate、AudioSession 外掛(第 3b 節)、Info.plist(含麥克風)、InfoPlist.strings、PrivacyInfo.xcprivacy、圖示、Archive、TestFlight。
3. 實機測試(第 14 節),特別是「邊放音樂邊練」(`docs/IOS.md` 第 3 節還沒解決的那一點)。
4. 支援信箱:要不要公開一個 Email?要的話填在 `support.html` 的 `APP.EMAIL`(空白時只顯示 GitHub 回報)。
5. 英文截圖(第 7 節)、英文名稱是否被用掉(第 3 節)、中國大陸是否上架(第 12 節)。
6. 寄信給 ABRSM、Trinity(第 13 節)。
