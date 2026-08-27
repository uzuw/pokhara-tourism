import { chromium } from 'playwright';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/map', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'tests/shots/mobile-map-fullpage.png', fullPage: true });
  // scroll to the map element and shoot just that region
  const map = page.locator('#fullMap');
  await map.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'tests/shots/mobile-map-scrolled.png' });
  console.log('done');
  await browser.close();
})();
