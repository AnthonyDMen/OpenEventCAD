import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cloneConfig,
  normaliseFeet,
  normaliseNonNegativeInteger,
  valuesRoughlyMatch,
} from '../../app/static/js/planner/domain/value.js';
import { escapeHtml, formatInventoryAmount, formatInventoryUsage } from '../../app/static/js/planner/domain/format.js';
import { bistroZigZagPointsFt, chandelierPositionsFt } from '../../app/static/js/planner/domain/lights.js';
import {
  clampEndpointToSpan,
  pointDistance,
  pointDistanceInFeet,
  polylineLength,
} from '../../app/static/js/planner/domain/polyline.js';
import {
  pointInPolygon,
  pointsBounds,
  polygonSelfIntersects,
  rectanglePoints,
  rectangleTouchesPolygon,
  segmentsIntersect,
} from '../../app/static/js/planner/domain/polygon.js';
import {
  distributeAlongSpan,
  distributeRectChairCounts,
  chairRowsAisleGapIndex,
  chairRowsAislePhysicalCenterFt,
  chairRowsAisleVisualBounds,
  chairRowsGapCenterFt,
  chairRowsNearestAvailableGap,
  normaliseChairRowsAisles,
} from '../../app/static/js/planner/domain/seating.js';
import {
  arcPoints,
  buildVectorShape,
  circleFromArcPoints,
  normaliseDegrees,
  rotatePoints,
} from '../../app/static/js/planner/domain/shapes.js';
import { stagePanelParts } from '../../app/static/js/planner/domain/stage.js';
import { fenceInventoryRows, standaloneFenceHardware } from '../../app/static/js/planner/domain/fence.js';
import { roomAttachmentClamp, roomAttachmentList } from '../../app/static/js/planner/domain/room-attachments.js';
import { isLayoutGroupableNodeType, isValidLayoutGroupTemplate, layoutGroupConfigFromSnapshots, mergeLayoutGroupTemplates, validLayoutGroupTemplates } from '../../app/static/js/planner/domain/layout-groups.js';
import { automaticLabelMeta, isHeightLabelText, isOptionalHeightLabel } from '../../app/static/js/planner/domain/labels.js';
import { defaultLayers, ensureBaseLayers, fallbackLayerIdForKind, layerAcceptsPlacement, nodeIsSelectable, normaliseLayer } from '../../app/static/js/planner/domain/layers.js';
import { readLocalDocuments, upsertLocalDocument, writeLocalDocuments } from '../../app/static/js/planner/domain/documents.js';
import { inventoryMeasurementIsAssumed, inventoryRowUnit, normaliseInventoryDefinition } from '../../app/static/js/planner/domain/inventory.js';
import { inventoryLimitListMarkup, inventorySummaryTable, printInventorySummaryMarkup } from '../../app/static/js/planner/features/inventory/markup.js';
import { groupChairRowConfigs, groupTableSeatingConfigs } from '../../app/static/js/planner/features/inventory/seating.js';
import { customItemPlacementPayload } from '../../app/static/js/planner/features/custom-library/render.js';
import { referenceSetupDisplay, referenceSetupPoint } from '../../app/static/js/planner/features/reference/canvas.js';
import {
  stableTentSetupValue,
  layoutGroupSetupContents,
  tentAddonSetupEntryFromAttrs,
  tentAddonUsageRowsFromRecords,
  tentDisplayNameFromSize,
  tentSetupSignatureFromAttrs,
} from '../../app/static/js/planner/domain/tent-summary.js';
import {
  fanAttachmentAtLeg,
  fanAttachmentAtPerimeter,
  fireExtinguisherAttachmentAtLeg,
  isHangingDecorAddon,
  legDrapeAttachmentAtLeg,
  nearestTentLegIndex,
  normaliseWeightFootprint,
  perimeterSignAttachment,
  projectLocalPointToTentEdge,
  snapTentBistroPoint,
  sidewallPlacementPoint,
  tentAddonSegments,
  tentContainsLocalPoint,
  tentLegPositionsFt,
  tentLocalPointToWorldPoint,
  weightAttachmentAtLeg,
  weightSupportDistance,
  worldPointToTentLocalPoint,
} from '../../app/static/js/planner/domain/tent.js';

