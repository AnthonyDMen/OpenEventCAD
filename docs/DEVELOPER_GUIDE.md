# Open Event CAD developer guide

## Project map

| Area | Purpose |
| --- | --- |
| `app/routes.py` | Flask page and catalog/API routes. |
| `app/models.py` | Shared catalog database models. |
| `app/templates/planner.html` | Planner UI and print markup. |
| `app/static/css/styles.css` | Active planner styles and print styles. |
| `app/static/js/floorplanner.js` | Browser entrypoint. |
| `app/static/js/planner/domain/` | Pure geometry, formatting, persistence, and data helpers. |
| `app/static/js/planner/features/` | Focused rendering, placement, and tool behavior. |
| `app/static/js/planner/legacy/engine.js` | Active coordinator for the existing planner behavior. |
| `app/static/data/` | Bundled inventory, flooring, and venue definitions. |
| `tests/` | Python API/UI-source tests and Node domain tests. |

## Data and persistence

- The shared catalog is application/database data.
- Planner layouts, custom inventory, custom venues, and layout groups are browser-local by default.
- JSON export/import transfers local planner data.
- Do not change saved-layout fields casually. Preserve old values on load or provide a migration.

## Change rules

1. Find the existing behavior before adding code. Reuse the matching placement, rendering, save/load, and print path.
2. Keep geometry and data transforms in `domain/` when they do not need DOM, Konva, or browser state.
3. Put focused UI or placement work in the relevant `features/` module when one exists.
4. `legacy/engine.js` is active production code. Do not delete or bypass it during cleanup.
5. A preview and its final placement must use the same coordinate and attachment calculation.
6. Keep print preview based on the same print layout used by the browser print action.
7. Bump the linked cache version in the template, `floorplanner.js`, `planner/main.js`, and `legacy/runtime.js` when changing browser modules.

## Placement boundaries

- Stage add-ons attach to a valid stage edge.
- Tent add-ons attach to tent edges, legs, perimeter, or interior according to their add-on type.
- Attached objects must not become free canvas items while edited.
- Grouped seating and its aisles are saved as group configuration, not independent generic items.

## Verification

Run before committing planner changes:

```bash
node --check app/static/js/floorplanner.js
npm run test:unit
python -m pytest -q
git diff --check
```

For UI changes, also manually verify the affected placement, edit, save/reload, copy/paste, Inventory Key, print preview, and browser print result.

The print browser regression requires Playwright with Chromium and Poppler's `pdfinfo` and `pdftotext` on PATH. With a local engine server running:

```bash
ENGINE_TEST_URL=http://127.0.0.1:8000 node tests/planner/print.browser.mjs
```

Set `PLAYWRIGHT_MODULE` to an installed Playwright module path and `CHROMIUM_EXECUTABLE` to a browser path when using externally managed dependencies. The test uses an isolated browser profile, checks both paper orientations with 80 fence runs and long notes, and writes preview screenshots and actual PDFs to a temporary directory. It verifies page counts, all report rows, orientation switching, and editor restoration after printing; it does not test a physical printer driver.

## Local run

```bash
POSTGRES_PASSWORD='choose-a-local-password' podman-compose up --build -d
```

Open `http://localhost:8000/`. Rebuild the container after application, template, CSS, JavaScript, or bundled-data changes.

## Cleanup rules

- Delete only files with verified zero references and no runtime role.
- Keep all tests in `tests/`.
- Runtime and cache directories remain ignored; do not commit generated files.
- Do not create empty folders as placeholders.
