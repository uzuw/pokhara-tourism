import { chromium } from 'playwright';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
let fail = 0;
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++; };
(async () => {
  const browser = await chromium.launch();
  // hero must fit the viewport on small phones (no below-fold cutoff)
  for (const [w, h] of [[390, 844], [360, 740]]) {
    const page = await (await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true })).newPage();
    await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1400);
    const m = await page.evaluate(() => {
      const s = document.querySelector('.hero-stats').getBoundingClientRect();
      return { statsBottom: Math.round(s.bottom), vh: window.innerHeight };
    });
    ok(m.statsBottom <= m.vh, `home hero stats fit @ ${w}x${h} (bottom ${m.statsBottom} <= ${m.vh})`);
    await page.close();
  }
  // no horizontal overflow on key pages (map tile overhang is inside overflow:hidden, ignored)
  for (const path of ['/', '/destinations', '/login']) {
    const page = await (await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true })).newPage();
    await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1200);
    const x = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(x <= 1, `no horizontal overflow @ /${path} (${x}px)`);
    await page.close();
  }
  console.log(fail === 0 ? '\n✅ RESPONSIVE PASS' : `\n❌ ${fail} issue(s)`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
