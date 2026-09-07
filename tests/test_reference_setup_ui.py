from pathlib import Path


def test_reference_setup_rotates_the_working_image_before_framing_and_placement():
    html = Path("app/templates/planner.html").read_text()
    source = Path("app/static/js/planner/legacy/engine.js").read_text()

    assert 'id="referenceSetupRotation"' in html
    assert 'min="-180" max="180" step="1"' in html
    assert "function setReferenceSetupRotation(value)" in source
    assert "const rotation = Math.max(-180, Math.min(180, Number(value) || 0));" in source
    assert "context.translate(rotated.width / 2, rotated.height / 2); context.rotate(radians);" in source
    assert "referenceSetup.image = rotated;" in source
    assert "referenceSetup.crop = { x: 0, y: 0, width: rotated.width, height: rotated.height };" in source
    assert "source.toDataURL(referenceSetup.rotation ? 'image/png' : 'image/jpeg', .9)" in source
    assert "referenceSetupRotation.addEventListener('input', () => setReferenceSetupRotation(referenceSetupRotation.value))" in source


def test_builder_trace_references_stay_in_custom_templates_and_never_render_on_the_main_plan():
    engine = Path("app/static/js/planner/legacy/engine.js").read_text()
    renderer = Path("app/static/js/planner/features/custom-library/render.js").read_text()
    custom_venue_block = engine[engine.index("function createVenue(data)"):engine.index("function createItem(data)")]

    assert "validTemplate.reference.dataUrl) addVenueBuilderReference(validTemplate.reference.dataUrl, validTemplate.reference)" in engine
    assert "reference = { dataUrl: venueBuilder.reference.dataUrl" in engine
    assert "reference: cloneConfig(template.reference)" not in renderer
    assert "referenceSpec:" not in custom_venue_block
    assert "referenceUnderlay" not in custom_venue_block


def test_reference_setup_modal_stacks_above_the_custom_builder():
    css = Path("app/static/css/styles.css").read_text()
    assert ".reference-setup-modal { position: fixed; inset: 0; z-index: 2300;" in css
    assert "#venueBuilderPanel.venue-builder-modal" in css
    assert "z-index: 2000;" in css


def test_custom_item_builder_and_placement_share_one_compound_geometry_contract():
    engine = Path("app/static/js/planner/legacy/engine.js").read_text()
    renderer = Path("app/static/js/planner/features/custom-library/render.js").read_text()

    assert "export function customItemPlacementPayload(item, cloneConfig)" in renderer
    assert "footprint: cloneConfig(footprint)" in renderer
    assert "armPlacementTool(customItemPlacementPayload(item, cloneConfig), button)" in renderer
    assert "(inventoryBuilderMode ? 'Custom item' : 'Custom venue')" in engine
    assert "const preview = createItem({" in engine
    assert "preview.name('customItemPlacementPreview');" in engine
    assert "const minimumPointCount = closed ? 3 : 2;" in engine
    assert "component.kind !== 'line' && component.kind !== 'arc'" in engine
    assert "removedWalls.includes(edgeIndex)" in engine
    assert "widthFt = Math.max(.1, maxY - minY);" in engine
    assert "lengthFt = Math.max(.1, maxX - minX);" in engine
