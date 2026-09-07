from pathlib import Path


def planner_source():
    return Path("app/static/js/planner/legacy/engine.js").read_text()


def test_inventory_key_sections_scroll_internally():
    source = Path("app/static/css/styles.css").read_text()
    body = source[source.index(".inventory-key-details-body"):source.index(".inventory-key-section-title")]
    assert "max-height: 240px" in body
    assert "overflow-y: auto" in body
    assert "#inventoryKeyTotalCountSection .inventory-key-details-body" in source
    assert "#inventoryFullSection .inventory-key-details-body" in source


def test_inventory_placement_sections_follow_the_requested_workflow_order():
    source = planner_source()
    assert "if (chairs && groupedSeating) chairs.after(groupedSeating);" in source
    assert "if (pipeDrape && flooring) pipeDrape.after(flooring);" in source
    assert "if (flooring && customInventory) flooring.after(customInventory);" in source
    assert "if (flooring && layoutGroups) flooring.after(layoutGroups);" in source


def test_tables_have_collapsed_placement_subcategories_and_picnic_table():
    source = planner_source()
    catalog = Path("app/static/data/inventory/catalog.json").read_text()
    assert "{ title: 'High Tops'" in source
    assert "{ title: 'Round Tables'" in source
    assert "{ title: 'Rectangle Tables'" in source
    assert "{ title: 'Other Tables'" in source
    assert "category.open = false;" in source
    assert '"id": "picnic_table_6"' in catalog
    assert '"shape": "custom_compound"' in catalog


def test_inventory_tools_start_collapsed_with_compact_flooring_sections():
    html = Path("app/templates/planner.html").read_text()
    source = planner_source()
    catalog = Path("app/static/data/inventory/catalog.json").read_text()
    assert '<details class="grouped-seating-card">' in html
    assert "row = document.createElement('details');" in source
    assert "row.open = false;" in source
    assert "Custom Rectangular Subfloor" in source
    assert "if (customFlooringRow) container.appendChild(customFlooringRow);" in source
    assert "danceFloorGroup" not in source
    assert '"title": "Bars & Others"' in catalog
    assert "Click a base to start or continue" not in source


def test_subfloor_uses_its_own_bottom_layer_and_saved_plans_are_migrated_to_it():
    layers = Path("app/static/js/planner/domain/layers.js").read_text()
    dispatch = Path("app/static/js/planner/features/placement/dispatch.js").read_text()
    engine = planner_source()
    assert "{ id: 'subfloor-base', name: 'Subfloor', kind: 'subfloor'" in layers
    assert "const restoredBaseLayers = BASE_LAYERS.map" in layers
    assert "kind === 'subfloor' ? 'subfloor-base'" in layers
    assert "payload.kind === 'floor' && payload.category === 'subfloor' ? 'subfloor' : 'item'" in dispatch
    assert "const isSubfloor = (it.itemKind === 'floor' || it.floorCategory) && savedFloorCategory === 'subfloor';" in engine
    assert "const layerId = isSubfloor ? 'subfloor-base'" in engine


def test_custom_inventory_and_layout_groups_use_the_in_app_delete_confirmation():
    engine = planner_source()
    renderer = Path("app/static/js/planner/features/custom-library/render.js").read_text()
    assert "function requestDeleteConfirmation(message, onConfirm)" in engine
    assert "confirmDelete: requestDeleteConfirmation" in engine
    assert "confirmDelete(`Delete custom item" in renderer
    assert "confirmDelete(`Delete layout group" in renderer
    assert "window.confirm(`Delete local layout group" not in renderer


def test_copy_paste_keeps_regular_items_independent_and_copies_tent_contents():
    source = planner_source()
    assert "const nodeIdMap = new Map();" in source
    assert "sourceNodeId: id, config: buildTentSetupConfig" in source
    assert "tentPointIsInside(tent, tentLocalPoint(tent, getNodeCenter(node)))" in source
    assert "pasteId" not in source
    assert "src.getAttr('customType') === 'layoutGroup'" in source


