import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
// Simula un usuario CON "reducir movimiento" activado (el caso que fallaba).
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1380, height: 900 }, reducedMotion: 'reduce' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:8905/landing.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(2600);
const n1 = await page.locator('#chatScroll .msg').count();
await page.waitForTimeout(2600);
const n2 = await page.locator('#chatScroll .msg').count();
const marquee = await page.evaluate(() => {
  const t = document.querySelector('.marquee-track');
  return t ? getComputedStyle(t).animationName : 'no-track';
});
const bot = await page.evaluate(() => {
  const b = document.querySelector('.fbot');
  return b ? getComputedStyle(b).animationName : 'no-bot';
});
console.log('JS errors:', errors.length ? errors : 'ninguno');
console.log('mensajes del chat creciendo (animación viva):', n1, '->', n2, n2 > n1 ? 'OK' : 'REVISAR');
console.log('marquee animation:', marquee, '| bot animation:', bot);
await browser.close();
