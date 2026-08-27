import { chromium } from 'playwright';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 820 } })).newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'tests/shots/redesign-home2.png' });
  // also capture signed-out mobile drawer for completeness
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'tests/shots/redesign-home-mobile.png' });
  await browser.close();
  console.log('shots saved');
})();