test('cloneConfig copies nested layout data without retaining references', () => {
  const original = { points: [{ x: 12, y: 24 }], options: { visible: true } };
  const clone = cloneConfig(original);
  clone.points[0].x = 99;
  clone.options.visible = false;
  assert.deepEqual(original, { points: [{ x: 12, y: 24 }], options: { visible: true } });
});

test('custom inventory placement uses one cloned compound geometry for preview and final placement', () => {
  const item = {
    name: 'Custom Bench',
    hanging: false,
    color: '#c89b54',
    // Deliberately stale dimensions: compound points are the canonical source.
    length: 99,
    depth: 99,
    components: [{
      kind: 'polygon',
      points: [{ x: 2, y: 3 }, { x: 8, y: 3 }, { x: 8, y: 5 }, { x: 2, y: 5 }],
    }, {
      kind: 'line',
      closed: false,
      points: [{ x: 2, y: 6 }, { x: 8, y: 6 }],
    }],
  };

  const payload = customItemPlacementPayload(item, cloneConfig);
  assert.equal(payload.kind, 'item');
  assert.equal(payload.widthFt, 3);
  assert.equal(payload.lengthFt, 6);
  assert.equal(payload.rawData.width, payload.widthFt);
  assert.equal(payload.rawData.length, payload.lengthFt);
  assert.deepEqual(payload.rawData.footprint, payload.footprint);
  assert.notEqual(payload.rawData.footprint, payload.footprint);
  assert.deepEqual(payload.footprint.components[1], item.components[1]);

  payload.footprint.components[0].points[0].x = 50;
  assert.equal(payload.rawData.footprint.components[0].points[0].x, 2);
  assert.equal(item.components[0].points[0].x, 2);
});

test('reference setup viewport zooms and maps crop points through its pan', () => {
  const canvas = { width: 0, height: 0, getBoundingClientRect: () => ({ left: 10, top: 20, width: 900, height: 620 }) };
  const image = { width: 900, height: 620 };
  const view = { zoom: 2, panX: 90, panY: -80 };
  const display = referenceSetupDisplay(canvas, image, view);
  assert.equal(canvas.width, 900);
  assert.equal(canvas.height, 620);
  assert.equal(display.scale, 2);
  assert.equal(view.panX, 90);
  assert.equal(view.panY, -80);
  assert.deepEqual(referenceSetupPoint(canvas, image, { clientX: 550, clientY: 250 }, view), { x: 450, y: 310 });
  assert.deepEqual(referenceSetupPoint(canvas, image, { clientX: 10, clientY: 20 }, view), { x: 180, y: 195 });
});

test('normaliseFeet accepts numbers and converts pixel values', () => {
  assert.equal(normaliseFeet(10, 'ft'), 10);
  assert.equal(normaliseFeet('24', 'px'), 2);
  assert.equal(normaliseFeet('invalid', 'ft'), undefined);
});

test('value and display helpers handle inventory values safely', () => {
  assert.equal(normaliseNonNegativeInteger(' 12 '), 12);
  assert.equal(normaliseNonNegativeInteger(-1), null);
  assert.equal(valuesRoughlyMatch(3, 3.005), true);
  assert.equal(escapeHtml('<table "A"> &'), '&lt;table &quot;A&quot;&gt; &amp;');
  assert.equal(formatInventoryAmount(12.34, 'ft'), '12.3 ft');
  assert.equal(formatInventoryUsage('Bistro Lights', 27, 'ft'), '~27 ft');
  assert.equal(formatInventoryUsage('Stage Skirt', 24, 'ft'), '~24 ft');
});

test('standalone fence panels include their two bases and two poles', () => {
  assert.deepEqual(standaloneFenceHardware({ inventoryName: "Fence Panel 8' x 3'", footprintSpec: { shape: 'panel_with_bases' } }), [
    { name: 'Fence Bases', amount: 2, unit: 'count' },
    { name: 'Fence Poles', amount: 2, unit: 'count' },
  ]);
  assert.deepEqual(standaloneFenceHardware({ inventoryName: "Grass Wall 4' x 8'", footprintSpec: { shape: 'panel_with_bases' } }), []);
  assert.equal(fenceInventoryRows([{ panelLengthFt: 8, points: [{ x: 0, y: 0 }, { x: 96, y: 0 }] }]).rows.find((row) => row.name === 'Fence Bases').amount, 2);
});

