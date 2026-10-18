# iOS App 原生步驟(PianoDrill / DrumDrill 共用)

> 這些步驟要在 Mac 上做(Xcode、簽章、上傳),雲端工作階段做不了。
> **兩個 repo 的這份文件一模一樣**(`tools/test/sync.json` 列為 `same`,`sync.mjs` 檢查);App 之間不同的地方都寫在第 0 節的表,內文用 `<App>`、`<BundleID>`、`<repo>` 代表。
> 查證日期 2026-10-18,來源在最後一節。商店上架文案、截圖、審核備註見 `docs/APPSTORE.md`。

## 0. 兩個 App 不同的地方

| 變數 | PianoDrill | DrumDrill |
|---|---|---|
| `<App>`(App 名稱 / `appName`) | PianoDrill | DrumDrill |
| `<BundleID>` | `io.github.stevenmusic.pianodrill` | `io.github.stevenmusic.drumdrill` |
| `<repo>` | `stevenmusic/PianoDrill` | `stevenmusic/DrumDrill` |
| 打包進 App 的取樣(`tools/build/app-samples.mjs`) | 鋼琴 30 個音 × 5 層力度(有 ffmpeg 就截成 6.5 秒)+ 拍點 xstick 3 個:153 個檔、約 35 MB | 小鼓 5 層 × 6 個 + 整組鼓 12 個鼓件(鼓皮每層 3 個、鈸每層 2 個)+ 拍點 + 鼓房殘響:104 個檔、約 10.9 MB |
| 麥克風(`NSMicrophoneUsageDescription`) | **要加**(視奏「跟著彈」可選用麥克風評節奏) | **先不要加**:S15 加入麥克風時才需要(沒用到麥克風卻宣告,審核會問) |
| 記憶體要特別測的 | 鋼琴取樣(5 層 × 30 音) | 整組鼓(視奏 RSL 4–5、聽力 Groove、Trinity Playback 會載入 12 個鼓件) |

## 1. 準備(只做一次)

1. **Apple Developer Program**(年費 US$99):個人或組織帳號都可以;組織要 D-U-N-S 編號,審核比較久。
2. **App Store Connect → 商務(Business)**:
   - 免費 App 只要接受 Apple Developer Program 授權協議;**付費 App 協議、稅務、銀行**只有要收費或內購時才需要(1.0 免費、無內購)。
   - **歐盟數位服務法(DSA)交易者身分**:一定要填(交易者 / 非交易者擇一)。2025-02-17 起沒填的 App 不會出現在歐盟的 App Store。選「交易者」時地址、電話、Email 會公開在商店頁。
3. **Mac + Xcode 26 以上**:2026-04-28 起上傳到 App Store Connect 必須用 Xcode 26 / iOS 26 SDK 建置(舊版 Xcode 建的上傳時就被擋)。Deployment target 可以比較低(Capacitor 8 = iOS 15),不影響舊 iPhone 安裝。
4. **Node.js 22 以上**(`@capacitor/cli` 8 的 `engines` 寫 `node >= 22`)。
5. 註冊 Bundle ID:Xcode 的自動簽章(Automatically manage signing)第一次建置時會自己在 Certificates, Identifiers & Profiles 建好 `<BundleID>`;或者先到開發者網站手動新增(Capabilities 不用勾任何項目)。
6. **App Store Connect → 我的 App → 新增 App**:平台 iOS、名稱(見 `docs/APPSTORE.md`)、**主要語言 English (U.S.)**(介面預設英文)、Bundle ID 選 `<BundleID>`、SKU 自訂(例如 `<App>-ios`)。建好後在「App 資訊」加上**繁體中文**在地化。

## 2. 產生 iOS 專案(第一次)

```bash
git clone https://github.com/<repo>.git     # 要完整的 git 歷史(不要 --depth),build 號用 commit 數(第 6 節)
cd <repo>/app
npm install                 # Capacitor 8(@capacitor/core、ios、cli)
npm run www                 # = node ../tools/build/app-www.mjs:複製網頁到 app/www + 打包取樣(第一次要連網下載取樣)
node ../tools/test/app-www.mjs --no-build    # 檢查 app/www 完整(檔案、importmap、取樣、Google Fonts 已拿掉)
npx cap add ios             # 產生 app/ios(Xcode 專案)
```

