import { chromium } from 'playwright';
import fs from 'node:fs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text().slice(0,200)); });
const client = await page.context().newCDPSession(page);
const shot = async (name) => { const { data } = await client.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 }); fs.writeFileSync(name, Buffer.from(data, 'base64')); };
const report = {};
await page.goto('http://localhost:4173', { waitUntil: 'load' });
await page.waitForTimeout(12000);
await page.locator('select[aria-label="Render quality"]').selectOption('low').catch(()=>{});
await page.waitForTimeout(1500);
report.fpsText = await page.locator('footer').innerText();
report.objectCount = await page.getByText(/2,815|2,8\d\d/).count();

// Validation dialog and real run
await page.getByTitle('Open mathematical validation suite').first().click().catch(async () => { await page.getByText('Validation', { exact: false }).first().click(); });
await page.waitForTimeout(2500);
report.validationText = (await page.locator('[role="dialog"]').innerText()).slice(0, 600);
await shot('reports/visual/ui-validation.jpg');
await page.keyboard.press('Escape');

// Analysis dialog
await page.getByText('Analysis', { exact: true }).first().click();
await page.waitForTimeout(1500);
report.analysisOpen = await page.locator('[role="dialog"]').count();
await shot('reports/visual/ui-analysis.jpg');
await page.keyboard.press('Escape');

// Export dialog: build a bundle
await page.getByText('Export', { exact: false }).first().click();
await page.waitForTimeout(600);
const build = page.getByText('Build export bundle', { exact: false });
if (await build.count()) { await build.first().click(); await page.waitForTimeout(4000); }
report.exportText = (await page.locator('[role="dialog"]').innerText()).slice(0, 900);
await shot('reports/visual/ui-export.jpg');
await page.keyboard.press('Escape');

// Preset load
await page.getByText('Change', { exact: false }).first().click();
await page.waitForTimeout(500);
report.presetDialog = await page.locator('[role="dialog"]').innerText().then(t => t.slice(0, 200)).catch(()=> 'none');
await page.getByText('Load preset', { exact: false }).first().click();
await page.waitForTimeout(9000);
report.afterPreset = (await page.locator('header').innerText()).slice(0, 200);
report.worldGenMs = await page.evaluate(() => document.body.innerText.match(/generation \d+ ms/)?.[0] ?? 'n/a');

// Layers tab and draw call check
await page.getByText('Layers', { exact: true }).first().click();
await page.waitForTimeout(900);
await shot('reports/visual/ui-layers.jpg');

// Interactive terrain raise via map view
await page.getByText('Topographic', { exact: true }).click();
await page.waitForTimeout(1800);
report.topographic = await page.getByText('Cartographic renderer').count();
await shot('reports/visual/ui-topographic.jpg');

// Console opens
await page.getByText('Console', { exact: true }).click();
await page.waitForTimeout(500);
report.console = (await page.locator('body').innerText()).match(/(Deterministic engine ready|Studio diagnostics|Hydrology routed)[^\n]*/)?.[0] ?? 'none';

console.log(JSON.stringify(report, null, 1));
console.log('ERRORS', errors.length ? errors.join('\n') : 'none');
await browser.close();
