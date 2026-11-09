import { chromium } from 'playwright';
import fs from 'node:fs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0,160)); });
const client = await page.context().newCDPSession(page);
const shot = async (name) => { const { data } = await client.send('Page.captureScreenshot', { format: 'jpeg', quality: 86 }); fs.writeFileSync(name, Buffer.from(data, 'base64')); };
await page.goto('http://localhost:4173', { waitUntil: 'load' });
await page.waitForTimeout(12000);
await page.locator('select[aria-label="Render quality"]').selectOption('high').catch(()=>{});
await page.waitForTimeout(2500);
const luminance = await page.evaluate(() => {
  const canvases = [...document.querySelectorAll('canvas')];
  const c = canvases[0];
  const off = document.createElement('canvas'); off.width = c.width; off.height = c.height;
  try { off.getContext('2d').drawImage(c, 0, 0); } catch { return null; }
  const data = off.getContext('2d').getImageData(Math.floor(c.width*0.3), Math.floor(c.height*0.35), Math.floor(c.width*0.4), Math.floor(c.height*0.3)).data;
  let sum = 0, n = 0, bright = 0;
  for (let i = 0; i < data.length; i += 4) { const l = 0.2126*data[i]+0.7152*data[i+1]+0.0722*data[i+2]; sum += l; n++; if (l > 235) bright++; }
  return { mean: +(sum/n).toFixed(1), clippedFraction: +(bright/n).toFixed(3) };
});
await shot('reports/visual/ui-materials.jpg');
await page.locator('select[aria-label="Render quality"]').selectOption('low').catch(()=>{});
await page.waitForTimeout(1800);
const cam = page.locator('select[aria-label="Camera mode"]');
for (const mode of ['top','first','cinematic']) { await cam.selectOption(mode); await page.waitForTimeout(2000); await shot(`reports/visual/ui-camera-${mode}.jpg`); }
console.log(JSON.stringify({ luminance, errors }, null, 1));
await browser.close();
