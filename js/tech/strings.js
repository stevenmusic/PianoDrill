/* tech 模組的字串(原本在各自的 i18n.js;合併後用前綴 "tech." 跟其他模組分開) */
import { addStrings } from "../shared/i18n.js";
addStrings("tech", {
  tabScale: ["音階", "Scales"], tabArp: ["琶音", "Arpeggios"], tabHanon: ["哈農", "Hanon"],
  lblSet: ["準備哪一組(Trinity)", "Set (Trinity)"],
  setA: ["A 組", "Set A"], setB: ["B 組", "Set B"],
  lblQuality: ["大調 / 小調", "Major / minor"], qAll: ["全部", "All"], qMajor: ["大調", "Major"], qMinor: ["小調", "Minor"],
  lblMinorForm: ["小調形式(考生自選時)", "Minor form (choice)"],
  formHarmonic: ["和聲小調", "Harmonic minor"], formMelodic: ["旋律小調", "Melodic minor"], formNatural: ["自然小調(大綱允許時)", "Natural minor (where allowed)"],
  lblCats: ["抽考範圍", "Include"], excludeMastered: ["排除「會了」的項目", "Skip Got it items"],
  draw: ["隨機抽考", "Random"], next: ["下一題", "Next"], play: ["播放示範", "Play"], stop: ["停止", "Stop"],
  good: ["會了", "Got it"], weak: ["再練", "Needs work"],
  formHarmonicShort: ["和聲", "Harmonic"], formMelodicShort: ["旋律", "Melodic"], formNaturalShort: ["自然", "Natural"],
  mGood: ["會了", "Got it"], mWeak: ["再練", "Needs work"],   // 熟練度按鈕上的小字(圖示旁)
  scoreTitle: ["樂譜", "Score"], handRH: ["右手", "RH"], handLH: ["左手", "LH"], handBoth: ["雙手", "Both"],
  metroTitle: ["速度", "Tempo"], bpmReset: ["回到考試速度", "Exam tempo"],
  bpmDown: ["慢 1(按住連續減少)", "Slower by 1 (hold to repeat)"], bpmUp: ["快 1(按住連續增加)", "Faster by 1 (hold to repeat)"],
  tempo: ["速度", "Tempo"],
  logTitle: ["練習紀錄", "Practice log"], logStreak: ["連續天數", "Day streak"], logToday: ["今天次數", "Today"], logMin: ["今天分鐘", "Minutes"],
  optLoop: ["循環播放", "Loop"], optRamp: ["每輪加快 4", "+4 each loop"], optClick: ["只聽拍點", "Clicks only"],
  listTitle: ["本級要求", "Grade requirements"],
  legendGood: ["會了", "Got it"], legendWeak: ["再練", "Needs work"],
  names: ["音名", "Names"], namesTip: ["在譜表下面寫音名(C D E…)", "Letter names under each staff"],
});
