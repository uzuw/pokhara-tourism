import { chromium } from 'playwright';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const shots = [
  ['/', 'nav-resp-home.png', { width: 390, height: 844 }],
  ['/destinations', 'nav-resp-dest.png', { width: 390, height: 844 }],
  ['/map', 'nav-resp-map.png', { width: 390, height: 844 }],
  ['/', 'nav-resp-short.png', { width: 360, height: 740 }],
];
(async () => {
  const browser = await chromium.launch();
  for (const [path, file, vp] of shots) {
    const page = await (await browser.newContext({ viewport: vp, isMobile: true, hasTouch: true })).newPage();
    await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'tests/shots/' + file });
    await page.close();
  }
  await browser.close();
  console.log('saved');
})();