def test_grid_and_snapping_share_the_same_world_origin_without_changing_grid_size():
    source = planner_source()
    grid_step = source[source.index("function gridStepPx() {"):source.index("function snapValue", source.index("function gridStepPx() {"))]
    draw_grid = source[source.index("function drawGrid() {"):source.index("function fitGridToReference", source.index("function drawGrid() {"))]
    assert "Math.round(snapDistanceFt * FEET_TO_PX)" in grid_step
    assert "const pxGrid = Math.max(1, Math.floor(gridSize * FEET_TO_PX));" in draw_grid
    assert "const startX = Math.floor(bounds.minX / pxGrid) * pxGrid;" in draw_grid
    assert "const startY = Math.floor(bounds.minY / pxGrid) * pxGrid;" in draw_grid


def test_snap_runtime_state_initializes_from_the_checked_control_and_resyncs_after_load():
    source = planner_source()
    assert "let snapToGrid = true;" in source
    assert source.count("syncSnapState();") >= 3


def test_multi_select_snaps_as_one_rigid_selection():
    source = planner_source()
    start = source.index("function snapSelectionToGrid(anchor = dragAnchorNode)")
    body = source[start:source.index("function handleCopy()", start)]
    assert "const dx = snapped.x - current.x;" in body
    assert "movedNodes.forEach" in body
    assert "selectedItems.forEach((node) => snapNodeToGrid(node))" not in body


def test_chair_rows_uses_compact_visual_aisle_controls():
    html = Path("app/templates/planner.html").read_text()
    js = planner_source()
    assert 'id="chairRowsAddAisleBtn"' in html
    assert 'id="chairRowsAisleDistance"' in html
    assert 'id="chairRowsAisleDirection"' in html
    assert 'chairRowsAisleSettings' not in html
    assert "function armChairRowsAislePlacement()" in js
    assert "function addChairRowsAisle(group, candidate)" in js
    assert "chairRowsAisleCandidate(group, point)" in js


def test_chair_rows_aisles_are_open_and_snap_to_selected_gap_direction():
    source = planner_source()
    seating_domain = Path("app/static/js/planner/domain/seating.js").read_text()
    assert "strokeWidth: 0" in source[source.index("(geometry.aisles || [])"):source.index("const hitRect", source.index("(geometry.aisles || [])"))]
    assert "chairRowsAisleDirectionEl.value === 'horizontal'" in source
    assert "chairRowsNearestAvailableGap(pointerFt" in source
    assert "function chairRowsWorldPointToLocal(group, point)" in source
    assert "chairRowsLocalPointToWorld(group, localTopLeft)" in source
    assert "const point = plannerWorldPointFromDomEvent(e.evt) || worldGroup.getRelativePointerPosition();" in source
    assert "addChairRowsAisle(group, candidate);" in source
    assert "updatePlacementPreview(point);" in source
    assert "chairRowsAisleDraft" not in source
    assert "chairRowsAisleGapIndex" in source
    assert "chairRowsGapCenterFt" in source
    assert "chairRowsAisleVisualBounds" in source
    assert "export function chairRowsAisleGapIndex(aisle, gapCount)" in seating_domain
    assert "export function chairRowsAislePhysicalCenterFt(aisle, aisles, axis)" in seating_domain
    assert "export function chairRowsGapCenterFt(gapIndex, footprintFt, spacingFt)" in seating_domain
    assert "export function chairRowsAisleVisualBounds(geometry, aisle)" in seating_domain
    assert "export function chairRowsNearestAvailableGap(pointerFt, axis, aisles, direction)" in seating_domain
    assert "const previewGeometry = buildChairRowsGeometry(previewConfig);" in source
    assert "const bounds = chairRowsAisleVisualBounds(previewGeometry, previewAisle);" in source