test('room attachments clamp into the nearest available wall gap', () => {
  const migrated = roomAttachmentList({ attachments: [], doors: [{ id: 'door-1', wallIndex: 0, position: 0.25 }], openings: [{ id: 'opening-1', wallIndex: 1, position: 0.75 }] });
  assert.deepEqual(migrated.map((item) => [item.id, item.type]), [['door-1', 'door'], ['opening-1', 'opening']]);
  const wall = { length: 12 };
  const attachments = roomAttachmentList({ attachments: [
    { id: 'a', componentId: 'room-outline', wallIndex: 0, t: 0.25, widthFt: 3 },
    { id: 'b', componentId: 'room-outline', wallIndex: 0, t: 0.75, widthFt: 3 },
  ] });
  const next = { id: 'c', componentId: 'room-outline', wallIndex: 0, t: 0.5, widthFt: 4 };
  assert.equal(roomAttachmentClamp(next, wall, attachments), null);
  const movable = { id: 'c', componentId: 'room-outline', wallIndex: 0, t: 0.5, widthFt: 2 };
  assert.equal(roomAttachmentClamp(movable, wall, attachments), movable);
  assert.equal(movable.t, 0.5);
});

test('polylineLength measures connected segments in feet', () => {
  assert.equal(polylineLength([{ x: 0, y: 0 }, { x: 36, y: 0 }, { x: 36, y: 48 }], 12), 7);
  assert.equal(polylineLength([{ x: 0, y: 0 }], 12), 0);
});

test('point distance helpers use the planner pixel scale', () => {
  const start = { x: 0, y: 0 };
  const end = { x: 36, y: 48 };
  assert.equal(pointDistance(start, end), 60);
  assert.equal(pointDistanceInFeet(start, end, 12), 5);
});

test('clampEndpointToSpan keeps a run within its maximum length', () => {
  assert.deepEqual(clampEndpointToSpan({ x: 0, y: 0 }, { x: 960, y: 0 }, 60, 12), { x: 720, y: 0 });
  assert.deepEqual(clampEndpointToSpan({ x: 0, y: 0 }, { x: 120, y: 120 }, 60, 12), { x: 120, y: 120 });
});

test('polygon helpers identify points, intersections, and self-crossing venue outlines', () => {
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  assert.equal(pointInPolygon({ x: 5, y: 5 }, square), true);
  assert.equal(pointInPolygon({ x: 15, y: 5 }, square), false);
  assert.equal(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }), true);
  assert.equal(polygonSelfIntersects(square), false);
  assert.equal(polygonSelfIntersects([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }]), true);
});

test('rectangle helpers preserve venue-builder and print-workspace geometry', () => {
  const rectangle = { x: 2, y: 3, width: 8, height: 6 };
  assert.deepEqual(rectanglePoints(rectangle), [{ x: 2, y: 3 }, { x: 10, y: 3 }, { x: 10, y: 9 }, { x: 2, y: 9 }]);
  assert.deepEqual(pointsBounds(rectanglePoints(rectangle)), { minX: 2, maxX: 10, minY: 3, maxY: 9 });
  assert.equal(rectangleTouchesPolygon(rectangle, [{ x: 9, y: 8 }, { x: 12, y: 8 }, { x: 12, y: 12 }, { x: 9, y: 12 }]), true);
  assert.equal(rectangleTouchesPolygon(rectangle, [{ x: 20, y: 20 }, { x: 22, y: 20 }, { x: 22, y: 22 }, { x: 20, y: 22 }]), false);
});

test('seating helpers center chairs and normalise aisle configuration', () => {
  assert.deepEqual(distributeAlongSpan(0, 10, 2), []);
  assert.deepEqual(distributeAlongSpan(1, 10, 2), [5]);
  assert.deepEqual(distributeAlongSpan(3, 10, 2), [2.5, 5, 7.5]);
  assert.deepEqual(normaliseChairRowsAisles({ aislesEnabled: false }), []);
  assert.deepEqual(normaliseChairRowsAisles({
    aisleCount: 2,
    aisles: [{ id: 'center', direction: 'horizontal', widthFt: 6, position: .25, angleDeg: 30 }],
  }), [
    { id: 'center', direction: 'horizontal', widthFt: 6, position: .25, angleDeg: 30 },
    { id: 'aisle-2', direction: 'vertical', widthFt: 4, position: 2 / 3, angleDeg: 45 },
  ]);
});

