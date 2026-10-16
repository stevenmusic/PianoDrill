/**
 * 版面檢查(照 FingerDrill 的 tools/test/layout.mjs 改寫):19 種裝置尺寸 × 每個畫面狀態。
 *
 *   node scripts/layout.js [--shots <dir>]
 *
 * 每種尺寸、每個狀態檢查:
 *  1. 沒有橫向捲動;可見元素沒有超出畫面左右
 *  2. 按鈕/選單文字沒有被截斷、點擊區域至少 28×28
 *  3. 頂欄品牌名和右邊按鈕不重疊
 *  4. 左下角固定的「已紀錄 N 題」捲到底時不蓋住頁尾內容
 *  5. 樂譜不超出樂譜紙張、紙張不超出畫面
 *  6. 沒有 console 錯誤
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });

export const VIEWPORTS = [
  ['fold-280', 280, 653, true], ['se1-320', 320, 568, true], ['se-375', 375, 667, true], ['iphone-390', 390, 844, true],
  ['promax-430', 430, 932, true], ['android-360', 360, 800, true], ['android-412', 412, 915, true],
  ['se-land', 667, 375, true], ['iphone-land', 844, 390, true], ['promax-land', 932, 430, true],
  ['ipad-mini', 744, 1133, true], ['ipad', 820, 1180, true], ['ipad-land', 1180, 820, true], ['ipad-pro', 1024, 1366, true], ['ipad-pro-land', 1366, 1024, true],
  ['laptop', 1280, 800, false], ['desktop', 1440, 900, false], ['fhd', 1920, 1080, false], ['narrow-window', 500, 900, false],
];

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png',
};

export async function startServer() {
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    let path = join(root, normalize(decodeURIComponent(url.pathname)));
    if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
    if (!path.startsWith(root) || !existsSync(path)) return response.writeHead(404).end();
    response.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    createReadStream(path).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, url: `http://localhost:${server.address().port}/` };
}

export async function launch() {
  const bundled = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  return chromium.launch({
    ...(existsSync(bundled) ? { executablePath: bundled } : {}),
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
}

/** 開一頁,收集錯誤;鋼琴取樣和 Google Fonts 在這個環境連不到,直接擋掉(app 會改用合成音色)。 */
export async function openPage(browser, url, { width, height, mobile }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|tonejs|salamander/i.test(m.text())) errors.push(`[console] ${m.text()}`); });
  await page.route(/fonts\.(googleapis|gstatic)\.com|tonejs\.github\.io/, (r) => r.abort());
  await page.goto(url);
  await page.waitForFunction(() => !document.getElementById('generate').disabled, null, { timeout: 30000 });
  return { page, context, errors };
}

export async function generate(page, grade) {
  if (grade) await page.selectOption('#grade', String(grade));
  const before = await page.evaluate(() => document.querySelector('#score svg')?.dataset.gen ?? null);
  await page.click('#generate');
  await page.waitForFunction(() => {
    const m = document.getElementById('message').textContent;
    return document.querySelector('#score svg') && !/渲染中|Rendering/.test(m);
  }, null, { timeout: 30000 });
  await page.waitForTimeout(300);
  return before;
}

