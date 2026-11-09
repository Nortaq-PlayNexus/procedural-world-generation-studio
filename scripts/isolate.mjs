import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
await p.goto('http://localhost:4173/?debug', { waitUntil: 'load' });
await p.waitForTimeout(12000);
const c = await p.context().newCDPSession(p);
const shot = async (n) => { const { data } = await c.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 }); fs.writeFileSync(`reports/visual/iso-${n}.jpg`, Buffer.from(data, 'base64')); return n; };
await shot('1-all');
for (const name of ['ark:clouds','ark:sunSprite','ark:ocean','ark:sky']) {
  const ok = await p.evaluate((n) => { const s = window.__arkScene; const o = s?.getObjectByName(n); if (o) { o.visible = false; return true; } return false; }, name);
  await p.waitForTimeout(900);
  await shot(`2-hide-${name.replace('ark:','')}`);
  console.log('hid', name, ok);
}
console.log('done'); await b.close();