test('multiple aisle gap indexes preserve their positions as the row expands', () => {
  const aisles = [
    { id: 'left', direction: 'vertical', widthFt: 4, gapIndex: 0, position: .1875 },
    { id: 'right', direction: 'vertical', widthFt: 2, gapIndex: 2, position: .6041666667 },
  ];
  const axis = { gapCount: 4, footprintFt: 2, spacingFt: .5 };
  assert.equal(chairRowsAisleGapIndex({ position: .75 }, 3), 2);
  assert.equal(chairRowsGapCenterFt(0, 2, .5), 2.25);
  assert.equal(chairRowsAislePhysicalCenterFt(aisles[0], aisles, axis), 2.25);
  assert.equal(chairRowsAislePhysicalCenterFt(aisles[1], aisles, axis), 11.25);
  assert.deepEqual(chairRowsAisleVisualBounds({ rows: 4, cols: 5, chairWidthFt: 2, chairLengthFt: 2, rowSpacingFt: .5, seatSpacingFt: .5, lengthFt: 18, widthFt: 9.5, aisles }, aisles[1]), { xFt: 10.25, yFt: 0, widthFt: 2, heightFt: 9.5 });
});

test('three aisle centers remain tied to three different chair gaps', () => {
  const axis = { gapCount: 5, footprintFt: 2, spacingFt: .5 };
  const aisles = [
    { id: 'a', direction: 'vertical', widthFt: 4, gapIndex: 0 },
    { id: 'b', direction: 'vertical', widthFt: 3, gapIndex: 1 },
    { id: 'c', direction: 'vertical', widthFt: 2, gapIndex: 3 },
  ];
  assert.deepEqual(aisles.map((aisle) => chairRowsAislePhysicalCenterFt(aisle, aisles, axis)), [2.25, 8.75, 16.75]);
});

test('repeated aisle placement always selects an unoccupied gap at the pointer', () => {
  const axis = { gapCount: 5, footprintFt: 2, spacingFt: .5 };
  const first = chairRowsNearestAvailableGap(7.3, axis, [], 'vertical');
  assert.equal(first.gapIndex, 2);
  const aisles = [{ id: 'first', direction: 'vertical', widthFt: 4, gapIndex: first.gapIndex }];
  const second = chairRowsNearestAvailableGap(2.2, axis, aisles, 'vertical');
  assert.equal(second.gapIndex, 0);
  aisles.push({ id: 'second', direction: 'vertical', widthFt: 3, gapIndex: second.gapIndex });
  const third = chairRowsNearestAvailableGap(13.8, axis, aisles, 'vertical');
  assert.equal(third.gapIndex, 3);
  assert.equal(new Set([first.gapIndex, second.gapIndex, third.gapIndex]).size, 3);
});

test('aisle gap indexes survive normalization and JSON save/load', () => {
  const original = {
    aislesEnabled: true,
    aisleCount: 2,
    aisles: [
      { id: 'left', direction: 'vertical', widthFt: 4, gapIndex: 0, position: .18 },
      { id: 'right', direction: 'vertical', widthFt: 3, gapIndex: 3, position: .72 },
    ],
  };
  const restored = JSON.parse(JSON.stringify(normaliseChairRowsAisles(original)));
  assert.deepEqual(restored.map((aisle) => aisle.gapIndex), [0, 3]);
});

test('rectangular table seating fills long sides before short sides', () => {
  assert.deepEqual(distributeRectChairCounts(0, 3, 2), { longA: 0, longB: 0, shortA: 0, shortB: 0 });
  assert.deepEqual(distributeRectChairCounts(5, 3, 2), { longA: 2, longB: 2, shortA: 1, shortB: 0 });
  assert.deepEqual(distributeRectChairCounts(9, 3, 2), { longA: 3, longB: 3, shortA: 2, shortB: 1 });
});

test('custom venue shape helpers create, rotate, and reconstruct arc geometry', () => {
  assert.equal(normaliseDegrees(-90), 270);
  assert.deepEqual(buildVectorShape('rectangle', { x: 5, y: 4 }, { x: 1, y: 2 }), [{ x: 1, y: 2 }, { x: 5, y: 2 }, { x: 5, y: 4 }, { x: 1, y: 4 }]);
  assert.deepEqual(buildVectorShape('line', { x: 1, y: 2 }, { x: 3, y: 4 }), [{ x: 1, y: 2 }, { x: 3, y: 4 }]);
  const arc = arcPoints({ x: 10, y: 20 }, 5);
  const circle = circleFromArcPoints(arc);
  assert.equal(arc.length, 20);
  assert.ok(Math.abs(circle.x - 10) < .0001);
  assert.ok(Math.abs(circle.y - 20) < .0001);
  assert.ok(Math.abs(circle.radius - 5) < .0001);
  const rotated = rotatePoints([{ x: 1, y: 0 }], { x: 0, y: 0 }, Math.PI / 2);
  assert.ok(Math.abs(rotated[0].x) < .0001);
  assert.ok(Math.abs(rotated[0].y - 1) < .0001);
});