def test_repeated_chair_row_aisles_use_one_click_and_current_event_pointer():
    source = planner_source()
    preview = source[source.index("if (placementPayload && placementPayload.kind === 'chairRowsAisle')", source.index("function updatePlacementPreview")):source.index("if (placementPayload && placementPayload.kind === 'roomAttachment')", source.index("function updatePlacementPreview"))]
    assert "const pointer = pointerOverride ||" in preview
    assert "chairRowsAisleCandidate(group, pointer)" in preview
    move_start = source.index("stage.on('mousemove touchmove'", source.index("const routeGroupDoubleActivation"))
    move = source[move_start:source.index("stage.on('mouseup touchend'", move_start)]
    assert "plannerWorldPointFromDomEvent(e.evt) || worldGroup.getRelativePointerPosition()" in move
    assert "updatePlacementPreview(point);" in move
    click = source[source.index("if (activeTool === 'place' && placementPayload && placementPayload.kind === 'chairRowsAisle')"):source.index("const t = e.target", source.index("if (activeTool === 'place' && placementPayload && placementPayload.kind === 'chairRowsAisle')"))]
    assert "addChairRowsAisle(group, candidate);" in click
    assert "chairRowsAisleDraft" not in click
    arm = source[source.index("function armChairRowsAislePlacement()"):source.index("function editChairRowsAisleNode")]
    assert "clearSelection();" in arm
    assert "selectedItems = []; transformer.nodes([]);" in arm
    assert "selectedItems = [rebuilt]" not in arm


def test_chair_rows_double_click_has_inline_edit_popup():
    source = planner_source()
    assert "function showChairRowsEditPopup(node, config)" in source
    assert "function showChairRowsAisleEditPopup(node, aisle)" in source
    assert "chairRowsEditPopup" in source
    popup = source[source.index("function showChairRowsAisleEditPopup(node, aisle)"):source.index("function deleteEditedChairRowsAisle")]
    assert "data-chair-aisle-width" in popup
    assert "updateEditedChairRowsAisle({ widthFt: event.target.value })" in popup


def test_table_seating_filters_chairs_by_cocktail_height_and_removes_directors_chair():
    source = planner_source()
    assert "function refreshTableSeatingChairOptions(tableDef)" in source
    assert "currentCocktailHeightMode === 'H'" in source
    assert "function isDirectorsChair(entry)" in source
    assert "!isDirectorsChair(entry)" in source


def test_square_cocktail_uses_four_sided_card_layout():
    source = planner_source()
    assert "'36\" Square Cocktail Table': { displayedMax: 4, layout: 'card' }" in source


def test_table_seating_filters_kids_chairs_to_kids_tables():
    source = planner_source()
    assert "function isKidsChair(entry)" in source
    assert "const kidsTable = !!(tableDef && tableDef.category === 'kids')" in source
    assert "if (kidsTable) return isKidsChair(entry)" in source


def test_total_chair_rows_allow_remainder_row():
    js = planner_source()
    assert "Math.ceil(total / cols)" in js
    assert "Math.ceil(total / rows)" in js
    assert "if (children.length >= targetChairCount) break;" in js
    assert "readOnly = false" in js


def test_stage_height_selector_is_initialized_before_use():
    source = planner_source()
    stage_block = source[source.index("if (def.category === 'stage') {"):source.index("const controlRow", source.index("if (def.category === 'stage') {"))]
    assert "heightSel = document.createElement('select')" in stage_block
    assert stage_block.index("heightSel = document.createElement('select')") < stage_block.index("heightSel.title = 'Stage height'")


def test_item_builder_never_finalizes_an_undefined_shape():
    source = planner_source()
    finalizer = source[source.rindex("if (!shape)", 0, source.index("const itemAttrs = {")):source.index("function createReferenceImage")]
    assert "if (!shape)" in finalizer
    assert "shape = new Konva.Rect" in finalizer


