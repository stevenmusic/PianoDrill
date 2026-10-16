# 上架 App Store 準備(跟 FingerDrill 同一套流程)

## 這邊已經準備好的
| 項目 | 位置 |
|---|---|
| iOS 外殼設定(Capacitor 6) | `app/capacitor.config.json`、`app/package.json`(Bundle ID `io.github.stevenmusic.eardrill`) |
| 把網頁複製成 App 內容 | `node tools/build/app-www.mjs` → `app/www/` |
| App 圖示 | `icons/`(含 `icon-1024.png`;`cd tools/test && node icons.mjs` 重新產生) |
| 隱私權政策(中英) | `privacy.html` → `https://stevenmusic.github.io/EarDrill/privacy.html` |
| 商店截圖 | 待做(iPhone 6.7 吋 1290×2796、iPad 13 吋 2064×2752) |

## 要在 Mac 上做的
```bash
cd app && npm install
npx cap add ios      # 第一次
npm run sync         # 之後每次改網頁
npm run open         # Xcode → Signing 選 Team → Archive → App Store Connect
```

## App Store Connect
- **名稱**:聽音特訓 EarDrill;**副標題**:音程、和弦聽音與檢定聽力練習
- **類別**:教育(次要:音樂);**年齡**:4+;**隱私**:不收集任何資料
- **關鍵字**:聽音,音程,和弦,視唱聽寫,樂理,ABRSM,Trinity,檢定,絕對音感,練耳
- **描述**:單音、音程、和弦聽音練習,取樣鋼琴出題、自動批改,錯得多的項目多練。準備 ABRSM / Trinity 檢定的,選好級數就能練官方大綱的聽力測驗(初級到 8 級):拍子、節奏、回聲、找出改變、終止式、和弦、轉調。全部離線可用、不需要登入、沒有廣告。
- **英文描述**:Ear training for notes, intervals and chords with a sampled piano and instant marking, plus ABRSM / Trinity aural test practice (Initial–Grade 8) built from the official syllabuses. Works offline, no sign-in, no ads.

## 審核規則 4.2(不能只是網頁包裝)可以強調
- 每一題即時產生(旋律、和聲、終止式、轉調),不是靜態內容;自動批改(選擇題、鍵盤、節拍鍵)
- 離線可用、正確率統計、加強弱項、練習紀錄
- 之後的打分系統(麥克風)、觸覺回饋、每日提醒可以再加原生功能
