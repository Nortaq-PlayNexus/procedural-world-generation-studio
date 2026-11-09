import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,200));});
await p.goto('http://localhost:4173', { waitUntil: 'load' });
await p.waitForTimeout(11000);
await p.getByText('Export', { exact: false }).first().click();
await p.waitForTimeout(700);
const pre = await p.locator('[role="dialog"]').innerText();
const required = [
  'Compatibility status: source data only — not a playable ARK map.',
  'It does not contain a cooked map, a Landscape actor or its material, shared layer info, ARK biome volumes, spawner containers, map settings or GameMode/game-data overrides.',
  'ASE maps use a landscape plus sublevels. ASA uses World Partition and no longer supports World Composition.',
  'Neither target has been imported or cooked here, so no in-engine compatibility verdict is claimed.',
  'Resource and spawn maps are documented design hypotheses, not verified creature or loot spawn data.',
];
const visible = required.map(r => pre.includes(r));
await p.getByRole('button', { name: /Ascended/i }).click();
await p.getByText('Build export bundle', { exact: false }).first().click();
await p.waitForTimeout(9000);
const post = await p.locator('[role="dialog"]').innerText();
const report = {
  allPreDisclosureVisible: visible.every(Boolean), visible,
  readmeInList: /Bundle README/i.test(post),
  targetBadge: /source data only/i.test(post) && /not playable/i.test(post) && /not engine-verified/i.test(post),
  selected: /(\d+) SELECTED/.exec(post)?.[0],
  errors: errs,
};
const c = await p.context().newCDPSession(p);
const { data } = await c.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
fs.writeFileSync('reports/visual/ark-disclosure-visible.jpg', Buffer.from(data,'base64'));
console.log(JSON.stringify(report, null, 1));
await b.close();
