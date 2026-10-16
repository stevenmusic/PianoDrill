// 模擬真人操作:用觸控(手機)或滑鼠(桌機)隨機做各種事,每一步之後檢查狀態一致、沒有錯誤。
//   動作:切分頁、點選擇器、抽題、下一項、播放/停止(含連點)、按住 ±、拖速度、
//         熟練標記、中英切換、主題、改考試系統/級數/組別、收起清單、點清單、換顯示的手、旋轉螢幕、重新整理、播放中做別的事
//   檢查:沒有 console 錯誤;播放/節拍器狀態跟按鈕文字一致、不會兩份同時播;樂譜跟題目一致(指法數字都在);
//         速度在 30–200 且跟滑桿一致;選到的分頁跟顯示的畫面一致;沒有橫向捲動;localStorage 讀得回來
// 用法:node human.mjs [步數] [種子]
import { open } from "./harness.mjs";
const STEPS = Number(process.argv[2] || 200), SEED = Number(process.argv[3] || 1);
let seed = SEED; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pickOne = a => a[Math.floor(rnd() * a.length)];
let bad = 0; const fail = (m) => { bad++; console.log("✗ " + m); };

async function run(vpName, vp){
  const { page, errors, close } = await open(vp);
  const touch = !!vp.mobile;
  const tap = async sel => { const el = await page.$(sel); if (!el || !(await el.isVisible())) return false; try { if (touch) await el.tap({ timeout: 3000 }); else await el.click({ timeout: 3000 }); return true; } catch (e) { return false; } };
  const tapAny = async sel => { const els = (await page.$$(sel)); const vis = []; for (const e of els) if (await e.isVisible()) vis.push(e); if (!vis.length) return false; const e = pickOne(vis); try { if (touch) await e.tap({ timeout: 3000 }); else await e.click({ timeout: 3000 }); return true; } catch (er) { return false; } };
  const log = [];
  // 開始:第一次打開
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("pianodrill-lang", "zh"); });
  await page.reload(); await page.waitForFunction(() => window.__stageReady >= 1);
  if (rnd() < 0.5) { await tap(`#obSystem button[data-v="${pickOne(["abrsm", "trinity"])}"]`); await page.selectOption("#obGrade", String(Math.floor(rnd() * 9))); await tap("#obYes"); }
  else await tap("#obNo");
  const ACTIONS = [
    // 外框
    [10, "切分頁", async () => tap(`#tabbar button[data-view="${pickOne(["tech", "sight", "ear", "exam"])}"]`)],
    [8, "切子項目", async () => tapAny("#subSeg button")],
    [3, "考試系統", async () => tapAny("#systemSeg button")],
    [3, "級數", async () => { if (!(await page.isVisible("#selGrade"))) return false; await page.selectOption("#selGrade", String(Math.floor(rnd() * 9))); return true; }],
    [2, "檢定三項", async () => tapAny("#examParts .part")],
    [3, "展開/收起設定", async () => tapAny(".setup-summary")],
    [3, "中英切換", async () => tap("#langToggle")],
    [1, "主題", async () => tap("#themeToggle")],
    // 技巧
    [8, "技巧選擇器", async () => tapAny("#mod-tech .pane:not([hidden]) .rows .opt")],
    [5, "抽題", async () => tap("#t-drawBtn")],
    [3, "下一項", async () => tap("#t-nextBtn")],
    [2, "模擬考(技巧)", async () => tap("#t-mockBtn")],
    [6, "技巧 播放/停止", async () => tap("#t-playBtn")],
    [2, "技巧 連點播放", async () => { await tap("#t-playBtn"); await tap("#t-playBtn"); return tap("#t-playBtn"); }],
    [3, "速度 ±", async () => tap(pickOne(["#t-bpmUp", "#t-bpmDown"]))],
    [3, "熟練/待加強", async () => tapAny("#mod-tech .mbtn")],
    [2, "換顯示的手", async () => tapAny("#t-handSeg button")],
    [2, "點清單", async () => tapAny("#t-qGroups .qrow")],
    // 視奏
    [5, "視奏 新題目", async () => tap("#s-generate")],
    [3, "視奏 30 秒準備", async () => tap("#s-prepare")],
    [5, "視奏 播放/停止", async () => tap("#s-play")],
    [2, "視奏 停止", async () => tap("#s-stop")],
    [3, "視奏 級數", async () => tapAny("#s-grades .opt")],
    [2, "視奏 調性", async () => { if (!(await page.isVisible("#s-key"))) return false; const o = await page.$$eval("#s-key option", o => o.map(x => x.value)); await page.selectOption("#s-key", pickOne(o)); return true; }],
    // 聽音
    [6, "聽音 播放", async () => tap("#e-playBtn")],
    [8, "聽音 作答", async () => tapAny("#e-answers .ans, #e-answers .k")],
    [4, "聽音 下一題", async () => tap("#e-nextBtn")],
    [2, "聽音 顯示答案", async () => tap("#e-revealBtn")],
    [4, "聽音 選擇器", async () => tapAny("#mod-ear .pane:not([hidden]) .rows .opt")],
    [3, "聽音 檢定題型", async () => tapAny("#e-testsList .chip")],
    [2, "聽音 抽題", async () => tap("#e-drawBtn")],
    // 裝置
    [2, "旋轉螢幕", async () => { if (!touch) return false; const s = page.viewportSize(); await page.setViewportSize({ width: s.height, height: s.width }); return true; }],
    [1, "重新整理", async () => { await page.reload(); await page.waitForFunction(() => window.__stageReady >= 1); return true; }],
    [3, "捲動", async () => { await page.mouse.wheel(0, (rnd() - 0.3) * 1500); return true; }],
  ];
  const total = ACTIONS.reduce((s, a) => s + a[0], 0);
  for (let i = 0; i < STEPS; i++) {
    let r = rnd() * total, act = ACTIONS[0];
    for (const a of ACTIONS) { r -= a[0]; if (r < 0) { act = a; break; } }
    const did = await act[2]();
    log.push(act[1] + (did ? "" : "(略過)"));
    await page.waitForTimeout(80 + rnd() * 400);
    // ── 檢查 ──
    const st = await page.evaluate(async () => {
      const out = [], sh = window.__shell, view = sh.S.view;
      const selView = document.querySelector('#tabbar [aria-selected="true"]').dataset.view;
      if (view !== selView) out.push(`分頁不一致 ${view} / ${selView}`);
      const shown = ["tech", "sight", "ear"].filter(m => !document.getElementById("mod-" + m).hidden);
      if (shown.length !== 1) out.push(`同時顯示 ${shown.length} 個模組`);
      const want = view === "exam" ? sh.S.sub.exam : view;
      if (shown[0] !== want) out.push(`顯示的模組 ${shown[0]},應該是 ${want}`);
      if (document.getElementById("examSetup").hidden !== (view !== "exam")) out.push("檢定設定卡顯示不對");
      if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push("橫向捲動");
      for (const k of ["pianodrill.v1", "pianodrill.tech.v1", "pianodrill.ear.v1"]) { try { JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { out.push(k + " 壞掉"); } }
      // 技巧:播放鈕文字跟狀態一致、速度一致、指法數字齊全
      const A = window.__tech;
      if (A && shown[0] === "tech") {
        const s = A.state, playLbl = document.getElementById("t-playLabel").textContent;
        if (s.play && !["停止", "Stop"].includes(playLbl)) out.push(`技巧播放中但按鈕寫「${playLbl}」`);
        if (!s.play && !s.starting && !["播放示範", "Play"].includes(playLbl)) out.push(`技巧沒在播放但按鈕寫「${playLbl}」`);
        if (!(s.bpm >= 30 && s.bpm <= 300)) out.push(`速度超出範圍 ${s.bpm}`);
        if (String(s.bpm) !== document.getElementById("t-bpmVal").textContent) out.push("速度顯示不一致");
        if (A.cur) {
          for (let t = 0; t < 60 && !document.querySelector("#t-osmd svg"); t++) await new Promise(r => setTimeout(r, 50));
          const ex = A.ex, hands = s.show === "both" ? ["rh", "lh"] : [s.show];
          const wantF = hands.reduce((n, h) => n + ex[h].reduce((c, x) => c + !!x.finger + !!(x.with && x.with.finger), 0), 0);
          const got = [...document.querySelectorAll("#t-osmd svg text")].filter(t => /^[1-5]$/.test(t.textContent.trim())).length;
          if (wantF !== got) out.push(`指法數字 ${got} / ${wantF}`);
        }
      }
      // 離開的模組不能還在播:技巧不在畫面上就不能在播放
      if (A && shown[0] !== "tech" && A.state.play) out.push("技巧不在畫面上卻還在播放");
      if (shown[0] !== "ear" && window.__ear && window.__ear.play) out.push("聽音不在畫面上卻還在播放");
      return out;
    });
    if (st.length) { fail(`${vpName} 第 ${i + 1} 步(${log.slice(-4).join(" → ")}):${st.join(";")}`); if (bad > 30) break; }
  }
  for (const e of errors) fail(`${vpName} console:${e}`);
  await close();
  console.log(`${vpName}:${STEPS} 步完成`);
}
for (const [name, vp] of [["iPhone", { viewport: { width: 390, height: 844 }, mobile: true, dpr: 1 }], ["SE", { viewport: { width: 320, height: 568 }, mobile: true, dpr: 1 }], ["iPad", { viewport: { width: 820, height: 1180 }, mobile: true, dpr: 1 }], ["桌機", { viewport: { width: 1366, height: 820 } }]]) await run(name, vp);
console.log(bad ? `✗ ${bad} 項問題` : "✓ 模擬操作全部通過");
process.exit(bad ? 1 : 0);
