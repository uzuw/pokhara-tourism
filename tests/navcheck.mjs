import { chromium } from 'playwright';
const BASE = process.env.BASE_URL || 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  const navInfo = await page.evaluate(() => {
    const nav = document.querySelector('.nav');
    const cs = getComputedStyle(nav);
    const r = nav.getBoundingClientRect();
    return {
      position: cs.position,
      top: cs.top,
      zIndex: cs.zIndex,
      background: cs.backgroundColor,
      backdrop: cs.backdropFilter || cs.webkitBackdropFilter,
      boxShadow: cs.boxShadow.slice(0, 40),
      rectTop: r.top, rectHeight: r.height,
    };
  });
  console.log('NAVBAR @ top:', JSON.stringify(navInfo, null, 2));

  const hamburgerVisible = await page.locator('.hamburger').isVisible();
  const brandVisible = await page.locator('.brand').first().isVisible();
  const navLinksVisible = await page.locator('.nav-links').first().isVisible();
  console.log('hamburger visible:', hamburgerVisible, '| brand visible:', brandVisible, '| desktop nav-links visible (should be false on mobile):', navLinksVisible);

  await page.screenshot({ path: 'tests/shots/navcheck-top.png' });

  // scroll down and re-measure
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(700);
  const afterScroll = await page.evaluate(() => {
    const nav = document.querySelector('.nav');
    const r = nav.getBoundingClientRect();
    return { rectTop: r.top, stillStuck: r.top <= 1 };
  });
  console.log('NAVBAR after scroll 600px:', JSON.stringify(afterScroll));
  await page.screenshot({ path: 'tests/shots/navcheck-scrolled.png' });

  await browser.close();
})();
