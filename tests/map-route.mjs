import { chromium } from 'playwright';
const BASE = process.env.BASE_URL || 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['geolocation'], geolocation: { latitude: 28.2096, longitude: 83.9685 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));

  await page.goto(BASE + '/map', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3500);

  // draw a route between two real destinations
  await page.selectOption('select:has(option[value=""]) >> nth=0', { label: 'Phewa Lake' }).catch(() => {});
  // pick From = Phewa Lake, To = Sarangkot
  const from = page.locator('select').nth(0);
  const to = page.locator('select').nth(1);
  await from.selectOption({ label: 'Phewa Lake' });
  await to.selectOption({ label: 'Sarangkot' });
  await page.getByText('Draw route', { exact: true }).click();
  await page.waitForTimeout(6000); // OSRM route request

  const routeInfo = await page.locator('.route-info').textContent().catch(() => null);
  console.log('route-info text:', routeInfo ? routeInfo.replace(/\s+/g, ' ').trim() : '(none)');

  // test geolocation button
  await page.getByText('Use my location').click();
  await page.waitForTimeout(2500);
  const locReady = await page.locator('text=Location ready').count();
  console.log('geolocation "ready" shown:', locReady > 0);

  await page.screenshot({ path: 'tests/shots/map-route-desktop.png', fullPage: false });
  console.log('console/page errors:', errors.length ? errors.slice(0, 8).join(' || ') : 'none');
  await browser.close();
})();