async function audit(page) {
  return page.evaluate(async () => {
    const W = window.innerWidth, out = [];
    const vis = (e) => {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || e.closest('[hidden]')) return false;
      const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0;
    };
    const name = (e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.classList.length ? '.' + [...e.classList].join('.') : ''}`;
    if (document.documentElement.scrollWidth > W + 1) out.push(`橫向捲動 ${document.documentElement.scrollWidth} > ${W}`);
    // 可見元素超出畫面。.topbar/.score-frame 刻意用負邊距撐滿畫面,本身算在畫面內;
    // 樂譜 SVG 內部的東西交給下面的「樂譜超出紙張」檢查。
    for (const e of document.querySelectorAll('body *')) {
      if (!vis(e) || e.closest('#score svg')) continue;
      const r = e.getBoundingClientRect();
      if (r.left < -1 || r.right > W + 1) { out.push(`超出畫面:${name(e)} [${Math.round(r.left)},${Math.round(r.right)}]`); if (out.length > 12) break; }
    }
    // 文字被截斷
    for (const e of document.querySelectorAll('button, select, .meta span, .countdown, .history-badge, .badge')) {
      if (!vis(e)) continue;
      if (e.tagName === 'SELECT') {
        // select 的寬度放不下選到的那一項文字 → 被截斷
        const probe = document.createElement('span');
        const s = getComputedStyle(e);
        probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${s.font};letter-spacing:${s.letterSpacing}`;
        probe.textContent = e.options[e.selectedIndex]?.text ?? '';
        document.body.appendChild(probe);
        const need = probe.getBoundingClientRect().width + parseFloat(s.paddingLeft) + 14; // 14:下拉箭頭
        probe.remove();
        if (need > e.clientWidth + 2) out.push(`選單文字被截斷:${probe.textContent}(需要 ${Math.round(need)},只有 ${e.clientWidth})`);
      } else if (e.scrollWidth > e.clientWidth + 2) {
        out.push(`文字被截斷:${e.textContent.trim().slice(0, 30)}(${e.scrollWidth}>${e.clientWidth})`);
      }
    }
    // 點擊區域至少 28×28
    for (const e of document.querySelectorAll('button, select, a')) {
      if (!vis(e)) continue;
      const r = e.getBoundingClientRect();
      if (r.height < 28 || r.width < 28) out.push(`點擊區域太小:${(e.id || e.textContent.trim()).slice(0, 24)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    // 頂欄:品牌名和按鈕不重疊、在同一列
    const h1 = document.querySelector('.topbar h1').getBoundingClientRect();
    const ctl = document.querySelector('.topbar .controls').getBoundingClientRect();
    if (h1.right > ctl.left + 1 && h1.bottom > ctl.top && h1.top < ctl.bottom) out.push(`頂欄重疊:品牌名到 ${Math.round(h1.right)},按鈕從 ${Math.round(ctl.left)}`);
    if (ctl.top > h1.bottom) out.push('頂欄按鈕被擠到第二列');
    const h1el = document.querySelector('.topbar h1');
    if (h1el.scrollWidth > h1el.clientWidth + 1) out.push(`品牌名被截斷(${h1el.scrollWidth}>${h1el.clientWidth})`);
    // 樂譜紙張與樂譜
    const frame = document.getElementById('score-frame');
    const svg = document.querySelector('#score svg');
    if (svg && vis(frame)) {
      const fr = frame.getBoundingClientRect(), sr = svg.getBoundingClientRect();
      if (sr.left < fr.left - 1 || sr.right > fr.right + 1) out.push(`樂譜超出紙張 [${Math.round(sr.left)},${Math.round(sr.right)}] / [${Math.round(fr.left)},${Math.round(fr.right)}]`);
      if (sr.right > W + 1) out.push('樂譜超出畫面');
      // 左上角級數/調性、右上角倒數不能壓到樂譜第一行
      const firstStaff = svg.querySelector('g.staffline');
      if (firstStaff) {
        const st = firstStaff.getBoundingClientRect();
        for (const id of ['grade-controls', 'countdown']) {
          const el = document.getElementById(id);
          if (!vis(el) || !frame.contains(el)) continue;
          const r = el.getBoundingClientRect();
          if (r.bottom > st.top + 1 && r.right > st.left && r.left < st.right) out.push(`${id} 壓到樂譜第一行(${Math.round(r.bottom)} > ${Math.round(st.top)})`);
        }
      }
    }
    // 資訊列(調性丨拍號丨小節丨速度)一定要一行,不然行尾會剩一個「丨」
    const metaSpans = [...document.querySelectorAll('#meta span')].filter(vis);
    if (new Set(metaSpans.map((e) => Math.round(e.getBoundingClientRect().top / 5))).size > 1) out.push('資訊列換成兩行');
    // 角落的級數/調性、倒數不能壓到白色譜紙
    const paper = document.getElementById('stage');
    if (vis(paper)) {
      const pr = paper.getBoundingClientRect();
      for (const id of ['grade-controls', 'countdown']) {
        const el = document.getElementById(id);
        if (!vis(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.bottom > pr.top + 1 && r.top < pr.bottom && r.right > pr.left && r.left < pr.right) out.push(`${id} 壓到譜紙(${Math.round(r.bottom)} > ${Math.round(pr.top)})`);
      }
    }
    // 控制項彼此重疊(級數、調性、倒數)
    const boxes = ['grade', 'key', 'countdown'].map((id) => document.getElementById(id)).filter(vis).map((e) => [e.id, e.getBoundingClientRect()]);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const [a, ra] = boxes[i], [b, rb] = boxes[j];
      if (ra.left < rb.right - 1 && rb.left < ra.right - 1 && ra.top < rb.bottom - 1 && rb.top < ra.bottom - 1) out.push(`${a} 和 ${b} 重疊`);
    }
    // 捲到底:左下角固定的紀錄徽章不能蓋住頁尾/訊息的文字
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((r) => setTimeout(r, 120));
    const badge = document.getElementById('history-info');
    if (vis(badge)) {
      const br = badge.getBoundingClientRect();
      for (const e of document.querySelectorAll('footer *, #message, #checklist li')) {
        if (!vis(e) || e.children.length) continue;
        const r = e.getBoundingClientRect();
        if (r.left < br.right - 1 && br.left < r.right - 1 && r.top < br.bottom - 1 && br.top < r.bottom - 1) {
          out.push(`左下紀錄徽章蓋住 ${name(e)}「${e.textContent.trim().slice(0, 16)}」`);
        }
      }
    }
    window.scrollTo(0, 0);
    return out;
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { server, url } = await startServer();
  const browser = await launch();
  const issues = [];
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
  for (const [name, width, height, mobile] of VIEWPORTS) {
    if (only && !only.includes(name)) continue;
    const { page, context, errors } = await openPage(browser, url, { width, height, mobile });
    const report = (state, list) => { for (const m of new Set(list)) issues.push(`${name} ${state}:${m}`); };
    const shot = (st) => shots && page.screenshot({ path: `${shots}/layout-${name}-${st}.png`, fullPage: true });

    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('sm_lang', 'zh'); });
    await page.reload();
    await page.waitForFunction(() => !document.getElementById('generate').disabled, null, { timeout: 30000 });
    report('剛打開', await audit(page)); await shot('open');

    await generate(page, 1);
    report('一級', await audit(page)); await shot('g1');

    await generate(page, 8);
    report('八級', await audit(page)); await shot('g8');

    // 最長的調性名稱
    const longest = await page.$$eval('#key option', (o) => o.reduce((a, b) => (b.text.length > a.text.length ? b : a)).value);
    await page.selectOption('#key', longest);
    await generate(page);
    report('八級 選定調性', await audit(page));

    await page.click('#prepare');
    await page.waitForFunction(() => document.getElementById('countdown').classList.contains('running'), null, { timeout: 15000 }).catch(() => {});
    report('30 秒準備', await audit(page)); await shot('prepare');
    await page.click('#stop').catch(() => {});

    await page.click('#theme-toggle');
    await page.waitForTimeout(200);
    report('淺色主題', await audit(page)); await shot('light');

    await page.click('#lang-toggle');
    await page.waitForTimeout(300);
    await generate(page, 5);
    report('英文 五級', await audit(page)); await shot('en');

    for (const e of errors) issues.push(`${name} console:${e}`);
    await context.close();
    console.log(`${name.padEnd(14)} ${width}×${height} 完成`);
  }
  await browser.close();
  server.close();
  console.log(issues.slice(0, 150).join('\n'));
  console.log(issues.length ? `✗ ${issues.length} 項問題` : `✓ ${VIEWPORTS.length} 種尺寸全部通過`);
  process.exit(issues.length ? 1 : 0);
}
