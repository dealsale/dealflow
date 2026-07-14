import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1380, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:8907/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const sw = await page.evaluate(async () => {
  const r = await navigator.serviceWorker.getRegistration();
  return r ? 'registrado (' + (r.active ? 'activo' : 'instalando') + ')' : 'NO registrado';
});
const manifest = await page.evaluate(async () => {
  const r = await fetch('/manifest.webmanifest');
  const m = await r.json();
  return m.name + ' · iconos: ' + m.icons.length;
});
// login para ver el preloader
await page.fill('input[placeholder="tucorreo@tienda.co"]', 'karla@lunaaccesorios.co');
await page.fill('input[placeholder="••••••••"]', 'demo123');
await page.click('text=Entrar a mi tienda');
await page.waitForTimeout(700);
const splash = await page.locator('.dfpl').count();
await page.screenshot({ path: 'preloader.png' });
console.log('SW:', sw);
console.log('Manifest:', manifest);
console.log('Preloader visible tras login:', splash > 0 ? 'SÍ' : 'NO');
console.log('JS errors:', errors.length ? errors : 'ninguno');
await browser.close();
