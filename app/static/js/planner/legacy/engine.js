import { cloneConfig, normaliseFeet, normaliseNonNegativeInteger, valuesRoughlyMatch } from '../domain/value.js';
import { escapeHtml, formatInventoryAmount, formatInventoryUsage } from '../domain/format.js';
import { clampEndpointToSpan, pointDistanceInFeet, polylineLength } from '../domain/polyline.js';
import {
  pointsBounds,
  polygonSelfIntersects,
  rectanglePoints,
  rectangleTouchesPolygon,
} from '../domain/polygon.js';
import {
  distributeAlongSpan,
  distributeRectChairCounts,
  chairRowsAisleGapIndex,
  chairRowsAisleVisualBounds,
  chairRowsGapCenterFt,
  chairRowsNearestAvailableGap,
  normaliseChairRowsAisles,
} from '../domain/seating.js';
import {
  arcPoints,
  buildVectorShape,
  circleFromArcPoints,
  normaliseDegrees,
  rotatePoints,
} from '../domain/shapes.js';
import { stagePanelParts } from '../domain/stage.js';
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
  worldPointToTentLocalPoint,
} from '../domain/tent.js';
import { bistroZigZagPointsFt, chandelierPositionsFt } from '../domain/lights.js';
import {
  stableTentSetupValue,
  tentAddonSetupEntryFromAttrs,
  tentAddonUsageRowsFromRecords,
  tentDisplayNameFromSize,
  tentSetupSignatureFromAttrs,
} from '../domain/tent-summary.js';
import { drawTentLegDrape, drawTentLightRun, drawTentSidewallSegment } from '../features/tent/render.js';
import { isLayoutGroupableNodeType, layoutGroupConfigFromSnapshots, mergeLayoutGroupTemplates as mergeLayoutGroupTemplateLists, validLayoutGroupTemplates } from '../domain/layout-groups.js';
import { automaticLabelMeta, isOptionalHeightLabel as hasOptionalHeightLabel } from '../domain/labels.js';
import { updateLabelNodeLayout } from '../features/labels/render.js';
import { defaultLayers as defaultLayerConfigs, ensureBaseLayers as repairLayers, fallbackLayerIdForKind, layerAcceptsPlacement as layerAllowsPlacement, nodeIsSelectable } from '../domain/layers.js';
import { readLocalDocuments as readStoredDocuments, upsertLocalDocument, writeLocalDocuments as writeStoredDocuments } from '../domain/documents.js';
import { inventoryMeasurementIsAssumed, inventoryRowUnit as defaultInventoryRowUnit, normaliseInventoryDefinition as normaliseCatalogDefinition } from '../domain/inventory.js';
import { constrainRoomAttachmentDrag as constrainRoomAttachment, resolveRoomAttachmentComponent, roomAttachmentClamp as clampRoomAttachment, roomAttachmentComponents as roomComponents, roomAttachmentList as normaliseRoomAttachments, roomAttachmentPoint as roomAttachmentPosition, roomAttachmentWorldPoint as attachmentWorldPoint, roomWall as roomWallGeometry, roomWallInteriorSide as roomInteriorSide } from '../domain/room-attachments.js';
import { renderRoomAttachments, renderRoomWalls as drawRoomWalls } from '../features/rooms/render.js';
import { inventoryLimitListMarkup, inventorySummaryTable as inventorySummaryTableMarkup, printInventorySummaryMarkup } from '../features/inventory/markup.js';
import { mergeCustomTemplateRecords, readCustomInventoryItems as readStoredCustomInventoryItems, readCustomVenueTemplates as readStoredCustomVenueTemplates } from '../domain/custom-library.js';
import { createRoomAttachmentControls } from '../features/rooms/attachments.js';
import { createRoomAttachmentPlacement } from '../features/rooms/placement.js';
import { clampReferenceCrop as constrainReferenceCrop, referenceSetupDisplay as referenceCanvasDisplay, referenceSetupPoint as referenceCanvasPoint, renderReferenceSetupCanvas } from '../features/reference/canvas.js';
import { loadReferenceImage as loadReferenceSourceImage, readFileAsDataUrl as readReferenceFileDataUrl, referenceFileDataUrl as decodeReferenceFile } from '../features/reference/source.js';
import { calibrationFactor as calculateCalibrationFactor, referenceSetupDimensions as calculateReferenceSetupDimensions } from '../domain/reference.js';
import { placeArmedObject as dispatchArmedPlacement } from '../features/placement/dispatch.js';
import { placementPayloadFromInventoryButton } from '../features/placement/payload.js';
import { createFenceChain as buildFenceChain, renderFenceGeometry as drawFenceGeometry } from '../features/fence/render.js';
import { fenceConstrainEndpoint as constrainFenceEndpoint, fenceInventoryRows as calculateFenceInventoryRows, fencePointKey as fenceKey } from '../domain/fence.js';
import { createDrawnRunNode as buildDrawnRunNode, renderDrawnRunGeometry as drawDrawnRunGeometry } from '../features/lights/drawn-run.js';
import { panView, resetView, rotateView, zoomView } from '../features/navigation/view.js';
import {
  clampStageAddonNode as constrainStageAddon,
  closestStageForAddonPlacement as findClosestStageForAddonPlacement,
  createStageAddonNode as buildStageAddonNode,
  stageAddonEdge as findStageAddonEdge,
  syncStageAddonsForStage as syncStageAddons,
} from '../features/stage/addons.js';
import {
  renderCustomInventoryItems as drawCustomInventoryItems,
  renderCustomVenueButtons as drawCustomVenueButtons,
  renderLayoutGroupButtons as drawLayoutGroupButtons,
} from '../features/custom-library/render.js';

/*
 * Event Floor Planner — stable build (copy/paste fix)
 *
 * This version preserves all existing features from the previous stable build:
 * - Clear separation of groups (grid / venues / items / UI) within a single world group so zoom/pan/rotation apply uniformly.
 * - Venue lock actually disables interaction (draggable + listening) and keeps venues behind items; unlock restores interaction.
 * - Selection: click, shift-click, and drag-to-select (marquee) across items & venues (venues only when unlocked). Clicking background clears selection.
 * - Multi-select group move: drag any selected shape to move all selected together; on drag end, snap all to grid (when Snap is on and Shift is not held).
 * - Rotation snapping respects Snap toggle (15° steps when Snap on, free when off).
 * - Save/Load unchanged in schema; works with new logic.
 * - Copy/Paste: pasted items behave like independent originals; saved layout groups
 *   remain groups only when a saved group itself is copied.
 */

export function startLegacyPlanner() {
  const plannerBoot = (window.floorplannerBoot && typeof window.floorplannerBoot === 'object') ? window.floorplannerBoot : {};
  const plannerMode = plannerBoot.mode || 'admin';
  const plannerIsSetupMode = plannerMode === 'setup';
  const plannerBootDocumentId = Number.isFinite(Number(plannerBoot.document_id)) ? Number(plannerBoot.document_id) : null;
  const plannerBootLoadUrl = plannerBoot.load_url || '';
  const plannerBootSaveUrl = plannerBoot.save_url || '';
  const LOCAL_DOCUMENTS_KEY = 'event-floorplanner:documents:v1';
  const CUSTOM_VENUES_KEY = 'event-floorplanner:custom-venues:v1';
  const CUSTOM_ITEMS_KEY = 'event-floorplanner:custom-items:v1';
  const LAYOUT_GROUPS_KEY = 'event-floorplanner:layout-groups:v1';
  const LAYOUT_GROUP_DELETIONS_KEY = 'event-floorplanner:layout-group-deletions:v1';
  const STANDALONE_BISTRO_MAX_SPAN_FT = 60;
  const INVENTORY_CATALOG_VERSION = '20260905-inventory-cleanup-v2';

  // DOM refs
  const stageContainer = document.getElementById('stageContainer');
  const selectBtn = document.getElementById('selectBtn');
  const panBtn = document.getElementById('panBtn');
  const copyBtn = document.getElementById('copyBtn');
  const pasteBtn = document.getElementById('pasteBtn');
  const deleteBtn = document.getElementById('deleteBtn');
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  const saveGroupBtn = document.getElementById('saveGroupBtn');
  const ungroupBtn = document.getElementById('ungroupBtn');
  const labelToolBtn = document.getElementById('labelToolBtn');
  const editLabelBtn = document.getElementById('editLabelBtn');
  const venueToggleBtn = document.getElementById('venueToggleBtn');
  const labelsToggleBtn = document.getElementById('labelsToggleBtn');
  const inventoryKeyBtn = document.getElementById('inventoryKeyBtn');
  const inventoryKeyRefreshBtn = document.getElementById('inventoryKeyRefreshBtn');
  const layersBtn = document.getElementById('layersBtn');
  const gridToggle = document.getElementById('gridToggle');
  const snapToggle = document.getElementById('snapToggle');
  const snapToolbarBtn = document.getElementById('snapToolbarBtn');
  const darkModeToggle = document.getElementById('darkModeToggle');
  const itemHeightsToggle = document.getElementById('itemHeightsToggle');
  const uiScaleInput = document.getElementById('uiScale');
  const uiScaleValueEl = document.getElementById('uiScaleValue');
  const settingsMenuItem = document.getElementById('settingsMenuItem');
  const settingsPanel = document.getElementById('settingsPanel');
  const settingsCloseBtn = document.getElementById('settingsCloseBtn');
  const newPlannerMenuItem = document.getElementById('newPlannerMenuItem');
  const openPlannerMenuItem = document.getElementById('openPlannerMenuItem');
  const savePlannerMenuItem = document.getElementById('savePlannerMenuItem');
  const renamePlannerMenuItem = document.getElementById('renamePlannerMenuItem');
  const importPlannerMenuItem = document.getElementById('importPlannerMenuItem');
  const exportPlannerMenuItem = document.getElementById('exportPlannerMenuItem');
  const importInput = document.getElementById('importInput');
  const printPlannerMenuItem = document.getElementById('printPlannerMenuItem');
  const downloadAnchor = document.getElementById('downloadAnchor');
  const gridSizeInput = document.getElementById('gridSize');
  const snapDistanceInput = document.getElementById('snapDistance');
  const snapDistanceValueEl = document.getElementById('snapDistanceValue');
  const chairRowsChairTypeEl = document.getElementById('chairRowsChairType');
  const chairRowsModeEl = document.getElementById('chairRowsMode');
  const chairRowsTotalEl = document.getElementById('chairRowsTotal');
  const chairRowsTotalFieldEl = document.getElementById('chairRowsTotalField');
  const chairRowsCountRowsEl = document.getElementById('chairRowsCountRows');
  const chairRowsCountColsEl = document.getElementById('chairRowsCountCols');
  const chairRowsSeatSpacingEl = document.getElementById('chairRowsSeatSpacing');
  const chairRowsRowSpacingEl = document.getElementById('chairRowsRowSpacing');
  const chairRowsFacingEl = document.getElementById('chairRowsFacing');
  const chairRowsAisleDistanceEl = document.getElementById('chairRowsAisleDistance');
  const chairRowsAisleDirectionEl = document.getElementById('chairRowsAisleDirection');
  const chairRowsAddAisleBtn = document.getElementById('chairRowsAddAisleBtn');
  const chairRowsPlaceBtn = document.getElementById('chairRowsPlaceBtn');
  const tableSeatingTableTypeEl = document.getElementById('tableSeatingTableType');
  const tableSeatingChairTypeEl = document.getElementById('tableSeatingChairType');
  const tableSeatingChairCountEl = document.getElementById('tableSeatingChairCount');
  const tableSeatingClearanceEl = document.getElementById('tableSeatingClearance');
  const cocktailHeightModeFieldEl = document.getElementById('cocktailHeightModeField');
  const cocktailHeightModeToggleEl = document.getElementById('cocktailHeightModeToggle');
  const tableChairPatternFieldEl = document.getElementById('tableChairPatternField');
  const tableChairPatternToggleEl = document.getElementById('tableChairPatternToggle');
  const tableSeatingCapacityEl = document.getElementById('tableSeatingCapacity');
  const tableSeatingPlaceBtn = document.getElementById('tableSeatingPlaceBtn');
  const plannerTitleEl = document.getElementById('plannerTitle');
  const printLayout = document.getElementById('printLayout');
  const printTitleEl = document.getElementById('printTitle');
  const printNoteEl = document.getElementById('printNote');
  const printModifiedEl = document.getElementById('printModified');
  const printTentSetupSummaryEl = document.getElementById('printTentSetupSummary');
  const printPipeDrapeSummaryEl = document.getElementById('printPipeDrapeSummary');
  const printFenceRunsSummaryEl = document.getElementById('printFenceRunsSummary');
  const printLightRunsSummaryEl = document.getElementById('printLightRunsSummary');
  const printFlooringSummaryEl = document.getElementById('printFlooringSummary');
  const printSeatingSummaryEl = document.getElementById('printSeatingSummary');
  const printInventorySummaryEl = document.getElementById('printInventorySummary');
  const printNotesSummaryEl = document.getElementById('printNotesSummary');
  const printImageEl = document.getElementById('printImage');
  const printPageStyle = document.getElementById('printPageStyle');
  const printMapOverlay = document.getElementById('printMapOverlay');
  const printKeySidebar = document.getElementById('printKeySidebar');
  const printKeyBelow = document.getElementById('printKeyBelow');
  const printKeyContent = document.getElementById('printKeyContent');
  const printKeySheet = document.getElementById('printKeySheet');
  const printKeyPageContent = document.getElementById('printKeyPageContent');
  const printSetupLegendPageContent = document.getElementById('printSetupLegendPageContent');
  const printKeyPageTitle = document.getElementById('printKeyPageTitle');
  const printKeyPageModified = document.getElementById('printKeyPageModified');
  const printPreferencesModal = document.getElementById('printPreferencesModal');
  const printPreferencesClose = document.getElementById('printPreferencesClose');
  const printPreferencesCancel = document.getElementById('printPreferencesCancel');
  const printPreferencesPrint = document.getElementById('printPreferencesPrint');
  const printPreferencesPrintAll = document.getElementById('printPreferencesPrintAll');
  const printPreferencesStatus = document.getElementById('printPreferencesStatus');
  const printPreferencesSubLabel = document.getElementById('printPreferencesSubLabel');
  const printPreferencesNotes = document.getElementById('printPreferencesNotes');
  const printLayoutMapOnly = document.getElementById('printLayoutMapOnly');
  const printLayoutMapKey = document.getElementById('printLayoutMapKey');
  const printSetupMapOptions = document.getElementById('printSetupMapOptions');
  const printSetupLegend = document.getElementById('printSetupLegend');
  const printSetupLegendPage = document.getElementById('printSetupLegendPage');
  const printMapKeyOptions = document.getElementById('printMapKeyOptions');
  const printKeySamePage = document.getElementById('printKeySamePage');
  const printOrientationLandscape = document.getElementById('printOrientationLandscape');
  const printOrientationPortrait = document.getElementById('printOrientationPortrait');
  const printSectionOptions = document.getElementById('printSectionOptions');
  const printSectionPicker = document.getElementById('printSectionPicker');
  const printSectionEmpty = document.getElementById('printSectionEmpty');
  const printPreview = document.getElementById('printPreview');
  const printPreviewTitle = document.getElementById('printPreviewTitle');
  const printPreviewSubLabel = document.getElementById('printPreviewSubLabel');
  const printPreviewImage = document.getElementById('printPreviewImage');
  const printPreviewKey = document.getElementById('printPreviewKey');
  const printPreviewContinuation = document.getElementById('printPreviewContinuation');
  const printPreviewContinuationTitle = document.getElementById('printPreviewContinuationTitle');
  const printPreviewContinuationKey = document.getElementById('printPreviewContinuationKey');
  const printPreviewStatus = document.getElementById('printPreviewStatus');
  const printPreviewRefresh = document.getElementById('printPreviewRefresh');
  const plannerStatusEl = document.getElementById('plannerStatus');
  const plannerModeHintEl = document.getElementById('plannerModeHint');
  const plannerLibraryPanel = document.getElementById('plannerLibraryPanel');
  const plannerLibraryList = document.getElementById('plannerLibraryList');
  const plannerLibraryClose = document.getElementById('plannerLibraryClose');
  const inventorySectionsContainer = document.getElementById('inventorySections');
  const inventorySearch = document.getElementById('inventorySearch');
  const layoutGroupsList = document.getElementById('layoutGroupsList');
  const layoutGroupNameModal = document.getElementById('layoutGroupNameModal');
  const layoutGroupNameForm = document.getElementById('layoutGroupNameForm');
  const layoutGroupNameTitle = document.getElementById('layoutGroupNameTitle');
  const layoutGroupNameInput = document.getElementById('layoutGroupNameInput');
  const layoutGroupNameClose = document.getElementById('layoutGroupNameClose');
  const layoutGroupNameCancel = document.getElementById('layoutGroupNameCancel');
  const labelTextModal = document.getElementById('labelTextModal');
  const labelTextForm = document.getElementById('labelTextForm');
  const labelTextTitle = document.getElementById('labelTextTitle');
  const labelTextSubtitle = document.getElementById('labelTextSubtitle');
  const labelTextInput = document.getElementById('labelTextInput');
  const labelTextSize = document.getElementById('labelTextSize');
  const labelTextColor = document.getElementById('labelTextColor');
  const labelTextBold = document.getElementById('labelTextBold');
  const labelTextItalic = document.getElementById('labelTextItalic');
  const labelTextBorder = document.getElementById('labelTextBorder');
  const labelTextCopy = document.getElementById('labelTextCopy');
  const labelTextClose = document.getElementById('labelTextClose');
  const labelTextCancel = document.getElementById('labelTextCancel');
  const inventoryKeyPanel = document.getElementById('inventoryKeyPanel');
  const inventoryKeyCloseBtn = document.getElementById('inventoryKeyCloseBtn');
  const inventoryKeySummary = document.getElementById('inventoryKeySummary');
  const inventoryKeyTentSetups = document.getElementById('inventoryKeyTentSetups');
  const inventoryKeyTentSetupsSection = document.getElementById('inventoryKeyTentSetupsSection');
  const inventoryKeyPipeDrape = document.getElementById('inventoryKeyPipeDrape');
  const inventoryKeyPipeDrapeSection = document.getElementById('inventoryKeyPipeDrapeSection');
  const inventoryKeyFenceRuns = document.getElementById('inventoryKeyFenceRuns');
  const inventoryKeyFenceRunsSection = document.getElementById('inventoryKeyFenceRunsSection');
  const inventoryKeyLightRuns = document.getElementById('inventoryKeyLightRuns');
  const inventoryKeyLightRunsSection = document.getElementById('inventoryKeyLightRunsSection');
  const inventoryKeyFlooring = document.getElementById('inventoryKeyFlooring');
  const inventoryKeyFlooringSection = document.getElementById('inventoryKeyFlooringSection');
  const inventoryKeySeating = document.getElementById('inventoryKeySeating');
  const inventoryKeySeatingSection = document.getElementById('inventoryKeySeatingSection');
  const lightRunsPrintToggle = document.getElementById('lightRunsPrintToggle');
  const flooringPrintToggle = document.getElementById('flooringPrintToggle');
  const seatingPrintToggle = document.getElementById('seatingPrintToggle');
  const pipeDrapePrintToggle = document.getElementById('pipeDrapePrintToggle');
  const fenceRunsPrintToggle = document.getElementById('fenceRunsPrintToggle');
  const tentSetupsPrintToggle = document.getElementById('tentSetupsPrintToggle');
  const inventoryKeyList = document.getElementById('inventoryKeyList');
  const inventoryKeyFilter = document.getElementById('inventoryKeyFilter');
  const inventoryPrintToggle = document.getElementById('inventoryPrintToggle');
  const inventoryLimitsToggle = document.getElementById('inventoryLimitsToggle');
  const inventoryFullSection = document.getElementById('inventoryFullSection');
  const inventoryTotalsClearBtn = document.getElementById('inventoryTotalsClearBtn');
  const layersPanel = document.getElementById('layersPanel');
  const layersList = document.getElementById('layersList');
  const layersCloseBtn = document.getElementById('layersCloseBtn');
  const addItemLayerBtn = document.getElementById('addItemLayerBtn');
  const addVenueLayerBtn = document.getElementById('addVenueLayerBtn');
  const addReferenceImageBtn = document.getElementById('addReferenceImageBtn');
  const referenceImageInput = document.getElementById('referenceImageInput');
  const referenceSetupModal = document.getElementById('referenceSetupModal');
  const referenceSetupTitle = document.getElementById('referenceSetupTitle');
  const referenceSetupSubtitle = document.getElementById('referenceSetupSubtitle');
  const referenceSetupCanvas = document.getElementById('referenceSetupCanvas');
  const referenceSetupStatus = document.getElementById('referenceSetupStatus');
  const referenceSetupZoomOut = document.getElementById('referenceSetupZoomOut');
  const referenceSetupZoomIn = document.getElementById('referenceSetupZoomIn');
  const referenceSetupRotation = document.getElementById('referenceSetupRotation');
  const referenceSetupRotationValue = document.getElementById('referenceSetupRotationValue');
  const referenceSetupZoomValue = document.getElementById('referenceSetupZoomValue');
  const referenceSetupOpacityWrap = document.getElementById('referenceSetupOpacityWrap');
  const referenceSetupOpacity = document.getElementById('referenceSetupOpacity');
  const referenceSetupOpacityValue = document.getElementById('referenceSetupOpacityValue');
  const referenceSetupResetFrame = document.getElementById('referenceSetupResetFrame');
  const referenceSetupAutoScale = document.getElementById('referenceSetupAutoScale');
  const referenceSetupManualBtn = document.getElementById('referenceSetupManualBtn');
  const referenceSetupManualControls = document.getElementById('referenceSetupManualControls');
  const referenceSetupDistance = document.getElementById('referenceSetupDistance');
  const referenceSetupManualApply = document.getElementById('referenceSetupManualApply');
  const referenceSetupPixelsPerFoot = document.getElementById('referenceSetupPixelsPerFoot');
  const referenceSetupDirectScaleApply = document.getElementById('referenceSetupDirectScaleApply');
  const referenceSetupFitGrid = document.getElementById('referenceSetupFitGrid');
  const referenceSetupApply = document.getElementById('referenceSetupApply');
  const referenceSetupCancel = document.getElementById('referenceSetupCancel');
  const referenceSetupClose = document.getElementById('referenceSetupClose');
  const plannerInitError = document.getElementById('plannerInitError');
  const inventoryPanel = document.getElementById('inventoryPanel');
  const venuesPanel = document.getElementById('venuesPanel');
  const inventoryPanelTab = document.getElementById('inventoryPanelTab');
  const venuesPanelTab = document.getElementById('venuesPanelTab');
  const labelGearBtn = document.getElementById('labelGearBtn');
  const buildVenueBtn = document.getElementById('buildVenueBtn');
  const buildInventoryItemBtn = document.getElementById('buildInventoryItemBtn');
  const customInventoryList = document.getElementById('customInventoryList');
  const exportCustomDataBtn = document.getElementById('exportCustomDataBtn');
  const importCustomDataBtn = document.getElementById('importCustomDataBtn');
  const importCustomDataInput = document.getElementById('importCustomDataInput');
  const exportCustomVenuesBtn = document.getElementById('exportCustomVenuesBtn');
  const importCustomVenuesBtn = document.getElementById('importCustomVenuesBtn');
  const importCustomVenuesInput = document.getElementById('importCustomVenuesInput');
  const customVenuesList = document.getElementById('customVenuesList');
  const venueBuilderPanel = document.getElementById('venueBuilderPanel');
  const venueBuilderClose = document.getElementById('venueBuilderClose');
  const venueBuilderName = document.getElementById('venueBuilderName');
  const venueBuilderImage = document.getElementById('venueBuilderImage');
  const venueBuilderImageStatus = document.getElementById('venueBuilderImageStatus');
  const venueBuilderReferenceControls = document.getElementById('venueBuilderReferenceControls');
  const venueBuilderImageOpacity = document.getElementById('venueBuilderImageOpacity');
  const venueBuilderTrace = document.getElementById('venueBuilderTrace');
  const venueBuilderSelect = document.getElementById('venueBuilderSelect');
  const venueBuilderRectangle = document.getElementById('venueBuilderRectangle');
  const venueBuilderCircle = document.getElementById('venueBuilderCircle');
  const venueBuilderArc = document.getElementById('venueBuilderArc');
  const venueBuilderLine = document.getElementById('venueBuilderLine');
  const venueBuilderDoor = document.getElementById('venueBuilderDoor');
  const venueBuilderOpening = document.getElementById('venueBuilderOpening');
  const venueBuilderDeleteWall = document.getElementById('venueBuilderDeleteWall');
  const venueBuilderEraser = document.getElementById('venueBuilderEraser');
  const venueBuilderVenueControls = document.getElementById('venueBuilderVenueControls');
  const venueBuilderVenueControlsTitle = document.getElementById('venueBuilderVenueControlsTitle');
  const venueBuilderPan = document.getElementById('venueBuilderPan');
  const venueBuilderZoomIn = document.getElementById('venueBuilderZoomIn');
  const venueBuilderZoomOut = document.getElementById('venueBuilderZoomOut');
  const venueBuilderResetView = document.getElementById('venueBuilderResetView');
  const venueBuilderReferenceSetup = document.getElementById('venueBuilderReferenceSetup');
  const venueBuilderHint = document.getElementById('venueBuilderHint');
  const venueBuilderUndo = document.getElementById('venueBuilderUndo');
  const venueBuilderClear = document.getElementById('venueBuilderClear');
  const venueBuilderSave = document.getElementById('venueBuilderSave');
  const venueBuilderPoints = document.getElementById('venueBuilderPoints');
  const venueBuilderCanvas = document.getElementById('venueBuilderCanvas');
  const venueBuilderTitle = document.getElementById('venueBuilderTitle');
  const customItemBuilderOptions = document.getElementById('customItemBuilderOptions');
  const customItemHeight = document.getElementById('customItemHeight');
  const customItemHanging = document.getElementById('customItemHanging');
  const customItemSnap = document.getElementById('customItemSnap');
  const venueBuilderDimensionEditor = document.getElementById('venueBuilderDimensionEditor');
  const venueBuilderDimensionLabel = document.getElementById('venueBuilderDimensionLabel');
  const venueBuilderDimensionInput = document.getElementById('venueBuilderDimensionInput');
  const venueBuilderDimensionApply = document.getElementById('venueBuilderDimensionApply');
  const venueBuilderDimensionCancel = document.getElementById('venueBuilderDimensionCancel');
  const venueBuilderSnapOption = document.getElementById('venueBuilderSnapOption');
  const venueBuilderSnap = document.getElementById('venueBuilderSnap');
  const venueBuilderGridHint = document.getElementById('venueBuilderGridHint');
  const venueBuilderDrawLabel = document.getElementById('venueBuilderDrawLabel');
  const roomDoorTool = document.getElementById('roomDoorTool');
  const roomOpeningTool = document.getElementById('roomOpeningTool');
  const roomAttachmentPopup = document.getElementById('roomAttachmentPopup');
  const roomAttachmentWidth = document.getElementById('roomAttachmentWidth');
  const roomAttachmentSwing = document.getElementById('roomAttachmentSwing');
  const roomAttachmentDelete = document.getElementById('roomAttachmentDelete');
  const roomAttachmentClose = document.getElementById('roomAttachmentClose');

  function showInitError(message) {
    if (plannerInitError) {
      plannerInitError.textContent = message;
      plannerInitError.style.display = 'block';
    }
    console.error(message);
  }

  function collectionToArray(collection) {
    if (!collection) return [];
    if (Array.isArray(collection)) return collection;
    if (typeof collection.toArray === 'function') return collection.toArray();
    try {
      return Array.from(collection);
    } catch (err) {
      return [];
    }
  }

  function setPanelCollapsed(panel, collapsed, options = {}) {
    if (!panel) return;
    const { persist = true } = options;
    panel.classList.toggle('is-collapsed', !!collapsed);
    const button = panel.querySelector('.panel-minimize-btn');
    const icon = button && button.querySelector('i');
    if (icon) {
      icon.classList.toggle('fa-chevron-up', !collapsed);
      icon.classList.toggle('fa-chevron-down', !!collapsed);
    }
    if (button) {
      const name = panel.querySelector('.panel-window-header h6')?.textContent?.trim() || 'panel';
      button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      button.title = `${collapsed ? 'Expand' : 'Collapse'} ${name}`;
    }
    const relatedTab = panel.id === 'inventoryPanel' ? inventoryPanelTab : panel.id === 'venuesPanel' ? venuesPanelTab : null;
    if (relatedTab) relatedTab.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    const panelKey = panel.getAttribute('data-panel-key');
    if (panelKey && persist) {
      try { localStorage.setItem(`floorplanner:panel:${panelKey}:collapsed`, collapsed ? '1' : '0'); } catch { }
    }
  }

  function togglePanelCollapsed(panelId) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    setPanelCollapsed(panel, !panel.classList.contains('is-collapsed'));
  }

  function initPanelMinimizers() {
    document.querySelectorAll('[data-panel-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const panelId = btn.getAttribute('data-panel-toggle');
        if (panelId) togglePanelCollapsed(panelId);
      });
    });

    document.querySelectorAll('.minimizable-panel[data-panel-key]').forEach((panel) => {
      const panelKey = panel.getAttribute('data-panel-key');
      let collapsed = false;
      if (panelKey) {
        try { collapsed = localStorage.getItem(`floorplanner:panel:${panelKey}:collapsed`) === '1'; } catch { }
      }
      setPanelCollapsed(panel, collapsed);
    });
  }

  function isPortraitLibraryDock() {
    return !!(window.matchMedia && window.matchMedia('(max-width: 768px) and (orientation: portrait)').matches);
  }

  function rebuildInventoryDefinitionCache() {
    inventoryDefinitionCache = Array.from(inventoryDefinitionsBySection.values()).flat();
  }

  function normaliseInventoryDefinition(raw, sectionId) {
    return normaliseCatalogDefinition(raw, sectionId);
  }

  function setInventorySectionCache(sectionId, items) {
    const sectionItems = Array.isArray(items) ? items : [];
    inventoryDefinitionsBySection.set(sectionId, sectionItems);
    if (sectionId === 'tables') tableInventoryCache = inventoryDefinitionsBySection.get(sectionId);
    if (sectionId === 'chairs') chairInventoryCache = inventoryDefinitionsBySection.get(sectionId);
    rebuildInventoryDefinitionCache();
  }

  function appendInventoryButton(container, item, sectionId) {
    const appendButton = (label, extraData = {}) => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-outline-secondary btn-sm my-1';
      btn.textContent = label;
      btn.dataset.sectionId = sectionId;
      btn.dataset.type = item.type;
      btn.dataset.familyId = item.id;
      btn.dataset.inventoryCategory = item.category || sectionId;
      btn.dataset.inventorySearch = [label, item.name, item.category, sectionId, ...(item.aliases || [])].join(' ').toLowerCase();
      if (item.width !== undefined) btn.dataset.width = item.width;
      if (item.length !== undefined) {
        btn.dataset.length = item.length;
        btn.dataset.height = item.length;
      }
      if (item.height !== undefined) btn.dataset.height = item.height;
      if (item.diameter !== undefined) btn.dataset.diameter = item.diameter;
      if (item.radius !== undefined) btn.dataset.radius = item.radius;
      if (item.color) btn.dataset.color = item.color;
      if (item.labelText) btn.dataset.labelText = item.labelText;
      if (item.footprint) btn.dataset.footprint = JSON.stringify(item.footprint);
      if (item.weightFootprint) btn.dataset.weightFootprint = JSON.stringify(item.weightFootprint);
      if (item.addonType) btn.dataset.addonType = item.addonType;
      if (item.drawMode) btn.dataset.drawMode = item.drawMode;
      btn.dataset.unit = item.unit || 'ft';
      Object.entries(extraData).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        if (key === 'title') btn.title = String(value);
        else btn.dataset[key] = String(value);
      });
      container.appendChild(btn);
    };

    if (sectionId === 'tables' && item.category === 'cocktail') {
      appendButton(`${item.name} H`, { inventoryName: item.name, cocktailHeightMode: 'H', labelText: 'H', title: 'High top' });
      appendButton(item.name, { inventoryName: item.name, cocktailHeightMode: 'L', labelText: '', title: 'Low top' });
      return;
    }

    const flagged = isInventoryMeasurementAssumed(item);
    appendButton(flagged ? `${item.name} ⚠` : item.name, { inventoryName: item.name, title: flagged ? 'Footprint is an estimate; verify this item before a final site plan.' : '' });
  }

  function isInventoryMeasurementAssumed(item) {
    const backlog = Array.isArray(inventoryCatalogMeta.measurement_backlog) ? inventoryCatalogMeta.measurement_backlog : [];
    return inventoryMeasurementIsAssumed(item, backlog);
  }

  function renderInventorySections(sections) {
    if (!inventorySectionsContainer) return;
    inventorySectionsContainer.innerHTML = '';
    sections.forEach((section) => {
      // Tent attachments belong with their parent venue, rather than in the
      // general inventory palette.
      if (section.id === 'tent_addons') return;
      const details = document.createElement('details');
      details.id = `inventorySection-${section.id}`;
      // Keep the inventory palette compact on first load; each category is opt-in.
      details.open = false;

      const summary = document.createElement('summary');
      summary.textContent = section.title || section.id;
      details.appendChild(summary);

      const container = document.createElement('div');
      container.className = 'btn-group-vertical';
      details.appendChild(container);

      const items = Array.isArray(section.items) ? section.items : [];
      const visibleItems = items.filter((item) => !item.hiddenFromPanel);
      if (section.id === 'pipe_drape') renderPipeDrapePalette(container);
      else if (section.id === 'tables') {
        const tableGroups = [
          { title: 'High Tops', matches: (item) => item.category === 'cocktail' },
          { title: 'Round Tables', matches: (item) => item.type === 'round' && item.category === 'round' },
          { title: 'Rectangle Tables', matches: (item) => item.type === 'table' && ['banquet', 'conference', 'farm', 'card'].includes(item.category) },
          { title: 'Other Tables', matches: (item) => !['cocktail', 'round', 'banquet', 'conference', 'farm', 'card'].includes(item.category) },
        ];
        tableGroups.forEach((group) => {
          const groupItems = visibleItems.filter(group.matches);
          if (!groupItems.length) return;
          const category = document.createElement('details');
          category.className = 'inventory-subcategory';
          category.open = false;
          const categoryTitle = document.createElement('summary');
          categoryTitle.textContent = group.title;
          category.appendChild(categoryTitle);
          const categoryItems = document.createElement('div');
          categoryItems.className = 'btn-group-vertical';
          groupItems.forEach((item) => appendInventoryButton(categoryItems, item, section.id));
          category.appendChild(categoryItems);
          container.appendChild(category);
        });
      }
      else {
        visibleItems.forEach((item) => appendInventoryButton(container, item, section.id));
        if (section.id === 'blocking') renderLightPostPalette(container);
        if (section.id === 'blocking') renderFenceRunPalette(container);
      }

      inventorySectionsContainer.appendChild(details);
    });
    // Keep the quick placement workflow in a predictable order without
    // changing any of the catalog sections themselves.
    const chairs = document.getElementById('inventorySection-chairs');
    const pipeDrape = document.getElementById('inventorySection-pipe_drape');
    const groupedSeating = document.getElementById('groupedSeatingSection');
    const customInventory = document.getElementById('customInventorySection');
    const flooring = document.querySelector('[data-flooring-section]');
    const layoutGroups = document.getElementById('layoutGroupsSection');
    if (chairs && groupedSeating) chairs.after(groupedSeating);
    if (pipeDrape && flooring) pipeDrape.after(flooring);
    if (flooring && customInventory) flooring.after(customInventory);
    if (flooring && layoutGroups) flooring.after(layoutGroups);
    filterInventoryPalette();
  }

  function renderTentAddonVenueTools(sections) {
    const container = document.getElementById('tentAddonsVenueList');
    if (!container) return;
    container.innerHTML = '';
    const section = (Array.isArray(sections) ? sections : []).find((entry) => entry && entry.id === 'tent_addons');
    const items = Array.isArray(section && section.items) ? section.items : [];
    items.filter((item) => !item.hiddenFromPanel).forEach((item) => appendInventoryButton(container, item, 'tent_addons'));
  }

  function filterInventoryPalette() {
    if (!inventorySectionsContainer) return;
    const query = String(inventorySearch && inventorySearch.value || '').trim().toLowerCase();
    const filtering = !!query;
    inventorySectionsContainer.querySelectorAll('details').forEach((section) => {
      const buttons = Array.from(section.querySelectorAll('button[data-inventory-search]'));
      if (filtering && !section.dataset.searchWasOpen) section.dataset.searchWasOpen = section.open ? '1' : '0';
      buttons.forEach((button) => {
        button.hidden = filtering && !button.dataset.inventorySearch.includes(query);
      });
      const hasMatch = !buttons.length || buttons.some((button) => !button.hidden);
      section.hidden = filtering && !hasMatch;
      if (filtering && hasMatch) section.open = true;
      if (!filtering && section.dataset.searchWasOpen !== undefined) {
        section.open = section.dataset.searchWasOpen === '1';
        delete section.dataset.searchWasOpen;
      }
    });
  }

  function renderLightPostPalette(container) {
    const label = document.createElement('label'); label.className = 'small mt-2'; label.textContent = 'Light post height';
    const height = document.createElement('select'); height.className = 'form-select form-select-sm mb-2';
    for (let feet = 7; feet <= 20; feet += 1) { const option = document.createElement('option'); option.value = String(feet); option.textContent = `${feet} ft`; if (feet === 10) option.selected = true; height.appendChild(option); }
    label.appendChild(height); container.appendChild(label);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-outline-secondary btn-sm my-1'; button.textContent = 'Light Post';
    button.addEventListener('click', () => armPlacementTool({ kind: 'item', label: 'Light Post', color: '#59636b', widthFt: 3, lengthFt: 3, rawData: { type: 'item', category: 'lighting', inventoryName: 'Light Post', width: 3, length: 3, color: '#59636b', footprint: { shape: 'light_post', baseFt: 3, pipeDiameterIn: 4 }, lightPostHeightFt: Number(height.value) || 10 } }, button));
    container.appendChild(button);
  }

  function renderPipeDrapePalette(container) {
    const heightLabel = document.createElement('label');
    heightLabel.className = 'small mt-2'; heightLabel.textContent = 'Drape height';
    const height = document.createElement('select'); height.className = 'form-select form-select-sm mb-2'; height.id = 'pipeDrapeHeight';
    for (let feet = 7; feet <= 20; feet += 1) {
      const option = document.createElement('option'); option.value = String(feet); option.textContent = `${feet} ft`;
      if (feet === 10) option.selected = true; height.appendChild(option);
    }
    heightLabel.appendChild(height); container.appendChild(heightLabel);
    [
      { id: 'crossbar_3', name: "3' Crossbar", min: 3, max: 3 },
      { id: 'crossbar_5_7', name: "5'–7' Crossbar", min: 5, max: 7 },
      { id: 'crossbar_6_10', name: "6'–10' Crossbar", min: 6, max: 10 },
      { id: 'crossbar_7_12', name: "7'–12' Crossbar", min: 7, max: 12 },
    ].forEach((tool) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-outline-secondary btn-sm my-1';
      button.textContent = tool.name; button.title = `Draw a Pipe & Drape chain with ${tool.min === tool.max ? `${tool.min} ft` : `${tool.min}–${tool.max} ft`} spans.`;
      button.addEventListener('click', () => armPipeDrapePlacement({ ...tool, heightFt: Number(height.value) || 10 }, button)); container.appendChild(button);
    });
    const hint = document.createElement('div'); hint.className = 'small text-muted mt-1'; hint.textContent = 'Click bases to continue; Shift-click undoes the last base; double-click finishes.'; container.appendChild(hint);
  }

  function renderFenceRunPalette(container) {
    [4, 8].forEach((panelLengthFt) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-outline-secondary btn-sm my-1';
      button.textContent = `${panelLengthFt} ft Fence Run`; button.title = `Draw connected 3 ft fence panels in exact ${panelLengthFt} ft sections.`;
      button.addEventListener('click', () => armPlacementTool({ kind: 'fenceChain', panelLengthFt, label: `${panelLengthFt} ft Fence Run` }, button));
      container.appendChild(button);
    });
  }

  // --- Dynamic inventory loader (for static JSON data) ---
  async function loadInventoryCatalog() {
    try {
      const res = await fetch(`/static/data/inventory/catalog.json?v=${INVENTORY_CATALOG_VERSION}`);
      if (!res.ok) throw new Error('inventory catalog not found');
      const data = await res.json();
      let footprintByTitle = new Map();
      try {
        const footprintResp = await fetch('/api/inventory/catalog');
        if (footprintResp.ok) {
          const footprintData = await footprintResp.json();
          footprintByTitle = new Map(
            (Array.isArray(footprintData.items) ? footprintData.items : []).map((item) => [
              String(item.title || '').trim(),
              item.footprint || null,
            ])
          );
        }
      } catch (err) {
        console.warn('Inventory footprint API unavailable:', err);
      }
      const sections = Array.isArray(data.sections) ? data.sections : [];
      inventoryCatalogMeta = data;
      inventoryDefinitionsBySection.clear();
      sections.forEach((section) => {
        const items = Array.isArray(section.items)
          ? section.items.map((item) => normaliseInventoryDefinition({
              ...item,
              footprint: footprintByTitle.get(String(item.name || '').trim()) || item.footprint || null,
            }, section.id)).filter(Boolean)
          : [];
        setInventorySectionCache(section.id, items);
      });
      renderInventorySections(sections.map((section) => ({
        ...section,
        items: inventoryDefinitionsBySection.get(section.id) || [],
      })));
      renderTentAddonVenueTools(sections.map((section) => ({
        ...section,
        items: inventoryDefinitionsBySection.get(section.id) || [],
      })));
    } catch (err) {
      console.error('Error loading inventory catalog:', err);
      inventoryCatalogMeta = { sections: [] };
      inventoryDefinitionsBySection.clear();
      tableInventoryCache = [];
      chairInventoryCache = [];
      rebuildInventoryDefinitionCache();
      if (inventorySectionsContainer) {
        inventorySectionsContainer.innerHTML = '<div class="small text-danger mb-2">Could not load inventory catalog.</div>';
      }
    }
  }

  function normaliseInventoryTotalValue(value) {
    return normaliseNonNegativeInteger(value);
  }

  function getInventoryCatalog() {
    const seen = new Set();
    const items = [];
    inventoryDefinitionCache.forEach((entry) => {
      if (!entry || !entry.name || seen.has(entry.name)) return;
      seen.add(entry.name);
      items.push(entry.name);
    });
    return items;
  }

  function findInventoryDefinitionForNode(node) {
    if (!(node && node.getAttr)) return null;
    const explicit = String(node.getAttr('inventoryName') || '').trim();
    if (explicit) {
      const explicitMatch = inventoryDefinitionCache.find((entry) => (
        entry && (entry.name === explicit || entry.aliases.includes(explicit))
      ));
      if (explicitMatch) return explicitMatch;
    }

    const itemType = node.getAttr('itemType');
    const widthFt = Number(node.getAttr('widthFt'));
    const lengthFt = Number(node.getAttr('lengthFt'));
    const diameterFt = Number(node.getAttr('diameterFt'));

    return inventoryDefinitionCache.find((entry) => {
      if (!entry) return false;
      const entryType = entry.type || 'table';
      if ((entryType === 'round' || entryType === 'halfround') && Number.isFinite(Number(entry.diameter))) {
        return itemType === entryType && valuesRoughlyMatch(diameterFt, Number(entry.diameter));
      }
      return itemType === entryType
        && valuesRoughlyMatch(widthFt, Number(entry.width))
        && valuesRoughlyMatch(lengthFt, Number(entry.length));
    }) || null;
  }

  function inferInventoryNameForNode(node) {
    const match = findInventoryDefinitionForNode(node);
    return match && match.name ? match.name : '';
  }

  function findInventoryDefinitionForPrintName(name) {
    const target = String(name || '').trim().toLowerCase();
    if (!target) return null;
    return inventoryDefinitionCache.find((entry) => {
      if (!entry) return false;
      if (String(entry.name || '').trim().toLowerCase() === target) return true;
      return (Array.isArray(entry.aliases) ? entry.aliases : []).some((alias) => String(alias || '').trim().toLowerCase() === target);
    }) || null;
  }

  function representativeNodeForPrintItem(name) {
    const target = String(name || '').trim().toLowerCase();
    let match = null;
    forEachNode((node) => {
      if (match || !(node && node.getAttr)) return;
      const customType = node.getAttr('customType');
      if (customType === 'venue' && node.getAttr('venueType') === 'tent') {
        if (tentDisplayName(node).toLowerCase() === target) match = node;
        return;
      }
      if (customType === 'tentAddon') {
        const addonName = isBistroLightAddon(node) ? 'Bistro Lights' : (node.getAttr('inventoryName') || node.getAttr('addonType') || 'Tent add-on');
        if (String(addonName).trim().toLowerCase() === target) match = node;
        return;
      }
      if (customType === 'drawnRun') {
        const runName = node.getAttr('drawMode') === 'bistro' ? 'Bistro Lights' : (node.getAttr('inventoryName') || 'Run');
        if (String(runName).trim().toLowerCase() === target || (/bistro/.test(target) && node.getAttr('drawMode') === 'bistro')) match = node;
        return;
      }
      if (customType === 'pipeDrapeChain' && (/pipe\s*&?\s*drape|crossbar|upright|drape panels|drape bases/i.test(target))) { match = node; return; }
      if (customType === 'fenceChain' && /fence/i.test(target)) { match = node; return; }
      if (customType === 'stageAddon' && String(node.getAttr('inventoryName') || node.getAttr('addonType') || '').trim().toLowerCase() === target) { match = node; return; }
      if (node.getAttr('isFlooring')) {
        const detail = flooringInventoryDetails(node);
        if (detail && ((detail.rows || []).some((row) => String(row.name || '').trim().toLowerCase() === target) || [detail.key, detail.summary].some((value) => String(value || '').trim().toLowerCase() === target))) match = node;
        return;
      }
      if (customType === 'groupedSeating') {
        const config = node.getAttr('groupedConfig') || {};
        if ([config.chairName, config.effectiveChairName, config.tableName].some((value) => String(value || '').trim().toLowerCase() === target)) match = node;
        return;
      }
      if (customType === 'item') {
        const itemName = node.getAttr('inventoryName') || inferInventoryNameForNode(node);
        if (String(itemName || '').trim().toLowerCase() === target) match = node;
      }
    });
    return match;
  }

  function compactRunPreviewNode(name, representative) {
    const target = String(name || '').toLowerCase();
    const customType = representative && representative.getAttr ? representative.getAttr('customType') : '';
    if (/bistro|perimeter light|light run|string light/.test(target)) {
      return createDrawnRunNode({ drawMode: 'bistro', inventoryName: name, color: representative && representative.getAttr && representative.getAttr('addonColor') || '#f1c75b' }, [{ x: 0, y: 0 }, { x: FEET_TO_PX * 10, y: 0 }]);
    }
    if (customType === 'pipeDrapeChain' || /pipe\s*&?\s*drape|crossbar|upright|drape panels|drape bases/.test(target)) {
      const spanFt = Math.max(1, Number(representative && representative.getAttr && representative.getAttr('crossbarMinFt')) || 3);
      const node = new Konva.Group({ listening: false, name: 'printPipeDrapePreview' });
      node.setAttrs({ customType: 'pipeDrapeChain', nodeId: 'print-pipe-drape-preview', pipeDrapeRunOrder: -1, pipeDrapePoints: [{ x: 0, y: 0 }, { x: spanFt * FEET_TO_PX, y: 0 }] });
      renderPipeDrapeGeometry(node);
      return node;
    }
    if (customType === 'fenceChain' || /fence/.test(target)) {
      const spanFt = Math.max(1, Number(representative && representative.getAttr && representative.getAttr('fencePanelLengthFt')) || (/4/.test(target) ? 4 : 8));
      const node = new Konva.Group({ listening: false, name: 'printFencePreview' });
      node.setAttrs({ customType: 'fenceChain', nodeId: 'print-fence-preview', fenceRunOrder: -1, fencePoints: [{ x: 0, y: 0 }, { x: spanFt * FEET_TO_PX, y: 0 }] });
      renderFenceGeometry(node);
      return node;
    }
    return null;
  }

  function catalogItemPreviewNode(definition) {
    if (!definition || definition.addonType || definition.drawMode) return null;
    return createItem({ ...definition, unit: 'ft', inventoryName: definition.name, familyId: definition.id, footprint: cloneConfig(definition.footprint) });
  }

  function printNodeDataUrl(node) {
    if (!(node && typeof node.toDataURL === 'function')) return '';
    try {
      const bounds = node.getClientRect ? node.getClientRect({ skipTransform: true }) : null;
      const largestDimension = Math.max(Number(bounds && bounds.width) || 1, Number(bounds && bounds.height) || 1);
      const pixelRatio = Math.max(.2, Math.min(1.5, 96 / largestDimension));
      const dataUrl = node.toDataURL({ pixelRatio, mimeType: 'image/png' });
      return typeof dataUrl === 'string' && dataUrl.startsWith('data:image/') ? dataUrl : '';
    } catch (error) {
      console.warn(`Could not render print preview for ${node.getAttr ? node.getAttr('inventoryName') || node.getAttr('customType') || 'item' : 'item'}:`, error);
      return '';
    }
  }

  function printVisualForInventoryName(name) {
    const definition = findInventoryDefinitionForPrintName(name);
    const representative = representativeNodeForPrintItem(name);
    const runPreview = compactRunPreviewNode(name, representative);
    const generatedPreview = runPreview || catalogItemPreviewNode(definition);
    const sourceNode = generatedPreview || representative;
    const dataUrl = printNodeDataUrl(sourceNode);
    if (generatedPreview && generatedPreview.destroy) generatedPreview.destroy();
    return dataUrl ? `<img class="print-item-preview" src="${dataUrl}" alt="" />` : '';
  }

  function incrementUsageMap(map, name, amount = 1) {
    const key = typeof name === 'string' ? name.trim() : '';
    if (!key || !Number.isFinite(amount) || amount <= 0) return;
    map.set(key, (map.get(key) || 0) + amount);
  }

  function tentDisplayName(node) {
    const widthFt = Number(node && node.getAttr && node.getAttr('widthFt')) || 0;
    const heightFt = Number(node && node.getAttr && node.getAttr('heightFt')) || 0;
    return tentDisplayNameFromSize(widthFt, heightFt);
  }

  function tentAddonsForTent(tent) {
    const tentId = tent && tent.getAttr ? tent.getAttr('nodeId') : '';
    const addons = [];
    if (!tentId) return addons;
    forEachNode((node) => {
      if (node && node.getAttr && node.getAttr('customType') === 'tentAddon' && node.getAttr('parentTentNodeId') === tentId) addons.push(node);
    });
    return addons;
  }

  function tentAddonSetupEntry(node) {
    return tentAddonSetupEntryFromAttrs({
      addonType: node.getAttr('addonType') || '',
      inventoryName: node.getAttr('inventoryName') || '',
      widthFt: node.getAttr('widthFt') || 0,
      lengthFt: node.getAttr('lengthFt') || 0,
      diameterFt: node.getAttr('diameterFt') || 0,
      weightFootprint: cloneConfig(node.getAttr('weightFootprint')) || null,
      attachment: cloneConfig(node.getAttr('attachment')) || null,
    });
  }

  function tentSetupSignature(tent) {
    const addons = tentAddonsForTent(tent).map(tentAddonSetupEntry).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return tentSetupSignatureFromAttrs({ widthFt: tent.getAttr('widthFt') || 0, heightFt: tent.getAttr('heightFt') || 0 }, addons);
  }

  function tentAddonUsageRows(tent) {
    return tentAddonUsageRowsFromRecords(tentAddonsForTent(tent).map((node) => ({
      addonType: node.getAttr('addonType') || '',
      inventoryName: node.getAttr('inventoryName') || '',
      lengthFt: tentLightRunLengthFt(node),
    })));
  }

  function tentInteriorItemRows(tents) {
    const rows = new Map();
    const add = (name, amount = 1, kind = 'item') => {
      const key = String(name || '').trim();
      if (!key) return;
      const rowKey = `${kind}:${key}`;
      const row = rows.get(rowKey) || { name: key, amount: 0, unit: 'count', kind };
      row.amount += amount;
      rows.set(rowKey, row);
    };
    const groupedSeatingTitle = (node) => {
      const config = node.getAttr('groupedConfig') || {};
      const chairRows = config.layoutKind === 'chair_rows';
      const details = chairRows ? chairRowsDetails() : tableSeatingDetails();
      const index = details.findIndex((entry) => entry.nodes.includes(node));
      return seatingEntryTitle(index >= 0 ? details[index] : { config }, chairRows ? 'Chair Rows' : 'Table Seating', Math.max(0, index));
    };
    const insideAnyTent = (node) => tents.some((tent) => tentPointIsInside(tent, tentLocalPoint(tent, getNodeCenter(node))));
    forEachNode((node) => {
      if (!(node && node.getAttr && insideAnyTent(node))) return;
      const type = node.getAttr('customType');
      if (type === 'item') add(node.getAttr('isFlooring') ? (node.getAttr('floorCategory') || 'Flooring') : inferInventoryNameForNode(node));
      else if (type === 'groupedSeating') add(groupedSeatingTitle(node), 1, 'group');
      else if (type === 'layoutGroup') add(node.getAttr('layoutGroupName') || 'Layout group', 1, 'group');
    });
    return Array.from(rows.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  function collectTentSetups() {
    const grouped = new Map();
    forEachNode((node) => {
      if (!(node && node.getAttr && node.getAttr('customType') === 'venue' && node.getAttr('venueType') === 'tent')) return;
      const customName = String(node.getAttr('tentSetupName') || '').trim();
      const signature = tentSetupSignature(node);
      const key = `${customName}\u0000${signature}`;
      if (!grouped.has(key)) grouped.set(key, { key, signature, customName, tents: [], addons: tentAddonUsageRows(node) });
      grouped.get(key).tents.push(node);
    });
    const setups = Array.from(grouped.values()).sort((a, b) => {
      const size = tentDisplayName(a.tents[0]).localeCompare(tentDisplayName(b.tents[0]));
      return size || a.customName.localeCompare(b.customName) || a.signature.localeCompare(b.signature);
    });
    const nextBySize = new Map();
    setups.forEach((setup) => {
      const baseTentName = tentDisplayName(setup.tents[0]);
      const hasAddons = setup.addons.length > 0;
      if (setup.customName) setup.displayName = setup.customName;
      else if (hasAddons) {
        const number = (nextBySize.get(baseTentName) || 0) + 1;
        nextBySize.set(baseTentName, number);
        setup.displayName = `${baseTentName} ${number}`;
      } else setup.displayName = baseTentName;
      setup.instanceNames = setup.tents.map((tent, index) => {
        if (setup.customName) return `${setup.customName} ${index + 1}`;
        return hasAddons ? `${setup.displayName}${String.fromCharCode(65 + index)}` : baseTentName;
      });
      setup.interiorItems = tentInteriorItemRows(setup.tents);
    });
    return setups;
  }

  function tentLightRunLengthFt(node) {
    if (!(node && node.getAttr)) return 0;
    const tent = getNodeById(node.getAttr('parentTentNodeId') || '');
    if (!tent || tent.getAttr('venueType') !== 'tent') return 0;
    const widthFt = Number(tent.getAttr('widthFt')) || 0;
    const heightFt = Number(tent.getAttr('heightFt')) || 0;
    const addonType = node.getAttr('addonType');
    if (addonType === 'perimeterLight') return 2 * (widthFt + heightFt);
    if (addonType === 'bistro') {
      const points = bistroZigZagPointsFt(widthFt, heightFt);
      return polylineLength(points, 1);
    }
    if (addonType === 'customBistro') {
      const attachment = node.getAttr('attachment') || {};
      return (Array.isArray(attachment.strings) ? attachment.strings : []).reduce((total, stringPoints) => {
        const points = Array.isArray(stringPoints) ? stringPoints : [];
        return total + polylineLength(points, 1);
      }, 0);
    }
    return 0;
  }

  function isBistroLightAddon(node) {
    const addonType = node && node.getAttr ? node.getAttr('addonType') : '';
    return addonType === 'bistro' || addonType === 'customBistro';
  }

  function inventoryLightLengthFt(node) {
    const length = tentLightRunLengthFt(node);
    // Bistro strings are stocked in 25 ft and 50 ft runs. Round per tent so
    // the requirement includes enough slack for the natural hanging droop.
    return isBistroLightAddon(node) && length > 0 ? Math.ceil(length / 25) * 25 : length;
  }

  function inventoryRowUnit(name, explicitUnit = '') {
    return defaultInventoryRowUnit(name, explicitUnit);
  }

  function collectPipeDrapeChains() {
    const chains = [];
    forEachNode((node) => {
      if (!(node && node.getAttr && node.getAttr('customType') === 'pipeDrapeChain')) return;
      const points = pipeDrapeWorldPoints(node);
      if (points.length >= 2) chains.push({ node, points, heightFt: Number(node.getAttr('heightFt')) || 10, crossbarName: node.getAttr('crossbarName') || 'Crossbar' });
    });
    return chains;
  }

  function pipeDrapeInventoryRows(chains = collectPipeDrapeChains()) {
    const rows = new Map(); const bases = new Map();
    const add = (name, amount, unit = 'count') => { const row = rows.get(name) || { name, amount: 0, unit }; row.amount += amount; if (unit === 'ft') row.unit = 'ft'; rows.set(name, row); };
    chains.forEach((chain) => {
      let length = 0; let panels = 0;
      for (let index = 1; index < chain.points.length; index += 1) { const span = pipeDrapeSpanFeet(chain.points[index - 1], chain.points[index]); length += span; panels += Math.ceil(span / 2.5); }
      chain.lengthFt = length; chain.drapePanels = panels; add('Pipe & Drape Feet', length, 'ft'); add('Drape Panels', panels); add(chain.crossbarName, chain.points.length - 1);
      chain.points.forEach((point) => { const key = `${Math.round(point.x * 100) / 100}:${Math.round(point.y * 100) / 100}`; const base = bases.get(key) || { heightFt: 0 }; base.heightFt = Math.max(base.heightFt, chain.heightFt); bases.set(key, base); });
    });
    bases.forEach((base) => add(pipeDrapeUprightName(base.heightFt), 1));
    if (bases.size) add('Pipe & Drape Bases', bases.size);
    return { rows: Array.from(rows.values()), bases };
  }

  function pipeDrapeDetails() {
    const chains = collectPipeDrapeChains(); const setups = new Map();
    chains.forEach((chain) => {
      const setupId = ensurePipeDrapeSetup(chain.node);
      if (!setups.has(setupId)) setups.set(setupId, { id: setupId, order: Number(chain.node.getAttr('pipeDrapeSetupOrder')) || 0, chains: [] });
      const setup = setups.get(setupId); setup.order = Math.min(setup.order || Infinity, Number(chain.node.getAttr('pipeDrapeSetupOrder')) || Infinity); setup.chains.push(chain);
    });
    const ordered = Array.from(setups.values()).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    ordered.forEach((setup, index) => {
      setup.displayName = setup.chains.map((chain) => String(chain.node.getAttr('pipeDrapeSetupName') || '').trim()).find(Boolean) || `Drape ${index + 1}`;
      setup.chains.sort((a, b) => (Number(a.node.getAttr('pipeDrapeRunOrder')) || 0) - (Number(b.node.getAttr('pipeDrapeRunOrder')) || 0));
      setup.chains.forEach((chain, runIndex) => { chain.runName = `Run ${runIndex + 1}`; });
      setup.totals = pipeDrapeInventoryRows(setup.chains).rows;
    });
    return { setups: ordered, chains, totals: pipeDrapeInventoryRows(chains).rows };
  }

  function collectInventoryUsage() {
    const usage = new Map();
    const units = new Map();
    const addUsage = (name, amount = 1, unit = 'count') => {
      incrementUsageMap(usage, name, amount);
      if (unit === 'ft' && name) units.set(String(name).trim(), 'ft');
    };
    forEachNode((node) => {
      if (!(node && node.getAttr)) return;
      const customType = node.getAttr('customType');
      if (customType === 'venue') {
        if (node.getAttr('venueType') === 'tent') addUsage(tentDisplayName(node));
        return;
      }
      if (customType === 'tentAddon') {
        const name = isBistroLightAddon(node) ? 'Bistro Lights' : (node.getAttr('inventoryName') || node.getAttr('addonType') || 'Tent add-on');
        const lightLengthFt = inventoryLightLengthFt(node);
        if (lightLengthFt > 0) addUsage(name, lightLengthFt, 'ft');
        else addUsage(name);
        return;
      }
      if (customType === 'drawnRun') {
        const name = node.getAttr('drawMode') === 'bistro' ? 'Bistro Lights' : (node.getAttr('inventoryName') || 'Run');
        const length = Number(node.getAttr('runLengthFt')) || 0;
        addUsage(name, node.getAttr('drawMode') === 'bistro' ? Math.ceil(length / 25) * 25 : length, 'ft');
        return;
      }
      if (customType === 'pipeDrapeChain') return;
      if (customType === 'stageAddon') { addUsage(node.getAttr('inventoryName') || node.getAttr('addonType') || 'Stage Add-on'); return; }
      if (node.getAttr('isFlooring')) return;
      if (customType === 'groupedSeating') {
        const config = node.getAttr('groupedConfig') || {};
        if (config.layoutKind === 'chair_rows') {
          const rows = Math.max(1, parseInt(config.rows, 10) || 1);
          const cols = Math.max(1, parseInt(config.cols, 10) || 1);
          incrementUsageMap(usage, config.chairName, Number(config.chairCount) || rows * cols);
          return;
        }
        const chairCount = Math.max(0, parseInt(config.chairCount, 10) || 0);
        incrementUsageMap(usage, config.tableName, 1);
        incrementUsageMap(usage, config.effectiveChairName || config.chairName, chairCount);
        return;
      }
      if (customType === 'layoutGroup') {
        const config = node.getAttr('layoutGroupConfig') || {};
        (Array.isArray(config.nodes) ? config.nodes : []).forEach((entry) => {
          const attrs = entry && entry.attrs ? entry.attrs : {};
          if (attrs.customType === 'groupedSeating') {
            const seating = attrs.groupedConfig || {};
            if (seating.layoutKind === 'chair_rows') incrementUsageMap(usage, seating.chairName, Number(seating.chairCount) || Math.max(1, parseInt(seating.rows, 10) || 1) * Math.max(1, parseInt(seating.cols, 10) || 1));
            else { incrementUsageMap(usage, seating.tableName, 1); incrementUsageMap(usage, seating.effectiveChairName || seating.chairName, Math.max(0, parseInt(seating.chairCount, 10) || 0)); }
          } else if (attrs.customType === 'item') {
            incrementUsageMap(usage, attrs.inventoryName, 1);
          }
        });
        return;
      }
      if (customType === 'item') incrementUsageMap(usage, inferInventoryNameForNode(node), 1);
    });
    pipeDrapeInventoryRows().rows.forEach((row) => addUsage(row.name, row.amount, row.unit));
    fenceInventoryRows().rows.forEach((row) => addUsage(row.name, row.amount, row.unit));
    flooringInventoryRows().rows.forEach((row) => addUsage(row.name, row.amount, row.unit));
    return { usage, units };
  }

  function currentPrintWorkspacePolygon() {
    if (!stage || !worldGroup || !worldGroup.getAbsoluteTransform) return [];
    const inverse = worldGroup.getAbsoluteTransform().copy().invert();
    return [{ x: 0, y: 0 }, { x: stage.width(), y: 0 }, { x: stage.width(), y: stage.height() }, { x: 0, y: stage.height() }].map((point) => inverse.point(point));
  }

  function nodeTouchesPrintWorkspace(node, layer, polygon) {
    if (!node || !node.getAttr || !layer || layer.visible === false || (node.visible && node.visible() === false)) return false;
    try { return rectangleTouchesPolygon(node.getClientRect({ relativeTo: worldGroup }), polygon); } catch (error) { return false; }
  }

  function collectPrintWorkspaceUsage() {
    const polygon = currentPrintWorkspacePolygon(); const usage = new Map(); const units = new Map(); const drapeChains = []; const fenceChains = [];
    const addUsage = (name, amount = 1, unit = 'count') => { const key = String(name || '').trim(); if (!key) return; incrementUsageMap(usage, key, amount); if (unit === 'ft') units.set(key, 'ft'); };
    forEachNode((node, layer) => {
      if (!nodeTouchesPrintWorkspace(node, layer, polygon)) return;
      const customType = node.getAttr('customType');
      if (customType === 'venue') { if (node.getAttr('venueType') === 'tent') addUsage(tentDisplayName(node)); return; }
      if (customType === 'tentAddon') { const name = isBistroLightAddon(node) ? 'Bistro Lights' : (node.getAttr('inventoryName') || node.getAttr('addonType') || 'Tent add-on'); const length = inventoryLightLengthFt(node); addUsage(name, length > 0 ? length : 1, length > 0 ? 'ft' : 'count'); return; }
      if (customType === 'drawnRun') { const name = node.getAttr('drawMode') === 'bistro' ? 'Bistro Lights' : (node.getAttr('inventoryName') || 'Run'); const length = Number(node.getAttr('runLengthFt')) || 0; addUsage(name, node.getAttr('drawMode') === 'bistro' ? Math.ceil(length / 25) * 25 : length, 'ft'); return; }
      if (customType === 'pipeDrapeChain') { const points = pipeDrapeWorldPoints(node); if (points.length >= 2) drapeChains.push({ node, points, heightFt: Number(node.getAttr('heightFt')) || 10, crossbarName: node.getAttr('crossbarName') || 'Crossbar' }); return; }
      if (customType === 'fenceChain') { const points = fenceWorldPoints(node); if (points.length >= 2) fenceChains.push({ node, points, panelLengthFt: Number(node.getAttr('fencePanelLengthFt')) || 8 }); return; }
      if (customType === 'stageAddon') { addUsage(node.getAttr('inventoryName') || node.getAttr('addonType') || 'Stage Add-on'); return; }
      if (node.getAttr('isFlooring')) { const detail = flooringInventoryDetails(node); (detail && detail.rows || []).forEach((row) => addUsage(row.name, row.amount, row.unit || 'count')); return; }
      if (customType === 'groupedSeating') { const config = node.getAttr('groupedConfig') || {}; if (config.layoutKind === 'chair_rows') addUsage(config.chairName, Number(config.chairCount) || Math.max(1, parseInt(config.rows, 10) || 1) * Math.max(1, parseInt(config.cols, 10) || 1)); else { addUsage(config.tableName); addUsage(config.effectiveChairName || config.chairName, Math.max(0, parseInt(config.chairCount, 10) || 0)); } return; }
      if (customType === 'layoutGroup') { const config = node.getAttr('layoutGroupConfig') || {}; (Array.isArray(config.nodes) ? config.nodes : []).forEach((entry) => { const attrs = entry && entry.attrs ? entry.attrs : {}; if (attrs.customType === 'groupedSeating') { const seating = attrs.groupedConfig || {}; if (seating.layoutKind === 'chair_rows') addUsage(seating.chairName, Number(seating.chairCount) || Math.max(1, parseInt(seating.rows, 10) || 1) * Math.max(1, parseInt(seating.cols, 10) || 1)); else { addUsage(seating.tableName); addUsage(seating.effectiveChairName || seating.chairName, Math.max(0, parseInt(seating.chairCount, 10) || 0)); } } else if (attrs.customType === 'item') addUsage(attrs.inventoryName); }); return; }
      if (customType === 'item') addUsage(inferInventoryNameForNode(node));
    });
    pipeDrapeInventoryRows(drapeChains).rows.forEach((row) => addUsage(row.name, row.amount, row.unit));
    fenceInventoryRows(fenceChains).rows.forEach((row) => addUsage(row.name, row.amount, row.unit));
    return { usage, units };
  }

  function getPrintWorkspaceRows(includeEventOnly = false) {
    const scoped = collectPrintWorkspaceUsage();
    const eventRows = new Map(getInventoryPanelRows().map((row) => [row.name, row]));
    const names = new Set(scoped.usage.keys());
    if (includeEventOnly) eventRows.forEach((row, name) => { if (row.used > 0) names.add(name); });
    return Array.from(names).map((name) => {
      const eventRow = eventRows.get(name); const used = scoped.usage.get(name) || 0;
      const unit = inventoryRowUnit(name, scoped.units.get(name) || (eventRow && eventRow.unit));
      const eventUsed = eventRow ? eventRow.used : used;
      return { name, used, eventUsed, unit };
    }).filter((row) => includeEventOnly ? row.eventUsed > 0 : row.used > 0).sort((a, b) => a.name.localeCompare(b.name));
  }

  function getPrintSetupLegendRows() {
    const polygon = currentPrintWorkspacePolygon();
    const usage = new Map();
    const addItem = (name, amount = 1) => incrementUsageMap(usage, String(name || '').trim(), amount);
    const addGroupedSeating = (config) => {
      if (!config) return;
      if ((config.layoutKind || config.groupedLayoutKind) === 'chair_rows') {
        addItem(config.chairName || 'Chair', Number(config.chairCount) || Math.max(1, Number(config.rows) || 1) * Math.max(1, Number(config.cols) || 1));
        return;
      }
      addItem(config.tableName || 'Table');
      addItem(config.effectiveChairName || config.chairName || 'Chair', Math.max(0, Number(config.chairCount) || 0));
    };
    forEachNode((node, layer) => {
      if (!nodeTouchesPrintWorkspace(node, layer, polygon)) return;
      const customType = node.getAttr('customType');
      if (customType === 'venue') { if (node.getAttr('venueType') === 'tent') addItem(tentDisplayName(node)); return; }
      if (customType === 'tentAddon') { addItem(node.getAttr('inventoryName') || node.getAttr('addonType') || 'Tent add-on'); return; }
      if (customType === 'drawnRun') { addItem(node.getAttr('drawMode') === 'bistro' ? 'Bistro Light Run' : (node.getAttr('inventoryName') || 'Drawn Run')); return; }
      if (customType === 'pipeDrapeChain') { addItem('Pipe & Drape Run'); return; }
      if (customType === 'fenceChain') { addItem(`${Number(node.getAttr('fencePanelLengthFt')) || 8} ft Fence Run`); return; }
      if (customType === 'stageAddon') { addItem(node.getAttr('inventoryName') || node.getAttr('addonType') || 'Stage Add-on'); return; }
      if (node.getAttr('isFlooring')) { const detail = flooringInventoryDetails(node); addItem(detail && (detail.summary || detail.key) || 'Flooring'); return; }
      if (customType === 'groupedSeating') { addGroupedSeating(node.getAttr('groupedConfig') || {}); return; }
      if (customType === 'layoutGroup') {
        const config = node.getAttr('layoutGroupConfig') || {};
        (Array.isArray(config.nodes) ? config.nodes : []).forEach((entry) => {
          const attrs = entry && entry.attrs ? entry.attrs : {};
          if (attrs.customType === 'groupedSeating') addGroupedSeating(attrs.groupedConfig || {});
          else if (attrs.customType === 'item') addItem(attrs.inventoryName || 'Item');
        });
        return;
      }
      if (customType === 'item') addItem(node.getAttr('inventoryName') || inferInventoryNameForNode(node) || 'Item');
    });
    return Array.from(usage, ([name, used]) => ({ name, used, unit: 'count' })).sort((a, b) => a.name.localeCompare(b.name));
  }

  function getInventoryPanelRows() {
    const { usage, units } = collectInventoryUsage();
    const orderedNames = [];
    const seen = new Set();
    getInventoryCatalog().forEach((name) => {
      if (!seen.has(name)) {
        seen.add(name);
        orderedNames.push(name);
      }
    });
    Array.from(usage.keys()).sort((a, b) => a.localeCompare(b)).forEach((name) => {
      if (!seen.has(name)) {
        seen.add(name);
        orderedNames.push(name);
      }
    });
    Object.keys(inventoryManualTotals || {}).sort((a, b) => a.localeCompare(b)).forEach((name) => {
      if (!seen.has(name)) {
        seen.add(name);
        orderedNames.push(name);
      }
    });
    return orderedNames.map((name) => {
      const used = usage.get(name) || 0;
      const unit = inventoryRowUnit(name, units.get(name));
      const total = normaliseInventoryTotalValue(inventoryManualTotals[name]);
      return {
        name,
        used,
        unit,
        total,
        remaining: total === null ? null : total - used,
        overLimit: total !== null && used > total,
      };
    });
  }

  function pipeDrapeKeyRows(rows) {
    const isPipeDrapeRow = (row) => row.name === 'Pipe & Drape Feet'
      || /crossbar/i.test(row.name)
      || /^upright/i.test(row.name)
      || row.name === 'Pipe & Drape Bases'
      || row.name === 'Drape Panels';
    const pipeRows = rows.filter((row) => row.used > 0 && isPipeDrapeRow(row));
    return {
      otherRows: rows.filter((row) => row.used > 0 && !isPipeDrapeRow(row)),
      totalLength: pipeRows.find((row) => row.name === 'Pipe & Drape Feet'),
      parts: [
        ...pipeRows.filter((row) => /crossbar/i.test(row.name)),
        ...pipeRows.filter((row) => /^upright/i.test(row.name)),
        ...pipeRows.filter((row) => row.name === 'Pipe & Drape Bases'),
        ...pipeRows.filter((row) => row.name === 'Drape Panels'),
      ],
    };
  }

  function flooringInventoryDetails(node) {
    const category = node.getAttr('floorCategory') || node.getAttr('itemType');
    const width = Number(node.getAttr('widthFt')) || 0; const length = Number(node.getAttr('lengthFt')) || 0;
    const options = node.getAttr('floorOptions') || {};
    if (category === 'subfloor') {
      if (node.getAttr('customTexture')) return { key: `Custom Subfloor ${width}×${length}`, rows: [], summary: `Custom Subfloor ${width}×${length}` };
      const panels = Math.ceil(width / 4) * Math.ceil(length / 4);
      return { key: `Subfloor ${width}×${length}`, rows: [{ name: 'Locking Panels (4×4)', amount: panels, unit: 'count' }], summary: `Subfloor ${width}×${length}` };
    }
    if (category === 'stage') {
      const packed = stagePanelParts(width, length); const rows = Object.entries(packed.parts).filter(([, amount]) => amount > 0).map(([name, amount]) => ({ name, amount, unit: 'count' }));
      rows.push({ name: `Stage Legs (${options.heightIn || 12} in)`, amount: packed.legs, unit: 'count' }, { name: 'Stage Skirt', amount: Math.round((2 * (width + length)) * 10) / 10, unit: 'ft' });
      const attachments = options.attachments || [];
      attachments.forEach((item) => rows.push({ name: item.type, amount: 1, unit: 'count' }));
      return { key: `Stage ${width}×${length} (${options.heightIn || 12} in)${attachments.length ? ` + ${attachments.map((a) => a.type).join(', ')}` : ''}`, rows, summary: `Stage ${width}×${length}` };
    }
    if (category === 'dancefloor' || category === 'modernDancefloor' || category === 'classicDancefloor') {
      const classic = category === 'classicDancefloor' || options.style === 'classic';
      const style = classic ? 'Classic Dance Floor' : 'Modern Dance Floor'; const rows = [];
      if (classic) {
        let area = Math.ceil(width) * Math.ceil(length); [[9, 'Classic Panels (3×3)'], [6, 'Classic Panels (2×3)'], [4, 'Classic Panels (2×2)'], [3, 'Classic Panels (1×3)'], [2, 'Classic Panels (1×2)'], [1, 'Classic Panels (1×1)']].forEach(([size, name]) => { const count = Math.floor(area / size); if (count) { rows.push({ name, amount: count }); area -= count * size; } });
        const edgeCount = Math.ceil(2 * (width + length)); rows.push({ name: 'Classic Edge - Loop', amount: Math.ceil(edgeCount / 2), unit: 'count' }, { name: 'Classic Edge - Tab', amount: Math.floor(edgeCount / 2), unit: 'count' }, { name: 'Classic Corner - Loop', amount: 2 }, { name: 'Classic Corner - Tab', amount: 2 });
      } else {
        const panels = Math.ceil(width / 3) * Math.ceil(length / 3); const edgeCount = Math.ceil((2 * (width + length)) / 1.5); rows.push({ name: 'Modern Panels (3×3)', amount: panels }, { name: 'Modern Edge - Loop', amount: Math.ceil(edgeCount / 2), unit: 'count' }, { name: 'Modern Edge - Tab', amount: Math.floor(edgeCount / 2), unit: 'count' }, { name: 'Modern Corner - Loop', amount: 2 }, { name: 'Modern Corner - Tab', amount: 2 });
      }
      return { key: `${style} ${width}×${length}`, rows, summary: `${style} ${width}×${length}` };
    }
    return null;
  }

  function flooringInventoryRows() {
    const aggregate = new Map(); const details = [];
    const floorNodes = [];
    forEachNode((node) => { if (!(node && node.getAttr) || !node.getAttr('isFlooring')) return; floorNodes.push(node); const detail = flooringInventoryDetails(node); if (!detail) return; details.push({ ...detail, count: 1, node, nodes: [node] }); detail.rows.forEach((row) => { const key = row.name; const current = aggregate.get(key) || { name: key, amount: 0, unit: row.unit || 'count' }; current.amount += row.amount; aggregate.set(key, current); }); });
    forEachNode((node) => {
      if (!(node && node.getAttr && node.getAttr('customType') === 'stageAddon')) return;
      const parent = floorNodes.find((floor) => ensureNodeId(floor, 'floor') === node.getAttr('parentStageNodeId'));
      const target = parent && details.find((entry) => entry.node === parent);
      if (!target) return;
      const name = node.getAttr('addonType') || 'Stage Add-on';
      const existing = target.rows.find((row) => row.name === name && (row.unit || 'count') === 'count');
      if (existing) existing.amount += 1;
      else target.rows.push({ name, amount: 1, unit: 'count' });
    });
    return { rows: Array.from(aggregate.values()), details };
  }

  const stageAddonContext = () => ({ Konva, attachShapeEvents, ensureNodeId, forEachNode, getNodeById, pixelsPerFoot: FEET_TO_PX });

  function stageAddonEdge(stage, localPoint, widthFt) {
    return findStageAddonEdge(stage, localPoint, widthFt, FEET_TO_PX);
  }

  function closestStageForAddonPlacement(worldPoint, widthFt) {
    return findClosestStageForAddonPlacement(stageAddonContext(), worldPoint, widthFt);
  }

  function syncStageAddonsForStage(stage) {
    return syncStageAddons(stageAddonContext(), stage);
  }

  function clampStageAddonNode(node, stage) {
    return constrainStageAddon(stageAddonContext(), node, stage);
  }

  function createStageAddonNode(data, stage, worldPoint) {
    return buildStageAddonNode(stageAddonContext(), data, stage, worldPoint);
  }

  function inventorySummaryTable(rows) {
    return inventorySummaryTableMarkup(rows, { inventoryLimitsEnabled, escapeHtml, formatInventoryAmount, formatInventoryUsage });
  }

  function renderInventorySummary(rows) {
    if (!inventoryKeySummary) return;
    const usedRows = rows.filter((row) => row.used > 0);
    if (!usedRows.length) {
      inventoryKeySummary.innerHTML = '<div class="inventory-key-empty">No inventory items are currently placed.</div>';
      return;
    }
    const { otherRows, totalLength, parts } = pipeDrapeKeyRows(rows);
    inventoryKeySummary.innerHTML = `
      ${inventorySummaryTable(otherRows)}
      ${totalLength || parts.length ? `
        <div class="inventory-key-section-title inventory-key-pipe-drape-title">Pipe &amp; Drape</div>
        ${totalLength ? detailTableMarkup([{ name: 'Total drape length', value: formatInventoryUsage(totalLength.name, totalLength.used, totalLength.unit) }]) : ''}
        ${inventorySummaryTable(parts)}
      ` : ''}
    `;
  }

  function detailTableMarkup(rows) {
    return `<table class="inventory-key-table inventory-key-detail-table"><tbody>${rows.map((row) => `<tr><td>${escapeHtml(String(row.name || ''))}</td><td class="inventory-key-num">${escapeHtml(String(row.value ?? ''))}</td></tr>`).join('')}</tbody></table>`;
  }

  function detailGroupMarkup(title, rows, action = '') {
    return `<div class="inventory-key-detail-group"><div class="inventory-key-detail-heading"><strong>${escapeHtml(title)}</strong>${action}</div>${detailTableMarkup(rows)}</div>`;
  }

  function printDetailTableMarkup(groups, className = '') {
    return `<table class="print-workspace-key-table ${className}"><tbody>${groups.map((group) => `<tr class="print-flooring-group-title"><th colspan="2">${escapeHtml(group.title)}</th></tr>${group.rows.map((row) => `<tr><td>${escapeHtml(String(row.name || ''))}</td><td>${escapeHtml(String(row.value ?? ''))}</td></tr>`).join('')}`).join('')}</tbody></table>`;
  }

  function tentSetupDetailRows(setup) {
    return [
      { name: 'Tents', value: setup.tents.length },
      ...setup.addons.map((row) => ({ name: row.name, value: formatInventoryAmount(row.amount * setup.tents.length, row.unit) })),
      ...setup.interiorItems.map((row) => ({ name: row.name, value: row.kind === 'group' ? (row.amount === 1 ? 'Group' : `${row.amount} groups`) : formatInventoryAmount(row.amount, row.unit) })),
    ];
  }

  function renderTentSetupSummary(setups) {
    if (inventoryKeyTentSetupsSection) inventoryKeyTentSetupsSection.style.display = setups.length ? '' : 'none';
    if (!inventoryKeyTentSetups || !setups.length) { if (inventoryKeyTentSetups) inventoryKeyTentSetups.innerHTML = ''; return; }
    inventoryKeyTentSetups.innerHTML = setups.map((setup) => {
      const ids = setup.tents.map((tent) => ensureNodeId(tent, 'venue')).join(',');
      const action = `<button class="btn btn-outline-secondary btn-sm tent-setup-rename" type="button" data-tent-ids="${escapeHtml(ids)}" title="Rename tent setup"><i class="fa-solid fa-pen"></i></button>`;
      return detailGroupMarkup(setup.displayName, tentSetupDetailRows(setup), action);
    }).join('');
    inventoryKeyTentSetups.querySelectorAll('.tent-setup-rename').forEach((button) => button.addEventListener('click', () => {
      const tents = String(button.dataset.tentIds || '').split(',').map(getNodeById).filter(Boolean);
      if (!tents.length) return;
      const current = String(tents[0].getAttr('tentSetupName') || '').trim();
      const next = window.prompt('Tent setup name (leave blank for automatic name)', current);
      if (next === null) return;
      tents.forEach((tent) => tent.setAttr('tentSetupName', next.trim()));
      refreshInventoryPanelUI(); setDirty(true);
    }));
  }

  function renderInventoryList(rows) {
    if (!inventoryKeyList) return;
    const filterValue = inventoryKeyFilter ? inventoryKeyFilter.value.trim().toLowerCase() : '';
    inventoryKeyList.innerHTML = inventoryLimitListMarkup(rows, filterValue, { escapeHtml, formatInventoryAmount, formatInventoryUsage });
  }

  function renderPrintInventorySummary(rows, mode = 'summary') {
    if (!printInventorySummaryEl) return;
    const normalizedMode = mode === true ? 'event-info' : (mode === false ? 'summary' : mode);
    if (normalizedMode !== 'setup-legend' && !inventoryShowOnPrint) {
      printInventorySummaryEl.style.display = 'none';
      printInventorySummaryEl.innerHTML = '';
      return;
    }
    const usedRows = rows.filter((row) => row.used > 0 || row.eventUsed > 0);
    if (!usedRows.length) {
      printInventorySummaryEl.style.display = 'none';
      printInventorySummaryEl.innerHTML = '';
      return;
    }
    printInventorySummaryEl.style.display = 'block';
    printInventorySummaryEl.innerHTML = printInventorySummaryMarkup(usedRows, normalizedMode, inventoryLimitsEnabled, { escapeHtml, formatInventoryAmount, formatInventoryUsage, visualMarkup: printVisualForInventoryName });
  }

  function renderPrintTentSetupSummary(setups) {
    if (!printTentSetupSummaryEl) return;
    if (!tentSetupsShowOnPrint || !setups.length) { printTentSetupSummaryEl.style.display = 'none'; printTentSetupSummaryEl.innerHTML = ''; return; }
    printTentSetupSummaryEl.style.display = 'block';
    printTentSetupSummaryEl.innerHTML = `<div class="print-inventory-summary-title">Tent Setups</div>${printDetailTableMarkup(setups.map((setup) => ({ title: setup.displayName, rows: tentSetupDetailRows(setup) })), 'print-tent-setup-key-table')}`;
  }

  function currentPrintNotes() { return String((printPreferencesNotes && printPreferencesNotes.value) || '').trim(); }

  function printNotesMarkup(notes) {
    return `<div class="print-inventory-summary-title">Notes</div><table class="print-workspace-key-table print-notes-key-table"><tbody><tr><td class="print-notes-body">${escapeHtml(notes)}</td></tr></tbody></table>`;
  }

  function renderPrintNotesSummary() {
    if (!printNotesSummaryEl) return;
    const notes = currentPrintNotes();
    if (!notes) {
      printNotesSummaryEl.style.display = 'none';
      printNotesSummaryEl.innerHTML = '';
      return;
    }
    printNotesSummaryEl.style.display = 'block';
    printNotesSummaryEl.innerHTML = printNotesMarkup(notes);
    if (printKeyContent) printKeyContent.appendChild(printNotesSummaryEl);
  }

  function renderPortraitEventPlanStream() {
    if (!printKeyContent) return;
    const sections = Array.from(printKeyContent.children).filter((section) => section.style.display !== 'none' && section.innerHTML.trim());
    if (!sections.length) return;
    const stream = document.createElement('div');
    stream.className = 'print-event-plan-stream';
    sections.forEach((section) => {
      const title = section.querySelector(':scope > .print-inventory-summary-title');
      if (title) {
        const row = document.createElement('div');
        row.className = 'print-event-plan-stream-row print-event-plan-stream-title';
        row.innerHTML = title.outerHTML;
        stream.appendChild(row);
      }
      section.querySelectorAll(':scope > table').forEach((table) => {
        const tableClass = table.className;
        table.querySelectorAll('tr').forEach((sourceRow) => {
          const row = document.createElement('div');
          row.className = 'print-event-plan-stream-row';
          row.innerHTML = `<table class="${tableClass}"><tbody>${sourceRow.outerHTML}</tbody></table>`;
          stream.appendChild(row);
        });
      });
    });
    if (stream.children.length) printKeyContent.replaceChildren(stream);
  }

  function pipeDrapeSetupDisplayRows(setup) {
    const rows = Array.isArray(setup.totals) ? setup.totals : [];
    const totalLength = rows.find((row) => row.name === 'Pipe & Drape Feet');
    const groups = [
      { label: 'Crossbars', rows: rows.filter((row) => /crossbar/i.test(row.name)) },
      { label: 'Uprights', rows: rows.filter((row) => /^upright/i.test(row.name)) },
      { label: 'Bases', rows: rows.filter((row) => /base/i.test(row.name)) },
      { label: 'Drapes', rows: rows.filter((row) => /drape panels/i.test(row.name)) },
    ].filter((group) => group.rows.length);
    return { totalLength, groups };
  }

  function pipeDrapeDetailRows(setup) {
    const { totalLength, groups } = pipeDrapeSetupDisplayRows(setup);
    return [
      ...(totalLength ? [{ name: 'Total drape', value: formatInventoryAmount(totalLength.amount, totalLength.unit) }] : []),
      ...groups.flatMap((group) => group.rows.map((row) => ({ name: row.name.replace(/^Pipe & Drape /, ''), value: formatInventoryAmount(row.amount, row.unit) }))),
    ];
  }

  function renderPipeDrapeSummary(details) {
    if (inventoryKeyPipeDrapeSection) inventoryKeyPipeDrapeSection.style.display = details.setups.length ? '' : 'none';
    if (!inventoryKeyPipeDrape) return;
    inventoryKeyPipeDrape.innerHTML = details.setups.map((setup) => detailGroupMarkup(setup.displayName, pipeDrapeDetailRows(setup), `<button class="btn btn-outline-secondary btn-sm pipe-drape-rename" type="button" data-setup-id="${escapeHtml(setup.id)}" title="Rename"><i class="fa-solid fa-pen"></i></button>`)).join('');
    inventoryKeyPipeDrape.querySelectorAll('.pipe-drape-rename').forEach((button) => button.addEventListener('click', () => {
      const setupId = button.dataset.setupId || ''; const current = details.setups.find((setup) => setup.id === setupId); if (!current) return;
      const next = window.prompt('Pipe & Drape name', current.displayName); if (next === null) return;
      current.chains.forEach((chain) => chain.node.setAttr('pipeDrapeSetupName', next.trim())); refreshInventoryPanelUI(); setDirty(true);
    }));
  }

  function fenceRunDetailRows(setup) {
    return (setup.totals || []).map((row) => ({ name: row.name, value: formatInventoryAmount(row.amount, row.unit) }));
  }
  function renderFenceRunSummary(setups) {
    if (inventoryKeyFenceRunsSection) inventoryKeyFenceRunsSection.style.display = setups.length ? '' : 'none';
    if (!inventoryKeyFenceRuns) return;
    inventoryKeyFenceRuns.innerHTML = setups.map((setup) => detailGroupMarkup(setup.displayName, fenceRunDetailRows(setup))).join('');
  }
  function renderPrintFenceRunsSummary(setups) {
    if (!printFenceRunsSummaryEl) return;
    if (!fenceRunsShowOnPrint || !setups.length) { printFenceRunsSummaryEl.style.display = 'none'; printFenceRunsSummaryEl.innerHTML = ''; return; }
    printFenceRunsSummaryEl.style.display = 'block';
    printFenceRunsSummaryEl.innerHTML = `<div class="print-inventory-summary-title">Fence Runs</div>${printDetailTableMarkup(setups.map((setup) => ({ title: setup.displayName, rows: fenceRunDetailRows(setup) })), 'print-fence-key-table')}`;
  }

  function standaloneLightRunDetails() {
    const runs = [];
    forEachNode((node) => { if (node && node.getAttr && node.getAttr('customType') === 'drawnRun' && node.getAttr('drawMode') === 'bistro') runs.push(node); });
    const pointsFor = (node) => bistroRunWorldPoints(node);
    const posts = [];
    forEachNode((node) => {
      if (isLightPost(node)) posts.push({ node, point: lightPostCenter(node) });
    });
    const groups = [];
    runs.forEach((node) => {
      const points = pointsFor(node); const connected = groups.filter((candidate) => candidate.points.some((a) => points.some((b) => Math.hypot(a.x - b.x, a.y - b.y) <= FEET_TO_PX))); let group = connected.shift();
      if (!group) { group = { runs: [], points: [] }; groups.push(group); }
      group.runs.push(node); group.points.push(...points);
      connected.forEach((other) => { group.runs.push(...other.runs); group.points.push(...other.points); groups.splice(groups.indexOf(other), 1); });
    });
    groups.forEach((group) => {
      const anchoredPostIds = new Set(group.runs.flatMap((run) => normalizedLightPostAnchors(run).map((anchor) => anchor.nodeId)).filter((nodeId) => isLightPost(getNodeById(nodeId))));
      group.posts = anchoredPostIds.size || posts.filter((post) => group.points.some((point) => Math.hypot(point.x - post.point.x, point.y - post.point.y) <= FEET_TO_PX)).length;
      group.length = group.runs.reduce((total, node) => total + (Number(node.getAttr('runLengthFt')) || 0), 0);
    });
    return groups.map((group, index) => ({
      title: `Light Run ${index + 1}`,
      rows: [
        { name: 'Run length', value: formatInventoryAmount(Math.round(group.length), 'ft') },
        { name: 'Bases', value: group.posts },
        { name: 'Poles', value: group.posts },
      ],
    }));
  }

  function renderStandaloneLightSummary() {
    const details = standaloneLightRunDetails();
    if (inventoryKeyLightRunsSection) inventoryKeyLightRunsSection.style.display = details.length ? '' : 'none';
    if (!inventoryKeyLightRuns) return;
    inventoryKeyLightRuns.innerHTML = details.map((detail) => detailGroupMarkup(detail.title, detail.rows)).join('');
  }

  function renderPrintLightRunsSummary() {
    if (!printLightRunsSummaryEl) return;
    const details = standaloneLightRunDetails();
    if (!lightRunsShowOnPrint || !details.length) { printLightRunsSummaryEl.style.display = 'none'; printLightRunsSummaryEl.innerHTML = ''; return; }
    printLightRunsSummaryEl.style.display = 'block';
    printLightRunsSummaryEl.innerHTML = `<div class="print-inventory-summary-title">Standalone Lights</div>${printDetailTableMarkup(details, 'print-light-runs-key-table')}`;
  }

  function flooringEntryTitle(entry, index) {
    const node = entry && entry.node;
    const customLabel = String(node && node.getAttr && node.getAttr('flooringLabel') || '').trim();
    if (customLabel) return customLabel;
    const category = String(node && node.getAttr && (node.getAttr('floorCategory') || node.getAttr('itemType')) || '').trim();
    const typeLabel = { stage: 'Stage', subfloor: 'Subfloor', dancefloor: 'Dancefloor', modernDancefloor: 'Modern Dancefloor', classicDancefloor: 'Classic Dancefloor' }[category] || 'Flooring';
    return `${typeLabel} ${index + 1}`;
  }

  function hideFlooringEditPopup() { document.getElementById('flooringEditPopup')?.remove(); }

  function centerInlineEditorPopup(popup) {
    if (!popup) return;
    const width = popup.offsetWidth || 320;
    const height = popup.offsetHeight || 220;
    popup.style.left = `${Math.max(6, (window.innerWidth - width) / 2)}px`;
    popup.style.top = `${Math.max(6, (window.innerHeight - height) / 2)}px`;
  }

  function editLayoutGroupNode(node) {
    if (!(node && node.getAttr && node.getAttr('customType') === 'layoutGroup')) return;
    requestLayoutGroupName('Edit Layout Group', String(node.getAttr('layoutGroupName') || 'Layout group'), (value) => {
      const name = String(value || '').trim();
      if (!name) return;
      node.setAttr('layoutGroupName', name);
      refreshInventoryPanelUI(); setDirty(true);
    });
  }

  function editDoubleClickTarget(target) {
    let node = target;
    while (node && node !== stage) {
      if (node.getAttr && node.getAttr('customType') === 'groupedSeating') {
        if (node.getAttr('groupedLayoutKind') === 'chair_rows') editChairRowsGroup(node);
        else if (node.getAttr('groupedLayoutKind') === 'table_seating') editTableSeatingGroup(node);
        return true;
      }
      if (node.getAttr && node.getAttr('isFlooring')) { editFlooringGroup(node); return true; }
      if (node.getAttr && node.getAttr('customType') === 'layoutGroup') { editLayoutGroupNode(node); return true; }
      node = node.getParent ? node.getParent() : null;
    }
    return false;
  }

  async function updateEditedFlooring(node, field, value) {
    if (!(node && node.getAttr && node.getAttr('isFlooring'))) return;
    if (field === 'flooringLabel') { node.setAttr('flooringLabel', String(value || '').trim()); refreshInventoryPanelUI(); setDirty(true); return; }
    const category = node.getAttr('floorCategory') || node.getAttr('itemType') || 'subfloor';
    const options = cloneConfig(node.getAttr('floorOptions') || {}) || {};
    let width = Number(node.getAttr('widthFt')) || 1; let length = Number(node.getAttr('lengthFt')) || 1;
    if (field === 'widthFt') width = Math.max(1, Number(value) || width);
    else if (field === 'lengthFt') length = Math.max(1, Number(value) || length);
    else if (field === 'style') options.style = value === 'classic' ? 'classic' : 'modern';
    else if (field === 'heightIn') options.heightIn = Math.max(1, Number(value) || 12);
    else return;
    const parent = node.getParent(); if (!parent) return;
    const oldNodeId = ensureNodeId(node, 'floor');
    const rebuilt = await createFlooring(category, width, length, { x: node.x(), y: node.y(), rotation: node.rotation(), floorOptions: options, customTexture: !!node.getAttr('customTexture') });
    if (!rebuilt) return;
    rebuilt.setAttr('nodeId', oldNodeId);
    rebuilt.setAttr('flooringLabel', node.getAttr('flooringLabel') || '');
    const targetLayerId = category === 'subfloor' ? 'subfloor-base' : node.getAttr('layerId');
    const targetGroup = getLayerGroup(targetLayerId) || parent;
    setNodeLayerId(rebuilt, targetLayerId); targetGroup.add(rebuilt); node.destroy();
    syncStageAddonsForStage(rebuilt); selectedItems = [rebuilt]; updateTransformer(); refreshInventoryPanelUI(); worldLayer.draw(); setDirty(true); editFlooringGroup(rebuilt);
  }

  function editFlooringGroup(node) {
    if (!(node && node.getAttr && node.getAttr('isFlooring'))) return;
    hideFlooringEditPopup();
    const category = node.getAttr('floorCategory') || node.getAttr('itemType') || 'floor';
    const options = node.getAttr('floorOptions') || {};
    const popup = document.createElement('div'); popup.id = 'flooringEditPopup'; popup.className = 'chair-rows-edit-popup';
    const styleField = ['dancefloor', 'modernDancefloor', 'classicDancefloor'].includes(category) ? `<label>Style<select data-floor-edit="style"><option value="modern">Modern</option><option value="classic">Classic</option></select></label>` : '';
    const heightField = category === 'stage' ? `<label>Height in<input data-floor-edit="heightIn" type="number" min="1" step="1" value="${Number(options.heightIn) || 12}"></label>` : '';
    popup.innerHTML = `<button type="button" class="chair-edit-close" aria-label="Close">×</button><div class="popup-title">Edit Flooring</div><div class="chair-edit-grid"><label>Name<input data-floor-edit="flooringLabel" type="text" value="${escapeHtml(String(node.getAttr('flooringLabel') || ''))}" placeholder="${escapeHtml(flooringEntryTitle({ node }, 0))}"></label><label>Width ft<input data-floor-edit="widthFt" type="number" min="1" step=".1" value="${Number(node.getAttr('widthFt')) || 1}"></label><label>Length ft<input data-floor-edit="lengthFt" type="number" min="1" step=".1" value="${Number(node.getAttr('lengthFt')) || 1}"></label>${styleField}${heightField}</div><div class="chair-edit-actions"><button type="button" class="btn btn-primary btn-sm flooring-edit-save">Save &amp; Exit</button></div>`;
    document.body.appendChild(popup);
    popup.querySelector('.chair-edit-close')?.addEventListener('click', hideFlooringEditPopup); popup.querySelector('.flooring-edit-save')?.addEventListener('click', hideFlooringEditPopup);
    popup.querySelectorAll('[data-floor-edit]').forEach((control) => { const key = control.getAttribute('data-floor-edit'); if (key === 'style') control.value = options.style === 'classic' || category === 'classicDancefloor' ? 'classic' : 'modern'; control.addEventListener('change', () => updateEditedFlooring(node, key, control.value)); });
    centerInlineEditorPopup(popup);
  }

  function renderFlooringSummary() {
    const details = flooringInventoryRows().details;
    const detailRows = (detail) => {
      const width = Number(detail.node && detail.node.getAttr && detail.node.getAttr('widthFt')) || 1;
      const length = Number(detail.node && detail.node.getAttr && detail.node.getAttr('lengthFt')) || 1;
      const formatDimension = (value) => String(Math.round(value * 100) / 100);
      return [{ name: 'Size', value: `${formatDimension(width)} × ${formatDimension(length)} ft` }, ...detail.rows.map((row) => ({ name: row.name, value: formatInventoryUsage(row.name, row.amount, row.unit || 'count') }))];
    };
    if (inventoryKeyFlooringSection) inventoryKeyFlooringSection.style.display = details.length ? '' : 'none';
    if (inventoryKeyFlooring) {
      inventoryKeyFlooring.innerHTML = details.map((detail, index) => detailGroupMarkup(flooringEntryTitle(detail, index), detailRows(detail), `<button class="btn btn-outline-secondary btn-sm flooring-summary-edit" type="button" data-flooring-index="${index}" title="Edit flooring"><i class="fa-solid fa-pen"></i></button>`)).join('');
      inventoryKeyFlooring.querySelectorAll('.flooring-summary-edit').forEach((button) => button.addEventListener('click', () => editFlooringGroup(details[Number(button.dataset.flooringIndex)]?.node)));
    }
    if (!printFlooringSummaryEl) return;
    if (!flooringShowOnPrint || !details.length) { printFlooringSummaryEl.style.display = 'none'; printFlooringSummaryEl.innerHTML = ''; return; }
    printFlooringSummaryEl.style.display = 'block';
    printFlooringSummaryEl.innerHTML = `<div class="print-inventory-summary-title">Flooring</div><table class="print-workspace-key-table print-flooring-key-table"><tbody>${details.map((detail, index) => `<tr class="print-flooring-group-title"><th colspan="2">${escapeHtml(flooringEntryTitle(detail, index))}</th></tr>${detailRows(detail).map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.value)}</td></tr>`).join('')}`).join('')}</tbody></table>`;
  }

  function chairRowsDetails() {
    const details = [];
    forEachNode((node) => {
      if (!(node && node.getAttr && node.getAttr('customType') === 'groupedSeating' && node.getAttr('groupedLayoutKind') === 'chair_rows')) return;
      const config = node.getAttr('groupedConfig') || {};
      const chairs = Number(config.chairCount) || Math.max(1, parseInt(config.rows, 10) || 1) * Math.max(1, parseInt(config.cols, 10) || 1);
      details.push({ config, count: 1, chairs, nodes: [node] });
    });
    return details;
  }

  function seatingAisleDirection(aisle) {
    return String(aisle && aisle.direction || '').toLowerCase().startsWith('h') ? 'H' : 'V';
  }

  function seatingAisleTitle(aisle, index) {
    const name = String(aisle && aisle.name || '').trim();
    return `Aisle ${index + 1}${name ? ` — ${name}` : ''} (${seatingAisleDirection(aisle)})`;
  }

  function seatingEntryTitle(entry, kind, index) {
    return String(entry && entry.config && entry.config.seatingLabel || `${kind} ${index + 1}`);
  }

  function seatingChairTypeName(value) {
    return String(value || 'Chair').replace(/\s*chair\s*$/i, '').trim() || 'Chair';
  }

  function renameSeatingEntry(entry, kind, index) {
    if ((kind === 'Chair Rows' || kind === 'Table Seating') && entry && entry.nodes && entry.nodes[0]) {
      if (kind === 'Table Seating') editTableSeatingGroup(entry.nodes[0]);
      else showChairRowsEditPopup(entry.nodes[0], entry.config || {});
      return;
    }
    const current = seatingEntryTitle(entry, kind, index);
    requestLayoutGroupName(`Rename ${kind.toLowerCase()}`, current, (value) => {
      const next = String(value || '').trim();
      if (!next) return;
      (entry.nodes || []).forEach((node) => {
        const config = cloneConfig(node.getAttr('groupedConfig') || {});
        config.seatingLabel = next;
        node.setAttr('groupedConfig', config);
      });
      refreshInventoryPanelUI(); setDirty(true);
    });
  }

  function seatingKeyDetailMarkup(entry, kind, index, rows) {
    const kindKey = kind === 'Table Seating' ? 'table' : 'chair';
    return detailGroupMarkup(seatingEntryTitle(entry, kind, index), rows, `<button class="btn btn-outline-secondary btn-sm seating-summary-rename" type="button" data-seating-kind="${kindKey}" data-seating-index="${index}" title="Edit seating"><i class="fa-solid fa-pen"></i></button>`);
  }

  function renderChairRowsSummary() {
    const details = chairRowsDetails();
    if (inventoryKeySeatingSection) inventoryKeySeatingSection.style.display = details.length ? '' : 'none';
    if (!inventoryKeySeating) return;
    inventoryKeySeating.innerHTML = details.map((entry, index) => {
      const config = entry.config;
      const aisles = Array.isArray(config.aisles) ? config.aisles : [];
      const rows = [{ name: 'Type', value: seatingChairTypeName(config.chairName) }, { name: 'Total', value: entry.chairs }, { name: 'Rows', value: config.rows || 1 }, { name: 'Chairs per Row', value: config.cols || 1 }, ...aisles.map((aisle, aisleIndex) => ({ name: seatingAisleTitle(aisle, aisleIndex), value: `${aisle.widthFt || 4} ft` }))];
      return seatingKeyDetailMarkup(entry, 'Chair Rows', index, rows);
    }).join('');
    inventoryKeySeating.querySelectorAll('.seating-summary-rename').forEach((button) => button.addEventListener('click', () => renameSeatingEntry(details[Number(button.dataset.seatingIndex)], 'Chair Rows', Number(button.dataset.seatingIndex))));
  }

  function tableSeatingDetails() {
    const details = [];
    forEachNode((node) => {
      if (!(node && node.getAttr && node.getAttr('customType') === 'groupedSeating' && node.getAttr('groupedLayoutKind') === 'table_seating')) return;
      details.push({ config: node.getAttr('groupedConfig') || {}, count: 1, nodes: [node] });
    });
    return details;
  }

  function renderTableSeatingSummary() {
    const details = tableSeatingDetails();
    if (!inventoryKeySeating) return;
    if (details.length) {
      inventoryKeySeatingSection.style.display = '';
      inventoryKeySeating.insertAdjacentHTML('beforeend', details.map((entry, index) => {
        const c = entry.config;
        const rows = [{ name: 'Table', value: c.tableName || 'Table' }, { name: 'Type', value: seatingChairTypeName(c.effectiveChairName || c.chairName) }, { name: 'Total', value: Number(c.chairCount) || 0 }, ...(c.cocktailHeightMode ? [{ name: 'Height', value: c.cocktailHeightMode === 'H' ? 'High' : 'Low' }] : [])];
        return seatingKeyDetailMarkup(entry, 'Table Seating', index, rows);
      }).join(''));
      inventoryKeySeating.querySelectorAll('.seating-summary-rename[data-seating-kind="table"]').forEach((button) => { const index = Number(button.dataset.seatingIndex); button.addEventListener('click', () => renameSeatingEntry(details[index], 'Table Seating', index)); });
    }
  }

  function renderPrintChairRowsSummary() {
    if (!printSeatingSummaryEl) return;
    const details = chairRowsDetails(); const tableDetails = tableSeatingDetails();
    if (!seatingShowOnPrint || (!details.length && !tableDetails.length)) { printSeatingSummaryEl.style.display = 'none'; printSeatingSummaryEl.innerHTML = ''; return; }
    printSeatingSummaryEl.style.display = 'block';
    const chairMarkup = details.map((entry, index) => { const c = entry.config; const aisles = Array.isArray(c.aisles) ? c.aisles : []; const aisleMarkup = aisles.map((a, aisleIndex) => `<tr><td>${escapeHtml(seatingAisleTitle(a, aisleIndex))}</td><td>${escapeHtml(String(a.widthFt || 4))} ft</td></tr>`).join(''); return `<tr class="print-seating-group-title"><th colspan="2">${escapeHtml(seatingEntryTitle(entry, 'Chair Rows', index))}</th></tr><tr><td>Type</td><td>${escapeHtml(seatingChairTypeName(c.chairName))}</td></tr><tr><td>Total</td><td>${entry.chairs}</td></tr><tr><td>Rows</td><td>${c.rows || 1}</td></tr><tr><td>Chairs per Row</td><td>${c.cols || 1}</td></tr>${aisleMarkup}`; }).join('');
    const tableMarkup = tableDetails.map((entry, index) => { const c = entry.config; return `<tr class="print-seating-group-title"><th colspan="2">${escapeHtml(seatingEntryTitle(entry, 'Table Seating', index))}</th></tr><tr><td>Table</td><td>${escapeHtml(c.tableName || 'Table')}</td></tr><tr><td>Type</td><td>${escapeHtml(seatingChairTypeName(c.effectiveChairName || c.chairName))}</td></tr><tr><td>Total</td><td>${Number(c.chairCount) || 0}</td></tr>${c.cocktailHeightMode ? `<tr><td>Height</td><td>${c.cocktailHeightMode === 'H' ? 'High' : 'Low'}</td></tr>` : ''}`; }).join('');
    printSeatingSummaryEl.innerHTML = `<div class="print-inventory-summary-title">Seating</div><table class="print-workspace-key-table print-seating-key-table"><tbody>${chairMarkup}${tableMarkup}</tbody></table>`;
  }

  function renderPrintPipeDrapeSummary(details) {
    if (!printPipeDrapeSummaryEl) return;
    if (!pipeDrapeShowOnPrint || !details.setups.length) { printPipeDrapeSummaryEl.style.display = 'none'; printPipeDrapeSummaryEl.innerHTML = ''; return; }
    printPipeDrapeSummaryEl.style.display = 'block';
    printPipeDrapeSummaryEl.innerHTML = `<div class="print-inventory-summary-title">Pipe &amp; Drape</div>${printDetailTableMarkup(details.setups.map((setup) => ({ title: setup.displayName, rows: pipeDrapeDetailRows(setup) })), 'print-pipe-drape-key-table')}`;
  }

  function refreshInventoryPanelUI() {
    const rows = getInventoryPanelRows();
    const tentSetups = collectTentSetups();
    const pipeDetails = pipeDrapeDetails();
    const fenceSetups = fenceDetails();
    renderTentSetupSummary(tentSetups);
    renderPipeDrapeSummary(pipeDetails);
    renderFenceRunSummary(fenceSetups);
    renderStandaloneLightSummary();
    renderPrintLightRunsSummary();
    renderFlooringSummary();
    renderChairRowsSummary();
    renderTableSeatingSummary();
    renderPrintChairRowsSummary();
    renderInventorySummary(rows);
    renderInventoryList(rows);
    renderPrintInventorySummary(rows);
    renderPrintTentSetupSummary(tentSetups);
    renderPrintPipeDrapeSummary(pipeDetails);
    renderPrintFenceRunsSummary(fenceSetups);
    if (inventoryPrintToggle) inventoryPrintToggle.checked = !!inventoryShowOnPrint;
    if (tentSetupsPrintToggle) tentSetupsPrintToggle.checked = !!tentSetupsShowOnPrint;
    if (pipeDrapePrintToggle) pipeDrapePrintToggle.checked = !!pipeDrapeShowOnPrint;
    if (fenceRunsPrintToggle) fenceRunsPrintToggle.checked = !!fenceRunsShowOnPrint;
    if (lightRunsPrintToggle) lightRunsPrintToggle.checked = !!lightRunsShowOnPrint;
    if (flooringPrintToggle) flooringPrintToggle.checked = !!flooringShowOnPrint;
    if (seatingPrintToggle) seatingPrintToggle.checked = !!seatingShowOnPrint;
    if (inventoryLimitsToggle) inventoryLimitsToggle.checked = !!inventoryLimitsEnabled;
    if (inventoryFullSection) inventoryFullSection.style.display = inventoryLimitsEnabled ? '' : 'none';
  }

  function updateInventoryTotal(name, value) {
    const key = typeof name === 'string' ? name.trim() : '';
    if (!key) return;
    const normalised = normaliseInventoryTotalValue(value);
    if (normalised === null) delete inventoryManualTotals[key];
    else inventoryManualTotals[key] = normalised;
    refreshInventoryPanelUI();
    setDirty(true);
  }

  async function getFlooringDefinitions() {
    if (flooringConfigCache) return flooringConfigCache;
    try {
      const res = await fetch('/static/data/flooring.json');
      if (!res.ok) throw new Error('flooring config not found');
      const data = await res.json();
      flooringConfigCache = Array.isArray(data) ? data : [];
    } catch (err) {
      flooringConfigCache = [];
      console.error('Error loading flooring config:', err);
    }
    return flooringConfigCache;
  }

  // --- Flooring Generator ---
  async function createFlooring(type, widthFt, lengthFt, opts = {}) {
    const defs = await getFlooringDefinitions();
    const def = defs.find((d) => d && d.category === type);
    if (!def) {
      console.warn(`No flooring definition found for category "${type}"`);
      return null;
    }

    const pxPerFt = FEET_TO_PX;
    const tile = Math.max(1, def.tileSize || 1);
    const color = def.color || '#cccccc';
    const border = def.borderColor || '#000000';

    const clampDimension = (value) => {
      const num = typeof value === 'number' ? value : parseFloat(value);
      return Number.isFinite(num) && num > 0 ? num : tile;
    };

    const totalWidthFt = clampDimension(widthFt);
    const totalLengthFt = clampDimension(lengthFt);

    const group = new Konva.Group({
      draggable: true,
      name: 'floorItem',
      x: Number.isFinite(opts.x) ? opts.x : 0,
      y: Number.isFinite(opts.y) ? opts.y : 0,
      rotation: Number.isFinite(opts.rotation) ? opts.rotation : 0,
    });
    group.setAttrs({
      customType: 'item',
      itemType: type,
      selectable: true,
      draggable: true,
    });
    attachShapeEvents(group);

    const tileW = tile * pxPerFt;
    const tileH = tile * pxPerFt;

    const totalWidthPx = totalWidthFt * pxPerFt;
    const totalLengthPx = totalLengthFt * pxPerFt;
    const useCustomTexture = !!opts.customTexture;
    const floorOptions = cloneConfig(opts.floorOptions) || {};

    if (useCustomTexture) {
      const base = new Konva.Rect({
        x: 0,
        y: 0,
        width: totalWidthPx,
        height: totalLengthPx,
        fill: color,
        stroke: border,
        strokeWidth: 1,
        listening: false,
      });
      group.add(base);
      const textureGroup = new Konva.Group({
        clipX: 0,
        clipY: 0,
        clipWidth: totalWidthPx,
        clipHeight: totalLengthPx,
        listening: false,
      });
      group.add(textureGroup);
      const hatchSpacing = Math.max(18, Math.round(1.5 * pxPerFt));
      for (let offset = -totalLengthPx; offset <= totalWidthPx; offset += hatchSpacing) {
        textureGroup.add(new Konva.Line({
          points: [offset, 0, offset + totalLengthPx, totalLengthPx],
          stroke: border,
          strokeWidth: 0.75,
          opacity: 0.45,
          listening: false,
        }));
      }
    } else {
      const cols = Math.floor(totalWidthFt / tile);
      const rows = Math.floor(totalLengthFt / tile);
      const remainderX = totalWidthFt - cols * tile;
      const remainderY = totalLengthFt - rows * tile;
      const approxEqual = (val, target) => Math.abs(val - target) < 0.05;

      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          const rect = new Konva.Rect({
            x: i * tileW,
            y: j * tileH,
            width: tileW,
            height: tileH,
            fill: color,
            stroke: border,
            strokeWidth: 1,
            listening: false,
          });
          group.add(rect);
        }
      }

      if (remainderX > 0.05 && type !== 'stage') {
        const partialWidthPx = remainderX * pxPerFt;
        for (let j = 0; j < rows; j += 1) {
          const rect = new Konva.Rect({
            x: cols * tileW,
            y: j * tileH,
            width: partialWidthPx,
            height: tileH,
            fill: color,
            stroke: border,
            strokeWidth: 1,
            listening: false,
          });
          group.add(rect);
        }
      }

      if (remainderY > 0.05 && type !== 'stage') {
        const spanWidthPx = (cols * tile + (remainderX > 0.05 ? remainderX : 0)) * pxPerFt;
        const partialHeightPx = remainderY * pxPerFt;
        const rect = new Konva.Rect({
          x: 0,
          y: rows * tileH,
          width: spanWidthPx,
          height: partialHeightPx,
          fill: color,
          stroke: border,
          strokeWidth: 1,
          listening: false,
        });
        group.add(rect);
      }

      if (type === 'stage' && (remainderX > 0.05 || remainderY > 0.05) && def.fillers) {
        const rectFill = def.fillers.rect || [2, 4];
        const squareFill = def.fillers.square || [2, 2];
        const rectW = rectFill[0] * pxPerFt;
        const rectH = rectFill[1] * pxPerFt;
        const sqW = squareFill[0] * pxPerFt;
        const sqH = squareFill[1] * pxPerFt;

        if (approxEqual(remainderX, rectFill[0])) {
          for (let j = 0; j < rows; j += 1) {
            const filler = new Konva.Rect({
              x: cols * tileW,
              y: j * tileH,
              width: rectW,
              height: rectH,
              fill: color,
              stroke: border,
              strokeWidth: 1,
              listening: false,
            });
            group.add(filler);
          }
        }

        if (approxEqual(remainderY, rectFill[0])) {
          for (let i = 0; i < cols; i += 1) {
            const filler = new Konva.Rect({
              x: i * tileW,
              y: rows * tileH,
              width: rectH,
              height: rectW,
              fill: color,
              stroke: border,
              strokeWidth: 1,
              listening: false,
            });
            group.add(filler);
          }
        }

        if (approxEqual(remainderX, squareFill[0]) && approxEqual(remainderY, squareFill[1])) {
          const corner = new Konva.Rect({
            x: cols * tileW,
            y: rows * tileH,
            width: sqW,
            height: sqH,
            fill: color,
            stroke: border,
            strokeWidth: 1,
            listening: false,
          });
          group.add(corner);
        }
      }
    }

    if (type === 'stage') {
      const packed = stagePanelParts(totalWidthFt, totalLengthFt);
      const cornerKeys = new Set();
      packed.placed.forEach((part) => [[part.x, part.y], [part.x + part.w, part.y], [part.x, part.y + part.h], [part.x + part.w, part.y + part.h]].forEach(([x, y]) => cornerKeys.add(`${x}:${y}`)));
      cornerKeys.forEach((key) => { const [x, y] = key.split(':').map(Number); group.add(new Konva.Circle({ x: x * 2 * pxPerFt, y: y * 2 * pxPerFt, radius: 2.5, fill: '#222', listening: false, name: 'stageLeg' })); });
    }
    if (type === 'modernDancefloor' || type === 'classicDancefloor' || type === 'dancefloor') {
      const classic = type === 'classicDancefloor' || floorOptions.style === 'classic';
      const edgeFt = classic ? 1 : 1.5; const edgeDepthPx = (classic ? 4 : 3) / 12 * pxPerFt; const edgeCount = Math.ceil((2 * (totalWidthFt + totalLengthFt)) / edgeFt);
      group.add(new Konva.Rect({ x: 0, y: -edgeDepthPx, width: totalWidthPx, height: edgeDepthPx, fill: border, opacity: .75, listening: false, name: 'danceFloorEdge' }));
      group.add(new Konva.Rect({ x: 0, y: totalLengthPx, width: totalWidthPx, height: edgeDepthPx, fill: border, opacity: .75, listening: false, name: 'danceFloorEdge' }));
      group.add(new Konva.Rect({ x: -edgeDepthPx, y: 0, width: edgeDepthPx, height: totalLengthPx, fill: border, opacity: .75, listening: false, name: 'danceFloorEdge' }));
      group.add(new Konva.Rect({ x: totalWidthPx, y: 0, width: edgeDepthPx, height: totalLengthPx, fill: border, opacity: .75, listening: false, name: 'danceFloorEdge' }));
      const cornerCount = 4;
      const cornerPositions = [[0, 0], [totalWidthPx, 0], [totalWidthPx, totalLengthPx], [0, totalLengthPx]];
      for (let index = 0; index < cornerCount; index += 1) {
        const [cornerX, cornerY] = cornerPositions[index % 4];
        group.add(new Konva.Circle({ x: cornerX, y: cornerY, radius: edgeDepthPx * .8, fill: border, opacity: .75, listening: false, name: 'danceFloorCorner' }));
      }
      group.setAttr('edgePieceCount', edgeCount);
      collectionToArray(group.getChildren()).filter((node) => node.hasName && (node.hasName('danceFloorEdge') || node.hasName('danceFloorCorner'))).forEach((node) => node.moveToBottom());
    }

    const hitRect = new Konva.Rect({
      x: 0,
      y: 0,
      width: Math.max(1, totalWidthPx),
      height: Math.max(1, totalLengthPx),
      fill: 'rgba(0,0,0,0.01)',
      strokeWidth: 0,
      listening: true,
      name: 'floorHitSurface',
    });
    group.add(hitRect);
    hitRect.moveToBottom();
    hitRect.on('dblclick dbltap', (event) => { event.cancelBubble = true; editFlooringGroup(group); });

    group.setAttrs({
      customType: 'item',
      itemType: type,
      floorCategory: type,
      floorLayer: def.layer || type,
      selectable: true,
      lockScaling: true,
      widthFt: totalWidthFt,
      lengthFt: totalLengthFt,
      tileSize: tile,
      customTexture: useCustomTexture,
      floorOptions,
      isFlooring: true,
    });
    ensureNodeId(group, 'floor');

    updateFloorZOrder();
    return group;
  }

  function updateFloorZOrder() {
    const orderMap = { subfloor: 0, stage: 1, dancefloor: 2, modernDancefloor: 2, classicDancefloor: 2 };
    getOrderedLayers()
      .filter((layer) => layer.kind === 'item')
      .forEach((layer) => {
        const group = getLayerGroup(layer.id);
        if (!group) return;
        const floors = collectionToArray(group.getChildren()).filter((node) => node.getAttr && node.getAttr('isFlooring'));
        floors.sort((a, b) => {
          const aKey = orderMap[a.getAttr('floorCategory')] ?? 99;
          const bKey = orderMap[b.getAttr('floorCategory')] ?? 99;
          return aKey - bKey;
        });
        floors.forEach((node, idx) => node.zIndex(idx));
        const others = collectionToArray(group.getChildren()).filter((node) => !(node.getAttr && node.getAttr('isFlooring')));
        others.forEach((node, idx) => node.zIndex(floors.length + idx));
      });
  }

  // Nav controls
  const zoomInBtn = document.getElementById('zoomIn');
  const zoomOutBtn = document.getElementById('zoomOut');
  const panUpBtn = document.getElementById('panUp');
  const panDownBtn = document.getElementById('panDown');
  const panLeftBtn = document.getElementById('panLeft');
  const panRightBtn = document.getElementById('panRight');
  const rotateLeftBtn = document.getElementById('rotateLeft');
  const rotateRightBtn = document.getElementById('rotateRight');
  const resetViewBtn = document.getElementById('resetView');

  // State
  let stage, worldLayer, worldGroup;
  let gridGroup, layerRootGroup, uiGroup;
  let transformer, selectionRect;
  let selectedItems = [];
  let clipboard = [];
  let gridSize = 10;
  let gridBounds = null;
  let snapDistanceFt = 1;
  let showGrid = true;
  // Match the checked Snap To Grid control when there is no saved preference.
  let snapToGrid = true;
  let darkMode = false;
  let showItemHeights = false;
  let uiScale = 1;
  let units = 'ft';
  let shiftPressed = false;
  let snapAnchor = null;
  let currentDocumentId = null;
  let currentDocumentTitle = 'Untitled planner';
  let currentDocumentUpdatedAt = null;
  let isDirty = false;
  let suppressDirtyTracking = false;
  let plannerHistory = [];
  let plannerRedoHistory = [];
  let plannerHistoryApplying = false;
  let activeTool = 'select';
  let placementPayload = null;
  let placementPreview = null;
  let placementPreviewPoint = null;
  let placementTouchPreviewReady = false;
  let touchAddonPreviewActive = false;
  let suppressSyntheticPlacementMouseUntil = 0;
  let bulkLegPlacement = { start: null, box: null, preview: null };
  let customBistroDraft = { tent: null, node: null, points: [], rawData: null, preview: null, replaceStringIndex: null };
  let drawnRunDraft = { points: [], anchors: [], preview: null, node: null };
  let standaloneLightAssemblyDrag = null;
  let pipeDrapeDraft = { points: [], preview: null, node: null };
  let pipeDrapeEdit = { node: null, overlay: null };
  let fenceDraft = { points: [], preview: null, node: null };
  let fenceSetupCounter = 0;
  let selectedCustomBistroString = null;
  let customBistroStringHighlight = null;
  let sidewallDragPreview = null;
  let activePlacementButton = null;
  let groupedSeatingEditNode = null;
  let chairRowsEditingAisle = { group: null, aisleId: null };
  let chairRowsConfigOverride = null;
  let chairRowsTotalLastChanged = 'rows';
  let placementRotation = 0;
  let userLayers = [];
  let activeLayerId = 'items-base';
  const layerGroups = new Map();
  let layerIdCounter = 0;

  // Multi-drag helpers
  let multiDragActive = false;
  let dragAnchorNode = null; // the node being dragged that anchors the delta
  const initialPosMap = new Map(); // node -> {x,y}
  let flooringConfigCache = null;
  let tableInventoryCache = [];
  let chairInventoryCache = [];
  let inventoryDefinitionCache = [];
  const inventoryDefinitionsBySection = new Map();
  let inventoryCatalogMeta = { sections: [] };
  let nodeIdCounter = 0;
  let currentCocktailHeightMode = 'H';
  let currentTableChairPattern = 'side_by_side';
  let labelGearTargetId = null;
  let inventoryManualTotals = {};
  let inventoryShowOnPrint = true;
  let tentSetupsShowOnPrint = false;
  let pipeDrapeShowOnPrint = false;
  let fenceRunsShowOnPrint = false;
  let lightRunsShowOnPrint = false;
  let flooringShowOnPrint = false;
  let seatingShowOnPrint = false;
  let printLayoutPreference = 'map-key';
  let printOrientationPreference = 'landscape';
  let printSetupLegendPreference = true;
  let printSetupLegendPagePreference = false;
  // Keep the existing map + key layout by default. Page separation is an
  // explicit print-tool choice, not an automatic override based on row count.
  let printKeySamePagePreference = true;
  let pipeDrapeSetupCounter = 0;
  let inventoryLimitsEnabled = false;
  let customVenueTemplates = [];
  let customInventoryItems = [];
  let layoutGroupTemplates = [];
  let deletedLayoutGroupTemplateIds = new Set();
  let layoutGroupNameSubmit = null;
  let labelTextSubmit = null;
  let labelTextCanCopy = false;
  let labelAttachmentPreview = null;
  let labelPlacementPreview = null;
  let labelPlacementDraft = null;
  let venueBuilder = { open: false, mode: null, shapeKind: 'polygon', points: [], components: [], doors: [], selectedId: null, selectedWalls: [], draftComponentId: null, calibrationPoints: [], primitiveStart: null, primitiveEnd: null, reference: null, referenceNode: null, draftNode: null, previewNode: null, editingId: null, stage: null, layer: null, grid: null, view: null, zoom: 1, pan: { x: 0, y: 0 }, panning: false, history: [] };
  let inventoryBuilderMode = false;
  let roomAttachmentEdit = null;
  let referenceSetup = { open: false, source: null, target: null, context: null, image: null, sourceImage: null, rotation: 0, crop: null, mode: 'frame', drag: null, viewDrag: null, view: { zoom: 1, panX: 0, panY: 0 }, manualPoints: [], scale: null, opacity: .5, originalOpacity: .5 };
  let referenceSetupSpacePressed = false;
  let referenceImageOpacity = .5;

  if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/static/vendor/pdfjs/pdf.worker.min.js';

  function readCustomInventoryItems() { return readStoredCustomInventoryItems(localStorage, CUSTOM_ITEMS_KEY); }
  function writeCustomInventoryItems() { localStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(customInventoryItems)); }
  function requestDeleteConfirmation(message, onConfirm) {
    document.getElementById('plannerDeleteConfirmation')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'plannerDeleteConfirmation';
    overlay.className = 'planner-confirm-overlay';
    const dialog = document.createElement('div');
    dialog.className = 'planner-confirm-dialog';
    const text = document.createElement('div');
    text.className = 'planner-confirm-message';
    text.textContent = message;
    const actions = document.createElement('div');
    actions.className = 'planner-confirm-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'btn btn-outline-secondary btn-sm'; cancel.textContent = 'Cancel';
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'btn btn-danger btn-sm'; remove.textContent = 'Delete';
    const close = () => overlay.remove();
    cancel.addEventListener('click', close);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    remove.addEventListener('click', () => { close(); onConfirm(); });
    actions.append(cancel, remove); dialog.append(text, actions); overlay.appendChild(dialog); document.body.appendChild(overlay);
    remove.focus();
  }
  function renderCustomInventoryItems() {
    return drawCustomInventoryItems({ customInventoryList, getItems: () => customInventoryItems, setItems: (items) => { customInventoryItems = items; }, writeItems: writeCustomInventoryItems, confirmDelete: requestDeleteConfirmation, armPlacementTool, openVenueBuilder, customItemHeight, customItemHanging, cloneConfig, setInventoryBuilderMode: (enabled) => { inventoryBuilderMode = enabled; } });
  }
  function exportCustomData() { const blob = new Blob([JSON.stringify({ format: 'floorplanner-custom-v1', venues: customVenueTemplates, items: customInventoryItems }, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'floorplanner-custom.json'; link.click(); URL.revokeObjectURL(link.href); }
  function importCustomData(file) { const reader = new FileReader(); reader.onload = () => { try { const data = JSON.parse(reader.result); customVenueTemplates = mergeCustomTemplateRecords(customVenueTemplates, data.venues); customInventoryItems = mergeCustomTemplateRecords(customInventoryItems, data.items); writeCustomVenueTemplates(); writeCustomInventoryItems(); renderCustomVenueButtons(); renderCustomInventoryItems(); } catch { window.alert('That custom JSON file could not be imported.'); } }; reader.readAsText(file); }

  const FEET_TO_PX = 12;

  function roomAttachmentList(data) {
    return normaliseRoomAttachments(data, (index) => `room-attachment-${Date.now()}-${index}`);
  }

  function roomWall(component, wallIndex) {
    return roomWallGeometry(component, wallIndex);
  }

  function roomWallInteriorSide(component) {
    return roomInteriorSide(component);
  }

  function roomAttachmentClamp(attachment, wall, attachments = []) {
    if (!attachment || !wall || !Number.isFinite(wall.length) || wall.length <= 0) return attachment;
    const width = Math.min(Number(attachment.widthFt) || 3, wall.length);
    const half = width / (2 * wall.length);
    const others = attachments.filter((item) => item !== attachment && item.id !== attachment.id && item.componentId === attachment.componentId && Number(item.wallIndex) === Number(attachment.wallIndex));
    let t = Math.max(half, Math.min(1 - half, Number(attachment.t) || 0));
    others.forEach((item) => {
      const otherHalf = Math.min(Number(item.widthFt) || 3, wall.length) / (2 * wall.length);
      if (Math.abs(t - (Number(item.t) || 0)) < half + otherHalf) {
        const left = (Number(item.t) || 0) - otherHalf - half;
        const right = (Number(item.t) || 0) + otherHalf + half;
        t = Math.abs(t - left) < Math.abs(t - right) ? left : right;
      }
    });
    attachment.widthFt = width; attachment.t = Math.max(half, Math.min(1 - half, t));
    return attachment;
  }

  function roomAttachmentComponents(widthFt, heightFt, customComponents) {
    return roomComponents(widthFt, heightFt, customComponents);
  }

  function roomAttachmentPoint(component, attachment) {
    return roomAttachmentPosition(component, attachment);
  }

  function constrainRoomAttachmentDrag(room, component, attachment, attachments, absolutePosition) {
    return constrainRoomAttachment(room && room.getAbsoluteTransform(), component, attachment, attachments, absolutePosition, FEET_TO_PX);
  }

  function roomAttachmentWorldPoint(room, attachment) {
    const component = resolveRoomAttachmentComponent(room.getAttr('widthFt'), room.getAttr('heightFt'), room.getAttr('componentsSpec'), attachment);
    const point = roomAttachmentPoint(component, attachment) || { x: 0, y: 0 };
    return attachmentWorldPoint({ x: room.x(), y: room.y() }, room.rotation() || 0, point, FEET_TO_PX);
  }

  const roomAttachmentControls = () => createRoomAttachmentControls({
    getEdit: () => roomAttachmentEdit,
    setEdit: (edit) => { roomAttachmentEdit = edit; },
    roomAttachmentPopup,
    roomAttachmentWidth,
    roomAttachmentSwing,
    stageContainer,
    getRoomAttachmentList: roomAttachmentList,
    roomAttachmentComponents,
    roomWall,
    roomAttachmentClamp,
    renderVenueAttachmentGeometry,
    setDirty,
    worldLayer,
  });

  function closeRoomAttachmentPopup() { return roomAttachmentControls().close(); }
  function openRoomAttachmentPopup(room, attachment, screenPoint) { return roomAttachmentControls().open(room, attachment, screenPoint); }
  function updateRoomAttachment(room, attachment) { return roomAttachmentControls().update(room, attachment); }

  function renderVenueAttachmentGeometry(room) {
    return renderRoomAttachments({ Konva, activeTool, pixelsPerFoot: FEET_TO_PX, stage, roomAttachmentList, roomAttachmentComponents, roomWall, roomAttachmentClamp, roomAttachmentPoint, roomWallInteriorSide, constrainRoomAttachmentDrag, updateRoomAttachment, openRoomAttachmentPopup }, room);
  }

  function renderRoomWalls(room, components, outlineCfg) {
    return drawRoomWalls({ Konva, pixelsPerFoot: FEET_TO_PX, roomWall }, room, components, outlineCfg);
  }
  function readCustomVenueTemplates() { return readStoredCustomVenueTemplates(localStorage, CUSTOM_VENUES_KEY); }

  function writeCustomVenueTemplates() {
    try { localStorage.setItem(CUSTOM_VENUES_KEY, JSON.stringify(customVenueTemplates)); }
    catch { window.alert('This venue could not be saved locally. The reference image may be too large for browser storage.'); }
  }

  function readLayoutGroupTemplates() {
    try {
      const items = JSON.parse(localStorage.getItem(LAYOUT_GROUPS_KEY) || '[]');
      return validLayoutGroupTemplates(items);
    } catch { return []; }
  }

  function readDeletedLayoutGroupTemplateIds() {
    try {
      const ids = JSON.parse(localStorage.getItem(LAYOUT_GROUP_DELETIONS_KEY) || '[]');
      return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string' && id) : []);
    } catch { return new Set(); }
  }

  function writeDeletedLayoutGroupTemplateIds() {
    try { localStorage.setItem(LAYOUT_GROUP_DELETIONS_KEY, JSON.stringify([...deletedLayoutGroupTemplateIds])); } catch { }
  }

  function removeLayoutGroupTemplate(template) {
    if (!template) return;
    if (template.id) {
      deletedLayoutGroupTemplateIds.add(template.id);
      writeDeletedLayoutGroupTemplateIds();
    }
    layoutGroupTemplates = layoutGroupTemplates.filter((entry) => entry !== template && entry.id !== template.id);
    writeLayoutGroupTemplates();
    renderLayoutGroupButtons();
    setDirty(true);
  }

  function writeLayoutGroupTemplates() {
    try {
      localStorage.setItem(LAYOUT_GROUPS_KEY, JSON.stringify(layoutGroupTemplates));
      return true;
    } catch {
      window.alert('This layout group could not be saved locally. Try using fewer items or a smaller image.');
      return false;
    }
  }

  function mergeLayoutGroupTemplates(incoming) {
    if (!Array.isArray(incoming) || !incoming.length) return;
    const allowed = incoming.filter((template) => !deletedLayoutGroupTemplateIds.has(template && template.id));
    layoutGroupTemplates = mergeLayoutGroupTemplateLists(layoutGroupTemplates, allowed);
    writeLayoutGroupTemplates();
    renderLayoutGroupButtons();
  }

  function closeLayoutGroupNameModal() {
    if (layoutGroupNameModal) layoutGroupNameModal.style.display = 'none';
    layoutGroupNameSubmit = null;
  }

  function closeLabelTextModal() {
    if (labelTextModal) labelTextModal.style.display = 'none';
    labelTextSubmit = null;
    labelTextCanCopy = false;
    if (labelTextCopy) labelTextCopy.style.display = 'none';
  }

  function requestLabelText(title, subtitle, value, onSubmit, appearance = {}, options = {}) {
    if (!labelTextModal || !labelTextInput) return;
    if (labelTextTitle) labelTextTitle.textContent = title;
    if (labelTextSubtitle) labelTextSubtitle.textContent = subtitle;
    labelTextInput.value = value || '';
    if (labelTextSize) labelTextSize.value = String(Math.max(8, Math.min(72, Number(appearance.fontSize) || 16)));
    if (labelTextColor) labelTextColor.value = appearance.labelColor || (darkMode ? '#f8f9fa' : '#212529');
    if (labelTextBold) labelTextBold.checked = String(appearance.fontStyle || '').includes('bold');
    if (labelTextItalic) labelTextItalic.checked = String(appearance.fontStyle || '').includes('italic');
    if (labelTextBorder) labelTextBorder.checked = !!appearance.labelBorder;
    labelTextCanCopy = !!options.canCopy;
    if (labelTextCopy) labelTextCopy.style.display = labelTextCanCopy ? '' : 'none';
    labelTextSubmit = onSubmit;
    labelTextModal.style.display = 'flex';
    requestAnimationFrame(() => { labelTextInput.focus(); labelTextInput.select(); });
  }

  function requestLayoutGroupName(title, value, onSubmit) {
    if (!layoutGroupNameModal || !layoutGroupNameInput) return;
    layoutGroupNameTitle.textContent = title;
    layoutGroupNameInput.value = value;
    layoutGroupNameSubmit = onSubmit;
    layoutGroupNameModal.style.display = 'flex';
    requestAnimationFrame(() => { layoutGroupNameInput.focus(); layoutGroupNameInput.select(); });
  }

  function renderLayoutGroupButtons() {
    return drawLayoutGroupButtons({ layoutGroupsList, getTemplates: () => layoutGroupTemplates, setTemplates: (templates) => { layoutGroupTemplates = templates; }, writeTemplates: writeLayoutGroupTemplates, removeTemplate: removeLayoutGroupTemplate, requestName: requestLayoutGroupName, confirmDelete: requestDeleteConfirmation, armPlacementTool, cloneConfig, pixelsPerFoot: FEET_TO_PX });
  }

  function renderCustomVenueButtons() {
    return drawCustomVenueButtons({ customVenuesList, getTemplates: () => customVenueTemplates, setTemplates: (templates) => { customVenueTemplates = templates; }, writeTemplates: writeCustomVenueTemplates, armPlacementTool, setAllVenueLayersLocked, openVenueBuilder, cloneConfig });
  }

  function updateVenueBuilderUI() {
    if (!Array.isArray(venueBuilder.points)) venueBuilder.points = [];
    if (venueBuilderPoints) {
      const selected = selectedVenueBuilderComponent();
      venueBuilderPoints.innerHTML = venueBuilder.components.length
        ? `${venueBuilder.components.length} part${venueBuilder.components.length === 1 ? '' : 's'}${selected ? ` · selected: ${selected.kind}` : ''}`
        : (venueBuilder.points.length ? venueBuilder.points.map((point, index) => `<button class="btn btn-link btn-sm p-0 me-2" type="button" data-venue-builder-remove="${index}" title="Remove point ${index + 1}">Point ${index + 1} ×</button>`).join('') : '0 parts');
      venueBuilderPoints.querySelectorAll('[data-venue-builder-remove]').forEach((button) => button.addEventListener('click', () => {
        venueBuilder.points.splice(parseInt(button.getAttribute('data-venue-builder-remove'), 10), 1); renderVenueBuilderDraft(); updateVenueBuilderUI();
      }));
    }
    if (venueBuilderSelect) venueBuilderSelect.classList.toggle('tool-active', venueBuilder.mode === 'select');
    if (venueBuilderTrace) venueBuilderTrace.classList.toggle('tool-active', venueBuilder.mode === 'trace');
    if (venueBuilderRectangle) venueBuilderRectangle.classList.toggle('tool-active', venueBuilder.mode === 'rectangle');
    if (venueBuilderCircle) venueBuilderCircle.classList.toggle('tool-active', venueBuilder.mode === 'circle');
    if (venueBuilderArc) venueBuilderArc.classList.toggle('tool-active', venueBuilder.mode === 'arc');
    if (venueBuilderLine) venueBuilderLine.classList.toggle('tool-active', venueBuilder.mode === 'line');
    if (venueBuilderDoor) venueBuilderDoor.classList.toggle('tool-active', venueBuilder.mode === 'door');
    if (venueBuilderOpening) venueBuilderOpening.classList.toggle('tool-active', venueBuilder.mode === 'opening');
    if (venueBuilderEraser) venueBuilderEraser.classList.toggle('tool-active', venueBuilder.mode === 'erase');
    if (venueBuilderPan) venueBuilderPan.classList.toggle('tool-active', venueBuilder.mode === 'pan');
    if (venueBuilderHint) venueBuilderHint.textContent = venueBuilder.mode === 'select'
        ? (selectedVenueBuilderComponent() && selectedVenueBuilderComponent().kind === 'arc'
          ? 'Drag the orange handle on the arc to resize it or pull it across the center to flip the opening.'
          : 'Click a shape to select it, then drag it to move.')
      : venueBuilder.mode === 'pan'
        ? 'Drag anywhere on the canvas to move your view. Zoom changes only with the Zoom in and Zoom out buttons.'
      : venueBuilder.mode === 'door' || venueBuilder.mode === 'opening'
        ? `Click a wall to add a ${venueBuilder.mode}. Drag it along the wall or click its width label.`
      : venueBuilder.mode === 'erase'
        ? (inventoryBuilderMode ? 'Click a line to erase that line from the item.' : 'Click a shape to erase the entire shape, including its walls, points, doors, and openings.')
      : venueBuilder.mode === 'trace'
        ? 'Click each venue corner. Click the first point again to finish tracing.'
        : venueBuilder.mode === 'rectangle' || venueBuilder.mode === 'circle' || venueBuilder.mode === 'line'
          ? 'Press, drag, and release on the canvas to draw this shape.'
          : venueBuilder.mode === 'arc'
            ? 'Press and drag from the arc center to set its radius. The open section remains clear for an entrance or opening.'
          : venueBuilder.selectedWalls.length
            ? `${venueBuilder.selectedWalls.length} wall${venueBuilder.selectedWalls.length === 1 ? '' : 's'} selected. Click Delete wall to remove the selected wall${venueBuilder.selectedWalls.length === 1 ? '' : 's'}.`
            : 'Choose a shape to add a room or wall. Select / move lets you choose a wall; Delete removes the whole selected shape.';
  }

  function makeVenueBuilderRectangle(minX, minY, maxX, maxY) {
    return rectanglePoints({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
  }

  function venueBuilderBounds(points = venueBuilder.points) {
    return pointsBounds(points);
  }

  function newVenueBuilderComponent(kind, points, closed = !['arc', 'line'].includes(kind)) { return { id: `venue-part-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind, closed, points: cloneConfig(points) || [] }; }
  function selectedVenueBuilderComponent() { return venueBuilder.components.find((component) => component.id === venueBuilder.selectedId) || null; }
  function pushVenueBuilderHistory() {
    venueBuilder.history.push({ components: cloneConfig(venueBuilder.components), doors: cloneConfig(venueBuilder.doors), selectedId: venueBuilder.selectedId, selectedWalls: cloneConfig(venueBuilder.selectedWalls) });
    if (venueBuilder.history.length > 50) venueBuilder.history.shift();
  }
  function undoVenueBuilderAction() {
    // Drafts and completed shapes are each one action. Never step through
    // generated arc/circle vertices or hand-drawn polygon points one by one.
    if (venueBuilder.points.length && !venueBuilder.selectedId) { venueBuilder.points = []; renderVenueBuilderDraft(); updateVenueBuilderUI(); return; }
    const previous = venueBuilder.history.pop(); if (!previous) return;
    venueBuilder.components = previous.components || []; venueBuilder.doors = previous.doors || []; venueBuilder.selectedId = previous.selectedId || null; venueBuilder.selectedWalls = previous.selectedWalls || [];
    const selected = selectedVenueBuilderComponent(); venueBuilder.points = selected ? cloneConfig(selected.points) : [];
    renderVenueBuilderDraft(); updateVenueBuilderUI();
  }
  function beginVenueBuilderComponent(kind) {
    venueBuilder.mode = kind; venueBuilder.shapeKind = kind === 'trace' ? 'polygon' : kind; venueBuilder.points = [];
    venueBuilder.draftComponentId = null; venueBuilder.selectedId = null; venueBuilder.selectedWalls = []; clearVenueBuilderPreview(); renderVenueBuilderDraft(); updateVenueBuilderUI();
  }
  function commitVenueBuilderComponent(kind = venueBuilder.shapeKind, keepSelected = false, closed = !['arc', 'line'].includes(kind)) {
    if (!Array.isArray(venueBuilder.points) || venueBuilder.points.length < (kind === 'line' ? 2 : 3)) return false;
    pushVenueBuilderHistory();
    const component = newVenueBuilderComponent(kind, venueBuilder.points, closed);
    venueBuilder.components.push(component); venueBuilder.selectedId = keepSelected ? component.id : null; venueBuilder.draftComponentId = keepSelected ? component.id : null; venueBuilder.points = keepSelected ? cloneConfig(component.points) : []; venueBuilder.shapeKind = component.kind;
    return true;
  }

  function finalizeVenueBuilderDraft() {
    const mode = venueBuilder.mode;
    if (['rectangle', 'circle', 'arc', 'line'].includes(mode) && venueBuilder.primitiveStart) {
      const end = venueBuilder.primitiveEnd || venueBuilder.primitiveStart;
      venueBuilder.points = buildVectorShape(mode, venueBuilder.primitiveStart, end);
      venueBuilder.shapeKind = mode; commitVenueBuilderComponent(mode);
    } else if (mode === 'trace' && venueBuilder.points.length >= 2 && !venueBuilder.selectedId) commitVenueBuilderComponent('polygon', false, false);
    venueBuilder.primitiveStart = null; venueBuilder.primitiveEnd = null; clearVenueBuilderPreview();
  }

  function lockVenueBuilderSelection() {
    venueBuilder.selectedId = null; venueBuilder.selectedWalls = []; venueBuilder.draftComponentId = null; venueBuilder.points = [];
  }
  function selectVenueBuilderComponent(id) {
    const component = venueBuilder.components.find((item) => item.id === id); if (!component) return;
    venueBuilder.selectedId = id; venueBuilder.draftComponentId = id; venueBuilder.shapeKind = component.kind; venueBuilder.points = cloneConfig(component.points); renderVenueBuilderDraft(); updateVenueBuilderUI();
  }
  function syncSelectedVenueBuilderComponent() { const component = selectedVenueBuilderComponent(); if (component) component.points = cloneConfig(venueBuilder.points); }
  function venueBuilderAllBounds() { return venueBuilderBounds(venueBuilder.components.flatMap((component) => component.points || [])); }

  function clearVenueBuilderDraft() {
    if (venueBuilder.draftNode) venueBuilder.draftNode.destroy();
    venueBuilder.draftNode = null;
    if (venueBuilder.layer) venueBuilder.layer.batchDraw();
  }

  function clearVenueBuilderPreview() {
    if (venueBuilder.previewNode) venueBuilder.previewNode.destroy();
    venueBuilder.previewNode = null;
    if (venueBuilder.layer) venueBuilder.layer.batchDraw();
  }

  function venueBuilderPointerFeet() {
    const point = venueBuilder.stage && venueBuilder.stage.getPointerPosition();
    return point ? { x: (point.x - venueBuilder.pan.x) / venueBuilder.zoom / FEET_TO_PX, y: (point.y - venueBuilder.pan.y) / venueBuilder.zoom / FEET_TO_PX } : null;
  }

  function venueBuilderEventPoint(event) {
    if (!builderSnapEnabled()) return venueBuilderPointerFeet();
    let target = event && event.target;
    while (target) {
      if (target.hasName && (target.hasName('venueBuilderVertex') || target.hasName('venueBuilderSnapPoint'))) {
        const x = target.getAttr && target.getAttr('snapXFt'); const y = target.getAttr && target.getAttr('snapYFt');
        if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
      }
      target = target.getParent && target.getParent();
    }
    return snapVenueBuilderPoint(venueBuilderPointerFeet());
  }

  function snapVenueBuilderPoint(point) {
    if (!point) return point;
    if (!builderSnapEnabled()) return { x: point.x, y: point.y };
    let closest = null;
    const snapPoints = [
      ...venueBuilder.components.flatMap((component) => component.points || []),
      ...(venueBuilder.selectedId ? [] : (venueBuilder.points || [])),
    ];
    snapPoints.forEach((vertex) => {
      const distance = Math.hypot(vertex.x - point.x, vertex.y - point.y);
      if (distance <= 1.25 && (!closest || distance < closest.distance)) closest = { ...vertex, distance };
    });
    if (closest) return { x: closest.x, y: closest.y };
    let closestEdge = null;
    venueBuilder.components.forEach((component) => {
      const wall = closestVenueBuilderWall(point, component);
      if (wall && wall.distance <= 1.25 && (!closestEdge || wall.distance < closestEdge.distance)) closestEdge = wall;
    });
    if (closestEdge) return { x: closestEdge.x, y: closestEdge.y };
    const step = inventoryBuilderMode ? 0.25 : 0.5;
    return { x: Math.round(point.x / step) * step, y: Math.round(point.y / step) * step };
  }

  function builderSnapEnabled() {
    const toggle = inventoryBuilderMode ? customItemSnap : venueBuilderSnap;
    return !toggle || toggle.checked;
  }

  function applyVenueBuilderView() {
    if (!venueBuilder.layer) return;
    venueBuilder.layer.scale({ x: venueBuilder.zoom, y: venueBuilder.zoom }); venueBuilder.layer.position(venueBuilder.pan); venueBuilder.layer.batchDraw();
  }

  function zoomVenueBuilder(factor, anchor = null) {
    if (!venueBuilder.stage) return;
    const oldZoom = venueBuilder.zoom, next = Math.max(.35, Math.min(inventoryBuilderMode ? 20 : 4, oldZoom * factor));
    const point = anchor || { x: venueBuilder.stage.width() / 2, y: venueBuilder.stage.height() / 2 };
    const worldX = (point.x - venueBuilder.pan.x) / oldZoom, worldY = (point.y - venueBuilder.pan.y) / oldZoom;
    venueBuilder.zoom = next; venueBuilder.pan = { x: point.x - worldX * next, y: point.y - worldY * next }; applyVenueBuilderView();
  }

  function resetVenueBuilderView() { venueBuilder.zoom = inventoryBuilderMode ? 8 : 1; venueBuilder.pan = { x: 0, y: 0 }; applyVenueBuilderView(); }

  function renderVenueBuilderPreview(kind, a, b) {
    if (!venueBuilder.layer || !a || !b) return;
    clearVenueBuilderPreview();
    const visualScale = inventoryBuilderMode ? 1 / venueBuilder.zoom : 1;
    const common = { stroke: '#0d6efd', strokeWidth: 2 * visualScale, dash: [6 * visualScale, 4 * visualScale], fill: 'rgba(13,110,253,.12)', listening: false };
    if (kind === 'rectangle') {
      venueBuilder.previewNode = new Konva.Rect({ ...common, x: Math.min(a.x, b.x) * FEET_TO_PX, y: Math.min(a.y, b.y) * FEET_TO_PX, width: Math.abs(b.x - a.x) * FEET_TO_PX, height: Math.abs(b.y - a.y) * FEET_TO_PX });
    } else if (kind === 'circle') {
      venueBuilder.previewNode = new Konva.Circle({ ...common, x: a.x * FEET_TO_PX, y: a.y * FEET_TO_PX, radius: Math.hypot(b.x - a.x, b.y - a.y) * FEET_TO_PX });
    } else if (kind === 'arc') {
      const points = buildVectorShape('arc', a, b).flatMap((point) => [point.x * FEET_TO_PX, point.y * FEET_TO_PX]);
      venueBuilder.previewNode = new Konva.Line({ ...common, points, closed: false, fillEnabled: false, strokeWidth: 4 * visualScale, lineCap: 'round' });
    } else {
      venueBuilder.previewNode = new Konva.Line({ ...common, points: [a.x * FEET_TO_PX, a.y * FEET_TO_PX, b.x * FEET_TO_PX, b.y * FEET_TO_PX], fillEnabled: false, strokeWidth: 4 * visualScale });
    }
    venueBuilder.layer.add(venueBuilder.previewNode); venueBuilder.previewNode.moveToTop(); venueBuilder.layer.batchDraw();
  }

  function ensureVenueBuilderStage() {
    if (!venueBuilderCanvas || !window.Konva) return false;
    const width = Math.max(320, venueBuilderCanvas.clientWidth);
    const height = Math.max(320, venueBuilderCanvas.clientHeight);
    if (venueBuilder.stage) { venueBuilder.stage.size({ width, height }); return true; }
    venueBuilder.stage = new Konva.Stage({ container: venueBuilderCanvas, width, height });
    venueBuilder.layer = new Konva.Layer(); venueBuilder.stage.add(venueBuilder.layer);
    venueBuilder.grid = new Konva.Group({ name: 'wizardGrid', listening: false }); venueBuilder.layer.add(venueBuilder.grid);
    const pointerFeet = venueBuilderPointerFeet;
    const isDragShape = () => ['rectangle', 'circle', 'arc', 'line'].includes(venueBuilder.mode);
    const clientPoint = (event) => {
      const source = event && event.evt || {};
      const touch = source.touches && source.touches[0] || source.changedTouches && source.changedTouches[0] || source;
      return { x: Number(touch.clientX) || 0, y: Number(touch.clientY) || 0 };
    };
    venueBuilder.stage.on('mousedown touchstart', (event) => {
      if (!venueBuilder.open) return;
      if (venueBuilder.mode === 'pan' || (event.evt && event.evt.button === 1)) {
        const point = clientPoint(event); venueBuilder.panning = { x: point.x, y: point.y, pan: { ...venueBuilder.pan } };
        if (event.evt) event.evt.preventDefault();
        return;
      }
      if (!venueBuilder.mode) return;
      const startsOnSnapPoint = !!(event.target && event.target.hasName && (event.target.hasName('venueBuilderVertex') || event.target.hasName('venueBuilderSnapPoint')));
      if (startsOnSnapPoint && venueBuilder.mode === 'select') return;
      let targetNode = event.target;
      while (targetNode) {
        // A dimension tag is an editor control, not a canvas point.  Stop its
        // press here (before the later click event opens the prompt) so it
        // cannot accidentally feed a point into the active drawing tool.
        if (targetNode.hasName && targetNode.hasName('venueDimensionLabel')) { event.cancelBubble = true; return; }
        if (venueBuilder.mode === 'select' && !startsOnSnapPoint && targetNode.hasName && (targetNode.hasName('venueBuilderComponent') || targetNode.hasName('venueBuilderDoor'))) return;
        targetNode = targetNode.getParent && targetNode.getParent();
      }
      if (venueBuilder.mode === 'select' || venueBuilder.mode === 'door' || venueBuilder.mode === 'opening' || venueBuilder.mode === 'deleteWall' || venueBuilder.mode === 'erase') return;
      const point = venueBuilderEventPoint(event);
      if (!point) return;
      event.evt.preventDefault();
      if (isDragShape()) { lockVenueBuilderSelection(); venueBuilder.primitiveStart = point; venueBuilder.primitiveEnd = point; renderVenueBuilderPreview(venueBuilder.mode, point, point); updateVenueBuilderUI(); return; }
      handleVenueBuilderStagePoint(point);
    });
    venueBuilder.stage.on('mousemove touchmove', (event) => {
      if (venueBuilder.panning && event.evt) { const point = clientPoint(event); venueBuilder.pan = { x: venueBuilder.panning.pan.x + point.x - venueBuilder.panning.x, y: venueBuilder.panning.pan.y + point.y - venueBuilder.panning.y }; applyVenueBuilderView(); return; }
      if (!venueBuilder.open || !venueBuilder.primitiveStart || !isDragShape()) return;
      const point = snapVenueBuilderPoint(pointerFeet()); if (!point) return;
      venueBuilder.primitiveEnd = point; event.evt.preventDefault(); renderVenueBuilderPreview(venueBuilder.mode, venueBuilder.primitiveStart, point);
    });
    venueBuilder.stage.on('mouseup touchend', (event) => {
      if (venueBuilder.panning) { venueBuilder.panning = false; return; }
      if (!venueBuilder.open || !venueBuilder.primitiveStart || !isDragShape()) return;
      const point = venueBuilderEventPoint(event) || venueBuilder.primitiveStart;
      event.evt.preventDefault();
      venueBuilder.points = buildVectorShape(venueBuilder.mode, venueBuilder.primitiveStart, point);
      venueBuilder.shapeKind = venueBuilder.mode; venueBuilder.primitiveStart = null; venueBuilder.primitiveEnd = null; commitVenueBuilderComponent(venueBuilder.mode, true);
      // A completed primitive is immediately ready to edit. Leaving Rectangle,
      // Arc, etc. active made the just-created component non-draggable.
      venueBuilder.mode = 'select';
      clearVenueBuilderPreview(); renderVenueBuilderDraft(); updateVenueBuilderUI();
    });
    // Trackpads and mouse wheels should never change this canvas scale. This
    // prevents accidental zooming while drawing; the View buttons own zoom.
    venueBuilder.stage.on('wheel', (event) => { if (!venueBuilder.open) return; event.evt.preventDefault(); });
    return true;
  }

  function drawVenueBuilderGrid() {
    if (!venueBuilder.grid || !venueBuilder.stage) return;
    venueBuilder.grid.destroyChildren();
    const span = 2500;
    const gridStepPx = (inventoryBuilderMode ? 1 : 5) * FEET_TO_PX;
    for (let x = -span; x <= span; x += gridStepPx) venueBuilder.grid.add(new Konva.Line({ points: [x, -span, x, span], stroke: '#e2e8f0', strokeWidth: 1 }));
    for (let y = -span; y <= span; y += gridStepPx) venueBuilder.grid.add(new Konva.Line({ points: [-span, y, span, y], stroke: '#e2e8f0', strokeWidth: 1 }));
  }

  function formatFeet(value) { return `${Math.round(value * 100) / 100} ft`; }

  function requestVenueBuilderDimension(label, current, apply) {
    if (!(venueBuilderDimensionEditor && venueBuilderDimensionInput && venueBuilderDimensionApply && venueBuilderDimensionCancel)) return;
    venueBuilderDimensionLabel.textContent = label;
    venueBuilderDimensionInput.value = String(Math.round(current * 100) / 100);
    venueBuilderDimensionEditor.style.display = '';
    const close = () => { venueBuilderDimensionEditor.style.display = 'none'; venueBuilderDimensionInput.onkeydown = null; };
    const submit = () => {
      const value = Number(venueBuilderDimensionInput.value);
      if (!Number.isFinite(value) || value <= 0) { venueBuilderDimensionInput.focus(); venueBuilderDimensionInput.reportValidity(); return; }
      close(); apply(value);
    };
    venueBuilderDimensionApply.onclick = submit;
    venueBuilderDimensionCancel.onclick = close;
    venueBuilderDimensionInput.onkeydown = (event) => { if (event.key === 'Enter') { event.preventDefault(); submit(); } else if (event.key === 'Escape') { event.preventDefault(); close(); } };
    venueBuilderDimensionInput.focus(); venueBuilderDimensionInput.select();
  }

  function editVenueBuilderEdge(index) {
    const points = venueBuilder.points;
    const a = points[index], b = points[(index + 1) % points.length];
    if (!a || !b) return;
    const current = Math.hypot(b.x - a.x, b.y - a.y);
    requestVenueBuilderDimension('Set this side length (ft)', current, (next) => {
      if (venueBuilder.shapeKind === 'rectangle') {
        const bounds = venueBuilderBounds();
        const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
        if (horizontal) bounds.maxX = bounds.minX + next;
        else bounds.maxY = bounds.minY + next;
        venueBuilder.points = makeVenueBuilderRectangle(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY);
        syncSelectedVenueBuilderComponent(); renderVenueBuilderDraft(); updateVenueBuilderUI(); return;
      }
      const factor = next / current;
      points[(index + 1) % points.length] = { x: a.x + (b.x - a.x) * factor, y: a.y + (b.y - a.y) * factor };
      syncSelectedVenueBuilderComponent(); renderVenueBuilderDraft(); updateVenueBuilderUI();
    });
  }

  function editVenueBuilderRadius() {
    const points = venueBuilder.points;
    if (!points.length) return;
    const cx = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const cy = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    const current = points.reduce((sum, point) => sum + Math.hypot(point.x - cx, point.y - cy), 0) / points.length;
    const entered = window.prompt('Set circle radius in feet', String(Math.round(current * 100) / 100));
    if (entered === null) return;
    const next = parseFloat(entered);
    if (!Number.isFinite(next) || next <= 0) return window.alert('Enter a positive radius in feet.');
    const factor = next / current;
    venueBuilder.points = points.map((point) => ({ x: cx + (point.x - cx) * factor, y: cy + (point.y - cy) * factor }));
    syncSelectedVenueBuilderComponent(); renderVenueBuilderDraft(); updateVenueBuilderUI();
  }

  function editVenueBuilderArcRadius() {
    const circle = circleFromArcPoints(venueBuilder.points); if (!circle || !circle.radius) return;
    const entered = window.prompt('Set arc radius in feet', String(Math.round(circle.radius * 100) / 100));
    if (entered === null) return;
    const next = parseFloat(entered); if (!Number.isFinite(next) || next <= 0) return window.alert('Enter a positive radius in feet.');
    const factor = next / circle.radius;
    venueBuilder.points = venueBuilder.points.map((point) => ({ x: circle.x + (point.x - circle.x) * factor, y: circle.y + (point.y - circle.y) * factor }));
    syncSelectedVenueBuilderComponent(); renderVenueBuilderDraft(); updateVenueBuilderUI();
  }

  function rotateVenueBuilderComponent(component, center, deltaRadians) {
    component.points = rotatePoints(component.points, center, deltaRadians);
    component.rotationDeg = normaliseDegrees((Number(component.rotationDeg) || 0) + deltaRadians * 180 / Math.PI);
  }

  function editVenueBuilderRotation() {
    const component = selectedVenueBuilderComponent(); if (!component || component.kind === 'circle') return;
    const current = normaliseDegrees(Number(component.rotationDeg) || 0);
    const entered = window.prompt('Set rotation in degrees', String(Math.round(current * 100) / 100));
    if (entered === null) return;
    const target = parseFloat(entered); if (!Number.isFinite(target)) return window.alert('Enter a valid angle in degrees.');
    const center = component.kind === 'arc' ? circleFromArcPoints(component.points) : (() => { const bounds = venueBuilderBounds(component.points); return bounds && { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }; })();
    if (!center) return;
    pushVenueBuilderHistory(); rotateVenueBuilderComponent(component, center, (normaliseDegrees(target) - current) * Math.PI / 180);
    venueBuilder.points = cloneConfig(component.points); renderVenueBuilderDraft(); updateVenueBuilderUI();
  }

  function addVenueBuilderDimensionLabel(group, text, x, y, onClick) {
    const label = new Konva.Label({ x, y, listening: true, name: 'venueDimensionLabel' });
    const scale = inventoryBuilderMode ? 1 / venueBuilder.zoom : 1;
    label.scale({ x: scale, y: scale });
    label.add(new Konva.Tag({ fill: '#102a56', stroke: '#75a7f5', strokeWidth: 1, cornerRadius: 3, pointerDirection: 'down', pointerWidth: 5, pointerHeight: 4 }));
    label.add(new Konva.Text({ text, fontSize: 12, padding: 4, fill: '#fff', fontStyle: 'bold' }));
    label.on('click tap', (event) => { event.cancelBubble = true; onClick(); });
    group.add(label);
  }

  function renderVenueBuilderDimensions(group) {
    const points = venueBuilder.points;
    const visualScale = inventoryBuilderMode ? 1 / venueBuilder.zoom : 1;
    if ((venueBuilder.shapeKind === 'circle' || venueBuilder.shapeKind === 'arc') && points.length >= 3) {
      const cx = points.reduce((sum, point) => sum + point.x, 0) / points.length;
      const cy = points.reduce((sum, point) => sum + point.y, 0) / points.length;
      const radius = points.reduce((sum, point) => sum + Math.hypot(point.x - cx, point.y - cy), 0) / points.length;
      if (venueBuilder.shapeKind === 'circle') addVenueBuilderDimensionLabel(group, `R: ${formatFeet(radius)}`, (cx + radius) * FEET_TO_PX, cy * FEET_TO_PX - 12 * visualScale, editVenueBuilderRadius);
      else {
        const arc = circleFromArcPoints(points);
        if (arc) addVenueBuilderDimensionLabel(group, `R: ${formatFeet(arc.radius)}`, (arc.x + arc.radius) * FEET_TO_PX, arc.y * FEET_TO_PX - 12 * visualScale, editVenueBuilderArcRadius);
      }
      return;
    }
    const selected = selectedVenueBuilderComponent();
    const edgeCount = selected && selected.closed === false ? Math.max(0, points.length - 1) : points.length;
    points.slice(0, edgeCount).forEach((a, index) => {
      if (selected && (selected.removedWalls || []).includes(index)) return;
      const b = points[(index + 1) % points.length];
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
      if (length < .05) return;
      const offset = 12 * visualScale, mx = (a.x + b.x) / 2 * FEET_TO_PX, my = (a.y + b.y) / 2 * FEET_TO_PX;
      addVenueBuilderDimensionLabel(group, formatFeet(length), mx + (-dy / length) * offset, my + (dx / length) * offset, () => editVenueBuilderEdge(index));
    });
  }

  function wallAt(component, wallIndex) {
    const points = component && component.points || []; const a = points[wallIndex]; const b = points[(wallIndex + 1) % points.length];
    return a && b ? { a, b } : null;
  }

  function closestVenueBuilderWall(point, component) {
    let closest = null;
    const points = component.points || [];
    const edgeCount = component.closed === false ? Math.max(0, points.length - 1) : points.length;
    points.slice(0, edgeCount).forEach((a, index) => {
      if ((component.removedWalls || []).includes(index)) return;
      const b = component.points[(index + 1) % component.points.length]; const dx = b.x - a.x, dy = b.y - a.y, lengthSq = dx * dx + dy * dy;
      if (!lengthSq) return;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
      const x = a.x + dx * t, y = a.y + dy * t, distance = Math.hypot(point.x - x, point.y - y);
      if (!closest || distance < closest.distance) closest = { index, t, x, y, distance };
    });
    return closest;
  }

  function venueBuilderVertexHasWall(component, index) {
    const points = component && component.points || []; if (!points.length) return false;
    const removed = new Set(component.removedWalls || []);
    const edgeCount = component.closed === false ? Math.max(0, points.length - 1) : points.length;
    const outgoing = index < edgeCount && !removed.has(index);
    const incomingIndex = index - 1 < 0 ? (component.closed === false ? -1 : edgeCount - 1) : index - 1;
    const incoming = incomingIndex >= 0 && incomingIndex < edgeCount && !removed.has(incomingIndex);
    return outgoing || incoming;
  }

  function cleanVenueBuilderOrphanVertices(component) {
    const points = component && component.points || [];
    component.orphanPoints = points.map((_, index) => !venueBuilderVertexHasWall(component, index));
    const edgeCount = component.closed === false ? Math.max(0, points.length - 1) : points.length;
    const hasWalls = Array.from({ length: edgeCount }, (_, index) => !(component.removedWalls || []).includes(index)).some(Boolean);
    if (!hasWalls) eraseVenueBuilderComponent(component.id, false);
  }

  function deleteVenueBuilderWall(componentId, point) {
    const component = venueBuilder.components.find((item) => item.id === componentId); if (!component) return;
    const wall = closestVenueBuilderWall(point, component); if (!wall) return;
    deleteVenueBuilderWallByIndex(componentId, wall.index);
  }

  function eraseVenueBuilderComponent(componentId, recordHistory = true) {
    if (recordHistory) pushVenueBuilderHistory();
    venueBuilder.components = venueBuilder.components.filter((component) => component.id !== componentId);
    venueBuilder.doors = venueBuilder.doors.filter((door) => door.componentId !== componentId);
    if (venueBuilder.selectedId === componentId) { venueBuilder.selectedId = null; venueBuilder.points = []; }
    venueBuilder.selectedWalls = venueBuilder.selectedWalls.filter((wall) => wall.componentId !== componentId);
    renderVenueBuilderDraft(); updateVenueBuilderUI();
  }

  function deleteVenueBuilderWallByIndex(componentId, wallIndex) {
    const component = venueBuilder.components.find((item) => item.id === componentId); if (!component) return;
    pushVenueBuilderHistory();
    component.removedWalls = Array.from(new Set([...(component.removedWalls || []), wallIndex]));
    venueBuilder.doors = venueBuilder.doors.filter((door) => !(door.componentId === componentId && door.wallIndex === wallIndex));
    cleanVenueBuilderOrphanVertices(component);
    if (!venueBuilder.components.includes(component)) return;
    venueBuilder.selectedWalls = venueBuilder.selectedWalls.filter((wall) => !(wall.componentId === componentId && wall.wallIndex === wallIndex)); selectVenueBuilderComponent(componentId);
  }

  function selectVenueBuilderWall(componentId, point, append = false) {
    const component = venueBuilder.components.find((item) => item.id === componentId); if (!component) return;
    const wall = closestVenueBuilderWall(point, component); if (!wall) return;
    venueBuilder.selectedId = componentId; venueBuilder.draftComponentId = componentId; venueBuilder.shapeKind = component.kind; venueBuilder.points = cloneConfig(component.points);
    const alreadySelected = venueBuilder.selectedWalls.some((item) => item.componentId === componentId && item.wallIndex === wall.index);
    if (append) venueBuilder.selectedWalls = alreadySelected
      ? venueBuilder.selectedWalls.filter((item) => !(item.componentId === componentId && item.wallIndex === wall.index))
      : [...venueBuilder.selectedWalls, { componentId, wallIndex: wall.index }];
    else venueBuilder.selectedWalls = [{ componentId, wallIndex: wall.index }];
    renderVenueBuilderDraft(); updateVenueBuilderUI();
  }

  function addVenueBuilderDoor(componentId, point, type) {
    const component = venueBuilder.components.find((item) => item.id === componentId); if (!component) return;
    const wall = closestVenueBuilderWall(point, component); if (!wall) return;
    venueBuilder.doors.push({ id: `venue-door-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, componentId, wallIndex: wall.index, t: wall.t, widthFt: 3 });
    renderVenueBuilderDraft(); updateVenueBuilderUI();
  }

  function renderVenueBuilderDoor(parent, door, editable) {
    const component = venueBuilder.components.find((item) => item.id === door.componentId); const wall = wallAt(component, door.wallIndex); if (!wall) return;
    const dx = wall.b.x - wall.a.x, dy = wall.b.y - wall.a.y, length = Math.hypot(dx, dy); if (!length) return;
    const ux = dx / length, uy = dy / length, t = Math.max(0, Math.min(1, Number(door.t) || 0));
    const x = wall.a.x + dx * t, y = wall.a.y + dy * t, half = Math.min((Number(door.widthFt) || 3) / 2, length / 2);
    const group = new Konva.Group({ x: x * FEET_TO_PX, y: y * FEET_TO_PX, rotation: Math.atan2(dy, dx) * 180 / Math.PI, draggable: editable, name: 'venueBuilderDoor' });
    group.add(new Konva.Line({ points: [-half * FEET_TO_PX, 0, half * FEET_TO_PX, 0], stroke: '#fff', strokeWidth: 7, lineCap: 'round' }));
    group.add(new Konva.Line({ points: [-half * FEET_TO_PX, 0, half * FEET_TO_PX, 0], stroke: door.type === 'door' ? '#198754' : '#f59e0b', strokeWidth: 3, lineCap: 'round' }));
    if (door.type === 'door') group.add(new Konva.Line({ points: [-half * FEET_TO_PX, 0, -half * FEET_TO_PX, -half * FEET_TO_PX, 0, -half * FEET_TO_PX], stroke: '#198754', strokeWidth: 2 }));
    group.on('dragend', () => {
      const candidate = { x: group.x() / FEET_TO_PX, y: group.y() / FEET_TO_PX }; const nearest = closestVenueBuilderWall(candidate, component); if (nearest) { door.wallIndex = nearest.index; door.t = nearest.t; }
      renderVenueBuilderDraft();
    });
    addVenueBuilderDimensionLabel(group, formatFeet(Number(door.widthFt) || 3), 0, -18, () => {
      const entered = window.prompt(`Set ${door.type} width in feet`, String(Number(door.widthFt) || 3)); if (entered === null) return;
      const width = parseFloat(entered); if (!Number.isFinite(width) || width <= 0) return window.alert('Enter a positive number of feet.'); door.widthFt = width; renderVenueBuilderDraft();
    });
    parent.add(group);
  }

  function renderVenueBuilderDraft() {
    if (!Array.isArray(venueBuilder.points)) venueBuilder.points = [];
    clearVenueBuilderDraft(); if (!venueBuilder.layer) return;
    const visualScale = inventoryBuilderMode ? 1 / venueBuilder.zoom : 1;
    const root = new Konva.Group({ listening: true, name: 'venueBuilderDraft' });
    venueBuilder.components.forEach((component) => {
      const points = component.points || []; if (points.length < (component.closed === false || component.kind === 'line' ? 2 : 3)) return;
      const flat = points.flatMap((point) => [point.x * FEET_TO_PX, point.y * FEET_TO_PX]); const isSelected = component.id === venueBuilder.selectedId;
      const group = new Konva.Group({ draggable: venueBuilder.mode === 'select', name: 'venueBuilderComponent' });
      const closed = component.closed !== false;
      const edgeCount = closed ? points.length : Math.max(0, points.length - 1);
      if (!(component.removedWalls || []).length) group.add(new Konva.Line({ points: flat, stroke: isSelected ? '#198754' : '#0d6efd', strokeWidth: (isSelected ? 2 : 1.5) * visualScale, hitStrokeWidth: 32 * visualScale, dash: [7 * visualScale, 4 * visualScale], closed, fill: closed ? (isSelected ? 'rgba(25,135,84,.10)' : 'rgba(13,110,253,.08)') : undefined }));
      else {
        group.add(new Konva.Line({ points: flat, closed, fill: closed ? (isSelected ? 'rgba(25,135,84,.10)' : 'rgba(13,110,253,.08)') : undefined, strokeEnabled: false, listening: true }));
        points.slice(0, edgeCount).forEach((a, index) => {
          if ((component.removedWalls || []).includes(index)) return;
          const b = points[(index + 1) % points.length];
          group.add(new Konva.Line({ points: [a.x * FEET_TO_PX, a.y * FEET_TO_PX, b.x * FEET_TO_PX, b.y * FEET_TO_PX], stroke: isSelected ? '#198754' : '#0d6efd', strokeWidth: (isSelected ? 2 : 1.5) * visualScale, dash: [7 * visualScale, 4 * visualScale], hitStrokeWidth: 14 * visualScale }));
        });
      }
      points.slice(0, edgeCount).forEach((a, index) => {
        if ((component.removedWalls || []).includes(index)) return;
        const b = points[(index + 1) % points.length];
        const edgeHit = new Konva.Line({ points: [a.x * FEET_TO_PX, a.y * FEET_TO_PX, b.x * FEET_TO_PX, b.y * FEET_TO_PX], stroke: 'rgba(0,0,0,.025)', strokeWidth: 30, hitStrokeWidth: 38, lineCap: 'round', name: 'venueBuilderWallHit' });
        edgeHit.on('click tap', (event) => {
          event.cancelBubble = true;
          const point = venueBuilderPointerFeet();
          if (venueBuilder.mode === 'door' || venueBuilder.mode === 'opening') addVenueBuilderDoor(component.id, point, venueBuilder.mode);
          else if (venueBuilder.mode === 'erase') {
            if (inventoryBuilderMode) deleteVenueBuilderWallByIndex(component.id, index);
            else eraseVenueBuilderComponent(component.id);
          }
          else selectVenueBuilderWall(component.id, point, !!(event.evt && event.evt.shiftKey));
        }); group.add(edgeHit);
      });
      venueBuilder.selectedWalls.filter((wall) => wall.componentId === component.id).forEach((wall) => {
        const selectedWall = wallAt(component, wall.wallIndex);
        if (selectedWall) group.add(new Konva.Line({ points: [selectedWall.a.x * FEET_TO_PX, selectedWall.a.y * FEET_TO_PX, selectedWall.b.x * FEET_TO_PX, selectedWall.b.y * FEET_TO_PX], stroke: '#f59e0b', strokeWidth: 2 * visualScale, lineCap: 'round', hitStrokeWidth: 16 * visualScale, name: 'venueBuilderSelectedWall' }));
      });
      group.on('click tap', (event) => {
        event.cancelBubble = true;
        const point = venueBuilderPointerFeet();
        if (venueBuilder.mode === 'door' || venueBuilder.mode === 'opening') addVenueBuilderDoor(component.id, point, venueBuilder.mode);
        else if (venueBuilder.mode === 'erase') {
          if (inventoryBuilderMode) deleteVenueBuilderWall(component.id, point);
          else eraseVenueBuilderComponent(component.id);
        }
        else selectVenueBuilderWall(component.id, point, !!(event.evt && event.evt.shiftKey));
      });
      group.on('dragstart', () => pushVenueBuilderHistory());
      group.on('dragend', () => {
        const snapEnabled = builderSnapEnabled();
        const snapStep = inventoryBuilderMode ? 0.25 : 0.5;
        const dx = snapEnabled ? Math.round(group.x() / FEET_TO_PX / snapStep) * snapStep : group.x() / FEET_TO_PX;
        const dy = snapEnabled ? Math.round(group.y() / FEET_TO_PX / snapStep) * snapStep : group.y() / FEET_TO_PX;
        component.points = component.points.map((point) => ({ x: point.x + dx, y: point.y + dy })); group.position({ x: 0, y: 0 }); selectVenueBuilderComponent(component.id);
      });
      root.add(group);
      component.points.forEach((point, index) => {
        if (!venueBuilderVertexHasWall(component, index)) return;
        if (!isSelected || component.kind === 'circle' || component.kind === 'arc') {
          // Selected arcs must remain draggable; their many generated snap
          // dots cannot sit on top and intercept the drag.
          const snapPoint = new Konva.Circle({ x: point.x * FEET_TO_PX, y: point.y * FEET_TO_PX, radius: 6 * visualScale, fill: '#94a3b8', stroke: '#fff', strokeWidth: visualScale, hitStrokeWidth: 18 * visualScale, listening: !isSelected, name: 'venueBuilderSnapPoint', snapXFt: point.x, snapYFt: point.y });
          snapPoint.on('click tap', (event) => { if (venueBuilder.mode === 'select') { event.cancelBubble = true; selectVenueBuilderComponent(component.id); } });
          root.add(snapPoint);
          return;
        }
        const marker = new Konva.Circle({ x: point.x * FEET_TO_PX, y: point.y * FEET_TO_PX, radius: 6 * visualScale, fill: index === 0 ? '#198754' : '#0d6efd', stroke: '#fff', strokeWidth: visualScale, draggable: true, name: 'venueBuilderVertex', snapXFt: point.x, snapYFt: point.y });
        marker.on('dragstart', () => pushVenueBuilderHistory());
        marker.on('dragend', () => {
          const snapStep = inventoryBuilderMode ? 0.25 : 0.5;
          const moved = !builderSnapEnabled()
            ? { x: marker.x() / FEET_TO_PX, y: marker.y() / FEET_TO_PX }
            : { x: Math.round(marker.x() / FEET_TO_PX / snapStep) * snapStep, y: Math.round(marker.y() / FEET_TO_PX / snapStep) * snapStep };
          if (component.kind === 'rectangle') { const candidate = component.points.map((item, itemIndex) => itemIndex === index ? moved : item); const bounds = venueBuilderBounds(candidate); component.points = makeVenueBuilderRectangle(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY); }
          else component.points[index] = moved;
          venueBuilder.points = cloneConfig(component.points); renderVenueBuilderDraft(); updateVenueBuilderUI();
        }); root.add(marker);
      });
      if (isSelected) {
        venueBuilder.points = cloneConfig(component.points); venueBuilder.shapeKind = component.kind;
        if (component.kind !== 'arc') {
          const bounds = venueBuilderBounds(component.points);
          if (bounds) {
            const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
            const radius = Math.max(1.5, Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2 + 1.25);
            const rotateHandle = new Konva.Circle({ x: center.x * FEET_TO_PX, y: (center.y - radius) * FEET_TO_PX, radius: 7 * visualScale, fill: '#198754', stroke: '#fff', strokeWidth: 2 * visualScale, hitStrokeWidth: 14 * visualScale, draggable: true, name: 'venueBuilderRotateHandle' });
            rotateHandle.on('dragstart', () => pushVenueBuilderHistory());
            rotateHandle.on('dragend', () => {
              const target = { x: rotateHandle.x() / FEET_TO_PX, y: rotateHandle.y() / FEET_TO_PX };
              const delta = Math.atan2(target.y - center.y, target.x - center.x) + Math.PI / 2;
              rotateVenueBuilderComponent(component, center, delta);
              venueBuilder.points = cloneConfig(component.points); renderVenueBuilderDraft(); updateVenueBuilderUI();
            });
            root.add(new Konva.Line({ points: [center.x * FEET_TO_PX, center.y * FEET_TO_PX, rotateHandle.x(), rotateHandle.y()], stroke: '#198754', strokeWidth: 1.5 * visualScale, dash: [4 * visualScale, 3 * visualScale], listening: false }));
            root.add(rotateHandle);
            addVenueBuilderDimensionLabel(root, `${Math.round(normaliseDegrees(Number(component.rotationDeg) || 0) * 10) / 10}°`, rotateHandle.x() + 10, rotateHandle.y() - 8, editVenueBuilderRotation);
          }
        }
        if (component.kind === 'arc') {
          const arc = circleFromArcPoints(component.points);
          const middle = component.points[Math.floor(component.points.length / 2)];
          if (arc && middle) {
            const handle = new Konva.Circle({ x: middle.x * FEET_TO_PX, y: middle.y * FEET_TO_PX, radius: 7 * visualScale, fill: '#f59e0b', stroke: '#fff', strokeWidth: 2 * visualScale, hitStrokeWidth: 14 * visualScale, draggable: true, name: 'venueBuilderArcHandle' });
            handle.on('dragend', () => {
              const target = { x: handle.x() / FEET_TO_PX, y: handle.y() / FEET_TO_PX };
              const radius = Math.max(.25, Math.hypot(target.x - arc.x, target.y - arc.y));
              const midAngle = Math.atan2(target.y - arc.y, target.x - arc.x);
              component.points = arcPoints(arc, radius, midAngle);
              venueBuilder.points = cloneConfig(component.points); renderVenueBuilderDraft(); updateVenueBuilderUI();
            });
            root.add(handle);
            const rotateHandle = new Konva.Circle({ x: arc.x * FEET_TO_PX, y: (arc.y - arc.radius - 1.25) * FEET_TO_PX, radius: 7 * visualScale, fill: '#198754', stroke: '#fff', strokeWidth: 2 * visualScale, hitStrokeWidth: 14 * visualScale, draggable: true, name: 'venueBuilderArcRotateHandle' });
            rotateHandle.on('dragstart', () => pushVenueBuilderHistory());
            rotateHandle.on('dragend', () => {
              const target = { x: rotateHandle.x() / FEET_TO_PX, y: rotateHandle.y() / FEET_TO_PX };
              const delta = Math.atan2(target.y - arc.y, target.x - arc.x) + Math.PI / 2;
              rotateVenueBuilderComponent(component, arc, delta);
              venueBuilder.points = cloneConfig(component.points); renderVenueBuilderDraft(); updateVenueBuilderUI();
            });
            root.add(new Konva.Line({ points: [arc.x * FEET_TO_PX, arc.y * FEET_TO_PX, rotateHandle.x(), rotateHandle.y()], stroke: '#198754', strokeWidth: 1.5 * visualScale, dash: [4 * visualScale, 3 * visualScale], listening: false }));
            root.add(rotateHandle);
            addVenueBuilderDimensionLabel(root, `${Math.round(normaliseDegrees(Number(component.rotationDeg) || 0) * 10) / 10}°`, rotateHandle.x() + 10, rotateHandle.y() - 8, editVenueBuilderRotation);
          }
        }
        renderVenueBuilderDimensions(root);
      }
    });
    venueBuilder.doors.forEach((door) => renderVenueBuilderDoor(root, door, venueBuilder.mode === 'select'));
    if (venueBuilder.points.length && !venueBuilder.selectedId) {
      const flat = venueBuilder.points.flatMap((point) => [point.x * FEET_TO_PX, point.y * FEET_TO_PX]); root.add(new Konva.Line({ points: flat, stroke: '#0d6efd', strokeWidth: 3, dash: [7, 4], closed: false, fillEnabled: false }));
    }
    venueBuilder.layer.add(root); venueBuilder.draftNode = root; root.moveToTop(); venueBuilder.layer.batchDraw();
  }

  function closeVenueBuilder() {
    venueBuilder.open = false; venueBuilder.mode = null; venueBuilder.shapeKind = 'polygon'; venueBuilder.points = []; venueBuilder.components = []; venueBuilder.doors = []; venueBuilder.selectedId = null; venueBuilder.selectedWalls = []; venueBuilder.calibrationPoints = []; venueBuilder.primitiveStart = null; venueBuilder.primitiveEnd = null; venueBuilder.history = [];
    clearVenueBuilderPreview();
    clearVenueBuilderDraft();
    if (venueBuilder.referenceNode) venueBuilder.referenceNode.destroy();
    venueBuilder.referenceNode = null; venueBuilder.reference = null;
    if (venueBuilderPanel) venueBuilderPanel.style.display = 'none';
    if (venueBuilderImage) venueBuilderImage.value = '';
    inventoryBuilderMode = false; if (customItemBuilderOptions) customItemBuilderOptions.style.display = 'none'; updateVenueBuilderUI();
  }

  function openVenueBuilder(template = null) {
    const validTemplate = template && (Array.isArray(template.components) || Array.isArray(template.points)) ? template : null;
    const legacyComponents = validTemplate && Array.isArray(validTemplate.points) ? [newVenueBuilderComponent(validTemplate.shapeKind || 'polygon', validTemplate.points)] : [];
    venueBuilder.open = true; venueBuilder.mode = 'select'; venueBuilder.components = validTemplate && Array.isArray(validTemplate.components) ? cloneConfig(validTemplate.components) : legacyComponents; venueBuilder.doors = validTemplate && Array.isArray(validTemplate.doors) ? cloneConfig(validTemplate.doors) : []; venueBuilder.selectedId = venueBuilder.components[0] ? venueBuilder.components[0].id : null; venueBuilder.selectedWalls = []; venueBuilder.shapeKind = venueBuilder.components[0] ? venueBuilder.components[0].kind : 'polygon'; venueBuilder.points = venueBuilder.components[0] ? cloneConfig(venueBuilder.components[0].points) : []; venueBuilder.calibrationPoints = []; venueBuilder.primitiveStart = null; venueBuilder.primitiveEnd = null; venueBuilder.history = []; venueBuilder.editingId = validTemplate ? validTemplate.id : null;
    venueBuilder.zoom = inventoryBuilderMode ? 8 : 1; venueBuilder.pan = { x: 0, y: 0 };
    clearVenueBuilderPreview();
    if (venueBuilderName) {
      venueBuilderName.value = validTemplate ? validTemplate.name : '';
      venueBuilderName.placeholder = inventoryBuilderMode ? 'Custom item' : 'Custom venue';
    }
    if (venueBuilderTitle) venueBuilderTitle.textContent = inventoryBuilderMode ? (validTemplate ? 'Edit Custom Item' : 'Build Custom Item') : (validTemplate ? 'Edit Venue' : 'Build Venue');
    if (venueBuilderGridHint) venueBuilderGridHint.textContent = inventoryBuilderMode ? 'Grid: 1′ major / ¼′ snap' : 'Grid: 5′ × 5′';
    if (venueBuilderDrawLabel) venueBuilderDrawLabel.textContent = inventoryBuilderMode ? 'Draw item shape' : 'Draw a shape';
    if (customItemBuilderOptions) customItemBuilderOptions.style.display = inventoryBuilderMode ? '' : 'none';
    if (venueBuilderVenueControls) venueBuilderVenueControls.style.display = '';
    if (venueBuilderVenueControlsTitle) venueBuilderVenueControlsTitle.textContent = inventoryBuilderMode ? 'Item line editing' : 'Doors and openings';
    if (venueBuilderDoor) venueBuilderDoor.style.display = inventoryBuilderMode ? 'none' : '';
    if (venueBuilderOpening) venueBuilderOpening.style.display = inventoryBuilderMode ? 'none' : '';
    if (venueBuilderDeleteWall) venueBuilderDeleteWall.innerHTML = inventoryBuilderMode ? '<i class="fa-solid fa-minus"></i> Remove selected line' : '<i class="fa-solid fa-eraser"></i> Delete wall';
    if (venueBuilderEraser) venueBuilderEraser.innerHTML = inventoryBuilderMode ? '<i class="fa-solid fa-eraser"></i> Erase clicked line' : '<i class="fa-solid fa-trash-can"></i> Eraser';
    if (venueBuilderSnapOption) venueBuilderSnapOption.style.display = inventoryBuilderMode ? 'none' : '';
    if (venueBuilderSave) venueBuilderSave.textContent = inventoryBuilderMode ? 'Save item' : 'Save venue';
    if (venueBuilderImageStatus) venueBuilderImageStatus.textContent = 'Draw directly on the grid, or add an image to trace.';
    if (venueBuilderReferenceControls) venueBuilderReferenceControls.style.display = 'none';
    if (venueBuilderPanel) venueBuilderPanel.style.display = 'flex';
    requestAnimationFrame(() => {
      if (!ensureVenueBuilderStage()) return;
      applyVenueBuilderView();
      drawVenueBuilderGrid();
      if (validTemplate && validTemplate.reference && validTemplate.reference.dataUrl) addVenueBuilderReference(validTemplate.reference.dataUrl, validTemplate.reference);
      renderVenueBuilderDraft(); venueBuilder.layer.draw();
    });
    updateVenueBuilderUI();
  }

  function addVenueBuilderReference(dataUrl, storedReference = null) {
    const image = new Image();
    image.onload = () => {
      if (venueBuilder.referenceNode) venueBuilder.referenceNode.destroy();
      const maxWidth = 50 * FEET_TO_PX;
      const width = Math.min(maxWidth, image.width || maxWidth);
      const height = Math.max(1, width * ((image.height || 1) / (image.width || 1)));
      const opacity = storedReference ? (Number(storedReference.opacity) || .5) : .5;
      const node = new Konva.Image({ image, x: storedReference ? (Number(storedReference.xFt) || 0) * FEET_TO_PX : 40, y: storedReference ? (Number(storedReference.yFt) || 0) * FEET_TO_PX : 40, width: storedReference ? (Number(storedReference.widthFt) || width / FEET_TO_PX) * FEET_TO_PX : width, height: storedReference ? (Number(storedReference.heightFt) || height / FEET_TO_PX) * FEET_TO_PX : height, opacity, listening: false, name: 'venueBuilderReference' });
      venueBuilder.layer.add(node); node.moveToBottom(); venueBuilder.referenceNode = node; venueBuilder.reference = { dataUrl, referenceMeta: storedReference && storedReference.referenceMeta ? cloneConfig(storedReference.referenceMeta) : null };
      if (venueBuilderReferenceControls) venueBuilderReferenceControls.style.display = '';
      if (venueBuilderImageOpacity) venueBuilderImageOpacity.value = String(opacity);
      if (venueBuilderImageStatus) venueBuilderImageStatus.textContent = 'Reference image framed and scaled. Trace the room outline on top of it.';
      venueBuilder.layer.batchDraw();
    };
    image.src = dataUrl;
  }

  function handleVenueBuilderStagePoint(point) {
    if (!venueBuilder.open || !venueBuilder.mode || !point) return false;
    venueBuilder.shapeKind = 'polygon';
    const first = venueBuilder.points[0];
    if (venueBuilder.points.length >= 3 && first && Math.hypot(point.x - first.x, point.y - first.y) < 1) { commitVenueBuilderComponent('polygon', true, true); venueBuilder.mode = 'select'; renderVenueBuilderDraft(); updateVenueBuilderUI(); return true; }
    const step = inventoryBuilderMode ? 0.25 : 0.5;
    venueBuilder.points.push({ x: Math.round(point.x / step) * step, y: Math.round(point.y / step) * step }); renderVenueBuilderDraft(); updateVenueBuilderUI(); return true;
  }

  function saveVenueBuilderTemplate() {
    if (venueBuilder.points.length >= 2 && !venueBuilder.selectedId) commitVenueBuilderComponent(venueBuilder.shapeKind, false, venueBuilder.shapeKind !== 'polygon');
    if (!venueBuilder.components.length) return window.alert(inventoryBuilderMode ? 'Draw at least one item shape first.' : 'Draw at least one room, hallway, or wall first.');
    if (venueBuilder.components.some((component) => polygonSelfIntersects(component.points))) return window.alert('A venue outline crosses itself. Move or remove points and try again.');
    const name = (venueBuilderName && venueBuilderName.value || '').trim() || (inventoryBuilderMode ? 'Custom item' : 'Custom venue');
    if (inventoryBuilderMode) {
      const bounds = venueBuilderAllBounds(); const components = venueBuilder.components.map((component) => ({ ...cloneConfig(component), points: component.points.map((point) => ({ x: point.x - bounds.minX, y: point.y - bounds.minY })) }));
      let reference;
      if (venueBuilder.reference && venueBuilder.referenceNode) { const node = venueBuilder.referenceNode; reference = { dataUrl: venueBuilder.reference.dataUrl, xFt: node.x() / FEET_TO_PX - bounds.minX, yFt: node.y() / FEET_TO_PX - bounds.minY, widthFt: (node.width() * node.scaleX()) / FEET_TO_PX, heightFt: (node.height() * node.scaleY()) / FEET_TO_PX, opacity: node.opacity(), referenceMeta: cloneConfig(venueBuilder.reference.referenceMeta) }; }
      const item = { id: venueBuilder.editingId || `custom-item-${Date.now()}`, name, components, length: bounds.maxX - bounds.minX, depth: bounds.maxY - bounds.minY, height: Number(customItemHeight && customItemHeight.value) || 1, hanging: !!(customItemHanging && customItemHanging.checked), reference };
      const index = customInventoryItems.findIndex((entry) => entry.id === item.id); if (index >= 0) customInventoryItems[index] = item; else customInventoryItems.unshift(item); writeCustomInventoryItems(); renderCustomInventoryItems(); closeVenueBuilder(); return;
    }
    const bounds = venueBuilderAllBounds(); const minX = bounds.minX, minY = bounds.minY, maxX = bounds.maxX, maxY = bounds.maxY;
    let reference;
    if (venueBuilder.reference && venueBuilder.referenceNode) {
      const node = venueBuilder.referenceNode;
      reference = { dataUrl: venueBuilder.reference.dataUrl, xFt: node.x() / FEET_TO_PX - minX, yFt: node.y() / FEET_TO_PX - minY, widthFt: (node.width() * node.scaleX()) / FEET_TO_PX, heightFt: (node.height() * node.scaleY()) / FEET_TO_PX, opacity: node.opacity(), referenceMeta: cloneConfig(venueBuilder.reference.referenceMeta) };
    }
    const normalisedComponents = venueBuilder.components.map((component) => ({ ...cloneConfig(component), points: component.points.map((point) => ({ x: point.x - minX, y: point.y - minY })) }));
    const firstComponent = normalisedComponents[0];
    const template = { id: venueBuilder.editingId || `custom-venue-${Date.now()}`, name, components: normalisedComponents, doors: cloneConfig(venueBuilder.doors), attachments: cloneConfig(venueBuilder.doors), shapeKind: firstComponent.kind, points: cloneConfig(firstComponent.points), widthFt: maxX - minX, heightFt: maxY - minY, reference };
    const index = customVenueTemplates.findIndex((item) => item.id === template.id);
    if (index >= 0) customVenueTemplates[index] = template; else customVenueTemplates.unshift(template);
    writeCustomVenueTemplates(); renderCustomVenueButtons(); closeVenueBuilder();
  }
  const MIN_SCALE = 0.02; // allow zooming out further
  const MAX_SCALE = 20;   // allow zooming in much further

  function debounce(fn, delay) {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), delay); };
  }

  function getBlankLayout() {
    return {
      gridSize,
      gridBounds: gridBounds ? { ...gridBounds } : null,
      snapDistanceFt,
      showGrid,
      snapToGrid,
      darkMode,
      units,
      referenceImageOpacity,
      inventoryPanel: {
        showOnPrint: false,
        showTentSetupsOnPrint: false,
        showPipeDrapeOnPrint: false,
        trackLimits: false,
      },
      inventoryTotals: {},
      layers: [],
      venues: [],
      items: [],
    };
  }

  function nextLayerId(prefix = 'layer') {
    layerIdCounter += 1;
    return `${prefix}-${Date.now()}-${layerIdCounter}`;
  }

  function nextNodeId(prefix = 'node') {
    nodeIdCounter += 1;
    return `${prefix}-${Date.now()}-${nodeIdCounter}`;
  }

  function defaultLayers() {
    return defaultLayerConfigs();
  }

  function ensureBaseLayers(layers) {
    return repairLayers(layers, nextLayerId);
  }

  function getOrderedLayers() {
    return [...userLayers].sort((a, b) => a.order - b.order);
  }

  function getLayer(layerId) {
    return userLayers.find((layer) => layer.id === layerId) || null;
  }

  function getLayerGroup(layerId) {
    return layerGroups.get(layerId) || null;
  }

  function forEachNode(callback) {
    getOrderedLayers().forEach((layer) => {
      const group = getLayerGroup(layer.id);
      if (!group) return;
      collectionToArray(group.getChildren()).forEach((node) => callback(node, layer, group));
    });
  }

  function nodesForLayer(layerId) {
    const group = getLayerGroup(layerId);
    return group ? collectionToArray(group.getChildren()) : [];
  }

  function getRenderableLayers() {
    return getOrderedLayers().filter((layer) => layer.visible);
  }

  function getVenueLayers() {
    return getOrderedLayers().filter((layer) => layer.kind === 'venue');
  }

  function getLabelLayer() {
    return getLayer('labels-base') || getOrderedLayers().find((layer) => layer.kind === 'label') || null;
  }

  function hasUnlockedVenueLayer() {
    return getVenueLayers().some((layer) => !layer.locked);
  }

  function labelsVisible() {
    const layer = getLabelLayer();
    return !!(layer && layer.visible);
  }

  function updateVenueToggleButton() {
    if (!venueToggleBtn) return;
    const venueEditingEnabled = hasUnlockedVenueLayer();
    venueToggleBtn.classList.toggle('tool-active', venueEditingEnabled);
    venueToggleBtn.title = venueEditingEnabled ? 'Lock Venue Editing' : 'Enable Venue Editing';
    const icon = venueToggleBtn.querySelector('i');
    if (icon) {
      icon.classList.toggle('fa-tent', venueEditingEnabled);
      icon.classList.toggle('fa-lock', !venueEditingEnabled);
    }
  }

  let activeSidePanel = 'inventory';

  function setActiveSidePanel(panelKey, options = {}) {
    const { open = false } = options;
    const venuesAvailable = hasUnlockedVenueLayer();
    const nextPanel = panelKey === 'venues' && venuesAvailable ? 'venues' : 'inventory';
    activeSidePanel = nextPanel;
    const activePanel = nextPanel === 'venues' ? venuesPanel : inventoryPanel;
    if (open && activePanel) setPanelCollapsed(activePanel, false);

    if (inventoryPanel) {
      const isActive = nextPanel === 'inventory';
      inventoryPanel.classList.toggle('is-side-panel-active', isActive);
      inventoryPanel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    }
    if (venuesPanel) {
      const isActive = nextPanel === 'venues';
      venuesPanel.classList.toggle('is-side-panel-active', isActive);
      venuesPanel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    }
    if (inventoryPanelTab) {
      const isActive = nextPanel === 'inventory';
      inventoryPanelTab.classList.toggle('is-active', isActive);
      inventoryPanelTab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      inventoryPanelTab.setAttribute('aria-expanded', isActive && inventoryPanel && !inventoryPanel.classList.contains('is-collapsed') ? 'true' : 'false');
    }
    if (venuesPanelTab) {
      const isActive = nextPanel === 'venues';
      venuesPanelTab.classList.toggle('is-active', isActive);
      venuesPanelTab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      venuesPanelTab.setAttribute('aria-expanded', isActive && venuesPanel && !venuesPanel.classList.contains('is-collapsed') ? 'true' : 'false');
    }
  }

  function updateLabelsToggleButton() {
    if (!labelsToggleBtn) return;
    const visible = labelsVisible();
    labelsToggleBtn.classList.toggle('tool-active', visible);
    labelsToggleBtn.title = visible ? 'Hide Labels' : 'Show Labels';
    const icon = labelsToggleBtn.querySelector('i');
    if (icon) {
      icon.classList.toggle('fa-tag', visible);
      icon.classList.toggle('fa-eye-slash', !visible);
    }
  }

  function syncVenuePanelState() {
    const venuesAvailable = hasUnlockedVenueLayer();
    if (venuesPanelTab) {
      venuesPanelTab.hidden = !venuesAvailable;
      venuesPanelTab.setAttribute('aria-hidden', venuesAvailable ? 'false' : 'true');
    }
    if (venuesPanel) setPanelCollapsed(venuesPanel, !venuesAvailable);
    setActiveSidePanel(venuesAvailable ? activeSidePanel : 'inventory');
  }

  function layerAcceptsPlacement(layer, kind) {
    return layerAllowsPlacement(layer, kind);
  }

  function resolvePlacementLayer(kind) {
    const active = getLayer(activeLayerId);
    if (layerAcceptsPlacement(active, kind)) return active;
    const fallbackId = fallbackLayerIdForKind(kind);
    const fallback = getLayer(fallbackId);
    return layerAcceptsPlacement(fallback, kind) ? fallback : null;
  }

  function setNodeLayerId(node, layerId) {
    if (node && node.setAttr) node.setAttr('layerId', layerId);
  }

  function ensureNodeId(node, prefix = 'node') {
    if (!node || !node.setAttr || !node.getAttr) return '';
    let nodeId = node.getAttr('nodeId');
    if (!nodeId) {
      nodeId = nextNodeId(prefix);
      node.setAttr('nodeId', nodeId);
    }
    return nodeId;
  }

  function getNodeLayer(node) {
    return getLayer(node && node.getAttr ? node.getAttr('layerId') : '');
  }

  function getNodeById(nodeId) {
    if (!nodeId) return null;
    let found = null;
    forEachNode((node) => {
      if (found) return;
      if (node && node.getAttr && node.getAttr('nodeId') === nodeId) found = node;
    });
    return found;
  }

  function shouldNodeBeInteractive(node) {
    const layer = getNodeLayer(node);
    if (!layer || !layer.visible || layer.locked) return false;
    if (node && node.getAttr && node.getAttr('customType') === 'label' && node.getAttr('labelMode') === 'attached') {
      return activeTool === 'select';
    }
    return activeTool === 'select';
  }

  function isSelectableNode(node) {
    if (!node || !node.getAttr || !node.getAttr('selectable')) return false;
    const layer = getNodeLayer(node);
    const customType = node.getAttr('customType');
    let parentTent = null;
    let parentLayer = null;
    if (customType === 'tentAddon') {
      parentTent = getNodeById(node.getAttr('parentTentNodeId') || '');
      parentLayer = parentTent ? getNodeLayer(parentTent) : null;
    }
    return nodeIsSelectable({ selectable: node.getAttr('selectable'), customType, labelMode: node.getAttr('labelMode'), layer, parentTentLayer: parentLayer, parentTentExists: customType !== 'tentAddon' || !!parentTent });
  }

  function getEligibleNodes() {
    const nodes = [];
    forEachNode((node, layer) => {
      if (layer.visible && !layer.locked && isSelectableNode(node)) nodes.push(node);
    });
    return nodes;
  }

  function updateSnapToolbarButton() {
    if (!snapToolbarBtn) return;
    snapToolbarBtn.classList.toggle('tool-active', snapToGrid);
  }

  function syncSnapState() {
    if (snapToggle) snapToggle.checked = snapToGrid;
    if (!snapToGrid) clearSnapAnchor();
    updateRotationSnap();
    updateSnapToolbarButton();
  }

  function renderSnapDistanceValue() {
    if (!snapDistanceValueEl) return;
    const value = Number.isFinite(snapDistanceFt) ? snapDistanceFt : 1;
    snapDistanceValueEl.textContent = `${value}ft`;
  }

  function captureSnapAnchorFromPointer() {
    if (!worldGroup || !stage) return;
    const pointer = worldGroup.getRelativePointerPosition();
    if (!pointer) return;
    snapAnchor = { x: pointer.x, y: pointer.y };
  }

  function clearSnapAnchor() {
    snapAnchor = null;
  }

  function ensureLayerGroups() {
    if (!layerRootGroup) return;
    const ordered = getOrderedLayers();
    const tentAddonPlacement = activeTool === 'place' && placementPayload && placementPayload.kind === 'tentAddon';
    const stageAddonPlacement = activeTool === 'place' && placementPayload && placementPayload.kind === 'stageAddon';
    const labelPlacement = activeTool === 'label';
    ordered.forEach((layer) => {
      let group = layerGroups.get(layer.id);
      if (!group) {
        group = new Konva.Group({ name: `user-layer-${layer.id}` });
        group.setAttr('layerId', layer.id);
        layerGroups.set(layer.id, group);
        layerRootGroup.add(group);
      }
      group.visible(layer.visible);
      group.listening(layer.visible && ((!layer.locked && activeTool === 'select') || (labelPlacement && !layer.locked && layer.kind !== 'label' && layer.kind !== 'reference') || (tentAddonPlacement && layer.kind === 'venue') || (stageAddonPlacement && layer.kind === 'item')));
    });

    Array.from(layerGroups.keys()).forEach((layerId) => {
      if (!ordered.some((layer) => layer.id === layerId)) {
        const group = layerGroups.get(layerId);
        if (group) group.destroy();
        layerGroups.delete(layerId);
      }
    });
  }

  function syncLayerNodeState() {
    const tentAddonPlacement = activeTool === 'place' && placementPayload && placementPayload.kind === 'tentAddon';
    const stageAddonPlacement = activeTool === 'place' && placementPayload && placementPayload.kind === 'stageAddon';
    const labelPlacement = activeTool === 'label';
    forEachNode((node, layer) => {
      const isAttachedLabel = node && node.getAttr && node.getAttr('customType') === 'label' && node.getAttr('labelMode') === 'attached';
      const parentNode = isAttachedLabel ? getNodeById(node.getAttr('attachedToNodeId')) : null;
      const parentLayer = isAttachedLabel ? getNodeLayer(parentNode) : null;
      const visible = isAttachedLabel
        ? !!(layer.visible && parentNode && parentLayer && parentLayer.visible && (!isOptionalHeightLabel(node) || showItemHeights))
        : layer.visible;
      let interactive = isAttachedLabel
        ? !!(layer.visible && !layer.locked && parentNode && parentLayer && parentLayer.visible && activeTool === 'select')
        : (layer.visible && ((!layer.locked && activeTool === 'select') || (labelPlacement && !layer.locked && node.getAttr && node.getAttr('customType') !== 'label' && node.getAttr('customType') !== 'referenceImage') || (tentAddonPlacement && !layer.locked && node.getAttr && node.getAttr('customType') === 'venue' && node.getAttr('venueType') === 'tent') || (stageAddonPlacement && !layer.locked && node.getAttr && node.getAttr('isFlooring') && node.getAttr('floorCategory') === 'stage')));
      if (node.visible) node.visible(visible);
      if (node.getAttr && node.getAttr('customType') === 'referenceImage' && node.opacity) node.opacity(referenceImageOpacity);
      const addonTent = node && node.getAttr && node.getAttr('customType') === 'tentAddon' ? getNodeById(node.getAttr('parentTentNodeId') || '') : null;
      const parentTentLayer = addonTent ? getNodeLayer(addonTent) : null;
      const parentTentLocked = !!(parentTentLayer && parentTentLayer.locked);
      if (parentTentLocked) interactive = false;
      const fixedTentAddon = node && node.getAttr && node.getAttr('customType') === 'tentAddon' && !!node.getAttr('tentAddonFixed');
      // Add-on placement needs the parent tent/stage to receive hit tests, but
      // it must never make that parent draggable while a preview is being
      // positioned on touch.
      const isAddonPlacementTarget = (tentAddonPlacement && node.getAttr && node.getAttr('customType') === 'venue' && node.getAttr('venueType') === 'tent')
        || (stageAddonPlacement && node.getAttr && node.getAttr('isFlooring') && node.getAttr('floorCategory') === 'stage');
      if (node.draggable) node.draggable(fixedTentAddon || parentTentLocked || isAddonPlacementTarget ? false : interactive);
      if (node.listening) node.listening(interactive);
      if (node.getAttr && node.getAttr('customType') === 'venue') {
        node.find('.roomAttachment').forEach((attachmentNode) => {
          attachmentNode.draggable(activeTool === 'select' && interactive);
          attachmentNode.listening(activeTool === 'select' && interactive);
        });
      }
    });
    const invalidSelections = selectedItems.filter((node) => isSelectableNode(node));
    if (invalidSelections.length !== selectedItems.length) selectedItems = invalidSelections;
  }

  function ensureLayerOrder() {
    if (!worldGroup) return;
    if (gridGroup) gridGroup.moveToBottom();
    const ordered = getOrderedLayers();
    ordered.forEach((layer, index) => {
      const group = getLayerGroup(layer.id);
      if (group) group.zIndex(index + 1);
    });
    if (uiGroup) uiGroup.moveToTop();
    if (placementPreview) placementPreview.moveToTop();
    updateItemZOrder();
    updateFloorZOrder();
    if (worldLayer) worldLayer.batchDraw();
  }

  // Keep coolers/chillers visible above tables and other inventory in their
  // item layer, including when a table is placed after a cooler.
  function updateItemZOrder() {
    getOrderedLayers()
      .filter((layer) => layer.kind === 'item')
      .forEach((layer) => {
        const group = getLayerGroup(layer.id);
        if (!group) return;
        const nodes = collectionToArray(group.getChildren());
        const isCooler = (node) => {
          if (!node || !node.getAttr) return false;
          const category = String(node.getAttr('inventoryCategory') || '').toLowerCase();
          const name = String(node.getAttr('inventoryName') || '').toLowerCase();
          return category === 'cooler' || /cooler|chiller/.test(name);
        };
        nodes
          .map((node, index) => ({ node, index }))
          .sort((a, b) => Number(isCooler(a.node)) - Number(isCooler(b.node)) || a.index - b.index)
          .forEach(({ node }, index) => node.zIndex(index));
      });
  }

  function renderLayersPanel() {
    if (!layersList) return;
    const ordered = getOrderedLayers();
    layersList.innerHTML = ordered.map((layer) => {
      const isActive = layer.id === activeLayerId;
      const icon = layer.kind === 'reference' ? 'fa-image' : layer.kind === 'subfloor' ? 'fa-border-all' : layer.kind === 'venue' ? 'fa-tent' : layer.kind === 'decor' ? 'fa-lightbulb' : layer.kind === 'label' ? 'fa-tag' : 'fa-cube';
      const visibilityIcon = layer.visible ? 'fa-eye' : 'fa-eye-slash';
      const lockIconName = layer.locked ? 'fa-lock' : 'fa-lock-open';
      const deleteDisabled = layer.builtIn || nodesForLayer(layer.id).length > 0;
      const kindLabel = layer.kind === 'reference' ? 'Reference images' : layer.kind === 'subfloor' ? 'Subfloor' : layer.kind === 'venue' ? 'Venue' : layer.kind === 'decor' ? 'Hanging decor' : layer.kind === 'label' ? 'Labels' : 'Items';
      const referenceControl = layer.id === 'reference-base' ? `<label class="layer-reference-opacity" title="Changes every background reference image"><span>Opacity <output>${Math.round(referenceImageOpacity * 100)}%</output></span><input type="range" min="0.05" max="1" step="0.05" value="${referenceImageOpacity}" data-action="reference-opacity" aria-label="Reference image opacity" /></label>` : '';
      return `
        <div class="layer-row ${isActive ? 'is-active' : ''}" data-layer-id="${layer.id}">
          <div class="layer-row-main">
            <div class="layer-row-name" data-action="activate">${layer.name}</div>
            <div class="layer-row-meta">
              <i class="fa-solid ${icon}"></i> ${kindLabel}
              ${layer.builtIn ? ' • Base' : ''}
              ${nodesForLayer(layer.id).length ? ` • ${nodesForLayer(layer.id).length} objects` : ' • Empty'}
            </div>
            ${referenceControl}
          </div>
          <button class="btn btn-outline-secondary btn-sm layer-icon-btn" type="button" data-action="toggle-visible" title="Toggle Visibility">
            <i class="fa-solid ${visibilityIcon}"></i>
          </button>
          <button class="btn btn-outline-secondary btn-sm layer-icon-btn" type="button" data-action="toggle-lock" title="Toggle Lock">
            <i class="fa-solid ${lockIconName}"></i>
          </button>
          <button class="btn btn-outline-secondary btn-sm layer-icon-btn ${deleteDisabled ? 'disabled' : ''}" type="button" data-action="delete-layer" title="Delete Layer" ${deleteDisabled ? 'disabled' : ''}>
            <i class="fa-regular fa-trash-can"></i>
          </button>
        </div>
      `;
    }).join('');
  }

  function refreshLayersUI() {
    ensureLayerGroups();
    syncLayerNodeState();
    refreshLabelTheme();
    renderLayersPanel();
    updateTransformer();
    ensureLayerOrder();
    syncVenuePanelState();
    updateToolButtons();
    updateModeHint();
  }

  function setActiveLayer(layerId) {
    const layer = getLayer(layerId);
    if (!layer) return;
    activeLayerId = layer.id;
    renderLayersPanel();
    updateModeHint();
  }

  function createLayer(kind) {
    const label = kind === 'venue' ? 'Venue layer name' : kind === 'label' ? 'Labels layer name' : 'Item layer name';
    const fallback = kind === 'venue' ? 'Venue Layer' : kind === 'label' ? 'Labels Layer' : 'Item Layer';
    const name = window.prompt(label, fallback);
    if (name === null) return;
    userLayers.push({
      id: nextLayerId(kind),
      name: name.trim() || fallback,
      kind,
      visible: true,
      locked: false,
      builtIn: false,
      order: userLayers.length,
    });
    setActiveLayer(userLayers[userLayers.length - 1].id);
    refreshLayersUI();
    setDirty(true);
  }

  function toggleLayerVisibility(layerId) {
    const layer = getLayer(layerId);
    if (!layer) return;
    layer.visible = !layer.visible;
    if (layer.kind === 'label' && !layer.visible && activeTool === 'label') setActiveTool('select');
    if (!layer.visible && activeLayerId === layer.id) {
      const fallbackBase = layer.kind === 'venue' ? 'venue-base' : layer.kind === 'subfloor' ? 'subfloor-base' : layer.kind === 'label' ? 'labels-base' : layer.kind === 'decor' ? 'decor-base' : 'items-base';
      const fallback = resolvePlacementLayer(layer.kind) || getLayer(fallbackBase) || getOrderedLayers().find((candidate) => candidate.visible && !candidate.locked);
      if (fallback) activeLayerId = fallback.id;
    }
    refreshLayersUI();
    setDirty(true);
  }

  function setReferenceImageOpacity(value) {
    const opacity = Math.max(.05, Math.min(1, Number(value) || .5));
    referenceImageOpacity = opacity;
    forEachNode((node) => { if (node && node.getAttr && node.getAttr('customType') === 'referenceImage' && node.opacity) node.opacity(opacity); });
    if (worldLayer) worldLayer.batchDraw();
    renderLayersPanel();
    setDirty(true);
  }

  function toggleLayerLock(layerId) {
    const layer = getLayer(layerId);
    if (!layer) return;
    layer.locked = !layer.locked;
    if (layer.kind === 'label' && layer.locked && activeTool === 'label') setActiveTool('select');
    if (layer.locked && activeLayerId === layer.id) {
      const fallbackBase = layer.kind === 'venue' ? 'venue-base' : layer.kind === 'subfloor' ? 'subfloor-base' : layer.kind === 'label' ? 'labels-base' : layer.kind === 'decor' ? 'decor-base' : 'items-base';
      const fallback = resolvePlacementLayer(layer.kind) || getLayer(fallbackBase) || getOrderedLayers().find((candidate) => candidate.visible && !candidate.locked);
      if (fallback) activeLayerId = fallback.id;
    }
    refreshLayersUI();
    setDirty(true);
  }

  function setAllVenueLayersLocked(locked, options = {}) {
    const { setDirtyState = true } = options;
    let changed = false;
    getVenueLayers().forEach((layer) => {
      if (layer.locked !== locked) {
        layer.locked = locked;
        changed = true;
      }
    });

    if (locked) {
      if (placementPayload && placementPayload.kind === 'venue') setActiveTool('select');
      const remainingSelection = selectedItems.filter((node) => {
        const layer = getNodeLayer(node);
        return !(layer && layer.kind === 'venue');
      });
      if (remainingSelection.length !== selectedItems.length) {
        selectedItems = remainingSelection;
        updateTransformer();
      }
      const activeLayer = getLayer(activeLayerId);
      if (activeLayer && activeLayer.kind === 'venue') {
        const fallback = getLayer('items-base') || getOrderedLayers().find((layer) => layer.kind === 'item' && layer.visible && !layer.locked) || getOrderedLayers()[0];
        if (fallback) activeLayerId = fallback.id;
      }
    }

    refreshLayersUI();
    if (changed && setDirtyState) setDirty(true);
  }

  function toggleVenueEditing() {
    setAllVenueLayersLocked(hasUnlockedVenueLayer(), { setDirtyState: true });
  }

  function toggleLabelsVisibility() {
    const layer = getLabelLayer();
    if (!layer) return;
    layer.visible = !layer.visible;
    if (!layer.visible && activeLayerId === layer.id) activeLayerId = 'items-base';
    refreshLayersUI();
    setDirty(true);
  }

  function deleteLayer(layerId) {
    const layer = getLayer(layerId);
    if (!layer || layer.builtIn) return;
    if (nodesForLayer(layerId).length) {
      window.alert('Move or delete objects on this layer before removing it.');
      return;
    }
    userLayers = userLayers.filter((entry) => entry.id !== layerId).map((entry, index) => ({ ...entry, order: index }));
    if (activeLayerId === layerId) {
      const fallback = getLayer('items-base') || getOrderedLayers()[0];
      if (fallback) activeLayerId = fallback.id;
    }
    refreshLayersUI();
    setDirty(true);
  }

  function setQueryDocumentId(documentId) {
    if (plannerIsSetupMode) return;
    const url = new URL(window.location.href);
    if (documentId) url.searchParams.set('id', String(documentId));
    else url.searchParams.delete('id');
    window.history.replaceState({}, '', url.toString());
  }

  function renderPlannerMeta() {
    if (plannerTitleEl) plannerTitleEl.textContent = currentDocumentTitle || 'Untitled planner';
  }

  function setDirty(nextDirty = true) {
    if (suppressDirtyTracking) return;
    isDirty = !!nextDirty;
    renderPlannerMeta();
    if (nextDirty) recordPlannerHistory();
  }

  function updatePlannerHistoryButtons() {
    if (undoBtn) undoBtn.disabled = plannerHistory.length < 2;
    if (redoBtn) redoBtn.disabled = !plannerRedoHistory.length;
  }

  function recordPlannerHistory(reset = false) {
    if (plannerHistoryApplying || !worldLayer || !worldGroup) return;
    const snapshot = buildLayoutSnapshot();
    const signature = JSON.stringify(snapshot);
    const previous = plannerHistory[plannerHistory.length - 1];
    if (reset) { plannerHistory = [{ snapshot, signature }]; plannerRedoHistory = []; updatePlannerHistoryButtons(); return; }
    if (!previous || previous.signature !== signature) {
      plannerHistory.push({ snapshot, signature });
      if (plannerHistory.length > 50) plannerHistory.shift();
      plannerRedoHistory = [];
    }
    updatePlannerHistoryButtons();
  }

  async function undoPlannerAction() {
    if (plannerHistory.length < 2) return;
    const current = plannerHistory.pop(); plannerRedoHistory.push(current);
    plannerHistoryApplying = true;
    try { await loadLayout(cloneConfig(plannerHistory[plannerHistory.length - 1].snapshot)); setDirty(true); }
    finally { plannerHistoryApplying = false; updatePlannerHistoryButtons(); }
  }

  async function redoPlannerAction() {
    const entry = plannerRedoHistory.pop(); if (!entry) return;
    plannerHistory.push(entry); plannerHistoryApplying = true;
    try { await loadLayout(cloneConfig(entry.snapshot)); setDirty(true); }
    finally { plannerHistoryApplying = false; updatePlannerHistoryButtons(); }
  }

  function resetCurrentDocument(options = {}) {
    currentDocumentId = options.id || null;
    currentDocumentTitle = (options.title || 'Untitled planner').trim() || 'Untitled planner';
    currentDocumentUpdatedAt = options.updatedAt || null;
    isDirty = !!options.dirty;
    renderPlannerMeta();
  }

  async function guardedFetch(url, options = {}) {
    const res = await fetch(url, options);
    let payload = null;
    try {
      payload = await res.json();
    } catch (err) {
      payload = null;
    }
    if (!res.ok) {
      const message = payload && payload.error ? payload.error : `Request failed (${res.status})`;
      throw new Error(message);
    }
    return payload;
  }

  function formatTimestamp(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString();
  }

  async function confirmDiscardIfDirty() {
    if (!isDirty) return true;
    return window.confirm('Discard unsaved floorplan changes?');
  }

  function gridStepPx() {
    // This is placement snapping only. It stays controlled by Snap Distance.
    return Math.max(1, Math.round(snapDistanceFt * FEET_TO_PX));
  }

  function snapValue(value, origin = 0) {
    if (!snapToGrid) return value;
    const step = gridStepPx();
    return origin + (Math.round((value - origin) / step) * step);
  }

  function snapPosition(pos) {
    if (!pos) return { x: 0, y: 0 };
    const originX = snapAnchor ? snapAnchor.x : 0;
    const originY = snapAnchor ? snapAnchor.y : 0;
    return {
      x: snapValue(pos.x, originX),
      y: snapValue(pos.y, originY),
    };
  }

  function refreshLabelTheme() {
    forEachNode((node) => {
      if (!(node.getAttr && node.getAttr('customType') === 'label')) return;
      const textNode = node.findOne ? node.findOne('.labelText') : null;
      if (textNode) textNode.fill(node.getAttr('labelColor') || (darkMode ? '#f8f9fa' : '#212529'));
    });
  }

  function labelAppearanceFromInputs() {
    const style = [labelTextBold && labelTextBold.checked ? 'bold' : '', labelTextItalic && labelTextItalic.checked ? 'italic' : ''].filter(Boolean).join(' ') || 'normal';
    return { fontSize: Math.max(8, Math.min(72, Number(labelTextSize && labelTextSize.value) || 16)), labelColor: (labelTextColor && labelTextColor.value) || (darkMode ? '#f8f9fa' : '#212529'), fontStyle: style, labelBorder: !!(labelTextBorder && labelTextBorder.checked) };
  }

  function applyLabelAppearance(labelNode, appearance = {}) {
    if (!labelNode) return;
    const fontSize = Math.max(8, Math.min(72, Number(appearance.fontSize) || Number(labelNode.getAttr('fontSize')) || 16));
    const labelColor = appearance.labelColor || labelNode.getAttr('labelColor') || (darkMode ? '#f8f9fa' : '#212529');
    const fontStyle = appearance.fontStyle || labelNode.getAttr('fontStyle') || 'normal';
    const labelBorder = appearance.labelBorder !== undefined ? !!appearance.labelBorder : !!labelNode.getAttr('labelBorder');
    labelNode.setAttrs({ fontSize, labelColor, fontStyle, labelBorder });
    const textNode = labelNode.findOne && labelNode.findOne('.labelText');
    if (textNode) textNode.setAttrs({ fontSize, fill: labelColor, fontStyle });
    const borderNode = labelNode.findOne && labelNode.findOne('.labelBorder');
    if (borderNode) borderNode.setAttrs({ visible: labelBorder, stroke: labelColor });
    updateLabelNodeLayout(labelNode);
  }

  function isOptionalHeightLabel(node) {
    return !!(node && node.getAttr && hasOptionalHeightLabel({ autoGenerated: node.getAttr('autoGenerated'), labelKind: node.getAttr('labelKind') }));
  }

  function refreshLabelVisibility() {
    syncLayerNodeState();
    if (worldLayer) worldLayer.batchDraw();
  }

  function createLabelNode(options = {}) {
    const textValue = String(options.text || '').trim() || 'Label';
    const node = new Konva.Group({
      x: Number.isFinite(options.x) ? options.x : 0,
      y: Number.isFinite(options.y) ? options.y : 0,
      rotation: Number.isFinite(options.rotation) ? options.rotation : 0,
      draggable: true,
      name: 'label',
    });
    node.setAttrs({
      customType: 'label',
      itemType: 'label',
      selectable: true,
      labelText: textValue,
      fontSize: Number(options.fontSize) || 16,
      labelColor: options.labelColor || (darkMode ? '#f8f9fa' : '#212529'),
      fontStyle: options.fontStyle || 'normal',
      labelBorder: !!options.labelBorder,
      padding: Number(options.padding) || 4,
      attachedToNodeId: options.attachedToNodeId || null,
      labelMode: options.attachedToNodeId ? 'attached' : 'free',
      // Stored in the item's own coordinate system. This lets a label stay
      // connected while the item is moved or rotated, without forcing every
      // item label back to the exact centre.
      attachmentOffset: options.attachedToNodeId ? cloneConfig(options.attachmentOffset || { x: 0, y: 0 }) : null,
      autoGenerated: !!options.autoGenerated,
      labelKind: options.labelKind || '',
    });
    if (options.nodeId) node.setAttr('nodeId', options.nodeId);
    const hit = new Konva.Rect({
      x: 0,
      y: 0,
      fill: 'rgba(0,0,0,0.01)',
      strokeWidth: 0,
      listening: true,
      name: 'labelHitArea',
    });
    const textNode = new Konva.Text({
      x: 0,
      y: 0,
      text: textValue,
      fontSize: Number(options.fontSize) || 16,
      fontFamily: 'Arial',
      fill: options.labelColor || (darkMode ? '#f8f9fa' : '#212529'),
      fontStyle: options.fontStyle || 'normal',
      listening: false,
      name: 'labelText',
    });
    node.add(hit);
    const border = new Konva.Rect({ x: 0, y: 0, stroke: options.labelColor || (darkMode ? '#f8f9fa' : '#212529'), strokeWidth: 1, visible: !!options.labelBorder, listening: false, name: 'labelBorder' });
    node.add(border);
    node.add(textNode);
    updateLabelNodeLayout(node);
    ensureNodeId(node, 'label');
    attachShapeEvents(node);
    return node;
  }

  function getNodeCenter(node) {
    if (!node || !node.getClientRect) return { x: node && node.x ? node.x() : 0, y: node && node.y ? node.y() : 0 };
    try {
      const rect = node.getClientRect({ relativeTo: worldGroup });
      return { x: rect.x + (rect.width / 2), y: rect.y + (rect.height / 2) };
    } catch (err) {
      return { x: node.x ? node.x() : 0, y: node.y ? node.y() : 0 };
    }
  }

  function findAttachedLabels(nodeId) {
    if (!nodeId) return [];
    return getOrderedLayers()
      .filter((layer) => layer.kind === 'label')
      .flatMap((layer) => collectionToArray(getLayerGroup(layer.id) && getLayerGroup(layer.id).getChildren()))
      .filter((child) => child && child.getAttr && child.getAttr('customType') === 'label' && child.getAttr('attachedToNodeId') === nodeId);
  }

  function syncAttachedLabelsForNode(node) {
    const nodeId = node && node.getAttr ? node.getAttr('nodeId') : '';
    if (!nodeId) return;
    const center = getNodeCenter(node);
    const rotation = node.rotation ? node.rotation() : 0;
    findAttachedLabels(nodeId).forEach((labelNode) => {
      const offset = labelNode.getAttr('attachmentOffset') || { x: 0, y: 0 };
      const radians = rotation * Math.PI / 180;
      const localX = Number(offset.x) || 0; const localY = Number(offset.y) || 0;
      labelNode.position({ x: center.x + localX * Math.cos(radians) - localY * Math.sin(radians), y: center.y + localX * Math.sin(radians) + localY * Math.cos(radians) });
      labelNode.rotation(rotation);
      if (selectedItems.includes(labelNode)) showLabelGearForNode(labelNode);
    });
  }

  function attachedLabelBounds(node) {
    const rect = node && node.getClientRect ? node.getClientRect({ relativeTo: worldGroup }) : null;
    if (!rect) return null;
    // Labels may sit inside the item or just outside its perimeter, but never
    // drift so far away that their relationship becomes unclear.
    const margin = Math.max(FEET_TO_PX, Math.min(48, Math.max(rect.width, rect.height) * .25));
    return { x: rect.x - margin, y: rect.y - margin, width: rect.width + margin * 2, height: rect.height + margin * 2 };
  }

  function constrainAttachedLabelPosition(labelNode, point) {
    const parent = labelNode && labelNode.getAttr ? getNodeById(labelNode.getAttr('attachedToNodeId')) : null;
    const bounds = attachedLabelBounds(parent);
    if (!parent || !bounds || !point) return point;
    return { x: Math.max(bounds.x, Math.min(bounds.x + bounds.width, point.x)), y: Math.max(bounds.y, Math.min(bounds.y + bounds.height, point.y)) };
  }

  function syncAttachedLabelOffset(labelNode) {
    if (!(labelNode && labelNode.getAttr && labelNode.getAttr('labelMode') === 'attached')) return;
    const parent = getNodeById(labelNode.getAttr('attachedToNodeId'));
    if (!parent) return;
    const constrained = constrainAttachedLabelPosition(labelNode, labelNode.position());
    labelNode.position(constrained);
    const center = getNodeCenter(parent); const radians = -(parent.rotation ? parent.rotation() : 0) * Math.PI / 180;
    const dx = constrained.x - center.x; const dy = constrained.y - center.y;
    labelNode.setAttr('attachmentOffset', { x: dx * Math.cos(radians) - dy * Math.sin(radians), y: dx * Math.sin(radians) + dy * Math.cos(radians) });
  }

  function clearLabelAttachmentPreview() {
    if (labelAttachmentPreview) labelAttachmentPreview.destroy();
    labelAttachmentPreview = null;
  }

  function clearLabelPlacementPreview() {
    if (labelPlacementPreview) labelPlacementPreview.destroy();
    labelPlacementPreview = null;
  }

  function renderLabelPlacementPreview(position) {
    if (!labelPlacementDraft || !position || !uiGroup) return;
    clearLabelPlacementPreview();
    const appearance = labelPlacementDraft.appearance || {};
    const padding = 4;
    const text = new Konva.Text({ x: padding, y: padding, text: labelPlacementDraft.text, fontSize: Number(appearance.fontSize) || 16, fontStyle: appearance.fontStyle || 'normal', fontFamily: 'Arial', fill: appearance.labelColor || (darkMode ? '#f8f9fa' : '#212529'), listening: false });
    const width = text.width() + padding * 2; const height = text.height() + padding * 2;
    labelPlacementPreview = new Konva.Group({ x: position.x, y: position.y, offsetX: width / 2, offsetY: height / 2, opacity: .66, listening: false, name: 'labelPlacementPreview' });
    labelPlacementPreview.add(new Konva.Rect({ width, height, fill: 'rgba(255,255,255,.8)', stroke: appearance.labelBorder ? (appearance.labelColor || '#212529') : '#0d6efd', strokeWidth: 1, dash: appearance.labelBorder ? [] : [4, 3], listening: false }));
    labelPlacementPreview.add(text); uiGroup.add(labelPlacementPreview); labelPlacementPreview.moveToTop(); worldLayer.batchDraw();
  }

  function placeCanvasLabelDraft(position) {
    if (!labelPlacementDraft || !position) return null;
    const draft = labelPlacementDraft;
    const labelNode = addLabelToCanvas({ text: draft.text, x: position.x, y: position.y, ...draft.appearance });
    labelPlacementDraft = null; clearLabelPlacementPreview();
    if (!labelNode) return null;
    ensureLayerOrder(); renderLayersPanel(); worldLayer.draw(); setDirty(true);
    setActiveTool('select'); selectedItems = [labelNode]; updateTransformer();
    return labelNode;
  }

  function placeAttachedLabelDraft(targetNode, position) {
    if (!labelPlacementDraft || !targetNode || !position) return null;
    const draft = labelPlacementDraft;
    const targetNodeId = ensureNodeId(targetNode, 'node');
    const constrained = constrainAttachedLabelPosition({ getAttr: (key) => key === 'attachedToNodeId' ? targetNodeId : null }, position);
    const labelNode = addLabelToCanvas({ text: draft.text, x: constrained.x, y: constrained.y, rotation: targetNode.rotation ? targetNode.rotation() : 0, attachedToNodeId: targetNodeId, attachmentOffset: { x: 0, y: 0 }, ...draft.appearance });
    if (!labelNode) return null;
    syncAttachedLabelOffset(labelNode);
    labelPlacementDraft = null; clearLabelPlacementPreview(); clearLabelAttachmentPreview();
    ensureLayerOrder(); renderLayersPanel(); worldLayer.draw(); setDirty(true);
    setActiveTool('select'); selectedItems = [labelNode]; updateTransformer();
    return labelNode;
  }

  function beginLabelPlacementTool() {
    setActiveTool('label');
    if (activeTool !== 'label') return;
    labelPlacementDraft = null; clearLabelPlacementPreview();
    requestLabelText('Add label', 'After you save, click canvas for a free label or click an item, group, or venue to attach the label at that position.', '', (submitted) => {
      const text = String(submitted || '').trim(); if (!text) return;
      labelPlacementDraft = { text, appearance: labelAppearanceFromInputs() };
      const pointer = worldGroup && worldGroup.getRelativePointerPosition ? worldGroup.getRelativePointerPosition() : null;
      if (pointer) renderLabelPlacementPreview(snapPosition(pointer));
      showPlannerToast('Click canvas to place a free label, or click an item, group, or venue to attach it.');
    });
  }

  function beginLabelCopyPlacement(text, appearance) {
    if (!String(text || '').trim()) return;
    setActiveTool('label'); if (activeTool !== 'label') return;
    labelPlacementDraft = {
      text: String(text).trim(),
      appearance,
    };
    const pointer = worldGroup && worldGroup.getRelativePointerPosition ? worldGroup.getRelativePointerPosition() : null;
    if (pointer) renderLabelPlacementPreview(pointer);
    showPlannerToast('Label copy ready. Click canvas for a free copy, or click an item, group, or venue to attach it.');
  }

  function copyLabelFromEditor() {
    if (!labelTextCanCopy) return;
    const text = labelTextInput ? labelTextInput.value : '';
    const appearance = labelAppearanceFromInputs();
    closeLabelTextModal();
    beginLabelCopyPlacement(text, appearance);
  }

  function showLabelAttachmentPreview(node) {
    if (!uiGroup || !node || !(node.getAttr && node.getAttr('customType') !== 'label')) return;
    const bounds = attachedLabelBounds(node); if (!bounds) return;
    if (!labelAttachmentPreview) {
      labelAttachmentPreview = new Konva.Rect({ listening: false, fill: 'rgba(13,110,253,.06)', stroke: '#0d6efd', strokeWidth: 1.5, dash: [5, 4], name: 'labelAttachmentPreview' });
      uiGroup.add(labelAttachmentPreview);
    }
    labelAttachmentPreview.position({ x: bounds.x, y: bounds.y }); labelAttachmentPreview.size({ width: bounds.width, height: bounds.height }); labelAttachmentPreview.show(); labelAttachmentPreview.moveToTop();
  }

  function tentLocalPoint(tent, worldPoint) {
    return worldPointToTentLocalPoint(worldPoint, { x: tent.x(), y: tent.y() }, tent.rotation() || 0, FEET_TO_PX);
  }

  function renderSidewallDragPreview(node, worldPoint) {
    if (!node || !worldPoint || !uiGroup) return;
    const tent = getNodeById(node.getAttr('parentTentNodeId') || '');
    if (!tent) return;
    const widthFt = Number(tent.getAttr('widthFt')) || 10;
    const heightFt = Number(tent.getAttr('heightFt')) || 10;
    const attachment = node.getAttr('attachment') || {};
    const segments = tentAddonSegments(widthFt, heightFt, tentLocalPoint(tent, worldPoint), Number(attachment.lengthFt) || 10);
    if (sidewallDragPreview) sidewallDragPreview.destroy();
    sidewallDragPreview = new Konva.Group({ x: tent.x(), y: tent.y(), rotation: tent.rotation(), listening: false, name: 'sidewallDragPreview' });
    segments.forEach((segment) => drawTentSidewallSegment(Konva, sidewallDragPreview, segment, widthFt, heightFt, '#0d6efd', FEET_TO_PX, .9));
    uiGroup.add(sidewallDragPreview); sidewallDragPreview.moveToTop(); worldLayer.batchDraw();
  }

  function clearSidewallDragPreview(node = null) {
    if (sidewallDragPreview) sidewallDragPreview.destroy();
    sidewallDragPreview = null;
    if (node && node.opacity) node.opacity(1);
  }

  function updateTentAddonAttachmentFromPoint(node, worldPoint) {
    if (!node || !worldPoint) return false;
    const tent = getNodeById(node.getAttr('parentTentNodeId') || '');
    if (!tent) return false;
    const addonType = node.getAttr('addonType');
    const widthFt = Number(tent.getAttr('widthFt')) || 10;
    const heightFt = Number(tent.getAttr('heightFt')) || 10;
    const local = tentLocalPoint(tent, worldPoint);
    const attachment = cloneConfig(node.getAttr('attachment')) || {};
    if (addonType === 'sidewall') {
      const lengthFt = Number(attachment.lengthFt) || Number(node.getAttr('lengthFt')) || 10;
      node.setAttr('attachment', { kind: 'sidewall', lengthFt, segments: tentAddonSegments(widthFt, heightFt, sidewallPlacementPoint(widthFt, heightFt, local, true), lengthFt) });
    } else if (addonType === 'fan') {
      node.setAttr('attachment', fanAttachmentForPlacement(tent, worldPoint, Number(node.getAttr('widthFt')) || 1, Number(node.getAttr('lengthFt')) || 2, false));
    } else if (addonType === 'weight') {
      const footprint = normaliseWeightFootprint({ weightFootprint: node.getAttr('weightFootprint'), diameterFt: node.getAttr('diameterFt'), widthFt: node.getAttr('widthFt'), lengthFt: node.getAttr('lengthFt') });
      node.setAttr('attachment', weightAttachmentAtLeg(widthFt, heightFt, nearestTentLegIndex(widthFt, heightFt, local).index, local, footprint));
    } else if (addonType === 'legDrape') {
      node.setAttr('attachment', legDrapeAttachmentAtLeg(widthFt, heightFt, nearestTentLegIndex(widthFt, heightFt, local).index));
    } else if (addonType === 'fireExtinguisher') {
      node.setAttr('attachment', fireExtinguisherAttachmentAtLeg(widthFt, heightFt, nearestTentLegIndex(widthFt, heightFt, local).index));
    } else if (addonType === 'exitSign' || addonType === 'noSmokingSign') {
      node.setAttr('attachment', perimeterSignAttachment(widthFt, heightFt, local, Number(attachment.signLengthFt) || 2));
    } else if (addonType === 'chandelier') {
      node.setAttr('attachment', { kind: 'chandelier', point: { x: Math.max(0, Math.min(widthFt, local.x)), y: Math.max(0, Math.min(heightFt, local.y)) } });
    } else {
      return false;
    }
    renderTentAddonGeometry(node, tent);
    return true;
  }


  function isCustomBistroPlacement() {
    return activeTool === 'place' && placementPayload && placementPayload.kind === 'tentAddon' && placementPayload.addonType === 'customBistro';
  }

  function isDrawnRunPlacement() {
    return activeTool === 'place' && placementPayload && placementPayload.kind === 'drawnRun';
  }

  function clearDrawnRunDraft() {
    if (drawnRunDraft.preview) drawnRunDraft.preview.destroy();
    if (drawnRunDraft.node && drawnRunDraft.node.show) drawnRunDraft.node.show();
    drawnRunDraft = { points: [], anchors: [], preview: null, node: null };
  }

  function runLengthFt(points) {
    return polylineLength(points, FEET_TO_PX);
  }

  function isStandaloneBistroRun(node) {
    return !!(node && node.getAttr && node.getAttr('customType') === 'drawnRun' && node.getAttr('drawMode') === 'bistro');
  }

  function isLightPost(node) {
    return !!(node && node.getAttr && node.getAttr('customType') === 'item' && node.getAttr('inventoryName') === 'Light Post');
  }

  function ensureLightPostHitArea(node) {
    if (!isLightPost(node) || !node.add || (node.findOne && node.findOne('.lightPostHitArea'))) return;
    const basePx = (Number(node.getAttr('widthFt')) || 3) * FEET_TO_PX;
    const hit = new Konva.Rect({ x: 0, y: 0, width: basePx, height: basePx, fill: 'rgba(0,0,0,0.001)', listening: true, name: 'lightPostHitArea' });
    node.add(hit); hit.moveToBottom();
  }

  // Konva groups only receive pointer events through listening children. Many
  // inventory models are groups of non-listening visual parts, so give every
  // selectable group a transparent local hit surface before its handlers are
  // attached. This keeps selection, dragging, and rotation reliable for all
  // composite inventory—not only chairs.
  function ensureSelectableGroupHitArea(node) {
    if (!(node && node.getClassName && node.getClassName() === 'Group' && node.getAttr && node.getAttr('selectable') && node.add)) return;
    if (node.findOne && node.findOne('.plannerShapeHitArea')) return;
    const children = node.getChildren ? Array.from(node.getChildren()) : [];
    if (children.some((child) => child && child.listening && child.listening())) return;
    const bounds = node.getClientRect ? node.getClientRect({ skipTransform: true }) : null;
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
    const padding = 3;
    const hit = new Konva.Rect({
      x: bounds.x - padding,
      y: bounds.y - padding,
      width: bounds.width + (padding * 2),
      height: bounds.height + (padding * 2),
      fill: 'rgba(0,0,0,0.001)',
      listening: true,
      name: 'plannerShapeHitArea',
    });
    node.add(hit);
    hit.moveToBottom();
  }

  function normalizedLightPostAnchors(node) {
    const points = cloneConfig(node && node.getAttr && node.getAttr('runPoints')) || [];
    const seen = new Set();
    return (cloneConfig(node && node.getAttr && node.getAttr('lightPostAnchors')) || []).filter((anchor) => {
      const index = Number(anchor && anchor.pointIndex);
      const nodeId = String(anchor && anchor.nodeId || '');
      if (!Number.isInteger(index) || index < 0 || index >= points.length || !nodeId || seen.has(index)) return false;
      seen.add(index);
      return true;
    }).map((anchor) => ({ pointIndex: Number(anchor.pointIndex), nodeId: String(anchor.nodeId) }));
  }

  function lightPostCenter(node) {
    return getNodeCenter(node);
  }

  function setLightPostCenter(node, point) {
    if (!isLightPost(node) || !point) return;
    const current = lightPostCenter(node);
    node.position({ x: node.x() + point.x - current.x, y: node.y() + point.y - current.y });
  }

  function runWorldPoint(node, point) {
    const radians = (node.rotation ? node.rotation() : 0) * Math.PI / 180;
    const cos = Math.cos(radians); const sin = Math.sin(radians);
    return { x: node.x() + point.x * cos - point.y * sin, y: node.y() + point.x * sin + point.y * cos };
  }

  function bistroRunWorldPoints(node) {
    return (cloneConfig(node && node.getAttr && node.getAttr('runPoints')) || []).map((point) => runWorldPoint(node, point));
  }

  function renderDrawnRunGeometry(node) {
    return drawDrawnRunGeometry({ Konva, pixelsPerFoot: FEET_TO_PX, runLengthFt, cloneConfig, attachShapeEvents, ensureNodeId }, node);
  }

  function setBistroRunWorldPoints(node, points) {
    if (!isStandaloneBistroRun(node) || !Array.isArray(points) || points.length < 2) return;
    node.position({ x: 0, y: 0 });
    node.rotation(0);
    node.setAttr('runPoints', cloneConfig(points));
    node.setAttr('runLengthFt', runLengthFt(points));
    renderDrawnRunGeometry(node);
  }

  function linkedLightPosts(node) {
    if (!isStandaloneBistroRun(node)) return [];
    const seen = new Set();
    return normalizedLightPostAnchors(node).map((anchor) => getNodeById(anchor.nodeId)).filter((post) => {
      const id = post && ensureNodeId(post, 'item');
      if (!isLightPost(post) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function syncBistroRunsForPosts(posts, excludedRun = null) {
    const postIds = new Set((posts || []).filter(isLightPost).map((post) => ensureNodeId(post, 'item')));
    const excludedRuns = excludedRun instanceof Set ? excludedRun : new Set(excludedRun ? [excludedRun] : []);
    if (!postIds.size) return;
    forEachNode((node) => {
      if (!isStandaloneBistroRun(node) || excludedRuns.has(node)) return;
      const anchors = normalizedLightPostAnchors(node);
      if (!anchors.some((anchor) => postIds.has(anchor.nodeId))) return;
      const points = bistroRunWorldPoints(node);
      anchors.forEach((anchor) => {
        if (!postIds.has(anchor.nodeId)) return;
        const post = getNodeById(anchor.nodeId);
        if (isLightPost(post)) points[anchor.pointIndex] = lightPostCenter(post);
      });
      setBistroRunWorldPoints(node, points);
      node.setAttr('lightPostAnchors', anchors);
    });
  }

  function syncBistroRunPostsFromRun(node) {
    if (!isStandaloneBistroRun(node)) return [];
    const points = bistroRunWorldPoints(node);
    const posts = [];
    normalizedLightPostAnchors(node).forEach((anchor) => {
      const post = getNodeById(anchor.nodeId);
      if (!isLightPost(post) || !points[anchor.pointIndex]) return;
      setLightPostCenter(post, points[anchor.pointIndex]);
      if (!posts.includes(post)) posts.push(post);
    });
    syncBistroRunsForPosts(posts, node);
    return posts;
  }

  function refreshStandaloneLightConnections() {
    forEachNode((node) => {
      if (!isStandaloneBistroRun(node)) return;
      const points = bistroRunWorldPoints(node);
      const anchors = normalizedLightPostAnchors(node).filter((anchor) => isLightPost(getNodeById(anchor.nodeId)));
      const anchoredIndexes = new Set(anchors.map((anchor) => anchor.pointIndex));
      // Layouts made before the explicit link data existed already have their
      // light points on post centers. Adopt those posts on load so moving one
      // immediately redraws the existing strand instead of requiring a rebuild.
      points.forEach((point, index) => {
        if (anchoredIndexes.has(index)) return;
        const post = lightPostAnchorAt(point, FEET_TO_PX);
        if (post) anchors.push({ pointIndex: index, nodeId: ensureNodeId(post, 'item') });
      });
      node.setAttr('lightPostAnchors', anchors);
      if (!anchors.length) return;
      anchors.forEach((anchor) => { const post = getNodeById(anchor.nodeId); if (post) points[anchor.pointIndex] = lightPostCenter(post); });
      setBistroRunWorldPoints(node, points);
      node.setAttr('lightPostAnchors', anchors);
    });
  }

  function beginStandaloneLightAssemblyDrag(node) {
    if (!isStandaloneBistroRun(node)) return false;
    const posts = linkedLightPosts(node);
    if (!posts.length) return false;
    standaloneLightAssemblyDrag = {
      run: node,
      runStart: node.position(),
      posts: posts.map((post) => ({ node: post, position: post.position() })),
    };
    return true;
  }

  function updateStandaloneLightAssemblyDrag(node) {
    const drag = standaloneLightAssemblyDrag;
    if (!drag || drag.run !== node) return;
    const dx = node.x() - drag.runStart.x; const dy = node.y() - drag.runStart.y;
    const posts = drag.posts.map((entry) => entry.node).filter(isLightPost);
    drag.posts.forEach((entry) => entry.node.position({ x: entry.position.x + dx, y: entry.position.y + dy }));
    syncBistroRunsForPosts(posts, node);
  }

  function finishStandaloneLightAssemblyDrag(node) {
    if (!standaloneLightAssemblyDrag || standaloneLightAssemblyDrag.run !== node) return;
    updateStandaloneLightAssemblyDrag(node);
    syncBistroRunPostsFromRun(node);
    standaloneLightAssemblyDrag = null;
  }

  function finalizeStandaloneLightRunTransform(node) {
    if (!isStandaloneBistroRun(node)) return;
    const points = bistroRunWorldPoints(node);
    setBistroRunWorldPoints(node, points);
    syncBistroRunPostsFromRun(node);
  }

  function createDrawnRunNode(data, start, end) {
    return buildDrawnRunNode({ Konva, pixelsPerFoot: FEET_TO_PX, runLengthFt, cloneConfig, attachShapeEvents, ensureNodeId }, data, start, end);
  }

  function renderDrawnRunDraft(pointer) {
    if (drawnRunDraft.preview) drawnRunDraft.preview.destroy();
    if (!drawnRunDraft.points.length || !pointer || !uiGroup) return;
    const rawEnd = snapBistroLightPoint(pointer);
    const end = placementPayload && placementPayload.drawMode === 'bistro' && drawnRunDraft.points.length
      ? constrainStandaloneBistroEndpoint(drawnRunDraft.points[drawnRunDraft.points.length - 1], rawEnd)
      : rawEnd;
    const points = [...drawnRunDraft.points, end];
    const color = placementPayload && placementPayload.color || '#b98fc1';
    drawnRunDraft.preview = new Konva.Line({ points: points.flatMap((point) => [point.x, point.y]), stroke: color, strokeWidth: 3, dash: [7, 5], listening: false, name: 'drawnRunDraft' });
    uiGroup.add(drawnRunDraft.preview); drawnRunDraft.preview.moveToTop(); worldLayer.batchDraw();
  }

  function tentWorldPoint(tent, point) {
    return tentLocalPointToWorldPoint(point, { x: tent.x(), y: tent.y() }, tent.rotation() || 0, FEET_TO_PX);
  }

  function snapBistroLightPoint(point) {
    const snapped = snapPosition(point); let match = null; let distance = FEET_TO_PX;
    forEachNode((node) => {
      if (!node || !node.getAttr) return;
      const candidates = [];
      if (node.getAttr('customType') === 'pipeDrapeChain') candidates.push(...pipeDrapeWorldPoints(node));
      if (isLightPost(node)) candidates.push(lightPostCenter(node));
      if (node.getAttr('customType') === 'venue' && node.getAttr('venueType') === 'tent') {
        const local = tentLocalPoint(node, point); const width = Number(node.getAttr('widthFt')) || 0; const height = Number(node.getAttr('heightFt')) || 0;
        const edge = projectPointToTentEdge(node, local); candidates.push(tentWorldPoint(node, edge));
        tentLegPositionsFt(width, height).forEach(([x, y]) => candidates.push(tentWorldPoint(node, { x, y })));
      }
      candidates.forEach((candidate) => { const next = Math.hypot(candidate.x - point.x, candidate.y - point.y); if (next <= distance) { match = candidate; distance = next; } });
    });
    return match || snapped;
  }

  function lightPostAnchorAt(point, tolerancePx = FEET_TO_PX * .25) {
    let nearest = null; let distance = tolerancePx;
    forEachNode((node) => {
      if (!isLightPost(node)) return;
      const center = lightPostCenter(node); const next = Math.hypot(center.x - point.x, center.y - point.y);
      if (next <= distance) { nearest = node; distance = next; }
    });
    return nearest;
  }

  function standaloneBistroSpanFeet(a, b) {
    return pointDistanceInFeet(a, b, FEET_TO_PX);
  }

  function constrainStandaloneBistroEndpoint(start, rawEnd) {
    return clampEndpointToSpan(start, rawEnd, STANDALONE_BISTRO_MAX_SPAN_FT, FEET_TO_PX);
  }

  function standaloneBistroNeighborPoints(post) {
    if (!isLightPost(post)) return [];
    const postId = ensureNodeId(post, 'item'); const neighbors = [];
    forEachNode((node) => {
      if (!isStandaloneBistroRun(node)) return;
      const points = bistroRunWorldPoints(node);
      normalizedLightPostAnchors(node).filter((anchor) => anchor.nodeId === postId).forEach((anchor) => {
        [anchor.pointIndex - 1, anchor.pointIndex + 1].forEach((index) => {
          if (index >= 0 && index < points.length) neighbors.push(points[index]);
        });
      });
    });
    return neighbors;
  }

  function constrainLightPostPosition(node, position) {
    if (!isLightPost(node) || !position) return position;
    const currentCenter = lightPostCenter(node);
    let candidate = { x: currentCenter.x + position.x - node.x(), y: currentCenter.y + position.y - node.y() };
    const maxPx = STANDALONE_BISTRO_MAX_SPAN_FT * FEET_TO_PX;
    // The current location is valid, so sequentially projecting an overlong
    // drag back onto each connected 60 ft circle keeps the pole inside the
    // feasible span for ordinary multi-string layouts.
    standaloneBistroNeighborPoints(node).forEach((neighbor) => {
      const dx = candidate.x - neighbor.x; const dy = candidate.y - neighbor.y; const distance = Math.hypot(dx, dy);
      if (distance > maxPx) candidate = { x: neighbor.x + dx / distance * maxPx, y: neighbor.y + dy / distance * maxPx };
    });
    return { x: node.x() + candidate.x - currentCenter.x, y: node.y() + candidate.y - currentCenter.y };
  }

  function constrainLightPostToConnectedSpans(node) {
    if (!isLightPost(node)) return;
    node.position(constrainLightPostPosition(node, node.position()));
  }

  function appendDrawnRunPoint(point, resolvedPoint = null) {
    const snapped = resolvedPoint || snapBistroLightPoint(point);
    const index = drawnRunDraft.points.length;
    drawnRunDraft.points.push(snapped);
    if (placementPayload && placementPayload.drawMode === 'bistro') {
      const post = lightPostAnchorAt(snapped);
      if (post) drawnRunDraft.anchors = (drawnRunDraft.anchors || []).filter((anchor) => anchor.pointIndex !== index).concat({ pointIndex: index, nodeId: ensureNodeId(post, 'item') });
    }
    return snapped;
  }

  function handleDrawnRunPoint(point, clickDetail = 1, undo = false) {
    if (!isDrawnRunPlacement() || !point) return false;
    if (undo) { drawnRunDraft.points.pop(); drawnRunDraft.anchors = (drawnRunDraft.anchors || []).filter((anchor) => anchor.pointIndex < drawnRunDraft.points.length); renderDrawnRunDraft(point); return true; }
    if (clickDetail > 1 && drawnRunDraft.points.length >= 2) {
      const target = resolvePlacementLayer('decor'); const group = target && getLayerGroup(target.id); if (!group) return false;
      const lightPostAnchors = placementPayload.drawMode === 'bistro' ? (drawnRunDraft.anchors || []) : [];
      const node = drawnRunDraft.node || createDrawnRunNode({ ...(placementPayload.rawData || placementPayload), lightPostAnchors }, drawnRunDraft.points);
      if (drawnRunDraft.node) { node.position({ x: 0, y: 0 }); node.rotation(0); node.setAttr('runPoints', cloneConfig(drawnRunDraft.points)); node.setAttr('runLengthFt', runLengthFt(drawnRunDraft.points)); node.setAttr('lightPostAnchors', cloneConfig(lightPostAnchors)); node.show(); renderDrawnRunGeometry(node); }
      else { setNodeLayerId(node, target.id); group.add(node); }
      clearDrawnRunDraft(); setDirty(true); refreshInventoryPanelUI(); renderLayersPanel(); worldLayer.batchDraw(); return true;
    }
    const snapped = snapBistroLightPoint(point);
    if (!drawnRunDraft.points.length) { appendDrawnRunPoint(point); renderDrawnRunDraft(point); return true; }
    const prior = drawnRunDraft.points[drawnRunDraft.points.length - 1];
    const endpoint = placementPayload.drawMode === 'bistro' ? constrainStandaloneBistroEndpoint(prior, snapped) : snapped;
    if (Math.hypot(endpoint.x - prior.x, endpoint.y - prior.y) < FEET_TO_PX * .25) return true;
    appendDrawnRunPoint(point, endpoint); renderDrawnRunDraft(point); return true;
  }

  function isPipeDrapePlacement() { return activeTool === 'place' && placementPayload && placementPayload.kind === 'pipeDrapeChain'; }
  function pipeDrapeSpanFeet(a, b) { return pointDistanceInFeet(a, b, FEET_TO_PX); }
  function pipeDrapeSpanValid(a, b, tool) {
    const length = pipeDrapeSpanFeet(a, b); const min = Number(tool.min) || 0; const max = Number(tool.max) || min;
    return length >= min - .01 && length <= max + .01;
  }
  function clearPipeDrapeDraft() {
    if (pipeDrapeDraft.preview) pipeDrapeDraft.preview.destroy();
    if (pipeDrapeDraft.node && pipeDrapeDraft.node.show) pipeDrapeDraft.node.show();
    pipeDrapeDraft = { points: [], preview: null, node: null };
  }
  function pipeDrapeWorldPoints(node) {
    const offset = node.position(); return (cloneConfig(node.getAttr('pipeDrapePoints')) || []).map((point) => ({ x: point.x + offset.x, y: point.y + offset.y }));
  }
  function pipeDrapeUprightName(height) {
    if (height <= 12) return "Upright 7'–12'";
    if (height <= 14) return "Upright 8'–14'";
    return "Upright 8'–20'";
  }
  function renderPipeDrapeGeometry(node) {
    const points = cloneConfig(node.getAttr('pipeDrapePoints')) || []; const color = '#b98fc1';
    node.destroyChildren();
    // Ground hardware is rendered first. Crossbars and fabric are physically
    // above the base plates in a top-down plan, so they must stay on top.
    points.forEach((point) => {
      if (!pipeDrapeBaseIsOwnedByNode(node, point)) return;
      node.add(new Konva.Rect({ x: point.x - FEET_TO_PX, y: point.y - FEET_TO_PX, width: FEET_TO_PX * 2, height: FEET_TO_PX * 2, fill: 'rgba(108,117,125,.32)', stroke: '#59636b', strokeWidth: 1, cornerRadius: 1, listening: false, name: 'pipeDrapeBase' }));
      node.add(new Konva.Circle({ x: point.x, y: point.y, radius: Math.max(2, FEET_TO_PX * .125), fill: '#59636b', stroke: '#343a40', strokeWidth: 1, listening: false, name: 'pipeDrapeUpright' }));
    });
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1], b = points[i];
      node.add(new Konva.Line({ points: [a.x, a.y, b.x, b.y], stroke: 'rgba(185,143,193,.52)', strokeWidth: 8, lineCap: 'butt', listening: false, name: 'pipeDrapeFabric' }));
      node.add(new Konva.Line({ points: [a.x, a.y, b.x, b.y], stroke: '#85939c', strokeWidth: 2, lineCap: 'round', listening: false, name: 'pipeDrapeCrossbar' }));
      // A forgiving invisible hit target makes the narrow top-down crossbar
      // practical to select without changing its visual layering.
      node.add(new Konva.Line({ points: [a.x, a.y, b.x, b.y], stroke: 'rgba(0,0,0,.01)', strokeWidth: 20, lineCap: 'round', name: 'pipeDrapeHit' }));
    }
  }
  function pipeDrapeBaseIsOwnedByNode(node, point) {
    const ownOrder = Number(node.getAttr('pipeDrapeRunOrder')) || Infinity; const ownId = String(node.getAttr('nodeId') || '');
    let owner = { order: ownOrder, id: ownId };
    forEachNode((candidate) => {
      if (!(candidate && candidate !== node && candidate.getAttr && candidate.getAttr('customType') === 'pipeDrapeChain')) return;
      if (!pipeDrapeWorldPoints(candidate).some((candidatePoint) => Math.hypot(candidatePoint.x - point.x, candidatePoint.y - point.y) < .01)) return;
      const next = { order: Number(candidate.getAttr('pipeDrapeRunOrder')) || Infinity, id: String(candidate.getAttr('nodeId') || '') };
      if (next.order < owner.order || (next.order === owner.order && next.id < owner.id)) owner = next;
    });
    return owner.order === ownOrder && owner.id === ownId;
  }
  function ensurePipeDrapeSetup(node) {
    let id = String(node.getAttr('pipeDrapeSetupId') || '');
    if (id) return id;
    const order = Number(node.getAttr('pipeDrapeRunOrder')) || (++pipeDrapeSetupCounter);
    id = `pipe-drape-setup-${ensureNodeId(node, 'pipe-drape')}`;
    node.setAttrs({ pipeDrapeSetupId: id, pipeDrapeSetupOrder: order, pipeDrapeRunOrder: order, pipeDrapeSetupName: '' });
    pipeDrapeSetupCounter = Math.max(pipeDrapeSetupCounter, order); return id;
  }
  function mergePipeDrapeSetupsForNode(node) {
    const points = pipeDrapeWorldPoints(node); const connected = new Map();
    forEachNode((candidate) => {
      if (!(candidate && candidate.getAttr && candidate.getAttr('customType') === 'pipeDrapeChain')) return;
      const candidateId = ensurePipeDrapeSetup(candidate);
      const touches = pipeDrapeWorldPoints(candidate).some((a) => points.some((b) => Math.hypot(a.x - b.x, a.y - b.y) <= FEET_TO_PX));
      if (touches) connected.set(candidateId, candidate);
    });
    const ownId = ensurePipeDrapeSetup(node); connected.set(ownId, node);
    const choices = Array.from(connected.values()).map((candidate) => ({ id: ensurePipeDrapeSetup(candidate), order: Number(candidate.getAttr('pipeDrapeSetupOrder')) || Infinity })).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    if (!choices.length) return ownId;
    const winner = choices[0]; const mergeIds = new Set(choices.map((choice) => choice.id));
    forEachNode((candidate) => {
      if (!(candidate && candidate.getAttr && candidate.getAttr('customType') === 'pipeDrapeChain')) return;
      if (mergeIds.has(ensurePipeDrapeSetup(candidate))) candidate.setAttr('pipeDrapeSetupId', winner.id);
    });
    return winner.id;
  }
  function createPipeDrapeChain(data, points) {
    const node = new Konva.Group({ draggable: true, name: 'pipeDrapeChain' });
    const runOrder = ++pipeDrapeSetupCounter;
    node.setAttrs({ customType: 'pipeDrapeChain', selectable: true, lockScaling: true, pipeDrapePoints: cloneConfig(points), crossbarId: data.id, crossbarName: data.name, crossbarMinFt: data.min, crossbarMaxFt: data.max, heightFt: data.heightFt || 10, pipeDrapeSetupId: `pipe-drape-setup-${runOrder}`, pipeDrapeSetupOrder: runOrder, pipeDrapeRunOrder: runOrder, pipeDrapeSetupName: '' });
    ensureNodeId(node, 'pipe-drape'); renderPipeDrapeGeometry(node); attachShapeEvents(node); return node;
  }
  function pipeDrapeConstrainEndpoint(start, rawEnd, tool) {
    const min = Number(tool && tool.min) || 3; const max = Number(tool && tool.max) || min;
    const dx = rawEnd.x - start.x; const dy = rawEnd.y - start.y; const rawLength = Math.hypot(dx, dy);
    const direction = rawLength > .01 ? { x: dx / rawLength, y: dy / rawLength } : { x: 1, y: 0 };
    const constrainedLength = Math.max(min * FEET_TO_PX, Math.min(max * FEET_TO_PX, rawLength));
    return { x: start.x + direction.x * constrainedLength, y: start.y + direction.y * constrainedLength };
  }
  function addPipeDrapeDraftBase(group, point, stroke = '#59636b') {
    group.add(new Konva.Rect({ x: point.x - FEET_TO_PX, y: point.y - FEET_TO_PX, width: FEET_TO_PX * 2, height: FEET_TO_PX * 2, stroke, fill: 'rgba(108,117,125,.22)', dash: [4, 3] }));
    group.add(new Konva.Circle({ x: point.x, y: point.y, radius: Math.max(2, FEET_TO_PX * .125), fill: stroke, listening: false }));
  }
  function renderPipeDrapeDraft(pointer) {
    if (pipeDrapeDraft.preview) pipeDrapeDraft.preview.destroy();
    if (!pipeDrapeDraft.points.length || !pointer || !uiGroup) return;
    const start = pipeDrapeDraft.points[pipeDrapeDraft.points.length - 1]; const end = pipeDrapeConstrainEndpoint(start, snapPosition(pointer), placementPayload || {});
    const preview = new Konva.Group({ listening: false, name: 'pipeDrapeDraft' });
    const points = [...pipeDrapeDraft.points, end];
    // Keep every confirmed base and span visible while the chain is still
    // being drawn; only the final live span is dashed.
    points.forEach((point) => addPipeDrapeDraftBase(preview, point));
    for (let index = 1; index < points.length; index += 1) {
      const a = points[index - 1]; const b = points[index]; const live = index === points.length - 1;
      preview.add(new Konva.Line({ points: [a.x, a.y, b.x, b.y], stroke: 'rgba(185,143,193,.55)', strokeWidth: 8, dash: live ? [7, 5] : [], lineCap: 'round' }));
      preview.add(new Konva.Line({ points: [a.x, a.y, b.x, b.y], stroke: '#85939c', strokeWidth: 2, dash: live ? [7, 5] : [], lineCap: 'round' }));
    }
    uiGroup.add(preview); preview.moveToTop(); pipeDrapeDraft.preview = preview; worldLayer.batchDraw();
  }
  function finishPipeDrapeChain() {
    if (!isPipeDrapePlacement() || pipeDrapeDraft.points.length < 2) return false;
    const target = resolvePlacementLayer('item'); const group = target && getLayerGroup(target.id); if (!group) return false;
    const node = pipeDrapeDraft.node;
    if (node) {
      node.position({ x: 0, y: 0 }); node.setAttr('pipeDrapePoints', cloneConfig(pipeDrapeDraft.points)); node.show(); renderPipeDrapeGeometry(node);
      mergePipeDrapeSetupsForNode(node);
    } else {
      const created = createPipeDrapeChain(placementPayload, pipeDrapeDraft.points); setNodeLayerId(created, target.id); group.add(created); mergePipeDrapeSetupsForNode(created); renderPipeDrapeGeometry(created);
    }
    clearPipeDrapeDraft(); setDirty(true); refreshInventoryPanelUI(); renderLayersPanel(); worldLayer.batchDraw(); return true;
  }
  function handlePipeDrapePoint(point, clickDetail = 1, undo = false) {
    if (!isPipeDrapePlacement() || !point) return false;
    if (undo) { pipeDrapeDraft.points.pop(); renderPipeDrapeDraft(worldGroup.getRelativePointerPosition()); return true; }
    if (clickDetail > 1) return finishPipeDrapeChain();
    const snapped = snapPosition(point);
    if (!pipeDrapeDraft.points.length) {
      pipeDrapeDraft.points.push(pipeDrapeSharedBaseAt(snapped) || snapped); renderPipeDrapeDraft(point); return true;
    }
    const prior = pipeDrapeDraft.points[pipeDrapeDraft.points.length - 1];
    const shared = pipeDrapeSharedBaseAt(snapped);
    const existing = shared || pipeDrapeDraft.points.find((candidate) => Math.hypot(candidate.x - snapped.x, candidate.y - snapped.y) <= FEET_TO_PX);
    const endpoint = existing && pipeDrapeSpanValid(prior, existing, placementPayload) ? existing : pipeDrapeConstrainEndpoint(prior, snapped, placementPayload);
    if (Math.hypot(prior.x - endpoint.x, prior.y - endpoint.y) > .01) pipeDrapeDraft.points.push(endpoint);
    renderPipeDrapeDraft(point); return true;
  }
  function pipeDrapeSharedBaseAt(point, toleranceFt = 1) {
    let found = null; let distance = Infinity;
    forEachNode((node) => {
      if (!(node && node.getAttr && node.getAttr('customType') === 'pipeDrapeChain')) return;
      pipeDrapeWorldPoints(node).forEach((candidate) => {
        const nextDistance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
        if (nextDistance <= toleranceFt * FEET_TO_PX && nextDistance < distance) { found = candidate; distance = nextDistance; }
      });
    });
    return found ? { x: found.x, y: found.y } : null;
  }
  function closePipeDrapeEdit() { if (pipeDrapeEdit.overlay) pipeDrapeEdit.overlay.destroy(); pipeDrapeEdit = { node: null, overlay: null }; if (worldLayer) worldLayer.batchDraw(); }
  function openPipeDrapeEdit(node) {
    closePipeDrapeEdit(); if (!node || !uiGroup) return;
    const overlay = new Konva.Group({ listening: true, name: 'pipeDrapeEditOverlay' }); const points = pipeDrapeWorldPoints(node);
    points.forEach((point, index) => {
      const handle = new Konva.Circle({ x: point.x, y: point.y, radius: 7, fill: '#fff', stroke: '#0d6efd', strokeWidth: 2, name: 'pipeDrapeHandle' });
      handle.on('mousedown touchstart', (event) => { event.cancelBubble = true; if (!(event.evt && event.evt.shiftKey) || points.length <= 2) return; const next = points.slice(); next.splice(index, 1); if (next.every((p, i) => !i || pipeDrapeSpanValid(next[i - 1], p, { min: node.getAttr('crossbarMinFt'), max: node.getAttr('crossbarMaxFt') }))) { node.position({ x: 0, y: 0 }); node.setAttr('pipeDrapePoints', next); renderPipeDrapeGeometry(node); setDirty(true); openPipeDrapeEdit(node); refreshInventoryPanelUI(); } }); overlay.add(handle);
    });
    for (let index = 1; index < points.length; index += 1) {
      const a = points[index - 1], b = points[index]; const hit = new Konva.Line({ points: [a.x, a.y, b.x, b.y], stroke: 'rgba(13,110,253,.01)', strokeWidth: 16, lineCap: 'round' });
      hit.on('mousedown touchstart', (event) => { event.cancelBubble = true; const p = snapPosition(worldGroup.getRelativePointerPosition()); const next = points.slice(); next.splice(index, 0, p); const spec = { min: node.getAttr('crossbarMinFt'), max: node.getAttr('crossbarMaxFt') }; if (pipeDrapeSpanValid(a, p, spec) && pipeDrapeSpanValid(p, b, spec)) { node.position({ x: 0, y: 0 }); node.setAttr('pipeDrapePoints', next); renderPipeDrapeGeometry(node); setDirty(true); openPipeDrapeEdit(node); refreshInventoryPanelUI(); } else showPlannerToast('That base would create an invalid crossbar span.'); }); overlay.add(hit);
    }
    uiGroup.add(overlay); overlay.moveToTop(); pipeDrapeEdit = { node, overlay }; worldLayer.batchDraw();
  }

  // Connected fence runs share the Pipe & Drape interaction model, but every
  // span is a fixed panel length and endpoint hardware is shared across runs.
  function isFencePlacement() { return activeTool === 'place' && placementPayload && placementPayload.kind === 'fenceChain'; }
  function fenceWorldPoints(node) { const offset = node.position(); return (cloneConfig(node.getAttr('fencePoints')) || []).map((point) => ({ x: point.x + offset.x, y: point.y + offset.y })); }
  function collectFenceChains() { const chains = []; forEachNode((node) => { if (node && node.getAttr && node.getAttr('customType') === 'fenceChain') { const points = fenceWorldPoints(node); if (points.length >= 2) chains.push({ node, points, panelLengthFt: Number(node.getAttr('fencePanelLengthFt')) || 8 }); } }); return chains; }
  function fencePointKey(point) { return fenceKey(point); }
  function fenceInventoryRows(chains = collectFenceChains()) { return calculateFenceInventoryRows(chains); }
  function ensureFenceSetup(node) { let id = String(node.getAttr('fenceSetupId') || ''); if (id) return id; const order = Number(node.getAttr('fenceRunOrder')) || (++fenceSetupCounter); id = `fence-setup-${ensureNodeId(node, 'fence')}`; node.setAttrs({ fenceSetupId: id, fenceSetupOrder: order, fenceRunOrder: order }); fenceSetupCounter = Math.max(fenceSetupCounter, order); return id; }
  function mergeFenceSetupsForNode(node) {
    const points = fenceWorldPoints(node); const connected = new Map();
    forEachNode((candidate) => { if (!(candidate && candidate.getAttr && candidate.getAttr('customType') === 'fenceChain')) return; if (fenceWorldPoints(candidate).some((a) => points.some((b) => Math.hypot(a.x - b.x, a.y - b.y) <= FEET_TO_PX))) connected.set(ensureFenceSetup(candidate), candidate); });
    connected.set(ensureFenceSetup(node), node); const choices = Array.from(connected.values()).map((candidate) => ({ id: ensureFenceSetup(candidate), order: Number(candidate.getAttr('fenceSetupOrder')) || Infinity })).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)); if (!choices.length) return '';
    const winner = choices[0]; const ids = new Set(choices.map((choice) => choice.id)); forEachNode((candidate) => { if (candidate && candidate.getAttr && candidate.getAttr('customType') === 'fenceChain' && ids.has(ensureFenceSetup(candidate))) candidate.setAttr('fenceSetupId', winner.id); }); return winner.id;
  }
  function fenceBaseIsOwnedByNode(node, point) { const ownOrder = Number(node.getAttr('fenceRunOrder')) || Infinity; const ownId = String(node.getAttr('nodeId') || ''); let owner = { order: ownOrder, id: ownId }; forEachNode((candidate) => { if (!(candidate && candidate !== node && candidate.getAttr && candidate.getAttr('customType') === 'fenceChain')) return; if (!fenceWorldPoints(candidate).some((candidatePoint) => Math.hypot(candidatePoint.x - point.x, candidatePoint.y - point.y) < .01)) return; const next = { order: Number(candidate.getAttr('fenceRunOrder')) || Infinity, id: String(candidate.getAttr('nodeId') || '') }; if (next.order < owner.order || (next.order === owner.order && next.id < owner.id)) owner = next; }); return owner.order === ownOrder && owner.id === ownId; }
  function fenceBaseAngle(points, index) { const neighbor = points[index < points.length - 1 ? index + 1 : index - 1] || points[index]; const point = points[index]; return Math.atan2(neighbor.y - point.y, neighbor.x - point.x) * 180 / Math.PI; }
  function renderFenceGeometry(node) {
    return drawFenceGeometry({ Konva, pixelsPerFoot: FEET_TO_PX, cloneConfig, fenceBaseIsOwnedByNode, fenceBaseAngle }, node);
  }
  function createFenceChain(data, points) { return buildFenceChain({ Konva, cloneConfig, nextSetupOrder: () => ++fenceSetupCounter, ensureNodeId, renderFenceGeometry, attachShapeEvents }, data, points); }
  function fenceSharedBaseAt(point, toleranceFt = 1) { let found = null; let distance = Infinity; collectFenceChains().forEach((chain) => chain.points.forEach((candidate) => { const next = Math.hypot(candidate.x - point.x, candidate.y - point.y); if (next <= toleranceFt * FEET_TO_PX && next < distance) { found = candidate; distance = next; } })); return found ? { x: found.x, y: found.y } : null; }
  function fenceConstrainEndpoint(start, rawEnd, panelLengthFt) { return constrainFenceEndpoint(start, rawEnd, panelLengthFt, FEET_TO_PX); }
  function clearFenceDraft() { if (fenceDraft.preview) fenceDraft.preview.destroy(); if (fenceDraft.node && fenceDraft.node.show) fenceDraft.node.show(); fenceDraft = { points: [], preview: null, node: null }; }
  function renderFenceDraft(pointer) { if (fenceDraft.preview) fenceDraft.preview.destroy(); if (!fenceDraft.points.length || !pointer || !uiGroup) return; const end = fenceConstrainEndpoint(fenceDraft.points[fenceDraft.points.length - 1], snapPosition(pointer), Number(placementPayload && placementPayload.panelLengthFt) || 8); const preview = new Konva.Group({ listening: false, name: 'fenceDraft' }); const points = [...fenceDraft.points, end]; const baseWidth = FEET_TO_PX * .65, baseDepth = FEET_TO_PX * 1.1; points.forEach((point, index) => { preview.add(new Konva.Rect({ x: point.x, y: point.y, width: baseWidth, height: baseDepth, offsetX: baseWidth / 2, offsetY: baseDepth / 2, rotation: fenceBaseAngle(points, index), fill: 'rgba(140,140,140,.45)', stroke: '#59636b', dash: [4, 3] })); preview.add(new Konva.Circle({ x: point.x, y: point.y, radius: Math.max(2, FEET_TO_PX * .09), fill: '#59636b' })); }); for (let index = 1; index < points.length; index += 1) preview.add(new Konva.Line({ points: [points[index - 1].x, points[index - 1].y, points[index].x, points[index].y], stroke: '#f4f4f4', strokeWidth: Math.max(4, FEET_TO_PX * .25), dash: index === points.length - 1 ? [7, 5] : [] })); uiGroup.add(preview); preview.moveToTop(); fenceDraft.preview = preview; worldLayer.batchDraw(); }
  function finishFenceChain() { if (!isFencePlacement() || fenceDraft.points.length < 2) return false; const target = resolvePlacementLayer('item'); const group = target && getLayerGroup(target.id); if (!group) return false; if (fenceDraft.node) { const node = fenceDraft.node; node.position({ x: 0, y: 0 }); node.setAttr('fencePoints', cloneConfig(fenceDraft.points)); node.show(); renderFenceGeometry(node); mergeFenceSetupsForNode(node); } else { const node = createFenceChain(placementPayload, fenceDraft.points); setNodeLayerId(node, target.id); group.add(node); mergeFenceSetupsForNode(node); } clearFenceDraft(); setDirty(true); refreshInventoryPanelUI(); renderLayersPanel(); worldLayer.batchDraw(); return true; }
  function handleFencePoint(point, clickDetail = 1, undo = false) { if (!isFencePlacement() || !point) return false; if (undo) { fenceDraft.points.pop(); renderFenceDraft(worldGroup.getRelativePointerPosition()); return true; } if (clickDetail > 1) return finishFenceChain(); const snapped = snapPosition(point); if (!fenceDraft.points.length) { fenceDraft.points.push(fenceSharedBaseAt(snapped) || snapped); renderFenceDraft(point); return true; } const prior = fenceDraft.points[fenceDraft.points.length - 1]; const shared = fenceSharedBaseAt(snapped); const exact = shared && Math.abs(Math.hypot(prior.x - shared.x, prior.y - shared.y) / FEET_TO_PX - (Number(placementPayload.panelLengthFt) || 8)) <= .01; const endpoint = exact ? shared : fenceConstrainEndpoint(prior, snapped, Number(placementPayload.panelLengthFt) || 8); if (Math.hypot(prior.x - endpoint.x, prior.y - endpoint.y) > .01) fenceDraft.points.push(endpoint); renderFenceDraft(point); return true; }
  function resumeFenceChain(node) { if (!(node && node.getAttr && node.getAttr('customType') === 'fenceChain')) return; armPlacementTool({ kind: 'fenceChain', panelLengthFt: Number(node.getAttr('fencePanelLengthFt')) || 8, label: `${Number(node.getAttr('fencePanelLengthFt')) || 8} ft Fence Run` }, null); fenceDraft = { points: fenceWorldPoints(node), preview: null, node }; node.hide(); renderFenceDraft(worldGroup.getRelativePointerPosition() || fenceDraft.points[fenceDraft.points.length - 1]); showPlannerToast('Continue from the last fence base. Shift-click undoes the latest base; double-click finishes.'); }

  function fenceDetails() { const chains = collectFenceChains(); const setups = new Map(); chains.forEach((chain) => { const id = ensureFenceSetup(chain.node); const setup = setups.get(id) || { id, order: Number(chain.node.getAttr('fenceSetupOrder')) || 0, chains: [] }; setup.chains.push(chain); setups.set(id, setup); }); return Array.from(setups.values()).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).map((setup, index) => ({ ...setup, displayName: `Fence Run ${index + 1}`, totals: fenceInventoryRows(setup.chains).rows })); }

  // These add-ons belong to individual tent legs. A click places one at the
  // nearest leg; dragging makes it practical to outfit a whole run of legs.
  function isBulkLegPlacement() {
    return activeTool === 'place' && placementPayload && placementPayload.kind === 'tentAddon'
      && ['legDrape'].includes(placementPayload.addonType);
  }

  function tentLegWorldPoint(tent, leg) {
    const radians = (tent.rotation() || 0) * Math.PI / 180;
    const x = leg[0] * FEET_TO_PX; const y = leg[1] * FEET_TO_PX;
    return { x: tent.x() + x * Math.cos(radians) - y * Math.sin(radians), y: tent.y() + x * Math.sin(radians) + y * Math.cos(radians) };
  }

  function bulkLegBox(start, end) {
    return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
  }

  function bulkLegTargets(box) {
    if (!box) return [];
    const targets = [];
    forEachNode((tent) => {
      if (!tent || !tent.getAttr || tent.getAttr('customType') !== 'venue' || tent.getAttr('venueType') !== 'tent' || !isSelectableNode(tent)) return;
      const legs = tentLegPositionsFt(Number(tent.getAttr('widthFt')) || 10, Number(tent.getAttr('heightFt')) || 10);
      legs.forEach((leg, legIndex) => {
        const point = tentLegWorldPoint(tent, leg);
        if (point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height) targets.push({ tent, legIndex, point });
      });
    });
    return targets;
  }

  function sameTentAddonAtLeg(tent, legIndex, data) {
    const addonType = data && data.addonType;
    const name = data && data.inventoryName;
    let exists = false;
    forEachNode((node) => {
      if (exists || !node || !node.getAttr || node.getAttr('customType') !== 'tentAddon') return;
      const attachment = node.getAttr('attachment') || {};
      if (node.getAttr('parentTentNodeId') !== tent.getAttr('nodeId') || node.getAttr('addonType') !== addonType || attachment.legIndex !== legIndex) return;
      // Inventory name distinguishes different weight footprints while keeping
      // the duplicate rule intuitive for all of the other leg attachments.
      if (!name || node.getAttr('inventoryName') === name) exists = true;
    });
    return exists;
  }

  function clearBulkLegPlacement() {
    if (bulkLegPlacement.preview) bulkLegPlacement.preview.destroy();
    bulkLegPlacement = { start: null, box: null, preview: null };
    if (selectionRect) selectionRect.hide();
  }

  function renderBulkLegPreview() {
    if (!bulkLegPlacement.box || !uiGroup) return;
    if (bulkLegPlacement.preview) bulkLegPlacement.preview.destroy();
    const preview = new Konva.Group({ listening: false, name: 'bulkLegPlacementPreview' });
    const color = placementPayload && placementPayload.rawData && placementPayload.rawData.color || '#0d6efd';
    bulkLegTargets(bulkLegPlacement.box).forEach(({ tent, legIndex, point }) => {
      const duplicate = sameTentAddonAtLeg(tent, legIndex, placementPayload.rawData || {});
      preview.add(new Konva.Circle({ x: point.x, y: point.y, radius: 7, fill: duplicate ? 'rgba(108,117,125,.28)' : 'rgba(13,110,253,.30)', stroke: duplicate ? '#6c757d' : color, strokeWidth: 2 }));
    });
    uiGroup.add(preview); preview.moveToTop(); bulkLegPlacement.preview = preview;
  }

  function beginBulkLegPlacement(point) {
    if (!point) return;
    bulkLegPlacement = { start: { x: point.x, y: point.y }, box: null, preview: null };
  }

  function tentPointIsInside(tent, point, toleranceFt = 0) {
    const widthFt = Number(tent.getAttr('widthFt')) || 10;
    const heightFt = Number(tent.getAttr('heightFt')) || 10;
    return tentContainsLocalPoint(widthFt, heightFt, point, toleranceFt);
  }

  function projectPointToTentEdge(tent, localPoint) {
    const widthFt = Number(tent.getAttr('widthFt')) || 10;
    const heightFt = Number(tent.getAttr('heightFt')) || 10;
    return projectLocalPointToTentEdge(widthFt, heightFt, localPoint);
  }

  function snapCustomBistroPoint(tent, localPoint) {
    const widthFt = Number(tent.getAttr('widthFt')) || 10;
    const heightFt = Number(tent.getAttr('heightFt')) || 10;
    return snapTentBistroPoint(widthFt, heightFt, localPoint);
  }

  function closestTentAtEdge(worldPoint, toleranceFt = 1) {
    let found = null; let foundDistance = Infinity;
    forEachNode((node) => {
      if (!node || !node.getAttr || node.getAttr('customType') !== 'venue' || node.getAttr('venueType') !== 'tent' || !isSelectableNode(node)) return;
      const local = tentLocalPoint(node, worldPoint);
      if (!tentPointIsInside(node, local, toleranceFt)) return;
      const widthFt = Number(node.getAttr('widthFt')) || 10;
      const heightFt = Number(node.getAttr('heightFt')) || 10;
      const edgeDistance = Math.min(Math.abs(local.y), Math.abs(local.x - widthFt), Math.abs(local.y - heightFt), Math.abs(local.x));
      if (edgeDistance <= toleranceFt && edgeDistance < foundDistance) { found = node; foundDistance = edgeDistance; }
    });
    return found;
  }

  function clearCustomBistroPreview() {
    if (customBistroDraft.preview) customBistroDraft.preview.destroy();
    customBistroDraft.preview = null;
  }

  function renderCustomBistroDraft(pointer = null) {
    clearCustomBistroPreview();
    const tent = customBistroDraft.tent;
    if (!tent || !uiGroup) return;
    const widthFt = Number(tent.getAttr('widthFt')) || 10;
    const heightFt = Number(tent.getAttr('heightFt')) || 10;
    const preview = new Konva.Group({ x: tent.x(), y: tent.y(), rotation: tent.rotation(), listening: false, name: 'customBistroDraft' });
    const gridStyle = { stroke: 'rgba(241,199,91,.26)', strokeWidth: 1, dash: [3, 4], listening: false };
    for (let x = 0; x <= widthFt + .001; x += 5) preview.add(new Konva.Line({ ...gridStyle, points: [x * FEET_TO_PX, 0, x * FEET_TO_PX, heightFt * FEET_TO_PX] }));
    for (let y = 0; y <= heightFt + .001; y += 5) preview.add(new Konva.Line({ ...gridStyle, points: [0, y * FEET_TO_PX, widthFt * FEET_TO_PX, y * FEET_TO_PX] }));
    if (Math.abs(widthFt - 15) < .01) preview.add(new Konva.Line({ ...gridStyle, stroke: 'rgba(241,199,91,.5)', dash: [5, 3], points: [7.5 * FEET_TO_PX, 0, 7.5 * FEET_TO_PX, heightFt * FEET_TO_PX] }));
    if (Math.abs(heightFt - 15) < .01) preview.add(new Konva.Line({ ...gridStyle, stroke: 'rgba(241,199,91,.5)', dash: [5, 3], points: [0, 7.5 * FEET_TO_PX, widthFt * FEET_TO_PX, 7.5 * FEET_TO_PX] }));
    const points = customBistroDraft.points;
    const draftPoints = points.map((point) => [point.x * FEET_TO_PX, point.y * FEET_TO_PX]).flat();
    if (pointer && points.length) {
      const local = tentLocalPoint(tent, pointer);
      if (tentPointIsInside(tent, local)) {
        const snapped = snapCustomBistroPoint(tent, local);
        draftPoints.push(snapped.x * FEET_TO_PX, snapped.y * FEET_TO_PX);
      }
    }
    if (draftPoints.length >= 4) preview.add(new Konva.Line({ points: draftPoints, stroke: '#f1c75b', strokeWidth: 2, dash: [7, 5], opacity: .9, listening: false }));
    points.forEach((point, index) => preview.add(new Konva.Circle({ x: point.x * FEET_TO_PX, y: point.y * FEET_TO_PX, radius: Math.max(3, FEET_TO_PX * .14), fill: index === 0 ? '#f1c75b' : '#fff1b8', stroke: '#8c6a16', strokeWidth: 1, listening: false })));
    uiGroup.add(preview); customBistroDraft.preview = preview; preview.moveToTop(); worldLayer.batchDraw();
  }

  function finishCustomBistroString() {
    const points = customBistroDraft.points;
    if (points.length >= 2 && customBistroDraft.tent) {
      let node = customBistroDraft.node;
      if (!node || node.getAttr('parentTentNodeId') !== ensureNodeId(customBistroDraft.tent, 'venue')) {
        const target = resolvePlacementLayer('decor');
        const group = target && getLayerGroup(target.id);
        if (target && group) {
          node = createTentAddonNode({ ...(customBistroDraft.rawData || {}), addonType: 'customBistro' }, customBistroDraft.tent, customBistroDraft.tent.position());
          setNodeLayerId(node, target.id); group.add(node); customBistroDraft.node = node;
        }
      }
      if (node) {
        const attachment = cloneConfig(node.getAttr('attachment')) || { kind: 'customBistro', strings: [] };
        attachment.kind = 'customBistro'; attachment.strings = Array.isArray(attachment.strings) ? attachment.strings : [];
        const savedPoints = points.map((point) => ({ x: point.x, y: point.y }));
        if (Number.isInteger(customBistroDraft.replaceStringIndex)) attachment.strings[customBistroDraft.replaceStringIndex] = savedPoints;
        else attachment.strings.push(savedPoints);
        node.setAttr('attachment', attachment); renderTentAddonGeometry(node, customBistroDraft.tent); setDirty(true); refreshInventoryPanelUI(); renderLayersPanel();
      }
    }
    customBistroDraft.points = [];
    renderCustomBistroDraft();
  }

  function resetCustomBistroDraft() {
    clearCustomBistroPreview();
    customBistroDraft = { tent: null, node: null, points: [], rawData: null, preview: null, replaceStringIndex: null };
  }

  function customBistroEndpointAt(worldPoint, toleranceFt = 0.8) {
    let match = null;
    forEachNode((node) => {
      if (match || !(node && node.getAttr && node.getAttr('customType') === 'tentAddon' && node.getAttr('addonType') === 'customBistro')) return;
      const tent = getNodeById(node.getAttr('parentTentNodeId') || '');
      const strings = node.getAttr('attachment') && node.getAttr('attachment').strings;
      if (!tent || !Array.isArray(strings)) return;
      const local = tentLocalPoint(tent, worldPoint);
      strings.forEach((points, stringIndex) => {
        if (match || !Array.isArray(points) || !points.length) return;
        [0, points.length - 1].forEach((pointIndex) => {
          const point = points[pointIndex];
          if (!match && point && Math.hypot(local.x - point.x, local.y - point.y) <= toleranceFt) match = { node, tent, point: { x: point.x, y: point.y }, stringIndex, pointIndex };
        });
      });
    });
    return match;
  }

  function selectCustomBistroString(node, worldPoint) {
    if (!(node && node.getAttr && node.getAttr('addonType') === 'customBistro')) return false;
    const tent = getNodeById(node.getAttr('parentTentNodeId') || '');
    const attachment = cloneConfig(node.getAttr('attachment')) || {};
    const strings = Array.isArray(attachment.strings) ? attachment.strings : [];
    if (!tent || !strings.length) return false;
    const local = tentLocalPoint(tent, worldPoint);
    let best = null;
    strings.forEach((points, stringIndex) => {
      if (!Array.isArray(points) || points.length < 2) return;
      for (let index = 0; index < points.length - 1; index += 1) {
        const a = points[index], b = points[index + 1];
        const dx = b.x - a.x, dy = b.y - a.y, lengthSq = dx * dx + dy * dy;
        const t = lengthSq ? Math.max(0, Math.min(1, ((local.x - a.x) * dx + (local.y - a.y) * dy) / lengthSq)) : 0;
        const distance = Math.hypot(local.x - (a.x + dx * t), local.y - (a.y + dy * t));
        if (!best || distance < best.distance) best = { stringIndex, distance };
      }
    });
    if (!best || best.distance > 1) return false;
    selectedCustomBistroString = { node, tent, stringIndex: best.stringIndex };
    if (customBistroStringHighlight) customBistroStringHighlight.destroy();
    const points = strings[best.stringIndex].flatMap((point) => [point.x * FEET_TO_PX, point.y * FEET_TO_PX]);
    customBistroStringHighlight = new Konva.Line({ x: tent.x(), y: tent.y(), rotation: tent.rotation(), points, stroke: '#0d6efd', strokeWidth: 5, dash: [5, 3], listening: false, name: 'customBistroStringHighlight' });
    uiGroup.add(customBistroStringHighlight); customBistroStringHighlight.moveToTop(); worldLayer.batchDraw();
    return true;
  }

  function continueCustomBistroAtPoint(node, worldPoint) {
    if (!(node && node.getAttr && node.getAttr('addonType') === 'customBistro')) return false;
    const tent = getNodeById(node.getAttr('parentTentNodeId') || '');
    const attachment = cloneConfig(node.getAttr('attachment')) || {};
    const strings = Array.isArray(attachment.strings) ? attachment.strings : [];
    if (!tent || !strings.length) return false;
    const local = tentLocalPoint(tent, worldPoint);
    let best = null;
    strings.forEach((points, stringIndex) => {
      if (!Array.isArray(points) || points.length < 2) return;
      for (let index = 0; index < points.length - 1; index += 1) {
        const a = points[index], b = points[index + 1];
        const dx = b.x - a.x, dy = b.y - a.y, lengthSq = dx * dx + dy * dy;
        const t = lengthSq ? Math.max(0, Math.min(1, ((local.x - a.x) * dx + (local.y - a.y) * dy) / lengthSq)) : 0;
        const point = { x: a.x + dx * t, y: a.y + dy * t };
        const distance = Math.hypot(local.x - point.x, local.y - point.y);
        if (!best || distance < best.distance) best = { stringIndex, index, t, point, distance };
      }
    });
    if (!best || best.distance > 1) return false;

    // A double-click in the middle of a segment creates a real connection
    // point there. A corner simply becomes the start of the next branch.
    const atCorner = best.t < .06 || best.t > .94;
    const source = strings[best.stringIndex];
    const point = atCorner
      ? { ...(best.t < .5 ? source[best.index] : source[best.index + 1]) }
      : best.point;
    if (!atCorner) {
      const first = [...source.slice(0, best.index + 1), point];
      const second = [point, ...source.slice(best.index + 1)];
      strings.splice(best.stringIndex, 1, first, second);
      attachment.kind = 'customBistro'; attachment.strings = strings;
      node.setAttr('attachment', attachment);
      renderTentAddonGeometry(node, tent);
      setDirty(true); refreshInventoryPanelUI(); renderLayersPanel();
    }
    clearPlacementState();
    placementPayload = { kind: 'tentAddon', addonType: 'customBistro', rawData: { addonType: 'customBistro', inventoryName: node.getAttr('inventoryName') || 'Custom Bistro Lights', color: node.getAttr('addonColor') } };
    activePlacementButton = null;
    activeTool = 'place';
    worldGroup.draggable(false);
    customBistroDraft = { tent, node, points: [point], rawData: null, preview: null, replaceStringIndex: null };
    syncToolStateUI();
    renderCustomBistroDraft(worldPoint);
    showPlannerToast(atCorner
      ? 'Continuing custom bistro run from this corner. Click to add points; double-click or Escape saves the new branch.'
      : 'Custom bistro run split at this point. Click to add a branch; double-click or Escape saves it.');
    return true;
  }

  function handleCustomBistroPoint(worldPoint, clickDetail = 1, undoLastPoint = false) {
    if (!isCustomBistroPlacement() || !worldPoint) return false;
    if (undoLastPoint) return undoCustomBistroPoint();
    if (clickDetail > 1) {
      if (customBistroDraft.points.length) { finishCustomBistroString(); return true; }
      return false;
    }
    const activeTent = customBistroDraft.tent;
    if (activeTent && customBistroDraft.points.length) {
      const local = tentLocalPoint(activeTent, worldPoint);
      if (!tentPointIsInside(activeTent, local)) { finishCustomBistroString(); return true; }
      const point = snapCustomBistroPoint(activeTent, local);
      const previous = customBistroDraft.points[customBistroDraft.points.length - 1];
      if (!previous || Math.hypot(previous.x - point.x, previous.y - point.y) > .01) customBistroDraft.points.push(point);
      renderCustomBistroDraft(worldPoint); return true;
    }
    const endpoint = customBistroEndpointAt(worldPoint);
    if (endpoint) {
      customBistroDraft.tent = endpoint.tent; customBistroDraft.node = endpoint.node; customBistroDraft.rawData = null;
      customBistroDraft.points = [endpoint.point]; renderCustomBistroDraft(worldPoint); return true;
    }
    const tent = closestTentAtEdge(worldPoint, 1);
    if (!tent) return false;
    if (activeTent !== tent) customBistroDraft.node = null;
    customBistroDraft.tent = tent;
    customBistroDraft.rawData = placementPayload.rawData || {};
    customBistroDraft.points = [projectPointToTentEdge(tent, tentLocalPoint(tent, worldPoint))];
    renderCustomBistroDraft(worldPoint); return true;
  }

  function undoCustomBistroPoint() {
    if (!isCustomBistroPlacement() || !customBistroDraft.points.length) return false;
    customBistroDraft.points.pop();
    renderCustomBistroDraft();
    return true;
  }

  function renderTentAddonGeometry(node, tent) {
    if (!node || !tent) return;
    node.position(tent.position()); node.rotation(tent.rotation());
    node.destroyChildren();
    const widthFt = Number(tent.getAttr('widthFt')) || 10;
    const heightFt = Number(tent.getAttr('heightFt')) || 10;
    const attachment = cloneConfig(node.getAttr('attachment')) || {};
    const color = node.getAttr('addonColor') || '#98b7d7';
    const addonType = node.getAttr('addonType');
    if (addonType === 'sidewall') {
      (attachment.segments || []).forEach((segment) => {
        drawTentSidewallSegment(Konva, node, segment, widthFt, heightFt, color, FEET_TO_PX);
      });
    } else if (addonType === 'legDrape') {
      drawTentLegDrape(Konva, node, widthFt, heightFt, Number(attachment.legIndex) || 0, FEET_TO_PX);
    } else if (addonType === 'fireExtinguisher') {
      const point = attachment.point || { x: widthFt / 2, y: heightFt / 2 };
      const radius = .5 * FEET_TO_PX;
      node.add(new Konva.Circle({ x: point.x * FEET_TO_PX, y: point.y * FEET_TO_PX, radius, fill: '#c62828', stroke: '#7f1d1d', strokeWidth: 1.25, name: 'tentFireExtinguisher' }));
      node.add(new Konva.Line({ points: [point.x * FEET_TO_PX - radius * .28, point.y * FEET_TO_PX, point.x * FEET_TO_PX + radius * .28, point.y * FEET_TO_PX], stroke: '#fff', strokeWidth: 1.25, listening: false }));
    } else if (addonType === 'exitSign' || addonType === 'noSmokingSign') {
      const edge = Number(attachment.edge) || 0; const center = Number(attachment.center) || 1; const lengthFt = Number(attachment.signLengthFt) || 2;
      const depthPx = FEET_TO_PX; const lengthPx = lengthFt * FEET_TO_PX;
      let x; let y; let rotation = 0;
      if (edge === 0) { x = center * FEET_TO_PX; y = 0; rotation = 0; }
      else if (edge === 1) { x = widthFt * FEET_TO_PX; y = center * FEET_TO_PX; rotation = 90; }
      else if (edge === 2) { x = center * FEET_TO_PX; y = heightFt * FEET_TO_PX; rotation = 180; }
      else { x = 0; y = center * FEET_TO_PX; rotation = -90; }
      const sign = new Konva.Group({ x, y, rotation, name: 'tentSafetySign' });
      sign.add(new Konva.Rect({ x: -lengthPx / 2, y: 0, width: lengthPx, height: depthPx, fill: addonType === 'exitSign' ? '#198754' : '#fff', stroke: addonType === 'exitSign' ? '#0f5132' : '#dc3545', strokeWidth: 1.25 }));
      if (addonType === 'exitSign') sign.add(new Konva.Text({ x: -lengthPx / 2, y: depthPx * .2, width: lengthPx, text: 'EXIT', align: 'center', fontSize: Math.max(8, depthPx * .55), fontStyle: 'bold', fill: '#fff', listening: false }));
      else { sign.add(new Konva.Circle({ x: 0, y: depthPx / 2, radius: depthPx * .33, stroke: '#dc3545', strokeWidth: 2, listening: false })); sign.add(new Konva.Line({ points: [-depthPx * .25, depthPx * .75, depthPx * .25, depthPx * .25], stroke: '#dc3545', strokeWidth: 2, listening: false })); }
      node.add(sign);
    } else if (addonType === 'fan') {
      const point = attachment.point || { x: widthFt / 2, y: heightFt / 2 };
      const fanWidthFt = Number(node.getAttr('widthFt')) || 1;
      const fanLengthFt = Number(node.getAttr('lengthFt')) || 2;
      const fanLengthPx = fanLengthFt * FEET_TO_PX;
      const fanWidthPx = fanWidthFt * FEET_TO_PX;
      const fan = new Konva.Group({ x: point.x * FEET_TO_PX, y: point.y * FEET_TO_PX, rotation: Number(attachment.rotationDeg) || 0, name: 'tentFan' });
      fan.add(new Konva.Rect({ x: -fanLengthPx / 2, y: -fanWidthPx / 2, width: fanLengthPx, height: fanWidthPx, fill: color, stroke: '#3f5360', strokeWidth: 1.25, cornerRadius: 2 }));
      for (let index = 1; index <= 4; index += 1) {
        const x = -fanLengthPx / 2 + fanLengthPx * index / 5;
        fan.add(new Konva.Line({ points: [x, -fanWidthPx / 2 + 2, x, fanWidthPx / 2 - 2], stroke: '#dbe4e8', strokeWidth: 1, opacity: 0.9, listening: false }));
      }
      node.add(fan);
    } else if (addonType === 'bistro') {
      const points = bistroZigZagPointsFt(widthFt, heightFt);
      for (let index = 0; index < points.length - 1; index += 1) drawTentLightRun(Konva, node, points[index], points[index + 1], color, FEET_TO_PX);
    } else if (addonType === 'customBistro') {
      const strings = Array.isArray(attachment.strings) ? attachment.strings : [];
      strings.forEach((stringPoints) => {
        const points = Array.isArray(stringPoints) ? stringPoints : [];
        for (let index = 0; index < points.length - 1; index += 1) drawTentLightRun(Konva, node, points[index], points[index + 1], color, FEET_TO_PX);
      });
    } else if (addonType === 'perimeterLight') {
      const corners = [{ x: 0, y: 0 }, { x: widthFt, y: 0 }, { x: widthFt, y: heightFt }, { x: 0, y: heightFt }];
      corners.forEach((corner, index) => drawTentLightRun(Konva, node, corner, corners[(index + 1) % corners.length], color, FEET_TO_PX));
    } else if (addonType === 'chandelier') {
      const points = attachment.point ? [attachment.point] : chandelierPositionsFt(widthFt, heightFt);
      points.forEach((point) => {
        const x = point.x * FEET_TO_PX; const y = point.y * FEET_TO_PX; const radius = 0.75 * FEET_TO_PX;
        node.add(new Konva.Circle({ x, y, radius, fill: 'rgba(241,199,91,.25)', stroke: color, strokeWidth: 1.5, name: 'tentChandelier' }));
        node.add(new Konva.Line({ points: [x - radius * 0.65, y, x + radius * 0.65, y, x, y - radius * 0.65, x, y + radius * 0.65], stroke: color, strokeWidth: 1, listening: false }));
        node.add(new Konva.Circle({ x, y, radius: Math.max(2, radius * 0.18), fill: color, listening: false }));
      });
    } else {
      const point = attachment.point || { x: 0, y: 0 };
      const footprint = normaliseWeightFootprint({ weightFootprint: node.getAttr('weightFootprint'), diameterFt: node.getAttr('diameterFt'), widthFt: node.getAttr('widthFt'), lengthFt: node.getAttr('lengthFt') });
      if (footprint.shape === 'rect') {
        const lengthPx = footprint.lengthFt * FEET_TO_PX;
        const widthPx = footprint.widthFt * FEET_TO_PX;
        node.add(new Konva.Rect({ x: point.x * FEET_TO_PX, y: point.y * FEET_TO_PX, width: lengthPx, height: widthPx, offsetX: lengthPx / 2, offsetY: widthPx / 2, rotation: Number(attachment.rotationDeg) || 0, fill: color, stroke: '#495057', strokeWidth: 1, name: 'tentWeight' }));
      } else {
        node.add(new Konva.Circle({ x: point.x * FEET_TO_PX, y: point.y * FEET_TO_PX, radius: footprint.diameterFt * FEET_TO_PX / 2, fill: color, stroke: '#495057', strokeWidth: 1, name: 'tentWeight' }));
      }
    }
    // The visible segment/circle is the hit target. Do not add a full-tent hit
    // surface here, or an attached add-on would block selecting the tent body.
  }

  function fanAttachmentForPlacement(tent, worldPoint, fanWidthFt, fanLengthFt, freePlacement = false) {
    const tentWidthFt = Number(tent.getAttr('widthFt')) || 10;
    const tentHeightFt = Number(tent.getAttr('heightFt')) || 10;
    const local = tentLocalPoint(tent, worldPoint);
    if (freePlacement) return fanAttachmentAtPerimeter(tentWidthFt, tentHeightFt, local, fanWidthFt);
    const nearest = nearestTentLegIndex(tentWidthFt, tentHeightFt, local);
    return fanAttachmentAtLeg(tentWidthFt, tentHeightFt, nearest.index, fanWidthFt, fanLengthFt);
  }

  function createTentAddonNode(data, tent, worldPoint, options = {}) {
    const addonType = data.addonType || 'sidewall';
    const addonLengthFt = Number(data.lengthFt) || Number(data.length) || 10;
    const local = tentLocalPoint(tent, worldPoint);
    const freePlacement = options.freePlacement === true;
    const weightFootprint = addonType === 'weight' ? normaliseWeightFootprint(data) : null;
    // Hanging fans are drawn at 80% of the catalog footprint so they do not
    // overpower the tent plan; the stored inventory dimensions remain intact.
    const fanWidthFt = addonType === 'fan' ? (Number(data.widthFt) || Number(data.width) || 1) * .8 : undefined;
    const fanLengthFt = addonType === 'fan' ? (Number(data.lengthFt) || Number(data.length) || 2) * .8 : undefined;
    const node = new Konva.Group({ x: tent.x(), y: tent.y(), rotation: tent.rotation(), draggable: true, name: 'tentAddon' });
    const fixedLayout = ['bistro', 'customBistro', 'perimeterLight'].includes(addonType);
    node.draggable(!fixedLayout);
    node.setAttrs({ customType: 'tentAddon', itemType: data.type || 'item', addonType, addonColor: data.color || '#98b7d7', inventoryName: data.inventoryName || '', inventoryCategory: data.category || '', familyId: data.familyId || '', selectable: true, parentTentNodeId: ensureNodeId(tent, 'venue'), tentAddonFixed: fixedLayout, diameterFt: weightFootprint && weightFootprint.shape === 'circle' ? weightFootprint.diameterFt : undefined, widthFt: weightFootprint && weightFootprint.shape === 'rect' ? weightFootprint.widthFt : fanWidthFt, lengthFt: weightFootprint && weightFootprint.shape === 'rect' ? weightFootprint.lengthFt : fanLengthFt, weightFootprint });
    if (addonType === 'sidewall') {
      const tentWidthFt = Number(tent.getAttr('widthFt')) || 10;
      const tentHeightFt = Number(tent.getAttr('heightFt')) || 10;
      const placementPoint = sidewallPlacementPoint(tentWidthFt, tentHeightFt, local, !freePlacement);
      node.setAttr('attachment', { kind: 'sidewall', segments: tentAddonSegments(tentWidthFt, tentHeightFt, placementPoint, addonLengthFt), lengthFt: addonLengthFt });
    }
    else {
      const tentWidthFt = Number(tent.getAttr('widthFt')) || 10;
      const tentHeightFt = Number(tent.getAttr('heightFt')) || 10;
      const nearest = nearestTentLegIndex(tentWidthFt, tentHeightFt, local);
      if (addonType === 'weight') node.setAttr('attachment', weightAttachmentAtLeg(tentWidthFt, tentHeightFt, nearest.index, local, weightFootprint));
      else if (addonType === 'fan') node.setAttr('attachment', fanAttachmentForPlacement(tent, worldPoint, fanWidthFt, fanLengthFt, freePlacement));
      else if (addonType === 'legDrape') node.setAttr('attachment', legDrapeAttachmentAtLeg(tentWidthFt, tentHeightFt, nearest.index));
      else if (addonType === 'fireExtinguisher') node.setAttr('attachment', fireExtinguisherAttachmentAtLeg(tentWidthFt, tentHeightFt, nearest.index));
      else if (addonType === 'exitSign' || addonType === 'noSmokingSign') node.setAttr('attachment', perimeterSignAttachment(Number(tent.getAttr('widthFt')) || 10, Number(tent.getAttr('heightFt')) || 10, local, Number(data.lengthFt) || Number(data.length) || 2));
      else if (addonType === 'chandelier' && freePlacement) node.setAttr('attachment', { kind: 'chandelier', point: { x: Math.max(0, Math.min(tentWidthFt, local.x)), y: Math.max(0, Math.min(tentHeightFt, local.y)) } });
      else node.setAttr('attachment', addonType === 'customBistro' ? { kind: 'customBistro', strings: [] } : { kind: addonType });
    }
    ensureNodeId(node, 'tent-addon'); renderTentAddonGeometry(node, tent); attachShapeEvents(node); return node;
  }

  function syncTentAddonsForTent(tent) {
    const tentId = tent && tent.getAttr ? tent.getAttr('nodeId') : '';
    if (!tentId) return;
    forEachNode((node) => { if (node && node.getAttr && node.getAttr('customType') === 'tentAddon' && node.getAttr('parentTentNodeId') === tentId) renderTentAddonGeometry(node, tent); });
  }

  function addTentAddonOnTent(tent, worldPoint, data = placementPayload && placementPayload.rawData, options = {}) {
    if (!tent || !data) return null;
    const target = resolvePlacementLayer(isHangingDecorAddon(data.addonType) ? 'decor' : 'item');
    const group = target && getLayerGroup(target.id);
    if (!group) return null;
    const node = createTentAddonNode(data, tent, worldPoint, options);
    setNodeLayerId(node, target.id); group.add(node);
    return node;
  }

  function placeTentAddonOnTent(tent, worldPoint, options = {}) {
    if (!tent || tent.getAttr('venueType') !== 'tent') return false;
    const freePlacement = options.freePlacement === true;
    if (placementPayload && ['fan', 'legDrape', 'fireExtinguisher'].includes(placementPayload.addonType) && !freePlacement) {
      const nearest = nearestTentLegIndex(Number(tent.getAttr('widthFt')) || 10, Number(tent.getAttr('heightFt')) || 10, tentLocalPoint(tent, worldPoint));
      if (nearest.distance > 3) return false;
    }
    const node = addTentAddonOnTent(tent, worldPoint, undefined, { freePlacement });
    if (!node) return false;
    // Keep the same inventory tool armed after every single-click add-on.
    // Multi-step tools (custom bistro, fences, pipe drape) continue to manage
    // their own completion state.
    ensureLayerOrder(); setDirty(true); updatePlacementPreview(); worldLayer.draw(); return true;
  }

  function placeFreeWeightAt(worldPoint) {
    const data = placementPayload && placementPayload.rawData;
    const target = resolvePlacementLayer('item');
    const group = target && getLayerGroup(target.id);
    if (!data || !target || !group || !worldPoint) return false;
    const node = createItem({ ...data, x: worldPoint.x, y: worldPoint.y, rotation: placementRotation });
    if (!node) return false;
    setNodeLayerId(node, target.id); group.add(node);
    ensureLayerOrder(); setDirty(true); refreshInventoryPanelUI(); renderLayersPanel(); worldLayer.draw(); updatePlacementPreview();
    return true;
  }

  function closestTentForAddonPlacement(worldPoint, toleranceFt = 3) {
    let closest = null;
    let closestDistance = Infinity;
    forEachNode((node) => {
      if (!node || !node.getAttr || node.getAttr('customType') !== 'venue' || node.getAttr('venueType') !== 'tent' || !isSelectableNode(node)) return;
      const local = tentLocalPoint(node, worldPoint);
      const widthFt = Number(node.getAttr('widthFt')) || 10;
      const heightFt = Number(node.getAttr('heightFt')) || 10;
      const distance = Math.min(Math.abs(local.y), Math.abs(local.y - heightFt), Math.abs(local.x), Math.abs(local.x - widthFt));
      const inside = local.x >= -toleranceFt && local.x <= widthFt + toleranceFt && local.y >= -toleranceFt && local.y <= heightFt + toleranceFt;
      const fullTentTarget = placementPayload && ['weight', 'fan', 'bistro', 'customBistro', 'perimeterLight', 'chandelier'].includes(placementPayload.addonType);
      if (inside && (fullTentTarget || distance <= toleranceFt) && distance < closestDistance) { closest = node; closestDistance = distance; }
    });
    return closest;
  }

  function addLabelToCanvas(options = {}) {
    const attached = !!options.attachedToNodeId;
    const layer = attached ? getLabelLayer() : (resolvePlacementLayer('label') || getLabelLayer());
    const targetGroup = layer ? getLayerGroup(layer.id) : null;
    if (!layer || !targetGroup || !layer.visible || layer.locked) {
      window.alert('No visible unlocked labels layer is available.');
      return null;
    }
    const text = String(options.text || '').trim();
    if (!text) return null;
    const node = createLabelNode(options);
    setNodeLayerId(node, layer.id);
    targetGroup.add(node);
    updateToolButtons();
    return node;
  }

  function addAttachedLabelForNode(targetNode, text, options = {}) {
    if (!targetNode || !text) return null;
    const targetNodeId = ensureNodeId(targetNode, 'node');
    const center = getNodeCenter(targetNode);
    const rotation = targetNode.rotation ? targetNode.rotation() : 0;
    const labelNode = addLabelToCanvas({
      text,
      x: center.x,
      y: center.y,
      rotation,
      attachedToNodeId: targetNodeId,
      autoGenerated: !!options.autoGenerated,
      labelKind: options.labelKind || '',
      attachmentOffset: options.attachmentOffset || { x: 0, y: 0 },
    });
    if (!labelNode) return null;
    refreshLabelVisibility();
    renderLayersPanel();
    worldLayer.draw();
    setDirty(true);
    return labelNode;
  }

  function expectedAutomaticLabelMetaForNode(node, text) {
    const definition = findInventoryDefinitionForNode(node);
    if (!definition || String(definition.labelText || '').trim() !== String(text || '').trim()) return null;
    return automaticLabelMeta(definition.name, text);
  }

  function repairLegacyAttachedLabels() {
    const labels = [];
    const candidates = [];
    forEachNode((node) => {
      if (!node || !node.getAttr) return;
      if (node.getAttr('customType') === 'label') labels.push(node);
      else if (node.getAttr('customType') === 'item') candidates.push(node);
    });
    labels.forEach((label) => {
      const text = label.getAttr('labelText') || '';
      const existingParent = label.getAttr('attachedToNodeId') ? getNodeById(label.getAttr('attachedToNodeId')) : null;
      if (existingParent) {
        const meta = expectedAutomaticLabelMetaForNode(existingParent, text);
        if (meta) label.setAttrs({ ...meta, labelMode: 'attached' });
        const definition = findInventoryDefinitionForNode(existingParent);
        if (label.getAttr('autoGenerated') && definition && !String(definition.labelText || '').trim()) {
          label.destroy();
          return;
        }
        if (label.getAttr('autoGenerated') && definition && definition.labelText && String(definition.labelText).trim() !== String(text).trim()) {
          const correctedText = String(definition.labelText).trim();
          label.setAttr('labelText', correctedText);
          const textNode = label.findOne && label.findOne('.labelText');
          if (textNode) textNode.text(correctedText);
          updateLabelNodeLayout(label);
          label.setAttrs({ ...automaticLabelMeta(definition.name, correctedText), labelMode: 'attached' });
        }
        return;
      }
      // Repair only a clear legacy automatic label: exact catalog text and a
      // single matching inventory item whose centre is close to the label.
      const nearby = candidates.filter((item) => {
        const meta = expectedAutomaticLabelMetaForNode(item, text);
        if (!meta) return false;
        const center = getNodeCenter(item);
        const distance = Math.hypot(label.x() - center.x, label.y() - center.y);
        const rect = item.getClientRect ? item.getClientRect({ relativeTo: worldGroup }) : { width: 0, height: 0 };
        return distance <= Math.max(30, Math.max(rect.width || 0, rect.height || 0) * 0.8);
      });
      if (nearby.length !== 1) return;
      const parent = nearby[0];
      const meta = expectedAutomaticLabelMetaForNode(parent, text);
      label.setAttrs({ ...meta, attachedToNodeId: ensureNodeId(parent, 'item'), labelMode: 'attached' });
    });
    candidates.forEach(syncAttachedLabelsForNode);
  }

  function promptAndCreateLabelAt(position, attachedNode = null, defaultText = '') {
    const attached = !!attachedNode;
    requestLabelText(attached ? 'Add item label' : 'Add canvas label', attached ? 'This label follows the selected item or venue. Drag it within the blue boundary to choose its position.' : 'This standalone label stays at this canvas position.', defaultText, (submitted) => {
      const text = String(submitted || '').trim(); if (!text) return;
      const appearance = labelAppearanceFromInputs();
      if (!attached) {
        labelPlacementDraft = { text, appearance };
        renderLabelPlacementPreview(position);
        showPlannerToast('Move to preview the label, then click once to place it. Double-click an existing label to edit it.');
        return;
      }
      const targetNodeId = attachedNode && attachedNode.getAttr ? ensureNodeId(attachedNode, 'node') : null;
      const center = attachedNode ? getNodeCenter(attachedNode) : position;
      const rotation = attachedNode && attachedNode.rotation ? attachedNode.rotation() : 0;
      const labelNode = addLabelToCanvas({ text, x: center.x, y: center.y, rotation, attachedToNodeId: targetNodeId, attachmentOffset: { x: 0, y: 0 }, ...appearance });
      if (!labelNode) return;
      ensureLayerOrder(); renderLayersPanel(); worldLayer.draw(); setDirty(true);
    }, {});
  }

  function editSelectedLabel() {
    const selectedLabel = selectedItems.length === 1 && selectedItems[0].getAttr && selectedItems[0].getAttr('customType') === 'label'
      ? selectedItems[0]
      : null;
    const selectedNode = selectedItems.length === 1 ? selectedItems[0] : null;
    const attachedLabels = selectedNode && selectedNode.getAttr && selectedNode.getAttr('customType') !== 'label'
      ? findAttachedLabels(selectedNode.getAttr('nodeId'))
      : [];
    const attachedLabel = attachedLabels.length === 1 ? attachedLabels[0] : null;
    const gearLabel = labelGearTargetId ? getNodeById(labelGearTargetId) : null;
    const targetLabel = selectedLabel || attachedLabel || gearLabel;
    if (!targetLabel) return;
    const attached = targetLabel.getAttr('labelMode') === 'attached';
    requestLabelText('Edit label', attached ? 'This label stays connected to its item or venue.' : 'This standalone label remains at its canvas position.', targetLabel.getAttr('labelText') || '', (submitted) => {
      const text = String(submitted || '').trim(); if (!text) return;
      targetLabel.setAttr('labelText', text);
      const textNode = targetLabel.findOne('.labelText');
      if (textNode) textNode.text(text);
      applyLabelAppearance(targetLabel, labelAppearanceFromInputs()); if (attached) syncAttachedLabelsForNode(getNodeById(targetLabel.getAttr('attachedToNodeId')));
      showLabelGearForNode(targetLabel); worldLayer.draw(); setDirty(true);
    }, { fontSize: targetLabel.getAttr('fontSize'), labelColor: targetLabel.getAttr('labelColor'), fontStyle: targetLabel.getAttr('fontStyle'), labelBorder: !!targetLabel.getAttr('labelBorder') }, { canCopy: true });
  }

  function setToggleGroupValue(groupEl, value, options = {}) {
    if (!groupEl) return;
    const disabledValue = options.disabledValue || null;
    groupEl.querySelectorAll('[data-value]').forEach((btn) => {
      const isActive = btn.getAttribute('data-value') === value;
      const isDisabled = disabledValue && btn.getAttribute('data-value') === disabledValue;
      btn.classList.toggle('is-active', isActive);
      btn.disabled = !!isDisabled;
    });
  }

  function getToggleGroupValue(groupEl, fallback = '') {
    if (!groupEl) return fallback;
    const activeBtn = groupEl.querySelector('.is-active[data-value]');
    return activeBtn ? activeBtn.getAttribute('data-value') : fallback;
  }

  function hideLabelGear() {
    labelGearTargetId = null;
    if (labelGearBtn) labelGearBtn.style.display = 'none';
  }

  function showLabelGearForNode(labelNode) {
    if (!labelGearBtn || !labelNode || !labelNode.getClientRect || !stageContainer) return;
    try {
      const rect = labelNode.getClientRect({ relativeTo: stage });
      const containerRect = stageContainer.getBoundingClientRect();
      labelGearTargetId = labelNode.getAttr('nodeId');
      labelGearBtn.style.left = `${containerRect.left + rect.x + rect.width + 6}px`;
      labelGearBtn.style.top = `${containerRect.top + rect.y - 6}px`;
      labelGearBtn.style.display = 'block';
    } catch (err) {
      hideLabelGear();
    }
  }

  function createPlacementPreview(payload) {
    if (!payload) return null;
    if (payload.kind === 'pipeDrapeChain') return null;
    if (payload.kind === 'roomAttachment') {
      const width = (Number(payload.widthFt) || 3) * FEET_TO_PX;
      const preview = new Konva.Group({ listening: false, name: 'roomAttachmentPlacementPreview' });
      preview.add(new Konva.Line({ points: [-width / 2, 0, width / 2, 0], stroke: '#fff', strokeWidth: 9, lineCap: 'round' }));
      preview.add(new Konva.Line({ points: [-width / 2, 0, width / 2, 0], stroke: payload.attachmentType === 'door' ? '#198754' : '#f59e0b', strokeWidth: 4, lineCap: 'round' }));
      if (payload.attachmentType === 'door') preview.add(new Konva.Arc({ x: 0, y: 0, innerRadius: width / 2, outerRadius: width / 2, angle: 90, rotation: payload.swing === 'outward' ? -135 : 45, stroke: '#198754', strokeWidth: 2, name: 'roomAttachmentPlacementSwing' }));
      return preview;
    }
    if (payload.kind === 'tentAddon') {
      if (payload.addonType === 'customBistro') return null;
      if (payload.addonType === 'sidewall') return new Konva.Group({ listening: false, name: 'sidewallPlacementPreview' });
      if (payload.addonType === 'weight') {
        const footprint = normaliseWeightFootprint({ weightFootprint: payload.weightFootprint, diameterFt: payload.diameterFt, widthFt: payload.widthFt, lengthFt: payload.lengthFt });
        if (footprint.shape === 'rect') return new Konva.Rect({ width: footprint.lengthFt * FEET_TO_PX, height: footprint.widthFt * FEET_TO_PX, offsetX: footprint.lengthFt * FEET_TO_PX / 2, offsetY: footprint.widthFt * FEET_TO_PX / 2, stroke: '#495057', strokeWidth: 2, dash: [8, 6], fill: 'rgba(73,80,87,.18)', listening: false });
        return new Konva.Circle({ radius: (footprint.diameterFt * FEET_TO_PX) / 2, stroke: '#495057', strokeWidth: 2, dash: [8, 6], fill: 'rgba(73,80,87,.18)', listening: false });
      }
      if (payload.addonType === 'fan') {
        const lengthPx = (payload.lengthFt || 2) * FEET_TO_PX;
        const widthPx = (payload.widthFt || 1) * FEET_TO_PX;
        const color = payload.color || (payload.rawData && payload.rawData.color) || '#98b7d7';
        // Match the placed hanging-fan geometry exactly; only opacity changes
        // while the item is still attached to the cursor.
        const preview = new Konva.Group({ opacity: .42, listening: false, name: 'fanPlacementPreview' });
        preview.add(new Konva.Rect({ x: -lengthPx / 2, y: -widthPx / 2, width: lengthPx, height: widthPx, fill: color, stroke: '#3f5360', strokeWidth: 1.25, cornerRadius: 2, listening: false }));
        for (let index = 1; index <= 4; index += 1) {
          const x = -lengthPx / 2 + lengthPx * index / 5;
          preview.add(new Konva.Line({ points: [x, -widthPx / 2 + 2, x, widthPx / 2 - 2], stroke: '#dbe4e8', strokeWidth: 1, opacity: .9, listening: false }));
        }
        return preview;
      }
      if (payload.addonType === 'fireExtinguisher') return new Konva.Circle({ radius: .5 * FEET_TO_PX, fill: 'rgba(198,40,40,.42)', stroke: '#7f1d1d', strokeWidth: 1.25, listening: false, name: 'fireExtinguisherPlacementPreview' });
      if (payload.addonType === 'exitSign' || payload.addonType === 'noSmokingSign') return new Konva.Group({ opacity: .46, listening: false, name: 'tentSafetySignPlacementPreview' });
      if (['bistro', 'perimeterLight', 'chandelier'].includes(payload.addonType)) return new Konva.Circle({ radius: FEET_TO_PX * 0.8, stroke: '#f1c75b', strokeWidth: 2, dash: [5, 4], fill: 'rgba(241,199,91,.2)', listening: false });
      return new Konva.Rect({ width: (payload.lengthFt || 10) * FEET_TO_PX, height: 0.25 * FEET_TO_PX, offsetY: 0.125 * FEET_TO_PX, stroke: '#495057', strokeWidth: 2, dash: [8, 6], fill: 'rgba(73,80,87,.18)', listening: false });
    }
    if (payload.kind === 'stageAddon') {
      const width = payload.addonType === 'Adjustable Stairs' ? 4 : payload.addonType === 'Stage Railing 2ft' ? 2 : payload.addonType === 'Stage Railing 4ft' ? 4 : 2;
      const depth = payload.addonType === 'Adjustable Stairs' ? 5 : payload.addonType === 'Basic Step' ? 2 : .35;
      const preview = new Konva.Group({ listening: false, name: 'stageAddonPlacementPreview' });
      preview.add(new Konva.Rect({ width: width * FEET_TO_PX, height: depth * FEET_TO_PX, offsetX: width * FEET_TO_PX / 2, offsetY: depth * FEET_TO_PX / 2, stroke: '#1b1f23', strokeWidth: 2, dash: [6, 4], fill: 'rgba(201,139,60,.2)', listening: false }));
      const stepCount = payload.addonType === 'Adjustable Stairs' ? 4 : payload.addonType === 'Basic Step' ? 2 : 0;
      for (let step = 1; step < stepCount; step += 1) {
        const y = (-depth / 2 + depth * step / stepCount) * FEET_TO_PX;
        preview.add(new Konva.Line({ points: [-width * FEET_TO_PX / 2, y, width * FEET_TO_PX / 2, y], stroke: '#1b1f23', strokeWidth: 1.25, dash: [4, 3], listening: false }));
      }
      return preview;
    }
    if (payload.kind === 'venue' || payload.kind === 'tentSetup') {
      if (payload.kind === 'venue' && payload.type === 'custom' && Array.isArray(payload.polygon)) {
        return new Konva.Line({ points: payload.polygon.flatMap((point) => [(Number(point.x) || 0) * FEET_TO_PX, (Number(point.y) || 0) * FEET_TO_PX]), closed: true, stroke: '#0d6efd', strokeWidth: 2, dash: [8, 6], fill: 'rgba(13,110,253,.12)', listening: false });
      }
      const widthPx = (payload.widthFt || 10) * FEET_TO_PX;
      const heightPx = (payload.heightFt || 10) * FEET_TO_PX;
      const preview = new Konva.Rect({
        width: widthPx,
        height: heightPx,
        stroke: '#0d6efd',
        strokeWidth: 2,
        dash: [8, 6],
        fill: 'rgba(13, 110, 253, 0.12)',
        listening: false,
      });
      return preview;
    }

    if (payload.kind === 'floor') {
      const widthPx = (payload.widthFt || 10) * FEET_TO_PX;
      const lengthPx = (payload.lengthFt || 10) * FEET_TO_PX;
      return new Konva.Rect({
        width: widthPx,
        height: lengthPx,
        stroke: '#198754',
        strokeWidth: 2,
        dash: [8, 6],
        fill: 'rgba(25, 135, 84, 0.15)',
        listening: false,
      });
    }

    if (payload.kind === 'item' && payload.footprint && payload.footprint.shape === 'custom_compound') {
      const preview = createItem({
        ...(payload.rawData || {}),
        x: 0,
        y: 0,
        rotation: 0,
        footprint: cloneConfig(payload.footprint),
      });
      if (!preview) return null;
      preview.listening(false);
      preview.draggable(false);
      preview.opacity(.42);
      preview.name('customItemPlacementPreview');
      return preview;
    }

    if (payload.kind === 'item' && payload.footprint && payload.footprint.kind === 'polygon' && Array.isArray(payload.footprint.points)) {
      const pts = payload.footprint.points.flatMap((pt) => [Number(pt.x) || 0, Number(pt.y) || 0]);
      return new Konva.Line({
        points: pts,
        closed: true,
        stroke: '#495057',
        strokeWidth: 2,
        dash: [8, 6],
        fill: 'rgba(73, 80, 87, 0.12)',
        listening: false,
      });
    }

    if (payload.kind === 'item' && payload.footprint && payload.footprint.kind === 'rect') {
      const widthPx = (Number(payload.footprint.length) || payload.lengthFt || 1) * FEET_TO_PX;
      const heightPx = (Number(payload.footprint.width) || payload.widthFt || 1) * FEET_TO_PX;
      return new Konva.Rect({
        width: widthPx,
        height: heightPx,
        stroke: '#495057',
        strokeWidth: 2,
        dash: [8, 6],
        fill: 'rgba(73, 80, 87, 0.12)',
        listening: false,
      });
    }

    if (payload.kind === 'item' && payload.footprint && payload.footprint.kind === 'circle') {
      const diameterFt = Number(payload.footprint.diameter) || payload.diameterFt || Math.max(payload.widthFt || 0, payload.lengthFt || 0) || 4;
      return new Konva.Circle({
        radius: (diameterFt * FEET_TO_PX) / 2,
        stroke: '#495057',
        strokeWidth: 2,
        dash: [8, 6],
        fill: 'rgba(73, 80, 87, 0.12)',
        listening: false,
      });
    }

    if (payload.kind === 'item' && payload.footprint && payload.footprint.shape === 'halfround') {
      const diameterFt = Number(payload.footprint.diameterFt) || payload.diameterFt || 5;
      const depthFt = Number(payload.footprint.depthFt) || diameterFt / 2;
      const diameterPx = diameterFt * FEET_TO_PX;
      const depthPx = depthFt * FEET_TO_PX;
      return new Konva.Shape({
        width: diameterPx,
        height: depthPx,
        stroke: '#495057',
        strokeWidth: 2,
        dash: [8, 6],
        fill: 'rgba(73, 80, 87, 0.12)',
        listening: false,
        sceneFunc: (context, shape) => {
          context.beginPath();
          context.moveTo(0, 0);
          context.arc(diameterPx / 2, 0, diameterPx / 2, Math.PI, 0, false);
          context.lineTo(diameterPx, 0);
          context.closePath();
          context.fillStrokeShape(shape);
        },
      });
    }

    if (payload.kind === 'item' && payload.footprint && payload.footprint.shape === 'accent_chair') {
      const seatRadius = ((Number(payload.footprint.seatDiameterFt) || 2.5) * FEET_TO_PX) / 2;
      const backrestWidth = (Number(payload.footprint.backrestWidthFt) || 2.9) * FEET_TO_PX;
      const backrestDepth = (Number(payload.footprint.backrestDepthFt) || 0.5) * FEET_TO_PX;
      const preview = new Konva.Group({ width: seatRadius * 2, height: seatRadius * 2, listening: false });
      preview.add(new Konva.Circle({ radius: seatRadius, stroke: '#495057', strokeWidth: 2, dash: [8, 6], fill: 'rgba(73, 80, 87, 0.12)', listening: false }));
      preview.add(new Konva.Rect({ x: -backrestWidth / 2, y: -seatRadius - backrestDepth / 2, width: backrestWidth, height: backrestDepth, stroke: '#495057', strokeWidth: 2, dash: [8, 6], fill: 'rgba(73, 80, 87, 0.12)', listening: false }));
      return preview;
    }

    if (payload.kind === 'item' && payload.footprint && payload.footprint.shape === 'panel_with_bases') {
      const panelLengthPx = (Number(payload.footprint.panelLengthFt) || payload.lengthFt || 4) * FEET_TO_PX;
      const panelDepthPx = (Number(payload.footprint.panelDepthFt) || payload.widthFt || 0.25) * FEET_TO_PX;
      const basePx = (Number(payload.footprint.baseWidthFt) || Number(payload.footprint.baseFt) || 1.5) * FEET_TO_PX;
      const baseDepthPx = (Number(payload.footprint.baseDepthFt) || Number(payload.footprint.baseFt) || 1.5) * FEET_TO_PX;
      const baseYPx = (panelDepthPx - baseDepthPx) / 2;
      const preview = new Konva.Group({ width: panelLengthPx, height: Math.max(panelDepthPx, baseDepthPx), listening: false });
      preview.add(new Konva.Rect({ y: baseYPx, width: basePx, height: baseDepthPx, stroke: '#495057', strokeWidth: 2, dash: [8, 6], fill: 'rgba(73, 80, 87, 0.12)', listening: false }));
      preview.add(new Konva.Rect({ x: panelLengthPx - basePx, y: baseYPx, width: basePx, height: baseDepthPx, stroke: '#495057', strokeWidth: 2, dash: [8, 6], fill: 'rgba(73, 80, 87, 0.12)', listening: false }));
      preview.add(new Konva.Rect({ width: panelLengthPx, height: panelDepthPx, stroke: '#495057', strokeWidth: 2, dash: [8, 6], fill: 'rgba(73, 80, 87, 0.12)', listening: false }));
      return preview;
    }

    if (payload.kind === 'item' && payload.footprint && payload.footprint.shape === 'arch') {
      const openingPx = (Number(payload.footprint.openingFt) || 3) * FEET_TO_PX;
      const sidePx = (Number(payload.footprint.sideFt) || 0.5) * FEET_TO_PX;
      const depthPx = (Number(payload.footprint.depthFt) || 0.5) * FEET_TO_PX;
      const beamDepthPx = Math.min(depthPx, (Number(payload.footprint.beamDepthFt) || 0.15) * FEET_TO_PX);
      const totalPx = openingPx + (sidePx * 2);
      return new Konva.Shape({ width: totalPx, height: depthPx, stroke: '#495057', strokeWidth: 2, dash: [8, 6], fill: 'rgba(73, 80, 87, 0.12)', listening: false, sceneFunc: (context, shape) => {
        context.beginPath();
        context.rect(0, 0, sidePx, depthPx);
        context.rect(sidePx, (depthPx - beamDepthPx) / 2, openingPx, beamDepthPx);
        context.rect(totalPx - sidePx, 0, sidePx, depthPx);
        context.fillStrokeShape(shape);
      } });
    }

    if (payload.kind === 'item' && payload.footprint && payload.footprint.shape === 'throne_chair') {
      const baseWidth = (payload.widthFt || 3) * FEET_TO_PX;
      const baseHeight = (payload.lengthFt || 2.5) * FEET_TO_PX;
      const preview = new Konva.Group({ width: baseWidth, height: baseHeight, listening: false });
      preview.add(new Konva.Rect({ width: baseWidth, height: baseHeight, stroke: '#495057', strokeWidth: 2, dash: [8, 6], fill: 'rgba(73, 80, 87, 0.12)', listening: false }));
      return preview;
    }

    if (payload.kind === 'item' && payload.footprint && payload.footprint.shape === 'quarter_annulus') {
      const outerRadiusPx = (Number(payload.footprint.outerRadiusFt) || 5) * FEET_TO_PX;
      const innerRadiusPx = Math.max(0, Math.min(outerRadiusPx, (Number(payload.footprint.innerRadiusFt) || 2.5) * FEET_TO_PX));
      return new Konva.Shape({
        width: outerRadiusPx,
        height: outerRadiusPx,
        stroke: '#495057',
        strokeWidth: 2,
        dash: [8, 6],
        fill: 'rgba(73, 80, 87, 0.12)',
        listening: false,
        sceneFunc: (context, shape) => {
          context.beginPath();
          context.moveTo(outerRadiusPx, 0);
          context.arc(0, 0, outerRadiusPx, 0, Math.PI / 2, false);
          context.lineTo(0, innerRadiusPx);
          context.arc(0, 0, innerRadiusPx, Math.PI / 2, 0, true);
          context.closePath();
          context.fillStrokeShape(shape);
        },
      });
    }

    if (payload.kind === 'item' && payload.footprint && payload.footprint.kind === 'polygon' && Array.isArray(payload.footprint.points)) {
      const pts = payload.footprint.points.flatMap((pt) => [Number(pt.x) || 0, Number(pt.y) || 0]);
      return new Konva.Line({
        points: pts,
        closed: true,
        stroke: '#495057',
        strokeWidth: 2,
        dash: [8, 6],
        fill: 'rgba(73, 80, 87, 0.12)',
        listening: false,
      });
    }

    if (payload.kind === 'item' && payload.footprint && payload.footprint.kind === 'rect') {
      const widthPx = (Number(payload.footprint.length) || payload.lengthFt || 1) * FEET_TO_PX;
      const heightPx = (Number(payload.footprint.width) || payload.widthFt || 1) * FEET_TO_PX;
      return new Konva.Rect({
        width: widthPx,
        height: heightPx,
        stroke: '#495057',
        strokeWidth: 2,
        dash: [8, 6],
        fill: 'rgba(73, 80, 87, 0.12)',
        listening: false,
      });
    }

    if (payload.kind === 'item' && payload.footprint && payload.footprint.kind === 'circle') {
      const diameterFt = Number(payload.footprint.diameter) || payload.diameterFt || Math.max(payload.widthFt || 0, payload.lengthFt || 0) || 4;
      return new Konva.Circle({
        radius: (diameterFt * FEET_TO_PX) / 2,
        stroke: '#495057',
        strokeWidth: 2,
        dash: [8, 6],
        fill: 'rgba(73, 80, 87, 0.12)',
        listening: false,
      });
    }

    if (payload.kind === 'item' && payload.type === 'round') {
      const diameterFt = payload.diameterFt || Math.max(payload.widthFt || 0, payload.lengthFt || 0) || 4;
      return new Konva.Circle({
        radius: (diameterFt * FEET_TO_PX) / 2,
        stroke: '#495057',
        strokeWidth: 2,
        dash: [8, 6],
        fill: 'rgba(73, 80, 87, 0.12)',
        listening: false,
      });
    }

    if (payload.kind === 'groupedSeating') {
      const widthPx = (payload.lengthFt || payload.widthFt || 6) * FEET_TO_PX;
      const heightPx = (payload.widthFt || payload.lengthFt || 6) * FEET_TO_PX;
      return new Konva.Rect({
        width: widthPx,
        height: heightPx,
        stroke: '#fd7e14',
        strokeWidth: 2,
        dash: [8, 6],
        fill: 'rgba(253, 126, 20, 0.12)',
        listening: false,
      });
    }

    if (payload.kind === 'layoutGroup') {
      const widthPx = (payload.widthFt || 6) * FEET_TO_PX;
      const heightPx = (payload.lengthFt || 6) * FEET_TO_PX;
      return new Konva.Rect({ width: widthPx, height: heightPx, stroke: '#0d6efd', strokeWidth: 2, dash: [8, 6], fill: 'rgba(13, 110, 253, 0.12)', listening: false });
    }

    const widthPx = (payload.lengthFt || payload.widthFt || 6) * FEET_TO_PX;
    const heightPx = (payload.widthFt || payload.lengthFt || 6) * FEET_TO_PX;
    return new Konva.Rect({
      width: widthPx,
      height: heightPx,
      stroke: '#495057',
      strokeWidth: 2,
      dash: [8, 6],
      fill: 'rgba(73, 80, 87, 0.12)',
      listening: false,
    });
  }

  function clearPlacementPreview() {
    if (!placementPreview) return;
    placementPreview.destroy();
    placementPreview = null;
    placementPreviewPoint = null;
    placementTouchPreviewReady = false;
    if (worldLayer) worldLayer.batchDraw();
  }

  function usesCursorPlacementPreview() {
    return activeTool === 'place'
      && !!placementPayload
      && !isCustomBistroPlacement()
      && !isPipeDrapePlacement()
      && !isFencePlacement()
      && !isDrawnRunPlacement()
      && !isBulkLegPlacement()
      && placementPayload.kind !== 'chairRowsAisle';
  }

  function isTouchPlacementEvent(event) {
    return String(event && event.type || '').startsWith('touch');
  }

  function usesTouchAddonPreview() {
    return activeTool === 'place'
      && !!placementPayload
      && ['tentAddon', 'stageAddon', 'roomAttachment'].includes(placementPayload.kind)
      && !isCustomBistroPlacement()
      && !isPipeDrapePlacement()
      && !isFencePlacement()
      && !isDrawnRunPlacement()
      && !isBulkLegPlacement();
  }

  function rememberPlacementPreviewPoint(point) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    placementPreviewPoint = { x: point.x, y: point.y };
  }

  function pointIsInsidePlacementPreview(point) {
    if (!placementPreview || !point || !placementPreview.getClientRect || !worldGroup) return false;
    const bounds = placementPreview.getClientRect({ relativeTo: worldGroup });
    return point.x >= bounds.x && point.x <= bounds.x + bounds.width
      && point.y >= bounds.y && point.y <= bounds.y + bounds.height;
  }

  // Mouse previews follow the cursor and one click places them. Touch has no
  // hover, so its first tap positions the preview; a later tap inside it
  // confirms that exact preview location.
  function handleTouchPreviewPlacement(event, point) {
    if (!usesCursorPlacementPreview() || !String(event && event.type || '').startsWith('touch')) return false;
    // Mobile browsers commonly emit a compatibility mousedown after touchstart.
    // It must not be allowed to commit the preview a second time.
    suppressSyntheticPlacementMouseUntil = Date.now() + 850;
    if (!placementTouchPreviewReady || !pointIsInsidePlacementPreview(point)) {
      shiftPressed = !!(event && event.shiftKey);
      rememberPlacementPreviewPoint(point);
      placementTouchPreviewReady = true;
      updatePlacementPreview(point);
      if (event && event.preventDefault) event.preventDefault();
      return true;
    }
    return false;
  }

  function moveTouchAddonPreview(event, point) {
    if (!usesTouchAddonPreview() || !isTouchPlacementEvent(event)) return false;
    suppressSyntheticPlacementMouseUntil = Date.now() + 850;
    // A tap inside an existing ghost is the first half of a double-tap
    // confirmation. Leave its anchor untouched; dragging after the tap still
    // moves the ghost through the touchmove handler below.
    if (!touchAddonPreviewActive || !pointIsInsidePlacementPreview(point)) {
      touchAddonPreviewActive = true;
      rememberPlacementPreviewPoint(point);
      updatePlacementPreview(point);
    }
    if (event && event.preventDefault) event.preventDefault();
    return true;
  }

  function confirmTouchAddonPreview() {
    if (!usesTouchAddonPreview() || !touchAddonPreviewActive || !placementPreviewPoint) return false;
    const point = placementPreviewPoint;
    if (placementPayload.kind === 'tentAddon') {
      const tent = closestTentForAddonPlacement(point, 3);
      if (!tent) return false;
      placeTentAddonOnTent(tent, point, { freePlacement: false });
    } else if (placementPayload.kind === 'stageAddon') {
      const width = placementPayload.addonType === 'Adjustable Stairs' || placementPayload.addonType === 'Stage Railing 4ft' ? 4 : 2;
      const match = closestStageForAddonPlacement(point, width);
      if (!match || !isSelectableNode(match.node)) return false;
      placeStageAddonOnStage(match.node, point);
    } else if (placementPayload.kind === 'roomAttachment') {
      placeRoomWallAttachment(point, placementPayload.attachmentType);
    }
    touchAddonPreviewActive = true;
    updatePlacementPreview(point);
    return true;
  }

  function isSyntheticPlacementMouseEvent(event) {
    return usesCursorPlacementPreview()
      && String(event && event.type || '') === 'mousedown'
      && Date.now() < suppressSyntheticPlacementMouseUntil;
  }

  function updatePlacementPreview(pointerOverride = null) {
    const previewPointer = pointerOverride || (worldGroup && worldGroup.getRelativePointerPosition ? worldGroup.getRelativePointerPosition() : null);
    if (usesCursorPlacementPreview()) rememberPlacementPreviewPoint(previewPointer);
    if (isBulkLegPlacement()) return;
    if (isPipeDrapePlacement()) {
      const pointer = worldGroup && worldGroup.getRelativePointerPosition ? worldGroup.getRelativePointerPosition() : null;
      renderPipeDrapeDraft(pointer); return;
    }
    if (isFencePlacement()) {
      const pointer = worldGroup && worldGroup.getRelativePointerPosition ? worldGroup.getRelativePointerPosition() : null;
      renderFenceDraft(pointer); return;
    }
    if (isDrawnRunPlacement()) {
      const pointer = worldGroup && worldGroup.getRelativePointerPosition ? worldGroup.getRelativePointerPosition() : null;
      renderDrawnRunDraft(pointer);
      return;
    }
    if (isCustomBistroPlacement()) {
      const pointer = worldGroup && worldGroup.getRelativePointerPosition ? worldGroup.getRelativePointerPosition() : null;
      renderCustomBistroDraft(pointer);
      return;
    }
    if (placementPayload && placementPayload.kind === 'chairRowsAisle') {
      const pointer = pointerOverride || (worldGroup && worldGroup.getRelativePointerPosition ? worldGroup.getRelativePointerPosition() : null);
      const group = chairRowsGroupAtPoint(pointer);
      const candidate = group ? chairRowsAisleCandidate(group, pointer) : null;
      if (!group || !candidate) { if (placementPreview) placementPreview.hide(); worldLayer.batchDraw(); return; }
      if (!placementPreview) placementPreview = new Konva.Rect({ listening: false, fill: 'rgba(255,193,7,.18)', strokeWidth: 0 });
      const config = group.getAttr('groupedConfig') || {};
      const existingAisles = normaliseChairRowsAisles(config);
      const previewConfig = { ...cloneConfig(config), aislesEnabled: true, aisleCount: existingAisles.length + 1, aisles: [...existingAisles, candidate] };
      const previewGeometry = buildChairRowsGeometry(previewConfig);
      const previewAisle = previewGeometry && previewGeometry.aisles.find((aisle) => aisle.id === candidate.id);
      if (!previewAisle) { placementPreview.hide(); worldLayer.batchDraw(); return; }
      const bounds = chairRowsAisleVisualBounds(previewGeometry, previewAisle);
      const localTopLeft = { x: bounds.xFt * FEET_TO_PX, y: bounds.yFt * FEET_TO_PX };
      const worldTopLeft = chairRowsLocalPointToWorld(group, localTopLeft);
      placementPreview.setAttrs({ x: worldTopLeft.x, y: worldTopLeft.y, rotation: group.rotation() || 0, width: bounds.widthFt * FEET_TO_PX, height: bounds.heightFt * FEET_TO_PX });
      placementPreview.show(); placementPreview.moveToTop(); worldLayer.batchDraw(); return;
    }
    if (placementPayload && placementPayload.kind === 'roomAttachment') {
      renderRoomAttachmentPlacementPreview(pointerOverride || currentWorldPointer());
      return;
    }
    if (!placementPayload || !placementPreview || !worldGroup) return;
    const pointer = previewPointer;
    if (!pointer) {
      placementPreview.hide();
      worldLayer.batchDraw();
      return;
    }
    if (placementPayload.kind === 'tentAddon' && placementPayload.addonType === 'sidewall') {
      const tent = closestTentForAddonPlacement(pointer, 3);
      if (!tent) { placementPreview.hide(); worldLayer.batchDraw(); return; }
      const widthFt = Number(tent.getAttr('widthFt')) || 10;
      const heightFt = Number(tent.getAttr('heightFt')) || 10;
      const lengthFt = Number(placementPayload.lengthFt) || Number(placementPayload.rawData && placementPayload.rawData.length) || 10;
      const placementPoint = sidewallPlacementPoint(widthFt, heightFt, tentLocalPoint(tent, pointer), !shiftPressed);
      const segments = tentAddonSegments(widthFt, heightFt, placementPoint, lengthFt);
      placementPreview.destroyChildren();
      placementPreview.position(tent.position()); placementPreview.rotation(tent.rotation());
      segments.forEach((segment) => drawTentSidewallSegment(Konva, placementPreview, segment, widthFt, heightFt, '#0d6efd', FEET_TO_PX, .82));
      placementPreview.show(); placementPreview.moveToTop(); worldLayer.batchDraw(); return;
    }
    if (placementPayload.kind === 'tentAddon' && placementPayload.addonType === 'fan') {
      const tent = closestTentForAddonPlacement(pointer, 3);
      if (!tent) { placementPreview.hide(); worldLayer.batchDraw(); return; }
      const fanWidthFt = (Number(placementPayload.widthFt) || 1) * .8;
      const fanLengthFt = (Number(placementPayload.lengthFt) || 2) * .8;
      const attachment = fanAttachmentForPlacement(tent, pointer, fanWidthFt, fanLengthFt, shiftPressed);
      placementPreview.position(tentLocalPointToWorldPoint(attachment.point, { x: tent.x(), y: tent.y() }, tent.rotation() || 0, FEET_TO_PX));
      placementPreview.rotation((tent.rotation() || 0) + (attachment.rotationDeg || 0));
      placementPreview.show(); placementPreview.moveToTop(); worldLayer.batchDraw(); return;
    }
    if (placementPayload.kind === 'tentAddon' && placementPayload.addonType === 'weight') {
      if (shiftPressed) {
        placementPreview.position(pointer); placementPreview.rotation(placementRotation);
        placementPreview.show(); placementPreview.moveToTop(); worldLayer.batchDraw(); return;
      }
      const tent = closestTentForAddonPlacement(pointer, 3);
      if (!tent) { placementPreview.hide(); worldLayer.batchDraw(); return; }
      const footprint = normaliseWeightFootprint({ weightFootprint: placementPayload.weightFootprint, diameterFt: placementPayload.diameterFt, widthFt: placementPayload.widthFt, lengthFt: placementPayload.lengthFt });
      const widthFt = Number(tent.getAttr('widthFt')) || 10;
      const heightFt = Number(tent.getAttr('heightFt')) || 10;
      const local = tentLocalPoint(tent, pointer);
      const nearest = nearestTentLegIndex(widthFt, heightFt, local);
      const attachment = weightAttachmentAtLeg(widthFt, heightFt, nearest.index, local, footprint);
      placementPreview.position(tentLocalPointToWorldPoint(attachment.point, { x: tent.x(), y: tent.y() }, tent.rotation() || 0, FEET_TO_PX));
      placementPreview.rotation((tent.rotation() || 0) + (attachment.rotationDeg || 0));
      placementPreview.show(); placementPreview.moveToTop(); worldLayer.batchDraw(); return;
    }
    if (placementPayload.kind === 'tentAddon' && placementPayload.addonType === 'fireExtinguisher') {
      const tent = closestTentForAddonPlacement(pointer, 3);
      if (!tent) { placementPreview.hide(); worldLayer.batchDraw(); return; }
      const widthFt = Number(tent.getAttr('widthFt')) || 10;
      const heightFt = Number(tent.getAttr('heightFt')) || 10;
      const local = tentLocalPoint(tent, pointer);
      const nearest = nearestTentLegIndex(widthFt, heightFt, local);
      const attachment = fireExtinguisherAttachmentAtLeg(widthFt, heightFt, nearest.index);
      placementPreview.position(tentLocalPointToWorldPoint(attachment.point, { x: tent.x(), y: tent.y() }, tent.rotation() || 0, FEET_TO_PX));
      placementPreview.show(); placementPreview.moveToTop(); worldLayer.batchDraw(); return;
    }
    if (placementPayload.kind === 'tentAddon' && ['exitSign', 'noSmokingSign'].includes(placementPayload.addonType)) {
      const tent = closestTentForAddonPlacement(pointer, 3);
      if (!tent) { placementPreview.hide(); worldLayer.batchDraw(); return; }
      const widthFt = Number(tent.getAttr('widthFt')) || 10;
      const heightFt = Number(tent.getAttr('heightFt')) || 10;
      const signLengthFt = Number(placementPayload.lengthFt) || 2;
      const attachment = perimeterSignAttachment(widthFt, heightFt, tentLocalPoint(tent, pointer), signLengthFt);
      const depthPx = FEET_TO_PX; const lengthPx = signLengthFt * FEET_TO_PX;
      const edge = attachment.edge; const center = attachment.center;
      const x = edge === 0 || edge === 2 ? center * FEET_TO_PX : (edge === 1 ? widthFt : 0) * FEET_TO_PX;
      const y = edge === 0 || edge === 2 ? (edge === 0 ? 0 : heightFt) * FEET_TO_PX : center * FEET_TO_PX;
      const rotation = edge === 0 ? 0 : edge === 1 ? 90 : edge === 2 ? 180 : -90;
      placementPreview.destroyChildren(); placementPreview.position(tent.position()); placementPreview.rotation(tent.rotation());
      const sign = new Konva.Group({ x, y, rotation });
      sign.add(new Konva.Rect({ x: -lengthPx / 2, y: 0, width: lengthPx, height: depthPx, fill: placementPayload.addonType === 'exitSign' ? '#198754' : '#fff', stroke: placementPayload.addonType === 'exitSign' ? '#0f5132' : '#dc3545', strokeWidth: 1.25, listening: false }));
      if (placementPayload.addonType === 'exitSign') sign.add(new Konva.Text({ x: -lengthPx / 2, y: depthPx * .2, width: lengthPx, text: 'EXIT', align: 'center', fontSize: Math.max(8, depthPx * .55), fontStyle: 'bold', fill: '#fff', listening: false }));
      else { sign.add(new Konva.Circle({ x: 0, y: depthPx / 2, radius: depthPx * .33, stroke: '#dc3545', strokeWidth: 2, listening: false })); sign.add(new Konva.Line({ points: [-depthPx * .25, depthPx * .75, depthPx * .25, depthPx * .25], stroke: '#dc3545', strokeWidth: 2, listening: false })); }
      placementPreview.add(sign); placementPreview.show(); placementPreview.moveToTop(); worldLayer.batchDraw(); return;
    }
    if (placementPayload.kind === 'stageAddon') {
      const widthFt = placementPayload.addonType === 'Adjustable Stairs' || placementPayload.addonType === 'Stage Railing 4ft' ? 4 : 2;
      const depthFt = placementPayload.addonType === 'Adjustable Stairs' ? 5 : placementPayload.addonType === 'Basic Step' ? 2 : .35;
      const match = closestStageForAddonPlacement(pointer, widthFt);
      if (!match) { placementPreview.hide(); worldLayer.batchDraw(); return; }
      const stageNode = match.node; const edge = match.edge;
      const stageWidth = Number(stageNode.getAttr('widthFt')) || 0; const stageLength = Number(stageNode.getAttr('lengthFt')) || 0;
      const horizontal = edge.side === 'top' || edge.side === 'bottom';
      const x = horizontal ? edge.along * FEET_TO_PX : (edge.side === 'left' ? -depthFt / 2 : stageWidth + depthFt / 2) * FEET_TO_PX;
      const y = horizontal ? (edge.side === 'top' ? -depthFt / 2 : stageLength + depthFt / 2) * FEET_TO_PX : edge.along * FEET_TO_PX;
      const stageAngle = (stageNode.rotation ? stageNode.rotation() : 0) * Math.PI / 180;
      if (Math.abs(stageAngle) < 1e-6) placementPreview.position({ x: stageNode.x() + x, y: stageNode.y() + y });
      else placementPreview.position({ x: stageNode.x() + x * Math.cos(stageAngle) - y * Math.sin(stageAngle), y: stageNode.y() + x * Math.sin(stageAngle) + y * Math.cos(stageAngle) });
      placementPreview.rotation((stageNode.rotation ? stageNode.rotation() : 0) + (horizontal ? 0 : 90));
      placementPreview.show(); placementPreview.moveToTop(); worldLayer.batchDraw(); return;
    }
    const snapped = snapPosition(pointer);
    placementPreview.show();
    placementPreview.position(snapped);
    placementPreview.rotation(placementRotation);
    worldLayer.batchDraw();
  }

  const roomAttachmentPlacement = () => createRoomAttachmentPlacement({
    Konva, pixelsPerFoot: FEET_TO_PX, stage, stageContainer, worldGroup, worldLayer, uiGroup,
    collectionToArray, roomAttachmentComponents, roomWall, roomAttachmentClamp, roomAttachmentList,
    roomWallInteriorSide, closestVenueBuilderWall, getPlacementPreview: () => placementPreview,
    getPlacementPayload: () => placementPayload, renderRoomWalls, renderVenueAttachmentGeometry,
    setDirty, showPlannerToast,
  });

  function currentWorldPointer() { return roomAttachmentPlacement().currentWorldPointer(); }
  function roomAttachmentPointerFromEvent(event) { return roomAttachmentPlacement().pointerFromEvent(event); }

  function plannerWorldPointFromDomEvent(event) {
    if (!(event && stageContainer && worldGroup && worldGroup.getAbsoluteTransform)) return null;
    const touch = (event.touches && event.touches[0]) || (event.changedTouches && event.changedTouches[0]) || event;
    if (!Number.isFinite(touch.clientX) || !Number.isFinite(touch.clientY)) return null;
    const rect = stageContainer.getBoundingClientRect();
    try {
      return worldGroup.getAbsoluteTransform().copy().invert().point({
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      });
    } catch (error) {
      return null;
    }
  }

  function roomAttachmentCandidate(worldPoint) { return roomAttachmentPlacement().candidate(worldPoint); }

  function renderRoomAttachmentPlacementPreview(worldPoint) { return roomAttachmentPlacement().renderPreview(worldPoint); }
  function roomLocalPoint(room, worldPoint) { return roomAttachmentPlacement().localPoint(room, worldPoint); }
  function placeRoomWallAttachment(worldPoint, type) { return roomAttachmentPlacement().place(worldPoint, type); }

  function updateToolButtons() {
    [selectBtn, panBtn, labelToolBtn, venueToggleBtn].forEach((btn) => {
      if (btn) btn.classList.remove('tool-active');
    });
    if (activePlacementButton) activePlacementButton.classList.remove('tool-active');

    if (activeTool === 'pan') {
      if (panBtn) panBtn.classList.add('tool-active');
    } else if (activeTool === 'label') {
      if (labelToolBtn) labelToolBtn.classList.add('tool-active');
    } else if (activeTool === 'place' && activePlacementButton) {
      activePlacementButton.classList.add('tool-active');
    } else if (selectBtn) {
      selectBtn.classList.add('tool-active');
    }
    updateVenueToggleButton();
    updateLabelsToggleButton();
    if (editLabelBtn) {
      const selectedLabel = selectedItems.length === 1 && selectedItems[0].getAttr && selectedItems[0].getAttr('customType') === 'label';
      const selectedNode = selectedItems.length === 1 ? selectedItems[0] : null;
      const canEditAttached = !!(selectedNode && selectedNode.getAttr && selectedNode.getAttr('customType') !== 'label' && findAttachedLabels(selectedNode.getAttr('nodeId')).length === 1);
      const canEdit = selectedLabel || canEditAttached;
      editLabelBtn.disabled = !canEdit;
      editLabelBtn.classList.toggle('disabled', !canEdit);
    }
    if (saveGroupBtn) {
      const selectedTents = selectedItems.filter((node) => node && node.getAttr && node.getAttr('customType') === 'venue' && node.getAttr('venueType') === 'tent');
      const canSaveTent = selectedTents.length === 1 && selectedItems.every((node) => {
        const type = node && node.getAttr ? node.getAttr('customType') : '';
        return type === 'venue' || (type === 'tentAddon' && node.getAttr('parentTentNodeId') === selectedTents[0].getAttr('nodeId'));
      });
      const canSaveNormal = selectedItems.length > 0 && selectedItems.every((node) => {
        const type = node && node.getAttr ? node.getAttr('customType') : '';
        return !['venue', 'referenceImage', 'layoutGroup'].includes(type);
      });
      saveGroupBtn.disabled = !(canSaveTent || canSaveNormal);
      saveGroupBtn.classList.toggle('disabled', !(canSaveTent || canSaveNormal));
    }
    if (ungroupBtn) {
      const canUngroup = selectedItems.some((node) => node && node.getAttr && node.getAttr('customType') === 'layoutGroup');
      ungroupBtn.disabled = !canUngroup;
      ungroupBtn.classList.toggle('disabled', !canUngroup);
    }
  }

  function updateModeHint() {
    return;
  }

  function syncToolStateUI() {
    document.body.classList.toggle('placement-armed', activeTool === 'place');
    document.body.classList.toggle('pan-mode', activeTool === 'pan');
    updateSnapToolbarButton();
    ensureLayerGroups();
    syncLayerNodeState();
    updateToolButtons();
    updateModeHint();
    if (worldLayer) worldLayer.batchDraw();
  }

  function clearPlacementState() {
    clearPipeDrapeDraft();
    if (isCustomBistroPlacement() && customBistroDraft.points.length) finishCustomBistroString();
    resetCustomBistroDraft();
    clearDrawnRunDraft();
    clearBulkLegPlacement();
    placementPayload = null;
    placementPreviewPoint = null;
    placementTouchPreviewReady = false;
    touchAddonPreviewActive = false;
    suppressSyntheticPlacementMouseUntil = 0;
    if (activePlacementButton) {
      activePlacementButton.classList.remove('tool-active');
      activePlacementButton = null;
    }
    clearPlacementPreview();
  }

  function setActiveTool(tool) {
    if (tool === 'label') {
      const labelLayer = getLabelLayer();
      if (!labelLayer || !labelLayer.visible || labelLayer.locked) {
        showPlannerToast('Unlock and show the Labels layer before adding or editing labels.');
        tool = 'select';
      }
    }
    if (tool !== 'select') closePipeDrapeEdit();
    activeTool = tool;
    if (tool !== 'place') clearPlacementState();
    // Canvas navigation is handled by the stage touch/pointer handlers below.
    // Leaving the world group draggable lets Konva start a second drag during
    // a pinch, which can strand the planner in a drag state after touch ends.
    worldGroup.draggable(false);
    if (worldGroup.stopDrag) worldGroup.stopDrag();
    if (tool !== 'pan') {
      document.body.classList.remove('is-panning');
      if (stage && stage.content) stage.content.classList.remove('is-panning');
      if (stageContainer) stageContainer.classList.remove('is-panning');
    }
    syncToolStateUI();
    if (tool !== 'label') clearLabelAttachmentPreview();
  }

  function showPlannerToast(message) {
    let toast = document.getElementById('plannerToast');
    if (!toast) { toast = document.createElement('div'); toast.id = 'plannerToast'; toast.className = 'planner-toast'; document.body.appendChild(toast); }
    toast.textContent = message; toast.classList.add('is-visible');
    clearTimeout(showPlannerToast.timer);
    showPlannerToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 3600);
  }

  function calibrationFactor(knownFt, measuredUnits, unitsPerFoot = FEET_TO_PX) {
    return calculateCalibrationFactor(knownFt, measuredUnits, unitsPerFoot);
  }

  function readFileAsDataUrl(file) { return readReferenceFileDataUrl(file); }

  function loadReferenceImage(dataUrl) { return loadReferenceSourceImage(dataUrl); }

  async function referenceFileDataUrl(file) { return decodeReferenceFile(file, window.pdfjsLib); }

  function referenceSetupDisplay() {
    return referenceCanvasDisplay(referenceSetupCanvas, referenceSetup.image, referenceSetup.view);
  }

  function renderReferenceSetup() {
    return renderReferenceSetupCanvas(referenceSetupCanvas, referenceSetup);
  }

  function referenceSetupPoint(event) {
    return referenceCanvasPoint(referenceSetupCanvas, referenceSetup.image, event, referenceSetup.view);
  }

  function clampReferenceCrop(crop) {
    return constrainReferenceCrop(referenceSetup.image, crop);
  }

  function beginManualReferenceScale() {
    referenceSetup.mode = 'manual'; referenceSetup.manualPoints = []; referenceSetup.scale = null;
    if (referenceSetupManualControls) referenceSetupManualControls.style.display = ''; if (referenceSetupApply) referenceSetupApply.disabled = true;
    if (referenceSetupStatus) referenceSetupStatus.textContent = 'Click two ends of a known distance, or enter the image pixels per foot directly.'; renderReferenceSetup();
  }

  function updateReferenceSetupZoomUI() {
    if (referenceSetupZoomValue) referenceSetupZoomValue.textContent = `${Math.round((Number(referenceSetup.view && referenceSetup.view.zoom) || 1) * 100)}%`;
  }

  function zoomReferenceSetup(factor) {
    if (!(referenceSetup.open && referenceSetup.image)) return;
    const view = referenceSetup.view || (referenceSetup.view = { zoom: 1, panX: 0, panY: 0 });
    view.zoom = Math.max(1, Math.min(8, (Number(view.zoom) || 1) * factor));
    renderReferenceSetup(); updateReferenceSetupZoomUI();
  }

  function setReferenceSetupRotation(value) {
    if (!(referenceSetup.open && referenceSetup.sourceImage)) return;
    const image = referenceSetup.sourceImage;
    const rotation = Math.max(-180, Math.min(180, Number(value) || 0));
    const radians = rotation * Math.PI / 180;
    const cosine = Math.abs(Math.cos(radians)); const sine = Math.abs(Math.sin(radians));
    const rotated = document.createElement('canvas');
    rotated.width = Math.max(1, Math.ceil(image.width * cosine + image.height * sine));
    rotated.height = Math.max(1, Math.ceil(image.width * sine + image.height * cosine));
    const context = rotated.getContext('2d');
    context.translate(rotated.width / 2, rotated.height / 2); context.rotate(radians); context.drawImage(image, -image.width / 2, -image.height / 2);
    referenceSetup.image = rotated;
    referenceSetup.rotation = rotation;
    referenceSetup.crop = { x: 0, y: 0, width: rotated.width, height: rotated.height };
    referenceSetup.manualPoints = [];
    referenceSetup.view = { zoom: 1, panX: 0, panY: 0 };
    if (referenceSetupRotation) referenceSetupRotation.value = String(rotation);
    if (referenceSetupRotationValue) referenceSetupRotationValue.textContent = `${rotation}°`;
    if (referenceSetupStatus) referenceSetupStatus.textContent = 'Image rotation updated. Frame the part of the image you need, then apply the reference.';
    renderReferenceSetup(); updateReferenceSetupZoomUI();
  }

  function cropReferenceSource() {
    const crop = referenceSetup.crop; const source = document.createElement('canvas'); source.width = Math.max(1, Math.round(crop.width)); source.height = Math.max(1, Math.round(crop.height)); source.getContext('2d').drawImage(referenceSetup.image, crop.x, crop.y, crop.width, crop.height, 0, 0, source.width, source.height);
    return source.toDataURL(referenceSetup.rotation ? 'image/png' : 'image/jpeg', .9);
  }

  function referenceSetupDimensions() {
    return calculateReferenceSetupDimensions(referenceSetup.crop, referenceSetup.scale, FEET_TO_PX);
  }

  function closeReferenceSetup(commit = false) {
    if (!commit && referenceSetup.target && referenceSetup.target.opacity) {
      referenceSetup.target.opacity(referenceSetup.originalOpacity); worldLayer && worldLayer.batchDraw();
    }
    if (referenceSetupModal) referenceSetupModal.style.display = 'none';
    referenceSetup = { open: false, source: null, target: null, context: null, image: null, sourceImage: null, rotation: 0, crop: null, mode: 'frame', drag: null, manualPoints: [], scale: null, opacity: .5, originalOpacity: .5 };
  }

  let usgsPicker = null;
  let usgsPreviewRequest = 0;
  const usgsClamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const usgsLatFeet = (feet) => feet * .3048 / 110540;
  const usgsLonFeet = (feet, latitude) => feet * .3048 / Math.max(1000, 111320 * Math.cos(latitude * Math.PI / 180));
  function setUsgsReferenceStatus(message) { if (usgsReferenceStatus) usgsReferenceStatus.textContent = message; }
  function syncUsgsPickerInputs() {
    if (!usgsPicker) return;
    if (usgsReferenceLon) usgsReferenceLon.value = usgsPicker.selection.lon.toFixed(6);
    if (usgsReferenceLat) usgsReferenceLat.value = usgsPicker.selection.lat.toFixed(6);
    if (usgsReferenceWidth) usgsReferenceWidth.value = String(Math.round(usgsPicker.selection.widthFt));
    if (usgsReferenceHeight) usgsReferenceHeight.value = String(Math.round(usgsPicker.selection.heightFt));
  }
  function clampUsgsPickerSelection() {
    if (!usgsPicker) return;
    const view = usgsPicker.view; const selected = usgsPicker.selection;
    selected.widthFt = usgsClamp(selected.widthFt, 50, Math.min(2000, view.widthFt * .94));
    selected.heightFt = usgsClamp(selected.heightFt, 50, Math.min(2000, view.heightFt * .94));
    const eastFt = (selected.lon - view.lon) / usgsLonFeet(1, view.lat);
    const southFt = (view.lat - selected.lat) / usgsLatFeet(1);
    const allowedEast = Math.max(0, (view.widthFt - selected.widthFt) / 2);
    const allowedSouth = Math.max(0, (view.heightFt - selected.heightFt) / 2);
    const clampedEast = usgsClamp(eastFt, -allowedEast, allowedEast);
    const clampedSouth = usgsClamp(southFt, -allowedSouth, allowedSouth);
    selected.lon = view.lon + usgsLonFeet(clampedEast, view.lat);
    selected.lat = view.lat - usgsLatFeet(clampedSouth);
  }
  function renderUsgsPickerSelection() {
    if (!usgsPicker || !usgsReferencePreview || !usgsReferenceSelection) return;
    clampUsgsPickerSelection(); const { view, selection } = usgsPicker;
    const eastFt = (selection.lon - view.lon) / usgsLonFeet(1, view.lat);
    const southFt = (view.lat - selection.lat) / usgsLatFeet(1);
    const left = 50 + (eastFt - selection.widthFt / 2) / view.widthFt * 100;
    const top = 50 + (southFt - selection.heightFt / 2) / view.heightFt * 100;
    usgsReferenceSelection.style.display = '';
    usgsReferenceSelection.style.left = `${left}%`; usgsReferenceSelection.style.top = `${top}%`;
    usgsReferenceSelection.style.width = `${selection.widthFt / view.widthFt * 100}%`; usgsReferenceSelection.style.height = `${selection.heightFt / view.heightFt * 100}%`;
    if (usgsReferenceSelectionLabel) usgsReferenceSelectionLabel.textContent = `${Math.round(selection.widthFt)} × ${Math.round(selection.heightFt)} ft`;
    syncUsgsPickerInputs();
  }
  async function loadUsgsPickerPreview() {
    if (!usgsPicker || !usgsReferencePreviewImage) return;
    const token = ++usgsPreviewRequest; const { view } = usgsPicker;
    if (usgsReferencePreview) usgsReferencePreview.classList.remove('is-ready');
    setUsgsReferenceStatus('Loading aerial preview…');
    try {
      const query = new URLSearchParams({ lon: String(view.lon), lat: String(view.lat), width_ft: String(Math.round(view.widthFt)), height_ft: String(Math.round(view.heightFt)), preview: '1' });
      const response = await fetch(`/api/reference-map/usgs-naip?${query}`); const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'USGS preview could not be loaded.');
      if (token !== usgsPreviewRequest) return;
      usgsReferencePreviewImage.onload = () => { if (token === usgsPreviewRequest && usgsReferencePreview) usgsReferencePreview.classList.add('is-ready'); };
      usgsReferencePreviewImage.src = data.image_data_url;
      renderUsgsPickerSelection();
      setUsgsReferenceStatus('Drag the outlined area to move it. Drag an edge or corner to resize it.');
    } catch (error) { if (token === usgsPreviewRequest) setUsgsReferenceStatus(error.message || 'USGS preview could not be loaded.'); }
  }
  function startUsgsPicker(lon, lat, widthFt, heightFt) {
    const width = usgsClamp(Number(widthFt) || 300, 50, 2000); const height = usgsClamp(Number(heightFt) || 300, 50, 2000);
    const previewRect = usgsReferencePreview && usgsReferencePreview.getBoundingClientRect(); const aspect = previewRect && previewRect.width ? previewRect.height / previewRect.width : .6;
    const viewWidth = Math.min(8000, Math.max(800, width * 2.6, height * 2.6 / Math.max(.2, aspect)));
    usgsPicker = { view: { lon: Number(lon), lat: Number(lat), widthFt: viewWidth, heightFt: viewWidth * aspect }, selection: { lon: Number(lon), lat: Number(lat), widthFt: width, heightFt: height }, drag: null };
    renderUsgsPickerSelection(); loadUsgsPickerPreview();
  }
  function closeUsgsReferenceModal() { usgsPreviewRequest += 1; usgsPicker = null; if (usgsReferenceModal) usgsReferenceModal.style.display = 'none'; }
  function openUsgsReferenceModal() {
    if (usgsReferenceModal) usgsReferenceModal.style.display = 'flex';
    if (usgsReferencePreview) usgsReferencePreview.classList.remove('is-ready');
    if (usgsReferenceSelection) usgsReferenceSelection.style.display = 'none';
    setUsgsReferenceStatus('Find an address, then drag the outlined area to choose the aerial reference.');
  }
  async function locateUsgsReferenceAddress() {
    const address = (usgsReferenceAddress && usgsReferenceAddress.value || '').trim(); if (!address) return setUsgsReferenceStatus('Enter a complete U.S. street address first.');
    setUsgsReferenceStatus('Finding address…');
    try {
      const response = await fetch(`/api/reference-map/geocode?address=${encodeURIComponent(address)}`); const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Address could not be found.');
      startUsgsPicker(data.lon, data.lat, Number(usgsReferenceWidth && usgsReferenceWidth.value), Number(usgsReferenceHeight && usgsReferenceHeight.value));
      setUsgsReferenceStatus(`Using ${data.address}. Loading aerial preview…`);
    } catch (error) { setUsgsReferenceStatus(error.message || 'Address lookup failed. You can use coordinates instead.'); }
  }
  function showUsgsCoordinatesOnMap() {
    const lon = Number(usgsReferenceLon && usgsReferenceLon.value); const lat = Number(usgsReferenceLat && usgsReferenceLat.value);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return setUsgsReferenceStatus('Enter valid longitude and latitude first.');
    startUsgsPicker(lon, lat, Number(usgsReferenceWidth && usgsReferenceWidth.value), Number(usgsReferenceHeight && usgsReferenceHeight.value));
  }
  function updateUsgsPickerDimensions() {
    if (!usgsPicker) return;
    usgsPicker.selection.widthFt = Number(usgsReferenceWidth && usgsReferenceWidth.value) || usgsPicker.selection.widthFt;
    usgsPicker.selection.heightFt = Number(usgsReferenceHeight && usgsReferenceHeight.value) || usgsPicker.selection.heightFt;
    renderUsgsPickerSelection();
  }
  function zoomUsgsPicker(direction) {
    if (!usgsPicker) return setUsgsReferenceStatus('Find an address or show manual coordinates first.');
    const multiplier = direction > 0 ? 1 / 1.6 : 1.6;
    const selected = usgsPicker.selection; const view = usgsPicker.view;
    view.widthFt = usgsClamp(view.widthFt * multiplier, Math.max(selected.widthFt * 1.1, 120), 8000);
    view.heightFt = usgsClamp(view.heightFt * multiplier, Math.max(selected.heightFt * 1.1, 120), 8000);
    renderUsgsPickerSelection(); loadUsgsPickerPreview();
  }
  function usgsPickerPointerDown(event) {
    if (!usgsPicker || !usgsReferencePreview || !usgsReferenceSelection) return;
    const box = usgsReferenceSelection.getBoundingClientRect(); const edge = 14;
    const resize = { left: Math.abs(event.clientX - box.left) <= edge, right: Math.abs(event.clientX - box.right) <= edge, top: Math.abs(event.clientY - box.top) <= edge, bottom: Math.abs(event.clientY - box.bottom) <= edge };
    usgsPicker.drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, selection: { ...usgsPicker.selection }, resize: Object.values(resize).some(Boolean) ? resize : null };
    usgsReferencePreview.setPointerCapture && usgsReferencePreview.setPointerCapture(event.pointerId); event.preventDefault();
  }
  function usgsPickerPointerMove(event) {
    if (!usgsPicker || !usgsPicker.drag || usgsPicker.drag.pointerId !== event.pointerId || !usgsReferencePreview) return;
    const drag = usgsPicker.drag; const rect = usgsReferencePreview.getBoundingClientRect(); const dx = (event.clientX - drag.startX) / rect.width * usgsPicker.view.widthFt; const dy = (event.clientY - drag.startY) / rect.height * usgsPicker.view.heightFt;
    let centerEast = 0; let centerSouth = 0; let width = drag.selection.widthFt; let height = drag.selection.heightFt;
    if (drag.resize) {
      let left = -width / 2; let right = width / 2; let top = -height / 2; let bottom = height / 2;
      if (drag.resize.left) left += dx; if (drag.resize.right) right += dx; if (drag.resize.top) top += dy; if (drag.resize.bottom) bottom += dy;
      width = Math.max(50, right - left); height = Math.max(50, bottom - top); centerEast = (left + right) / 2; centerSouth = (top + bottom) / 2;
    } else { centerEast = dx; centerSouth = dy; }
    usgsPicker.selection.widthFt = width; usgsPicker.selection.heightFt = height;
    usgsPicker.selection.lon = drag.selection.lon + usgsLonFeet(centerEast, drag.selection.lat);
    usgsPicker.selection.lat = drag.selection.lat - usgsLatFeet(centerSouth);
    renderUsgsPickerSelection(); event.preventDefault();
  }
  function usgsPickerPointerUp(event) {
    if (!usgsPicker || !usgsPicker.drag || usgsPicker.drag.pointerId !== event.pointerId) return;
    if (usgsReferencePreview && usgsReferencePreview.hasPointerCapture && usgsReferencePreview.hasPointerCapture(event.pointerId)) usgsReferencePreview.releasePointerCapture(event.pointerId);
    usgsPicker.drag = null;
  }
  async function createUsgsReference() {
    const selected = usgsPicker && usgsPicker.selection; const lon = selected ? selected.lon : Number(usgsReferenceLon && usgsReferenceLon.value); const lat = selected ? selected.lat : Number(usgsReferenceLat && usgsReferenceLat.value); const widthFt = selected ? selected.widthFt : Number(usgsReferenceWidth && usgsReferenceWidth.value); const heightFt = selected ? selected.heightFt : Number(usgsReferenceHeight && usgsReferenceHeight.value);
    if (![lon, lat, widthFt, heightFt].every(Number.isFinite)) return setUsgsReferenceStatus('Find an address or enter valid U.S. coordinates first.');
    setUsgsReferenceStatus('Downloading high-detail USGS NAIP aerial imagery…');
    try {
      const query = new URLSearchParams({ lon: String(lon), lat: String(lat), width_ft: String(widthFt), height_ft: String(heightFt) }); const response = await fetch(`/api/reference-map/usgs-naip?${query}`); const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'USGS imagery could not be created.');
      closeUsgsReferenceModal();
      const coverage = data.coverage_ft || { width: widthFt, height: heightFt };
      const scalePixels = ((Number(data.width) / Number(coverage.width)) + (Number(data.height) / Number(coverage.height))) / 2;
      await openReferenceSetup({ dataUrl: data.image_data_url, name: data.name || 'USGS NAIP aerial reference', sourceType: 'usgs-naip', width: data.width, height: data.height, scaleInfo: { feet: 1, pixels: scalePixels, source: 'usgs-naip-selection' }, mapMetadata: { provider: 'usgs-naip', extent: data.extent, center: data.center, coverageFt: coverage, attribution: data.attribution } }, { context: 'main' });
    } catch (error) { setUsgsReferenceStatus(error.message || 'USGS imagery could not be created.'); }
  }

  async function openReferenceSetup(source, options = {}) {
    if (!source || !source.dataUrl) throw new Error('Reference image data is missing.');
    const image = await loadReferenceImage(source.dataUrl); const metadata = source.referenceMeta || {};
    const existingOpacity = options.context === 'builder' && venueBuilder.referenceNode ? venueBuilder.referenceNode.opacity() : referenceImageOpacity;
    referenceSetup = { open: true, source: { ...source }, target: options.target || null, context: options.context || 'main', image, sourceImage: image, rotation: 0, crop: { x: 0, y: 0, width: image.width, height: image.height }, mode: 'frame', drag: null, viewDrag: null, view: { zoom: 1, panX: 0, panY: 0 }, manualPoints: [], scale: source.scaleInfo || (metadata.scale && metadata.scale.pixels ? metadata.scale : null), opacity: existingOpacity, originalOpacity: existingOpacity };
    if (referenceSetupTitle) referenceSetupTitle.textContent = options.context === 'builder' ? 'Set up trace reference' : 'Set up reference image';
    if (referenceSetupSubtitle) referenceSetupSubtitle.textContent = 'Frame the image first, then set or confirm its scale.';
    if (referenceSetupAutoScale) { const auto = source.scaleInfo; const coverage = source.mapMetadata && source.mapMetadata.coverageFt; referenceSetupAutoScale.style.display = auto ? '' : 'none'; referenceSetupAutoScale.textContent = auto ? `${coverage ? `Automatic scale from your selected ${Math.round(coverage.width)} × ${Math.round(coverage.height)} ft area` : `Automatic scale verified from ${source.mapMetadata && source.mapMetadata.provider === 'usgs-naip' ? 'USGS NAIP map extent' : 'embedded map metadata'}`}: ${Math.round(auto.pixels * 100) / 100} pixels per foot.` : ''; }
    if (referenceSetupManualControls) referenceSetupManualControls.style.display = 'none'; if (referenceSetupDistance) referenceSetupDistance.value = ''; if (referenceSetupPixelsPerFoot) referenceSetupPixelsPerFoot.value = referenceSetup.scale && referenceSetup.scale.pixels && referenceSetup.scale.feet ? String(Math.round((referenceSetup.scale.pixels / referenceSetup.scale.feet) * 100) / 100) : '';
    if (referenceSetupOpacityWrap) referenceSetupOpacityWrap.style.display = 'none';
    if (referenceSetupOpacity) referenceSetupOpacity.value = String(existingOpacity);
    if (referenceSetupOpacityValue) referenceSetupOpacityValue.textContent = `${Math.round(existingOpacity * 100)}%`;
    if (referenceSetupRotation) referenceSetupRotation.value = '0';
    if (referenceSetupRotationValue) referenceSetupRotationValue.textContent = '0°';
    if (referenceSetupApply) referenceSetupApply.disabled = !referenceSetup.scale;
    if (referenceSetupStatus) referenceSetupStatus.textContent = source.scaleInfo ? 'Verified automatic scale is ready. Adjust the frame, then apply the reference.' : 'Scale not verified. Drag the frame, then select two visible points and enter their known distance.';
    if (referenceSetupModal) referenceSetupModal.style.display = 'flex'; renderReferenceSetup(); updateReferenceSetupZoomUI();
  }

  function applyReferenceSetup() {
    const dimensions = referenceSetupDimensions(); if (!dimensions) { beginManualReferenceScale(); return; }
    const dataUrl = cropReferenceSource(); const source = referenceSetup.source; const selectedOpacity = referenceSetup.opacity; const previousMeta = source.referenceMeta || {}; const metadata = { sourceType: source.sourceType || previousMeta.sourceType || 'image', sourceName: source.name || previousMeta.sourceName || 'Reference image', scale: referenceSetup.scale, mapMetadata: source.mapMetadata || previousMeta.mapMetadata || null, cropped: true };
    if (referenceSetup.context === 'builder') {
      const prior = venueBuilder.referenceNode; addVenueBuilderReference(dataUrl, { dataUrl, xFt: prior ? prior.x() / FEET_TO_PX : 40 / FEET_TO_PX, yFt: prior ? prior.y() / FEET_TO_PX : 40 / FEET_TO_PX, widthFt: dimensions.width / FEET_TO_PX, heightFt: dimensions.height / FEET_TO_PX, opacity: prior ? prior.opacity() : .5, referenceMeta: metadata });
      closeReferenceSetup(true); return;
    }
    const target = referenceSetup.target;
    if (target) {
      loadReferenceImage(dataUrl).then((image) => { const oldWidth = target.width(); const oldHeight = target.height(); const radians = (target.rotation() || 0) * Math.PI / 180; const center = { x: target.x() + oldWidth / 2 * Math.cos(radians) - oldHeight / 2 * Math.sin(radians), y: target.y() + oldWidth / 2 * Math.sin(radians) + oldHeight / 2 * Math.cos(radians) }; target.image(image); target.width(dimensions.width); target.height(dimensions.height); target.opacity(selectedOpacity); target.position({ x: center.x - dimensions.width / 2 * Math.cos(radians) + dimensions.height / 2 * Math.sin(radians), y: center.y - dimensions.width / 2 * Math.sin(radians) - dimensions.height / 2 * Math.cos(radians) }); target.setAttrs({ dataUrl, referenceMeta: metadata }); if (referenceSetupFitGrid && referenceSetupFitGrid.checked) fitGridToReference(target); worldLayer.batchDraw(); setDirty(true); });
    } else {
      createReferenceImage({ dataUrl, name: source.name, width: dimensions.width, height: dimensions.height, opacity: selectedOpacity, referenceMeta: metadata }).then((node) => { const layer = getLayer('reference-base'); const group = layer && getLayerGroup(layer.id); if (!group) throw new Error('Reference Images layer is unavailable.'); setNodeLayerId(node, layer.id); group.add(node); if (referenceSetupFitGrid && referenceSetupFitGrid.checked) fitGridToReference(node); refreshLayersUI(); worldLayer.draw(); setDirty(true); }).catch((error) => window.alert(error.message || 'The reference image could not be added.'));
    }
    closeReferenceSetup(true);
  }

  function referenceSetupDragStart(event) {
    if (!referenceSetup.open || !referenceSetup.image) return;
    if (referenceSetupSpacePressed || event.button === 1) {
      const view = referenceSetup.view || (referenceSetup.view = { zoom: 1, panX: 0, panY: 0 });
      referenceSetup.viewDrag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, panX: Number(view.panX) || 0, panY: Number(view.panY) || 0 };
      if (referenceSetupCanvas.setPointerCapture) referenceSetupCanvas.setPointerCapture(event.pointerId);
      event.preventDefault(); return;
    }
    const point = referenceSetupPoint(event);
    if (referenceSetup.mode === 'manual') {
      referenceSetup.manualPoints.push(point);
      if (referenceSetup.manualPoints.length === 1) {
        if (referenceSetupStatus) referenceSetupStatus.textContent = 'Click the second end of the same known distance.';
      } else {
        referenceSetup.manualPoints = referenceSetup.manualPoints.slice(-2);
        if (referenceSetupManualControls) referenceSetupManualControls.style.display = '';
        if (referenceSetupStatus) referenceSetupStatus.textContent = 'Enter the distance between the two yellow points.';
      }
      renderReferenceSetup(); return;
    }
    const crop = referenceSetup.crop; const display = referenceSetupDisplay(); const tolerance = 16 / Math.max(.01, display.scale);
    const corners = [{ key: 'tl', x: crop.x, y: crop.y }, { key: 'tr', x: crop.x + crop.width, y: crop.y }, { key: 'bl', x: crop.x, y: crop.y + crop.height }, { key: 'br', x: crop.x + crop.width, y: crop.y + crop.height }];
    const corner = corners.find((candidate) => Math.hypot(point.x - candidate.x, point.y - candidate.y) <= tolerance);
    referenceSetup.drag = { kind: corner ? 'resize' : (point.x >= crop.x && point.x <= crop.x + crop.width && point.y >= crop.y && point.y <= crop.y + crop.height ? 'move' : 'new'), handle: corner && corner.key, start: point, crop: { ...crop } };
    if (referenceSetup.drag.kind === 'new') referenceSetup.crop = { x: point.x, y: point.y, width: 32, height: 32 };
    if (referenceSetupCanvas.setPointerCapture) referenceSetupCanvas.setPointerCapture(event.pointerId);
    renderReferenceSetup(); event.preventDefault();
  }

  function referenceSetupDragMove(event) {
    if (!referenceSetup.open) return;
    const viewDrag = referenceSetup.viewDrag;
    if (viewDrag && viewDrag.pointerId === event.pointerId) {
      const rect = referenceSetupCanvas.getBoundingClientRect(); const view = referenceSetup.view || (referenceSetup.view = { zoom: 1, panX: 0, panY: 0 });
      view.panX = viewDrag.panX + ((event.clientX - viewDrag.startX) * referenceSetupCanvas.width / rect.width);
      view.panY = viewDrag.panY + ((event.clientY - viewDrag.startY) * referenceSetupCanvas.height / rect.height);
      renderReferenceSetup(); event.preventDefault(); return;
    }
    const drag = referenceSetup.drag; if (!drag || referenceSetup.mode === 'manual') return;
    const point = referenceSetupPoint(event); const dx = point.x - drag.start.x; const dy = point.y - drag.start.y; const image = referenceSetup.image; const min = Math.min(32, image.width, image.height);
    if (drag.kind === 'move') {
      referenceSetup.crop = clampReferenceCrop({ ...drag.crop, x: drag.crop.x + dx, y: drag.crop.y + dy });
    } else if (drag.kind === 'new') {
      referenceSetup.crop = clampReferenceCrop({ x: Math.min(drag.start.x, point.x), y: Math.min(drag.start.y, point.y), width: Math.max(min, Math.abs(dx)), height: Math.max(min, Math.abs(dy)) });
    } else {
      let left = drag.crop.x; let top = drag.crop.y; let right = drag.crop.x + drag.crop.width; let bottom = drag.crop.y + drag.crop.height;
      if (drag.handle.includes('l')) left = Math.min(point.x, right - min); else right = Math.max(point.x, left + min);
      if (drag.handle.includes('t')) top = Math.min(point.y, bottom - min); else bottom = Math.max(point.y, top + min);
      left = Math.max(0, left); top = Math.max(0, top); right = Math.min(image.width, right); bottom = Math.min(image.height, bottom);
      referenceSetup.crop = clampReferenceCrop({ x: left, y: top, width: right - left, height: bottom - top });
    }
    renderReferenceSetup(); event.preventDefault();
  }

  function referenceSetupDragEnd(event) { if (referenceSetup.drag) referenceSetup.drag = null; if (referenceSetup.viewDrag && referenceSetup.viewDrag.pointerId === event.pointerId) referenceSetup.viewDrag = null; if (referenceSetupCanvas.releasePointerCapture && referenceSetupCanvas.hasPointerCapture && referenceSetupCanvas.hasPointerCapture(event.pointerId)) referenceSetupCanvas.releasePointerCapture(event.pointerId); }

  function applyManualReferenceScale() {
    const points = referenceSetup.manualPoints; const feet = Number(referenceSetupDistance && referenceSetupDistance.value); const pixels = points.length === 2 ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) : 0;
    if (!Number.isFinite(feet) || feet <= 0 || pixels <= 0) { window.alert('Choose two different points, then enter a positive distance in feet.'); return; }
    referenceSetup.scale = { feet, pixels, source: 'manual' }; referenceSetup.mode = 'frame';
    if (referenceSetupApply) referenceSetupApply.disabled = false; if (referenceSetupStatus) referenceSetupStatus.textContent = `Manual scale set: ${feet} ft between the yellow points.`;
  }

  function applyDirectReferenceScale() {
    const pixels = Number(referenceSetupPixelsPerFoot && referenceSetupPixelsPerFoot.value);
    if (!Number.isFinite(pixels) || pixels <= 0) { window.alert('Enter a positive image pixels-per-foot value.'); return; }
    referenceSetup.scale = { feet: 1, pixels, source: 'manual-direct' }; referenceSetup.mode = 'frame';
    if (referenceSetupApply) referenceSetupApply.disabled = false;
    if (referenceSetupStatus) referenceSetupStatus.textContent = `Manual scale set: ${Math.round(pixels * 100) / 100} image pixels per foot.`;
    renderReferenceSetup();
  }

  function armPlacementTool(payload, sourceButton) {
    if (!payload) {
      setActiveTool('select');
      return;
    }
    if ((payload.kind === 'venue' || payload.kind === 'tentSetup') && !hasUnlockedVenueLayer()) {
      window.alert('Venue editing is locked. Use the Venue button in the toolbar to unlock venues.');
      return;
    }
    if (payload.kind === 'tentAddon' && !hasUnlockedVenueLayer()) {
      showPlannerToast('Venue layer is locked. Unlock it to add or edit tent add-ons.');
      return;
    }
    const sameTool = activeTool === 'place' && activePlacementButton === sourceButton;
    if (sameTool) {
      setActiveTool('select');
      return;
    }
    clearPlacementState();
    clearSelection();
    placementPayload = payload;
    activePlacementButton = sourceButton || null;
    placementRotation = 0;
    placementPreview = createPlacementPreview(payload);
    if (placementPreview) {
      uiGroup.add(placementPreview);
      placementPreview.moveToTop();
    }
    activeTool = 'place';
    worldGroup.draggable(false);
    syncToolStateUI();
    updatePlacementPreview();
  }

  function armPipeDrapePlacement(tool, button) {
    closePipeDrapeEdit();
    armPlacementTool({ kind: 'pipeDrapeChain', ...tool, label: tool.name, rawData: tool }, button);
  }

  function placeStageAddonOnStage(stage, point) {
    if (!(placementPayload && placementPayload.kind === 'stageAddon')) return;
    const layer = resolvePlacementLayer('item'); const group = layer && getLayerGroup(layer.id);
    if (!group) return;
    const node = createStageAddonNode(placementPayload, stage, point); if (!node) { showPlannerToast('Choose an open panel edge with enough length for this add-on.'); return; }
    setNodeLayerId(node, layer.id); group.add(node); ensureLayerOrder(); refreshInventoryPanelUI(); worldLayer.draw(); setDirty(true);
  }

  function resumeBistroLightRun(node) {
    if (!(node && node.getAttr && node.getAttr('customType') === 'drawnRun' && node.getAttr('drawMode') === 'bistro')) return;
    const points = bistroRunWorldPoints(node); if (points.length < 2) return;
    armPlacementTool({ kind: 'drawnRun', drawMode: 'bistro', color: node.getAttr('addonColor') || '#f1c75b', rawData: { drawMode: 'bistro', inventoryName: node.getAttr('inventoryName') || 'Standalone Bistro Lights', category: node.getAttr('inventoryCategory') || 'lighting', color: node.getAttr('addonColor') || '#f1c75b' } }, null);
    drawnRunDraft = { points, anchors: normalizedLightPostAnchors(node), preview: null, node }; node.hide(); renderDrawnRunDraft(worldGroup.getRelativePointerPosition() || points[points.length - 1]);
    showPlannerToast('Continue the light run. Shift-click undoes the latest point; double-click finishes.');
  }

  function resumePipeDrapeChain(node) {
    if (!(node && node.getAttr && node.getAttr('customType') === 'pipeDrapeChain')) return;
    const tool = { id: node.getAttr('crossbarId'), name: node.getAttr('crossbarName'), min: Number(node.getAttr('crossbarMinFt')), max: Number(node.getAttr('crossbarMaxFt')), heightFt: Number(node.getAttr('heightFt')) || 10 };
    const points = pipeDrapeWorldPoints(node);
    armPipeDrapePlacement(tool, null);
    pipeDrapeDraft = { points, preview: null, node };
    node.hide();
    renderPipeDrapeDraft(worldGroup.getRelativePointerPosition() || points[points.length - 1]);
    showPlannerToast('Continue from the last base. Shift-click undoes the latest point; double-click finishes.');
  }

  async function placeArmedObjectAtCurrentPointer(pointerOverride = null) {
    return dispatchArmedPlacement({ getActiveTool: () => activeTool, getPayload: () => placementPayload, getPlacementRotation: () => placementRotation, getPlacementPoint: () => pointerOverride, worldGroup, snapPosition, resolvePlacementLayer, getLayerGroup, createVenue, createFlooring, createItem, createGroupedSeatingLayout, createLayoutGroup, placeTentSetup, setNodeLayerId, getGroupedSeatingEditNode: () => groupedSeatingEditNode, clearGroupedSeatingEdit: clearChairRowsEditState, automaticLabelMeta, addAttachedLabelForNode, ensureLayerOrder, syncToolStateUI, renderLayersPanel, refreshInventoryPanelUI, worldLayer, setDirty, updatePlacementPreview });
  }

  function buildPlacementPayloadFromInventoryButton(btn) {
    return placementPayloadFromInventoryButton(btn, FEET_TO_PX);
  }

  function initStage() {
    stage = new Konva.Stage({
      container: stageContainer,
      width: stageContainer.offsetWidth,
      height: stageContainer.offsetHeight,
    });

    // One layer with a world group so view transforms are unified
    worldLayer = new Konva.Layer();
    stage.add(worldLayer);

    worldGroup = new Konva.Group({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, draggable: false });
    worldLayer.add(worldGroup);

    // Internal groups
    gridGroup = new Konva.Group({ name: 'gridGroup' });
    layerRootGroup = new Konva.Group({ name: 'layerRootGroup' });
    uiGroup = new Konva.Group({ name: 'uiGroup' });

    worldGroup.add(gridGroup);
    worldGroup.add(layerRootGroup);
    worldGroup.add(uiGroup);

    userLayers = ensureBaseLayers(defaultLayers());
    activeLayerId = 'items-base';
    ensureLayerGroups();

    // Selection transformer (lives in UI group)
    transformer = new Konva.Transformer({
      nodes: [],
      rotateEnabled: true,
      resizeEnabled: false,
      keepRatio: true,
      ignoreStroke: true,
      // Give the selection frame a transparent hit area. This lets a user
      // press anywhere inside the outlined selection to move it, rather than
      // having to find an exposed piece of the underlying artwork.
      shouldOverdrawWholeArea: true,
      boundBoxFunc: (oldBox, newBox) => {
        if (newBox.width < 5 || newBox.height < 5) return oldBox;
        return newBox;
      },
    });
    uiGroup.add(transformer);
    transformer.on('dblclick dbltap click', (event) => {
      if (activeTool !== 'select') return;
      if (String(event && event.type || '') === 'click' && Number(event.evt && event.evt.detail) !== 2) return;
      const selected = selectedItems.length === 1 ? selectedItems[0] : null;
      if (!selected || !editDoubleClickTarget(selected)) return;
      if (event.evt && event.evt.preventDefault) event.evt.preventDefault();
      event.cancelBubble = true;
    });

    // Rotation snapping toggled by Snap switch
    updateRotationSnap();

    // Selection marquee (UI group)
    selectionRect = new Konva.Rect({
      fill: 'rgba(13,110,253,0.15)',
      stroke: 'rgba(13,110,253,0.5)',
      visible: false,
    });
    uiGroup.add(selectionRect);

    // print frame removed

    drawGrid();
    ensureLayerOrder();

    // Wheel zoom
    stage.on('wheel', (e) => {
      e.evt.preventDefault();
      const oldScale = worldGroup.scaleX();
      const pointer = stage.getPointerPosition();
      const mousePointTo = { x: (pointer.x - worldGroup.x()) / oldScale, y: (pointer.y - worldGroup.y()) / oldScale };
      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const scaleBy = 1.05;
      let newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
      newScale = Math.max(MIN_SCALE, Math.min(newScale, MAX_SCALE));
      worldGroup.scale({ x: newScale, y: newScale });
      const newPos = { x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale };
      worldGroup.position(newPos);
      worldLayer.batchDraw();
    });

    // Middle-mouse (wheel) drag panning on the stage container.
    // Use raw DOM events so we don't interfere with Konva selection logic.
    try {
      let mmPanning = false;
      let mmLast = { x: 0, y: 0 };
      const content = stage.content; // DOM element
      content.addEventListener('mousedown', (ev) => {
        if (ev.button === 1) { // middle mouse button
          mmPanning = true;
          mmLast = { x: ev.clientX, y: ev.clientY };
          content.style.cursor = 'grabbing';
          ev.preventDefault();
        }
      });
      content.addEventListener('mousemove', (ev) => {
        if (!mmPanning) return;
        const dx = ev.clientX - mmLast.x;
        const dy = ev.clientY - mmLast.y;
        worldGroup.x(worldGroup.x() + dx);
        worldGroup.y(worldGroup.y() + dy);
        mmLast = { x: ev.clientX, y: ev.clientY };
        worldLayer.batchDraw();
      });
      window.addEventListener('mouseup', (ev) => {
        if (mmPanning && ev.button === 1) {
          mmPanning = false;
          content.style.cursor = '';
        }
      });
    } catch (e) {
      // if stage.content isn't available or event binding fails, ignore
    }

    // Resize
    window.addEventListener('resize', debounce(() => {
      stage.size({ width: stageContainer.offsetWidth, height: stageContainer.offsetHeight });
      worldLayer.draw();
    }, 100));

    // Background interactions: placement, pan, and drag-selection
    let selectionStart = null;
    let selectionBox = null;
    let pointerPanStart = null;
    let worldPanStart = null;
    stage.on('mousedown touchstart', (e) => {
      // ignore middle-button presses here (we use middle-button for panning via DOM handlers)
      if (e && e.evt && typeof e.evt.button !== 'undefined' && e.evt.button === 1) return;
      // Pan is a canvas-wide navigation tool. Handle it before item placement
      // or selection so a touch on an item cannot trap the canvas.
      if (activeTool === 'pan') {
        if (e.evt && e.evt.touches && e.evt.touches.length > 1) return;
        const p = stage.getPointerPosition();
        if (!p) return;
        pointerPanStart = { x: p.x, y: p.y };
        worldPanStart = { x: worldGroup.x(), y: worldGroup.y() };
        document.body.classList.add('is-panning');
        if (stage.content) stage.content.classList.add('is-panning');
        if (stageContainer) stageContainer.classList.add('is-panning');
        return;
      }
      const touchPoint = plannerWorldPointFromDomEvent(e.evt) || worldGroup.getRelativePointerPosition();
      if (moveTouchAddonPreview(e.evt, touchPoint)) {
        e.cancelBubble = true;
        return;
      }
      if (isSyntheticPlacementMouseEvent(e.evt)) {
        e.cancelBubble = true;
        return;
      }
      if (usesCursorPlacementPreview()) {
        const placementPoint = plannerWorldPointFromDomEvent(e.evt) || worldGroup.getRelativePointerPosition();
        if (handleTouchPreviewPlacement(e.evt, placementPoint)) {
          e.cancelBubble = true;
          return;
        }
      }
      if (venueBuilder.open && venueBuilder.mode) {
        if (e.target && e.target.hasName && e.target.hasName('venueBuilderVertex')) return;
        const builderPoint = worldGroup.getRelativePointerPosition();
        if (builderPoint) {
          e.evt.preventDefault();
          handleVenueBuilderStagePoint(builderPoint);
          return;
        }
      }
      if (isCustomBistroPlacement()) {
        const point = worldGroup.getRelativePointerPosition();
        if (point) {
          e.evt.preventDefault();
          e.cancelBubble = true;
          handleCustomBistroPoint(point, e.evt && e.evt.detail ? e.evt.detail : 1, !!(e.evt && e.evt.shiftKey));
        }
        return;
      }
      if (isPipeDrapePlacement()) {
        const point = worldGroup.getRelativePointerPosition();
        if (point) { e.evt.preventDefault(); e.cancelBubble = true; handlePipeDrapePoint(point, e.evt && e.evt.detail ? e.evt.detail : 1, !!(e.evt && e.evt.shiftKey)); }
        return;
      }
      if (isFencePlacement()) {
        const point = worldGroup.getRelativePointerPosition();
        if (point) { e.evt.preventDefault(); e.cancelBubble = true; handleFencePoint(point, e.evt && e.evt.detail ? e.evt.detail : 1, !!(e.evt && e.evt.shiftKey)); }
        return;
      }
      if (isDrawnRunPlacement()) {
        const point = worldGroup.getRelativePointerPosition();
        if (point) { e.evt.preventDefault(); e.cancelBubble = true; handleDrawnRunPoint(point, e.evt && e.evt.detail ? e.evt.detail : 1, !!(e.evt && e.evt.shiftKey)); }
        return;
      }
      if (isBulkLegPlacement()) {
        const point = worldGroup.getRelativePointerPosition();
        if (point) {
          e.evt.preventDefault();
          e.cancelBubble = true;
          beginBulkLegPlacement(point);
        }
        return;
      }
      if (activeTool === 'place' && placementPayload && placementPayload.kind === 'tentAddon') {
        const addonPoint = placementPreviewPoint || plannerWorldPointFromDomEvent(e.evt) || worldGroup.getRelativePointerPosition();
        const freePlacement = !!(e.evt && e.evt.shiftKey);
        if (placementPayload.addonType === 'weight' && freePlacement && addonPoint) {
          e.evt.preventDefault(); e.cancelBubble = true;
          placeFreeWeightAt(addonPoint);
          return;
        }
        const tent = addonPoint ? closestTentForAddonPlacement(addonPoint, 3) : null;
        if (tent) {
          e.evt.preventDefault();
          e.cancelBubble = true;
          placeTentAddonOnTent(tent, addonPoint, { freePlacement });
        }
        return;
      }
      if (activeTool === 'place' && placementPayload && placementPayload.kind === 'stageAddon') {
        e.evt.preventDefault(); e.cancelBubble = true;
        const point = placementPreviewPoint || worldGroup.getRelativePointerPosition();
        const width = placementPayload.addonType === 'Adjustable Stairs' || placementPayload.addonType === 'Stage Railing 4ft' ? 4 : 2;
        const match = closestStageForAddonPlacement(point, width);
        if (match && isSelectableNode(match.node)) placeStageAddonOnStage(match.node, point);
        return;
      }
      if (activeTool === 'place' && placementPayload && placementPayload.kind === 'roomAttachment') {
        e.evt.preventDefault(); e.cancelBubble = true;
        placeRoomWallAttachment(placementPreviewPoint || currentWorldPointer(), placementPayload.attachmentType);
        return;
      }
      if (activeTool === 'place' && placementPayload && placementPayload.kind === 'chairRowsAisle') {
        e.evt.preventDefault(); e.cancelBubble = true;
        const point = plannerWorldPointFromDomEvent(e.evt) || worldGroup.getRelativePointerPosition();
        const group = chairRowsGroupAtPoint(point);
        if (!group) return;
        const candidate = chairRowsAisleCandidate(group, point);
        if (!candidate) return;
        addChairRowsAisle(group, candidate);
        updatePlacementPreview(point);
        return;
      }
      const t = e.target;
      const isBg =
        t === stage ||
        t.hasName('gridLine') ||
        t.hasName('gridGroup') ||
        (t.getParent && t.getParent().hasName && t.getParent().hasName('gridGroup'));
      if (!isBg && activeTool !== 'place') return; // don't start marquee over shapes

      if (activeTool === 'place') {
        if (isPipeDrapePlacement()) { updatePlacementPreview(); return; }
        if (isFencePlacement()) { updatePlacementPreview(); return; }
        if (isDrawnRunPlacement()) { updatePlacementPreview(); return; }
        e.evt.preventDefault();
        placeArmedObjectAtCurrentPointer(placementPreviewPoint || plannerWorldPointFromDomEvent(e.evt) || worldGroup.getRelativePointerPosition());
        return;
      }

      if (activeTool === 'label') {
        e.evt.preventDefault();
        const pointer = worldGroup.getRelativePointerPosition();
        if (!pointer) return;
        if (labelPlacementDraft) { placeCanvasLabelDraft(pointer); return; }
        beginLabelPlacementTool();
        return;
      }

      // ✅ use world coordinates (respect pan/zoom/rotate)
      const p = worldGroup.getRelativePointerPosition();
      if (!p) return;
      selectionStart = { x: p.x, y: p.y };
      selectionBox = { x: p.x, y: p.y, width: 0, height: 0 };

      clearSelection();
      selectionRect.position(selectionStart);  // uiGroup is under worldGroup, so this matches
      selectionRect.size({ width: 0, height: 0 });
      selectionRect.show();
      worldLayer.batchDraw();
    });

    stage.on('dblclick dbltap', (e) => {
      if (confirmTouchAddonPreview()) {
        if (e.evt) e.evt.preventDefault();
        e.cancelBubble = true;
        return;
      }
      if (!isCustomBistroPlacement()) return;
      if (e.evt) e.evt.preventDefault();
      e.cancelBubble = true;
      // The second mousedown carries click detail and finishes an active run.
      // Keeping this event quiet prevents the action firing twice.
    });

    const routeGroupDoubleActivation = (e) => {
      if (activeTool !== 'select') return;
      if (String(e && e.type || '') === 'click' && Number(e.evt && e.evt.detail) !== 2) return;
      if (editDoubleClickTarget(e && e.target)) {
        if (e.evt && e.evt.preventDefault) e.evt.preventDefault();
        e.cancelBubble = true;
      }
    };
    stage.on('dblclick dbltap click', routeGroupDoubleActivation);

    stage.on('mousemove touchmove', (e) => {
      if (usesTouchAddonPreview() && touchAddonPreviewActive && isTouchPlacementEvent(e && e.evt)) {
        const point = plannerWorldPointFromDomEvent(e.evt) || worldGroup.getRelativePointerPosition();
        if (point) updatePlacementPreview(point);
        if (e.evt && e.evt.preventDefault) e.evt.preventDefault();
        e.cancelBubble = true;
        return;
      }
      if (activeTool === 'pan' && pointerPanStart && worldPanStart) {
        const p = stage.getPointerPosition();
        if (!p) return;
        worldGroup.position({
          x: worldPanStart.x + (p.x - pointerPanStart.x),
          y: worldPanStart.y + (p.y - pointerPanStart.y),
        });
        worldLayer.batchDraw();
        return;
      }

      if (activeTool === 'place') {
        if (isBulkLegPlacement() && bulkLegPlacement.start) {
          const point = worldGroup.getRelativePointerPosition();
          if (!point) return;
          const box = bulkLegBox(bulkLegPlacement.start, point);
          bulkLegPlacement.box = box;
          selectionRect.position({ x: box.x, y: box.y });
          selectionRect.size({ width: box.width, height: box.height });
          selectionRect.show();
          renderBulkLegPreview();
          worldLayer.batchDraw();
          return;
        }
        const point = placementPayload && placementPayload.kind === 'chairRowsAisle'
          ? (plannerWorldPointFromDomEvent(e.evt) || worldGroup.getRelativePointerPosition())
          : null;
        updatePlacementPreview(point);
        return;
      }

      if (activeTool === 'label') {
        const worldPoint = worldGroup.getRelativePointerPosition();
        if (labelPlacementDraft && worldPoint) renderLabelPlacementPreview(worldPoint);
        const pointer = stage.getPointerPosition(); let target = pointer ? stage.getIntersection(pointer) : null;
        while (target && target !== stage && !(target.getAttr && target.getAttr('customType'))) target = target.getParent ? target.getParent() : null;
        if (target && target.getAttr && target.getAttr('customType') !== 'label' && isSelectableNode(target)) showLabelAttachmentPreview(target);
        else clearLabelAttachmentPreview();
        return;
      }

      if (!selectionStart) return;

      // ✅ keep tracking in worldGroup space
      const p = worldGroup.getRelativePointerPosition();
      if (!p) return;

      const x = Math.min(selectionStart.x, p.x);
      const y = Math.min(selectionStart.y, p.y);
      const w = Math.abs(p.x - selectionStart.x);
      const h = Math.abs(p.y - selectionStart.y);

      selectionRect.position({ x, y });
      selectionRect.size({ width: w, height: h });
      selectionBox = { x, y, width: w, height: h };
      worldLayer.batchDraw();
    });

    // Room wall previews must continue updating even when a room's Konva hit
    // surface consumes the pointer event. This mirrors the always-live host
    // preview behavior used by attached tent add-ons.
    const updateRoomAttachmentPreviewFromEvent = (event) => {
      if (activeTool === 'place' && placementPayload && placementPayload.kind === 'roomAttachment') {
        if (stage && stage.setPointersPositions) stage.setPointersPositions(event);
        updatePlacementPreview(roomAttachmentPointerFromEvent(event));
      }
    };
    const updateTentAddonPreviewFromEvent = (event) => {
      if (!(activeTool === 'place' && placementPayload && placementPayload.kind === 'tentAddon')) return;
      // Read the DOM event in capture phase, before a tent's hit surface can
      // consume it. Transforming the native coordinates directly avoids the
      // stale Konva pointer cache that made the fan ghost appear to stick.
      shiftPressed = !!event.shiftKey;
      const pointer = plannerWorldPointFromDomEvent(event);
      if (pointer) updatePlacementPreview(pointer);
    };
    if (stageContainer) {
      // This must run before Konva's canvas listener. In bubble phase a
      // room hit target can consume the event, leaving placement with only
      // the later click position and no hover preview.
      stageContainer.addEventListener('mousemove', updateRoomAttachmentPreviewFromEvent, true);
      stageContainer.addEventListener('pointermove', updateRoomAttachmentPreviewFromEvent, true);
      stageContainer.addEventListener('mousemove', updateTentAddonPreviewFromEvent, true);
      stageContainer.addEventListener('pointermove', updateTentAddonPreviewFromEvent, true);
    }


    stage.on('mouseup touchend', () => {
      if (activeTool === 'pan' && pointerPanStart) {
        pointerPanStart = null;
        worldPanStart = null;
        document.body.classList.remove('is-panning');
        if (stage.content) stage.content.classList.remove('is-panning');
        if (stageContainer) stageContainer.classList.remove('is-panning');
        worldLayer.batchDraw();
        return;
      }

      if (isBulkLegPlacement() && bulkLegPlacement.start) {
        const start = bulkLegPlacement.start;
        const end = worldGroup.getRelativePointerPosition() || start;
        const box = bulkLegBox(start, end);
        const dragged = box.width >= 4 || box.height >= 4;
        const data = placementPayload && placementPayload.rawData;
        clearBulkLegPlacement();
        if (!data) return;
        if (!dragged) {
          const tent = closestTentForAddonPlacement(start, 3);
          if (tent) placeTentAddonOnTent(tent, start);
          return;
        }
        let placed = 0;
        bulkLegTargets(box).forEach(({ tent, legIndex, point }) => {
          if (sameTentAddonAtLeg(tent, legIndex, data)) return;
          if (addTentAddonOnTent(tent, point, data)) placed += 1;
        });
        if (placed) {
          ensureLayerOrder(); setDirty(true); refreshInventoryPanelUI(); renderLayersPanel();
        }
        // A bulk pass is still the same armed inventory item, so leave it
        // active for another run instead of forcing the user back to Inventory.
        updatePlacementPreview(); worldLayer.batchDraw();
        return;
      }

      if (!selectionStart) return;

      const box = selectionBox;
      selectionRect.hide();
      selectionStart = null;
      selectionBox = null;

      selectedItems = [];

      const rectToWorld = (node) => {
        if (!node || !node.getClientRect) return null;
        try {
          return node.getClientRect({ relativeTo: worldGroup });
        } catch (err) {
          return null;
        }
      };

      if (!box || (box.width < 2 && box.height < 2)) {
        updateTransformer();
        worldLayer.batchDraw();
        return;
      }

      const handleCandidate = (node) => {
        if (!node || !node.getAttr || !node.getAttr('selectable')) return;
        const rect = rectToWorld(node);
        if (!rect || !box) return;
        const intersects = !(
          rect.x > box.x + box.width ||
          rect.x + rect.width < box.x ||
          rect.y > box.y + box.height ||
          rect.y + rect.height < box.y
        );
        if (intersects) selectedItems.push(node);
      };

      getEligibleNodes().forEach(handleCandidate);

      updateTransformer();
      worldLayer.batchDraw();
    });


    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      const tg = document.activeElement;
      const tag = tg && tg.tagName ? tg.tagName.toUpperCase() : '';
      const editable = tg && (tg.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT');
      if (e.key === 'Shift') {
        shiftPressed = true;
        if (!editable && snapToGrid) {
          captureSnapAnchorFromPointer();
          updatePlacementPreview();
        }
      }
      if (!editable && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redoPlannerAction(); else undoPlannerAction();
      }
      if (!editable && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); handleCopy(); }
      if (!editable && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { e.preventDefault(); handlePaste(); }
      if (!editable && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); handleDelete(); }
      if (!editable && e.key === 'Escape') {
        e.preventDefault();
        if (placementPayload && placementPayload.kind === 'chairRowsAisle') {
          setActiveTool('select');
        } else if (isPipeDrapePlacement() && pipeDrapeDraft.points.length) {
          finishPipeDrapeChain();
          setActiveTool('select');
        } else if (isFencePlacement() && fenceDraft.points.length) {
          finishFenceChain();
          setActiveTool('select');
        } else if (isDrawnRunPlacement() && drawnRunDraft.points.length >= 2) {
          handleDrawnRunPoint(worldGroup.getRelativePointerPosition() || drawnRunDraft.points[drawnRunDraft.points.length - 1], 2);
          setActiveTool('select');
        } else if (isCustomBistroPlacement() && customBistroDraft.points.length) {
          finishCustomBistroString();
        } else {
          clearSelection(); setActiveTool('select');
        }
      }
      if (!editable && e.key === 'Enter' && pipeDrapeEdit.node) { e.preventDefault(); closePipeDrapeEdit(); }
      if (!editable && e.key.toLowerCase() === 's' && !(e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        snapToGrid = !snapToGrid;
        if (snapToggle) snapToggle.checked = snapToGrid;
        if (!snapToGrid) clearSnapAnchor();
        try { localStorage.setItem('snapToGrid', snapToGrid ? '1' : '0'); } catch { }
        updateRotationSnap();
        updatePlacementPreview();
        updateSnapToolbarButton();
        setDirty(true);
      }
      if (!editable && e.key.toLowerCase() === 'v' && !(e.ctrlKey || e.metaKey)) { e.preventDefault(); setActiveTool('select'); }
      if (!editable && e.key.toLowerCase() === 'h' && !(e.ctrlKey || e.metaKey)) { e.preventDefault(); setActiveTool('pan'); }
      if (!editable && e.key.toLowerCase() === 'l' && !(e.ctrlKey || e.metaKey)) { e.preventDefault(); setActiveTool(activeTool === 'label' ? 'select' : 'label'); }
      if (!editable && e.key.toLowerCase() === 'r' && !(e.ctrlKey || e.metaKey) && activeTool === 'place') {
        e.preventDefault();
        if (placementPayload && placementPayload.kind === 'roomAttachment') {
          placementPayload.swing = placementPayload.swing === 'outward' ? 'inward' : 'outward';
          updatePlacementPreview();
          updateModeHint();
          return;
        }
        placementRotation = (placementRotation + 45) % 360;
        updatePlacementPreview();
        updateModeHint();
      }
      // Arrow keys: pan the canvas. Ignore when typing in an input/select/textarea or contentEditable.
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (!editable) {
          e.preventDefault();
          // inverted directions to match nav arrows behavior
          if (e.key === 'ArrowUp') navPan(0, -40);
          else if (e.key === 'ArrowDown') navPan(0, 40);
          else if (e.key === 'ArrowLeft') navPan(-40, 0);
          else if (e.key === 'ArrowRight') navPan(40, 0);
        }
      }
    });
    document.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') {
        shiftPressed = false;
        clearSnapAnchor();
        updatePlacementPreview();
      }
    });
  }

  function drawGrid() {
    gridGroup.destroyChildren();
    if (!showGrid) { worldLayer.draw(); return; }
    const extent = 5000;
    // Use distinct stroke colors for dark vs light mode to improve visibility.
    // Dark mode: lighter gray lines; Light mode: slightly darker gray lines.
    const strokeColor = darkMode ? '#6c6c6c' : '#bfbfbf';
    const bgColor = darkMode ? '#212529' : '#ffffff';
    if (stageContainer) stageContainer.style.background = bgColor;
    // Grid Size controls the displayed grid. Its origin must match snapping's
    // world origin so the visible intersections are real snap coordinates.
    const pxGrid = Math.max(1, Math.floor(gridSize * FEET_TO_PX));
    // Make lines more visible by increasing strokeWidth and disabling stroke scaling
    // so they remain consistent regardless of zoom level.
    const baseStroke = 1; // px
    const bounds = gridBounds ? { minX: gridBounds.x, minY: gridBounds.y, maxX: gridBounds.x + gridBounds.width, maxY: gridBounds.y + gridBounds.height } : { minX: -extent, minY: -extent, maxX: extent, maxY: extent };
    const startX = Math.floor(bounds.minX / pxGrid) * pxGrid;
    const startY = Math.floor(bounds.minY / pxGrid) * pxGrid;

    for (let x = startX, i = 0; x <= bounds.maxX; x += pxGrid, i++) {
      const isMajor = (i % 5) === 0;
      const line = new Konva.Line({
        points: [x, bounds.minY, x, bounds.maxY],
        stroke: isMajor ? strokeColor : strokeColor,
        strokeWidth: isMajor ? baseStroke + 0.6 : baseStroke,
        listening: true,
        name: 'gridLine'
      });
      // Keep stroke pixel-perfect during zoom
      try { line.strokeScaleEnabled(false); } catch (e) { }
      gridGroup.add(line);
    }
    for (let y = startY, j = 0; y <= bounds.maxY; y += pxGrid, j++) {
      const isMajor = (j % 5) === 0;
      const line = new Konva.Line({
        points: [bounds.minX, y, bounds.maxX, y],
        stroke: isMajor ? strokeColor : strokeColor,
        strokeWidth: isMajor ? baseStroke + 0.6 : baseStroke,
        listening: true,
        name: 'gridLine'
      });
      try { line.strokeScaleEnabled(false); } catch (e) { }
      gridGroup.add(line);
    }
    worldLayer.draw();
  }

  function fitGridToReference(node) {
    if (!node || !node.getClientRect || !worldGroup) return;
    const rect = node.getClientRect({ relativeTo: worldGroup, skipStroke: true });
    const padding = Math.max(gridSize * FEET_TO_PX * 2, FEET_TO_PX * 2);
    gridBounds = { x: rect.x - padding, y: rect.y - padding, width: rect.width + padding * 2, height: rect.height + padding * 2 };
    node.setAttr('referenceGridFitted', true); drawGrid(); setDirty(true);
  }

  function clearSelection() {
    selectedItems = [];
    selectedCustomBistroString = null;
    if (customBistroStringHighlight) customBistroStringHighlight.destroy();
    customBistroStringHighlight = null;
    transformer.nodes([]);
    hideLabelGear();
    updateToolButtons();
    worldLayer.draw();
  }

  function updateTransformer() {
    const filtered = selectedItems.filter((shape) => isSelectableNode(shape));
    selectedItems = filtered;
    transformer.nodes(filtered);
    const selectedReference = filtered.length === 1 && filtered[0].getAttr && filtered[0].getAttr('customType') === 'referenceImage';
    const selectedSidewall = filtered.length === 1 && filtered[0].getAttr && filtered[0].getAttr('customType') === 'tentAddon' && filtered[0].getAttr('addonType') === 'sidewall';
    const selectedAttachedLabel = filtered.length === 1 && filtered[0].getAttr && filtered[0].getAttr('customType') === 'label' && filtered[0].getAttr('labelMode') === 'attached';
    transformer.resizeEnabled(selectedReference);
    transformer.keepRatio(selectedReference);
    transformer.enabledAnchors(selectedReference ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'] : []);
    transformer.rotateEnabled(!selectedSidewall && !selectedAttachedLabel);
    updateRotationSnap();
    hideLabelGear();
    updateToolButtons();
    worldLayer.draw();
  }

  function updateRotationSnap() {
    if (!transformer) return;
    if (!snapToGrid) {
      transformer.rotationSnaps([]);
      return;
    }
    transformer.rotationSnaps(Array.from({ length: 24 }, (_, idx) => idx * 15));
    if (transformer.rotationSnapTolerance) transformer.rotationSnapTolerance(5);
  }

  function snapNodeToGrid(node) {
    if (!snapToGrid || !node || !node.position) return;
    const snapped = snapPosition(node.position());
    node.position(snapped);
  }

  function snapSelectionToGrid(anchor = dragAnchorNode) {
    if (!snapToGrid || !selectedItems.length || !anchor || !anchor.position) return;
    const current = anchor.position();
    const snapped = snapPosition(current);
    const dx = snapped.x - current.x;
    const dy = snapped.y - current.y;
    // A multi-selection moves as one rigid unit. Snapping each node separately
    // changes the spacing between items whenever their individual rounding
    // differs, so translate the complete dragged set by one snap delta instead.
    const movedNodes = initialPosMap.size ? Array.from(initialPosMap.keys()) : selectedItems;
    movedNodes.forEach((node) => {
      if (!node || !node.position) return;
      const position = node.position();
      node.position({ x: position.x + dx, y: position.y + dy });
    });
  }

  function handleCopy() {
    clipboard = [];
    const seen = new Set();
    const copiedTentIds = new Set();
    selectedItems.forEach((shape) => {
      if (!(shape && shape.getAttr && shape.getAttr('customType') === 'venue' && shape.getAttr('venueType') === 'tent')) return;
      const id = ensureNodeId(shape, 'venue');
      if (copiedTentIds.has(id)) return;
      copiedTentIds.add(id);
      clipboard.push({ clipboardKind: 'tentSetup', sourceNodeId: id, config: buildTentSetupConfig(shape, shape.getAttr('tentSetupName') || ''), x: shape.x(), y: shape.y(), rotation: shape.rotation ? shape.rotation() : 0 });
    });
    const pushClone = (shape) => {
      if (shape && shape.getAttr && shape.getAttr('customType') === 'tentAddon' && copiedTentIds.has(shape.getAttr('parentTentNodeId'))) return;
      if (shape && shape.getAttr && shape.getAttr('customType') === 'venue' && shape.getAttr('venueType') === 'tent') return;
      const nodeId = shape && shape.getAttr ? shape.getAttr('nodeId') : '';
      if (nodeId && seen.has(nodeId)) return;
      if (nodeId) seen.add(nodeId);
      clipboard.push(shape.clone({}));
    };
    const copyWithRelatedNodes = (shape) => {
      pushClone(shape);
      if (isStandaloneBistroRun(shape)) linkedLightPosts(shape).forEach(pushClone);
      const nodeId = shape && shape.getAttr ? shape.getAttr('nodeId') : '';
      if (!nodeId) return;
      findAttachedLabels(nodeId).forEach(pushClone);
    };
    selectedItems.forEach(copyWithRelatedNodes);
    selectedItems.filter((shape) => shape && shape.getAttr && shape.getAttr('customType') === 'venue' && shape.getAttr('venueType') === 'tent').forEach((tent) => {
      forEachNode((node) => {
        if (!(node && node !== tent && node.getAttr)) return;
        const type = node.getAttr('customType');
        if (type === 'venue' || type === 'tentAddon' || type === 'referenceImage') return;
        if (tentPointIsInside(tent, tentLocalPoint(tent, getNodeCenter(node)))) copyWithRelatedNodes(node);
      });
    });
  }

  // Paste creates independent items. A saved Layout Group remains a group because
  // its source node is already a deliberate layout-group object.
  async function handlePaste() {
    if (!clipboard.length) return;

    const offset = 20;
    const nodeIdMap = new Map();
    clearSelection();
    const newSelection = [];

    for (const src of clipboard) {
      if (src && src.clipboardKind === 'tentSetup') {
        const placed = placeTentSetup(src.config, { x: src.x + offset, y: src.y + offset, rotation: src.rotation || 0, tentSetupName: src.config && src.config.tent && src.config.tent.tentSetupName });
        if (placed) {
          if (src.sourceNodeId) nodeIdMap.set(src.sourceNodeId, placed.tent.getAttr('nodeId'));
          newSelection.push(placed.tent);
        }
        continue;
      }
      const baseX = src.x() + offset;
      const baseY = src.y() + offset;
      const rotation = src.rotation ? src.rotation() : 0;
      const sourceLayer = getLayer(src.getAttr && src.getAttr('layerId'));
      const targetKind = src.getAttr && src.getAttr('customType') === 'venue'
        ? 'venue'
        : (src.getAttr && src.getAttr('customType') === 'label' ? 'label' : (src.getAttr && src.getAttr('customType') === 'drawnRun' ? 'decor' : (src.getAttr && src.getAttr('isFlooring') && src.getAttr('floorCategory') === 'subfloor' ? 'subfloor' : 'item')));
      const targetLayer = layerAcceptsPlacement(sourceLayer, targetKind) ? sourceLayer : resolvePlacementLayer(targetKind);
      const targetGroup = targetLayer ? getLayerGroup(targetLayer.id) : null;

      let clone;
      if (src.getAttr('customType') === 'venue') {
        const storedWidthFt = src.getAttr('widthFt');
        const storedHeightFt = src.getAttr('heightFt');
        const outlineCfg = cloneConfig(src.getAttr('outlineSpec'));
        const legsCfg = cloneConfig(src.getAttr('legsSpec'));

        clone = createVenue({
          type: src.getAttr('venueType'),
          x: baseX,
          y: baseY,
          rotation,
          width: storedWidthFt !== undefined ? storedWidthFt : (src.width ? src.width() / FEET_TO_PX : undefined),
          height: storedHeightFt !== undefined ? storedHeightFt : (src.height ? src.height() / FEET_TO_PX : undefined),
          outline: outlineCfg,
          legs: legsCfg,
          polygon: cloneConfig(src.getAttr('polygonSpec')),
          components: cloneConfig(src.getAttr('componentsSpec')),
          doors: cloneConfig(src.getAttr('doorsSpec')),
          attachments: cloneConfig(src.getAttr('attachmentsSpec')),
          reference: cloneConfig(src.getAttr('referenceSpec')),
          customName: src.getAttr('customName'),
          customTemplateId: src.getAttr('customTemplateId'),
        });
      } else if (src.getAttr('isFlooring')) {
        const category = src.getAttr('floorCategory') === 'dancefloor' ? ((src.getAttr('floorOptions') || {}).style === 'classic' ? 'classicDancefloor' : 'modernDancefloor') : (src.getAttr('floorCategory') || src.getAttr('itemType') || 'floor');
        const widthFt = src.getAttr('widthFt') || (src.width ? src.width() / FEET_TO_PX : 10);
        const lengthFt = src.getAttr('lengthFt') || (src.height ? src.height() / FEET_TO_PX : 10);
        clone = await createFlooring(category, widthFt, lengthFt, {
          x: baseX,
          y: baseY,
          rotation,
          customTexture: !!src.getAttr('customTexture'),
          floorOptions: cloneConfig(src.getAttr('floorOptions')) || {},
        });
        if (clone) clone.setAttr('flooringLabel', src.getAttr('flooringLabel') || '');
      } else if (src.getAttr('customType') === 'groupedSeating') {
        clone = createGroupedSeatingLayout(cloneConfig(src.getAttr('groupedConfig')), { x: baseX, y: baseY, rotation });
      } else if (src.getAttr('customType') === 'layoutGroup') {
        clone = createLayoutGroup(cloneConfig(src.getAttr('layoutGroupConfig')), { x: baseX, y: baseY, rotation, name: src.getAttr('layoutGroupName') || 'Layout group' });
      } else if (src.getAttr('customType') === 'label') {
        clone = createLabelNode({
          text: src.getAttr('labelText') || '',
          x: baseX,
          y: baseY,
          rotation,
          attachedToNodeId: src.getAttr('attachedToNodeId') || null,
          attachmentOffset: cloneConfig(src.getAttr('attachmentOffset') || null),
          fontSize: src.getAttr('fontSize'),
          labelColor: src.getAttr('labelColor'),
          fontStyle: src.getAttr('fontStyle'),
          labelBorder: !!src.getAttr('labelBorder'),
          autoGenerated: !!src.getAttr('autoGenerated'),
          labelKind: src.getAttr('labelKind') || '',
        });
      } else if (src.getAttr('customType') === 'drawnRun') {
        const points = bistroRunWorldPoints(src).map((point) => ({ x: point.x + offset, y: point.y + offset }));
        clone = createDrawnRunNode({
          drawMode: src.getAttr('drawMode'), inventoryName: src.getAttr('inventoryName'),
          category: src.getAttr('inventoryCategory'), color: src.getAttr('addonColor'),
          lightPostAnchors: cloneConfig(src.getAttr('lightPostAnchors')) || [],
        }, points);
      } else {
        const data = {
          type: src.getAttr('itemType') || 'table',
          x: baseX,
          y: baseY,
          width: src.width ? src.width() : undefined,
          height: src.height ? src.height() : undefined,
          radius: src.radius ? src.radius() : undefined,
          rotation,
          unit: 'px',
          inventoryName: src.getAttr('inventoryName') || '',
          cocktailHeightMode: src.getAttr('cocktailHeightMode') || '',
          footprint: cloneConfig(src.getAttr('footprintSpec')),
        };
        clone = createItem(data);
      }

      if (clone) {
        const srcNodeId = src.getAttr && src.getAttr('nodeId');
        ensureNodeId(clone, src.getAttr && src.getAttr('customType') === 'label' ? 'label' : 'item');
        if (srcNodeId) nodeIdMap.set(srcNodeId, clone.getAttr('nodeId'));
        const destinationLayer = src.getAttr && src.getAttr('customType') === 'label'
          ? (getLabelLayer() || targetLayer)
          : (src.getAttr && src.getAttr('isFlooring') && src.getAttr('floorCategory') === 'subfloor'
            ? (getLayer('subfloor-base') || targetLayer)
            : targetLayer);
        const destinationGroup = destinationLayer ? getLayerGroup(destinationLayer.id) : targetGroup;
        if (destinationLayer && destinationGroup) {
          setNodeLayerId(clone, destinationLayer.id);
          destinationGroup.add(clone);
        }
        if (snapToGrid && clone.position) snapNodeToGrid(clone);
        newSelection.push(clone);
      }
    }

    newSelection.forEach((node) => {
      if (!(node.getAttr && node.getAttr('customType') === 'label')) return;
      const oldAttachedId = node.getAttr('attachedToNodeId');
      const mappedId = oldAttachedId ? nodeIdMap.get(oldAttachedId) : null;
      if (mappedId) node.setAttr('attachedToNodeId', mappedId);
    });
    newSelection.filter(isStandaloneBistroRun).forEach((node) => {
      const mappedAnchors = normalizedLightPostAnchors(node).map((anchor) => ({ pointIndex: anchor.pointIndex, nodeId: nodeIdMap.get(anchor.nodeId) })).filter((anchor) => !!anchor.nodeId);
      node.setAttr('lightPostAnchors', mappedAnchors);
      if (mappedAnchors.length) syncBistroRunPostsFromRun(node);
    });
    newSelection.forEach((node) => {
      if (node.getAttr && node.getAttr('customType') !== 'label') syncAttachedLabelsForNode(node);
    });

    ensureLayerOrder();

    selectedItems = newSelection;
    transformer.nodes(selectedItems);
    renderLayersPanel();
    refreshInventoryPanelUI();
    worldLayer.draw();
    setDirty(true);
  }


  function handleDelete() {
    if (selectedCustomBistroString) {
      const { node, tent, stringIndex } = selectedCustomBistroString;
      const attachment = node && node.getAttr ? cloneConfig(node.getAttr('attachment')) : null;
      if (attachment && Array.isArray(attachment.strings) && attachment.strings[stringIndex]) {
        attachment.strings.splice(stringIndex, 1);
        if (attachment.strings.length) { node.setAttr('attachment', attachment); renderTentAddonGeometry(node, tent); }
        else node.destroy();
        if (customBistroStringHighlight) customBistroStringHighlight.destroy();
        customBistroStringHighlight = null; selectedCustomBistroString = null;
        refreshInventoryPanelUI(); renderLayersPanel(); worldLayer.draw(); setDirty(true); return;
      }
      selectedCustomBistroString = null;
    }
    const labelsToDelete = [];
    const tentsToDelete = new Set();
    selectedItems.forEach((shape) => {
      const nodeId = shape && shape.getAttr ? shape.getAttr('nodeId') : '';
      if (nodeId) labelsToDelete.push(...findAttachedLabels(nodeId));
      if (shape && shape.getAttr && shape.getAttr('customType') === 'venue' && shape.getAttr('venueType') === 'tent') tentsToDelete.add(nodeId);
    });
    if (tentsToDelete.size) forEachNode((node) => { if (node.getAttr && node.getAttr('customType') === 'tentAddon' && tentsToDelete.has(node.getAttr('parentTentNodeId'))) node.destroy(); });
    const remainingSelection = [];
    selectedItems.forEach((shape) => {
      if (shape && shape.getAttr && shape.getAttr('customType') === 'label' && shape.getAttr('labelMode') === 'attached') {
        remainingSelection.push(shape);
        return;
      }
      shape.destroy();
    });
    [...new Set(labelsToDelete)].forEach((labelNode) => labelNode.destroy());
    selectedItems = remainingSelection;
    updateFloorZOrder();
    renderLayersPanel();
    updateTransformer();
    refreshStandaloneLightConnections();
    refreshInventoryPanelUI();
    worldLayer.draw();
    setDirty(true);
  }

  function createVenue(data) {
    const FEET_TO_PX = 12;
    const type = data.type || "room";
    const isTent = type === "tent";
    const isCustom = type === 'custom';

    const unitHint = data.unit || data.units;
    const widthFt =
      normaliseFeet(
        data.width !== undefined ? data.width : (data.widthFt !== undefined ? data.widthFt : data.widthFeet),
        data.widthUnit || unitHint
      ) ??
      normaliseFeet(data.widthPx, 'px') ??
      10;
    const heightFt =
      normaliseFeet(
        data.height !== undefined ? data.height : (data.heightFt !== undefined ? data.heightFt : data.heightFeet),
        data.heightUnit || unitHint
      ) ??
      normaliseFeet(data.heightPx, 'px') ??
      10;

    const widthPx = widthFt * FEET_TO_PX;
    const heightPx = heightFt * FEET_TO_PX;
    const rotation = data.rotation || 0;

    const outlineCfg = cloneConfig(data.outline);
    const outline = outlineCfg || {};
    const lineStyle = outline.style || (isTent ? "dashed" : "solid");
    const strokeWidth = outline.thickness || (isTent ? 2 : 4);
    const strokeColor = outline.color || "#0d6efd";

    const legsCfg = cloneConfig(data.legs);
    const legsMeta = legsCfg || {};
    const legDiaFt = legsMeta.diameter || 1.0;
    const legRpx = (legDiaFt * FEET_TO_PX) / 2;

    // grouped venue
    const group = new Konva.Group({
      x: data.x || 0,
      y: data.y || 0,
      rotation,
      draggable: activeTool === 'select',
      name: "venue",
    });
    group.setAttrs({
      customType: "venue",
      venueType: type,
      selectable: true,
      lockedSize: true,
      widthFt,
      heightFt,
      outlineSpec: outlineCfg,
      legsSpec: legsCfg,
      polygonSpec: isCustom && Array.isArray(data.polygon) ? cloneConfig(data.polygon) : undefined,
      componentsSpec: isCustom && Array.isArray(data.components) ? cloneConfig(data.components) : undefined,
      doorsSpec: isCustom && Array.isArray(data.doors) ? cloneConfig(data.doors) : undefined,
      attachmentsSpec: roomAttachmentList(data),
      customName: isCustom ? (data.customName || 'Custom venue') : undefined,
      customTemplateId: isCustom ? (data.customTemplateId || undefined) : undefined,
      tentSetupName: isTent ? String(data.tentSetupName || '').trim() : undefined,
    });
    ensureNodeId(group, 'venue');

    if (isCustom) {
      const polygon = Array.isArray(data.polygon) && data.polygon.length >= 3
        ? data.polygon.map((point) => ({ x: Number(point.x) || 0, y: Number(point.y) || 0 }))
        : [{ x: 0, y: 0 }, { x: widthFt, y: 0 }, { x: widthFt, y: heightFt }, { x: 0, y: heightFt }];
      const components = Array.isArray(data.components) && data.components.length ? data.components : [{ id: 'legacy-outline', kind: 'polygon', points: polygon }];
      components.forEach((component) => {
        const points = Array.isArray(component.points) ? component.points : []; if (points.length < (component.closed === false || component.kind === 'line' ? 2 : 3)) return;
        const pointsPx = points.flatMap((point) => [(Number(point.x) || 0) * FEET_TO_PX, (Number(point.y) || 0) * FEET_TO_PX]);
        const removedWalls = Array.isArray(component.removedWalls) ? component.removedWalls : [];
        const closed = component.closed !== false;
        const edgeCount = closed ? points.length : Math.max(0, points.length - 1);
        group.add(new Konva.Line({ points: pointsPx, closed, strokeEnabled: false, fill: closed ? 'rgba(13,110,253,.04)' : undefined, listening: true, name: 'customVenueOutline' }));
      });
      renderRoomWalls(group, components, outlineCfg);
      renderVenueAttachmentGeometry(group);
      const hitNode = new Konva.Rect({ x: 0, y: 0, width: widthPx, height: heightPx, fill: 'rgba(0,0,0,.01)', strokeWidth: 0, listening: true, name: 'venueHitSurface' });
      group.add(hitNode); hitNode.moveToBottom();
      attachShapeEvents(group); return group;
    }

    // outline rect
    const rect = new Konva.Rect({
      x: 0,
      y: 0,
      width: widthPx,
      height: heightPx,
      stroke: undefined,
      strokeWidth: 0,
      dash: lineStyle === "dashed" ? [10, 5] : [],
      listening: activeTool === 'select',
    });
    try { rect.fillEnabled(false); rect.hitStrokeWidth(10); } catch (e) { }
    group.add(rect);
    renderRoomWalls(group, roomAttachmentComponents(widthFt, heightFt), outlineCfg);
    renderVenueAttachmentGeometry(group);

    const hitRect = new Konva.Rect({
      x: 0,
      y: 0,
      width: widthPx,
      height: heightPx,
      fill: 'rgba(0,0,0,0.01)',
      strokeWidth: 0,
      listening: true,
      name: 'venueHitSurface',
    });
    group.add(hitRect);
    hitRect.moveToBottom();

    // rooms have no legs
    if (!isTent) {
      attachShapeEvents(group);
      return group;
    }

    // draw legs
    tentLegPositionsFt(widthFt, heightFt).forEach(([legX, legY]) => {
      group.add(new Konva.Circle({
        x: legX * FEET_TO_PX, y: legY * FEET_TO_PX,
        radius: legRpx,
        fill: strokeColor,
        stroke: strokeColor,
        strokeWidth: 0.5,
        listening: false,
      }));
    });

    attachShapeEvents(group);
    return group;
  }

  function createItem(data) {
    const type = data.type || 'table';
    const pxPerFoot = FEET_TO_PX; // 12 px = 1 ft

    const unitHint = typeof data.unit === 'string' ? data.unit.trim().toLowerCase() : '';
    const toFeet = (value, fallback) => {
      if (value === undefined || value === null) return fallback;
      const num = typeof value === 'number' ? value : parseFloat(value);
      if (!Number.isFinite(num)) return fallback;
      if (unitHint === 'ft' || unitHint === 'feet') return num;
      if (unitHint === 'px' || unitHint === 'pixel' || unitHint === 'pixels') return num / pxPerFoot;
      if (!unitHint && num > 20) return num / pxPerFoot;
      return num;
    };

    const hasLength = data.length !== undefined && data.length !== null;
    const hasHeight = data.height !== undefined && data.height !== null;
    const hasWidth = data.width !== undefined && data.width !== null;

    let widthFt = 1;
    let lengthFt = 1;
    if (hasLength) {
      widthFt = toFeet(hasWidth ? data.width : data.length, 1);
      lengthFt = toFeet(data.length, 1);
    } else if (hasHeight && hasWidth) {
      widthFt = toFeet(data.height, 1);
      lengthFt = toFeet(data.width, 1);
    } else if (hasHeight) {
      const sizeFt = toFeet(data.height, 1);
      widthFt = sizeFt;
      lengthFt = sizeFt;
    } else if (hasWidth) {
      const sizeFt = toFeet(data.width, 1);
      widthFt = sizeFt;
      lengthFt = sizeFt;
    }

    const diameterFtRaw = toFeet(data.diameter, undefined);
    const radiusFtRaw = toFeet(data.radius, undefined);
    const diameterFt = diameterFtRaw !== undefined ? diameterFtRaw : (radiusFtRaw !== undefined ? radiusFtRaw * 2 : undefined);

    const widthPx = widthFt * pxPerFoot;
    const lengthPx = lengthFt * pxPerFoot;
    const diameterPx = diameterFt !== undefined ? diameterFt * pxPerFoot : 0;
    const catalogMatch = !data.footprint && data.inventoryName
      ? inventoryDefinitionCache.find((entry) => entry && (entry.name === data.inventoryName || entry.aliases.includes(data.inventoryName)))
      : null;
    const inventoryName = String(data.inventoryName || '').toLowerCase();
    const isRectangularSofa = /6'\s*sofa/i.test(inventoryName);
    const loungeCurveFallback = /6'\s*curved ottoman/i.test(inventoryName)
      ? { shape: 'quarter_annulus', outerRadiusFt: 4.25, innerRadiusFt: 2, nominalLengthFt: 6, depthFt: 2.25 }
      : null;
    const footprint = !isRectangularSofa && (data.footprint && typeof data.footprint === 'object')
      ? data.footprint
      : (!isRectangularSofa && catalogMatch && catalogMatch.footprint ? catalogMatch.footprint : (loungeCurveFallback || (type === 'halfround' ? { shape: 'halfround', diameterFt: diameterFt || 5, depthFt: (diameterFt || 5) / 2 } : null)));

    const fill = data.color || (type === 'chair' ? '#adb5bd' : type === 'stage' ? '#ffc107' : '#20c997');
    let shape;

    if (footprint && footprint.shape === 'custom_compound') {
      const components = Array.isArray(footprint.components) ? footprint.components : [];
      shape = new Konva.Group({ x: data.x || 0, y: data.y || 0, rotation: data.rotation || 0, draggable: true, name: 'item' });
      const allPoints = components.flatMap((component) => (Array.isArray(component.points) ? component.points : []).filter((point) => point && typeof point === 'object'));
      const minX = allPoints.length ? Math.min(...allPoints.map((point) => Number(point.x) || 0)) : 0;
      const minY = allPoints.length ? Math.min(...allPoints.map((point) => Number(point.y) || 0)) : 0;
      const maxX = allPoints.length ? Math.max(...allPoints.map((point) => Number(point.x) || 0)) : 1;
      const maxY = allPoints.length ? Math.max(...allPoints.map((point) => Number(point.y) || 0)) : 1;
      shape.add(new Konva.Rect({ x: minX * pxPerFoot, y: minY * pxPerFoot, width: Math.max(pxPerFoot * .1, (maxX - minX) * pxPerFoot), height: Math.max(pxPerFoot * .1, (maxY - minY) * pxPerFoot), fill: 'rgba(0,0,0,0.001)', listening: true, name: 'customItemHitArea' }));
      components.forEach((component) => {
        const componentPoints = Array.isArray(component.points)
          ? component.points.filter((point) => point && typeof point === 'object')
          : [];
        const closed = component.closed !== false && component.kind !== 'line' && component.kind !== 'arc';
        const minimumPointCount = closed ? 3 : 2;
        if (componentPoints.length < minimumPointCount) return;
        const pointAt = (point) => [(Number(point.x) || 0) * pxPerFoot, (Number(point.y) || 0) * pxPerFoot];
        const points = componentPoints.flatMap(pointAt);
        const removedWalls = Array.isArray(component.removedWalls) ? component.removedWalls : [];
        if (!removedWalls.length) {
          shape.add(new Konva.Line({ points, closed, fill: closed ? fill : undefined, stroke: '#495057', strokeWidth: 1, listening: false }));
          return;
        }
        const edgeCount = closed ? componentPoints.length : componentPoints.length - 1;
        for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
          if (removedWalls.includes(edgeIndex)) continue;
          const endIndex = closed ? (edgeIndex + 1) % componentPoints.length : edgeIndex + 1;
          shape.add(new Konva.Line({ points: [...pointAt(componentPoints[edgeIndex]), ...pointAt(componentPoints[endIndex])], stroke: '#495057', strokeWidth: 1, lineCap: 'round', listening: false }));
        }
      });
      // Compound inventory is defined by its saved points. Derive its saved
      // dimensions from those points so preview, placement, copy/paste, and
      // older custom-item records all use the same geometry.
      widthFt = Math.max(.1, maxY - minY);
      lengthFt = Math.max(.1, maxX - minX);
    } else if (footprint && footprint.shape === 'custom_polygon') {
      const polygon = Array.isArray(footprint.points) ? footprint.points : [];
      const polygonPoints = polygon.flatMap((point) => [Number(point.x) * pxPerFoot, Number(point.y) * pxPerFoot]);
      shape = new Konva.Line({ x: data.x || 0, y: data.y || 0, points: polygonPoints, closed: true, fill, stroke: '#495057', strokeWidth: 1, draggable: true, name: 'item' });
      widthFt = toFeet(data.width, 1); lengthFt = toFeet(data.length, 1);
    } else if (footprint && footprint.shape === 'light_post') {
      const basePx = (Number(footprint.baseFt) || 3) * pxPerFoot;
      const pipeRadius = Math.max(2, ((Number(footprint.pipeDiameterIn) || 4) / 12) * pxPerFoot / 2);
      shape = new Konva.Group({ x: data.x || 0, y: data.y || 0, width: basePx, height: basePx, rotation: data.rotation || 0, draggable: true, name: 'item' });
      // A group made only of non-listening visual children has no hit region in
      // Konva. Keep the drawing non-interactive, but provide one hit surface so
      // an empty Light Post can always be selected and dragged like every item.
      shape.add(new Konva.Rect({ x: 0, y: 0, width: basePx, height: basePx, fill: 'rgba(0,0,0,0.001)', listening: true, name: 'lightPostHitArea' }));
      shape.add(new Konva.Rect({ x: 0, y: 0, width: basePx, height: basePx, fill: 'rgba(108,117,125,.32)', stroke: '#59636b', strokeWidth: 1, listening: false }));
      shape.add(new Konva.Circle({ x: basePx / 2, y: basePx / 2, radius: pipeRadius, fill: '#59636b', stroke: '#343a40', strokeWidth: 1, listening: false }));
      widthFt = basePx / pxPerFoot; lengthFt = widthFt;
    } else if (footprint && footprint.shape === 'panel_with_bases') {
      const panelLengthFt = Number(footprint.panelLengthFt) || lengthFt || 4;
      const panelDepthFt = Number(footprint.panelDepthFt) || widthFt || 0.25;
      const baseFt = Number(footprint.baseFt) || 1.5;
      const baseDepthFt = Number(footprint.baseDepthFt) || baseFt;
      const panelLengthPx = panelLengthFt * pxPerFoot;
      const panelDepthPx = panelDepthFt * pxPerFoot;
      const baseWidthFt = Number(footprint.baseWidthFt) || baseFt;
      const basePx = baseWidthFt * pxPerFoot;
      const baseDepthPx = baseDepthFt * pxPerFoot;
      const baseYPx = (panelDepthPx - baseDepthPx) / 2;
      const totalHeightPx = Math.max(panelDepthPx, baseDepthPx);
      shape = new Konva.Group({ x: data.x || 0, y: data.y || 0, width: panelLengthPx, height: totalHeightPx, rotation: data.rotation || 0, draggable: true, name: 'item' });
      const hitTopPx = Math.min(0, baseYPx);
      const hitBottomPx = Math.max(panelDepthPx, baseYPx + baseDepthPx);
      shape.add(new Konva.Rect({ x: 0, y: hitTopPx, width: panelLengthPx, height: hitBottomPx - hitTopPx, fill: 'rgba(0,0,0,0.001)', listening: true, name: 'panelHitArea' }));
      shape.add(new Konva.Rect({ x: 0, y: baseYPx, width: basePx, height: baseDepthPx, fill: '#8c8c8c', stroke: '#495057', strokeWidth: 1, listening: false, name: 'panelBase' }));
      shape.add(new Konva.Rect({ x: panelLengthPx - basePx, y: baseYPx, width: basePx, height: baseDepthPx, fill: '#8c8c8c', stroke: '#495057', strokeWidth: 1, listening: false, name: 'panelBase' }));
      shape.add(new Konva.Rect({ x: 0, y: 0, width: panelLengthPx, height: panelDepthPx, fill, stroke: '#495057', strokeWidth: 1, listening: false, name: 'panel' }));
      widthFt = baseFt;
      lengthFt = panelLengthFt;
    } else if (footprint && footprint.shape === 'arch') {
      const openingFt = Number(footprint.openingFt) || 3;
      const sideFt = Number(footprint.sideFt) || 0.5;
      const depthFt = Number(footprint.depthFt) || 0.5;
      const beamDepthFt = Math.min(depthFt, Number(footprint.beamDepthFt) || 0.15);
      const totalWidthFt = openingFt + (sideFt * 2);
      const totalWidthPx = totalWidthFt * pxPerFoot;
      const sidePx = sideFt * pxPerFoot;
      const depthPx = depthFt * pxPerFoot;
      const beamDepthPx = beamDepthFt * pxPerFoot;
      shape = new Konva.Shape({ x: data.x || 0, y: data.y || 0, width: totalWidthPx, height: depthPx, rotation: data.rotation || 0, fill, stroke: '#495057', strokeWidth: 1, draggable: true, name: 'item', sceneFunc: (context, node) => {
        context.beginPath();
        context.rect(0, 0, sidePx, depthPx);
        context.rect(sidePx, (depthPx - beamDepthPx) / 2, openingFt * pxPerFoot, beamDepthPx);
        context.rect(totalWidthPx - sidePx, 0, sidePx, depthPx);
        context.fillStrokeShape(node);
      } });
      widthFt = depthFt;
      lengthFt = totalWidthFt;
    } else if (footprint && footprint.shape === 'accent_chair') {
      const seatDiameterFt = Number(footprint.seatDiameterFt) || Math.max(widthFt, lengthFt, 2);
      const seatRadius = (seatDiameterFt * pxPerFoot) / 2;
      const backrestWidth = (Number(footprint.backrestWidthFt) || seatDiameterFt * 1.15) * pxPerFoot;
      const backrestDepth = (Number(footprint.backrestDepthFt) || 0.5) * pxPerFoot;
      shape = new Konva.Group({
        x: data.x || 0,
        y: data.y || 0,
        rotation: data.rotation || 0,
        width: seatRadius * 2,
        height: seatRadius * 2,
        draggable: true,
        name: 'item',
      });
      shape.add(new Konva.Circle({ radius: seatRadius, fill, stroke: '#495057', strokeWidth: 1, listening: false }));
      shape.add(new Konva.Rect({
        x: -backrestWidth / 2,
        y: -seatRadius - backrestDepth / 2,
        width: backrestWidth,
        height: backrestDepth,
        cornerRadius: Math.min(3, backrestDepth / 3),
        fill,
        stroke: '#495057',
        strokeWidth: 1,
        listening: false,
        name: 'chairBackrest',
      }));
    } else if (footprint && footprint.shape === 'throne_chair') {
      const baseWidth = widthFt * pxPerFoot;
      const baseHeight = lengthFt * pxPerFoot;
      const edgeInset = Math.max(3, 0.12 * pxPerFoot);
      const backrestWidth = baseWidth - (edgeInset * 2);
      const backrestHeight = baseHeight * 0.68;
      const armWidth = Math.max(4, (Number(footprint.armWidthFt) || 0.3) * pxPerFoot);
      const armDepth = baseHeight - (edgeInset * 2);
      shape = new Konva.Group({ x: data.x || 0, y: data.y || 0, rotation: data.rotation || 0, width: baseWidth, height: baseHeight, draggable: true, name: 'item' });
      shape.add(new Konva.Rect({ width: baseWidth, height: baseHeight, fill, stroke: '#495057', strokeWidth: 1, listening: false }));
      shape.add(new Konva.Rect({ x: edgeInset, y: edgeInset, width: backrestWidth, height: backrestHeight, fill, stroke: '#495057', strokeWidth: 1, listening: false, name: 'chairBackrest' }));
      shape.add(new Konva.Rect({ x: edgeInset, y: edgeInset, width: armWidth, height: armDepth, fill, stroke: '#495057', strokeWidth: 1, listening: false, name: 'chairArmrest' }));
      shape.add(new Konva.Rect({ x: baseWidth - armWidth - edgeInset, y: edgeInset, width: armWidth, height: armDepth, fill, stroke: '#495057', strokeWidth: 1, listening: false, name: 'chairArmrest' }));
    } else if (footprint && footprint.shape === 'halfround') {
      const resolvedDiameterFt = Number(footprint.diameterFt) || diameterFt || Math.max(widthFt, lengthFt) || 1;
      const resolvedDepthFt = Number(footprint.depthFt) || (resolvedDiameterFt / 2);
      const diameter = resolvedDiameterFt * pxPerFoot;
      const depth = resolvedDepthFt * pxPerFoot;
      shape = new Konva.Shape({
        x: data.x || 0,
        y: data.y || 0,
        width: diameter,
        height: depth,
        rotation: data.rotation || 0,
        fill,
        stroke: '#495057',
        strokeWidth: 1,
        draggable: true,
        name: 'item',
        sceneFunc: (context, node) => {
          context.beginPath();
          context.moveTo(0, 0);
          context.arc(diameter / 2, 0, diameter / 2, Math.PI, 0, false);
          context.lineTo(diameter, 0);
          context.closePath();
          context.fillStrokeShape(node);
        },
      });
      widthFt = resolvedDepthFt;
      lengthFt = resolvedDiameterFt;
    } else if (footprint && footprint.shape === 'quarter_annulus') {
      const outerRadiusFt = Number(footprint.outerRadiusFt) || Math.max(widthFt, lengthFt, 1);
      const innerRadiusFt = Math.max(0, Math.min(outerRadiusFt, Number(footprint.innerRadiusFt) || (outerRadiusFt - 2.5)));
      const outerRadius = outerRadiusFt * pxPerFoot;
      const innerRadius = innerRadiusFt * pxPerFoot;
      shape = new Konva.Shape({
        x: data.x || 0,
        y: data.y || 0,
        width: outerRadius,
        height: outerRadius,
        rotation: data.rotation || 0,
        fill,
        stroke: '#495057',
        strokeWidth: 1,
        draggable: true,
        name: 'item',
        sceneFunc: (context, node) => {
          context.beginPath();
          context.moveTo(outerRadius, 0);
          context.arc(0, 0, outerRadius, 0, Math.PI / 2, false);
          context.lineTo(0, innerRadius);
          context.arc(0, 0, innerRadius, Math.PI / 2, 0, true);
          context.closePath();
          context.fillStrokeShape(node);
        },
      });
      widthFt = outerRadiusFt;
      lengthFt = outerRadiusFt;
    } else if (type === 'round') {
      const fallBackRadiusFt = radiusFtRaw !== undefined ? radiusFtRaw : Math.max(widthFt, lengthFt) / 2 || 0.5;
      const radius = diameterPx ? diameterPx / 2 : fallBackRadiusFt * pxPerFoot;
      const chairName = String(data.inventoryName || data.name || '').toLowerCase();
      const hasBackrest = (data.category === 'stool' || data.type === 'chair')
        && !/wood barstool|barstool plain wood/i.test(chairName);
      if (hasBackrest) {
        const backrestWidth = radius * 1.45;
        const backrestDepth = Math.max(3, radius * 0.38);
        shape = new Konva.Group({
          x: data.x || 0,
          y: data.y || 0,
          rotation: data.rotation || 0,
          width: radius * 2,
          height: radius * 2,
          draggable: true,
          name: 'item',
        });
        shape.add(new Konva.Circle({ radius, fill, stroke: '#495057', strokeWidth: 1, listening: false }));
        shape.add(new Konva.Rect({
          x: -backrestWidth / 2,
          y: -radius - backrestDepth / 2,
          width: backrestWidth,
          height: backrestDepth,
          cornerRadius: Math.min(2, backrestDepth / 3),
          fill,
          stroke: '#495057',
          strokeWidth: 1,
          listening: false,
          name: 'chairBackrest',
        }));
      } else {
        shape = new Konva.Circle({
          x: data.x || 0,
          y: data.y || 0,
          radius,
          fill,
          stroke: '#495057',
          strokeWidth: 1,
          draggable: true,
          name: 'item'
        });
      }
    } else if (type === 'chair') {
      const backrestDepth = Math.max(3, widthPx * 0.22);
      shape = new Konva.Group({ x: data.x || 0, y: data.y || 0, rotation: data.rotation || 0, width: lengthPx, height: widthPx, draggable: true, name: 'item' });
      shape.add(new Konva.Rect({ width: lengthPx, height: widthPx, fill, stroke: '#495057', strokeWidth: 1, listening: false }));
      shape.add(new Konva.Rect({ x: 0, y: -backrestDepth / 2, width: lengthPx, height: backrestDepth, cornerRadius: Math.min(2, backrestDepth / 3), fill, stroke: '#495057', strokeWidth: 1, listening: false, name: 'chairBackrest' }));
    } else {
      shape = new Konva.Rect({
        x: data.x || 0,
        y: data.y || 0,
        width: lengthPx,    // length = horizontal dimension
        height: widthPx,    // width = depth dimension
        rotation: data.rotation || 0,
        fill,
        stroke: '#495057',
        strokeWidth: 1,
        draggable: true,
        name: 'item'
      });
    }

    // Every supported item branch creates a Konva node. Keep malformed/legacy
    // inventory records from reaching the finalizer with an undefined shape.
    if (!shape) {
      shape = new Konva.Rect({
        x: data.x || 0,
        y: data.y || 0,
        width: Math.max(1, lengthPx),
        height: Math.max(1, widthPx),
        fill,
        stroke: '#495057',
        strokeWidth: 1,
        draggable: true,
        name: 'item',
      });
    }

    const itemAttrs = {
      customType: 'item',
      itemType: type,
      selectable: true,
      lockScaling: true,
      widthFt,
      lengthFt,
      dimensionUnit: unitHint || 'ft',
      inventoryName: data.inventoryName || '',
      inventoryCategory: data.category || data.inventoryCategory || '',
      familyId: data.familyId || '',
      cocktailHeightMode: data.cocktailHeightMode || '',
      footprintSpec: data.footprint || null,
      lightPostHeightFt: Number(data.lightPostHeightFt) || undefined,
    };
    if (diameterFt !== undefined) itemAttrs.diameterFt = diameterFt;
    shape.setAttrs(itemAttrs);
    if (isLightPost(shape) && shape.dragBoundFunc) shape.dragBoundFunc((position) => constrainLightPostPosition(shape, position));
    ensureNodeId(shape, 'item');
    attachShapeEvents(shape);
    return shape;
  }

  function createReferenceImage(data) {
    return new Promise((resolve, reject) => {
      if (!data || !data.dataUrl) { reject(new Error('Reference image data is missing.')); return; }
      const image = new Image();
      image.onload = () => {
        const worldScale = worldGroup ? worldGroup.scaleX() : 1;
        const viewWidth = stage ? stage.width() / worldScale : 900;
        const viewHeight = stage ? stage.height() / worldScale : 650;
        const initialScale = Math.min((viewWidth * .72) / image.width, (viewHeight * .72) / image.height, 1);
        const width = Number.isFinite(data.width) ? data.width : Math.max(1, image.width * initialScale);
        const height = Number.isFinite(data.height) ? data.height : Math.max(1, image.height * initialScale);
        const x = Number.isFinite(data.x) ? data.x : Math.max(0, (viewWidth - width) / 2);
        const y = Number.isFinite(data.y) ? data.y : Math.max(0, (viewHeight - height) / 2);
        const node = new Konva.Image({ image, x, y, width, height, rotation: Number(data.rotation) || 0, opacity: Number.isFinite(data.opacity) ? data.opacity : .72, draggable: true, name: 'referenceImage' });
        node.setAttrs({ customType: 'referenceImage', selectable: true, dataUrl: data.dataUrl, referenceImageName: data.name || 'Reference image', referenceMeta: data.referenceMeta || null });
        if (data.nodeId) node.setAttr('nodeId', data.nodeId);
        ensureNodeId(node, 'reference-image');
        attachShapeEvents(node);
        node.on('transformend', () => {
          node.width(Math.max(1, node.width() * node.scaleX()));
          node.height(Math.max(1, node.height() * node.scaleY()));
          node.scale({ x: 1, y: 1 });
          if (node.getAttr('referenceGridFitted')) fitGridToReference(node);
          worldLayer.batchDraw(); setDirty(true);
        });
        node.on('dblclick dbltap', () => { if (isSelectableNode(node)) openReferenceSetup({ dataUrl: node.getAttr('dataUrl'), name: node.getAttr('referenceImageName'), referenceMeta: node.getAttr('referenceMeta') || null }, { context: 'main', target: node }).catch((error) => window.alert(error.message || 'The reference image could not be opened.')); });
        resolve(node);
      };
      image.onerror = () => reject(new Error('The selected image could not be loaded.'));
      image.src = data.dataUrl;
    });
  }

  function createStaticItemNode(data, options = {}) {
    const node = createItem(data);
    if (options.centerAnchored && node.className !== 'Circle') {
      const width = node.width ? node.width() : 0;
      const height = node.height ? node.height() : 0;
      node.offset({ x: width / 2, y: height / 2 });
    }
    node.off('mousedown touchstart dragstart dragmove dragend transformend');
    node.listening(false);
    node.draggable(false);
    return node;
  }

  function createGroupedSeatingChildNode(child) {
    const data = child && child.data ? child.data : {};
    const shapeType = child && child.shapeType ? child.shapeType : (data.type || 'chair');
    const widthFt = Number.isFinite(child && child.widthFt) ? child.widthFt : (Number(data.width) || Number(data.height) || Number(data.length) || 1);
    const lengthFt = Number.isFinite(child && child.lengthFt) ? child.lengthFt : (Number(data.length) || Number(data.width) || Number(data.height) || 1);
    const diameterFt = Number.isFinite(child && child.diameterFt) ? child.diameterFt : (Number(data.diameter) || undefined);
    const footprint = child && child.footprint ? child.footprint : (data.footprint || null);
    const fill = data.color || ((shapeType === 'rect_chair' || shapeType === 'round_chair' || shapeType === 'chair') ? '#adb5bd' : '#d0cfcf');
    const chairName = String(data.name || data.id || '').toLowerCase();
    const hasRoundChairBackrest = shapeType === 'round_chair'
      && !/wood barstool|barstool plain wood/i.test(chairName);
    let node;

    if (shapeType === 'halfround_table' || (footprint && footprint.shape === 'halfround')) {
      const resolvedDiameterFt = diameterFt || lengthFt || widthFt || 1;
      const radiusPx = (resolvedDiameterFt * FEET_TO_PX) / 2;
      const depthPx = (Number(footprint && footprint.depthFt) || (resolvedDiameterFt / 2)) * FEET_TO_PX;
      node = new Konva.Shape({
        x: (Number(child && child.x) || 0) - radiusPx,
        y: (Number(child && child.y) || 0) - depthPx,
        width: radiusPx * 2,
        height: depthPx,
        fill,
        stroke: '#495057',
        strokeWidth: 1,
        listening: false,
        draggable: false,
        name: 'groupedSeatingChild',
        sceneFunc: (context, shape) => {
          context.beginPath();
          context.moveTo(0, 0);
          context.arc(radiusPx, 0, radiusPx, Math.PI, 0, false);
          context.lineTo(resolvedDiameterFt * FEET_TO_PX, 0);
          context.closePath();
          context.fillStrokeShape(shape);
        },
      });
      node.setAttrs({
        customType: 'item',
        itemType: 'halfround',
        widthFt: resolvedDiameterFt / 2,
        lengthFt: resolvedDiameterFt,
        diameterFt: resolvedDiameterFt,
        footprintSpec: cloneConfig(footprint),
        selectable: false,
      });
      return node;
    }

    if (shapeType === 'serpentine_table' || (footprint && footprint.shape === 'quarter_annulus')) {
      const outerRadiusFt = Number(footprint && footprint.outerRadiusFt) || Math.max(lengthFt, widthFt, 1);
      const innerRadiusFt = Math.max(0, Math.min(outerRadiusFt, Number(footprint && footprint.innerRadiusFt) || (outerRadiusFt - 2.5)));
      const outerRadiusPx = outerRadiusFt * FEET_TO_PX;
      const innerRadiusPx = innerRadiusFt * FEET_TO_PX;
      node = new Konva.Shape({
        x: Number(child && child.x) || 0,
        y: Number(child && child.y) || 0,
        width: outerRadiusPx,
        height: outerRadiusPx,
        rotation: Number(child && child.rotation) || 0,
        fill,
        stroke: '#495057',
        strokeWidth: 1,
        listening: false,
        draggable: false,
        name: 'groupedSeatingChild',
        sceneFunc: (context, shape) => {
          context.beginPath();
          context.moveTo(outerRadiusPx, 0);
          context.arc(0, 0, outerRadiusPx, 0, Math.PI / 2, false);
          context.lineTo(0, innerRadiusPx);
          context.arc(0, 0, innerRadiusPx, Math.PI / 2, 0, true);
          context.closePath();
          context.fillStrokeShape(shape);
        },
      });
      node.setAttrs({ customType: 'item', itemType: 'table', widthFt: outerRadiusFt, lengthFt: outerRadiusFt, footprintSpec: cloneConfig(footprint), selectable: false });
      return node;
    }

    if (shapeType === 'round' || shapeType === 'round_table' || shapeType === 'round_chair') {
      const resolvedDiameterFt = diameterFt || lengthFt || widthFt || 1;
      const radiusPx = (resolvedDiameterFt * FEET_TO_PX) / 2;
      if (hasRoundChairBackrest) {
        const backrestWidth = radiusPx * 1.45;
        const backrestDepth = Math.max(3, radiusPx * 0.38);
        node = new Konva.Group({
          x: Number(child && child.x) || 0,
          y: Number(child && child.y) || 0,
          rotation: Number(child && child.rotation) || 0,
          listening: false,
          draggable: false,
          name: 'groupedSeatingChild',
        });
        node.add(new Konva.Circle({
          x: 0,
          y: 0,
          radius: radiusPx,
          fill,
          stroke: '#495057',
          strokeWidth: 1,
          listening: false,
        }));
        node.add(new Konva.Rect({
          x: -backrestWidth / 2,
          y: -radiusPx - backrestDepth / 2,
          width: backrestWidth,
          height: backrestDepth,
          cornerRadius: Math.min(2, backrestDepth / 3),
          fill,
          stroke: '#495057',
          strokeWidth: 1,
          listening: false,
          name: 'chairBackrest',
        }));
      } else {
        node = new Konva.Circle({
          x: Number(child && child.x) || 0,
          y: Number(child && child.y) || 0,
          radius: radiusPx,
          rotation: Number(child && child.rotation) || 0,
          fill,
          stroke: '#495057',
          strokeWidth: 1,
          listening: false,
          draggable: false,
          name: 'groupedSeatingChild',
        });
      }
      node.setAttrs({
        customType: 'item',
        itemType: shapeType === 'round_table' ? 'round' : (shapeType === 'round_chair' ? 'chair' : shapeType),
        widthFt: resolvedDiameterFt,
        lengthFt: resolvedDiameterFt,
        diameterFt: resolvedDiameterFt,
        selectable: false,
      });
      return node;
    }

    const widthPx = lengthFt * FEET_TO_PX;
    const heightPx = widthFt * FEET_TO_PX;
    if (shapeType === 'rect_chair' || (data.rowFacingMarker && !/barstool/i.test(String(data.name || '')))) {
      node = new Konva.Group({ x: Number(child && child.x) || 0, y: Number(child && child.y) || 0, rotation: Number(child && child.rotation) || 0, listening: false, draggable: false, name: 'groupedSeatingChild' });
      // Table seating positions chair nodes by their centres.  Keep the
      // rectangular drawing centred too; otherwise every chair is visibly
      // offset down/right by half its footprint while its seating coordinates
      // and rotation remain correct. Chair-row children use top-left positions
      // and intentionally retain their original anchor.
      const centered = !!(child && child.centerAnchored);
      const chairX = centered ? -widthPx / 2 : 0;
      const chairY = centered ? -heightPx / 2 : 0;
      node.add(new Konva.Rect({ x: chairX, y: chairY, width: widthPx, height: heightPx, fill, stroke: '#495057', strokeWidth: 1, listening: false }));
      if (shapeType === 'rect_chair') {
        const backrestDepth = Math.max(3, heightPx * .22);
        node.add(new Konva.Rect({ x: chairX, y: chairY - (backrestDepth / 2), width: widthPx, height: backrestDepth, cornerRadius: Math.min(2, backrestDepth / 3), fill, stroke: '#495057', strokeWidth: 1, listening: false, name: 'chairBackrest' }));
      } else node.add(new Konva.Line({ points: [0, heightPx * .72, widthPx, heightPx * .72], stroke: '#343a40', strokeWidth: 2, listening: false, name: 'chairBackMarker' }));
    } else {
      node = new Konva.Rect({
        x: Number(child && child.x) || 0, y: Number(child && child.y) || 0, width: widthPx, height: heightPx,
        offsetX: child && child.centerAnchored ? widthPx / 2 : 0, offsetY: child && child.centerAnchored ? heightPx / 2 : 0,
        rotation: Number(child && child.rotation) || 0, fill, stroke: '#495057', strokeWidth: 1, listening: false, draggable: false, name: 'groupedSeatingChild',
      });
    }
    node.setAttrs({
      customType: 'item',
      itemType: shapeType === 'rect_table' ? 'table' : (shapeType === 'rect_chair' ? 'chair' : shapeType),
      widthFt,
      lengthFt,
      selectable: false,
    });
    return node;
  }

  function getChairDefinitionByName(name) {
    return chairInventoryCache.find((entry) => entry && (entry.name === name || entry.aliases.includes(name))) || chairInventoryCache[0] || null;
  }

  function getTableDefinitionByName(name) {
    return tableInventoryCache.find((entry) => entry && (entry.name === name || entry.aliases.includes(name))) || tableInventoryCache[0] || null;
  }

  function getTableDefinitionFromConfig(config) {
    const key = Number.parseInt(config && config.tableKey, 10);
    if (Number.isInteger(key) && key >= 0 && key < tableInventoryCache.length) {
      return tableInventoryCache[key] || null;
    }
    return getTableDefinitionByName(config && config.tableName);
  }

  function getTableSeatingRule(tableDef) {
    const rules = {
      '30" Round Cocktail Table': { displayedMax: 2, layout: 'round' },
      '36" Round Cocktail Table': { displayedMax: 4, layout: 'round' },
      '36" Square Cocktail Table': { displayedMax: 4, layout: 'card' },
      '42" Round Kids Table': { displayedMax: 10, layout: 'round' },
      '48" Round Table': { displayedMax: 6, layout: 'round' },
      '60" Round Table': { displayedMax: 8, layout: 'round' },
      '72" Round Table': { displayedMax: 10, layout: 'round' },
      '60" Half Round Table': { displayedMax: 2, layout: 'halfround' },
      "8' Serpentine Table": { displayedMax: 8, layout: 'serpentine' },
      '4\' x 30" Banquet Table': { displayedMax: 6, layout: 'rectangle', sideTotal: 4, endTotal: 2 },
      '6\' x 30" Banquet Table': { displayedMax: 8, layout: 'rectangle', sideTotal: 6, endTotal: 2 },
      '8\' x 30" Banquet Table': { displayedMax: 10, layout: 'rectangle', sideTotal: 8, endTotal: 2 },
      '6\' x 18" Conference Table': { displayedMax: 6, layout: 'rectangle', sideTotal: 6, endTotal: 0 },
      '8\' x 18" Conference Table': { displayedMax: 8, layout: 'rectangle', sideTotal: 8, endTotal: 0 },
      '8\' x 48" King Banquet Table': { displayedMax: 12, layout: 'rectangle', sideTotal: 8, endTotal: 4 },
      '5\' x 36" Farm Table': { displayedMax: 6, layout: 'rectangle', sideTotal: 4, endTotal: 2 },
      '3\' x 3\' Card Table': { displayedMax: 4, layout: 'card' },
      '6\' x 24" Kids Table': { displayedMax: 10, layout: 'rectangle', sideTotal: 8, endTotal: 2 },
    };
    const rule = tableDef && rules[tableDef.name] ? rules[tableDef.name] : null;
    if (rule) {
      const allowExtra = rule.layout === 'round';
      return { ...rule, absoluteMax: rule.displayedMax + (allowExtra ? 1 : 0) };
    }
    const fallbackDisplayed = tableDef && tableDef.type === 'round' ? 8 : 6;
    return {
      displayedMax: fallbackDisplayed,
      absoluteMax: fallbackDisplayed + ((tableDef && tableDef.type === 'round') ? 1 : 0),
      layout: tableDef && tableDef.type === 'halfround' ? 'halfround' : (tableDef && tableDef.type === 'round' ? 'round' : 'rectangle'),
      sideTotal: 6,
      endTotal: 2,
    };
  }

  function getTableSeatingChairDefinition(config, tableDef) {
    const effectiveName = config && config.effectiveChairName;
    if (effectiveName) {
      const effectiveChair = getChairDefinitionByName(effectiveName);
      if (effectiveChair) return effectiveChair;
    }
    if (tableDef && tableDef.category === 'kids') {
      return getChairDefinitionByName('Kids Chair') || getChairDefinitionByName(config && config.chairName);
    }
    return getChairDefinitionByName(config && config.chairName);
  }

  function splitBetweenTwo(total) {
    const a = Math.ceil(Math.max(0, total) / 2);
    const b = Math.floor(Math.max(0, total) / 2);
    return [a, b];
  }

  function getTableSeatingMeta(config) {
    const tableDef = getTableDefinitionFromConfig(config);
    if (!tableDef) return null;
    const rule = getTableSeatingRule(tableDef);
    const chairDef = getTableSeatingChairDefinition(config, tableDef);
    return chairDef ? { tableDef, chairDef, rule } : null;
  }

  function buildChairRowsGeometry(config) {
    const chairDef = getChairDefinitionByName(config.chairName);
    if (!chairDef) return null;
    const rows = Math.max(1, parseInt(config.rows, 10) || 1);
    const cols = Math.max(1, parseInt(config.cols, 10) || 1);
    const targetChairCount = config.mode === 'total' ? Math.max(1, parseInt(config.totalChairs, 10) || rows * cols) : rows * cols;
    const seatSpacing = Math.max(0, parseFloat(config.seatSpacingFt) || 0);
    const rowSpacing = Math.max(0, parseFloat(config.rowSpacingFt) || 0);
    const chairWidthFt = Number(chairDef.width) || 1.67;
    const chairLengthFt = Number(chairDef.length) || Number(chairDef.diameter) || 1.5;
    const baseWidthFt = rows * chairWidthFt + Math.max(0, rows - 1) * rowSpacing;
    const baseLengthFt = cols * chairLengthFt + Math.max(0, cols - 1) * seatSpacing;
    const aisles = normaliseChairRowsAisles(config).filter((aisle) => aisle.direction === 'vertical' || aisle.direction === 'horizontal').map((aisle) => {
      const vertical = aisle.direction === 'vertical';
      const gapCount = Math.max(1, (vertical ? cols : rows) - 1);
      const gapIndex = chairRowsAisleGapIndex(aisle, gapCount);
      const baseSpanFt = vertical ? baseLengthFt : baseWidthFt;
      const footprintFt = vertical ? chairLengthFt : chairWidthFt;
      const spacingFt = vertical ? seatSpacing : rowSpacing;
      return { ...aisle, gapIndex, position: chairRowsGapCenterFt(gapIndex, footprintFt, spacingFt) / baseSpanFt };
    });
    const addedLengthFt = aisles.filter((aisle) => aisle.direction === 'vertical').reduce((sum, aisle) => sum + aisle.widthFt, 0);
    const addedWidthFt = aisles.filter((aisle) => aisle.direction === 'horizontal').reduce((sum, aisle) => sum + aisle.widthFt, 0);
    const totalWidthFt = baseWidthFt + addedWidthFt;
    const totalLengthFt = baseLengthFt + addedLengthFt;
    const facing = config.facing || 'up';
    const facingRotation = { up: 0, right: 90, down: 180, left: 270 }[facing] || 0;
    const children = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (children.length >= targetChairCount) break;
        let xFt = c * (chairLengthFt + seatSpacing) + chairLengthFt / 2;
        let yFt = r * (chairWidthFt + rowSpacing) + chairWidthFt / 2;
        // Keep every chair. Aisles create open space by shifting the chairs
        // on the far side of the aisle and expanding that axis of the group.
        aisles.forEach((aisle) => {
          if (aisle.direction === 'vertical' && c > aisle.gapIndex) xFt += aisle.widthFt;
          if (aisle.direction === 'horizontal' && r > aisle.gapIndex) yFt += aisle.widthFt;
        });
        children.push({
          kind: 'chair',
          x: (xFt - chairLengthFt / 2) * FEET_TO_PX,
          y: (yFt - chairWidthFt / 2) * FEET_TO_PX,
          rotation: facingRotation,
          data: {
            type: chairDef.type || 'chair',
            width: chairDef.width,
            length: chairDef.length,
            diameter: chairDef.diameter,
            color: chairDef.color,
            unit: 'ft',
            rowFacingMarker: true,
            name: chairDef.name,
          },
        });
      }
    }
    return { children, widthFt: totalWidthFt, lengthFt: totalLengthFt, baseWidthFt, baseLengthFt, chairWidthFt, chairLengthFt, seatSpacingFt: seatSpacing, rowSpacingFt: rowSpacing, rows, cols, chairCount: children.length, requestedChairCount: targetChairCount, aisles };
  }

  function buildTableSeatingGeometry(config) {
    const meta = getTableSeatingMeta(config);
    if (!meta) return null;
    const { tableDef, chairDef, rule } = meta;
    const clearanceFt = Math.max(0.25, parseFloat(config.clearanceFt) || 0.25);
    const chairDepthFt = Number(chairDef.width) || Number(chairDef.diameter) || 1.67;
    const chairWidthFt = Number(chairDef.length) || Number(chairDef.diameter) || 1.5;
    const children = [];
    const displayedMax = Number(rule.displayedMax) || 0;
    const maxCount = Number(rule.absoluteMax) || displayedMax;

    const addChairNode = (x, y, rotation) => {
      children.push({
        kind: 'chair',
        shapeType: chairDef.type === 'round' ? 'round_chair' : 'rect_chair',
        x,
        y,
        rotation: rotation || 0,
        widthFt: Number(chairDef.width) || undefined,
        lengthFt: Number(chairDef.length) || undefined,
        diameterFt: Number(chairDef.diameter) || undefined,
        centerAnchored: true,
        data: { ...chairDef, unit: 'ft' },
      });
    };

    if (rule.layout === 'halfround') {
      const tableDiameterFt = Number(tableDef.diameter) || 5;
      const radiusFt = tableDiameterFt / 2;
      const rectSeatGapFt = 0.25;
      const renderedChairDepthFt = Math.max(0.1, Number(chairDef.width) || Number(chairDef.diameter) || 1.67);
      const count = Math.max(0, Math.min(maxCount, parseInt(config.chairCount, 10) || 0));
      const totalWidthFt = radiusFt + rectSeatGapFt + renderedChairDepthFt;
      const totalLengthFt = tableDiameterFt;
      const tableCentreX = totalLengthFt * FEET_TO_PX / 2;
      // The half-round arc renders above its straight edge. Place the table
      // in the upper part of the group and keep chairs below that edge.
      const tableCentreY = (radiusFt * 2) * FEET_TO_PX;
      children.push({
        kind: 'table',
        shapeType: 'halfround_table',
        x: tableCentreX,
        y: tableCentreY,
        diameterFt: tableDiameterFt,
        centerAnchored: true,
        data: { ...tableDef, unit: 'ft' },
      });
      const straightEdgePositionsFt = distributeAlongSpan(count, tableDiameterFt, chairWidthFt);
      for (let i = 0; i < count; i += 1) {
        const x = straightEdgePositionsFt[i] * FEET_TO_PX;
        const y = (radiusFt + rectSeatGapFt + (renderedChairDepthFt / 2)) * FEET_TO_PX;
        addChairNode(x, y, 180);
      }
      return { children, widthFt: totalWidthFt, lengthFt: totalLengthFt, maxChairCount: maxCount, displayedChairCount: displayedMax };
    }

    if (rule.layout === 'round') {
      const tableDiameterFt = Number(tableDef.diameter) || 4;
      const seatRadiusFt = (tableDiameterFt / 2) + clearanceFt + (chairDepthFt / 2);
      const outerRadiusFt = seatRadiusFt + (chairDepthFt / 2);
      const count = Math.max(0, Math.min(maxCount, parseInt(config.chairCount, 10) || 0));
      const pattern = config.tableChairPattern || config.cocktailChairPattern || 'side_by_side';
      children.push({
        kind: 'table',
        shapeType: 'round_table',
        x: outerRadiusFt * FEET_TO_PX,
        y: outerRadiusFt * FEET_TO_PX,
        diameterFt: tableDiameterFt,
        centerAnchored: true,
        data: { ...tableDef, unit: 'ft' },
      });
      for (let i = 0; i < count; i += 1) {
        let angle;
        if (pattern === 'side_by_side') {
          const arcStart = Math.PI / 6;
          const arcSpan = (2 * Math.PI) / 3;
          angle = count === 1 ? (arcStart + (arcSpan / 2)) : arcStart + ((arcSpan * i) / Math.max(1, count - 1));
        } else {
          angle = (Math.PI * 2 * i) / Math.max(1, count);
        }
        const cx = outerRadiusFt * FEET_TO_PX + Math.cos(angle) * seatRadiusFt * FEET_TO_PX;
        const cy = outerRadiusFt * FEET_TO_PX + Math.sin(angle) * seatRadiusFt * FEET_TO_PX;
        addChairNode(cx, cy, (angle * 180 / Math.PI) + 90);
      }
      const totalSizeFt = outerRadiusFt * 2;
      return { children, widthFt: totalSizeFt, lengthFt: totalSizeFt, maxChairCount: maxCount, displayedChairCount: displayedMax };
    }

    if (rule.layout === 'serpentine') {
      const footprint = tableDef.footprint || {};
      const outerRadiusFt = Number(footprint.outerRadiusFt) || 5;
      const innerRadiusFt = Number(footprint.innerRadiusFt) || Math.max(0, outerRadiusFt - 2.5);
      const seatRadiusFt = outerRadiusFt + clearanceFt + (chairDepthFt / 2);
      const count = Math.max(0, Math.min(maxCount, parseInt(config.chairCount, 10) || 0));
      children.push({
        kind: 'table',
        shapeType: 'serpentine_table',
        x: outerRadiusFt * FEET_TO_PX / 2,
        y: outerRadiusFt * FEET_TO_PX / 2,
        centerAnchored: true,
        widthFt: outerRadiusFt,
        lengthFt: outerRadiusFt,
        footprint: cloneConfig(footprint),
        data: { ...tableDef, unit: 'ft' },
      });
      for (let i = 0; i < count; i += 1) {
        const angle = count === 1 ? Math.PI / 4 : (Math.PI / 12) + ((Math.PI / 2 - Math.PI / 6) * i / Math.max(1, count - 1));
        const cx = (outerRadiusFt / 2) * FEET_TO_PX + Math.cos(angle) * seatRadiusFt * FEET_TO_PX;
        const cy = (outerRadiusFt / 2) * FEET_TO_PX + Math.sin(angle) * seatRadiusFt * FEET_TO_PX;
        addChairNode(cx, cy, (angle * 180 / Math.PI) + 90);
      }
      const totalSizeFt = (seatRadiusFt * 2);
      return { children, widthFt: totalSizeFt, lengthFt: totalSizeFt, maxChairCount: maxCount, displayedChairCount: displayedMax };
    }

    const tableWidthFt = Number(tableDef.width) || 2.5;
    const tableLengthFt = Number(tableDef.length) || 6;
    const rectSeatGapFt = 0.25;
    const count = Math.max(0, Math.min(maxCount, parseInt(config.chairCount, 10) || 0));
    const totalWidthFt = tableWidthFt + (2 * rectSeatGapFt) + (2 * chairDepthFt);
    const totalLengthFt = tableLengthFt + (2 * rectSeatGapFt) + (2 * chairDepthFt);
    const centreX = totalLengthFt * FEET_TO_PX / 2;
    const centreY = totalWidthFt * FEET_TO_PX / 2;
    children.push({
      kind: 'table',
      shapeType: 'rect_table',
      x: centreX,
      y: centreY,
      widthFt: tableWidthFt,
      lengthFt: tableLengthFt,
      centerAnchored: true,
      data: { ...tableDef, unit: 'ft' },
    });
    const addSideChairs = (countForSide, horizontal, sign) => {
      if (!countForSide) return;
      const spanFt = horizontal ? tableLengthFt : tableWidthFt;
      const seatSpanFt = horizontal ? chairWidthFt : chairWidthFt;
      const positionsFt = distributeAlongSpan(countForSide, spanFt, seatSpanFt);
      for (let i = 0; i < countForSide; i += 1) {
        const offsetFt = positionsFt[i];
        const x = horizontal
          ? centreX - (tableLengthFt * FEET_TO_PX / 2) + offsetFt * FEET_TO_PX
          : centreX + sign * ((tableLengthFt / 2) + rectSeatGapFt + (chairDepthFt / 2)) * FEET_TO_PX;
        const y = horizontal
          ? centreY + sign * ((tableWidthFt / 2) + rectSeatGapFt + (chairDepthFt / 2)) * FEET_TO_PX
          : centreY - (tableWidthFt * FEET_TO_PX / 2) + offsetFt * FEET_TO_PX;
        addChairNode(x, y, horizontal ? (sign > 0 ? 180 : 0) : (sign > 0 ? 90 : -90));
      }
    };
    if (rule.layout === 'card') {
      const cardPositions = [
        { x: centreX, y: centreY - ((tableWidthFt / 2) + rectSeatGapFt + (chairDepthFt / 2)) * FEET_TO_PX, rotation: 0 },
        { x: centreX, y: centreY + ((tableWidthFt / 2) + rectSeatGapFt + (chairDepthFt / 2)) * FEET_TO_PX, rotation: 180 },
        { x: centreX - ((tableLengthFt / 2) + rectSeatGapFt + (chairDepthFt / 2)) * FEET_TO_PX, y: centreY, rotation: -90 },
        { x: centreX + ((tableLengthFt / 2) + rectSeatGapFt + (chairDepthFt / 2)) * FEET_TO_PX, y: centreY, rotation: 90 },
        { x: centreX, y: centreY - ((tableWidthFt / 2) + rectSeatGapFt + chairDepthFt) * FEET_TO_PX, rotation: 0 },
      ];
      cardPositions.slice(0, count).forEach((pos) => addChairNode(pos.x, pos.y, pos.rotation));
      return { children, widthFt: totalWidthFt, lengthFt: totalLengthFt, maxChairCount: maxCount, displayedChairCount: displayedMax };
    }

    const sideTotal = Math.max(0, Number(rule.sideTotal) || 0);
    const endTotal = Math.max(0, Number(rule.endTotal) || 0);
    let longA = 0;
    let longB = 0;
    let shortA = 0;
    let shortB = 0;

    const rectPattern = config.tableChairPattern || config.cocktailChairPattern || 'side_by_side';
    if (rectPattern === 'across') {
      if (endTotal === 0) {
        [longA, longB] = splitBetweenTwo(count);
      } else {
        const longSeats = Math.min(count, sideTotal);
        const endSeats = Math.max(0, count - sideTotal);
        [longA, longB] = splitBetweenTwo(longSeats);
        [shortA, shortB] = splitBetweenTwo(endSeats);
      }
    } else if (endTotal === 0) {
      longA = Math.min(count, sideTotal);
      longB = Math.max(0, count - longA);
    } else {
      longA = Math.min(count, Math.ceil(sideTotal / 2));
      longB = Math.min(Math.max(0, count - longA), Math.floor(sideTotal / 2));
      const remaining = Math.max(0, count - longA - longB);
      shortA = Math.min(remaining, Math.ceil(endTotal / 2));
      shortB = Math.min(Math.max(0, remaining - shortA), Math.floor(endTotal / 2));
    }

    addSideChairs(longA, true, -1);
    addSideChairs(longB, true, 1);
    addSideChairs(shortA, false, -1);
    addSideChairs(shortB, false, 1);
    return { children, widthFt: totalWidthFt, lengthFt: totalLengthFt, maxChairCount: maxCount, displayedChairCount: displayedMax };
  }

  function createGroupedSeatingLayout(config, opts = {}) {
    const geometry = config.layoutKind === 'chair_rows'
      ? buildChairRowsGeometry(config)
      : buildTableSeatingGeometry(config);
    if (!geometry) return null;
    const group = new Konva.Group({
      x: Number.isFinite(opts.x) ? opts.x : 0,
      y: Number.isFinite(opts.y) ? opts.y : 0,
      rotation: Number.isFinite(opts.rotation) ? opts.rotation : 0,
      draggable: true,
      name: 'groupedSeating',
    });
    group.setAttrs({
      customType: 'groupedSeating',
      itemType: 'groupedSeating',
      groupedLayoutKind: config.layoutKind,
      groupedConfig: { ...cloneConfig(config), chairCount: config.layoutKind === 'chair_rows' ? geometry.chairCount : config.chairCount },
      selectable: true,
      widthFt: geometry.widthFt,
      lengthFt: geometry.lengthFt,
      maxChairCount: geometry.maxChairCount,
    });
    ensureNodeId(group, 'grouped');
    geometry.children.forEach((child) => {
      const node = createGroupedSeatingChildNode(child);
      group.add(node);
    });
    (geometry.aisles || []).forEach((aisle) => {
      const bounds = chairRowsAisleVisualBounds(geometry, aisle);
      const corridor = new Konva.Rect({
        x: bounds.xFt * FEET_TO_PX,
        y: bounds.yFt * FEET_TO_PX,
        width: bounds.widthFt * FEET_TO_PX,
        height: bounds.heightFt * FEET_TO_PX,
        // Aisles are intentionally open floor area: keep a soft fill for
        // placement/edit hit testing, without a heavy outline over the chairs.
        // Keep a tiny hit fill so the transparent aisle can still be
        // double-clicked for editing without rendering a visible highlight.
        fill: 'rgba(255, 255, 255, 0.01)', strokeWidth: 0,
        listening: true, name: 'chairRowsAisle',
      });
      corridor.setAttrs({ customType: 'chairRowsAisle', aisleId: aisle.id, aisleWidthFt: aisle.widthFt, aisleDirection: aisle.direction, parentGroupedNodeId: ensureNodeId(group, 'grouped') });
      corridor.on('dblclick dbltap', (event) => { event.cancelBubble = true; editChairRowsAisleNode(corridor); });
      group.add(corridor); corridor.moveToTop();
    });
    const hitRect = new Konva.Rect({
      x: 0,
      y: 0,
      width: geometry.lengthFt * FEET_TO_PX,
      height: geometry.widthFt * FEET_TO_PX,
      fill: 'rgba(0,0,0,0.01)',
      strokeWidth: 0,
      listening: true,
      name: 'groupedSeatingHit',
    });
    group.add(hitRect);
    hitRect.moveToBottom();
    attachShapeEvents(group);
    return group;
  }

  function buildTentSetupConfig(tent, name = '') {
    if (!tent || tent.getAttr('venueType') !== 'tent') return null;
    const tentConfig = {
      type: 'tent', width: Number(tent.getAttr('widthFt')) || 10, height: Number(tent.getAttr('heightFt')) || 10,
      outline: cloneConfig(tent.getAttr('outlineSpec')), legs: cloneConfig(tent.getAttr('legsSpec')),
      tentSetupName: String(name || tent.getAttr('tentSetupName') || '').trim(),
    };
    return {
      kind: 'tentSetup',
      tent: tentConfig,
      addons: tentAddonsForTent(tent).map((node) => ({
        type: node.getAttr('itemType') || 'item', addonType: node.getAttr('addonType') || 'sidewall',
        inventoryName: node.getAttr('inventoryName') || '', inventoryCategory: node.getAttr('inventoryCategory') || '',
        familyId: node.getAttr('familyId') || '', color: node.getAttr('addonColor') || '',
        diameterFt: node.getAttr('diameterFt') || undefined, widthFt: node.getAttr('widthFt') || undefined,
        lengthFt: node.getAttr('lengthFt') || undefined, weightFootprint: cloneConfig(node.getAttr('weightFootprint')),
        attachment: cloneConfig(node.getAttr('attachment')),
      })),
    };
  }

  function placeTentSetup(config, opts = {}) {
    if (!(config && config.kind === 'tentSetup' && config.tent)) return null;
    const venueLayer = resolvePlacementLayer('venue');
    if (!venueLayer) { window.alert('Venue editing is locked. Unlock the Venue layer to place this tent setup.'); return null; }
    const venueGroup = getLayerGroup(venueLayer.id);
    if (!venueGroup) return null;
    const tent = createVenue({ ...cloneConfig(config.tent), x: Number(opts.x) || 0, y: Number(opts.y) || 0, rotation: Number(opts.rotation) || 0, tentSetupName: opts.tentSetupName !== undefined ? opts.tentSetupName : config.tent.tentSetupName });
    setNodeLayerId(tent, venueLayer.id); venueGroup.add(tent);
    const addons = [];
    (Array.isArray(config.addons) ? config.addons : []).forEach((entry) => {
      const addonType = entry.addonType || 'sidewall';
      const layer = resolvePlacementLayer(isHangingDecorAddon(addonType) ? 'decor' : 'item');
      const group = layer && getLayerGroup(layer.id);
      if (!group) return;
      const node = createTentAddonNode(cloneConfig(entry), tent, tent.position());
      if (entry.attachment) node.setAttr('attachment', cloneConfig(entry.attachment));
      setNodeLayerId(node, layer.id); group.add(node); renderTentAddonGeometry(node, tent); addons.push(node);
    });
    return { tent, addons };
  }

  function buildLayoutGroupConfig(nodes) {
    // All placement uses worldGroup-relative coordinates.  Do not use the
    // screen-space client rect here: it includes the current pan/zoom/rotation
    // and was making saved layouts land offset from the placement click.
    return layoutGroupConfigFromSnapshots(nodes.filter((node) => node && node.toObject && isLayoutGroupableNodeType(node.getAttr && node.getAttr('customType'))).map((node) => ({
      type: node.getAttr('customType'),
      json: node.toObject(),
      bounds: node.getClientRect({ relativeTo: layerRootGroup }),
    })));
  }

  function createLayoutGroup(config, opts = {}) {
    const safeConfig = config && Array.isArray(config.nodes) ? config : { nodes: [] };
    if (!safeConfig.nodes.length) return null;
    const group = new Konva.Group({
      x: Number.isFinite(opts.x) ? opts.x : 0,
      y: Number.isFinite(opts.y) ? opts.y : 0,
      rotation: Number.isFinite(opts.rotation) ? opts.rotation : 0,
      draggable: true,
      name: 'layoutGroup',
    });
    group.setAttrs({ customType: 'layoutGroup', itemType: 'layoutGroup', selectable: true, lockScaling: true, layoutGroupName: opts.name || 'Layout group', layoutGroupConfig: cloneConfig(safeConfig) });
    ensureNodeId(group, 'layout-group');
    const idMap = new Map();
    const children = [];
    safeConfig.nodes.forEach((json) => {
      try {
        const child = Konva.Node.create(cloneConfig(json));
        const sourceId = child.getAttr('templateSourceNodeId') || '';
        child.setAttr('templateSourceNodeId', sourceId);
        child.setAttr('nodeId', '');
        const newId = ensureNodeId(child, 'group-item');
        if (sourceId) idMap.set(sourceId, newId);
        child.listening(false); child.draggable(false); child.setAttr('selectable', false);
        group.add(child); children.push(child);
      } catch (error) { console.warn('Could not restore layout group item:', error); }
    });
    children.forEach((child) => {
      if (child.getAttr('customType') === 'label') {
        const oldAttachedId = child.getAttr('attachedToNodeId');
        if (oldAttachedId && idMap.has(oldAttachedId)) child.setAttr('attachedToNodeId', idMap.get(oldAttachedId));
      }
    });
    const bounds = safeConfig.bounds || { width: 72, height: 72 };
    group.setAttrs({ widthFt: (Number(bounds.width) || 72) / FEET_TO_PX, lengthFt: (Number(bounds.height) || 72) / FEET_TO_PX });
    const hit = new Konva.Rect({ x: 0, y: 0, width: Math.max(1, Number(bounds.width) || 72), height: Math.max(1, Number(bounds.height) || 72), fill: 'rgba(0,0,0,0.01)', listening: true, name: 'layoutGroupHit' });
    // Keep a single hit surface above the restored item nodes. Without this,
    // Konva can target an internal item and make a newly placed layout behave
    // as if it had already been ungrouped.
    group.add(hit); hit.moveToTop();
    hit.on('dblclick dbltap', (event) => { event.cancelBubble = true; editLayoutGroupNode(group); });
    attachShapeEvents(group);
    return group;
  }

  function ungroupLayoutGroups() {
    const groups = selectedItems.filter((node) => node && node.getAttr && node.getAttr('customType') === 'layoutGroup');
    if (!groups.length) { window.alert('Select a saved layout group first.'); return; }
    const restored = [];
    const restoredAttachedLabels = [];
    groups.forEach((group) => {
      const layerId = group.getAttr('layerId');
      const parent = getLayerGroup(layerId);
      if (!parent) return;
      const labelLayer = getLabelLayer();
      const labelParent = labelLayer && getLayerGroup(labelLayer.id);
      const angle = (group.rotation() || 0) * Math.PI / 180;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      collectionToArray(group.getChildren()).filter((child) => !child.hasName('layoutGroupHit')).forEach((child) => {
        const point = child.position();
        const isAttachedLabel = child.getAttr('customType') === 'label' && !!child.getAttr('attachedToNodeId');
        child.position({ x: group.x() + point.x * cos - point.y * sin, y: group.y() + point.x * sin + point.y * cos });
        child.rotation((child.rotation() || 0) + (group.rotation() || 0));
        child.moveTo(isAttachedLabel && labelParent ? labelParent : parent);
        const targetLayerId = isAttachedLabel && labelLayer ? labelLayer.id : layerId;
        child.listening(true); child.draggable(true); child.setAttr('selectable', true); child.setAttr('layerId', targetLayerId);
        attachShapeEvents(child);
        if (isAttachedLabel) restoredAttachedLabels.push(child);
        else restored.push(child);
      });
      group.destroy();
    });
    // Attached labels are item metadata. Restore them to the Labels layer and
    // re-sync after their parent items are top-level nodes again, rather than
    // leaving a draggable label separated in the former group layer.
    restoredAttachedLabels.forEach((label) => {
      const parent = getNodeById(label.getAttr('attachedToNodeId'));
      if (parent) syncAttachedLabelsForNode(parent);
    });
    selectedItems = restored;
    updateFloorZOrder(); updateTransformer(); refreshInventoryPanelUI(); renderLayersPanel(); ensureLayerOrder(); worldLayer.draw(); setDirty(true);
  }

  function saveSelectedLayoutGroup() {
    const selected = selectedItems.slice();
    if (!selected.length) { window.alert('Select one or more items first.'); return; }
    const tents = selected.filter((node) => node && node.getAttr && node.getAttr('customType') === 'venue' && node.getAttr('venueType') === 'tent');
    if (tents.length) {
      if (tents.length !== 1 || selected.some((node) => {
        const type = node && node.getAttr ? node.getAttr('customType') : '';
        return type !== 'venue' && !(type === 'tentAddon' && node.getAttr('parentTentNodeId') === tents[0].getAttr('nodeId'));
      })) { window.alert('Save one tent at a time. Its attached add-ons are included automatically.'); return; }
      requestLayoutGroupName('Tent setup name', String(tents[0].getAttr('tentSetupName') || ''), (prompted) => {
        const name = prompted.trim() || `${tentDisplayName(tents[0])} Setup`;
        const config = buildTentSetupConfig(tents[0], name);
        const template = { id: `layout-group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, config };
        layoutGroupTemplates.push(template);
        if (!writeLayoutGroupTemplates()) { layoutGroupTemplates.pop(); return; }
        tents[0].setAttr('tentSetupName', name);
        renderLayoutGroupButtons(); refreshInventoryPanelUI(); setDirty(true);
      });
      return;
    }
    if (selected.some((node) => ['venue', 'referenceImage', 'layoutGroup'].includes(node.getAttr && node.getAttr('customType')))) {
      window.alert('Layout groups can contain inventory items, flooring, seating, and labels. Ungroup existing groups first; venues and reference images stay outside layout groups.');
      return;
    }
    const included = selected.slice();
    selected.forEach((node) => {
      const nodeId = node.getAttr && node.getAttr('nodeId');
      if (nodeId) findAttachedLabels(nodeId).forEach((label) => { if (!included.includes(label)) included.push(label); });
    });
    const config = buildLayoutGroupConfig(included);
    if (!config) { window.alert('No supported items were selected.'); return; }
    requestLayoutGroupName('Layout group name', '', (prompted) => {
      const name = prompted.trim(); if (!name) return;
      const template = { id: `layout-group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, config };
      layoutGroupTemplates.push(template);
      if (!writeLayoutGroupTemplates()) { layoutGroupTemplates.pop(); return; }
      renderLayoutGroupButtons();
    });
  }

  function attachShapeEvents(shape) {
    // Avoid duplicate handlers
    shape.off('mousedown touchstart mousemove touchmove dragstart dragmove dragend transformend dblclick dbltap');
    ensureLightPostHitArea(shape);
    ensureSelectableGroupHitArea(shape);
    if (isLightPost(shape) && shape.dragBoundFunc) shape.dragBoundFunc((position) => constrainLightPostPosition(shape, position));

    // Tent hit areas can consume the stage mousemove event. Keep add-on ghosts
    // live while the pointer is over the tent itself as well as empty canvas.
    shape.on('mousemove touchmove', (event) => {
      if (usesTouchAddonPreview() && touchAddonPreviewActive && isTouchPlacementEvent(event && event.evt)) {
        const point = plannerWorldPointFromDomEvent(event.evt) || worldGroup.getRelativePointerPosition();
        if (point) updatePlacementPreview(point);
        if (event.evt && event.evt.preventDefault) event.evt.preventDefault();
        event.cancelBubble = true;
        return;
      }
      if (activeTool === 'place' && placementPayload && placementPayload.kind === 'tentAddon') {
        const point = plannerWorldPointFromDomEvent(event && event.evt);
        if (point) updatePlacementPreview(point);
      }
      if (activeTool === 'place' && placementPayload && placementPayload.kind === 'chairRowsAisle') {
        const point = plannerWorldPointFromDomEvent(event && event.evt) || worldGroup.getRelativePointerPosition();
        if (point) updatePlacementPreview(point);
      }
      if (activeTool === 'label' && shape.getAttr && shape.getAttr('customType') !== 'label' && isSelectableNode(shape)) showLabelAttachmentPreview(shape);
    });

    // Selection via click
    shape.on('mousedown touchstart', (e) => {
      const touchPoint = plannerWorldPointFromDomEvent(e.evt) || worldGroup.getRelativePointerPosition();
      if (moveTouchAddonPreview(e.evt, touchPoint)) {
        e.cancelBubble = true;
        return;
      }
      if (isSyntheticPlacementMouseEvent(e.evt)) {
        e.cancelBubble = true;
        return;
      }
      if (usesCursorPlacementPreview()) {
        const placementPoint = plannerWorldPointFromDomEvent(e.evt) || worldGroup.getRelativePointerPosition();
        if (handleTouchPreviewPlacement(e.evt, placementPoint)) {
          e.cancelBubble = true;
          return;
        }
      }
      if (isPipeDrapePlacement()) {
        e.cancelBubble = true;
        const point = worldGroup.getRelativePointerPosition();
        if (point) handlePipeDrapePoint(point, e.evt && e.evt.detail ? e.evt.detail : 1, !!(e.evt && e.evt.shiftKey));
        return;
      }
      if (isFencePlacement()) {
        e.cancelBubble = true;
        const point = worldGroup.getRelativePointerPosition();
        if (point) handleFencePoint(point, e.evt && e.evt.detail ? e.evt.detail : 1, !!(e.evt && e.evt.shiftKey));
        return;
      }
      if (isDrawnRunPlacement()) {
        e.cancelBubble = true;
        const point = worldGroup.getRelativePointerPosition();
        if (point) handleDrawnRunPoint(point, e.evt && e.evt.detail ? e.evt.detail : 1, !!(e.evt && e.evt.shiftKey));
        return;
      }
      if (isCustomBistroPlacement()) {
        e.cancelBubble = true;
        const point = worldGroup.getRelativePointerPosition();
        if (point) handleCustomBistroPoint(point, e.evt && e.evt.detail ? e.evt.detail : 1, !!(e.evt && e.evt.shiftKey), shape.getAttr && shape.getAttr('customType') === 'tentAddon' ? shape : null);
        return;
      }
      if (activeTool === 'select' && shape.getAttr && shape.getAttr('customType') === 'tentAddon' && shape.getAttr('addonType') === 'customBistro') {
        if (!isSelectableNode(shape)) return;
        e.cancelBubble = true;
        const point = worldGroup.getRelativePointerPosition();
        if (point) selectCustomBistroString(shape, point);
        return;
      }
      if (activeTool === 'place' && placementPayload && placementPayload.kind === 'tentAddon') {
        if (shape.getAttr && shape.getAttr('customType') === 'venue' && shape.getAttr('venueType') === 'tent' && isSelectableNode(shape)) {
          e.cancelBubble = true;
          const point = placementPreviewPoint || plannerWorldPointFromDomEvent(e.evt) || worldGroup.getRelativePointerPosition();
          if (point && isBulkLegPlacement()) beginBulkLegPlacement(point);
          else if (point && placementPayload.addonType === 'weight' && e.evt && e.evt.shiftKey) placeFreeWeightAt(point);
          else if (point) placeTentAddonOnTent(shape, point, { freePlacement: !!(e.evt && e.evt.shiftKey) });
        }
        return;
      }
      if (activeTool === 'label') {
        e.cancelBubble = true;
        if (shape.getAttr && shape.getAttr('customType') === 'label') {
          setActiveTool('select'); clearSelection(); selectedItems = [shape]; updateTransformer(); return;
        }
        if (labelPlacementDraft) {
          const pointer = worldGroup.getRelativePointerPosition();
          if (pointer) placeAttachedLabelDraft(shape, pointer);
          return;
        }
        if (!isSelectableNode(shape)) return;
        beginLabelPlacementTool();
        return;
      }
      if (activeTool !== 'select') return;
      e.cancelBubble = true;
      if (!isSelectableNode(shape)) return;
      if (!(shape.getAttr && shape.getAttr('customType') === 'label')) hideLabelGear();

      // Shift-click toggles selection
      if (shiftPressed || (e.evt && e.evt.shiftKey)) {
        const idx = selectedItems.indexOf(shape);
        if (idx >= 0) selectedItems.splice(idx, 1);
        else selectedItems.push(shape);
      } else {
        // single click selects only this shape (unless it's already part of selection)
        if (!selectedItems.includes(shape)) {
          clearSelection();
          selectedItems.push(shape);
        }
      }
      updateTransformer();
    });

    // --- Hold-and-Drop multi-drag system ---
    shape.on('dragstart', (e) => {
      if (!isSelectableNode(shape)) return;
      if (shape.getAttr && shape.getAttr('customType') === 'pipeDrapeChain') closePipeDrapeEdit();
      hideLabelGear();
      if (isLightPost(shape)) refreshStandaloneLightConnections();
      if (!(selectedItems.length > 1 && selectedItems.includes(shape)) && beginStandaloneLightAssemblyDrag(shape)) return;
      // Tent add-ons are attached objects, not free canvas items. Their own
      // drag path below derives a new attachment from the pointer and keeps
      // the node on its parent tent.
      if (shape.getAttr && shape.getAttr('customType') === 'tentAddon') return;

      // only if multiple selected and this one is in that selection
      if (!(selectedItems.length > 1 && selectedItems.includes(shape))) return;
      multiDragActive = true;
      dragAnchorNode = shape;

      // store local starting positions for all selected shapes
      initialPosMap.clear();
      selectedItems.forEach((n) => {
        initialPosMap.set(n, n.position());
      });
      selectedItems.filter(isStandaloneBistroRun).forEach((run) => {
        linkedLightPosts(run).forEach((post) => {
          if (!initialPosMap.has(post)) initialPosMap.set(post, post.position());
        });
      });

      const dragStart = worldGroup.getRelativePointerPosition();
      if (shiftPressed && snapToGrid) captureSnapAnchorFromPointer();

      // track pointer move while mouse held
      function onPointerMove() {
        const pNow = worldGroup.getRelativePointerPosition();
        if (!pNow || !dragStart) return;

        const dx = pNow.x - dragStart.x;
        const dy = pNow.y - dragStart.y;

        selectedItems.forEach((n) => {
          const start = initialPosMap.get(n);
          if (!start) return;
          n.position({ x: start.x + dx, y: start.y + dy });
        });

        initialPosMap.forEach((start, node) => {
          if (selectedItems.includes(node)) return;
          node.position({ x: start.x + dx, y: start.y + dy });
        });
        syncBistroRunsForPosts(Array.from(initialPosMap.keys()).filter(isLightPost), new Set(selectedItems.filter(isStandaloneBistroRun)));

        worldLayer.batchDraw();
      }

      function onPointerUp() {
        stage.off('mousemove touchmove', onPointerMove);
        stage.off('mouseup touchend', onPointerUp);

        transformer.nodes(selectedItems);
        if (!shiftPressed) clearSnapAnchor();
        worldLayer.draw();
      }

      stage.on('mousemove touchmove', onPointerMove);
      stage.on('mouseup touchend', onPointerUp);
    });


    // During multi-drag we handle movement in onPointerMove above. For individual drags, just redraw.
    shape.on('dragmove', () => {
      if (!multiDragActive) {
        if (shape.getAttr && shape.getAttr('customType') === 'label' && shape.getAttr('labelMode') === 'attached') syncAttachedLabelOffset(shape);
        if (standaloneLightAssemblyDrag && standaloneLightAssemblyDrag.run === shape) updateStandaloneLightAssemblyDrag(shape);
        if (isLightPost(shape)) syncBistroRunsForPosts([shape]);
        if (shape.getAttr && shape.getAttr('customType') === 'tentAddon') {
          const pointer = worldGroup.getRelativePointerPosition();
          if (pointer) {
            shape.setAttr('tentAddonDragPoint', pointer);
            if (shape.getAttr('addonType') === 'sidewall') {
              shape.opacity(.18);
              renderSidewallDragPreview(shape, pointer);
            } else {
              updateTentAddonAttachmentFromPoint(shape, pointer);
            }
          }
        }
        syncAttachedLabelsForNode(shape);
        if (shape.getAttr && shape.getAttr('customType') === 'venue' && shape.getAttr('venueType') === 'tent') syncTentAddonsForTent(shape);
        if (shape.getAttr && shape.getAttr('isFlooring') && shape.getAttr('floorCategory') === 'stage') syncStageAddonsForStage(shape);
        worldLayer.batchDraw();
      }
    });

    // --- Drag end behavior (fixed so pasted groups stay selected) ---
    shape.on('dragend', (e) => {
      // If a multi-drag is active, don't clear selection — keep all selected
      if (multiDragActive && selectedItems.length > 1) {
        snapSelectionToGrid(dragAnchorNode || shape);
        selectedItems.filter(isLightPost).forEach((post) => constrainLightPostToConnectedSpans(post));
        selectedItems.filter(isStandaloneBistroRun).forEach((run) => syncBistroRunPostsFromRun(run));
        syncBistroRunsForPosts(selectedItems.filter(isLightPost));
        selectedItems.forEach((n) => n.draggable(true));
        multiDragActive = false;
        dragAnchorNode = null;
        initialPosMap.clear();
        if (!shiftPressed) clearSnapAnchor();

        transformer.nodes(selectedItems);
        selectedItems.forEach((n) => {
          syncAttachedLabelsForNode(n);
          if (n.getAttr && n.getAttr('customType') === 'venue' && n.getAttr('venueType') === 'tent') syncTentAddonsForTent(n);
          if (n.getAttr && n.getAttr('isFlooring') && n.getAttr('floorCategory') === 'stage') syncStageAddonsForStage(n);
          if (n.getAttr && n.getAttr('customType') === 'referenceImage' && n.getAttr('referenceGridFitted')) fitGridToReference(n);
        });
        worldLayer.draw();
        refreshInventoryPanelUI();
        setDirty(true);
        return; // ✅ skip normal single deselection
      }

      // Single-shape drag ends here (original behavior)
      multiDragActive = false;
      dragAnchorNode = null;
      initialPosMap.clear();
      if (shape.getAttr && shape.getAttr('customType') === 'tentAddon') {
        const pointer = shape.getAttr('tentAddonDragPoint') || worldGroup.getRelativePointerPosition();
        if (pointer) updateTentAddonAttachmentFromPoint(shape, pointer);
        shape.setAttr('tentAddonDragPoint', null);
        if (shape.getAttr('addonType') === 'sidewall') clearSidewallDragPreview(shape);
      }
      if (!(shape.getAttr && shape.getAttr('customType') === 'tentAddon') && !(shape.getAttr && shape.getAttr('customType') === 'label' && shape.getAttr('labelMode') === 'attached')) snapNodeToGrid(shape);
      if (shape.getAttr && shape.getAttr('customType') === 'label' && shape.getAttr('labelMode') === 'attached') syncAttachedLabelOffset(shape);
      if (isStandaloneBistroRun(shape)) finishStandaloneLightAssemblyDrag(shape);
      if (isLightPost(shape)) { constrainLightPostToConnectedSpans(shape); syncBistroRunsForPosts([shape]); }
      if (shape.getAttr && shape.getAttr('customType') === 'referenceImage' && shape.getAttr('referenceGridFitted')) fitGridToReference(shape);
      if (!(shape.getAttr && shape.getAttr('customType') === 'label')) syncAttachedLabelsForNode(shape);
      if (shape.getAttr && shape.getAttr('customType') === 'venue' && shape.getAttr('venueType') === 'tent') syncTentAddonsForTent(shape);
      if (shape.getAttr && shape.getAttr('isFlooring') && shape.getAttr('floorCategory') === 'stage') syncStageAddonsForStage(shape);
      if (!shiftPressed) clearSnapAnchor();
      transformer.nodes(selectedItems);
      worldLayer.draw();
      refreshInventoryPanelUI();
      setDirty(true);
    });

    shape.on('transformend', () => {
      hideLabelGear();
      if (isStandaloneBistroRun(shape)) finalizeStandaloneLightRunTransform(shape);
      if (isLightPost(shape)) syncBistroRunsForPosts([shape]);
      syncAttachedLabelsForNode(shape);
      if (shape.getAttr && shape.getAttr('customType') === 'venue' && shape.getAttr('venueType') === 'tent') syncTentAddonsForTent(shape);
      if (shape.getAttr && shape.getAttr('isFlooring') && shape.getAttr('floorCategory') === 'stage') syncStageAddonsForStage(shape);
      worldLayer.draw();
      refreshInventoryPanelUI();
      setDirty(true);
    });

    shape.on('dblclick dbltap', (event) => {
      const eventTarget = event && event.target ? event.target : null;
      if (eventTarget && eventTarget.getAttr && eventTarget.getAttr('customType') === 'chairRowsAisle') {
        editChairRowsAisleNode(eventTarget);
        if (event.evt && event.evt.preventDefault) event.evt.preventDefault();
        event.cancelBubble = true;
        return;
      }
      if (activeTool === 'select' && editDoubleClickTarget(eventTarget || shape)) {
        if (event.evt && event.evt.preventDefault) event.evt.preventDefault();
        event.cancelBubble = true;
        return;
      }
      if (activeTool === 'select' && shape.getAttr && shape.getAttr('customType') === 'pipeDrapeChain') {
        resumePipeDrapeChain(shape);
        return;
      }
      if (activeTool === 'select' && shape.getAttr && shape.getAttr('customType') === 'fenceChain') {
        resumeFenceChain(shape);
        return;
      }
      if (activeTool === 'select' && shape.getAttr && shape.getAttr('customType') === 'drawnRun' && shape.getAttr('drawMode') === 'bistro') {
        resumeBistroLightRun(shape);
        return;
      }
      if (activeTool === 'select' && shape.getAttr && shape.getAttr('customType') === 'tentAddon' && shape.getAttr('addonType') === 'customBistro') {
        const point = worldGroup.getRelativePointerPosition();
        if (point) continueCustomBistroAtPoint(shape, point);
        return;
      }
      if (activeTool === 'select' && shape.getAttr && shape.getAttr('customType') === 'tentAddon' && shape.getAttr('addonType') === 'perimeterLight') {
        showPlannerToast('Perimeter lights follow the tent automatically. Select and Delete to remove them; resizing or moving the tent updates the run.');
        return;
      }
      if (shape.getAttr && shape.getAttr('customType') === 'label') {
        if (activeTool !== 'select') setActiveTool('select');
        clearSelection(); selectedItems = [shape]; updateTransformer(); editSelectedLabel();
      }
    });
  }

  // View helpers
  function navZoom(factor) {
    return zoomView({ worldGroup, worldLayer, stage, minScale: MIN_SCALE, maxScale: MAX_SCALE }, factor);
  }
  function navPan(dx, dy) { return panView({ worldGroup, worldLayer }, dx, dy); }
  function navRotate(deg) {
    return rotateView({ worldGroup, worldLayer, stage }, deg);
  }
  function navReset() { return resetView({ worldGroup, worldLayer }); }

  function populateGroupedSeatingControls() {
    const supportedTables = tableInventoryCache.filter((entry) => entry && !entry.hiddenFromPanel && (entry.type === 'round' || entry.type === 'table' || entry.type === 'halfround'));
    const chairs = chairInventoryCache.filter((entry) => entry && !entry.hiddenFromPanel && !isDirectorsChair(entry));
    if (chairRowsChairTypeEl) {
      chairRowsChairTypeEl.innerHTML = chairs.map((entry) => `<option value="${entry.name}">${entry.name}</option>`).join('');
    }
    if (tableSeatingChairTypeEl) {
      tableSeatingChairTypeEl.innerHTML = chairs.map((entry) => `<option value="${entry.name}">${entry.name}</option>`).join('');
    }
    if (tableSeatingTableTypeEl) {
      tableSeatingTableTypeEl.innerHTML = supportedTables.map((entry) => {
        const idx = tableInventoryCache.indexOf(entry);
        return `<option value="${idx}">${entry.name}</option>`;
      }).join('');
      const initialTable = getTableDefinitionFromConfig({ tableKey: tableSeatingTableTypeEl.value });
      if (getTableSeatingRule(initialTable).layout === 'round') currentTableChairPattern = 'across';
    }
    updateTableSeatingCapacity();
  }

  function isDirectorsChair(entry) {
    return !!(entry && /director/i.test(String(entry.name || '')));
  }

  function isBarstool(entry) {
    return !!(entry && (entry.category === 'stool' || entry.type === 'round' || /barstool/i.test(String(entry.name || ''))));
  }

  function isKidsChair(entry) {
    return !!(entry && (entry.category === 'kids' || /kids chair|high chair/i.test(String(entry.name || ''))));
  }

  function refreshTableSeatingChairOptions(tableDef) {
    if (!tableSeatingChairTypeEl) return;
    const highCocktail = !!(tableDef && tableDef.category === 'cocktail' && currentCocktailHeightMode === 'H');
    const kidsTable = !!(tableDef && tableDef.category === 'kids');
    const chairs = chairInventoryCache.filter((entry) => {
      if (!entry || entry.hiddenFromPanel || isDirectorsChair(entry)) return false;
      if (kidsTable) return isKidsChair(entry);
      if (isKidsChair(entry)) return false;
      return highCocktail ? isBarstool(entry) : !isBarstool(entry);
    });
    const current = tableSeatingChairTypeEl.value;
    tableSeatingChairTypeEl.innerHTML = chairs.map((entry) => `<option value="${entry.name}">${entry.name}</option>`).join('');
    if (chairs.some((entry) => entry.name === current)) tableSeatingChairTypeEl.value = current;
    else if (chairs[0]) tableSeatingChairTypeEl.value = chairs[0].name;
  }

  function updateTableSeatingCapacity() {
    if (!tableSeatingCapacityEl || !tableSeatingTableTypeEl || !tableSeatingChairTypeEl || !tableSeatingChairCountEl) return;
    const meta = getTableSeatingMeta({ tableKey: tableSeatingTableTypeEl.value, chairName: tableSeatingChairTypeEl.value });
    const displayedMax = meta && meta.rule ? meta.rule.displayedMax : 6;
    const absoluteMax = meta && meta.rule ? meta.rule.absoluteMax : displayedMax;
    const tableDef = meta ? meta.tableDef : null;
    const showCocktailControls = !!(tableDef && tableDef.category === 'cocktail');
    refreshTableSeatingChairOptions(tableDef);
    const forceSideBySide = !!(meta && meta.rule && meta.rule.layout === 'halfround');
    if (forceSideBySide) currentTableChairPattern = 'side_by_side';
    tableSeatingChairCountEl.max = String(absoluteMax);
    const current = Math.max(0, Math.min(absoluteMax, parseInt(tableSeatingChairCountEl.value, 10) || 0));
    tableSeatingChairCountEl.value = String(current);
    tableSeatingCapacityEl.textContent = `Max: ${displayedMax}`;
    if (cocktailHeightModeFieldEl) cocktailHeightModeFieldEl.style.display = showCocktailControls ? '' : 'none';
    if (tableChairPatternFieldEl) tableChairPatternFieldEl.style.display = '';
    setToggleGroupValue(cocktailHeightModeToggleEl, currentCocktailHeightMode);
    setToggleGroupValue(tableChairPatternToggleEl, currentTableChairPattern, { disabledValue: forceSideBySide ? 'across' : null });
  }

  function armChairRowsPlacement() {
    // A new placement must never inherit (or replace) the last chair-row group
    // opened in the editor. That state belongs only to the editor itself.
    clearChairRowsEditState();
    const mode = chairRowsModeEl ? chairRowsModeEl.value : 'free';
    const total = Math.max(1, parseInt(chairRowsTotalEl && chairRowsTotalEl.value, 10) || 1);
    let rows = Math.max(1, parseInt(chairRowsCountRowsEl && chairRowsCountRowsEl.value, 10) || 1);
    let cols = Math.max(1, parseInt(chairRowsCountColsEl && chairRowsCountColsEl.value, 10) || 1);
    if (mode === 'total') {
      if (chairRowsTotalLastChanged === 'cols') rows = Math.max(1, Math.ceil(total / cols));
      else cols = Math.max(1, Math.ceil(total / rows));
    }
    const seatSpacingFt = Math.max(0, parseFloat(chairRowsSeatSpacingEl && chairRowsSeatSpacingEl.value) || 0);
    const rowSpacingFt = Math.max(0, parseFloat(chairRowsRowSpacingEl && chairRowsRowSpacingEl.value) || 0);
    const chairName = chairRowsChairTypeEl ? chairRowsChairTypeEl.value : '';
    const aisles = [];
    const facing = chairRowsFacingEl ? chairRowsFacingEl.value : 'up';
    const config = { layoutKind: 'chair_rows', chairName, mode, totalChairs: mode === 'total' ? total : rows * cols, rows, cols, seatSpacingFt, rowSpacingFt, facing, aislesEnabled: false, aisleCount: 0, aisles };
    const geometry = buildChairRowsGeometry(config);
    if (!geometry) {
      window.alert('Could not build chair rows with the current settings.');
      return;
    }
    armPlacementTool({
      kind: 'groupedSeating',
      label: `Chair rows ${rows}x${cols}`,
      widthFt: geometry.widthFt,
      lengthFt: geometry.lengthFt,
      groupedConfig: config,
    }, chairRowsPlaceBtn);
  }

  function chairRowsGroupAtPoint(point) {
    let match = null;
    forEachNode((node) => {
      if (match || !(node && node.getAttr && node.getAttr('customType') === 'groupedSeating' && node.getAttr('groupedLayoutKind') === 'chair_rows')) return;
      const width = (Number(node.getAttr('lengthFt')) || 1) * FEET_TO_PX;
      const height = (Number(node.getAttr('widthFt')) || 1) * FEET_TO_PX;
      const local = chairRowsWorldPointToLocal(node, point);
      if (local.x >= 0 && local.x <= width && local.y >= 0 && local.y <= height) match = node;
    });
    return match;
  }

  function chairRowsWorldPointToLocal(group, point) {
    const angle = -((Number(group && group.rotation && group.rotation()) || 0) * Math.PI / 180);
    const dx = point.x - group.x(); const dy = point.y - group.y();
    return { x: dx * Math.cos(angle) - dy * Math.sin(angle), y: dx * Math.sin(angle) + dy * Math.cos(angle) };
  }

  function chairRowsLocalPointToWorld(group, point) {
    const angle = (Number(group && group.rotation && group.rotation()) || 0) * Math.PI / 180;
    return { x: group.x() + point.x * Math.cos(angle) - point.y * Math.sin(angle), y: group.y() + point.x * Math.sin(angle) + point.y * Math.cos(angle) };
  }

  function chairRowsAisleCandidate(group, point) {
    if (!(group && point)) return null;
    const config = group.getAttr('groupedConfig') || {};
    const chair = getChairDefinitionByName(config.chairName);
    if (!chair) return null;
    const rows = Math.max(1, parseInt(config.rows, 10) || 1); const cols = Math.max(1, parseInt(config.cols, 10) || 1);
    const chairW = Number(chair.width) || 1.67; const chairL = Number(chair.length) || Number(chair.diameter) || 1.5;
    const seatGap = Math.max(0, Number(config.seatSpacingFt) || 0);
    const rowGap = Math.max(0, Number(config.rowSpacingFt) || 0);
    const direction = chairRowsAisleDirectionEl && chairRowsAisleDirectionEl.value === 'horizontal' ? 'horizontal' : 'vertical';
    const aisleWidthFt = Math.min(20, Math.max(2, Number(chairRowsAisleDistanceEl && chairRowsAisleDistanceEl.value) || 4));
    const localPoint = chairRowsWorldPointToLocal(group, point);
    const totalLength = cols * chairL + Math.max(0, cols - 1) * (Number(config.seatSpacingFt) || 0);
    const totalWidth = rows * chairW + Math.max(0, rows - 1) * (Number(config.rowSpacingFt) || 0);
    const vertical = direction === 'vertical';
    const gapCount = (vertical ? cols : rows) - 1;
    const spacingFt = vertical ? seatGap : rowGap;
    const footprintFt = vertical ? chairL : chairW;
    const pointerFt = (vertical ? localPoint.x : localPoint.y) / FEET_TO_PX;
    const baseSpanFt = vertical ? totalLength : totalWidth;
    if (gapCount < 1 || spacingFt <= 0) return null;
    const existingAisles = normaliseChairRowsAisles(config);
    const best = chairRowsNearestAvailableGap(pointerFt, { gapCount, footprintFt, spacingFt }, existingAisles, direction);
    if (!best) return null;
    const baseCenterFt = chairRowsGapCenterFt(best.gapIndex, footprintFt, spacingFt);
    return {
      id: `aisle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      direction,
      widthFt: aisleWidthFt,
      gapIndex: best.gapIndex,
      position: Math.max(0, Math.min(1, baseCenterFt / baseSpanFt)),
    };
  }

  function armChairRowsAislePlacement() {
    clearPlacementState();
    // The transformer uses an invisible full-area drag surface. It must not
    // cover the chair rows while aisle placement is active, or the second and
    // later aisle interactions move/capture the rebuilt group instead.
    clearSelection();
    placementPayload = { kind: 'chairRowsAisle', widthFt: Math.min(20, Math.max(2, Number(chairRowsAisleDistanceEl && chairRowsAisleDistanceEl.value) || 4)) };
    activePlacementButton = chairRowsAddAisleBtn;
    placementPreview = new Konva.Rect({ listening: false, fill: 'rgba(255,193,7,.18)', strokeWidth: 0 });
    uiGroup.add(placementPreview); placementPreview.hide();
    activeTool = 'place'; worldGroup.draggable(false); syncToolStateUI();
    showPlannerToast('Move over a chair-row gap to preview an aisle; click once to place. Escape cancels.');
  }

  function addChairRowsAisle(group, candidate) {
    if (!candidate) return;
    const config = cloneConfig(group.getAttr('groupedConfig')) || {};
    config.aisles = Array.isArray(config.aisles) ? config.aisles : [];
    config.aisles.push(candidate); config.aislesEnabled = true; config.aisleCount = config.aisles.length;
    const parent = group.getParent(); if (!parent) return;
    const rebuilt = createGroupedSeatingLayout(config, { x: group.x(), y: group.y(), rotation: group.rotation() });
    if (!rebuilt) return;
    setNodeLayerId(rebuilt, group.getAttr('layerId')); parent.add(rebuilt); group.destroy();
    // Keep the placement surface unobstructed while the aisle tool remains
    // armed. Selection can resume normally after the user exits the tool.
    selectedItems = []; transformer.nodes([]); refreshInventoryPanelUI(); worldLayer.draw(); setDirty(true);
  }

  function editChairRowsAisleNode(aisleNode) {
    const group = aisleNode && aisleNode.getParent ? aisleNode.getParent() : null;
    if (!(group && group.getAttr && group.getAttr('groupedLayoutKind') === 'chair_rows')) return;
    chairRowsEditingAisle = { group, aisleId: aisleNode.getAttr('aisleId') };
    const aisle = (group.getAttr('groupedConfig').aisles || []).find((entry) => entry.id === chairRowsEditingAisle.aisleId);
    if (chairRowsAisleDistanceEl && aisle) chairRowsAisleDistanceEl.value = aisle.widthFt || 4;
    if (aisle) showChairRowsAisleEditPopup(aisleNode, aisle);
  }

  function updateEditedChairRowsAisle(values = {}) {
    const group = chairRowsEditingAisle.group;
    if (!(group && group.getAttr && chairRowsAisleDistanceEl)) return;
    const config = cloneConfig(group.getAttr('groupedConfig')) || {};
    const aisle = (config.aisles || []).find((entry) => entry.id === chairRowsEditingAisle.aisleId);
    if (!aisle) return;
    aisle.widthFt = Math.min(20, Math.max(2, Number(values.widthFt ?? chairRowsAisleDistanceEl.value) || 4));
    const parent = group.getParent(); if (!parent) return;
    const rebuilt = createGroupedSeatingLayout(config, { x: group.x(), y: group.y(), rotation: group.rotation() });
    if (!rebuilt) return;
    setNodeLayerId(rebuilt, group.getAttr('layerId')); parent.add(rebuilt); group.destroy(); chairRowsEditingAisle = { group: rebuilt, aisleId: aisle.id }; selectedItems = [rebuilt]; updateTransformer(); refreshInventoryPanelUI(); worldLayer.draw(); setDirty(true);
    const rebuiltAisle = collectionToArray(rebuilt.getChildren()).find((node) => node.getAttr && node.getAttr('customType') === 'chairRowsAisle' && node.getAttr('aisleId') === aisle.id);
    if (rebuiltAisle) showChairRowsAisleEditPopup(rebuiltAisle, aisle);
  }

  function editChairRowsGroup(node) {
    const config = cloneConfig(node && node.getAttr ? node.getAttr('groupedConfig') : null);
    if (!(config && config.layoutKind === 'chair_rows')) return;
    if (chairRowsModeEl) chairRowsModeEl.value = config.mode || 'free';
    if (chairRowsChairTypeEl) chairRowsChairTypeEl.value = config.chairName || chairRowsChairTypeEl.value;
    if (chairRowsTotalEl) chairRowsTotalEl.value = config.totalChairs || config.chairCount || 1;
    if (chairRowsCountRowsEl) chairRowsCountRowsEl.value = config.rows || 1;
    if (chairRowsCountColsEl) chairRowsCountColsEl.value = config.cols || 1;
    if (chairRowsSeatSpacingEl) chairRowsSeatSpacingEl.value = config.seatSpacingFt ?? .5;
    if (chairRowsRowSpacingEl) chairRowsRowSpacingEl.value = config.rowSpacingFt ?? 1;
    if (chairRowsFacingEl) chairRowsFacingEl.value = config.facing || 'up';
    syncChairRowsMode();
    groupedSeatingEditNode = node;
    chairRowsConfigOverride = config;
    showChairRowsEditPopup(node, config);
  }

  function clearChairRowsEditState() {
    groupedSeatingEditNode = null;
    chairRowsConfigOverride = null;
  }

  function hideChairRowsEditPopup() {
    const popup = document.getElementById('chairRowsEditPopup');
    if (popup) popup.remove();
  }

  function closeChairRowsEditPopup() {
    hideChairRowsEditPopup();
    clearChairRowsEditState();
  }

  function showChairRowsEditPopup(node, config) {
    hideChairRowsEditPopup();
    if (!(node && node.getClientRect)) return;
    const geometry = buildChairRowsGeometry(config);
    const popup = document.createElement('div');
    popup.id = 'chairRowsEditPopup';
    popup.className = 'chair-rows-edit-popup';
    const chairs = Number((geometry && geometry.chairCount) || config.chairCount || 0);
    const aisleFields = (Array.isArray(config.aisles) ? config.aisles : []).map((aisle, index) => {
      const aisleId = escapeHtml(String(aisle.id || index));
      return `<label>Aisle ${index + 1} name<input data-chair-aisle-name="${aisleId}" type="text" value="${escapeHtml(String(aisle.name || ''))}" placeholder="Aisle ${index + 1}"></label><label>Aisle ${index + 1} ft<input data-chair-aisle-width="${aisleId}" type="number" min="2" max="20" step="1" value="${Number(aisle.widthFt) || 4}"></label>`;
    }).join('');
    popup.innerHTML = `<button type="button" class="chair-edit-close" aria-label="Close">×</button><div class="popup-title">Edit Labels</div>
      <div class="chair-edit-grid">
        <label>Name<input data-chair-seating-name type="text" value="${escapeHtml(String(config.seatingLabel || ''))}" placeholder="Chair Rows"></label>
        <label>Mode<select data-chair-edit="mode"><option value="free">Free</option><option value="total">Total</option></select></label>
        <label>Total<input data-chair-edit="totalChairs" type="number" min="1" value="${Number(config.totalChairs || chairs || 1)}"></label>
        <label>Rows<input data-chair-edit="rows" type="number" min="1" value="${Number(config.rows || 1)}"></label>
        <label>Chairs/row<input data-chair-edit="cols" type="number" min="1" value="${Number(config.cols || 1)}"></label>
        <label>Chair gap ft<input data-chair-edit="seatSpacingFt" type="number" min="0" step=".25" value="${Number(config.seatSpacingFt) || 0}"></label>
        <label>Row gap ft<input data-chair-edit="rowSpacingFt" type="number" min="0" step=".25" value="${Number(config.rowSpacingFt) || 0}"></label>
        <label>Facing<select data-chair-edit="facing"><option value="up">Up</option><option value="down">Down</option><option value="left">Left</option><option value="right">Right</option></select></label>
        ${aisleFields}
      </div>
      <div class="popup-meta">${chairs} chairs · ${config.rows || 1} rows × ${config.cols || 1}</div><div class="chair-edit-actions"><button type="button" class="btn btn-primary btn-sm chair-edit-save">Save &amp; Exit</button></div>`;
    document.body.appendChild(popup);
    popup.querySelector('.chair-edit-close')?.addEventListener('click', closeChairRowsEditPopup);
    popup.querySelector('.chair-edit-save')?.addEventListener('click', closeChairRowsEditPopup);
    popup.querySelectorAll('[data-chair-edit]').forEach((control) => {
      const key = control.getAttribute('data-chair-edit');
      if (config[key] !== undefined && control.tagName === 'SELECT') control.value = config[key];
      control.addEventListener('change', () => updateEditedChairRowsGroup(node, key, control.value));
    });
    popup.querySelectorAll('[data-chair-aisle-name]').forEach((control) => {
      control.addEventListener('change', () => updateEditedChairRowsAisleName(node, control.getAttribute('data-chair-aisle-name'), control.value));
    });
    popup.querySelectorAll('[data-chair-aisle-width]').forEach((control) => {
      control.addEventListener('change', () => {
        const aisleId = control.getAttribute('data-chair-aisle-width');
        updateChairRowsAisleDetails(node, aisleId, control.value);
      });
    });
    popup.querySelector('[data-chair-seating-name]')?.addEventListener('change', (event) => {
      const next = cloneConfig(node.getAttr('groupedConfig') || {});
      next.seatingLabel = String(event.target.value || '').trim();
      node.setAttr('groupedConfig', next);
      refreshInventoryPanelUI(); setDirty(true);
    });
    centerInlineEditorPopup(popup);
  }

  function updateEditedChairRowsAisleName(node, aisleId, value) {
    if (!(node && node.getAttr)) return;
    const config = cloneConfig(node.getAttr('groupedConfig')) || {};
    const aisle = (Array.isArray(config.aisles) ? config.aisles : []).find((entry, index) => String(entry && entry.id || index) === String(aisleId));
    if (!aisle) return;
    aisle.name = String(value || '').trim();
    node.setAttr('groupedConfig', config);
    refreshInventoryPanelUI(); setDirty(true);
  }

  function updateChairRowsAisleDetails(node, aisleId, widthFt) {
    if (!(node && node.getAttr && node.getParent)) return;
    const config = cloneConfig(node.getAttr('groupedConfig')) || {};
    const aisle = (Array.isArray(config.aisles) ? config.aisles : []).find((entry, index) => String(entry && entry.id || index) === String(aisleId));
    if (!aisle) return;
    aisle.widthFt = Math.min(20, Math.max(2, Number(widthFt) || 4));
    const parent = node.getParent();
    const rebuilt = createGroupedSeatingLayout(config, { x: node.x(), y: node.y(), rotation: node.rotation() });
    if (!rebuilt) return;
    setNodeLayerId(rebuilt, node.getAttr('layerId')); parent.add(rebuilt); node.destroy();
    groupedSeatingEditNode = rebuilt; chairRowsConfigOverride = config; selectedItems = [rebuilt];
    updateTransformer(); refreshInventoryPanelUI(); worldLayer.draw(); setDirty(true);
    showChairRowsEditPopup(rebuilt, config);
  }

  function hideTableSeatingEditPopup() {
    document.getElementById('tableSeatingEditPopup')?.remove();
  }

  function editTableSeatingGroup(node) {
    const config = cloneConfig(node && node.getAttr ? node.getAttr('groupedConfig') : null);
    if (!(config && config.layoutKind === 'table_seating')) return;
    hideTableSeatingEditPopup();
    const popup = document.createElement('div');
    popup.id = 'tableSeatingEditPopup'; popup.className = 'chair-rows-edit-popup';
    const tables = tableInventoryCache.filter((entry) => entry && !entry.hiddenFromPanel && (entry.type === 'round' || entry.type === 'table' || entry.type === 'halfround'));
    const chairs = chairInventoryCache.filter((entry) => entry && !entry.hiddenFromPanel && !isDirectorsChair(entry));
    const tableOptions = tables.map((entry) => `<option value="${escapeHtml(String(tableInventoryCache.indexOf(entry)))}">${escapeHtml(entry.name)}</option>`).join('');
    const chairOptions = chairs.map((entry) => `<option value="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</option>`).join('');
    const tableDef = getTableDefinitionFromConfig(config);
    const heightOptions = tableDef && tableDef.category === 'cocktail' ? `<label>Height<select data-table-edit="cocktailHeightMode"><option value="L">Low</option><option value="H">High</option></select></label>` : '';
    popup.innerHTML = `<button type="button" class="chair-edit-close" aria-label="Close">×</button><div class="popup-title">Edit Table Seating</div><div class="chair-edit-grid"><label>Name<input data-table-edit="seatingLabel" type="text" value="${escapeHtml(String(config.seatingLabel || ''))}" placeholder="Table Seating"></label><label>Table<select data-table-edit="tableKey">${tableOptions}</select></label><label>Type<select data-table-edit="chairName">${chairOptions}</select></label><label>Chairs<input data-table-edit="chairCount" type="number" min="0" value="${Number(config.chairCount) || 0}"></label><label>Clearance ft<input data-table-edit="clearanceFt" type="number" min="0.25" step=".25" value="${Number(config.clearanceFt) || .25}"></label><label>Layout<select data-table-edit="tableChairPattern"><option value="side_by_side">Side by side</option><option value="across">Across</option></select></label>${heightOptions}</div><div class="chair-edit-actions"><button type="button" class="btn btn-primary btn-sm table-edit-save">Save &amp; Exit</button></div>`;
    document.body.appendChild(popup);
    popup.querySelector('.chair-edit-close')?.addEventListener('click', hideTableSeatingEditPopup);
    popup.querySelector('.table-edit-save')?.addEventListener('click', hideTableSeatingEditPopup);
    popup.querySelectorAll('[data-table-edit]').forEach((control) => {
      const key = control.getAttribute('data-table-edit');
      if (config[key] !== undefined) control.value = config[key];
      control.addEventListener('change', () => updateEditedTableSeatingGroup(node, key, control.value));
    });
    centerInlineEditorPopup(popup);
  }

  function updateEditedTableSeatingGroup(node, field, value) {
    const config = cloneConfig(node && node.getAttr ? node.getAttr('groupedConfig') : null);
    if (!(config && config.layoutKind === 'table_seating')) return;
    if (field === 'seatingLabel') { config.seatingLabel = String(value || '').trim(); node.setAttr('groupedConfig', config); refreshInventoryPanelUI(); setDirty(true); return; }
    if (field === 'tableKey') { config.tableKey = value; const table = getTableDefinitionFromConfig(config); config.tableName = table ? table.name : config.tableName; }
    else if (field === 'chairName') { config.chairName = value; const chair = getChairDefinitionByName(value); config.effectiveChairName = chair ? chair.name : value; }
    else if (field === 'chairCount') config.chairCount = Math.max(0, parseInt(value, 10) || 0);
    else if (field === 'clearanceFt') config.clearanceFt = Math.max(0.25, parseFloat(value) || 0.25);
    else if (field === 'tableChairPattern') config.tableChairPattern = value === 'across' ? 'across' : 'side_by_side';
    else if (field === 'cocktailHeightMode') config.cocktailHeightMode = value === 'H' ? 'H' : 'L';
    const parent = node.getParent(); if (!parent) return;
    const rebuilt = createGroupedSeatingLayout(config, { x: node.x(), y: node.y(), rotation: node.rotation() });
    if (!rebuilt) return;
    setNodeLayerId(rebuilt, node.getAttr('layerId')); parent.add(rebuilt); node.destroy(); selectedItems = [rebuilt]; updateTransformer(); refreshInventoryPanelUI(); worldLayer.draw(); setDirty(true); editTableSeatingGroup(rebuilt);
  }

  function updateEditedChairRowsGroup(node, field, value) {
    const config = cloneConfig(node && node.getAttr ? node.getAttr('groupedConfig') : null);
    if (!(config && config.layoutKind === 'chair_rows')) return;
    if (field === 'mode') config.mode = value === 'total' ? 'total' : 'free';
    else if (['rows', 'cols', 'totalChairs'].includes(field)) config[field] = Math.max(1, parseInt(value, 10) || 1);
    else if (['seatSpacingFt', 'rowSpacingFt'].includes(field)) config[field] = Math.max(0, parseFloat(value) || 0);
    else if (field === 'facing') config.facing = value;
    if (config.mode === 'total') {
      if (field === 'cols') config.rows = Math.max(1, Math.ceil(config.totalChairs / config.cols));
      else config.cols = Math.max(1, Math.ceil(config.totalChairs / Math.max(1, config.rows)));
    } else {
      config.totalChairs = Math.max(1, config.rows * config.cols);
    }
    const parent = node.getParent(); if (!parent) return;
    const rebuilt = createGroupedSeatingLayout(config, { x: node.x(), y: node.y(), rotation: node.rotation() });
    if (!rebuilt) return;
    setNodeLayerId(rebuilt, node.getAttr('layerId')); parent.add(rebuilt); node.destroy();
    groupedSeatingEditNode = rebuilt; chairRowsConfigOverride = config; selectedItems = [rebuilt];
    updateTransformer(); refreshInventoryPanelUI(); worldLayer.draw(); setDirty(true);
    showChairRowsEditPopup(rebuilt, config);
  }

  function showChairRowsAisleEditPopup(node, aisle) {
    hideChairRowsEditPopup();
    if (!(node && node.getClientRect && aisle)) return;
    const popup = document.createElement('div');
    popup.id = 'chairRowsEditPopup';
    popup.className = 'chair-rows-edit-popup';
    popup.innerHTML = `<button type="button" class="chair-edit-close" aria-label="Close">×</button><div class="popup-title">Edit aisle</div><div class="chair-edit-grid"><label>Aisle ft<input data-chair-aisle-width class="form-control form-control-sm popup-input" type="number" min="2" max="20" step="1" value="${Number(aisle.widthFt) || 4}"></label></div><div class="chair-edit-actions"><button type="button" class="btn btn-outline-danger btn-sm chair-aisle-delete">Delete</button></div>`;
    document.body.appendChild(popup);
    popup.querySelector('.chair-edit-close')?.addEventListener('click', hideChairRowsEditPopup);
    centerInlineEditorPopup(popup);
    popup.querySelector('.chair-aisle-delete')?.addEventListener('click', deleteEditedChairRowsAisle);
    popup.querySelector('[data-chair-aisle-width]')?.addEventListener('change', (event) => {
      if (chairRowsAisleDistanceEl) chairRowsAisleDistanceEl.value = event.target.value;
      updateEditedChairRowsAisle({ widthFt: event.target.value });
    });
  }

  function deleteEditedChairRowsAisle() {
    const group = chairRowsEditingAisle.group;
    if (!(group && group.getAttr && group.getParent)) return;
    const config = cloneConfig(group.getAttr('groupedConfig')) || {};
    config.aisles = (config.aisles || []).filter((entry) => entry.id !== chairRowsEditingAisle.aisleId);
    config.aisleCount = config.aisles.length;
    config.aislesEnabled = config.aisles.length > 0;
    const parent = group.getParent(); if (!parent) return;
    const rebuilt = createGroupedSeatingLayout(config, { x: group.x(), y: group.y(), rotation: group.rotation() });
    if (!rebuilt) return;
    setNodeLayerId(rebuilt, group.getAttr('layerId')); parent.add(rebuilt); group.destroy();
    chairRowsEditingAisle = { group: rebuilt, aisleId: null }; groupedSeatingEditNode = rebuilt; chairRowsConfigOverride = config;
    selectedItems = [rebuilt]; updateTransformer(); refreshInventoryPanelUI(); worldLayer.draw(); setDirty(true); hideChairRowsEditPopup();
  }

  function syncChairRowsMode() {
    const totalMode = chairRowsModeEl && chairRowsModeEl.value === 'total';
    if (chairRowsTotalFieldEl) chairRowsTotalFieldEl.style.display = totalMode ? '' : 'none';
    if (chairRowsCountRowsEl) chairRowsCountRowsEl.readOnly = false;
    if (chairRowsCountColsEl) chairRowsCountColsEl.readOnly = false;
    if (totalMode) {
      const total = Math.max(1, parseInt(chairRowsTotalEl && chairRowsTotalEl.value, 10) || 1);
      const currentRows = Math.max(1, parseInt(chairRowsCountRowsEl && chairRowsCountRowsEl.value, 10) || 1);
      const currentCols = Math.max(1, parseInt(chairRowsCountColsEl && chairRowsCountColsEl.value, 10) || 1);
      if (chairRowsTotalLastChanged === 'cols') {
        if (chairRowsCountRowsEl) chairRowsCountRowsEl.value = Math.ceil(total / currentCols);
      } else if (chairRowsCountColsEl) chairRowsCountColsEl.value = Math.ceil(total / currentRows);
    }
  }

  function armTableSeatingPlacement() {
    const chairCount = Math.max(0, parseInt(tableSeatingChairCountEl && tableSeatingChairCountEl.value, 10) || 0);
    const clearanceFt = Math.max(0.25, parseFloat(tableSeatingClearanceEl && tableSeatingClearanceEl.value) || 0.25);
    const tableKey = tableSeatingTableTypeEl ? tableSeatingTableTypeEl.value : '';
    const chairName = tableSeatingChairTypeEl ? tableSeatingChairTypeEl.value : '';
    const selectedTable = getTableDefinitionFromConfig({ tableKey });
    const meta = getTableSeatingMeta({ tableKey, chairName });
    const absoluteMax = meta && meta.rule ? meta.rule.absoluteMax : 7;
    const effectiveChair = meta ? meta.chairDef : getChairDefinitionByName(chairName);
    const config = {
      layoutKind: 'table_seating',
      tableKey,
      tableName: selectedTable ? selectedTable.name : '',
      chairName,
      effectiveChairName: effectiveChair ? effectiveChair.name : chairName,
      chairCount: Math.min(absoluteMax, chairCount),
      clearanceFt,
      cocktailHeightMode: selectedTable && selectedTable.category === 'cocktail' ? currentCocktailHeightMode : '',
      tableChairPattern: currentTableChairPattern,
    };
    const geometry = buildTableSeatingGeometry(config);
    if (!geometry) {
      window.alert('Could not build table seating with the current settings.');
      return;
    }
    armPlacementTool({
      kind: 'groupedSeating',
      label: `Table seating ${chairCount}`,
      widthFt: geometry.widthFt,
      lengthFt: geometry.lengthFt,
      groupedConfig: config,
    }, tableSeatingPlaceBtn);
  }

  function bindInventoryAndVenueButtons() {
    document.querySelectorAll('#inventoryPanel button[data-type], #venuesPanel button[data-type]').forEach((btn) => {
      btn.addEventListener('click', () => {
        armPlacementTool(buildPlacementPayloadFromInventoryButton(btn), btn);
      });
    });

    // Venue button click handlers are attached only in populatePanel to avoid double-adding.

    // --- Flooring UI Builder ---
    async function buildFlooringInventory() {
      try {
        const res = await fetch('/static/data/flooring.json');
        if (!res.ok) throw new Error('Flooring config not found');
        const defs = await res.json();
        const section = document.querySelector('#inventoryPanel details[data-flooring-section]');
        if (!section) return;
        const container = section.querySelector('.flooring-controls');
        if (!container) return;
        container.innerHTML = '';

        const orderedDefs = defs.slice().sort((a, b) => {
          const order = { stage: 0, subfloor: 1, modernDancefloor: 2, classicDancefloor: 2 };
          return (order[a.category] ?? 9) - (order[b.category] ?? 9);
        });
        orderedDefs.forEach((def) => {
          if (!def) return;
          const row = document.createElement('details');
          row.className = 'grouped-seating-card flooring-row mb-1';
          row.open = false;

          const label = document.createElement('summary');
          label.className = 'flooring-row-label';
          label.textContent = def.category === 'subfloor' ? 'Interlocking Subfloor' : def.name;
          row.appendChild(label);
          const rowContent = document.createElement('div');
          rowContent.className = 'flooring-row-content';

          const buildSelect = (stepOverride) => {
            const sel = document.createElement('select');
            sel.className = 'form-select form-select-sm flooring-select';
            const step = stepOverride || def.allowedFactor || def.tileSize || 1;
            const min = def.minSize || step;
            const max = def.maxSize || 60;
            for (let v = min; v <= max; v += step) {
              const opt = document.createElement('option');
              opt.value = v;
              opt.textContent = `${v}ft`;
              sel.appendChild(opt);
            }
            return sel;
          };

          const addControl = (parent, labelText, control) => {
            const wrapper = document.createElement('label'); wrapper.className = 'grouped-seating-field'; wrapper.textContent = labelText; wrapper.appendChild(control); parent.appendChild(wrapper);
          };

          const refillFloorSelect = (select, step) => {
            const current = Number(select.value) || step; select.innerHTML = '';
            const max = def.maxSize || 60; const min = def.minSize || step;
            for (let value = min; value <= max; value += step) { const option = document.createElement('option'); option.value = value; option.textContent = `${value}ft`; select.appendChild(option); }
            select.value = String(Math.min(max, Math.max(min, Math.round(current / step) * step)));
          };

          const widthSel = buildSelect();
          const lengthSel = buildSelect();
          const classicSizeStep = def.category === 'classicDancefloor' ? 3 : null;
          const refillClassicSelect = (select, step) => {
            if (def.category !== 'classicDancefloor') return;
            const current = Number(select.value) || step; select.innerHTML = '';
            const max = def.maxSize || 60;
            for (let value = step; value <= max; value += step) { const option = document.createElement('option'); option.value = value; option.textContent = `${value}ft`; select.appendChild(option); }
            select.value = String(Math.min(max, Math.max(step, Math.round(current / step) * step)));
          };
          if (def.category === 'classicDancefloor') { refillClassicSelect(widthSel, classicSizeStep); refillClassicSelect(lengthSel, classicSizeStep); }
          let classicStepToggle = null;
          if (def.category === 'classicDancefloor') {
            label.classList.add('d-flex', 'align-items-center', 'justify-content-between');
            classicStepToggle = document.createElement('input'); classicStepToggle.type = 'checkbox'; classicStepToggle.className = 'form-check-input'; classicStepToggle.checked = true; classicStepToggle.title = 'Use 3 ft factors';
            const stepLabel = document.createElement('label'); stepLabel.className = 'form-check form-switch small mb-0 ms-2'; stepLabel.append(classicStepToggle, document.createTextNode('3ft')); label.appendChild(stepLabel);
            classicStepToggle.addEventListener('change', () => { const step = classicStepToggle.checked ? 3 : 1; refillClassicSelect(widthSel, step); refillClassicSelect(lengthSel, step); });
          }
          widthSel.title = `${def.name} width`;
          lengthSel.title = `${def.name} length`;
          const optionRow = document.createElement('div');
          optionRow.className = 'flooring-row-controls';
          let heightSel = null;
          let stageStepToggle = null;
          if (def.category === 'stage') {
            label.classList.add('d-flex', 'align-items-center', 'justify-content-between');
            stageStepToggle = document.createElement('input'); stageStepToggle.type = 'checkbox'; stageStepToggle.className = 'form-check-input'; stageStepToggle.checked = true; stageStepToggle.title = 'Use 4 ft factors';
            const stageStepLabel = document.createElement('label'); stageStepLabel.className = 'form-check form-switch small mb-0 ms-2'; stageStepLabel.append(stageStepToggle, document.createTextNode('4ft')); label.appendChild(stageStepLabel);
            refillFloorSelect(widthSel, 4); refillFloorSelect(lengthSel, 4);
            stageStepToggle.addEventListener('change', () => { refillFloorSelect(widthSel, stageStepToggle.checked ? 4 : 2); refillFloorSelect(lengthSel, stageStepToggle.checked ? 4 : 2); });
          }
          if (def.category === 'stage') {
            heightSel = document.createElement('select'); heightSel.className = 'form-select form-select-sm flooring-select';
            heightSel.title = 'Stage height';
            [[6, '6 in'], [12, '12 in'], [24, '24 in']].forEach(([value, text]) => { const option = document.createElement('option'); option.value = value; option.textContent = text; if (value === 12) option.selected = true; heightSel.appendChild(option); });
            addControl(optionRow, 'H', heightSel);
          }

          const controlRow = document.createElement('div');
          controlRow.className = 'flooring-row-controls';

          const btn = document.createElement('button');
          btn.className = 'btn btn-outline-secondary btn-sm flooring-add-btn';
          btn.innerHTML = '<i class="fa-solid fa-plus"></i>';
          btn.title = `Add ${def.name}`;
          btn.addEventListener('click', () => {
            armPlacementTool({
              kind: 'floor',
              category: def.category,
              widthFt: parseFloat(widthSel.value),
              lengthFt: parseFloat(lengthSel.value),
              floorOptions: { ...(def.category === 'classicDancefloor' ? { classicStep: classicStepToggle && classicStepToggle.checked ? 3 : 1 } : {}), ...(def.category === 'stage' ? { heightIn: heightSel ? Number(heightSel.value) : 12, stageStep: stageStepToggle && stageStepToggle.checked ? 4 : 2 } : {}) },
              label: `${def.name} ${widthSel.value}x${lengthSel.value}`,
            }, btn);
          });

          addControl(controlRow, 'W', widthSel);
          addControl(controlRow, 'L', lengthSel);
          Array.from(optionRow.children).forEach((child) => controlRow.appendChild(child));
          controlRow.appendChild(btn);

          let customFlooringRow = null;
          if (def.category === 'subfloor') {
            const customWidth = document.createElement('input');
            customWidth.className = 'form-control form-control-sm flooring-custom-input';
            customWidth.type = 'number';
            customWidth.min = '0.5';
            customWidth.step = '0.5';
            customWidth.placeholder = 'W ft';

            const customLength = document.createElement('input');
            customLength.className = 'form-control form-control-sm flooring-custom-input';
            customLength.type = 'number';
            customLength.min = '0.5';
            customLength.step = '0.5';
            customLength.placeholder = 'L ft';

            const customBtn = document.createElement('button');
            customBtn.className = 'btn btn-outline-secondary btn-sm flooring-add-btn';
            customBtn.textContent = 'Custom';
            customBtn.addEventListener('click', () => {
              const widthFt = parseFloat(customWidth.value);
              const lengthFt = parseFloat(customLength.value);
              if (!Number.isFinite(widthFt) || widthFt <= 0 || !Number.isFinite(lengthFt) || lengthFt <= 0) {
                window.alert('Enter valid positive Subfloor width and length in feet.');
                return;
              }
              armPlacementTool({
                kind: 'floor',
                category: def.category,
                widthFt,
                lengthFt,
                customTexture: true,
              label: `Custom Rectangular Subfloor ${widthFt}x${lengthFt}`,
            }, customBtn);
          });

            customFlooringRow = document.createElement('details'); customFlooringRow.className = 'grouped-seating-card flooring-row mb-1'; customFlooringRow.open = false;
            const customLabel = document.createElement('summary'); customLabel.className = 'flooring-row-label'; customLabel.textContent = 'Custom Rectangular Subfloor'; customFlooringRow.appendChild(customLabel);
            const customRow = document.createElement('div'); customRow.className = 'flooring-row-content';
            const customControls = document.createElement('div'); customControls.className = 'flooring-row-controls';
            addControl(customControls, 'W', customWidth); addControl(customControls, 'L', customLength); customControls.appendChild(customBtn); customRow.appendChild(customControls); customFlooringRow.appendChild(customRow);
          }

          rowContent.prepend(controlRow);
          if (def.category === 'stage') {
            const addonRow = document.createElement('div'); addonRow.className = 'flooring-row-controls stage-addon-tools';
            [['Basic Step', 'Basic Step'], ['Adjustable Stairs', 'Adjustable Stairs'], ['Stage Railing 4ft', 'Railing 4ft'], ['Stage Railing 2ft', 'Railing 2ft']].forEach(([addonType, labelText]) => {
              const addonBtn = document.createElement('button'); addonBtn.className = 'btn btn-outline-secondary btn-sm flooring-add-btn'; addonBtn.textContent = labelText; addonBtn.title = `Place ${labelText}`;
              addonBtn.addEventListener('click', () => armPlacementTool({ kind: 'stageAddon', addonType, label: labelText }, addonBtn)); addonRow.appendChild(addonBtn);
            });
            rowContent.appendChild(addonRow);
          }
          row.appendChild(rowContent);
          container.appendChild(row);
          if (customFlooringRow) container.appendChild(customFlooringRow);
        });
      } catch (err) {
        console.error('Error building flooring inventory:', err);
      }
    }
    buildFlooringInventory();
  }

  // async loader for venue button panels
  async function loadVenues() {
    const FEET_TO_PX = 12;

    async function fetchJSON(path) {
      try {
        const res = await fetch(path);
        if (!res.ok) throw new Error("Failed to load " + path);
        return await res.json();
      } catch (err) {
        console.error("Venue JSON load error:", err);
        return [];
      }
    }

    // Load both venue categories
    const indoorRooms = await fetchJSON("/static/data/venues/indoor_rooms.json");
    const tents = await fetchJSON("/static/data/venues/tents.json");

    // Helper to populate each section
    function populatePanel(listId, data, isTent = false) {
      const container = document.getElementById(listId);
      if (!container) return;
      container.innerHTML = "";

      data.forEach((v) => {
        const btn = document.createElement("button");
        btn.className = "btn btn-outline-secondary btn-sm my-1";
        btn.textContent = v.name;

        btn.dataset.venueType = isTent ? "tent" : "room";
        btn.dataset.w = v.width;
        btn.dataset.h = v.height;

        btn._venueMeta = v;
        container.appendChild(btn);

        btn.addEventListener("click", () => {
          const meta = btn._venueMeta || {};
          const vType = btn.dataset.venueType;
          const wFt = parseFloat(btn.dataset.w) || 10;
          const hFt = parseFloat(btn.dataset.h) || 10;
          armPlacementTool({
            kind: 'venue',
            type: vType,
            widthFt: wFt,
            heightFt: hFt,
            outline: meta.outline,
            legs: meta.legs,
            label: btn.textContent.trim() || `${wFt}x${hFt} ${vType}`,
          }, btn);
        });
      });
    }

    populatePanel("indoorRoomsList", indoorRooms, false);
    populatePanel("tentsList", tents, true);

    await loadInventoryCatalog();

    bindInventoryAndVenueButtons();
    populateGroupedSeatingControls();
    refreshInventoryPanelUI();
    ensureLayerOrder();
  }

  function toggleDarkMode() {
    darkMode = !darkMode;
    document.body.classList.toggle('dark-mode', darkMode);
    try { localStorage.setItem('theme', darkMode ? 'dark' : 'light'); } catch { }
    if (darkModeToggle) darkModeToggle.checked = darkMode;
    refreshLabelTheme();
    drawGrid();
    if (worldLayer) worldLayer.draw();
  }

  function getStoredThemePreference() {
    try {
      const theme = localStorage.getItem('theme');
      if (theme === 'dark' || theme === 'light') return theme;
    } catch { }
    return '';
  }

  function applyUiScale(value, persist = true) {
    const next = Math.max(0.8, Math.min(1.5, Number(value) || 1));
    uiScale = next;
    // Planner controls use rem units, while the Konva drawing has its own
    // world coordinates. This enlarges readable UI without changing the plan.
    document.documentElement.style.fontSize = `${Math.round(next * 100)}%`;
    if (uiScaleInput) uiScaleInput.value = String(Math.round(next * 100));
    if (uiScaleValueEl) uiScaleValueEl.textContent = `${Math.round(next * 100)}%`;
    if (persist) {
      try { localStorage.setItem('plannerUiScale', String(next)); } catch { }
    }
  }

  function applyStoredTheme() {
    try {
      const t = getStoredThemePreference(); if (t) darkMode = t === 'dark';
      const gs = parseFloat(localStorage.getItem('gridSize')); if (!isNaN(gs) && gs > 0) { gridSize = gs; if (gridSizeInput) gridSizeInput.value = gridSize; }
      const sd = parseFloat(localStorage.getItem('snapDistanceFt')); if (!isNaN(sd) && sd > 0) { snapDistanceFt = sd; if (snapDistanceInput) snapDistanceInput.value = String(snapDistanceFt); }
      const u = localStorage.getItem('units'); if (u) units = u;
      const sg = localStorage.getItem('showGrid'); if (sg) showGrid = sg === '1';
      const snap = localStorage.getItem('snapToGrid'); if (snap) snapToGrid = snap === '1';
      const heights = localStorage.getItem('showItemHeights'); if (heights) showItemHeights = heights === '1';
      const storedUiScale = parseFloat(localStorage.getItem('plannerUiScale'));
      if (!isNaN(storedUiScale)) uiScale = storedUiScale;
    } catch { }
    document.body.classList.toggle('dark-mode', darkMode);
    if (darkModeToggle) darkModeToggle.checked = darkMode;
    if (gridToggle) gridToggle.checked = showGrid;
    syncSnapState();
    if (itemHeightsToggle) itemHeightsToggle.checked = showItemHeights;
    applyUiScale(uiScale, false);
    renderSnapDistanceValue();
  }

  function toggleSettings() {
    const vis = settingsPanel.style.display !== 'none';
    settingsPanel.style.display = vis ? 'none' : 'block';
  }

  function buildLayoutSnapshot() {
    const layout = {
      gridSize,
      gridBounds: gridBounds ? { ...gridBounds } : null,
      snapDistanceFt,
      showGrid,
      snapToGrid,
      darkMode,
      units,
      referenceImageOpacity,
      inventoryPanel: {
        showOnPrint: !!inventoryShowOnPrint,
        showTentSetupsOnPrint: !!tentSetupsShowOnPrint,
        showPipeDrapeOnPrint: !!pipeDrapeShowOnPrint,
        showFenceRunsOnPrint: !!fenceRunsShowOnPrint,
        showLightRunsOnPrint: !!lightRunsShowOnPrint,
        showFlooringOnPrint: !!flooringShowOnPrint,
        showSeatingOnPrint: !!seatingShowOnPrint,
        trackLimits: !!inventoryLimitsEnabled,
      },
      inventoryTotals: { ...inventoryManualTotals },
      layers: getOrderedLayers().map((layer, index) => ({
        id: layer.id,
        name: layer.name,
        kind: layer.kind,
        visible: layer.visible,
        locked: layer.locked,
        opacity: layer.opacity,
        builtIn: !!layer.builtIn,
        order: index,
      })),
      venues: [],
      items: [],
    };
    forEachNode((shape, layer) => {
      if (shape.getAttr && shape.getAttr('customType') === 'venue') {
        const widthFt = shape.getAttr('widthFt');
        const heightFt = shape.getAttr('heightFt');
        const outlineCfg = shape.getAttr('outlineSpec');
        const legsCfg = shape.getAttr('legsSpec');
        const venueEntry = {
          type: shape.getAttr('venueType'),
          x: shape.x(),
          y: shape.y(),
          width: widthFt !== undefined ? widthFt : shape.width() / FEET_TO_PX,
          height: heightFt !== undefined ? heightFt : shape.height() / FEET_TO_PX,
          rotation: shape.rotation(),
          unit: 'ft',
          layerId: layer.id,
          nodeId: ensureNodeId(shape, 'venue'),
        };
        if (outlineCfg) venueEntry.outline = cloneConfig(outlineCfg);
        if (legsCfg) venueEntry.legs = cloneConfig(legsCfg);
        const polygonCfg = shape.getAttr('polygonSpec');
        const componentsCfg = shape.getAttr('componentsSpec');
        const doorsCfg = shape.getAttr('doorsSpec');
        const attachmentsCfg = shape.getAttr('attachmentsSpec');
        const referenceCfg = shape.getAttr('referenceSpec');
        if (polygonCfg) venueEntry.polygon = cloneConfig(polygonCfg);
        if (componentsCfg) venueEntry.components = cloneConfig(componentsCfg);
        if (doorsCfg) venueEntry.doors = cloneConfig(doorsCfg);
        if (attachmentsCfg) venueEntry.attachments = cloneConfig(attachmentsCfg);
        if (referenceCfg) venueEntry.reference = cloneConfig(referenceCfg);
        if (shape.getAttr('customName')) venueEntry.customName = shape.getAttr('customName');
        if (shape.getAttr('customTemplateId')) venueEntry.customTemplateId = shape.getAttr('customTemplateId');
        if (shape.getAttr('tentSetupName')) venueEntry.tentSetupName = shape.getAttr('tentSetupName');
        layout.venues.push(venueEntry);
        return;
      }
      if (shape.getAttr && shape.getAttr('customType') === 'referenceImage') {
        layout.items.push({
          type: 'referenceImage',
          itemKind: 'referenceImage',
          dataUrl: shape.getAttr('dataUrl') || '',
          name: shape.getAttr('referenceImageName') || 'Reference image',
          referenceMeta: cloneConfig(shape.getAttr('referenceMeta') || null),
          x: shape.x(), y: shape.y(), width: shape.width(), height: shape.height(),
          rotation: shape.rotation ? shape.rotation() : 0, opacity: shape.opacity(),
          layerId: layer.id, nodeId: ensureNodeId(shape, 'reference-image'),
        });
        return;
      }
      if (shape.getAttr && shape.getAttr('customType') === 'groupedSeating') {
        layout.items.push({
          type: 'groupedSeating',
          itemKind: 'grouped_seating',
          groupedConfig: cloneConfig(shape.getAttr('groupedConfig')),
          x: shape.x(),
          y: shape.y(),
          rotation: shape.rotation ? shape.rotation() : 0,
          width: shape.getAttr('widthFt'),
          length: shape.getAttr('lengthFt'),
          unit: 'ft',
          layerId: layer.id,
          nodeId: ensureNodeId(shape, 'grouped'),
        });
        return;
      }
      if (shape.getAttr && shape.getAttr('customType') === 'layoutGroup') {
        layout.items.push({
          type: 'layoutGroup',
          itemKind: 'layout_group',
          layoutGroupName: shape.getAttr('layoutGroupName') || 'Layout group',
          layoutGroupConfig: cloneConfig(shape.getAttr('layoutGroupConfig')),
          x: shape.x(), y: shape.y(), rotation: shape.rotation ? shape.rotation() : 0,
          layerId: layer.id, nodeId: ensureNodeId(shape, 'layout-group'),
        });
        return;
      }
      if (shape.getAttr && shape.getAttr('customType') === 'label') {
        layout.items.push({
          type: 'label',
          itemKind: 'label',
          text: shape.getAttr('labelText') || '',
          x: shape.x(),
          y: shape.y(),
          rotation: shape.rotation ? shape.rotation() : 0,
          layerId: layer.id,
          nodeId: ensureNodeId(shape, 'label'),
          attachedToNodeId: shape.getAttr('attachedToNodeId') || null,
          attachmentOffset: cloneConfig(shape.getAttr('attachmentOffset') || null),
          fontSize: shape.getAttr('fontSize'),
          labelColor: shape.getAttr('labelColor'),
          fontStyle: shape.getAttr('fontStyle'),
          labelBorder: !!shape.getAttr('labelBorder'),
          autoGenerated: !!shape.getAttr('autoGenerated'),
          labelKind: shape.getAttr('labelKind') || '',
        });
        return;
      }
      if (shape.getAttr && shape.getAttr('customType') === 'tentAddon') {
        layout.items.push({
          type: shape.getAttr('itemType') || 'item',
          itemKind: 'tent_addon',
          addonType: shape.getAttr('addonType') || 'sidewall',
          inventoryName: shape.getAttr('inventoryName') || '',
          inventoryCategory: shape.getAttr('inventoryCategory') || '',
          familyId: shape.getAttr('familyId') || '',
          color: shape.getAttr('addonColor') || '',
          diameter: shape.getAttr('diameterFt') || undefined,
          width: shape.getAttr('widthFt') || undefined,
          length: shape.getAttr('lengthFt') || undefined,
          weightFootprint: cloneConfig(shape.getAttr('weightFootprint')),
          attachment: cloneConfig(shape.getAttr('attachment')),
          parentTentNodeId: shape.getAttr('parentTentNodeId') || '',
          x: shape.x(), y: shape.y(), rotation: shape.rotation ? shape.rotation() : 0,
          layerId: layer.id, nodeId: ensureNodeId(shape, 'tent-addon'), unit: 'ft',
        });
        return;
      }
      if (shape.getAttr && shape.getAttr('customType') === 'stageAddon') {
        layout.items.push({ type: 'stageAddon', itemKind: 'stage_addon', addonType: shape.getAttr('addonType') || '', inventoryName: shape.getAttr('inventoryName') || '', parentStageNodeId: shape.getAttr('parentStageNodeId') || '', stageEdge: cloneConfig(shape.getAttr('stageEdge') || null), x: shape.x(), y: shape.y(), rotation: shape.rotation ? shape.rotation() : 0, side: shape.getAttr('side') || '', width: shape.getAttr('widthFt') || 1, length: shape.getAttr('lengthFt') || 1, layerId: layer.id, nodeId: ensureNodeId(shape, 'stage-addon'), unit: 'ft' });
        return;
      }
      if (shape.getAttr && shape.getAttr('customType') === 'drawnRun') {
        const storedPoints = cloneConfig(shape.getAttr('runPoints')) || [];
        const runPoints = storedPoints.map((point) => ({ x: point.x + shape.x(), y: point.y + shape.y() }));
        layout.items.push({
          type: 'drawnRun', itemKind: 'drawn_run', drawMode: shape.getAttr('drawMode') || 'pipeDrape',
          inventoryName: shape.getAttr('inventoryName') || 'Run', inventoryCategory: shape.getAttr('inventoryCategory') || '',
          color: shape.getAttr('addonColor') || '', runPoints,
          lightPostAnchors: isStandaloneBistroRun(shape) ? normalizedLightPostAnchors(shape) : [],
          layerId: layer.id, nodeId: ensureNodeId(shape, 'drawn-run'), unit: 'ft',
        });
        return;
      }
      if (shape.getAttr && shape.getAttr('customType') === 'pipeDrapeChain') {
        layout.items.push({ type: 'pipeDrapeChain', itemKind: 'pipe_drape_chain', points: pipeDrapeWorldPoints(shape), crossbarId: shape.getAttr('crossbarId'), crossbarName: shape.getAttr('crossbarName'), crossbarMinFt: shape.getAttr('crossbarMinFt'), crossbarMaxFt: shape.getAttr('crossbarMaxFt'), heightFt: shape.getAttr('heightFt'), pipeDrapeSetupId: ensurePipeDrapeSetup(shape), pipeDrapeSetupOrder: shape.getAttr('pipeDrapeSetupOrder'), pipeDrapeRunOrder: shape.getAttr('pipeDrapeRunOrder'), pipeDrapeSetupName: shape.getAttr('pipeDrapeSetupName') || '', layerId: layer.id, nodeId: ensureNodeId(shape, 'pipe-drape') });
        return;
      }
      if (shape.getAttr && shape.getAttr('customType') === 'fenceChain') {
        layout.items.push({ type: 'fenceChain', itemKind: 'fence_chain', points: fenceWorldPoints(shape), panelLengthFt: shape.getAttr('fencePanelLengthFt'), fenceSetupId: ensureFenceSetup(shape), fenceSetupOrder: shape.getAttr('fenceSetupOrder'), fenceRunOrder: shape.getAttr('fenceRunOrder'), layerId: layer.id, nodeId: ensureNodeId(shape, 'fence') });
        return;
      }
      if (shape.getAttr && shape.getAttr('isFlooring')) {
        layout.items.push({
          type: shape.getAttr('floorCategory') || shape.getAttr('itemType') || 'floor',
          itemKind: 'floor',
          width: shape.getAttr('widthFt'),
          length: shape.getAttr('lengthFt'),
          x: shape.x(),
          y: shape.y(),
          rotation: shape.rotation ? shape.rotation() : 0,
          unit: 'ft',
          customTexture: !!shape.getAttr('customTexture'),
          floorOptions: cloneConfig(shape.getAttr('floorOptions')) || {},
          flooringLabel: shape.getAttr('flooringLabel') || '',
          layerId: layer.id,
          nodeId: ensureNodeId(shape, 'floor'),
        });
        return;
      }
      const itype = shape.getAttr('itemType') || 'table';
      const entry = {
        type: itype,
        x: shape.x(),
        y: shape.y(),
        rotation: shape.rotation ? shape.rotation() : 0,
        layerId: layer.id,
        nodeId: ensureNodeId(shape, 'item'),
        inventoryName: shape.getAttr('inventoryName') || '',
        cocktailHeightMode: shape.getAttr('cocktailHeightMode') || '',
      };

      const widthFtAttr = shape.getAttr('widthFt');
      const lengthFtAttr = shape.getAttr('lengthFt');
      const diameterFtAttr = shape.getAttr('diameterFt');
      const footprintSpec = shape.getAttr('footprintSpec');
      if (footprintSpec) entry.footprint = cloneConfig(footprintSpec);

      if (shape.className === 'Circle') {
        if (Number.isFinite(diameterFtAttr)) {
          entry.diameter = diameterFtAttr;
          entry.unit = 'ft';
        } else {
          entry.radius = shape.radius ? shape.radius() : 0;
          entry.unit = 'px';
        }
      } else {
        const derivedWidthFt = Number.isFinite(widthFtAttr) ? widthFtAttr : (shape.height ? shape.height() / FEET_TO_PX : undefined);
        const derivedLengthFt = Number.isFinite(lengthFtAttr) ? lengthFtAttr : (shape.width ? shape.width() / FEET_TO_PX : undefined);

        if (Number.isFinite(derivedWidthFt) && Number.isFinite(derivedLengthFt)) {
          entry.width = derivedWidthFt;
          entry.length = derivedLengthFt;
          entry.height = derivedLengthFt; // legacy fallback for older layouts
          entry.unit = 'ft';
        } else {
          const rectWidthPx = shape.width ? shape.width() : 0;
          const rectHeightPx = shape.height ? shape.height() : 0;
          entry.width = rectHeightPx;
          entry.length = rectWidthPx;
          entry.height = rectHeightPx;
          entry.unit = 'px';
        }
      }

      layout.items.push(entry);
    });
    layout.layoutGroupTemplates = cloneConfig(layoutGroupTemplates) || [];
    return layout;
  }

  function exportLayout() {
    const layout = buildLayoutSnapshot();
    const jsonStr = JSON.stringify(layout, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const safeTitle = (currentDocumentTitle || 'layout').replace(/[^a-z0-9-_]+/gi, '_').replace(/^_+|_+$/g, '') || 'layout';
    downloadAnchor.href = url; downloadAnchor.download = `${safeTitle}.json`; downloadAnchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  function localDocuments() {
    return readStoredDocuments(window.localStorage, LOCAL_DOCUMENTS_KEY);
  }

  function writeLocalDocuments(items) {
    writeStoredDocuments(window.localStorage, LOCAL_DOCUMENTS_KEY, items);
  }

  async function savePlannerDocument(forceRename = false) {
    try {
      let title = currentDocumentTitle || 'Untitled planner';
      if (!currentDocumentId || forceRename || title === 'Untitled planner') {
        const prompted = window.prompt('Planner name', title === 'Untitled planner' ? '' : title);
        if (prompted === null) return;
        title = prompted.trim() || 'Untitled planner';
      }

      const payload = {
        title,
        layout: buildLayoutSnapshot(),
      };

      const now = new Date().toISOString();
      const { items, saved } = upsertLocalDocument(localDocuments(), { id: currentDocumentId, title: payload.title, layout: payload.layout, now, nextId: () => Date.now() });
      writeLocalDocuments(items);

      resetCurrentDocument({ id: saved.id, title: saved.title, updatedAt: saved.updated_at || null, dirty: false });
      setQueryDocumentId(saved.id);
      hidePlannerLibrary();
    } catch (err) {
      window.alert(`Could not save planner: ${err.message}`);
    }
  }

  async function createNewPlanner() {
    const allowed = await confirmDiscardIfDirty();
    if (!allowed) return;
    setActiveTool('select');
    await loadLayout(getBlankLayout());
    resetCurrentDocument({ id: null, title: 'Untitled planner', dirty: false });
    setQueryDocumentId(null);
    hidePlannerLibrary();
  }

  async function loadPlannerDocument(documentId) {
    try {
      const allowed = await confirmDiscardIfDirty();
      if (!allowed) return;
      setActiveTool('select');
      const payload = localDocuments().find((item) => item.id === documentId);
      if (!payload) throw new Error('This saved floorplan is not available in this browser.');
      await loadLayout(payload.layout || {});
      resetCurrentDocument({ id: payload.id, title: payload.title, updatedAt: payload.updated_at || null, dirty: false });
      setQueryDocumentId(payload.id);
      hidePlannerLibrary();
    } catch (err) {
      window.alert(`Could not open planner: ${err.message}`);
    }
  }

  function hidePlannerLibrary() {
    if (plannerLibraryPanel) plannerLibraryPanel.style.display = 'none';
  }

  function hideInventoryKeyPanel() {
    if (inventoryKeyPanel) inventoryKeyPanel.style.display = 'none';
  }

  function positionInventoryKeyPanel() {
    if (!inventoryKeyPanel) return;
    let top = 55;
    let right = 10;
    if (layersPanel && layersPanel.style.display !== 'none') {
      const rect = layersPanel.getBoundingClientRect();
      top = Math.max(55, Math.round(rect.bottom + 8));
      right = Math.max(10, Math.round(window.innerWidth - rect.right));
    }
    inventoryKeyPanel.style.top = `${top}px`;
    inventoryKeyPanel.style.right = `${right}px`;
  }

  function toggleInventoryKeyPanel() {
    if (!inventoryKeyPanel) return;
    const visible = inventoryKeyPanel.style.display !== 'none';
    inventoryKeyPanel.style.display = visible ? 'none' : 'block';
    if (!visible) {
      positionInventoryKeyPanel();
      refreshInventoryPanelUI();
    }
  }

  async function openPlannerLibrary() {
    if (plannerIsSetupMode) return;
    if (!plannerLibraryPanel || !plannerLibraryList) return;
    plannerLibraryPanel.style.display = 'block';
    plannerLibraryList.innerHTML = '<div class="small text-muted">Loading…</div>';
    try {
      const items = localDocuments();
      if (!items.length) {
        plannerLibraryList.innerHTML = '<div class="small text-muted">No saved planners yet.</div>';
        return;
      }
      plannerLibraryList.innerHTML = items.map((item) => `
        <button class="planner-library-item" type="button" data-floorplan-id="${item.id}">
          <div class="planner-library-item-title">${item.title || 'Untitled planner'}</div>
          <div class="planner-library-item-meta">Updated ${formatTimestamp(item.updated_at) || 'Unknown time'}</div>
        </button>
      `).join('');
      plannerLibraryList.querySelectorAll('[data-floorplan-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const documentId = parseInt(btn.getAttribute('data-floorplan-id'), 10);
          if (Number.isFinite(documentId)) loadPlannerDocument(documentId);
        });
      });
    } catch (err) {
      plannerLibraryList.innerHTML = `<div class="small text-danger">Could not load saved planners: ${err.message}</div>`;
    }
  }

  function renamePlanner() {
    const prompted = window.prompt('Planner name', currentDocumentTitle || 'Untitled planner');
    if (prompted === null) return;
    currentDocumentTitle = prompted.trim() || 'Untitled planner';
    setDirty(true);
  }

  function toggleLayersPanel() {
    if (!layersPanel) return;
    const vis = layersPanel.style.display !== 'none';
    layersPanel.style.display = vis ? 'none' : 'block';
    if (!vis) renderLayersPanel();
    if (inventoryKeyPanel && inventoryKeyPanel.style.display !== 'none') positionInventoryKeyPanel();
  }

  async function loadLayout(json) {
    suppressDirtyTracking = true;
    try {
      setActiveTool('select');
      clearSelection();
      userLayers = ensureBaseLayers(Array.isArray(json.layers) && json.layers.length ? json.layers : defaultLayers());
      activeLayerId = getLayer('items-base') ? 'items-base' : userLayers[0].id;
      ensureLayerGroups();
      layerGroups.forEach((group) => group.destroyChildren());

      if (typeof json.gridSize === 'number') { gridSize = json.gridSize; try { if (gridSizeInput) gridSizeInput.value = gridSize; localStorage.setItem('gridSize', String(gridSize)); } catch { } }
      gridBounds = json.gridBounds && Number.isFinite(json.gridBounds.x) && Number.isFinite(json.gridBounds.y) && Number.isFinite(json.gridBounds.width) && Number.isFinite(json.gridBounds.height) ? { ...json.gridBounds } : null;
      if (typeof json.snapDistanceFt === 'number') {
        snapDistanceFt = Math.min(15, Math.max(0.5, json.snapDistanceFt));
      } else if (typeof json.gridSize === 'number') {
        snapDistanceFt = Math.min(15, Math.max(0.5, json.gridSize));
      }
      showGrid = json.showGrid !== false;
      snapToGrid = json.snapToGrid !== false;
      inventoryShowOnPrint = json.inventoryPanel && typeof json.inventoryPanel.showOnPrint === 'boolean' ? json.inventoryPanel.showOnPrint : false;
      tentSetupsShowOnPrint = !!(json.inventoryPanel && json.inventoryPanel.showTentSetupsOnPrint);
      pipeDrapeShowOnPrint = !!(json.inventoryPanel && json.inventoryPanel.showPipeDrapeOnPrint);
      fenceRunsShowOnPrint = !!(json.inventoryPanel && json.inventoryPanel.showFenceRunsOnPrint);
    lightRunsShowOnPrint = !!(json.inventoryPanel && json.inventoryPanel.showLightRunsOnPrint);
      flooringShowOnPrint = !!(json.inventoryPanel && json.inventoryPanel.showFlooringOnPrint);
      seatingShowOnPrint = !!(json.inventoryPanel && json.inventoryPanel.showSeatingOnPrint);
      inventoryLimitsEnabled = !!(json.inventoryPanel && json.inventoryPanel.trackLimits);
      inventoryManualTotals = {};
      if (json.inventoryTotals && typeof json.inventoryTotals === 'object') {
        Object.entries(json.inventoryTotals).forEach(([name, total]) => {
          const normalised = normaliseInventoryTotalValue(total);
          if (normalised !== null) inventoryManualTotals[name] = normalised;
        });
      }
      if (gridToggle) gridToggle.checked = showGrid;
      syncSnapState();
      if (inventoryPrintToggle) inventoryPrintToggle.checked = inventoryShowOnPrint;
      if (tentSetupsPrintToggle) tentSetupsPrintToggle.checked = tentSetupsShowOnPrint;
      if (pipeDrapePrintToggle) pipeDrapePrintToggle.checked = pipeDrapeShowOnPrint;
      if (fenceRunsPrintToggle) fenceRunsPrintToggle.checked = fenceRunsShowOnPrint;
      if (lightRunsPrintToggle) lightRunsPrintToggle.checked = lightRunsShowOnPrint;
      if (seatingPrintToggle) seatingPrintToggle.checked = seatingShowOnPrint;
      if (inventoryLimitsToggle) inventoryLimitsToggle.checked = inventoryLimitsEnabled;
      if (snapDistanceInput) snapDistanceInput.value = String(snapDistanceFt);
      renderSnapDistanceValue();
      try { localStorage.setItem('showGrid', showGrid ? '1' : '0'); } catch { }
      try { localStorage.setItem('snapToGrid', snapToGrid ? '1' : '0'); } catch { }
      try { localStorage.setItem('snapDistanceFt', String(snapDistanceFt)); } catch { }
      const storedTheme = getStoredThemePreference();
      if (!storedTheme && json.darkMode !== undefined) {
        darkMode = !!json.darkMode;
        try { localStorage.setItem('theme', darkMode ? 'dark' : 'light'); } catch { }
      }
      if (json.units) { units = json.units; try { localStorage.setItem('units', units); } catch { } }
      referenceImageOpacity = Number.isFinite(Number(json.referenceImageOpacity)) ? Math.max(.05, Math.min(1, Number(json.referenceImageOpacity))) : .5;
      mergeLayoutGroupTemplates(json.layoutGroupTemplates);
      document.body.classList.toggle('dark-mode', darkMode);
      if (darkModeToggle) darkModeToggle.checked = darkMode;

      if (Array.isArray(json.venues)) {
        json.venues.forEach((v) => {
          if (!v) return;
          const unitHint = v.unit || v.units;
          const rawWidth = v.width !== undefined ? v.width : (v.widthFt !== undefined ? v.widthFt : v.widthFeet);
          const rawHeight = v.height !== undefined ? v.height : (v.heightFt !== undefined ? v.heightFt : v.heightFeet);

          let detectedUnit = unitHint;
          const widthNum = typeof rawWidth === 'number' ? rawWidth : parseFloat(rawWidth);
          const heightNum = typeof rawHeight === 'number' ? rawHeight : parseFloat(rawHeight);
          if (!detectedUnit && Number.isFinite(widthNum) && Number.isFinite(heightNum)) {
            if (widthNum >= 100 || heightNum >= 100) detectedUnit = 'px';
          }

          const rect = createVenue({
            type: v.type,
            x: v.x,
            y: v.y,
            rotation: v.rotation,
            width: widthNum,
            height: heightNum,
            unit: detectedUnit,
            outline: v.outline,
            legs: v.legs,
            polygon: v.polygon,
            components: v.components,
            doors: v.doors,
            attachments: v.attachments,
            reference: v.reference,
            customName: v.customName,
            customTemplateId: v.customTemplateId,
            tentSetupName: v.tentSetupName,
          });
          if (v.nodeId) rect.setAttr('nodeId', v.nodeId);
          const layerId = v.layerId && getLayer(v.layerId) ? v.layerId : 'venue-base';
          setNodeLayerId(rect, layerId);
          const targetGroup = getLayerGroup(layerId);
          if (targetGroup) targetGroup.add(rect);
        });
      }
      if (Array.isArray(json.items)) {
        const floorPromises = [];
        const referencePromises = [];
        const stageAddonEntries = [];
        json.items.forEach((it) => {
          if (!it) return;
          const savedFloorCategory = it.floorCategory || it.type;
          const isSubfloor = (it.itemKind === 'floor' || it.floorCategory) && savedFloorCategory === 'subfloor';
          const layerId = isSubfloor ? 'subfloor-base' : (it.layerId && getLayer(it.layerId) ? it.layerId : 'items-base');
          const targetGroup = getLayerGroup(layerId);
          if (it.itemKind === 'referenceImage' || it.type === 'referenceImage') {
            const referenceLayerId = it.layerId && getLayer(it.layerId) ? it.layerId : 'reference-base';
            const referenceGroup = getLayerGroup(referenceLayerId);
            referencePromises.push(createReferenceImage(it).then((node) => {
              if (!node || !referenceGroup) return;
              setNodeLayerId(node, referenceLayerId); referenceGroup.add(node);
            }).catch((error) => console.warn('Could not restore reference image:', error)));
          } else if (it.itemKind === 'grouped_seating' || it.type === 'groupedSeating') {
            const node = createGroupedSeatingLayout(it.groupedConfig || {}, { x: it.x || 0, y: it.y || 0, rotation: it.rotation || 0 });
            if (node && targetGroup) {
              if (it.nodeId) node.setAttr('nodeId', it.nodeId);
              setNodeLayerId(node, layerId);
              targetGroup.add(node);
            }
          } else if (it.itemKind === 'layout_group' || it.type === 'layoutGroup') {
            const node = createLayoutGroup(it.layoutGroupConfig || {}, { x: it.x || 0, y: it.y || 0, rotation: it.rotation || 0, name: it.layoutGroupName || 'Layout group' });
            if (node && targetGroup) {
              if (it.nodeId) node.setAttr('nodeId', it.nodeId);
              setNodeLayerId(node, layerId);
              targetGroup.add(node);
            }
          } else if (it.itemKind === 'tent_addon') {
            const parentTent = getNodeById(it.parentTentNodeId || '');
            const savedAddonType = it.addonType || 'sidewall';
            const addonType = savedAddonType === 'bistro' ? 'customBistro' : savedAddonType;
            // Fan and lighting add-ons used to save in Items. Restore all of
            // them to Hanging Decor so they consistently render above tables.
            const addonLayerId = isHangingDecorAddon(addonType) ? 'decor-base' : layerId;
            const addonGroup = getLayerGroup(addonLayerId);
            if (parentTent && parentTent.getAttr('venueType') === 'tent' && addonGroup) {
              const legacyStrings = savedAddonType === 'bistro' ? [bistroZigZagPointsFt(Number(parentTent.getAttr('widthFt')) || 10, Number(parentTent.getAttr('heightFt')) || 10)] : null;
              const restoredAttachment = legacyStrings ? { kind: 'customBistro', strings: legacyStrings } : it.attachment;
              const node = createTentAddonNode({ type: it.type || 'item', addonType, category: it.inventoryCategory || '', inventoryName: savedAddonType === 'bistro' ? 'Custom Bistro Lights' : (it.inventoryName || ''), familyId: it.familyId || '', color: it.color || '#98b7d7', diameterFt: it.diameter || undefined, widthFt: it.width || undefined, lengthFt: savedAddonType === 'sidewall' ? (Number(it.attachment && it.attachment.lengthFt) || 10) : (it.length || undefined), weightFootprint: it.weightFootprint || undefined }, parentTent, { x: parentTent.x(), y: parentTent.y() });
              if (it.nodeId) node.setAttr('nodeId', it.nodeId);
              if (restoredAttachment) node.setAttr('attachment', cloneConfig(restoredAttachment));
              setNodeLayerId(node, addonLayerId); addonGroup.add(node); renderTentAddonGeometry(node, parentTent);
            }
          } else if (it.itemKind === 'drawn_run' || it.type === 'drawnRun') {
            const points = Array.isArray(it.runPoints) ? it.runPoints : [];
            if (points.length >= 2 && targetGroup) {
              const node = createDrawnRunNode({ drawMode: it.drawMode, inventoryName: it.inventoryName, category: it.inventoryCategory, color: it.color, lightPostAnchors: it.lightPostAnchors }, points);
              if (it.nodeId) node.setAttr('nodeId', it.nodeId);
              const preferredLayer = it.drawMode === 'bistro' ? 'decor-base' : layerId;
              setNodeLayerId(node, preferredLayer); (getLayerGroup(preferredLayer) || targetGroup).add(node);
            }
          } else if (it.itemKind === 'stage_addon' || it.type === 'stageAddon') {
            stageAddonEntries.push({ it, layerId, targetGroup });
          } else if (it.itemKind === 'pipe_drape_chain' || it.type === 'pipeDrapeChain') {
            const points = Array.isArray(it.points) ? it.points : [];
            if (points.length >= 2 && targetGroup) {
              const node = createPipeDrapeChain({ id: it.crossbarId, name: it.crossbarName, min: Number(it.crossbarMinFt), max: Number(it.crossbarMaxFt), heightFt: Number(it.heightFt) || 10 }, points);
              if (it.nodeId) node.setAttr('nodeId', it.nodeId);
              const order = Number(it.pipeDrapeSetupOrder) || Number(it.pipeDrapeRunOrder) || pipeDrapeSetupCounter;
              node.setAttrs({ pipeDrapeSetupId: it.pipeDrapeSetupId || node.getAttr('pipeDrapeSetupId'), pipeDrapeSetupOrder: order, pipeDrapeRunOrder: Number(it.pipeDrapeRunOrder) || order, pipeDrapeSetupName: it.pipeDrapeSetupName || '' });
              pipeDrapeSetupCounter = Math.max(pipeDrapeSetupCounter, order); setNodeLayerId(node, layerId); targetGroup.add(node);
            }
          } else if (it.itemKind === 'fence_chain' || it.type === 'fenceChain') {
            const points = Array.isArray(it.points) ? it.points : [];
            if (points.length >= 2 && targetGroup) {
              const node = createFenceChain({ panelLengthFt: Number(it.panelLengthFt) || 8 }, points);
              if (it.nodeId) node.setAttr('nodeId', it.nodeId);
              const order = Number(it.fenceSetupOrder) || Number(it.fenceRunOrder) || fenceSetupCounter;
              node.setAttrs({ fenceSetupId: it.fenceSetupId || node.getAttr('fenceSetupId'), fenceSetupOrder: order, fenceRunOrder: Number(it.fenceRunOrder) || order });
              fenceSetupCounter = Math.max(fenceSetupCounter, order); setNodeLayerId(node, layerId); targetGroup.add(node);
            }
          } else if (it.itemKind === 'label' || it.type === 'label') {
            const node = createLabelNode({
              text: it.text || '',
              x: it.x || 0,
              y: it.y || 0,
              rotation: it.rotation || 0,
              attachedToNodeId: it.attachedToNodeId || null,
              attachmentOffset: cloneConfig(it.attachmentOffset || null),
              fontSize: it.fontSize,
              labelColor: it.labelColor,
              fontStyle: it.fontStyle,
              labelBorder: !!it.labelBorder,
              nodeId: it.nodeId || null,
              autoGenerated: !!it.autoGenerated,
              labelKind: it.labelKind || '',
            });
            if (node && targetGroup) {
              setNodeLayerId(node, layerId && getLayer(layerId) ? layerId : 'labels-base');
              targetGroup.add(node);
            }
          } else if (it.itemKind === 'floor' || it.floorCategory) {
            const cat = (it.floorCategory || it.type) === 'dancefloor' ? ((it.floorOptions || {}).style === 'classic' ? 'classicDancefloor' : 'modernDancefloor') : (it.floorCategory || it.type || 'floor');
            const widthFt = Number(it.width) || Number(it.length) || 10;
            const lengthFt = Number(it.length) || Number(it.width) || 10;
            floorPromises.push(
              createFlooring(cat, widthFt, lengthFt, {
                x: it.x || 0,
                y: it.y || 0,
                rotation: it.rotation || 0,
                customTexture: !!it.customTexture,
                floorOptions: cloneConfig(it.floorOptions) || {},
              })
                .then((node) => {
                  if (!node || !targetGroup) return;
                  if (it.nodeId) node.setAttr('nodeId', it.nodeId);
                  node.setAttr('flooringLabel', it.flooringLabel || '');
                  setNodeLayerId(node, layerId);
                  targetGroup.add(node);
                })
            );
          } else {
            const payload = { ...it };
            if (!payload.unit) payload.unit = 'px';
            const node = createItem(payload);
            if (it.nodeId) node.setAttr('nodeId', it.nodeId);
            setNodeLayerId(node, layerId);
            if (targetGroup) targetGroup.add(node);
          }
        });
        if (floorPromises.length || referencePromises.length) await Promise.all([...floorPromises, ...referencePromises]);
        stageAddonEntries.forEach(({ it, layerId, targetGroup }) => { const parentStage = getNodeById(it.parentStageNodeId || ''); if (!parentStage || !targetGroup) return; const node = createStageAddonNode({ addonType: it.addonType, inventoryName: it.inventoryName, stageEdge: cloneConfig(it.stageEdge || null) }, parentStage, { x: it.x || parentStage.x(), y: it.y || parentStage.y() }); if (node) { if (it.nodeId) node.setAttr('nodeId', it.nodeId); setNodeLayerId(node, layerId); targetGroup.add(node); } });
      }

      repairLegacyAttachedLabels();
      refreshStandaloneLightConnections();
      forEachNode((node) => {
        if (node.getAttr && node.getAttr('customType') !== 'label') syncAttachedLabelsForNode(node);
      });

      drawGrid();
      syncSnapState();
      refreshLayersUI();
      refreshInventoryPanelUI();
      ensureLayerOrder();
      worldLayer.draw();
      if (!plannerHistoryApplying) recordPlannerHistory(true);
    } finally {
      suppressDirtyTracking = false;
    }
  }

  const printSectionDefinitions = [
    { key: 'inventory', label: 'Item counts', enabled: () => inventoryShowOnPrint, set: (value) => { inventoryShowOnPrint = value; }, available: () => getInventoryPanelRows().some((row) => row.used > 0) },
    { key: 'tentSetups', label: 'Tent setups', enabled: () => tentSetupsShowOnPrint, set: (value) => { tentSetupsShowOnPrint = value; }, available: () => collectTentSetups().length > 0 },
    { key: 'pipeDrape', label: 'Pipe & drape', enabled: () => pipeDrapeShowOnPrint, set: (value) => { pipeDrapeShowOnPrint = value; }, available: () => pipeDrapeDetails().setups.length > 0 },
    { key: 'fenceRuns', label: 'Fence runs', enabled: () => fenceRunsShowOnPrint, set: (value) => { fenceRunsShowOnPrint = value; }, available: () => fenceDetails().length > 0 },
    { key: 'lightRuns', label: 'Standalone lights', enabled: () => lightRunsShowOnPrint, set: (value) => { lightRunsShowOnPrint = value; }, available: () => { let found = false; forEachNode((node) => { if (node && node.getAttr && node.getAttr('customType') === 'drawnRun' && node.getAttr('drawMode') === 'bistro') found = true; }); return found; } },
    { key: 'flooring', label: 'Flooring', enabled: () => flooringShowOnPrint, set: (value) => { flooringShowOnPrint = value; }, available: () => flooringInventoryRows().details.length > 0 },
    { key: 'seating', label: 'Seating', enabled: () => seatingShowOnPrint, set: (value) => { seatingShowOnPrint = value; }, available: () => chairRowsDetails().length > 0 || tableSeatingDetails().length > 0 },
  ];

  function availablePrintSections() { return printSectionDefinitions.filter((section) => section.available()); }

  function hasSelectedPrintInfo() { return printSectionDefinitions.some((section) => section.enabled()); }

  function shouldUseSetupLegendBottom(orientation) {
    const setupMapSelected = !!(printLayoutMapOnly && printLayoutMapOnly.checked);
    return setupMapSelected && orientation === 'portrait' && hasSelectedPrintInfo();
  }

  function shouldPrintSetupLegendPage(orientation) {
    const setupMapSelected = !!(printLayoutMapOnly && printLayoutMapOnly.checked);
    const requested = printSetupLegendPage ? !!printSetupLegendPage.checked : printSetupLegendPagePreference;
    if (!setupMapSelected || orientation === 'portrait' || !requested) return false;
    return hasSelectedPrintInfo();
  }

  function renderSetupLegendPageContent() {
    if (!printSetupLegendPageContent) return;
    const rows = getPrintSetupLegendRows().filter((row) => row.used > 0 || row.eventUsed > 0);
    if (!rows.length) {
      printSetupLegendPageContent.innerHTML = '';
      return;
    }
    printSetupLegendPageContent.innerHTML = `<div class="print-inventory-summary">${printInventorySummaryMarkup(rows, 'total-count', inventoryLimitsEnabled, { escapeHtml, formatInventoryAmount, formatInventoryUsage, visualMarkup: printVisualForInventoryName })}</div>`;
  }

  function renderPrintSectionOptions() {
    if (!printSectionOptions) return;
    const sections = availablePrintSections();
    printSectionOptions.innerHTML = sections.map((section) => `<label class="form-check form-switch"><input class="form-check-input" type="checkbox" data-print-section="${section.key}"${section.enabled() ? ' checked' : ''} /> <span class="form-check-label">${section.label}</span></label>`).join('');
    if (printSectionEmpty) printSectionEmpty.style.display = sections.length ? 'none' : '';
  }

  function syncPrintPreferencesLayout() {
    const isMapKey = !!(printLayoutMapKey && printLayoutMapKey.checked);
    const orientation = (document.querySelector('input[name="printOrientation"]:checked') || {}).value || printOrientationPreference;
    if (printSetupMapOptions) printSetupMapOptions.style.display = 'none';
    if (printMapKeyOptions) printMapKeyOptions.style.display = isMapKey ? '' : 'none';
    if (printSectionPicker) printSectionPicker.style.display = '';
    const sectionTitle = document.getElementById('printSectionPickerTitle');
    if (sectionTitle) sectionTitle.textContent = isMapKey ? 'Include in Event Plan Info' : 'Include in Setup Map';
    if (printSetupLegendPage) printSetupLegendPage.parentElement.style.display = isMapKey || orientation === 'portrait' ? 'none' : '';
    if (printPreferencesStatus) {
      printPreferencesStatus.textContent = isMapKey
        ? 'Event Plan Info keeps the map and selected event details together.'
        : 'Setup Map prints the visible map with the selected count and setup details.';
    }
  }

  function setPrintPageOrientation(orientation) {
    if (!printPageStyle) return;
    printPageStyle.textContent = `@page { size: letter ${orientation === 'portrait' ? 'portrait' : 'landscape'}; margin: 4mm; }`;
  }

  function closePrintPreferences() { if (printPreferencesModal) printPreferencesModal.style.display = 'none'; }

  function restorePrintKeyContinuation() {
    if (!printKeyContent || !printKeyPageContent) return;
    if (printKeyContent.parentElement === printKeyPageContent && printKeySidebar) printKeySidebar.appendChild(printKeyContent);
    Array.from(printKeyPageContent.children).filter((section) => section !== printKeyContent).forEach((section) => printKeyContent.appendChild(section));
  }

  function splitPrintKeyContinuation(layout, samePage) {
    restorePrintKeyContinuation();
    if (!samePage || !['side-key', 'stacked-key'].includes(layout) || !printKeyContent || !printKeyPageContent) return false;
    const visibleSections = Array.from(printKeyContent.children).filter((section) => section.style.display !== 'none');
    const canonicalSections = [
      printInventorySummaryEl,
      printTentSetupSummaryEl,
      printPipeDrapeSummaryEl,
      printFenceRunsSummaryEl,
      printLightRunsSummaryEl,
      printFlooringSummaryEl,
      printSeatingSummaryEl,
      printNotesSummaryEl,
    ].filter(Boolean);
    const orderedSections = [
      ...canonicalSections.filter((section) => visibleSections.includes(section)),
      ...visibleSections.filter((section) => !canonicalSections.includes(section)),
    ];
    const inventorySection = orderedSections.find((section) => section.id === 'printInventorySummary');
    if (!orderedSections.length) return false;
    orderedSections.forEach((section) => printKeyContent.appendChild(section));
    const firstPagePanel = layout === 'side-key' ? printKeySidebar : printKeyBelow;
    if (!firstPagePanel || !firstPagePanel.clientHeight) return false;
    const continuation = layout === 'stacked-key'
      ? (() => {
        // Portrait packs complete table rows down each column before using
        // the next column. Once a section crosses either panel edge, that
        // section and every following section continue together.
        const panelBounds = firstPagePanel.getBoundingClientRect();
        const firstOverflowIndex = orderedSections.findIndex((section) => {
          const sectionBounds = section.getBoundingClientRect();
          return sectionBounds.bottom > panelBounds.bottom + 1 || sectionBounds.right > panelBounds.right + 1;
        });
        return firstOverflowIndex < 0 ? [] : orderedSections.slice(firstOverflowIndex);
      })()
      : (() => {
        const availableHeight = firstPagePanel.clientHeight;
        return orderedSections.filter((section) => section !== inventorySection && section.offsetTop + section.offsetHeight > availableHeight);
    })();
    if (!continuation.length) return false;
    continuation.forEach((section) => printKeyPageContent.appendChild(section));
    return true;
  }

  function mountPrintKey(layout, setupLegendBottom = false) {
    if (!printKeyContent) return;
    if (layout === 'key-pages' && printKeyPageContent) printKeyPageContent.appendChild(printKeyContent);
    else if (layout === 'map-only' && setupLegendBottom && printKeyBelow) printKeyBelow.appendChild(printKeyContent);
    else if (layout === 'map-only' && printMapOverlay) printMapOverlay.appendChild(printKeyContent);
    else if (layout === 'stacked-key' && printKeyBelow) printKeyBelow.appendChild(printKeyContent);
    else if (printKeySidebar) printKeySidebar.appendChild(printKeyContent);
  }

  function selectedPrintLayout(printAll = false) {
    const selected = document.querySelector('input[name="printLayoutMode"]:checked');
    const requestedLayout = selected ? selected.value : printLayoutPreference;
    const orientation = (document.querySelector('input[name="printOrientation"]:checked') || {}).value || printOrientationPreference;
    const samePage = printKeySamePage ? !!printKeySamePage.checked : printKeySamePagePreference;
    if (printAll) return { layout: 'key-pages', orientation, samePage, setupLegendBottom: false, setupLegendPage: false };
    if (requestedLayout !== 'map-key') return { layout: 'map-only', orientation, samePage, setupLegendBottom: shouldUseSetupLegendBottom(orientation), setupLegendPage: shouldPrintSetupLegendPage(orientation) };
    if (!hasSelectedPrintInfo() && !currentPrintNotes()) return { layout: 'map-only', orientation, samePage };
    return { layout: samePage ? (orientation === 'portrait' ? 'stacked-key' : 'side-key') : 'key-pages', orientation, samePage, setupLegendBottom: false, setupLegendPage: false };
  }

  function applyPrintLayoutState(layout, orientation, hasKey, setupLegendBottom = false, setupLegendPage = false) {
    if (!printLayout) return;
    restorePrintKeyContinuation();
    mountPrintKey(layout, setupLegendBottom);
    printLayout.classList.remove('print-layout-map-only', 'print-layout-side-key', 'print-layout-stacked-key', 'print-layout-key-pages', 'print-orientation-landscape', 'print-orientation-portrait', 'print-has-key', 'print-has-key-continuation', 'print-setup-legend-bottom', 'print-has-setup-legend-page');
    printLayout.classList.add(`print-layout-${layout}`, `print-orientation-${orientation}`);
    if (hasKey) printLayout.classList.add('print-has-key');
    if (setupLegendBottom) printLayout.classList.add('print-setup-legend-bottom');
    if (setupLegendPage) printLayout.classList.add('print-has-setup-legend-page');
  }

  function clearPreviewPrintLayoutState() {
    document.body.classList.remove('print-preview-measure');
    restorePrintKeyContinuation();
    if (printKeySidebar && printKeyContent) printKeySidebar.appendChild(printKeyContent);
    if (printLayout) printLayout.classList.remove('print-layout-map-only', 'print-layout-side-key', 'print-layout-stacked-key', 'print-layout-key-pages', 'print-orientation-landscape', 'print-orientation-portrait', 'print-has-key', 'print-has-key-continuation', 'print-setup-legend-bottom', 'print-has-setup-legend-page');
  }

  function splitPrintKeyForLetterPage(layout, samePage) {
    if (!samePage || !['side-key', 'stacked-key'].includes(layout) || !printLayout) return false;
    document.body.classList.add('print-preview-measure');
    void printLayout.offsetHeight;
    const hasContinuation = splitPrintKeyContinuation(layout, samePage);
    document.body.classList.remove('print-preview-measure');
    return hasContinuation;
  }

  function preparePreviewPrintPages(layout, orientation, samePage, hasKey, setupLegendBottom = false, setupLegendPage = false) {
    if (!printLayout || !printKeyContent || !printKeyPageContent) return { previewLayout: null, hasContinuation: false };
    applyPrintLayoutState(layout, orientation, hasKey, setupLegendBottom, setupLegendPage);
    const hasContinuation = splitPrintKeyForLetterPage(layout, samePage);
    if (hasContinuation) printLayout.classList.add('print-has-key-continuation');
    // Clone the already-paginated print sheet itself. The modal must never
    // reconstruct tables into a separate preview-only page structure.
    const previewLayout = printLayout.cloneNode(true);
    previewLayout.removeAttribute('id');
    previewLayout.classList.add('print-preview-layout');
    clearPreviewPrintLayoutState();
    return { previewLayout, hasContinuation: setupLegendPage || hasContinuation };
  }

  function renderPrintPreview() {
    if (!printPreview) return;
    renderPrintKeyContent(false);
    const { layout, orientation, samePage, setupLegendBottom = false, setupLegendPage = false } = selectedPrintLayout();
    const requestedLayout = (document.querySelector('input[name="printLayoutMode"]:checked') || {}).value || printLayoutPreference;
    const hasKey = requestedLayout === 'map-only'
      ? hasSelectedPrintInfo()
      : hasSelectedPrintInfo() || !!currentPrintNotes();
    const subLabel = String((printPreferencesSubLabel && printPreferencesSubLabel.value) || '').trim();
    const timestamp = (!currentDocumentUpdatedAt || isDirty) ? new Date().toISOString() : currentDocumentUpdatedAt;
    const modified = `Last modified ${formatTimestamp(timestamp) || new Date(timestamp).toLocaleString()}`;
    if (printTitleEl) printTitleEl.textContent = currentDocumentTitle || 'Untitled planner';
    if (printNoteEl) printNoteEl.textContent = subLabel ? `- ${subLabel}` : '';
    if (printModifiedEl) printModifiedEl.textContent = modified;
    if (printKeyPageTitle) printKeyPageTitle.textContent = currentDocumentTitle || 'Untitled planner';
    if (printKeyPageModified) printKeyPageModified.textContent = modified;
    const pages = preparePreviewPrintPages(layout, orientation, samePage, hasKey, setupLegendBottom, setupLegendPage);
    printPreview.replaceChildren();
    if (pages.previewLayout) printPreview.appendChild(pages.previewLayout);
    const referenceNodes = worldLayer ? worldLayer.find('.referenceUnderlay') : [];
    const uiWasVisible = !!(uiGroup && uiGroup.visible && uiGroup.visible());
    try {
      referenceNodes.forEach((node) => node.hide());
      if (uiGroup) uiGroup.hide();
      const previewImage = pages.previewLayout && pages.previewLayout.querySelector('#printImage');
      if (previewImage) previewImage.src = stage ? stage.toDataURL({ pixelRatio: 1, mimeType: 'image/png' }) : '';
    } catch (error) {
      console.error('Could not build print preview:', error);
    } finally {
      referenceNodes.forEach((node) => node.show());
      if (uiGroup && uiWasVisible) uiGroup.show();
      if (worldLayer) worldLayer.batchDraw();
    }
    requestAnimationFrame(() => {
      if (!printPreviewStatus) return;
      if (pages.hasContinuation) {
        const rows = pages.previewLayout ? pages.previewLayout.querySelectorAll('.print-key-page-content tbody tr').length : 0;
        printPreviewStatus.textContent = `Page 1 plus Event Plan Info continuation (${rows} rows on the next page).`;
      } else {
        printPreviewStatus.textContent = `${orientation === 'portrait' ? 'Portrait' : 'Landscape'} preview fits on one sheet.`;
      }
    });
  }

  function openPrintPreferences() {
    if (!printPreferencesModal) return handlePrint();
    refreshInventoryPanelUI();
    renderPrintSectionOptions();
    // Keep the default report readable: item counts start enabled while the
    // more detailed setup sections remain explicit choices.
    if (!hasSelectedPrintInfo()) {
      inventoryShowOnPrint = true;
      renderPrintSectionOptions();
    }
    if (printLayoutMapOnly) printLayoutMapOnly.checked = printLayoutPreference === 'map-only';
    if (printLayoutMapKey) printLayoutMapKey.checked = printLayoutPreference !== 'map-only';
    if (printSetupLegend) printSetupLegend.checked = printSetupLegendPreference;
    if (printSetupLegendPage) printSetupLegendPage.checked = printSetupLegendPagePreference;
    if (printKeySamePage) printKeySamePage.checked = printKeySamePagePreference;
    if (printOrientationLandscape) printOrientationLandscape.checked = printOrientationPreference !== 'portrait';
    if (printOrientationPortrait) printOrientationPortrait.checked = printOrientationPreference === 'portrait';
    syncPrintPreferencesLayout();
    if (printPreferencesSubLabel) printPreferencesSubLabel.value = '';
    if (printPreferencesNotes) printPreferencesNotes.value = '';
    printPreferencesModal.style.display = 'flex';
    setTimeout(() => { renderPrintPreview(); printPreferencesSubLabel && printPreferencesSubLabel.focus(); }, 0);
  }

  function renderPrintKeyContent(printAll = false) {
    const selected = document.querySelector('input[name="printLayoutMode"]:checked');
    const requestedLayout = printAll ? 'map-key' : (selected ? selected.value : printLayoutPreference);
    const setupLegendEnabled = printSetupLegend ? !!printSetupLegend.checked : printSetupLegendPreference;
    const clearSummary = (element) => {
      if (!element) return;
      element.style.display = 'none';
      element.innerHTML = '';
    };
    if (requestedLayout === 'map-only') {
      [printTentSetupSummaryEl, printPipeDrapeSummaryEl, printFenceRunsSummaryEl, printLightRunsSummaryEl, printFlooringSummaryEl, printSeatingSummaryEl, printNotesSummaryEl].forEach(clearSummary);
      if (inventoryShowOnPrint) renderPrintInventorySummary(getPrintSetupLegendRows(), 'total-count');
      else clearSummary(printInventorySummaryEl);
      renderPrintTentSetupSummary(collectTentSetups());
      renderPrintPipeDrapeSummary(pipeDrapeDetails());
      renderPrintFenceRunsSummary(fenceDetails());
      renderPrintLightRunsSummary();
      renderFlooringSummary();
      renderPrintChairRowsSummary();
      if (printSetupLegendPageContent) printSetupLegendPageContent.innerHTML = '';
      return;
    }
    const savedPrintInfo = {
      inventory: inventoryShowOnPrint,
      tentSetups: tentSetupsShowOnPrint,
      pipeDrape: pipeDrapeShowOnPrint,
      fenceRuns: fenceRunsShowOnPrint,
      lightRuns: lightRunsShowOnPrint,
      flooring: flooringShowOnPrint,
      seating: seatingShowOnPrint,
    };
    if (printAll) {
      inventoryShowOnPrint = true;
      tentSetupsShowOnPrint = true;
      pipeDrapeShowOnPrint = true;
      fenceRunsShowOnPrint = true;
      lightRunsShowOnPrint = true;
      flooringShowOnPrint = true;
      seatingShowOnPrint = true;
    }
    try {
      // Event Plan Info reports both the visible map and full-event counts.
      renderPrintInventorySummary(getPrintWorkspaceRows(true), 'event-info');
      renderPrintTentSetupSummary(collectTentSetups());
      renderPrintPipeDrapeSummary(pipeDrapeDetails());
      renderPrintFenceRunsSummary(fenceDetails());
      renderPrintLightRunsSummary();
      renderFlooringSummary();
      renderPrintChairRowsSummary();
      renderPrintNotesSummary();
      const orientation = (document.querySelector('input[name="printOrientation"]:checked') || {}).value || printOrientationPreference;
      if (requestedLayout === 'map-key' && orientation === 'portrait') renderPortraitEventPlanStream();
    } finally {
      if (printAll) {
        inventoryShowOnPrint = savedPrintInfo.inventory;
        tentSetupsShowOnPrint = savedPrintInfo.tentSetups;
        pipeDrapeShowOnPrint = savedPrintInfo.pipeDrape;
        fenceRunsShowOnPrint = savedPrintInfo.fenceRuns;
        lightRunsShowOnPrint = savedPrintInfo.lightRuns;
        flooringShowOnPrint = savedPrintInfo.flooring;
        seatingShowOnPrint = savedPrintInfo.seating;
      }
    }
  }

  function handlePrint(options = {}) {
    if (!stage || !printLayout || !printImageEl || !printTitleEl || !printModifiedEl) { window.print(); return; }
    const printAll = !!options.printAll;
    const selected = document.querySelector('input[name="printLayoutMode"]:checked');
    const requestedLayout = selected ? selected.value : printLayoutPreference;
    restorePrintKeyContinuation();
    renderPrintKeyContent(printAll);
    const { layout, orientation, samePage, setupLegendBottom = false, setupLegendPage = false } = selectedPrintLayout(printAll);
    const hasPrintInfo = requestedLayout === 'map-only'
      ? hasSelectedPrintInfo()
      : hasSelectedPrintInfo() || !!currentPrintNotes();
    if (!printAll) {
      printLayoutPreference = requestedLayout;
      printOrientationPreference = orientation;
      printKeySamePagePreference = samePage;
      printSetupLegendPreference = printSetupLegend ? !!printSetupLegend.checked : printSetupLegendPreference;
      printSetupLegendPagePreference = printSetupLegendPage ? !!printSetupLegendPage.checked : false;
    }
    const subLabel = (printPreferencesSubLabel && printPreferencesSubLabel.value || '').trim();
    closePrintPreferences();
    const timestamp = (!currentDocumentUpdatedAt || isDirty) ? new Date().toISOString() : currentDocumentUpdatedAt;
    const modified = `Last modified ${formatTimestamp(timestamp) || new Date(timestamp).toLocaleString()}`;
    printTitleEl.textContent = currentDocumentTitle || 'Untitled planner';
    if (printNoteEl) printNoteEl.textContent = subLabel ? `- ${subLabel}` : '';
    printModifiedEl.textContent = modified;
    if (printKeyPageTitle) printKeyPageTitle.textContent = currentDocumentTitle || 'Untitled planner';
    if (printKeyPageModified) printKeyPageModified.textContent = modified;
    setPrintPageOrientation(orientation);
    applyPrintLayoutState(layout, orientation, hasPrintInfo || printAll, setupLegendBottom, setupLegendPage);
    const hasContinuation = splitPrintKeyForLetterPage(layout, samePage);
    if (hasContinuation) printLayout.classList.add('print-has-key-continuation');
    const finalizePrint = () => {
      document.body.classList.add('print-mode');
      requestAnimationFrame(() => {
        const cleanup = () => { document.body.classList.remove('print-mode'); printLayout.classList.remove('print-has-key-continuation'); printImageEl.removeAttribute('src'); restorePrintKeyContinuation(); if (printKeySidebar && printKeyContent) printKeySidebar.appendChild(printKeyContent); window.removeEventListener('afterprint', cleanup); };
        window.addEventListener('afterprint', cleanup);
        requestAnimationFrame(() => { window.print(); setTimeout(cleanup, 1000); });
      });
    };
    const referenceNodes = worldLayer.find('.referenceUnderlay');
    const uiWasVisible = !!(uiGroup && uiGroup.visible && uiGroup.visible());
    try {
      referenceNodes.forEach((node) => node.hide());
      if (uiGroup) uiGroup.hide();
      const dataUrl = stage.toDataURL({ pixelRatio: Math.max(2, window.devicePixelRatio || 1), mimeType: 'image/png' });
      printImageEl.onload = () => { printImageEl.onload = null; finalizePrint(); };
      printImageEl.src = dataUrl;
    } catch (err) { console.error('Could not build print snapshot:', err); window.print(); }
    finally {
      referenceNodes.forEach((node) => node.show());
      if (uiGroup && uiWasVisible) uiGroup.show();
      if (worldLayer) worldLayer.batchDraw();
    }
  }

  function bindUI() {
    // Tooltips
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    if (window.bootstrap && tooltipTriggerList && tooltipTriggerList.length) {
      tooltipTriggerList.forEach((el) => { try { new bootstrap.Tooltip(el); } catch (e) { /* ignore */ } });
    }

    if (inventorySearch) inventorySearch.addEventListener('input', filterInventoryPalette);

    if (selectBtn) selectBtn.addEventListener('click', () => setActiveTool('select'));
    if (panBtn) panBtn.addEventListener('click', () => setActiveTool(activeTool === 'pan' ? 'select' : 'pan'));
    if (labelToolBtn) labelToolBtn.addEventListener('click', beginLabelPlacementTool);
    if (labelTextCopy) labelTextCopy.addEventListener('click', copyLabelFromEditor);
    if (editLabelBtn) editLabelBtn.addEventListener('click', editSelectedLabel);
    if (labelGearBtn) labelGearBtn.addEventListener('click', editSelectedLabel);
    if (copyBtn) copyBtn.addEventListener('click', handleCopy);
    if (pasteBtn) pasteBtn.addEventListener('click', handlePaste);
    if (deleteBtn) deleteBtn.addEventListener('click', handleDelete);
    if (undoBtn) undoBtn.addEventListener('click', undoPlannerAction);
    if (redoBtn) redoBtn.addEventListener('click', redoPlannerAction);
    if (saveGroupBtn) saveGroupBtn.addEventListener('click', saveSelectedLayoutGroup);
    if (ungroupBtn) ungroupBtn.addEventListener('click', ungroupLayoutGroups);
    if (layoutGroupNameForm) layoutGroupNameForm.addEventListener('submit', (event) => { event.preventDefault(); const submit = layoutGroupNameSubmit; const name = layoutGroupNameInput ? layoutGroupNameInput.value : ''; closeLayoutGroupNameModal(); if (submit) submit(name); });
    [layoutGroupNameClose, layoutGroupNameCancel].forEach((button) => { if (button) button.addEventListener('click', closeLayoutGroupNameModal); });
    if (layoutGroupNameModal) layoutGroupNameModal.addEventListener('mousedown', (event) => { if (event.target === layoutGroupNameModal) closeLayoutGroupNameModal(); });
    if (labelTextForm) labelTextForm.addEventListener('submit', (event) => { event.preventDefault(); const submit = labelTextSubmit; const text = labelTextInput ? labelTextInput.value : ''; closeLabelTextModal(); if (submit) submit(text); });
    [labelTextClose, labelTextCancel].forEach((button) => { if (button) button.addEventListener('click', closeLabelTextModal); });
    if (labelTextModal) labelTextModal.addEventListener('mousedown', (event) => { if (event.target === labelTextModal) closeLabelTextModal(); });
    if (venueToggleBtn) venueToggleBtn.addEventListener('click', toggleVenueEditing);
    if (inventoryPanelTab) inventoryPanelTab.addEventListener('click', () => setActiveSidePanel('inventory', { open: true }));
    if (venuesPanelTab) venuesPanelTab.addEventListener('click', () => setActiveSidePanel('venues', { open: true }));
    const armRoomAttachment = (type, button) => armPlacementTool({ kind: 'roomAttachment', attachmentType: type, label: type === 'door' ? 'Door' : 'Opening' }, button);
    if (roomDoorTool) roomDoorTool.addEventListener('click', () => armRoomAttachment('door', roomDoorTool));
    if (roomOpeningTool) roomOpeningTool.addEventListener('click', () => armRoomAttachment('opening', roomOpeningTool));
    if (roomAttachmentClose) roomAttachmentClose.addEventListener('click', closeRoomAttachmentPopup);
    if (roomAttachmentSwing) roomAttachmentSwing.addEventListener('click', () => { if (!roomAttachmentEdit) return; roomAttachmentEdit.attachment.swing = roomAttachmentEdit.attachment.swing === 'inward' ? 'outward' : 'inward'; roomAttachmentEdit.attachment = updateRoomAttachment(roomAttachmentEdit.room, roomAttachmentEdit.attachment) || roomAttachmentEdit.attachment; });
    if (roomAttachmentDelete) roomAttachmentDelete.addEventListener('click', () => { if (!roomAttachmentEdit) return; const { room, attachment } = roomAttachmentEdit; room.setAttr('attachmentsSpec', roomAttachmentList({ attachments: room.getAttr('attachmentsSpec') || [] }).filter((item) => item.id !== attachment.id)); room.setAttr('doorsSpec', room.getAttr('attachmentsSpec').filter((item) => item.type === 'door')); renderRoomWalls(room, roomAttachmentComponents(room.getAttr('widthFt'), room.getAttr('heightFt'), room.getAttr('componentsSpec')), room.getAttr('outlineSpec')); renderVenueAttachmentGeometry(room); setDirty(true); closeRoomAttachmentPopup(); worldLayer.batchDraw(); });
    const applyRoomAttachmentWidth = () => {
      if (!roomAttachmentEdit || !roomAttachmentWidth) return;
      const value = Number(roomAttachmentWidth.value);
      if (!Number.isFinite(value) || value <= 0) return;
      roomAttachmentEdit.attachment.widthFt = value;
      roomAttachmentEdit.attachment = updateRoomAttachment(roomAttachmentEdit.room, roomAttachmentEdit.attachment) || roomAttachmentEdit.attachment;
      roomAttachmentWidth.value = String(roomAttachmentEdit.attachment.widthFt);
    };
    if (roomAttachmentWidth) {
      roomAttachmentWidth.addEventListener('input', applyRoomAttachmentWidth);
      roomAttachmentWidth.addEventListener('change', applyRoomAttachmentWidth);
    }
    if (buildVenueBtn) buildVenueBtn.addEventListener('click', () => { inventoryBuilderMode = false; openVenueBuilder(); });
    if (venueBuilderClose) venueBuilderClose.addEventListener('click', closeVenueBuilder);
    const setVenueBuilderMode = (mode) => {
      finalizeVenueBuilderDraft();
      if (mode === 'select' || mode === 'door' || mode === 'opening' || mode === 'erase') { lockVenueBuilderSelection(); venueBuilder.mode = mode; renderVenueBuilderDraft(); updateVenueBuilderUI(); return; }
      beginVenueBuilderComponent(mode);
    };
    if (venueBuilderSelect) venueBuilderSelect.addEventListener('click', () => setVenueBuilderMode('select'));
    if (venueBuilderTrace) venueBuilderTrace.addEventListener('click', () => setVenueBuilderMode('trace'));
    if (venueBuilderRectangle) venueBuilderRectangle.addEventListener('click', () => setVenueBuilderMode('rectangle'));
    if (venueBuilderCircle) venueBuilderCircle.addEventListener('click', () => setVenueBuilderMode('circle'));
    if (venueBuilderArc) venueBuilderArc.addEventListener('click', () => setVenueBuilderMode('arc'));
    if (venueBuilderLine) venueBuilderLine.addEventListener('click', () => setVenueBuilderMode('line'));
    if (venueBuilderDoor) venueBuilderDoor.addEventListener('click', () => setVenueBuilderMode('door'));
    if (venueBuilderOpening) venueBuilderOpening.addEventListener('click', () => setVenueBuilderMode('opening'));
    if (venueBuilderEraser) venueBuilderEraser.addEventListener('click', () => setVenueBuilderMode('erase'));
    if (venueBuilderDeleteWall) venueBuilderDeleteWall.addEventListener('click', () => {
      const walls = venueBuilder.selectedWalls;
      if (!walls.length) return window.alert(inventoryBuilderMode ? 'Select one or more item lines first, then choose Remove selected line.' : 'Select one or more walls first, then choose Delete wall.');
      walls.slice().forEach((wall) => deleteVenueBuilderWallByIndex(wall.componentId, wall.wallIndex));
      venueBuilder.selectedWalls = []; renderVenueBuilderDraft(); updateVenueBuilderUI();
    });
    if (venueBuilderPan) venueBuilderPan.addEventListener('click', () => { finalizeVenueBuilderDraft(); lockVenueBuilderSelection(); venueBuilder.mode = venueBuilder.mode === 'pan' ? 'select' : 'pan'; updateVenueBuilderUI(); });
    if (venueBuilderZoomIn) venueBuilderZoomIn.addEventListener('click', () => zoomVenueBuilder(1.25));
    if (venueBuilderZoomOut) venueBuilderZoomOut.addEventListener('click', () => zoomVenueBuilder(.8));
    if (venueBuilderResetView) venueBuilderResetView.addEventListener('click', resetVenueBuilderView);
    if (venueBuilderUndo) venueBuilderUndo.addEventListener('click', undoVenueBuilderAction);
    if (venueBuilderClear) venueBuilderClear.addEventListener('click', () => { venueBuilder.points = []; venueBuilder.components = []; venueBuilder.doors = []; venueBuilder.selectedId = null; venueBuilder.selectedWalls = []; venueBuilder.primitiveStart = null; venueBuilder.primitiveEnd = null; clearVenueBuilderPreview(); renderVenueBuilderDraft(); updateVenueBuilderUI(); });
    if (venueBuilderSave) venueBuilderSave.addEventListener('click', saveVenueBuilderTemplate);
    if (buildInventoryItemBtn) buildInventoryItemBtn.addEventListener('click', () => { inventoryBuilderMode = true; openVenueBuilder(); });
    if (exportCustomDataBtn) exportCustomDataBtn.addEventListener('click', exportCustomData);
    if (importCustomDataBtn && importCustomDataInput) importCustomDataBtn.addEventListener('click', () => importCustomDataInput.click());
    if (importCustomDataInput) importCustomDataInput.addEventListener('change', () => { const file = importCustomDataInput.files && importCustomDataInput.files[0]; if (file) importCustomData(file); importCustomDataInput.value = ''; });
    if (exportCustomVenuesBtn) exportCustomVenuesBtn.addEventListener('click', exportCustomData);
    if (importCustomVenuesBtn && importCustomVenuesInput) importCustomVenuesBtn.addEventListener('click', () => importCustomVenuesInput.click());
    if (importCustomVenuesInput) importCustomVenuesInput.addEventListener('change', () => { const file = importCustomVenuesInput.files && importCustomVenuesInput.files[0]; if (file) importCustomData(file); importCustomVenuesInput.value = ''; });
    if (venueBuilderImage) venueBuilderImage.addEventListener('change', async (event) => {
      const file = event.target.files && event.target.files[0]; if (!file) return;
      try { await openReferenceSetup(await referenceFileDataUrl(file), { context: 'builder' }); } catch (error) { window.alert(error.message || 'The reference image could not be added.'); }
      event.target.value = '';
    });
    if (venueBuilderReferenceSetup) venueBuilderReferenceSetup.addEventListener('click', () => {
      if (!venueBuilder.reference || !venueBuilder.reference.dataUrl) return;
      openReferenceSetup({ dataUrl: venueBuilder.reference.dataUrl, name: (venueBuilder.reference.referenceMeta || {}).sourceName || 'Trace reference', referenceMeta: venueBuilder.reference.referenceMeta || null }, { context: 'builder' }).catch((error) => window.alert(error.message || 'The reference image could not be opened.'));
    });
    if (venueBuilderImageOpacity) venueBuilderImageOpacity.addEventListener('input', () => { if (venueBuilder.referenceNode) { venueBuilder.referenceNode.opacity(Number(venueBuilderImageOpacity.value) || .5); venueBuilder.layer.batchDraw(); } });
    if (referenceSetupCanvas) {
      referenceSetupCanvas.addEventListener('pointerdown', referenceSetupDragStart);
      referenceSetupCanvas.addEventListener('pointermove', referenceSetupDragMove);
      referenceSetupCanvas.addEventListener('pointerup', referenceSetupDragEnd);
      referenceSetupCanvas.addEventListener('pointercancel', referenceSetupDragEnd);
      referenceSetupCanvas.addEventListener('contextmenu', (event) => event.preventDefault());
      referenceSetupCanvas.addEventListener('wheel', (event) => {
        if (!referenceSetup.open) return;
        event.preventDefault(); zoomReferenceSetup(event.deltaY < 0 ? 1.2 : (1 / 1.2));
      }, { passive: false });
    }
    if (referenceSetupResetFrame) referenceSetupResetFrame.addEventListener('click', () => { if (!referenceSetup.image) return; referenceSetup.crop = { x: 0, y: 0, width: referenceSetup.image.width, height: referenceSetup.image.height }; renderReferenceSetup(); });
    if (referenceSetupZoomOut) referenceSetupZoomOut.addEventListener('click', () => zoomReferenceSetup(1 / 1.2));
    if (referenceSetupZoomIn) referenceSetupZoomIn.addEventListener('click', () => zoomReferenceSetup(1.2));
    if (referenceSetupRotation) referenceSetupRotation.addEventListener('input', () => setReferenceSetupRotation(referenceSetupRotation.value));
    if (referenceSetupManualBtn) referenceSetupManualBtn.addEventListener('click', beginManualReferenceScale);
    if (referenceSetupManualApply) referenceSetupManualApply.addEventListener('click', applyManualReferenceScale);
    if (referenceSetupDirectScaleApply) referenceSetupDirectScaleApply.addEventListener('click', applyDirectReferenceScale);
    if (referenceSetupOpacity) referenceSetupOpacity.addEventListener('input', () => {
      const opacity = Math.min(1, Math.max(.1, Number(referenceSetupOpacity.value) || .5));
      referenceSetup.opacity = opacity;
      if (referenceSetupOpacityValue) referenceSetupOpacityValue.textContent = `${Math.round(opacity * 100)}%`;
      if (referenceSetup.target && referenceSetup.target.opacity) { referenceSetup.target.opacity(opacity); worldLayer && worldLayer.batchDraw(); }
    });
    if (referenceSetupApply) referenceSetupApply.addEventListener('click', applyReferenceSetup);
    [referenceSetupCancel, referenceSetupClose].forEach((button) => { if (button) button.addEventListener('click', () => closeReferenceSetup()); });
    if (referenceSetupModal) referenceSetupModal.addEventListener('mousedown', (event) => { if (event.target === referenceSetupModal) closeReferenceSetup(); });
    window.addEventListener('keydown', (event) => {
      const typing = event.target && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
      if (referenceSetup.open && event.code === 'Space' && !typing) { referenceSetupSpacePressed = true; event.preventDefault(); }
      if (event.key === 'Escape' && labelTextModal && labelTextModal.style.display !== 'none') { closeLabelTextModal(); return; }
      if (event.key === 'Escape' && labelPlacementDraft) { labelPlacementDraft = null; clearLabelPlacementPreview(); return; }
      if (event.key === 'Escape' && referenceSetup.open) { closeReferenceSetup(); return; }
      if (event.key === 'Escape' && printPreferencesModal && printPreferencesModal.style.display !== 'none') { closePrintPreferences(); return; }
      if (!venueBuilder.open || (event.key !== 'Backspace' && event.key !== 'Delete')) return;
      const target = event.target;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (venueBuilder.selectedId) {
        venueBuilder.components = venueBuilder.components.filter((component) => component.id !== venueBuilder.selectedId);
        venueBuilder.doors = venueBuilder.doors.filter((door) => door.componentId !== venueBuilder.selectedId);
        venueBuilder.selectedId = null; venueBuilder.selectedWalls = []; venueBuilder.points = []; renderVenueBuilderDraft(); updateVenueBuilderUI(); return;
      }
      if (!Array.isArray(venueBuilder.points) || !venueBuilder.points.length) return;
      event.preventDefault();
      venueBuilder.points.pop(); renderVenueBuilderDraft(); updateVenueBuilderUI();
    });
    window.addEventListener('keyup', (event) => { if (event.code === 'Space') referenceSetupSpacePressed = false; });
    if (labelsToggleBtn) labelsToggleBtn.addEventListener('click', toggleLabelsVisibility);
    if (inventoryKeyBtn) inventoryKeyBtn.addEventListener('click', toggleInventoryKeyPanel);
    if (inventoryKeyRefreshBtn) inventoryKeyRefreshBtn.addEventListener('click', refreshInventoryPanelUI);
    if (layersBtn) layersBtn.addEventListener('click', toggleLayersPanel);
    if (inventoryKeyCloseBtn) inventoryKeyCloseBtn.addEventListener('click', hideInventoryKeyPanel);
    if (inventoryPrintToggle) inventoryPrintToggle.addEventListener('change', () => {
      inventoryShowOnPrint = !!inventoryPrintToggle.checked;
      refreshInventoryPanelUI();
      setDirty(true);
    });
    [inventoryPrintToggle, tentSetupsPrintToggle, pipeDrapePrintToggle, fenceRunsPrintToggle, lightRunsPrintToggle, flooringPrintToggle, seatingPrintToggle].forEach((toggle) => { if (toggle) { toggle.addEventListener('click', (event) => event.stopPropagation()); const label = toggle.closest('label'); if (label) label.addEventListener('click', (event) => event.stopPropagation()); } });
    if (tentSetupsPrintToggle) tentSetupsPrintToggle.addEventListener('change', () => {
      tentSetupsShowOnPrint = !!tentSetupsPrintToggle.checked;
      refreshInventoryPanelUI();
      setDirty(true);
    });
    if (pipeDrapePrintToggle) pipeDrapePrintToggle.addEventListener('change', () => {
      pipeDrapeShowOnPrint = !!pipeDrapePrintToggle.checked;
      refreshInventoryPanelUI();
      setDirty(true);
    });
    if (fenceRunsPrintToggle) fenceRunsPrintToggle.addEventListener('change', () => { fenceRunsShowOnPrint = !!fenceRunsPrintToggle.checked; refreshInventoryPanelUI(); setDirty(true); });
    if (lightRunsPrintToggle) lightRunsPrintToggle.addEventListener('change', () => { lightRunsShowOnPrint = !!lightRunsPrintToggle.checked; refreshInventoryPanelUI(); setDirty(true); });
    if (flooringPrintToggle) flooringPrintToggle.addEventListener('change', () => { flooringShowOnPrint = !!flooringPrintToggle.checked; refreshInventoryPanelUI(); setDirty(true); });
    if (seatingPrintToggle) seatingPrintToggle.addEventListener('change', () => { seatingShowOnPrint = !!seatingPrintToggle.checked; refreshInventoryPanelUI(); setDirty(true); });
    if (inventoryLimitsToggle) inventoryLimitsToggle.addEventListener('change', () => {
      inventoryLimitsEnabled = !!inventoryLimitsToggle.checked;
      refreshInventoryPanelUI();
      setDirty(true);
    });
    if (inventoryKeyFilter) inventoryKeyFilter.addEventListener('input', refreshInventoryPanelUI);
    if (inventoryTotalsClearBtn) inventoryTotalsClearBtn.addEventListener('click', () => {
      inventoryManualTotals = {};
      refreshInventoryPanelUI();
      setDirty(true);
    });
    if (inventoryKeyList) inventoryKeyList.addEventListener('change', (e) => {
      const input = e.target.closest('[data-total-input]');
      if (!input) return;
      updateInventoryTotal(input.getAttribute('data-total-input') || '', input.value);
    });
    if (layersCloseBtn) layersCloseBtn.addEventListener('click', toggleLayersPanel);
    if (addReferenceImageBtn) addReferenceImageBtn.addEventListener('click', () => {
      if (referenceImageInput) { referenceImageInput.value = ''; referenceImageInput.click(); }
    });
    if (referenceImageInput) referenceImageInput.addEventListener('change', async (event) => {
      const file = event.target.files && event.target.files[0]; if (!file) return;
      try {
        await openReferenceSetup(await referenceFileDataUrl(file), { context: 'main' });
      } catch (error) { console.error(error); window.alert(error.message || 'The reference image could not be added.'); }
      event.target.value = '';
    });
    if (addItemLayerBtn) addItemLayerBtn.addEventListener('click', () => createLayer('item'));
    if (addVenueLayerBtn) addVenueLayerBtn.addEventListener('click', () => createLayer('venue'));
    if (layersList) layersList.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      const row = e.target.closest('[data-layer-id]');
      if (!row) return;
      const layerId = row.getAttribute('data-layer-id');
      if (!layerId) return;
      const action = target ? target.getAttribute('data-action') : 'activate';
      if (action === 'reference-opacity') return;
      if (action === 'toggle-visible') toggleLayerVisibility(layerId);
      else if (action === 'toggle-lock') toggleLayerLock(layerId);
      else if (action === 'delete-layer') deleteLayer(layerId);
      else setActiveLayer(layerId);
    });
    if (layersList) layersList.addEventListener('input', (e) => {
      const target = e.target.closest('[data-action="reference-opacity"]');
      if (target) setReferenceImageOpacity(target.value);
    });

    if (gridToggle) gridToggle.addEventListener('change', (e) => { showGrid = e.target.checked; try { localStorage.setItem('showGrid', showGrid ? '1' : '0'); } catch { } drawGrid(); setDirty(true); });
    if (snapToggle) snapToggle.addEventListener('change', (e) => {
      snapToGrid = e.target.checked;
      if (!snapToGrid) clearSnapAnchor();
      try { localStorage.setItem('snapToGrid', snapToGrid ? '1' : '0'); } catch { }
      updateRotationSnap();
      updatePlacementPreview();
      updateSnapToolbarButton();
      setDirty(true);
    });
    if (snapToolbarBtn) snapToolbarBtn.addEventListener('click', () => {
      snapToGrid = !snapToGrid;
      if (snapToggle) snapToggle.checked = snapToGrid;
      if (!snapToGrid) clearSnapAnchor();
      try { localStorage.setItem('snapToGrid', snapToGrid ? '1' : '0'); } catch { }
      updateRotationSnap();
      updatePlacementPreview();
      updateSnapToolbarButton();
      setDirty(true);
    });

    if (darkModeToggle) darkModeToggle.addEventListener('change', () => { toggleDarkMode(); setDirty(true); });
    if (itemHeightsToggle) itemHeightsToggle.addEventListener('change', (event) => {
      showItemHeights = !!event.target.checked;
      try { localStorage.setItem('showItemHeights', showItemHeights ? '1' : '0'); } catch { }
      refreshLabelVisibility();
    });
    if (uiScaleInput) uiScaleInput.addEventListener('input', (event) => {
      applyUiScale(Number(event.target.value) / 100);
    });
    if (settingsMenuItem) settingsMenuItem.addEventListener('click', toggleSettings);
    if (settingsCloseBtn) settingsCloseBtn.addEventListener('click', toggleSettings);

    if (gridSizeInput) gridSizeInput.addEventListener('change', () => {
      // gridSize is in feet; one unit == feet. Convert and redraw.
      const v = parseFloat(gridSizeInput.value);
      gridSize = isNaN(v) ? 1 : Math.max(0.1, v);
      try { localStorage.setItem('gridSize', String(gridSize)); } catch { }
      drawGrid();
      setDirty(true);
    });
    if (snapDistanceInput) snapDistanceInput.addEventListener('input', () => {
      const v = parseFloat(snapDistanceInput.value);
      snapDistanceFt = isNaN(v) ? 1 : Math.min(15, Math.max(0.5, v));
      try { localStorage.setItem('snapDistanceFt', String(snapDistanceFt)); } catch { }
      renderSnapDistanceValue();
      updatePlacementPreview();
      setDirty(true);
    });
    if (chairRowsPlaceBtn) chairRowsPlaceBtn.addEventListener('click', armChairRowsPlacement);
    if (chairRowsModeEl) chairRowsModeEl.addEventListener('change', syncChairRowsMode);
    if (chairRowsTotalEl) chairRowsTotalEl.addEventListener('input', () => { chairRowsTotalLastChanged = 'rows'; syncChairRowsMode(); });
    if (chairRowsCountRowsEl) chairRowsCountRowsEl.addEventListener('input', () => { chairRowsTotalLastChanged = 'rows'; syncChairRowsMode(); });
    if (chairRowsCountColsEl) chairRowsCountColsEl.addEventListener('input', () => { chairRowsTotalLastChanged = 'cols'; syncChairRowsMode(); });
    if (chairRowsAddAisleBtn) chairRowsAddAisleBtn.addEventListener('click', armChairRowsAislePlacement);
    if (chairRowsAisleDistanceEl) chairRowsAisleDistanceEl.addEventListener('change', updateEditedChairRowsAisle);
    if (chairRowsAisleDirectionEl) chairRowsAisleDirectionEl.addEventListener('change', updatePlacementPreview);
    syncChairRowsMode();
    if (tableSeatingPlaceBtn) tableSeatingPlaceBtn.addEventListener('click', armTableSeatingPlacement);
    if (tableSeatingTableTypeEl) tableSeatingTableTypeEl.addEventListener('change', () => {
      // Round-table chair sets read best as an even distribution around the
      // table. Make that the default whenever a round table is selected; the
      // user can still choose Side by side afterwards for a specific set.
      const selectedTable = getTableDefinitionFromConfig({ tableKey: tableSeatingTableTypeEl.value });
      if (getTableSeatingRule(selectedTable).layout === 'round') currentTableChairPattern = 'across';
      updateTableSeatingCapacity();
    });
    if (tableSeatingChairTypeEl) tableSeatingChairTypeEl.addEventListener('change', updateTableSeatingCapacity);
    if (tableSeatingChairCountEl) tableSeatingChairCountEl.addEventListener('input', updateTableSeatingCapacity);
    if (tableSeatingClearanceEl) tableSeatingClearanceEl.addEventListener('input', updateTableSeatingCapacity);
    if (cocktailHeightModeToggleEl) cocktailHeightModeToggleEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-value]');
      if (!btn || btn.disabled) return;
      currentCocktailHeightMode = btn.getAttribute('data-value') || 'H';
      setToggleGroupValue(cocktailHeightModeToggleEl, currentCocktailHeightMode);
      updateTableSeatingCapacity();
    });
    if (tableChairPatternToggleEl) tableChairPatternToggleEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-value]');
      if (!btn || btn.disabled) return;
      currentTableChairPattern = btn.getAttribute('data-value') || 'side_by_side';
      updateTableSeatingCapacity();
    });
    // venue line width removed; print frame removed

    if (newPlannerMenuItem) newPlannerMenuItem.addEventListener('click', createNewPlanner);
    if (openPlannerMenuItem) openPlannerMenuItem.addEventListener('click', openPlannerLibrary);
    if (savePlannerMenuItem) savePlannerMenuItem.addEventListener('click', () => savePlannerDocument(false));
    if (renamePlannerMenuItem) renamePlannerMenuItem.addEventListener('click', renamePlanner);
    if (importPlannerMenuItem && importInput) importPlannerMenuItem.addEventListener('click', () => importInput.click());
    if (exportPlannerMenuItem) exportPlannerMenuItem.addEventListener('click', exportLayout);
    if (plannerLibraryClose) plannerLibraryClose.addEventListener('click', hidePlannerLibrary);
    if (importInput) importInput.addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          if (!(await confirmDiscardIfDirty())) return;
          setActiveTool('select');
          const json = JSON.parse(ev.target.result);
          await loadLayout(json);
          const nextTitle = file.name.replace(/\.json$/i, '').trim() || 'Imported planner';
          resetCurrentDocument({ id: null, title: nextTitle, dirty: true });
          setQueryDocumentId(null);
        } catch {
          alert('Could not parse layout file.');
        }
      };
      reader.readAsText(file); e.target.value = '';
    });
    if (printPlannerMenuItem) printPlannerMenuItem.addEventListener('click', openPrintPreferences);
    if (printPreferencesPrint) printPreferencesPrint.addEventListener('click', handlePrint);
    if (printPreferencesPrintAll) printPreferencesPrintAll.addEventListener('click', () => handlePrint({ printAll: true }));
    if (printLayoutMapOnly) printLayoutMapOnly.addEventListener('change', () => { syncPrintPreferencesLayout(); renderPrintPreview(); });
    if (printLayoutMapKey) printLayoutMapKey.addEventListener('change', () => { syncPrintPreferencesLayout(); renderPrintPreview(); });
    if (printSetupLegend) printSetupLegend.addEventListener('change', renderPrintPreview);
    if (printSetupLegendPage) printSetupLegendPage.addEventListener('change', renderPrintPreview);
    if (printKeySamePage) printKeySamePage.addEventListener('change', renderPrintPreview);
    if (printOrientationLandscape) printOrientationLandscape.addEventListener('change', () => { syncPrintPreferencesLayout(); renderPrintPreview(); });
    if (printOrientationPortrait) printOrientationPortrait.addEventListener('change', () => { syncPrintPreferencesLayout(); renderPrintPreview(); });
    if (printPreferencesSubLabel) printPreferencesSubLabel.addEventListener('input', renderPrintPreview);
    if (printPreferencesNotes) printPreferencesNotes.addEventListener('input', renderPrintPreview);
    if (printPreviewRefresh) printPreviewRefresh.addEventListener('click', renderPrintPreview);
    if (printSectionOptions) printSectionOptions.addEventListener('change', (event) => {
      const input = event.target.closest('[data-print-section]');
      if (!input) return;
      const section = printSectionDefinitions.find((entry) => entry.key === input.dataset.printSection);
      if (!section) return;
      section.set(!!input.checked);
      refreshInventoryPanelUI();
      setDirty(true);
      renderPrintPreview();
    });
    [printPreferencesClose, printPreferencesCancel].forEach((button) => { if (button) button.addEventListener('click', closePrintPreferences); });
    if (printPreferencesModal) printPreferencesModal.addEventListener('mousedown', (event) => { if (event.target === printPreferencesModal) closePrintPreferences(); });

    if (zoomInBtn) zoomInBtn.addEventListener('click', () => navZoom(1.1));
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => navZoom(0.9));
    if (panUpBtn) panUpBtn.addEventListener('click', () => navPan(0, -40));
    if (panDownBtn) panDownBtn.addEventListener('click', () => navPan(0, 40));
    if (panLeftBtn) panLeftBtn.addEventListener('click', () => navPan(-40, 0));
    if (panRightBtn) panRightBtn.addEventListener('click', () => navPan(40, 0));
    if (rotateLeftBtn) rotateLeftBtn.addEventListener('click', () => navRotate(-90));
    if (rotateRightBtn) rotateRightBtn.addEventListener('click', () => navRotate(90));
    if (resetViewBtn) resetViewBtn.addEventListener('click', navReset);

    // Deselect on empty click (no marquee)
    stage.on('click tap', (e) => {
      if (activeTool !== 'select') return;
      const t = e.target;
      const clickedBg = t === stage || t.hasName('gridLine') || t.hasName('gridGroup') || (t.getParent && t.getParent().hasName && t.getParent().hasName('gridGroup'));
      if (clickedBg) clearSelection();
    });

    window.addEventListener('resize', () => {
      if (inventoryKeyPanel && inventoryKeyPanel.style.display !== 'none') positionInventoryKeyPanel();
    });

    window.addEventListener('beforeunload', (e) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  async function init() {
    if (!stageContainer) {
      showInitError('Floorplanner failed to initialize: missing stage container.');
      return;
    }
    if (!window.Konva) {
      showInitError('Floorplanner failed to initialize: Konva did not load.');
      return;
    }
    applyStoredTheme();
    customVenueTemplates = readCustomVenueTemplates();
    customInventoryItems = readCustomInventoryItems(); renderCustomInventoryItems();
    deletedLayoutGroupTemplateIds = readDeletedLayoutGroupTemplateIds();
    layoutGroupTemplates = readLayoutGroupTemplates();
    initPanelMinimizers();
    if (isPortraitLibraryDock()) {
      [inventoryPanel, venuesPanel].forEach((panel) => setPanelCollapsed(panel, true, { persist: false }));
    }
    initStage();
    bindUI();
    if (plannerIsSetupMode) {
      if (newPlannerMenuItem) newPlannerMenuItem.disabled = true;
      if (openPlannerMenuItem) openPlannerMenuItem.disabled = true;
      if (importPlannerMenuItem) importPlannerMenuItem.disabled = true;
      if (exportPlannerMenuItem) exportPlannerMenuItem.disabled = true;
    }
    await loadVenues();
    renderCustomVenueButtons();
    renderLayoutGroupButtons();
    setActiveTool('select');
    renderPlannerMeta();

    const params = new URLSearchParams(window.location.search);
    const requestedDocumentId = plannerBootDocumentId || parseInt(params.get('id'), 10);
    if (Number.isFinite(requestedDocumentId)) {
      await loadPlannerDocument(requestedDocumentId);
    } else {
      await loadLayout(getBlankLayout());
      resetCurrentDocument({ id: null, title: plannerBoot.document_title || 'Untitled planner', dirty: false });
    }
  }

  async function safeInit() {
    try {
      await init();
    } catch (err) {
      showInitError(`Floorplanner failed to initialize: ${err && err.message ? err.message : 'Unknown error'}`);
    }
  }

  window.addEventListener('error', (event) => {
    if (!event || !event.message) return;
    showInitError(`Floorplanner runtime error: ${event.message}`);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { safeInit(); }); else safeInit();
}
