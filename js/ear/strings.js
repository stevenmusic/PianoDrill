/* ear 模組的字串(原本在各自的 i18n.js;合併後用前綴 "ear." 跟其他模組分開) */
import { addStrings } from "../shared/i18n.js";
addStrings("ear", {
  tabNote: ["單音", "Notes"], tabInterval: ["音程", "Intervals"], tabChord: ["和弦", "Chords"],
  play: ["播放題目", "Play"], replay: ["再聽一次", "Replay"], stop: ["停止", "Stop"],
  next: ["下一題", "Next"], draw: ["隨機抽一題", "Random"], showAnswer: ["顯示答案", "Show answer"], clearKeys: ["重彈", "Clear"],
  tapBtn: ["拍", "Tap"], tapDone: ["完成", "Done"],
  optAuto: ["答對自動下一題", "Auto next"], mock: ["模擬考", "Mock exam"], optAdaptive: ["加強弱項", "Focus weak"],
  statsTitle: ["各項正確率", "Accuracy"], statsReset: ["重設", "Reset"],
  logTitle: ["練習紀錄", "Practice log"], logStreak: ["連續天數", "Day streak"], logToday: ["今天題數", "Today"], logAcc: ["今天正確率", "Today %"],
  examTestsTitle: ["本級聽力測驗", "Aural tests"],
});
