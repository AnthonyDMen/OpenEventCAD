# Open Event CAD operations

## Start with Podman

Set a database password and start the stack:

```bash
export POSTGRES_PASSWORD='choose-a-long-local-password'
podman-compose up --build -d
```

Open `http://localhost:8000`.

The Compose project uses the `open-event-cad-data` PostgreSQL volume. The bundled starter catalog is served from `app/static/data/`; the database is used for the shared catalog API and any imported catalog records.

## Stop and update

```bash
podman-compose down
podman-compose up --build -d
```

The PostgreSQL volume remains when the stack is stopped. Do not remove `open-event-cad-data` unless the catalog database is intentionally being discarded.

## Back up the shared catalog

```bash
podman-compose exec -T db pg_dump -U floorplanner floorplanner > open-event-cad.sql
```

Browser-local floorplans and custom venues are not included in this database backup. Users should use the planner's JSON export to retain or transfer those.

## Test before deploying

```bash
node --check app/static/js/floorplanner.js
npm run test:unit
python -m pytest -q
```