test('stage packing uses the largest panels first and counts unique leg positions', () => {
  assert.deepEqual(stagePanelParts(4, 4), {
    parts: { 'Stage 4×4 Panels': 1, 'Stage 2×4 Panels': 0, 'Stage 2×2 Panels': 0 },
    legs: 4,
    placed: [{ x: 0, y: 0, w: 2, h: 2 }],
  });
  assert.deepEqual(stagePanelParts(6, 4).parts, { 'Stage 4×4 Panels': 1, 'Stage 2×4 Panels': 1, 'Stage 2×2 Panels': 0 });
  assert.equal(stagePanelParts(6, 4).legs, 6);
});

test('tent weight helpers retain configured footprints and calculate support clearance', () => {
  const rectangular = normaliseWeightFootprint({ weightFootprint: { shape: 'rect', widthFt: 2, lengthFt: 4 } });
  assert.deepEqual(rectangular, { shape: 'rect', widthFt: 2, lengthFt: 4 });
  assert.equal(weightSupportDistance(rectangular, { x: 1, y: 0 }, 0), 2);
  assert.ok(Math.abs(weightSupportDistance(rectangular, { x: 1, y: 0 }, 90) - 1) < .000001);
  const circular = normaliseWeightFootprint({ diameterFt: 3 });
  assert.deepEqual(circular, { shape: 'circle', diameterFt: 3 });
  assert.equal(weightSupportDistance(circular, { x: 0, y: 1 }, 30), 1.5);
});

test('tent layout helpers preserve leg patterns and constrain perimeter signs', () => {
  assert.deepEqual(tentLegPositionsFt(10, 15), [[0, 0], [10, 0], [10, 15], [0, 15]]);
  assert.deepEqual(tentLegPositionsFt(15, 20), [[0, 0], [0, 20], [15, 0], [15, 20], [0, 10], [15, 10]]);
  assert.deepEqual(perimeterSignAttachment(20, 10, { x: .2, y: 0 }, 2), { kind: 'perimeterSign', edge: 0, center: 1, signLengthFt: 2 });
  assert.deepEqual(tentAddonSegments(10, 10, { x: 8, y: 0 }, 5), [{ edge: 0, start: 8, length: 2 }, { edge: 1, start: 0, length: 3 }]);
  assert.deepEqual(sidewallPlacementPoint(20, 10, { x: 6.3, y: .2 }), { x: 7.5, y: 0 });
  assert.deepEqual(sidewallPlacementPoint(20, 10, { x: 6.3, y: .2 }, false), { x: 6.3, y: 0 });
});

test('tent spatial helpers preserve rotated coordinates and edge snapping', () => {
  const origin = { x: 100, y: 200 };
  const local = { x: 10, y: 5 };
  const world = tentLocalPointToWorldPoint(local, origin, 90, 12);
  assert.ok(Math.abs(world.x - 40) < .000001);
  assert.ok(Math.abs(world.y - 320) < .000001);
  const restored = worldPointToTentLocalPoint(world, origin, 90, 12);
  assert.ok(Math.abs(restored.x - local.x) < .000001);
  assert.ok(Math.abs(restored.y - local.y) < .000001);
  assert.equal(tentContainsLocalPoint(20, 10, { x: 20.5, y: 5 }, .5), true);
  assert.deepEqual(projectLocalPointToTentEdge(20, 10, { x: 22, y: 8 }), { x: 20, y: 8 });
  assert.deepEqual(snapTentBistroPoint(15, 20, { x: 7.2, y: 11.9 }), { x: 7.5, y: 10 });
});

