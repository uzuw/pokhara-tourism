import { chromium } from 'playwright';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
(async () => {
  const browser = await chromium.launch();
  // desktop
  const d = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await d.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await d.evaluate(() => document.fonts.ready);
  await d.waitForTimeout(800);
  await d.screenshot({ path: 'tests/shots/nav-solid-desktop.png' });
  // mobile
  const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await m.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await m.waitForTimeout(1000);
  await m.screenshot({ path: 'tests/shots/nav-solid-mobile.png' });
  await m.locator('.hamburger').click();
  await m.waitForTimeout(800);
  await m.screenshot({ path: 'tests/shots/nav-solid-mobile-drawer.png' });
  await browser.close();
  console.log('saved');
})();
