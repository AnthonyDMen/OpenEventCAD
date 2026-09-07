# Open Event CAD modding guide

Open Event CAD is designed to be a base for customized event-planning builds. Keep engine behavior separate from catalog data and presentation so a custom build can update the engine without replacing its inventory or branding.

## Add inventory

Starter inventory is bundled in `app/static/data/inventory/catalog.json`. Add an item to the appropriate section with a stable `id`, display `name`, geometry, category, color, and optional aliases. Reuse an existing item shape when possible.

The public sample catalog is intentionally limited to 55 records. Feature-specific tent add-ons, fencing/lights, and pipe-and-drape definitions remain available so the engine's placement and setup workflows can be exercised without the production catalog.

After changing the catalog:

1. Validate the JSON.
2. Check the item in the Inventory panel.
3. Place, move, rotate, resize, save, reload, export, and print it.
4. Add or update tests for any new behavior.

## Add venues and flooring

- Preset tents live in `app/static/data/venues/tents.json`.
- Preset indoor rooms live in `app/static/data/venues/indoor_rooms.json`.
- Flooring and stage definitions live in `app/static/data/flooring.json`.

The public venue sample contains 20 tent presets and all 15 bundled indoor-room presets.

Presets should describe geometry and display data only. More complex behavior belongs in the relevant domain or feature module.

## Create custom content in the planner

Users can create custom inventory and venues in the browser. Custom items can use drawn footprints, height, hanging behavior, and snapping. Custom venues can use rectangles, circles, arcs, lines, polygons, doors, openings, and manual reference images. The custom libraries can be exported and imported as JSON.

The optional USGS/geocoding backend remains available for downstream builds, but the public engine UI intentionally exposes manual reference-image workflows only.

## Customize branding

The active visual system is in `app/static/css/styles.css`, with the main markup in `app/templates/planner.html`. A downstream build can add a theme stylesheet, override CSS variables, change fonts, and replace the logo without changing geometry or placement logic.

Keep private branding and production-only catalog data in the downstream repository. Do not commit API keys, deploy keys, local environment files, customer data, or exported project files.

## Extend the engine safely

1. Put pure geometry and data transforms in `app/static/js/planner/domain/`.
2. Put focused UI and placement behavior in `app/static/js/planner/features/`.
3. Keep the stable browser entrypoint and existing runtime behavior compatible.
4. Preserve saved-layout fields or provide a migration when changing them.
5. Run the complete test and validation commands before publishing.

## Pull engine updates into a custom build

Keep the public engine as an upstream Git remote in a downstream repository. Review changes, merge them into a dedicated integration branch, and resolve conflicts in theme, catalog, and template files before updating production.