test('tent leg attachments resolve the nearest leg and their placement offsets', () => {
  assert.equal(nearestTentLegIndex(20, 20, { x: 9, y: 1 }).index, 2);
  const footprint = normaliseWeightFootprint({ diameterFt: 2 });
  const weight = weightAttachmentAtLeg(10, 10, 0, { x: 0, y: 0 }, footprint);
  assert.deepEqual({ kind: weight.kind, legIndex: weight.legIndex, clearanceFt: weight.clearanceFt, rotationDeg: weight.rotationDeg }, { kind: 'weight', legIndex: 0, clearanceFt: 1.5, rotationDeg: 0 });
  assert.ok(Math.abs(weight.point.x + Math.SQRT1_2 * 2.5) < .000001);
  assert.ok(Math.abs(weight.point.y + Math.SQRT1_2 * 2.5) < .000001);
  assert.deepEqual(fanAttachmentAtLeg(10, 10, 0, 2, 4), { kind: 'fan', legIndex: 0, rotationDeg: -45, point: { x: 0.15 + (6 / (2 * Math.SQRT2)), y: 0.15 + (6 / (2 * Math.SQRT2)) }, insideClearanceFt: 0.15 });
  assert.deepEqual(fanAttachmentAtPerimeter(10, 10, { x: 3, y: .1 }, 2), { kind: 'fan', edge: 0, rotationDeg: 90, point: { x: 3, y: 1.15 }, insideClearanceFt: .15 });
  const extinguisher = fireExtinguisherAttachmentAtLeg(10, 10, 0);
  assert.deepEqual({ kind: extinguisher.kind, legIndex: extinguisher.legIndex }, { kind: 'fireExtinguisher', legIndex: 0 });
  assert.ok(Math.abs(extinguisher.point.x - Math.SQRT1_2 / 2) < .000001);
  assert.ok(Math.abs(extinguisher.point.y - Math.SQRT1_2 / 2) < .000001);
  assert.deepEqual(legDrapeAttachmentAtLeg(10, 10, 0), {
    kind: 'legDrape', legIndex: 0,
    segments: [{ edge: 3, start: 0, length: 1 }, { edge: 0, start: 0, length: .5 }, { edge: 0, start: 0, length: 1.5 }],
  });
  assert.equal(isHangingDecorAddon('bistro'), true);
  assert.equal(isHangingDecorAddon('weight'), false);
});

test('tent lighting helpers place chandeliers and bistro strings predictably', () => {
  assert.deepEqual(chandelierPositionsFt(20, 20), [{ x: 10, y: 10 }]);
  assert.deepEqual(chandelierPositionsFt(60, 20), [{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 50, y: 10 }]);
  assert.deepEqual(bistroZigZagPointsFt(20, 10), [
    { x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 10 }, { x: 15, y: 5 }, { x: 20, y: 0 },
  ]);
});

test('tent setup summary helpers create stable setup and inventory records', () => {
  assert.equal(tentDisplayNameFromSize(20, 30), '20x30 Tent');
  assert.equal(tentDisplayNameFromSize(0, 30), 'Tent');
  assert.deepEqual(stableTentSetupValue({ z: 1.23456, a: { b: 2 } }), { a: { b: 2 }, z: 1.235 });
  const bistro = tentAddonSetupEntryFromAttrs({ addonType: 'bistro', attachment: { strings: [[{ x: 0, y: 0 }]] } });
  assert.deepEqual(bistro, { addonType: 'bistro', inventoryName: '', widthFt: 0, lengthFt: 0, diameterFt: 0, weightFootprint: null, attachment: { strings: [[{ x: 0, y: 0 }]] } });
  assert.equal(tentSetupSignatureFromAttrs({ widthFt: 20, heightFt: 30 }, [bistro]), tentSetupSignatureFromAttrs({ heightFt: 30, widthFt: 20 }, [bistro]));
  assert.deepEqual(tentAddonUsageRowsFromRecords([
    { addonType: 'bistro', lengthFt: 26.4 },
    { addonType: 'fan', inventoryName: 'Tent Fan' },
  ]), [{ name: 'Bistro Lights', amount: 26, unit: 'ft' }, { name: 'Tent Fan', amount: 1, unit: 'count' }]);
});

test('tent signatures compare contents regardless of object or item ordering', () => {
  const tent = { widthFt: 20, heightFt: 20 };
  const a = [{ kind: 'table', count: 2 }, { kind: 'chair', count: 8 }];
  const b = [{ count: 8, kind: 'chair' }, { count: 2, kind: 'table' }];
  assert.equal(tentSetupSignatureFromAttrs(tent, [], a), tentSetupSignatureFromAttrs(tent, [], b));
  assert.notEqual(tentSetupSignatureFromAttrs(tent, [], a), tentSetupSignatureFromAttrs(tent, [], [...a, a[0]]));
});

