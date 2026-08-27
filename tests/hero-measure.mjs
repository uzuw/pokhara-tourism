import { chromium } from 'playwright';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1200);
  const m = await page.evaluate(() => {
    const hero = document.querySelector('.hero');
    const content = document.querySelector('.hero-content');
    const stats = document.querySelector('.hero-stats');
    const r = (el) => { const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), height: Math.round(b.height) }; };
    return {
      vh: window.innerHeight,
      nav: r(document.querySelector('.nav')),
      hero: r(hero),
      content: r(content),
      stats: r(stats),
      heroMinH: getComputedStyle(hero).minHeight,
      contentOverflow: content.scrollHeight > content.clientHeight,
      docOverflowX: document.documentElement.scrollWidth > window.innerWidth ? (document.documentElement.scrollWidth + '>' + window.innerWidth) : 'none',
    };
  });
  console.log(JSON.stringify(m, null, 2));
  await page.screenshot({ path: 'tests/shots/hero-measure.png', fullPage: false });
  // also check shorter phone
  await page.setViewportSize({ width: 360, height: 740 });
  await page.waitForTimeout(500);
  const m2 = await page.evaluate(() => {
    const stats = document.querySelector('.hero-stats');
    const b = stats.getBoundingClientRect();
    return { vh: window.innerHeight, statsBottom: Math.round(b.bottom), statsCut: b.bottom > window.innerHeight };
  });
  console.log('SHORT PHONE:', JSON.stringify(m2));
  await browser.close();
})();
