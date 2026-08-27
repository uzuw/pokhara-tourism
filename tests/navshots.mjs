import { chromium } from 'playwright';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tests/shots/nav-fixed-top.png' });
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'tests/shots/nav-fixed-scrolled.png' });
  // open drawer
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.locator('.hamburger').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'tests/shots/nav-drawer-open2.png' });
  await browser.close();
  console.log('done');
})();
