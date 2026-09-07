/** DOM renderers for user-created inventory, venue, and layout templates. */

function customItemFootprint(item, cloneConfig) {
  const sourceComponents = Array.isArray(item.components)
    ? item.components
    : [{ kind: 'polygon', points: Array.isArray(item.points) ? item.points : [] }];
  return {
    shape: 'custom_compound',
    components: cloneConfig(sourceComponents) || [],
  };
}

function customItemDimensions(footprint) {
  const points = (footprint.components || []).flatMap((component) => (
    Array.isArray(component.points) ? component.points : []
  )).filter((point) => point && typeof point === 'object');
  if (!points.length) return { widthFt: 1, lengthFt: 1 };
  const xValues = points.map((point) => Number(point.x) || 0);
  const yValues = points.map((point) => Number(point.y) || 0);
  return {
    widthFt: Math.max(.1, Math.max(...yValues) - Math.min(...yValues)),
    lengthFt: Math.max(.1, Math.max(...xValues) - Math.min(...xValues)),
  };
}

// Custom items have one placement contract. The preview reads the top-level
// footprint while final placement reads rawData, so both receive the same
// cloned geometry and dimensions derived from that geometry.
export function customItemPlacementPayload(item, cloneConfig) {
  const footprint = customItemFootprint(item, cloneConfig);
  const { widthFt, lengthFt } = customItemDimensions(footprint);
  const rawData = {
    type: 'item',
    inventoryName: item.name || 'Custom item',
    category: item.hanging ? 'hanging_custom' : 'custom',
    width: widthFt,
    length: lengthFt,
    footprint: cloneConfig(footprint),
    color: item.color || '#d6d2c4',
  };
  return {
    kind: 'item',
    label: item.name || 'Custom item',
    widthFt,
    lengthFt,
    footprint: cloneConfig(footprint),
    rawData,
  };
}

export function renderCustomInventoryItems(ctx) {
  const { customInventoryList, getItems, setItems, writeItems, confirmDelete, armPlacementTool, openVenueBuilder, customItemHeight, customItemHanging, setInventoryBuilderMode, cloneConfig } = ctx;
  if (!customInventoryList) return;
  const items = getItems();
  customInventoryList.innerHTML = items.length ? '' : '<div class="small text-muted">No custom items yet.</div>';
  items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'd-flex gap-1 mb-1';
    const button = document.createElement('button');
    button.className = 'btn btn-outline-secondary btn-sm flex-grow-1 text-start';
    button.textContent = item.name;
    button.addEventListener('click', () => armPlacementTool(customItemPlacementPayload(item, cloneConfig), button));
    const edit = document.createElement('button');
    edit.className = 'btn btn-outline-secondary btn-sm';
    edit.title = 'Edit item';
    edit.innerHTML = '<i class="fa-solid fa-pen"></i>';
    edit.addEventListener('click', () => {
      setInventoryBuilderMode(true);
      openVenueBuilder(item);
      if (customItemHeight) customItemHeight.value = item.height || 1;
      if (customItemHanging) customItemHanging.checked = !!item.hanging;
    });
    const remove = document.createElement('button');
    remove.className = 'btn btn-outline-secondary btn-sm';
    remove.title = 'Delete item';
    remove.innerHTML = '<i class="fa-solid fa-trash"></i>';
    remove.addEventListener('click', () => {
      confirmDelete(`Delete custom item “${item.name}”?`, () => {
        setItems(getItems().filter((entry) => entry !== item && entry.id !== item.id));
        writeItems();
        renderCustomInventoryItems(ctx);
      });
    });
    row.append(button, edit, remove);
    customInventoryList.appendChild(row);
  });
}

