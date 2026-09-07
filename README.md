# Open Event CAD

Open Event CAD is an open-source, browser-based 2D event floorplanner for tents, rooms, seating, flooring, stages, decor, and setup documentation.

## Documentation

- [User guide](docs/USER_GUIDE.md) — using the planner.
- [Developer guide](docs/DEVELOPER_GUIDE.md) — code structure, data, and safe changes.
- [Modding guide](docs/MODDING.md) — adding content and creating custom builds.
- [Operations](docs/OPERATIONS.md) — running, testing, and backing up the service.
- [License](LICENSE) — MIT license for the project.

## Run with containers

1. Copy `.env.example` to `.env` and set the database password.
2. Start it with `docker compose up --build -d`.
3. Open `http://localhost:8000`.

PostgreSQL data persists in the `open-event-cad-data` volume. Back it up with `docker compose exec -T db pg_dump -U floorplanner floorplanner > open-event-cad.sql`; restore it with `psql` from the same container.

For Podman, use the same Compose file:

```bash
podman-compose up --build -d
```

The shared starter catalog is served by the application. Floorplans, custom inventory, custom venues, and reusable layout groups stay in the user's browser unless they are exported as JSON.

## Local development

Install Python requirements and `npm install`, then run `flask --app wsgi run`.

```bash
npm run test:unit
python -m pytest -q
```