`npx cap add ios`(@capacitor/cli 8.5.3)實際產生的東西(2026-10-18 在雲端用同一個 `app/package.json` 試跑確認):
- 預設用 **Swift Package Manager**(`app/ios/App/CapApp-SPM/Package.swift`),不用 CocoaPods;要 CocoaPods 才加 `--packagemanager CocoaPods`(不需要)。
- `Package.swift` 是 `platforms: [.iOS(.v15)]`,Xcode 專案 `IPHONEOS_DEPLOYMENT_TARGET = 15.0`、`TARGETED_DEVICE_FAMILY = "1,2"`(iPhone + iPad)。
  **每次 `cap sync` 之後都檢查一次**:`grep -n platforms ios/App/CapApp-SPM/Package.swift` 要是 `.iOS(.v15)`
  (Capacitor 8 早期版本有回報寫成 `.v14` 的問題)。這個檔案開頭寫「DO NOT MODIFY」:版本不對就升級 `@capacitor/cli`,不要手改。
- 範本的 `AppDelegate.swift` 是 `@UIApplicationMain` + `SceneDelegate.swift`(畫面由 `CAPBridgeViewController` 顯示)。
- `app/ios/.gitignore` **已經排除 `App/App/public`**(`cap sync` 把整個 `app/www` 含取樣複製到那裡,不能進 git),也排除了 `App/App/capacitor.config.json`、`config.xml`。
  repo 根目錄的 `.gitignore` 排除 `app/www/`、`app/node_modules/`。
- 確認後把 `app/ios` commit 進 git:`git add app/ios && git status --short app/ios`(清單裡不能有 `public/`)。

## 3. AppDelegate:AVAudioSession(`.playback` + `.mixWithOthers`)

主持人決定(STAGES.md §8 第 6 點):**`.playback` + `.mixWithOthers`**。
- `.playback`:側邊靜音開關打開也有聲音(練習 App 按播放卻沒聲音,使用者會以為壞了)。
- `.mixWithOthers`:不打斷使用者正在放的音樂(可以邊放歌邊練)。
- **不要**加 `UIBackgroundModes: audio`:切到背景本來就停止播放(`js/main.js` 的 visibilitychange),審核也會問背景播放的理由。

把 `app/ios/App/App/AppDelegate.swift` 的 `didFinishLaunchingWithOptions` 改成下面這樣(其他範本內容不動,記得加 `import AVFoundation`):

```swift
import UIKit
import AVFoundation
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        configureAudioSession()
        let center = NotificationCenter.default, session = AVAudioSession.sharedInstance()
        center.addObserver(self, selector: #selector(audioInterrupted(_:)), name: AVAudioSession.interruptionNotification, object: session)
        center.addObserver(self, selector: #selector(mediaServicesReset(_:)), name: AVAudioSession.mediaServicesWereResetNotification, object: session)
        return true
    }

    /// 靜音開關打開也出聲(.playback)、不打斷別的 App 正在放的音樂(.mixWithOthers)
    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
        } catch {
            print("AVAudioSession 設定失敗:\(error)")
        }
    }

    /// 來電、Siri、鬧鐘打斷:開始時系統已經停掉聲音(網頁的 AudioContext 變成 interrupted,
    /// js/main.js 的 audio.onInterrupt 會停止播放、按鈕回到「播放」);結束時重新啟用 session。
    /// 不自動續播:使用者下一次點畫面時 js/shared/audio.js 的 unlockAudio() 會 resume AudioContext。
    @objc private func audioInterrupted(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        if type == .ended {
            try? AVAudioSession.sharedInstance().setActive(true)
        }
    }

    /// 系統音訊服務重啟(很少見)後,類別會被清掉,要重設一次
    @objc private func mediaServicesReset(_ note: Notification) {
        configureAudioSession()
    }

    // …範本原本的 applicationWillResignActive、applicationDidEnterBackground、
    //    configurationForConnecting(回傳 SceneDelegate)等方法保持不動…
}
```