export function renderCustomVenueButtons(ctx) {
  const { customVenuesList, getTemplates, setTemplates, writeTemplates, armPlacementTool, setAllVenueLayersLocked, openVenueBuilder, cloneConfig } = ctx;
  if (!customVenuesList) return;
  const templates = getTemplates();
  customVenuesList.innerHTML = '';
  if (!templates.length) {
    customVenuesList.innerHTML = '<div class="small text-muted">No local venues yet.</div>';
    return;
  }
  templates.forEach((template) => {
    const row = document.createElement('div');
    row.className = 'd-flex gap-1 mb-1';
    const button = document.createElement('button');
    button.className = 'btn btn-outline-secondary btn-sm custom-venue-button flex-grow-1';
    button.textContent = template.name || 'Custom venue';
    button.title = 'Place this venue.';
    button.addEventListener('click', () => {
      setAllVenueLayersLocked(false, { setDirtyState: false });
      armPlacementTool({ kind: 'venue', type: 'custom', widthFt: template.widthFt, heightFt: template.heightFt, polygon: cloneConfig(template.points), components: cloneConfig(template.components), doors: cloneConfig(template.doors), attachments: cloneConfig(template.attachments || template.doors), label: template.name, customTemplateId: template.id }, button);
    });
    const edit = document.createElement('button');
    edit.className = 'btn btn-outline-secondary btn-sm';
    edit.type = 'button';
    edit.title = 'Edit venue';
    edit.innerHTML = '<i class="fa-solid fa-pen"></i>';
    edit.addEventListener('click', () => openVenueBuilder(template));
    const remove = document.createElement('button');
    remove.className = 'btn btn-outline-secondary btn-sm';
    remove.type = 'button';
    remove.title = 'Delete venue';
    remove.innerHTML = '<i class="fa-solid fa-trash"></i>';
    remove.addEventListener('click', () => {
      if (!window.confirm(`Delete local venue template “${template.name}”?`)) return;
      setTemplates(getTemplates().filter((item) => item.id !== template.id));
      writeTemplates();
      renderCustomVenueButtons(ctx);
    });
    row.append(button, edit, remove);
    customVenuesList.appendChild(row);
  });
}

export function renderLayoutGroupButtons(ctx) {
  const { layoutGroupsList, getTemplates, setTemplates, writeTemplates, removeTemplate, requestName, confirmDelete, armPlacementTool, cloneConfig, pixelsPerFoot } = ctx;
  if (!layoutGroupsList) return;
  const templates = getTemplates();
  layoutGroupsList.innerHTML = '';
  if (!templates.length) {
    layoutGroupsList.innerHTML = '<div class="small text-muted">Select items, then use the bookmark button to save a reusable group.</div>';
    return;
  }
  templates.forEach((template) => {
    const row = document.createElement('div');
    row.className = 'layout-group-row';
    const place = document.createElement('button');
    place.type = 'button';
    place.className = 'btn btn-outline-secondary btn-sm layout-group-place';
    place.textContent = template.name;
    place.title = `Place layout group: ${template.name}`;
    place.addEventListener('click', () => {
      if (template.config.kind === 'tentSetup') {
        armPlacementTool({ kind: 'tentSetup', tentSetupName: template.name, tentSetupConfig: cloneConfig(template.config), widthFt: Number(template.config.tent.width) || 10, lengthFt: Number(template.config.tent.height) || 10 }, place);
        return;
      }
      const bounds = template.config.bounds || {};
      armPlacementTool({ kind: 'layoutGroup', layoutGroupName: template.name, layoutGroupConfig: cloneConfig(template.config), widthFt: (Number(bounds.width) || 72) / pixelsPerFoot, lengthFt: (Number(bounds.height) || 72) / pixelsPerFoot }, place);
    });
    const rename = document.createElement('button');
    rename.type = 'button';
    rename.className = 'btn btn-outline-secondary btn-sm';
    rename.title = 'Rename layout group';
    rename.innerHTML = '<i class="fa-solid fa-pen"></i>';
    rename.addEventListener('click', () => requestName('Rename layout group', template.name, (name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      template.name = trimmed;
      writeTemplates();
      renderLayoutGroupButtons(ctx);
    }));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn-outline-secondary btn-sm';
    remove.title = 'Delete layout group';
    remove.innerHTML = '<i class="fa-solid fa-trash"></i>';
    remove.addEventListener('click', () => {
      confirmDelete(`Delete layout group “${template.name}”?`, () => {
        if (removeTemplate) { removeTemplate(template); return; }
        setTemplates(getTemplates().filter((item) => item !== template && item.id !== template.id));
        writeTemplates();
        renderLayoutGroupButtons(ctx);
      });
    });
    row.append(place, rename, remove);
    layoutGroupsList.appendChild(row);
  });
}