test('layout group inventory ignores names and placement but retains setup differences', () => {
  const attrs = { customType: 'groupedSeating', groupedConfig: { seatingLabel: 'Guests', facing: 'up', rows: 5, cols: 8, chairName: 'Chiavari Chair' }, x: 20, rotation: 0 };
  const original = { nodes: [{ attrs }] };
  const renamed = { nodes: [{ attrs: { ...attrs, x: 800, rotation: 90, groupedConfig: { ...attrs.groupedConfig, seatingLabel: 'VIP', facing: 'left' } } }, { attrs: { customType: 'label', text: 'Decoration' } }] };
  assert.deepEqual(layoutGroupSetupContents(original), layoutGroupSetupContents(renamed));
  const different = structuredClone(original);
  different.nodes[0].attrs.groupedConfig.cols = 9;
  assert.notDeepEqual(layoutGroupSetupContents(original), layoutGroupSetupContents(different));
});

test('layout-group helpers validate persisted templates and replace matching IDs', () => {
  const group = { id: 'group-1', name: 'Head Table', config: { nodes: [{ attrs: {} }] } };
  const tent = { id: 'tent-1', name: 'Tent Setup', config: { kind: 'tentSetup', tent: { width: 20 } } };
  assert.equal(isValidLayoutGroupTemplate(group), true);
  assert.equal(isValidLayoutGroupTemplate({ id: 'empty', name: 'Empty', config: { nodes: [] } }), false);
  assert.deepEqual(validLayoutGroupTemplates([group, null, tent]), [group, tent]);
  assert.deepEqual(mergeLayoutGroupTemplates([group], [{ ...group, name: 'Updated Head Table' }, tent]), [{ ...group, name: 'Updated Head Table' }, tent]);
  assert.equal(isLayoutGroupableNodeType('venue'), false);
  const config = layoutGroupConfigFromSnapshots([
    { type: 'item', json: { attrs: { nodeId: 'table-1', layerId: 'items', x: 100, y: 200 } }, bounds: { x: 90, y: 190, width: 30, height: 20 } },
    { type: 'label', json: { attrs: { nodeId: 'label-1', x: 140, y: 220 } }, bounds: { x: 130, y: 210, width: 20, height: 10 } },
  ]);
  assert.deepEqual(config, {
    nodes: [
      { attrs: { templateSourceNodeId: 'table-1', x: 10, y: 10 } },
      { attrs: { templateSourceNodeId: 'label-1', x: 50, y: 30 } },
    ],
    bounds: { width: 60, height: 30 },
  });
});

test('label helpers identify optional height labels without treating item details as heights', () => {
  assert.equal(isHeightLabelText('High Top Table', '42 H'), true);
  assert.equal(isHeightLabelText('Upright Space Heater', '92 in'), true);
  assert.equal(isHeightLabelText('High Top Table', 'H'), false);
  assert.deepEqual(automaticLabelMeta('High Top Table', '42 H'), { autoGenerated: true, labelKind: 'item-height' });
  assert.deepEqual(automaticLabelMeta('30" Round Cocktail Table', 'H'), { autoGenerated: true, labelKind: 'item-detail' });
  assert.equal(isOptionalHeightLabel({ autoGenerated: true, labelKind: 'item-height' }), true);
  assert.equal(isOptionalHeightLabel({ autoGenerated: true, labelKind: 'item-detail' }), false);
});

test('layer helpers restore required layers while preserving custom layer settings', () => {
  let count = 0;
  const nextLayerId = (kind) => `${kind}-${++count}`;
  assert.deepEqual(defaultLayers().map((layer) => layer.id), ['reference-base', 'subfloor-base', 'venue-base', 'items-base', 'decor-base', 'labels-base']);
  assert.deepEqual(normaliseLayer({ kind: 'unknown', opacity: 4 }, 2, nextLayerId), { id: 'item-1', name: 'Item Layer', kind: 'item', visible: true, locked: false, builtIn: false, opacity: 1, order: 2 });
  const layers = ensureBaseLayers([{ id: 'custom', name: 'Catering', kind: 'item', visible: false, locked: true, opacity: .8 }], nextLayerId);
  assert.equal(layers.length, 7);
  assert.deepEqual(layers.find((layer) => layer.id === 'custom'), { id: 'custom', name: 'Catering', kind: 'item', visible: false, locked: true, builtIn: false, opacity: .8, order: 6 });
  assert.equal(fallbackLayerIdForKind('decor'), 'decor-base');
  assert.equal(fallbackLayerIdForKind('subfloor'), 'subfloor-base');
  assert.equal(layerAcceptsPlacement({ kind: 'item', visible: true, locked: false }, 'item'), true);
  assert.equal(nodeIsSelectable({ selectable: true, customType: 'label', labelMode: 'attached', layer: { visible: true, locked: false } }), true);
  assert.equal(nodeIsSelectable({ selectable: true, customType: 'tentAddon', layer: { visible: true, locked: false }, parentTentExists: false }), false);
});

