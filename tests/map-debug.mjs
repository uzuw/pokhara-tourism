import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', (r) => errors.push('REQFAIL ' + r.url().slice(0, 70) + ' :: ' + (r.failure()?.errorText || '')));

  await page.goto(BASE + '/map', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000); // give OSM tiles time to paint

  const tileStatus = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('#fullMap img'));
    const loaded = imgs.filter((i) => i.complete && i.naturalWidth > 0).length;
    return { total: imgs.length, loaded };
  });
  await page.screenshot({ path: 'tests/shots/mobile-map-long.png' });
  console.log('map tile <img> count:', tileStatus.total, 'loaded:', tileStatus.loaded);
  console.log('console/network errors:');
  errors.slice(0, 12).forEach((e) => console.log('  -', e));
  await browser.close();
})();
