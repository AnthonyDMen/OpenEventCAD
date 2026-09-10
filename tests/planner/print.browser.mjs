import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// Run against a local engine server. Each run uses a fresh browser profile.
const url = process.env.ENGINE_TEST_URL || 'http://127.0.0.1:18001';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(url).hostname));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
const output = mkdtempSync(join(tmpdir(), 'engine-print-regression-'));
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  await page.evaluate(() => {
    const items = Array.from({ length: 80 }, (_, i) => ({ type: 'fenceChain', itemKind: 'fence_chain', nodeId: `fence-${i}`, fenceSetupId: `setup-${i}`, fenceSetupName: `Run-${String(i + 1).padStart(3, '0')}`, fenceSetupOrder: i + 1, fenceRunOrder: i + 1, panelLengthFt: 8, points: [{ x: 450, y: 100 + i * 20 }, { x: 546, y: 100 + i * 20 }], layerId: 'items-base' }));
    localStorage.setItem('event-floorplanner:documents:v1', JSON.stringify([{ id: 88001, title: 'Print regression', layout: { items, venues: [] }, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]));
  });
  await page.goto(`${url}/?id=88001`);
  await page.waitForFunction(() => window.Konva?.stages[0]?.find('.fenceChain').length === 80);
  await page.evaluate(() => { window.print = () => { window.printReady = true; }; });
  for (const orientation of ['portrait', 'landscape']) {
    await page.locator('#plannerFileMenuBtn').click();
    await page.locator('#printPlannerMenuItem').click();
    await page.locator('#printLayoutMapKey').check();
    await page.locator('#printKeySamePage').check();
    // Exercise repeated template changes, the original disappearing-section bug.
    await page.locator('#printOrientationPortrait').check();
    await page.locator('#printOrientationLandscape').check();
    await page.locator(orientation === 'portrait' ? '#printOrientationPortrait' : '#printOrientationLandscape').check();
    await page.locator('[data-print-section="fenceRuns"]').check();
    await page.locator('#printPreferencesNotes').fill('Notes start. ' + 'Preserve all event instructions. '.repeat(65) + ' Notes END.');
    await page.locator('#printPreviewRefresh').click();
    const text = await page.locator('#printPreview').innerText();
    for (let i = 1; i <= 80; i++) assert.ok(text.includes(`Run-${String(i).padStart(3, '0')}`));
    assert.ok(text.includes('Notes END.'));
    assert.equal(await page.locator('#printPreview style').count(), 0);
    const clipped = await page.locator('#printPreview .print-paginated-column').evaluateAll((columns) => columns.filter((column) => column.scrollHeight > column.clientHeight + 1).length);
    assert.equal(clipped, 0, 'No report column may hide overflowing rows');
    const expectedPages = await page.locator('#printPreview .print-sheet:visible').count();
    await page.locator('#printPreview').screenshot({ path: join(output, `${orientation}-preview.png`) });
    await page.evaluate(() => { window.printReady = false; });
    await page.getByRole('button', { name: 'Print / Save PDF', exact: false }).click();
    await page.waitForFunction(() => window.printReady);
    // Do not let timed cleanup erase a prepared print document.
    await page.waitForTimeout(1200);
    assert.ok(await page.locator('body').evaluate((body) => body.classList.contains('print-mode')));
    const pdf = join(output, `${orientation}.pdf`);
    await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
    const info = execFileSync('pdfinfo', [pdf], { encoding: 'utf8' });
    assert.equal(Number(info.match(/Pages:\s+(\d+)/)[1]), expectedPages);
    assert.ok(info.includes(orientation === 'portrait' ? '612 x 792' : '792 x 612'));
    const printed = execFileSync('pdftotext', [pdf, '-'], { encoding: 'utf8' });
    for (let i = 1; i <= 80; i++) assert.ok(printed.includes(`Run-${String(i).padStart(3, '0')}`));
    assert.ok(printed.includes('Notes END.'));
    assert.equal(await page.locator('body').evaluate((body) => body.classList.contains('print-mode')), false);
    assert.equal(await page.evaluate(() => Konva.stages[0].find('.fenceChain').length), 80);
    console.log(`${orientation}: ${expectedPages} pages, all 80 runs and notes retained`);
  }
  assert.deepEqual(errors, []);
  console.log(`PDF and preview evidence: ${output}`);
} finally { await browser.close(); }