test('local document helpers recover from invalid storage and preserve creation dates on update', () => {
  const storage = { value: '{', getItem() { return this.value; }, setItem(key, value) { this.value = value; } };
  assert.deepEqual(readLocalDocuments(storage, 'plans'), []);
  const created = upsertLocalDocument([], { title: 'Reception', layout: { items: [] }, now: '2026-08-30T10:00:00Z', nextId: () => 7 });
  assert.equal(created.saved.id, 7);
  writeLocalDocuments(storage, 'plans', created.items);
  const updated = upsertLocalDocument(readLocalDocuments(storage, 'plans'), { id: 7, title: 'Reception revised', layout: { items: [1] }, now: '2026-08-30T11:00:00Z', nextId: () => 8 });
  assert.deepEqual(updated.saved, { id: 7, title: 'Reception revised', layout: { items: [1] }, created_at: '2026-08-30T10:00:00Z', updated_at: '2026-08-30T11:00:00Z' });
});

test('inventory helpers normalize catalog records and units', () => {
  assert.deepEqual(normaliseInventoryDefinition({ display_name: '  High Top ', aliases: ['cocktail', ' '], unit: ' FT ' }, 'tables'), { display_name: '  High Top ', aliases: ['cocktail'], unit: 'ft', sectionId: 'tables', name: 'High Top', id: 'High Top', category: 'tables', hiddenFromPanel: false, labelText: '', notes: '', footprint: null, weightFootprint: null, addonType: '', drawMode: '' });
  assert.equal(inventoryMeasurementIsAssumed({ name: 'Large Cooler' }, [{ name: 'cooler' }]), true);
  assert.equal(inventoryRowUnit('Bistro Lights'), 'ft');
});

test('inventory markup renders limits and workspace reports outside the runtime', () => {
  const helpers = { escapeHtml: (value) => String(value), formatInventoryAmount: (value, unit) => `${value} ${unit}`, formatInventoryUsage: (name, value, unit) => `${value} ${unit}` };
  const rows = [{ name: 'Chair', used: 4, total: 6, remaining: 2, unit: 'count', overLimit: false }];
  assert.match(inventorySummaryTable(rows, { inventoryLimitsEnabled: true, ...helpers }), /Chair/);
  assert.match(inventoryLimitListMarkup(rows, '', helpers), /data-total-input="Chair"/);
  const printHelpers = { ...helpers, visualMarkup: (name) => `<img class="print-item-preview" alt="" data-item="${name}">` };
  const setupLegend = printInventorySummaryMarkup(rows, 'setup-legend', false, printHelpers);
  assert.match(setupLegend, /Setup Legend/);
  assert.match(setupLegend, /print-item-preview/);
  assert.doesNotMatch(setupLegend, /In Event/);
  const eventInfo = printInventorySummaryMarkup(rows, 'event-info', false, printHelpers);
  assert.match(eventInfo, /In Event/);
  assert.match(eventInfo, /print-item-preview/);
});

test('print seating summaries group by setup facts instead of hidden spacing settings', () => {
  const rows = groupChairRowConfigs([
    { chairName: 'Folding Chair', rows: 4, cols: 8, chairCount: 32, seatSpacingFt: 1, rowSpacingFt: 2, facing: 'up' },
    { chairName: 'Folding Chair', rows: 4, cols: 8, chairCount: 32, seatSpacingFt: 2, rowSpacingFt: 4, facing: 'down' },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].count, 2);
  const tables = groupTableSeatingConfigs([
    { tableName: '60 in Round', chairName: 'Chair', chairCount: 8, clearanceFt: 2 },
    { tableName: '60 in Round', chairName: 'Chair', chairCount: 8, clearanceFt: 4 },
  ]);
  assert.equal(tables.length, 1);
});
