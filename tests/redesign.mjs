import { chromium } from 'playwright';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
let failures = 0;
const log = (ok, msg) => { console.log(`${ok ? '✅' : '❌'} ${msg}`); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));

  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  const brand = await page.locator('.brand').first().innerText();
  log(/Hamro/i.test(brand), `brand shows "Hamro Pokhara" (got: ${brand.replace(/\n/g,' ')})`);
  const particles = await page.locator('canvas.particles-canvas').count();
  log(particles > 0, 'particles canvas present');
  const flags = await page.locator('svg.prayer-flags').count();
  log(flags > 0, 'prayer flags SVG present on home');

  await page.screenshot({ path: 'tests/shots/redesign-home.png' });

  // --- map page: layer switcher ---
  await page.goto(BASE + '/map', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3500);
  const segBtns = await page.locator('.layer-seg button').count();
  log(segBtns === 3, `map layer switcher has 3 options (got ${segBtns})`);

  // click Satellite and confirm a new (esri) tile layer is requested/rendered
  await page.locator('.layer-seg button', { hasText: 'Satellite' }).click();
  await page.waitForTimeout(3000);
  const satActive = await page.locator('.layer-seg button.active', { hasText: 'Satellite' }).count();
  log(satActive > 0, 'Satellite layer becomes active');
  await page.screenshot({ path: 'tests/shots/redesign-map-satellite.png' });

  // back to Street
  await page.locator('.layer-seg button', { hasText: 'Street' }).click();
  await page.waitForTimeout(1500);
  const streetActive = await page.locator('.layer-seg button.active', { hasText: 'Street' }).count();
  log(streetActive > 0, 'Street layer switches back');
  await page.screenshot({ path: 'tests/shots/redesign-map-street.png' });

  // --- detail page: layer switcher too ---
  await page.goto(BASE + '/destination/phewa-lake', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  const detailSeg = await page.locator('.layer-seg button').count();
  log(detailSeg === 3, `detail page layer switcher present (got ${detailSeg})`);
  await page.screenshot({ path: 'tests/shots/redesign-detail.png' });

  console.log('\nconsole/page errors:', errors.length ? errors.slice(0, 8).join(' || ') : 'none');
  if (errors.length) failures++;
  console.log(`\n${failures === 0 ? '✅ REDESIGN CHECKS PASSED' : `❌ ${failures} issue(s)`}`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
