import assert from 'node:assert/strict';

const url = process.env.ENGINE_TEST_URL || 'http://127.0.0.1:8000';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(url).hostname));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.evaluate(() => {
    const items = [
      { type: 'pipeDrapeChain', itemKind: 'pipe_drape_chain', points: [{ x: 240, y: 240 }, { x: 360, y: 240 }], crossbarName: "5'–7' Crossbar", crossbarMinFt: 5, crossbarMaxFt: 7, heightFt: 10, pipeDrapeSetupName: 'Backdrop' },
      { type: 'fenceChain', itemKind: 'fence_chain', points: [{ x: 240, y: 300 }, { x: 336, y: 300 }], panelLengthFt: 8, fenceSetupName: 'Queue' },
      { type: 'drawnRun', itemKind: 'drawn_run', drawMode: 'bistro', runPoints: [{ x: 240, y: 360 }, { x: 360, y: 360 }], lightRunName: 'Dinner Lights' },
      { type: 'stage', itemKind: 'floor', floorCategory: 'stage', width: 8, length: 8, unit: 'ft', x: 300, y: 420, floorOptions: { heightIn: 12 }, flooringLabel: 'Band' },
      { type: 'groupedSeating', itemKind: 'grouped_seating', x: 300, y: 390, groupedConfig: { layoutKind: 'chair_rows', seatingLabel: 'Guests', chairName: 'Chiavari Chair', rows: 2, cols: 6 } },
    ];
    const venues = [{ type: 'tent', width: 30, height: 30, unit: 'ft', x: 150, y: 150, tentSetupName: 'Reception Tent' }];
    localStorage.setItem('event-floorplanner:documents:v1', JSON.stringify([{ id: 88005, title: 'Tent interior QA', layout: { items, venues } }]));
  });
  await page.goto(`${url}/?id=88005`);
  await page.waitForFunction(() => window.Konva?.stages[0]?.find('.pipeDrapeChain').length === 1);
  const key = await page.locator('#inventoryKeyTentSetups').textContent();
  for (const text of ['Reception Tent', '30x30 Tent', 'Backdrop', 'Queue', 'Dinner Lights', 'Band', 'Guests']) assert.ok(key.includes(text), `Tent index contains ${text}`);
  assert.equal((key.match(/Backdrop/g) || []).length, 1, 'Pipe & drape has one tent heading');
  assert.equal((key.match(/Guests/g) || []).length, 1, 'Seating is referenced once, without duplicating its full breakdown');
  for (const text of ['Total drape', 'Height', 'Crossbar', 'Type', 'Size', 'Run length']) assert.equal(key.includes(text), false, `Tent index does not duplicate ${text}`);
  assert.deepEqual(errors, []);
  console.log('Tent key indexes finalized pipe/drape, fence, lights, flooring, and group labels without duplicating setup facts.');
} finally { await browser.close(); }
