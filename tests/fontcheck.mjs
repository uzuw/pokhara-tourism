import { chromium } from 'playwright';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);

  const info = await page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { fontFamily: cs.fontFamily, fontWeight: cs.fontWeight };
    };
    const loaded = [...document.fonts].map(f => f.family + ' ' + f.weight + ' ' + (f.status));
    return {
      brand: pick('.brand'),
      h1: pick('.hero h1'),
      navlinks: pick('.nav-links a'),
      body: pick('body'),
      loadedFonts: loaded,
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