def test_stage_addon_placement_enables_stage_floor_hit_targets():
    source = planner_source()
    assert "const stageAddonPlacement = activeTool === 'place' && placementPayload && placementPayload.kind === 'stageAddon';" in source
    assert "stageAddonPlacement && layer.kind === 'item'" in source
    assert "stageAddonPlacement && !layer.locked" in source


def test_stage_addon_stage_click_does_not_use_unbound_shape():
    source = planner_source()
    block = source[source.index("placementPayload.kind === 'stageAddon'", source.index("stage.on('mousedown")):source.index("const t = e.target", source.index("stage.on('mousedown"))]
    assert "shape.getAttr" not in block
    assert "placeStageAddonOnStage(match.node" in block


def test_stage_detail_rows_combine_repeated_addons_for_one_stage():
    source = planner_source()
    block = source[source.index("function flooringInventoryRows()"):source.index("const stageAddonContext")]
    assert "const existing = target.rows.find" in block
    assert "if (existing) existing.amount += 1" in block


def test_tent_info_keeps_grouped_seating_as_a_named_group():
    source = planner_source()
    block = source[source.index("function tentInteriorItemRows(tents)"):source.index("function collectTentSetups")]
    assert "groupedSeatingTitle(node)" in block
    assert "add(groupedSeatingTitle(node), 1, 'group')" in block
    assert "add(node.getAttr('layoutGroupName') || 'Layout group', 1, 'group')" in block


def test_event_info_preview_never_uses_the_setup_map_overlay():
    source = Path("app/static/css/styles.css").read_text()
    assert '.print-preview[data-layout="key-pages"] .print-preview-key' not in source


def test_event_info_print_uses_one_compact_table_flow_and_repeating_count_header():
    css = Path("app/static/css/styles.css").read_text()
    markup = Path("app/static/js/planner/features/inventory/markup.js").read_text()
    assert "#printInventorySummary { grid-column: auto; break-inside: auto;" in css
    assert ".print-layout-key-pages .print-key-content," in css
    assert ".print-has-key-continuation .print-key-page-content," in css
    assert "display: flex; flex-wrap: wrap; align-content: flex-start; align-items: flex-start; gap: 3mm;" in css
    assert "flex: 0 0 48mm; max-width: 48mm;" in css
    assert ".print-preview-continuation-key { display: flex; flex-wrap: wrap;" in css
    assert ".print-preview { min-height: min(560px, calc(100vh - 290px)); max-height: calc(100vh - 250px); padding: 12px; overflow: auto;" in css
    assert ".print-layout-key-pages .print-workspace-key-table { border: .35mm solid #6f7a85;" in css
    assert "print-event-count-title" in markup
    assert 'thead><tr class="print-event-count-title"' in markup


def test_event_info_keeps_same_page_side_key_before_using_continuation_pages():
    source = planner_source()
    assert "if (samePage && printKeyNeedsSeparatePages())" not in source
    assert "layout: samePage ? (orientation === 'portrait' ? 'stacked-key' : 'side-key') : 'key-pages'" in source
    assert "function splitPrintKeyContinuation(layout, samePage)" in source
    assert "const availableHeight = firstPagePanel.clientHeight;" in source
    assert "section.offsetTop + section.offsetHeight > availableHeight" in source
    assert "function splitPrintKeyForLetterPage(layout, samePage)" in source


