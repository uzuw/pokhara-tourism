// Playwright responsiveness check for the Pokhara Tú site.
// Usage: node tests/responsive.mjs  (Next dev must be running on :3000)
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SHOT_DIR = 'tests/shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'mobile', width: 390, height: 844 },
];

const pages = [
  { name: 'home', path: '/' },
  { name: 'destinations', path: '/destinations' },
  { name: 'map', path: '/map' },
  { name: 'detail', path: '/destination/phewa-lake' },
];

let failures = 0;

function overflowX(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

(async () => {
  const browser = await chromium.launch();
  for (const vp of viewports) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') console.log(`  [console.error ${vp.name}] ${m.text()}`); });
    for (const p of pages) {
      const url = BASE + p.path;
      const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch((e) => { console.log(`  goto failed ${url}: ${e.message}`); failures++; return null; });
      if (!res) continue;
      // map page paints OSM tiles client-side; give them time to load
      await page.waitForTimeout(p.name === 'map' ? 4000 : 800);
      const ox = await overflowX(page);
      const status = res.status();
      const flag = ox > 1 ? ' ❌ H-OVERFLOW' : ' ✅';
      if (ox > 1) failures++;
      console.log(`[${vp.name.padEnd(7)}] ${p.name.padEnd(12)} ${status}  overflowX=${ox}px${flag}`);
      await page.screenshot({ path: `${SHOT_DIR}/${vp.name}-${p.name}.png`, fullPage: false });
    }

    // mobile nav behaviour: open hamburger, expect links visible
    if (vp.name === 'mobile') {
      await page.goto(BASE + '/', { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      const burger = page.locator('.hamburger');
      const visible = await burger.isVisible();
      await burger.click();
      await page.waitForTimeout(300);
      const linksVisible = await page.locator('.nav-links.open').isVisible();
      console.log(`[mobile] hamburger visible=${visible}  menu opens=${linksVisible} ${linksVisible ? '✅' : '❌'}`);
      if (!linksVisible) failures++;
      await page.screenshot({ path: `${SHOT_DIR}/mobile-menu-open.png` });
    }
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${failures === 0 ? '✅ ALL RESPONSIVE CHECKS PASSED' : `❌ ${failures} issue(s) found`}`);
  process.exit(failures === 0 ? 0 : 1);
})();
