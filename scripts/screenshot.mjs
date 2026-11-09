import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 240)); });
await page.goto('http://localhost:4173', { waitUntil: 'load' });
await page.waitForTimeout(14000);
const status = await page.evaluate(() => ({ title: document.title, canvases: document.querySelectorAll('canvas').length, footer: document.body.innerText.slice(-500) }));
console.log(JSON.stringify(status, null, 1));
// Lower GPU workload before capture
const quality = page.locator('select[aria-label="Render quality"]');
if (await quality.count()) await quality.selectOption('low');
await page.waitForTimeout(2500);
const client = await page.context().newCDPSession(page);
async function shot(name) {
  const { data } = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const fs = await import('node:fs');
  fs.writeFileSync(name, Buffer.from(data, 'base64'));
  console.log('saved', name);
}
await shot('reports/visual/ui-desktop.png');
const mapButton = page.getByText('Topographic', { exact: true }).first();
if (await mapButton.count()) { await mapButton.click(); await page.waitForTimeout(2500); await shot('reports/visual/ui-topographic.png'); }
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
