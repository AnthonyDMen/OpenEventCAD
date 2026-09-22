import assert from 'node:assert/strict';

// A fresh profile prevents test fixtures from touching the user's saved layouts.
const url = process.env.ENGINE_TEST_URL || 'http://127.0.0.1:8000';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(url).hostname));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.evaluate(() => {
    const items = [
      ...[0, 1].map(i => ({ type: 'groupedSeating', itemKind: 'grouped_seating', nodeId: `chairs-${i}`, x: 400 + i * 600, y: 300,
        groupedConfig: { layoutKind: 'chair_rows', mode: 'free', rows: 5, cols: 8, chairName: 'Chiavari Chair', chairSpacingFt: .5, rowSpacingFt: 1, facing: 'up', aisles: [] } })),
      { type: 'groupedSeating', itemKind: 'grouped_seating', x: 450, y: 350, groupedConfig: { layoutKind: 'table_seating', tableName: '60" Round Table', chairName: 'Chiavari Chair', chairCount: 8, clearanceFt: .25, tableChairPattern: 'side_by_side', seatingLabel: 'Dining' } },
      { type: 'stage', itemKind: 'floor', floorCategory: 'stage', width: 8, length: 8, unit: 'ft', x: 1500, y: 800, floorOptions: { heightIn: 12 }, flooringLabel: 'Band' },
      { type: 'pipeDrapeChain', itemKind: 'pipe_drape_chain', points: [{ x: 1400, y: 500 }, { x: 1496, y: 500 }], heightFt: 10, crossbarMinFt: 6, crossbarMaxFt: 10, pipeDrapeSetupName: 'Backdrop' },
      { type: 'fenceChain', itemKind: 'fence_chain', points: [{ x: 1400, y: 600 }, { x: 1496, y: 600 }], panelLengthFt: 8, fenceSetupName: 'Entrance' },
      { type: 'drawnRun', itemKind: 'drawn_run', drawMode: 'bistro', runPoints: [{ x: 1400, y: 700 }, { x: 1640, y: 700 }], lightRunName: 'Patio' },
    ];
    const venues = [0, 1].map(i => ({ type: 'tent', width: 40, height: 40, unit: 'ft', x: 400 + i * 600, y: 300, nodeId: `tent-${i}` }));
    localStorage.setItem('event-floorplanner:documents:v1', JSON.stringify([{ id: 88002, title: 'Key regression', layout: { items, venues, inventoryPanel: { showTentSetupsOnPrint: true, showSeatingOnPrint: true, showFlooringOnPrint: true, showPipeDrapeOnPrint: true, showFenceRunsOnPrint: true, showLightRunsOnPrint: true } } }]));
  });
  await page.goto(`${url}/?id=88002`);
  await page.waitForFunction(() => window.Konva?.stages[0]?.find('.groupedSeating').length === 3);
  const keyText = id => page.locator(id).textContent();
  assert.match(await keyText('#inventoryKeySeating'), /Total chairs\s*80/);
  assert.match(await keyText('#inventoryKeySeating'), /Rows \/ group\s*5/);
  assert.match(await keyText('#inventoryKeyFlooring'), /Type\s*Stage/);
  assert.match(await keyText('#inventoryKeyFlooring'), /Size\s*8 × 8 ft/);
  assert.match(await keyText('#inventoryKeyPipeDrape'), /Height\s*10 ft/);
  assert.match(await keyText('#inventoryKeyFenceRuns'), /Entrance/);
  assert.match(await keyText('#inventoryKeyLightRuns'), /Patio/);
  // Use the real edit control, including its change event and refresh path.
  await page.locator('.seating-summary-rename').first().evaluate(el => el.click());
  await page.locator('[data-chair-seating-name]').fill('VIP');
  await page.locator('[data-chair-seating-name]').dispatchEvent('change');
  assert.match(await keyText('#inventoryKeySeating'), /VIP/);
  assert.match(await keyText('#inventoryKeyTentSetups'), /VIP/);
  assert.match(await keyText('#inventoryKeyTentSetups'), /40x40 Tent/);
  assert.match(await keyText('#inventoryKeySeating'), /Chairs \/ row\s*8/);
  assert.equal((await keyText('#inventoryKeyTentSetups')).includes('Rows / group'), false, 'Tent references must not duplicate the Seating breakdown');
  await page.locator('#chairRowsEditPopup .chair-edit-close').click();
  await page.locator('.seating-summary-rename[data-seating-kind="table"]').evaluate(el => el.click());
  const tableFacts = await page.locator('#inventoryKeySeating .inventory-key-detail-group').last().locator('tbody').textContent();
  await page.locator('[data-table-edit="seatingLabel"]').fill('Family');
  await page.locator('[data-table-edit="seatingLabel"]').dispatchEvent('change');
  assert.equal(await page.locator('#inventoryKeySeating .inventory-key-detail-group').last().locator('tbody').textContent(), tableFacts);
  assert.match(await keyText('#inventoryKeyTentSetups'), /Family/);
  await page.locator('#tableSeatingEditPopup .chair-edit-close').click();
  const tentFacts = await page.locator('#inventoryKeyTentSetups tbody').first().textContent();
  page.once('dialog', dialog => dialog.accept('Reception'));
  await page.locator('.tent-setup-rename').first().evaluate(el => el.click());
  const reception = page.locator('#inventoryKeyTentSetups .inventory-key-detail-group').filter({ hasText: 'Reception' });
  assert.equal(await reception.locator('.inventory-key-detail-heading strong').textContent(), 'Reception');
  assert.equal(await reception.locator('tbody').textContent(), tentFacts);
  await page.locator('.flooring-summary-edit').evaluate(el => el.click());
  const before = await page.locator('#inventoryKeyFlooring tbody').textContent();
  await page.locator('[data-floor-edit="flooringLabel"]').fill('Music');
  await page.locator('[data-floor-edit="flooringLabel"]').dispatchEvent('change');
  assert.equal(await page.locator('#inventoryKeyFlooring tbody').textContent(), before, 'Renaming must not change setup facts');
  await page.locator('#flooringEditPopup .chair-edit-close').click();
  page.once('dialog', dialog => dialog.accept('Terrace'));
  await page.locator('.light-run-rename').evaluate(el => el.click());
  assert.match(await keyText('#inventoryKeyLightRuns'), /Terrace/);
  await page.locator('#savePlannerMenuItem').evaluate(el => el.click());
  await page.reload();
  await page.waitForFunction(() => window.Konva?.stages[0]?.find('.groupedSeating').length === 3);
  for (const [id, name] of [['#inventoryKeyTentSetups', 'Reception'], ['#inventoryKeySeating', 'VIP'], ['#inventoryKeySeating', 'Family'], ['#inventoryKeyFlooring', 'Music'], ['#inventoryKeyLightRuns', 'Terrace']]) assert.ok((await keyText(id)).includes(name), `Save/reload preserves ${name}`);
  await page.locator('#plannerFileMenuBtn').click();
  await page.locator('#printPlannerMenuItem').click();
  await page.locator('#printLayoutMapKey').check();
  for (const section of ['tentSetups', 'seating', 'flooring', 'pipeDrape', 'fenceRuns', 'lightRuns']) {
    await page.locator(`[data-print-section="${section}"]`).check();
  }
  await page.locator('#printPreviewRefresh').click();
  const printed = await page.locator('#printPreview').textContent();
  for (const text of ['VIP', 'Family', 'Reception', 'Music', 'Terrace', 'Backdrop', 'Entrance', '40x40 Tent', '8 × 8 ft', '10 ft']) assert.ok(printed.includes(text), `Print retains ${text}`);
  assert.deepEqual(errors, []);
  console.log('All six key sections: setup facts, group totals, live rename references and print preview passed.');
} finally { await browser.close(); }
