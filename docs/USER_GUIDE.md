# Open Event CAD user guide

This guide covers the public engine build. It uses a bundled starter catalog and stores working plans and custom libraries in the current browser.

The public starter set includes 20 tent presets, 15 indoor rooms, four flooring/stage definitions, and a limited inventory catalog. It does not show the automatic GPS/aerial-map workflow; use manual reference images from **Layers**.

## Toolbar

- **File menu**: create, open, save, rename, import, export, print, and open settings.
- **Select / Move**: select objects and move, rotate, resize, copy, paste, edit, or delete them.
- **Pan View**: move the canvas without moving plan objects.
- **Undo / Redo**: reverse or restore recent changes.
- **Copy / Paste / Delete**: duplicate or remove selected objects.
- **Save Group / Ungroup**: save selected objects as a reusable layout group or separate a group.
- **Add Label**: place a free canvas label or an item-attached label.
- **Venue Editing**: enable venue editing controls for rooms and custom venue geometry.
- **Show / Hide Labels**: toggle visible labels.
- **Inventory Key**: review counts, setup summaries, and print selections.
- **Layers**: control reference images, item layers, venue layers, visibility, order, and locks.
- **Snap**: toggle placement snapping. Grid size and snap distance are controlled in Settings.
- **Canvas controls**: zoom, pan, rotate, and reset the view without changing object geometry.

## Start a plan

1. Open **File → New planner** or open a saved planner from the planner library.
2. Set the grid and snap distance in **Settings**.
3. Place venues first, then flooring, seating, inventory, and decor.
4. Use the Inventory Key and Print Planner when the plan is ready.

Plans save in the current browser. Use **Export JSON** to move or back up a plan.

## Save, export, and import

- **Save planner** stores the current plan in this browser's local planner library.
- **Open planner** opens a saved local plan.
- **Rename planner** changes the name of the current local plan.
- The pencil beside a saved planner in **Open planner** renames it without opening or overwriting its saved layout.
- Click a saved planner's name to open and edit its layout, then use **Save planner** to save changes. The trash button removes that saved planner from this browser after confirmation. Deletion cannot be undone; if it is currently open, its canvas stays available as an unsaved planner that you can save again.
- **Export JSON** downloads the current plan as a portable JSON file. Use this for backups and transfers between browsers or installations.
- **Import JSON** loads a previously exported plan. Export the current plan first if you need to preserve it.
- **My Inventory → Export** saves custom inventory and custom venues as JSON.
- **My Inventory → Import** restores a custom library from JSON.

Exported JSON files may contain the plan, labels, custom geometry, reference-image data, and custom catalog entries. Treat exports as user-owned project files.

## Canvas tools

- **Select / Move**: select, move, rotate, resize, copy, paste, delete, and edit placed items.
- **Pan**: move the view without moving plan objects.
- **Ruler**: select the ruler icon and drag across the canvas to measure a distance; press Escape or select another tool to clear it.
- **Snap**: turn placement snapping on or off. Grid size and snap distance are separate settings.
- **Undo / Redo**: reverse or restore recent changes.
- **Layers**: add, reorder, hide, lock, or adjust item and venue layers.
- **Labels**: add free labels or labels attached to an item.

Double-click a placed label, or select it and use its gear, to edit the text. Attached labels can use the rotation handle too; their chosen angle follows the parent and survives saving.

For touch placement, move the preview first and confirm it at the preview location. Attached add-ons stay constrained to their parent venue or stage.

## Inventory and custom items

The **Inventory** panel contains standard tables, chairs, decor, Pipe & Drape, lights, fencing, flooring, and grouped seating. Select an item, then place it on the canvas.

**My Inventory** stores custom items in this browser. Use **Build Custom Item** to draw a footprint, save it, and place it like a normal inventory item. Export or import this library from the same section.

## Grouped seating

### Chair Rows

1. Open **Grouped Seating → Chair Rows**.
2. Choose the chair type, rows, chairs per row, spacing, and facing direction.
3. Select **Place Rows**, then place the preview.
4. Use **+ Aisle** to add an aisle to the selected chair-row group.

Double-click the group or use its edit control to rename it and edit the aisle labels and settings. The Inventory Key and prints show the chair type, rows, chairs per row, aisle details, and group total.

### Table Seating

1. Open **Grouped Seating → Table Seating**.
2. Choose the table, chair type, chair count, clearance, and pattern.
3. Select **Place Table Set**, then place it.

Edit a placed table-seating group to change its name, layout, and chairs per table.

The same editor supports half-round tables and their attached chair layout. Similar table-seating groups are combined into one Inventory Key entry while they remain independently editable on the canvas.

## Tents and tent add-ons

1. Open **Venues → Tents** and place a tent.
2. Open **Venues → Tent Add-ons** and choose an add-on.
3. Move the preview over the tent and place it.

Tent add-ons use the tent as their placement boundary. Sidewalls follow tent edges; leg-based items attach to legs; signs follow the perimeter; chandeliers stay inside the tent. Move an existing add-on to edit its attachment without moving it freely across the canvas.

Double-click a tent add-on to change its available variant or position, or use **Remove** in its editor. Custom bistro strings retain their double-click continuation workflow; select a string and use Delete to remove it.

Use the bookmark tool with one tent selected to save its tent and attached add-ons as a reusable setup.

## Flooring and stage add-ons

Place flooring from **Inventory → Flooring**. Subfloor always renders beneath venues, other flooring, and placed items. Stages can be edited for name, width, length, and height.

After placing a stage, choose Basic Step, Adjustable Stairs, or railings from the stage controls. These add-ons attach to a valid stage edge and remain bounded to that edge when moved.

## Runs and reference images

- **Pipe & Drape**, fencing, and standalone light runs are drawn as connected runs. Follow the controls shown by the selected tool to add points, finish, or resume a run.
- Use **4 ft Fence Run** or **8 ft Fence Run** for fencing, including single panels. The pencil in the Inventory Key renames a run for saved plans and printed details.
- **Reference Image** is added from **Layers**. In the reference setup window, use the degree rotation control to align the image to the grid, set its scale manually when needed, and adjust opacity before applying it. Keep it locked behind the plan after positioning it.

## Inventory Key and printing

Open the **Inventory Key** to review counts and setup details. Turn on **Print Info** for the sections to include.

Open **Print planner** from the file menu. Choose:

- **Setup Map** for the map and selected total-count information.
- **Event Plan Info** for the map plus selected setup details.

Choose landscape or portrait, add an optional sub-label and notes, check the preview, then use **Print / Save PDF**.

Ctrl+P (Command+P on macOS) opens the same print settings. Reports that exceed the available space continue on additional sheets; the preview shows the same measured pages used for printing.

## Quick recovery

- If a tool is active when it should not be, return to **Select / Move**.
- If placement is not aligning, check **Snap** and **Settings → Snap distance**.
- If an item cannot be selected, check its layer is visible and unlocked.
- Export JSON before making major changes or moving to another browser.
