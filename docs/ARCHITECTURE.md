# Open Event CAD architecture

Open Event CAD is a standalone, browser-based 2D event floorplanner.

## Data boundaries

- The Flask application and PostgreSQL database store the shared inventory and built-in venue catalog.
- Each visitor's floorplans and custom venue templates are stored locally in that browser through `localStorage`.
- Custom venue templates may contain multiple rooms, hallways, wall segments, doors, and openings.
- JSON layout export/import transfers a local floorplan between browsers without requiring user accounts.

## Application areas

- `app/routes.py` exposes the planner page and catalog API endpoints.
- `app/models.py` defines persistent inventory and venue catalog models.
- `app/static/js/floorplanner.js` is the stable browser module entrypoint. Planner code lives under `app/static/js/planner/`, organized into `domain`, focused `features`, and the coordinating legacy runtime.
- `app/static/js/planner/legacy/runtime.js` preserves the existing planner behavior while focused modules are extracted. New helpers belong in the relevant `domain` or `features` module.
- `app/templates/planner.html` contains the standalone planner UI.
- `app/static/data/` holds bundled starter catalog data.

## Public engine scope

- The starter catalog contains 55 inventory records across tables, chairs, lounge, bars, blocking, equipment, tent add-ons, and pipe & drape.
- The venue catalog contains 20 tent presets—the first four lengths for each 10', 15', 20', 30', and 40' width—and all 15 preset indoor rooms.
- The flooring catalog contains Subfloor, Stage, Modern Dance Floor, and Classic Dance Floor.
- Custom inventory, custom venues, layout groups, seating groups, reference images, and print workflows remain enabled.
- The public UI provides manual reference-image tools only. Optional USGS/geocoding endpoints remain backend support for downstream builds.

## Deployment model

The container stack contains two services:

- `web`: Flask served by Gunicorn on port 8000.
- `db`: PostgreSQL with its data in the `open-event-cad-data` named volume.

The application intentionally has no login layer. Anyone who can reach the hosted URL can update the shared catalog; their own floorplans remain local to their browser.