**要在實機確認的一點(還沒解決)**:網頁端 `js/shared/audio.js` 在 Safari 17+ / iOS 17+ 會設 `navigator.audioSession.type = "playback"`(Audio Session API)。
依 W3C 規格,`playback` 是「不跟其他音訊混音」的類型,WebKit 把它對應到 `AVAudioSessionCategoryPlayback`(沒有 mixWithOthers),
所以網頁一開始出聲時,**有可能把 AppDelegate 設的 `.mixWithOthers` 蓋掉、讓背景音樂停下來**。實機清單第 2 項就是測這個:
- 音樂不會停 → 不用改。
- 音樂會停 → App 版不要設 `navigator.audioSession.type`(只靠原生的 AVAudioSession),網頁版照舊。這要改 `js/shared/audio.js`(兩個 App 的共用檔案,要兩邊同步),先回報再改。
- iOS 15、16 沒有 `navigator.audioSession`,只有原生設定有效;靜音開關要在這兩版的實機上也測一次。

## 4. Info.plist 與在地化

`app/ios/App/App/Info.plist` 範本已經有:`CFBundleDevelopmentRegion = en`、`CFBundleDisplayName = <App>`、版本號用 `$(MARKETING_VERSION)` / `$(CURRENT_PROJECT_VERSION)`、
iPhone 支援直式 + 左右橫式、iPad 四個方向。**方向照範本,不要改**:iPadOS 26 起 `UIRequiresFullScreen` 已經棄用、之後會被忽略,
iPad 要支援分割畫面與視窗縮放(網頁版面本來就跟著寬度變,`layout.mjs` 測 280–1920 寬)。範本的 `UIRequiredDeviceCapabilities = armv7` 先保持不動(Capacitor 官方範本),上傳時若有警告再改成 `arm64`。

要加的 key(在 Xcode 用 Open As ▸ Source Code 貼進 `<dict>` 裡):

```xml
<!-- 只用系統的 HTTPS,沒有自己的加密 → 送審時不用填出口合規問卷 -->
<key>ITSAppUsesNonExemptEncryption</key>
<false/>
<!-- App 支援的語言(App Store 與系統設定顯示用;介面本身由網頁的語言按鈕切換) -->
<key>CFBundleLocalizations</key>
<array>
  <string>en</string>
  <string>zh-Hant</string>
</array>
```

**麥克風**(第 0 節的表):PianoDrill 現在就要加;DrumDrill **S15 加入麥克風時才需要**,現在不要加。

```xml
<key>NSMicrophoneUsageDescription</key>
<string>Listens to when you play each note to score your rhythm. Audio is analysed on the device only — never recorded or uploaded.</string>
```

**InfoPlist.strings**(權限說明、App 名稱的中英文):
1. Project ▸ App ▸ Info ▸ Localizations:按 + 加入 **Chinese, Traditional (zh-Hant)**。
2. File ▸ New ▸ File from Template ▸ **Strings File**,命名 `InfoPlist.strings`,放在 `App/App/`、Target 勾 App;右邊 File inspector 按 **Localize…**,勾 English 與 Chinese, Traditional。
   (Xcode 15 以上也可以用 String Catalog `InfoPlist.xcstrings`,內容一樣。)
3. 內容(`en.lproj/InfoPlist.strings` / `zh-Hant.lproj/InfoPlist.strings`):

```text
/* en.lproj/InfoPlist.strings */
"CFBundleDisplayName" = "<App>";
"NSMicrophoneUsageDescription" = "Listens to when you play each note to score your rhythm. Audio is analysed on the device only — never recorded or uploaded.";

/* zh-Hant.lproj/InfoPlist.strings */
"CFBundleDisplayName" = "<App>";
"NSMicrophoneUsageDescription" = "用麥克風聽你彈(打)的起音時間來評分節奏;聲音只在裝置上分析,不錄音、不上傳。";
```

- 麥克風那一行只有 Info.plist 有 `NSMicrophoneUsageDescription` 時才放(DrumDrill 在 S15 之前兩個檔案都只放 `CFBundleDisplayName`)。
- 中文字串照各 App 改:PianoDrill「聽你彈的」、DrumDrill「聽你打的每一下」。

## 5. PrivacyInfo.xcprivacy(隱私清單)

