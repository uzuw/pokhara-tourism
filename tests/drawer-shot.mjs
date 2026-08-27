import { chromium } from 'playwright';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1200);
  // open drawer
  await page.locator('.hamburger').click();
  await page.waitForTimeout(900);
  const box = await page.locator('.nav-drawer').boundingBox();
  console.log('drawer box:', JSON.stringify(box));
  await page.screenshot({ path: 'tests/shots/nav-drawer-verify.png' });
  await browser.close();
  console.log('saved');
})();
