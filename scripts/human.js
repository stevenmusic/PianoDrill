/**
 * 模擬真人操作(照 FingerDrill 的 tools/test/human.mjs 改寫):觸控(手機/平板)或滑鼠(桌機)
 * 隨機做各種事,每一步之後檢查狀態一致、沒有錯誤。
 *
 *   node scripts/human.js [步數] [種子]
 *
 * 動作:產生新題、換級數、換調性、30 秒準備、播放/停止(含連點)、回到開頭、
 *       中英切換、深淺主題、旋轉螢幕、重新整理、捲動、播放中做別的事
 * 檢查:沒有 console 錯誤;播放按鈕狀態跟實際播放一致;主題按鈕跟畫面一致;
 *       有題目時資訊列和樂譜都在、小節數對得上;沒有錯誤訊息;沒有橫向捲動
 */
import { startServer, launch, openPage } from './layout.js';

const STEPS = Number(process.argv[2] || 150);
const SEED = Number(process.argv[3] || 1);
let seed = SEED;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pickOne = (a) => a[Math.floor(rnd() * a.length)];
let bad = 0;
const fail = (m) => { bad++; console.log(`✗ ${m}`); };

const ready = (page) => page.waitForFunction(() => !document.getElementById('generate').disabled, null, { timeout: 30000 });

async function run(name, vp, server) {
  const browser = await launch();
  const { page, errors, context } = await openPage(browser, server, vp);
  const touch = !!vp.mobile;
  const tap = async (sel) => {
    const el = await page.$(sel);
    if (!el || !(await el.isVisible()) || !(await el.isEnabled())) return false;
    try { if (touch) await el.tap({ timeout: 3000 }); else await el.click({ timeout: 3000 }); return true; } catch { return false; }
  };
  const log = [];
  const ACTIONS = [
    [14, '產生新題', () => tap('#generate')],
    [6, '換級數', async () => { await page.selectOption('#grade', String(1 + Math.floor(rnd() * 8))); return true; }],
    [5, '換調性', async () => { const v = await page.$$eval('#key option', (o) => o.map((x) => x.value)); await page.selectOption('#key', pickOne(v)); return true; }],
    [6, '30 秒準備', () => tap('#prepare')],
    [10, '播放/停止', () => tap('#play')],
    [3, '連點播放', async () => { await tap('#play'); await page.waitForTimeout(60); return tap('#play'); }],
    [3, '連點播放三下', async () => { await tap('#play'); await tap('#play'); return tap('#play'); }],
    [5, '回到開頭', () => tap('#stop')],
    [3, '播放中產生新題', async () => { await tap('#play'); await page.waitForTimeout(300); return tap('#generate'); }],
    [2, '準備中播放', async () => { await tap('#prepare'); await page.waitForTimeout(200); return tap('#play'); }],
    [3, '中英切換', () => tap('#lang-toggle')],
    [3, '深淺主題', () => tap('#theme-toggle')],
    [2, '旋轉螢幕', async () => { if (!touch) return false; const s = page.viewportSize(); await page.setViewportSize({ width: s.height, height: s.width }); return true; }],
    [1, '重新整理', async () => { await page.reload(); await ready(page); return true; }],
    [4, '捲動', async () => { await page.mouse.wheel(0, (rnd() - 0.3) * 1500); return true; }],
  ];
  const total = ACTIONS.reduce((s, a) => s + a[0], 0);
  for (let i = 0; i < STEPS; i++) {
    let r = rnd() * total, act = ACTIONS[0];
    for (const a of ACTIONS) { r -= a[0]; if (r < 0) { act = a; break; } }
    const did = await act[2]();
    log.push(act[1] + (did ? '' : '(略過)'));
    await page.waitForTimeout(80 + rnd() * 400);
    // 等渲染結束再檢查(產生新題時 generate 會暫時停用)
    await ready(page).catch(() => {});
    await page.waitForTimeout(150);
    const st = await page.evaluate(() => {
      const out = [];
      const play = document.getElementById('play');
      const player = window.__playback;
      const active = play.classList.contains('is-active');
      // 播放器 0.4 秒內才會真的開始/結束,所以只抓「按鈕說在播、播放器卻停了很久」這種不一致
      // 30 秒準備前的給音(主和弦)也走同一個播放器,那時播放按鈕本來就不亮
      // 這個環境連不到鋼琴取樣,給音時訊息會被「暫用備援音色」蓋掉,一樣算給音中。
      // 給音結束、倒數開始後,主和弦的尾音還會響一下(播放器仍算在播),也不算不一致
      const givingPitch = /給音|starting pitch|備援音色|fallback sound/.test(document.getElementById('message').textContent)
        || document.getElementById('countdown').classList.contains('running');
      if (player && active !== player.playing && !play.disabled && !givingPitch) out.push(`播放按鈕 ${active ? '亮著' : '沒亮'},播放器 ${player.playing ? '在播' : '沒在播'}`);
      const light = document.documentElement.classList.contains('light');
      if (String(light) !== document.getElementById('theme-toggle').getAttribute('aria-pressed')) out.push('主題按鈕跟畫面不一致');
      const svg = document.querySelector('#score svg');
      const meta = document.getElementById('meta');
      if (svg) {
        if (meta.hidden) out.push('有樂譜但資訊列沒顯示');
        const bars = window.__stage.measure().bars.size;
        const want = Number((meta.textContent.match(/(\d+)\s*(小節|bars)/) || [])[1]);
        if (want && bars !== want) out.push(`樂譜 ${bars} 小節,資訊列寫 ${want}`);
      }
      const msg = document.getElementById('message');
      if (msg.classList.contains('error')) out.push(`錯誤訊息:${msg.textContent}`);
      if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push('橫向捲動');
      return out;
    });
    if (st.length) {
      // 播放狀態可能剛好在切換中:再等一下確認
      await page.waitForTimeout(700);
      const again = await page.evaluate(() => {
        const p = window.__playback, a = document.getElementById('play').classList.contains('is-active');
        const giving = /給音|starting pitch|備援音色|fallback sound/.test(document.getElementById('message').textContent)
          || document.getElementById('countdown').classList.contains('running');
        return p && a !== p.playing && !document.getElementById('play').disabled && !giving;
      });
      const real = st.filter((m) => !m.startsWith('播放按鈕') || again);
      if (real.length) { fail(`${name} 第 ${i + 1} 步(${log.slice(-4).join(' → ')}):${real.join(';')}`); if (bad > 30) break; }
    }
  }
  for (const e of errors) fail(`${name} console:${e}`);
  await context.close();
  await browser.close();
  console.log(`${name}:${STEPS} 步完成`);
}

const { server, url } = await startServer();
for (const [name, vp] of [
  ['iPhone', { width: 390, height: 844, mobile: true }],
  ['SE', { width: 320, height: 568, mobile: true }],
  ['iPad', { width: 820, height: 1180, mobile: true }],
  ['桌機', { width: 1366, height: 820, mobile: false }],
]) await run(name, vp, url);
server.close();
console.log(bad ? `✗ ${bad} 項問題` : '✓ 模擬操作全部通過');
process.exit(bad ? 1 : 0);
