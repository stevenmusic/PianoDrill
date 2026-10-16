# 上架 App Store 準備

## 這邊已經準備好的
| 項目 | 位置 |
|---|---|
| iOS 外殼設定(Capacitor 6) | `app/capacitor.config.json`、`app/package.json` |
| 把網頁複製成 App 內容 | `node tools/build/app-www.mjs` → `app/www/`(網頁本身仍然沒有 build step) |
| App 圖示 | `icons/`(1024 版本在 Mac 上用 `icons/icon-512.png` 放大或重跑 `tools/test/icons.mjs` 改尺寸) |
| 隱私權政策(中英) | `privacy.html` → 上線後網址 `https://stevenmusic.github.io/FingerDrill/privacy.html` |
| 商店截圖 | `app/screenshots/`(iPhone 6.7 吋 1290×2796、iPad 13 吋 2064×2752;`cd tools/test && node appshots.mjs` 重新產生) |

## 要在 Mac 上做的(需要 Xcode 與 Apple 開發者帳號,年費 US$99)
```bash
cd app
npm install
npx cap add ios          # 第一次:產生 app/ios(Xcode 專案,建議 commit)
npm run sync             # 之後每次改網頁:複製 www + 同步到 iOS
npm run open             # 用 Xcode 打開
```
Xcode 裡:Signing & Capabilities 選自己的 Team → Bundle ID `io.github.stevenmusic.fingerdrill` → 圖示放進 Assets(AppIcon 1024)→ Product ▸ Archive ▸ Distribute App ▸ App Store Connect。

## App Store Connect 填寫
- **名稱**:手指特訓 FingerDrill
- **副標題**(30 字內):鋼琴音階、琶音、哈農與檢定抽考
- **類別**:教育(次要:音樂)
- **年齡分級**:4+;**隱私**:不收集任何資料(Data Not Collected)
- **關鍵字**:鋼琴,音階,琶音,哈農,指法,ABRSM,Trinity,檢定,練習,節拍器
- **描述**:
  > 給鋼琴學生、老師和想練手指的人。音階、琶音、哈農第一部分 1–20 首,每個音都標指法,取樣鋼琴示範附預備拍。
  > 準備 ABRSM / Trinity 檢定的,選好級數就能依官方大綱隨機抽考(初級到 8 級)。
  > 速度可以慢慢加,哈農按 ✓ 記錄最高速度、下一輪自動加快;練習紀錄顯示連續天數。全部離線可用、不需要登入、沒有廣告。
- **英文描述**:Scales, arpeggios and Hanon Part I with fingering on every note, a sampled-piano demo with count-in, and ABRSM / Trinity exam drills (Initial–Grade 8) taken straight from the official syllabuses. Works offline, no sign-in, no ads.

## 審核規則 4.2(不能只是網頁包裝)要強調的
審核備註可以寫:
- 全部離線可用(樂譜引擎、資料、取樣都在裝置上)
- 依官方檢定大綱產生 443 種考題,樂譜與指法即時產生,不是靜態網頁
- 取樣鋼琴示範、拍點、播放軸、速度階梯與最高速度紀錄、練習紀錄
- 若被以 4.2 退件,可再加原生功能:每日練習提醒(@capacitor/local-notifications)、觸覺回饋(@capacitor/haptics)

## 授權提醒
- 鋼琴取樣 Salamander Grand(CC-BY 3.0)、節拍器 Naked Drums(CC-BY 4.0)、OSMD(BSD-3):App 內頁尾已署名
- 檢定大綱內容只整理「要求清單」(調、八度、奏法),不含官方譜例;ABRSM、Trinity 是各自的商標,描述中只當說明用途使用
