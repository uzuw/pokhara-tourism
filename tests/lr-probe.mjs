import { chromium } from 'playwright';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.goto(BASE + '/map', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  const info = await page.evaluate(() => {
    const L = window.L;
    if (!L || !L.Routing) return { hasL: !!L, hasRouting: !!(L && L.Routing) };
    return {
      hasRouting: true,
      control: typeof L.Routing.control,
      osrmRouter: typeof L.Routing.osrmRouter,
      localRouter: typeof L.Routing.localRouter,
      line: typeof L.Routing.line,
      keys: Object.keys(L.Routing),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
