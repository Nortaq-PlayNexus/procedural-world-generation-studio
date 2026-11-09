import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0,180)); });
await p.goto('http://localhost:4173', { waitUntil: 'load' });
await p.waitForTimeout(11000);
const text = await p.locator('body').innerText();
console.log(JSON.stringify({
  fieldReady: text.includes('FIELD READY'),
  catchments: /Hydrology routed · \d+ catchments/.exec(text)?.[0],
  errors,
}, null, 1));
await b.close();