File ▸ New ▸ File from Template ▸ **App Privacy**,命名 `PrivacyInfo.xcprivacy`、放在 `App/App/`、Target 勾 App,用 Open As ▸ Source Code 換成:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- 不追蹤、沒有追蹤網域 -->
  <key>NSPrivacyTracking</key>
  <false/>
  <key>NSPrivacyTrackingDomains</key>
  <array/>
  <!-- 不收集任何資料(練習紀錄只存在裝置的 WebView 本機儲存空間,不傳出去) -->
  <key>NSPrivacyCollectedDataTypes</key>
  <array/>
  <!-- App 自己的 Swift 程式(AppDelegate)沒有用到需要說明理由的 API(UserDefaults、檔案時間戳、開機時間、磁碟空間…) -->
  <key>NSPrivacyAccessedAPITypes</key>
  <array/>
</dict>
</plist>
```

- Capacitor 8 的 `Capacitor`、`CapacitorCordova` 套件各自帶了 `PrivacyInfo.xcprivacy`(內容也是全部空的,2026-10-18 看 `@capacitor/ios` 8.5.3 確認),不用另外處理。
- 之後加了外掛(例如 `@capacitor/preferences` 會用到 UserDefaults,要加 `NSPrivacyAccessedAPICategoryUserDefaults` + 理由 `CA92.1`)要照外掛的說明補。
- 檢查:Archive 之後在 Organizer 對那個 Archive 按右鍵 ▸ **Generate Privacy Report**,報告裡不應該有任何收集的資料類型。
- App Store Connect 的「App 隱私」填「不收集資料」(Data Not Collected),要跟這份清單一致。

## 6. 版本號

- **版本號來源 = repo 根目錄的 `VERSION`**(例如 `1.0.0`)。`tools/build/app-www.mjs`:
  - 把 `VERSION` 複製進 `app/www`(支援頁 `support.html` 讀它,預填在回報問題的內容裡);
  - 已經有 `app/ios` 時,把 Xcode 專案的 `MARKETING_VERSION` 改成 `VERSION`,`CURRENT_PROJECT_VERSION`(build 號)改成 `git rev-list --count HEAD`(commit 數)。
- Info.plist 的 `CFBundleShortVersionString` / `CFBundleVersion` 範本本來就是 `$(MARKETING_VERSION)` / `$(CURRENT_PROJECT_VERSION)`,不用改。
- 同一個版本號重新上傳時 build 號一定要比上一次大:commit 數只會變多;沒有新 commit 卻要重傳,就先 commit(例如改 `VERSION` 旁邊的說明)或在 Xcode 手動把 build 號 +1。
  **不要用 `--depth` 的淺複製**,commit 數會變小、上傳被拒。
- 出新版:改 `VERSION`(1.0.0 → 1.0.1 修錯、1.1.0 加功能)→ commit → 照第 7 節。

## 7. 每次發佈的流程

```bash
# 1. 網頁本體:版本指紋 + 測試(見 CLAUDE.md 的測試清單)
node tools/build/stamp.mjs
node tools/test/verify.mjs               # 兩個 repo 都在本機時加 PIANODRILL=… / DRUMDRILL=… 一起檢查共用檔案
# 2. 新版本就改 VERSION,commit
# 3. 複製到 App + 同步到 Xcode 專案
cd app
npm run sync                              # = npm run www(app-www:複製網頁、拿掉 Google Fonts、版本號、打包取樣)+ npx cap sync ios
node ../tools/test/app-www.mjs --no-build
grep -n platforms ios/App/CapApp-SPM/Package.swift   # 要是 .iOS(.v15)
npm run open                              # = npx cap open ios
```

在 Xcode:
1. **Signing & Capabilities**:Team 選自己的開發者帳號,Bundle Identifier = `<BundleID>`,勾 Automatically manage signing。
2. **App 圖示**:Assets ▸ AppIcon 用單一尺寸 1024,Appearances 選 Any, Dark, Tinted,放 `icons/icon-1024.png`、`icon-1024-dark.png`、`icon-1024-tinted.png`(見 `docs/APPSTORE.md`)。
3. 第一次:照第 3–5 節改 AppDelegate、Info.plist、InfoPlist.strings、PrivacyInfo.xcprivacy,commit `app/ios`。
4. 上方裝置選 **Any iOS Device (arm64)** ▸ Product ▸ **Archive**。
5. Organizer ▸ **Distribute App** ▸ App Store Connect ▸ Upload(上傳後要等 App Store Connect 處理完,收到通知才能在 TestFlight 選這個 build)。
6. **TestFlight**:內部測試員(自己的 Apple ID)裝起來,照第 8 節的實機清單測 iPhone SE、一般 iPhone、iPad,結果記在 `docs/APPSTORE.md`。
7. **App Store Connect**:照 `docs/APPSTORE.md` 填中英文文案、截圖、審核備註、年齡分級、App 隱私、支援網址 → 選這個 build → **提交審核**。
8. 上架後打 tag:`git tag ios-<VERSION> && git push origin ios-<VERSION>`(之後才知道 App 裡是哪一版的資料;網頁版隨時更新,App 要等下一版)。

## 8. 實機檢查清單

每一項在 **iPhone SE(第 2 或第 3 代,最小記憶體)**、**一般 iPhone**、**iPad** 上用 TestFlight 版測(模擬器測不出靜音開關、藍牙、記憶體上限)。

| # | 項目 | 怎麼測 | 預期 |
|---|---|---|---|
| 1 | 靜音開關 | 側邊開關切到靜音 → 播放示範 | 照樣有聲音 |
| 2 | 邊放音樂邊練(`.mixWithOthers`) | Apple Music / Spotify 放歌 → 切到 App 按播放 → 停止 | 音樂**不會停**,兩個聲音混在一起;App 停止後音樂繼續(第 3 節的「要在實機確認的一點」) |
| 3 | 來電、FaceTime | 播放中用另一支手機打進來 → 拒接 / 接聽後掛斷 | 播放停止、按鈕回到「播放」;回來點一下畫面再按播放有聲音,題目還在 |
| 4 | Siri、鬧鐘 | 播放中叫 Siri / 響鬧鐘 | 同第 3 項 |
| 5 | 鎖螢幕、切到背景 | 播放中按側邊鍵鎖定 / 回主畫面,再回來 | 鎖定或切走就停止(不在背景播放);回來題目與設定都在、可以再播 |
| 6 | AirPods | 連 AirPods 播放;播放中拿下一耳、放回盒子斷線 | 不當機、按鈕狀態正確;斷線後若改從喇叭繼續出聲,記下來(Apple 建議拔耳機時暫停,要不要做之後決定) |
| 7 | 有線耳機 / 轉接頭 | 播放中拔掉 | 同第 6 項 |
| 8 | 藍牙延遲 | AirPods 下跟拍點在觸控鼓墊上打(DrumDrill)/ 跟著彈(PianoDrill) | 記下評分是否整體偏晚(藍牙耳機本來就有延遲,記下偏多少,之後決定要不要做延遲校正) |
| 9 | iPad 分割畫面、Slide Over、iPadOS 26 視窗縮放 | 跟另一個 App 1/3、1/2、2/3 並排;把視窗拉大拉小 | 版面跟著寬度變、沒有橫向捲動、按鈕文字不被切掉、分頁列不蓋住內容 |
| 10 | 旋轉 | iPhone 直式 ↔ 橫式(播放中也轉) | 手機橫式分頁列在左邊、譜面放大;轉回來不跑版 |
| 11 | 第一次打開不連網 | 刪掉 App → 從 TestFlight 重裝 → **開飛航模式**再第一次打開 | 每個分頁都能用、有聲音(取樣內建)、字型是系統字型、沒有破圖或一直轉圈 |
| 12 | 記憶體(Instruments) | Mac 接 iPhone SE ▸ Xcode ▸ Open Developer Tool ▸ Instruments ▸ **Activity Monitor**(看 `com.apple.WebKit.WebContent` 與 App 兩個程序);DrumDrill:視奏 RSL 5 級 → 聽力 Groove → Trinity Playback → 檢定頁等 60 秒(整組鼓釋放)重複 3 輪;PianoDrill:技巧示範 → 視奏 → 聽音各播一次 | 記下最高記憶體;不被系統殺掉(WebContent 被殺時畫面會變白或整頁重新載入);DrumDrill 離開 60 秒後記憶體下降 |
| 13 | 外接鍵盤(iPad) | 空白鍵播放 / 停止、Tab 移動焦點 | 有反應、焦點框看得到 |
| 14 | 深色 / 淺色、動態字級 | 系統切淺色;設定 ▸ 輔助使用 ▸ 較大字體 | 主題按鈕照常;字級變大不破版(VoiceOver、動態字級的完整檢查在 S16 無障礙另做) |
| 15 | 長時間播放 | 循環播放 10 分鐘 | 不爆音、不延遲變大、不發燙到降速 |
| 16 | 頁尾連結 | 點「授權與出處」「隱私權政策」「支援」,再按返回 | 三頁都打得開、返回回到 App;支援頁的「在 GitHub 回報」會開 Safari |

## 9. Android:不做,用 PWA

- 1.0 只上架 iOS;Android 使用者用網頁版加到主畫面(PWA,已經可以離線)。
- 理由:Android 的 Web Audio 輸出延遲比 iOS 大很多,觸控鼓墊 / 麥克風的節奏評分不準;Google Play 的新個人帳號還要先找測試者封閉測試一段時間才能上架;PWA 已經能離線使用。
- 之後要做再評估(Capacitor 8 也能出 Android,`app/` 加 `@capacitor/android` 即可)。

## 10. 常見問題

- **Xcode 說找不到 Capacitor 模組 / 套件解析失敗**:File ▸ Packages ▸ Reset Package Caches,再 Resolve Package Versions(SPM 要連網下載 `capacitor-swift-pm`)。
- **App 打開是白畫面或少檔案**:沒跑 `npm run sync`(`app/ios/App/App/public` 是空的);跑完用 `node ../tools/test/app-www.mjs --no-build` 檢查。
- **上傳被拒「build 號重複」**:第 6 節,commit 後重跑 `npm run sync`,或在 Xcode 手動把 build 號 +1。
- **上傳被拒「SDK 太舊」**:Xcode 要 26 以上。

## 參考來源(2026-10-18 查證)

- Capacitor 8 需要 Xcode 26、Node 22:[Capacitor 環境設定](https://capacitorjs.com/docs/getting-started/environment-setup)、[Capacitor 8 升級指南](https://capacitorjs.com/docs/updating/8-0);`@capacitor/cli` 8.5.3 的 `package.json` `engines.node >= 22.0.0`(實際安裝確認)
- SPM 預設、iOS 15、`.gitignore`、AppDelegate 範本:2026-10-18 以 `@capacitor/cli` 8.5.3 實際執行 `npx cap add ios` 確認;第三方整理:[Capawesome 升級到 Capacitor 8](https://capawesome.io/blog/how-to-upgrade-your-capacitor-app-to-capacitor-8)、[Ionic 論壇:CapApp-SPM 產生 iOS 14 的回報](https://forum.ionicframework.com/t/capapp-spm-package-swift-always-generates-ios-14-instead-of-ios-15-after-capacitor-8-spm-migration/251606)
- 2026-04-28 起上傳要用 Xcode 26 / iOS 26 SDK:[Apple:Upcoming requirements](https://developer.apple.com/news/upcoming-requirements/)
- `ITSAppUsesNonExemptEncryption`:[Apple 文件](https://developer.apple.com/documentation/bundleresources/information-property-list/itsappusesnonexemptencryption)
- 隱私清單:[Capacitor Privacy Manifest](https://capacitorjs.com/docs/ios/privacy-manifest);`@capacitor/ios` 8.5.3 內附的 `PrivacyInfo.xcprivacy`(實際查看)
- iPadOS 26 棄用 `UIRequiresFullScreen`:[Apple TN3192](https://developer.apple.com/documentation/technotes/tn3192-migrating-your-app-from-the-deprecated-uirequiresfullscreen-key)、[Apple 開發者論壇](https://developer.apple.com/forums/thread/793406)
- Web Audio 與靜音開關、Audio Session API:[W3C Audio Session](https://www.w3.org/TR/audio-session/)、[MDN AudioSession.type](https://developer.mozilla.org/docs/Web/API/AudioSession/type)、
  [WebKit Bug 251532](https://bugs.webkit.org/show_bug.cgi?id=251532)、[Apple 論壇:WKWebView 與 AVAudioSession](https://developer.apple.com/forums/thread/71889)(WKWebView 是否照 App 的 AVAudioSession 混音,各版本回報不一 → 實機第 2 項)
- 歐盟 DSA 交易者身分:[TechRepublic](https://www.techrepublic.com/article/eu-app-store-apple-digital-services-act/)、[Median:如何更新交易者身分](https://median.co/blog/how-to-update-apple-trader-status-app-store-connect)
