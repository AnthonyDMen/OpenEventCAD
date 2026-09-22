import assert from 'node:assert/strict';

const url = process.env.ENGINE_TEST_URL || 'http://127.0.0.1:8000';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(url).hostname));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.evaluate(() => {
    const child = (attrs) => ({ className: 'Group', attrs });
    const layoutGroupConfig = { bounds: { width: 300, height: 300 }, nodes: [
      child({ customType: 'pipeDrapeChain', name: 'pipeDrapeChain', pipeDrapePoints: [{ x: 10, y: 10 }, { x: 130, y: 10 }], crossbarName: "5'–7' Crossbar", crossbarMinFt: 5, crossbarMaxFt: 7, heightFt: 10, pipeDrapeSetupId: 'group-drape', pipeDrapeSetupOrder: 1, pipeDrapeRunOrder: 1 }),
      child({ customType: 'fenceChain', name: 'fenceChain', fencePoints: [{ x: 10, y: 60 }, { x: 106, y: 60 }], fencePanelLengthFt: 8, fenceSetupId: 'group-fence', fenceSetupOrder: 1, fenceRunOrder: 1 }),
      child({ customType: 'drawnRun', name: 'drawnRun', drawMode: 'bistro', runPoints: [{ x: 10, y: 110 }, { x: 160, y: 110 }], runLengthFt: 12.5, lightRunName: 'Grouped Lights' }),
      child({ customType: 'groupedSeating', name: 'groupedSeating', groupedLayoutKind: 'chair_rows', groupedConfig: { layoutKind: 'chair_rows', seatingLabel: 'Grouped Guests', chairName: 'Chiavari Chair', chairCount: 12, rows: 2, cols: 6 } }),
      child({ customType: 'item', itemType: 'stage', isFlooring: true, floorCategory: 'stage', widthFt: 8, lengthFt: 8, floorOptions: { heightIn: 12 }, flooringLabel: 'Grouped Stage' }),
    ] };
    localStorage.setItem('event-floorplanner:documents:v1', JSON.stringify([{ id: 88004, title: 'Grouped key QA', layout: { items: [{ type: 'layoutGroup', itemKind: 'layout_group', nodeId: 'grouped-key', x: 300, y: 300, layoutGroupName: 'Reception setup', layoutGroupConfig }], venues: [] } }]));
  });
  await page.goto(`${url}/?id=88004`);
  await page.waitForFunction(() => window.Konva?.stages[0]?.find('.layoutGroup').length === 1);
  for (const [section, text] of [
    ['#inventoryKeyPipeDrapeSection', "5'–7' Crossbar"],
    ['#inventoryKeyFenceRunsSection', 'Fence Run 1'],
    ['#inventoryKeyLightRunsSection', 'Grouped Lights'],
    ['#inventoryKeySeatingSection', 'Grouped Guests'],
    ['#inventoryKeyFlooringSection', 'Grouped Stage'],
  ]) {
    const locator = page.locator(section);
    assert.notEqual(await locator.evaluate(el => getComputedStyle(el).display), 'none', `${section} is visible`);
    assert.ok((await locator.textContent()).includes(text), `${section} contains ${text}`);
  }
  assert.equal(await page.locator('#inventoryKeyPipeDrapeSection .pipe-drape-rename').count(), 0, 'A grouped setup reports its facts without offering an edit that would split the saved group');
  assert.deepEqual(errors, []);
  console.log('Grouped pipe/drape, fence, lights, seating, and flooring all appear in their own key sections.');
} finally { await browser.close(); }