def test_portrait_print_split_keeps_the_first_three_tables_in_sequence():
    source = planner_source()
    css = Path("app/static/css/styles.css").read_text()
    assert "const continuation = layout === 'stacked-key'" in source
    assert "const canonicalSections = [" in source
    assert "printFlooringSummaryEl," in source
    assert "printSeatingSummaryEl," in source
    assert "printNotesSummaryEl," in source
    assert "const panelBounds = firstPagePanel.getBoundingClientRect();" in source
    assert "sectionBounds.bottom > panelBounds.bottom + 1 || sectionBounds.right > panelBounds.right + 1" in source
    assert "return firstOverflowIndex < 0 ? [] : orderedSections.slice(firstOverflowIndex);" in source
    assert ".print-layout-stacked-key .print-key-below .print-key-content { display: flex; flex-direction: column; flex-wrap: wrap;" in css
    assert ".print-layout-stacked-key .print-key-below .print-key-content > .print-inventory-summary { flex: 0 0 auto; width: 48mm; max-width: 48mm; }" in css
    assert "function fitPortraitPrintKeyPanel(layout)" not in source
    assert ".print-layout-stacked-key .print-map-content .print-sheet-body { flex: 1 1 50%;" in css
    assert ".print-layout-stacked-key.print-has-key-continuation.print-orientation-portrait .print-key-page-content { display: flex; flex-direction: column; flex-wrap: wrap;" in css
    assert ".print-layout-stacked-key.print-has-key-continuation.print-orientation-portrait .print-key-page-content > .print-inventory-summary { flex: 0 0 auto; width: 48mm; max-width: 48mm; }" in css
    assert "const hasContinuation = splitPrintKeyForLetterPage(layout, samePage);" in source
    assert "if (hasContinuation) printLayout.classList.add('print-has-key-continuation');" in source
    assert "printKeyPageContent.appendChild(section)" in source


def test_print_preview_clones_the_actual_paginated_print_layout():
    source = planner_source()
    html = Path("app/templates/planner.html").read_text()
    css = Path("app/static/css/styles.css").read_text()
    assert 'id="printPreview" class="print-preview mt-2" aria-live="polite"' in html
    assert "function preparePreviewPrintPages(layout, orientation, samePage, hasKey, setupLegendBottom = false, setupLegendPage = false)" in source
    assert "const pages = preparePreviewPrintPages(layout, orientation, samePage, hasKey, setupLegendBottom, setupLegendPage);" in source
    assert "const previewLayout = printLayout.cloneNode(true);" in source
    assert "printPreview.appendChild(pages.previewLayout);" in source
    assert "function splitPrintKeyForLetterPage(layout, samePage)" in source
    assert "applyPrintLayoutState(layout, orientation, hasPrintInfo || printAll, setupLegendBottom, setupLegendPage);" in source
    assert ".print-preview-layout.print-has-key-continuation .print-key-page-content" in css


def test_event_plan_print_supports_a_sub_label_and_end_notes_section():
    source = planner_source()
    html = Path("app/templates/planner.html").read_text()
    css = Path("app/static/css/styles.css").read_text()
    assert 'id="printPreferencesSubLabel"' in html
    assert 'id="printPreferencesNotes"' in html
    assert 'id="printNotesSummary"' in html
    assert "function renderPrintNotesSummary()" in source
    assert "renderPrintNotesSummary();" in source
    assert "printNoteEl.textContent = subLabel ? `- ${subLabel}` : '';" in source
    assert ".print-notes-summary { grid-column: 1 / -1; }" not in css
    assert ".print-preview-continuation-key > .print-notes-summary { flex-basis: 100%; max-width: none; }" not in css


def test_setup_map_print_uses_selected_print_sections():
    source = planner_source()
    markup = Path("app/static/js/planner/features/inventory/markup.js").read_text()
    assert "normalizedMode === 'total-count'" in markup
    assert '<th colspan="3">Total Count</th>' in markup
    assert "renderPrintInventorySummary(getPrintSetupLegendRows(), 'total-count');" in source
    assert "return setupMapSelected && orientation === 'portrait' && hasSelectedPrintInfo();" in source
    assert "if (printSectionPicker) printSectionPicker.style.display = '';" in source



