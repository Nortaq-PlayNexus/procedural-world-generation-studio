import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1440, height: 980 } });
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,220));});
await p.goto('http://localhost:4173', { waitUntil: 'load' });
await p.waitForTimeout(11000);
await p.getByText('Export', { exact: false }).first().click();
await p.waitForTimeout(800);
const asa = p.getByRole('button', { name: /Ascended/i }).first();
if (await asa.count()) await asa.click();
await p.getByText('Build export bundle', { exact: false }).first().click();
await p.waitForTimeout(9000);
const dialog = await p.locator('[role="dialog"]').innerText();
const report = {
  hasVerdict: /source data only/i.test(dialog),
  statesNotPlayable: /not a playable ARK map/i.test(dialog),
  mentionsEngineUnverified: /no in-engine compatibility verdict/i.test(dialog),
  mentionsWorldPartition: /World Partition/i.test(dialog),
  mentionsLayerMaps: /8-bit single-channel/i.test(dialog),
  zScale: /Suggested import Z scale[\s\S]{0,90}/i.exec(dialog)?.[0].replace(/\n/g,' '),
  selected: /(\d+) SELECTED/.exec(dialog)?.[0],
  fileNames: (dialog.match(/layerWeights_[a-z]+\.png/g) || []).slice(0,6),
  errors: errs,
};
const c = await p.context().newCDPSession(p);
const { data } = await c.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
fs.writeFileSync('reports/visual/ark-compatibility-report.jpg', Buffer.from(data,'base64'));
console.log(JSON.stringify(report, null, 1));
await b.close();
