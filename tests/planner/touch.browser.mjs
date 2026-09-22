import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.ENGINE_TEST_URL || 'http://127.0.0.1:8000';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
try {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 1200, height: 900 } });
  // Optional local-source route supports iteration without replacing the running app.
  if (process.env.TOUCH_TEST_LOCAL_SOURCE) await context.route('**/static/js/planner/**', async route => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ body: await readFile(`app${path}`), contentType: 'text/javascript' });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.evaluate(() => localStorage.setItem('event-floorplanner:documents:v1', JSON.stringify([{ id: 88003, title: 'Touch QA', layout: { items: [{ type: 'groupedSeating', itemKind: 'grouped_seating', nodeId: 'touch-chairs', x: 500, y: 350, groupedConfig: { layoutKind: 'chair_rows', rows: 2, cols: 3, chairName: 'Chiavari Chair' } }], venues: [{ type: 'tent', width: 20, height: 20, unit: 'ft', x: 900, y: 300 }], snapToGrid: false } }])));
  await page.goto(`${url}/?id=88003`);
  await page.waitForFunction(() => window.Konva?.stages[0]?.find('.groupedSeating').length === 1);
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  const state = () => page.evaluate(() => {
    const stage = Konva.stages[0], node = stage.findOne('.groupedSeating');
    let world = node.getParent();
    while (world.getParent().getClassName() !== 'Layer') world = world.getParent();
    return { item: node.position(), world: world.position(), scale: world.scaleX(), bounds: node.getClientRect(), container: stage.content.getBoundingClientRect().toJSON() };
  });
  let before = await state();
  await touch('touchStart', [[650, 550], [800, 550]]);
  await touch('touchMove', [[690, 580], [840, 580]]);
  await touch('touchEnd', []);
  let after = await state();
  assert.deepEqual(after.item, before.item, 'Two fingers cannot move the item');
  assert.ok(Math.abs(after.world.x - before.world.x - 40) < 2, `Two fingers pan canvas: ${JSON.stringify({before, after, errors})}`);
  before = after;
  await touch('touchStart', [[650, 550], [800, 550]]);
  await touch('touchMove', [[620, 550], [830, 550]]);
  await touch('touchEnd', []);
  after = await state(); assert.ok(after.scale > before.scale, 'Pinch zoom');
  const center = [after.bounds.x + after.bounds.width / 2 + after.container.x, after.bounds.y + after.bounds.height / 2 + after.container.y];
  await touch('touchStart', [center]);
  await touch('touchStart', [center, [center[0] + 100, center[1]]]);
  await touch('touchEnd', []);
  assert.deepEqual((await state()).item, after.item, 'Adding a second finger on an item cancels its pending drag');
  await touch('touchStart', [center]);
  await touch('touchMove', [[center[0] + 15, center[1] + 10]]);
  await touch('touchMove', [[center[0] + 70, center[1] + 40]]);
  await touch('touchEnd', []);
  assert.notDeepEqual((await state()).item, after.item, 'One finger drags seating after pinch');
  // Open inventory sections without changing app data, then use real buttons.
  await page.locator('#inventoryPanel details').evaluateAll(nodes => nodes.forEach(n => n.open = true));
  const fence = page.getByRole('button', { name: '4 ft Fence Run', exact: true });
  await fence.tap();
  await touch('touchStart', [[600, 450]]);
  await touch('touchStart', [[600, 450], [750, 450]]);
  await touch('touchMove', [[620, 460], [770, 460]]);
  await touch('touchEnd', [[620, 460]]);
  await touch('touchMove', [[660, 480]]);
  await touch('touchEnd', []);
  await page.locator('[data-touch-action="finish"]').tap();
  assert.equal(await page.evaluate(() => Konva.stages[0].find('.fenceChain').length), 0, 'Pinch while placing must not add run points');
  await page.touchscreen.tap(600, 450);
  await page.touchscreen.tap(700, 450);
  await page.touchscreen.tap(700, 520);
  await page.locator('[data-touch-action="undo-point"]').tap();
  await page.locator('[data-touch-action="finish"]').tap();
  assert.equal(await page.evaluate(() => Konva.stages[0].find('.fenceChain').length), 1, 'Touch finishes fence');
  assert.equal(await page.evaluate(() => Konva.stages[0].findOne('.fenceChain').getAttr('fencePoints').length), 2, 'Undo removes only the last run point');
  await page.locator('#chairRowsPlaceBtn').tap();
  await page.touchscreen.tap(650, 600);
  await page.locator('[data-touch-action="rotate"]').tap();
  await page.screenshot({ path: '/tmp/eventcad-touch-placement.png' });
  await page.locator('[data-touch-action="place"]').tap();
  assert.equal(await page.evaluate(() => Konva.stages[0].find('.groupedSeating').length), 2, 'Place commits one grouped item');
  assert.equal(await page.evaluate(() => Konva.stages[0].find('.groupedSeating')[1].rotation()), 45, 'Placement rotation retained');
  await page.locator('[data-touch-action="cancel"]').tap();
  for (const [button, shape, points] of [
    [page.getByRole('button', { name: "3' Crossbar", exact: true }), '.pipeDrapeChain', [[500, 350], [600, 350]]],
    [page.locator('#inventoryPanel button[data-draw-mode="bistro"]'), '.drawnRun', [[800, 600], [900, 600]]],
  ]) {
    await button.tap();
    await page.touchscreen.tap(...points[0]);
    await page.touchscreen.tap(...points[1]);
    await page.locator('[data-touch-action="finish"]').tap();
    assert.equal(await page.evaluate(selector => Konva.stages[0].find(selector).length, shape), 1, `Touch finishes ${shape}`);
  }
  const lightCenter = await page.evaluate(() => {
    const stage = Konva.stages[0], rect = stage.findOne('.drawnRun').getClientRect(), offset = stage.content.getBoundingClientRect();
    return { x: offset.x + rect.x + rect.width / 2, y: offset.y + rect.y + rect.height / 2 };
  });
  await page.touchscreen.tap(lightCenter.x, lightCenter.y);
  await page.locator('[data-touch-action="edit"]').tap();
  await page.touchscreen.tap(800, 530);
  await page.locator('[data-touch-action="finish"]').tap();
  assert.equal(await page.evaluate(() => Konva.stages[0].find('.drawnRun').length), 1, 'Editing a light run does not duplicate it');
  assert.equal(await page.evaluate(() => Konva.stages[0].findOne('.drawnRun').getAttr('runPoints').length), 3, 'Touch edit extends the existing light run');
  const escapeNewRun = async (button, shape, draft, label) => {
    const before = await page.evaluate(selector => Konva.stages[0].find(selector).length, shape);
    await button.tap();
    await page.touchscreen.tap(600, 450);
    await page.touchscreen.tap(700, 450);
    assert.equal(await page.evaluate(selector => Konva.stages[0].find(selector).length, draft), 1, `${label} preview is visible before Escape`);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(selector => Konva.stages[0].find(selector).length, draft), 0, `${label} preview is removed by Escape`);
    assert.equal(await page.evaluate(selector => Konva.stages[0].find(selector).length, shape), before, `${label} Escape does not create a run`);
  };
  await escapeNewRun(fence, '.fenceChain', '.fenceDraft', 'Fence');
  await escapeNewRun(page.getByRole('button', { name: "3' Crossbar", exact: true }), '.pipeDrapeChain', '.pipeDrapeDraft', 'Pipe & drape');
  await escapeNewRun(page.locator('#inventoryPanel button[data-draw-mode="bistro"]'), '.drawnRun', '.drawnRunDraft', 'Standalone light');
  const tentBounds = await page.evaluate(() => {
    const stage = Konva.stages[0], tent = stage.findOne('.venue');
    const rect = tent.getClientRect(), offset = stage.content.getBoundingClientRect();
    return { x: offset.x + rect.x, y: offset.y + rect.y, width: rect.width, height: rect.height };
  });
  await page.locator('#venuesPanelTab').tap();
  await page.locator('#tentAddonsVenueSection').evaluate(node => { node.open = true; });
  await page.locator('#tentAddonsVenueList').getByRole('button', { name: 'Custom Bistro Lights', exact: true }).tap();
  await page.touchscreen.tap(tentBounds.x + 3, tentBounds.y + tentBounds.height / 2);
  await page.touchscreen.tap(tentBounds.x + tentBounds.width / 2, tentBounds.y + tentBounds.height / 2);
  assert.equal(await page.evaluate(() => Konva.stages[0].find('.customBistroDraft').length), 1, 'Custom bistro preview is visible before Escape');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => Konva.stages[0].find('.customBistroDraft').length), 0, 'Custom bistro preview is removed by Escape');
  assert.equal(await page.evaluate(() => Konva.stages[0].find('.tentAddon').filter(node => node.getAttr('addonType') === 'customBistro').length), 0, 'Escape does not save a custom bistro string');
  const escapeResumedRun = async (shape, draft, pointKey, label) => {
    const before = await page.evaluate(([selector, key]) => {
      const node = Konva.stages[0].findOne(selector);
      return node.getAttr(key);
    }, [shape, pointKey]);
    const center = await page.evaluate(selector => {
      const stage = Konva.stages[0], rect = stage.findOne(selector).getClientRect(), offset = stage.content.getBoundingClientRect();
      return { x: offset.x + rect.x + rect.width / 2, y: offset.y + rect.y + rect.height / 2 };
    }, shape);
    await page.touchscreen.tap(center.x, center.y);
    await page.locator('[data-touch-action="edit"]').tap();
    assert.equal(await page.evaluate(selector => Konva.stages[0].find(selector).length, draft), 1, `${label} has a preview while being edited`);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(selector => Konva.stages[0].find(selector).length, draft), 0, `${label} edit preview is removed by Escape`);
    assert.deepEqual(await page.evaluate(([selector, key]) => Konva.stages[0].findOne(selector).getAttr(key), [shape, pointKey]), before, `${label} is restored unchanged after Escape`);
    assert.equal(await page.evaluate(selector => Konva.stages[0].findOne(selector).visible(), shape), true, `${label} is visible after Escape`);
  };
  await escapeResumedRun('.fenceChain', '.fenceDraft', 'fencePoints', 'Fence');
  await escapeResumedRun('.pipeDrapeChain', '.pipeDrapeDraft', 'pipeDrapePoints', 'Pipe & drape');
  await escapeResumedRun('.drawnRun', '.drawnRunDraft', 'runPoints', 'Standalone light');
  assert.deepEqual(errors, []);
  await page.screenshot({ path: '/tmp/eventcad-touch-qa.png' });
  console.log('Touch pan/pinch, grouped drag/rotation/placement, gesture isolation, and Escape cancellation for all run drafts passed.');
} finally { await browser.close(); }