def test_setup_map_supports_a_slim_legend_and_portrait_bottom_panel():
    source = planner_source()
    html = Path("app/templates/planner.html").read_text()
    css = Path("app/static/css/styles.css").read_text()
    assert 'id="printSetupLegendPage"' in html
    assert 'id="printSetupLegendPageContent"' in html
    assert "function shouldUseSetupLegendBottom(orientation)" in source
    assert "function renderSetupLegendPageContent()" in source
    assert ".print-layout-map-only.print-setup-legend-bottom .print-key-below" in css
    assert ".print-layout-map-only.print-has-setup-legend-page .print-key-sheet" in css


def test_event_info_keeps_tables_compact_and_sequential_in_every_orientation():
    css = Path("app/static/css/styles.css").read_text()
    assert ".print-layout-key-pages.print-orientation-landscape .print-key-content" not in css
    assert "display: flex; flex-wrap: wrap; align-content: flex-start; align-items: flex-start; gap: 3mm;" in css
    assert "flex: 0 0 48mm; max-width: 48mm;" in css


def test_stage_addon_preview_is_edge_constrained():
    source = planner_source()
    preview = source[source.index("if (placementPayload.kind === 'stageAddon')"):source.index("const snapped = snapPosition", source.index("if (placementPayload.kind === 'stageAddon')"))]
    assert "closestStageForAddonPlacement(pointer, widthFt)" in preview
    assert "placementPreview.hide()" in preview
    assert "placementPreview.position({ x: stageNode.x() + x, y: stageNode.y() + y })" in preview
    assert "(horizontal ? 0 : 90)" in preview


def test_stage_moves_and_rotates_attached_addons():
    source = planner_source()
    stage_addons = Path("app/static/js/planner/features/stage/addons.js").read_text()
    assert "function syncStageAddonsForStage(stage)" in source
    assert "syncStageAddonsForStage(shape)" in source
    assert "node.rotation((Number(stage.rotation && stage.rotation()) || 0) + (horizontal ? 0 : 90))" in stage_addons


def test_room_wall_attachment_tools_and_shared_payload_are_present():
    html = Path("app/templates/planner.html").read_text()
    js = planner_source()
    assert 'id="roomDoorTool"' in html
    assert 'id="roomOpeningTool"' in html
    assert 'id="roomAttachmentPopup"' in html
    assert "kind: 'roomAttachment'" in js
    assert "attachmentType: type" in js
    assert "attachmentsSpec" in js


def test_room_attachments_split_walls_and_preserve_local_geometry():
    source = planner_source()
    renderer = Path("app/static/js/planner/features/rooms/render.js").read_text()
    placement = Path("app/static/js/planner/features/rooms/placement.js").read_text()
    assert "function renderRoomWalls(room, components, outlineCfg)" in source
    assert "venueWallSegment" in renderer
    assert "componentId: best.component.id" in placement
    assert "wallIndex: best.wall.index" in placement
    assert "widthFt: Number(placementPayload && placementPayload.widthFt) || 3" in placement
    assert "placementPayload && placementPayload.swing === 'outward' ? 'outward' : 'inward'" in placement


def test_room_attachment_editing_clamps_and_persists_through_copy_load():
    source = planner_source()
    assert "function roomAttachmentClamp(attachment, wall, attachments = [])" in source
    assert "roomAttachmentWidth.addEventListener('change'" in source
    assert "roomAttachmentSwing.addEventListener('click'" in source


def test_selectable_composite_inventory_has_a_hit_surface():
    source = planner_source()
    assert "function ensureSelectableGroupHitArea(node)" in source
    assert "name: 'plannerShapeHitArea'" in source
    assert "ensureSelectableGroupHitArea(shape);" in source
    assert "placementPayload.kind === 'roomAttachment'" in source
    assert "placementPayload.swing = placementPayload.swing === 'outward' ? 'inward' : 'outward'" in source
    assert "roomAttachmentPlacementSwing" in source
    assert "roomAttachmentDelete.addEventListener('click'" in source
    assert "attachments: cloneConfig(src.getAttr('attachmentsSpec'))" in source
    assert "attachments: v.attachments" in source
