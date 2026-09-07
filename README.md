# Open Event CAD

Open Event CAD is an open-source, browser-based 2D event floorplanner for tents, rooms, seating, flooring, stages, decor, and setup documentation.

## Documentation

- [User guide](docs/USER_GUIDE.md) — using the planner.
- [Developer guide](docs/DEVELOPER_GUIDE.md) — code structure, data, and safe changes.
- [Modding guide](docs/MODDING.md) — adding content and creating custom builds.
- [Operations](docs/OPERATIONS.md) — running, testing, and backing up the service.
- [License](LICENSE) — MIT license for the project.

## Run with Docker

Install Docker Engine or Docker Desktop with Compose support. Create a local environment file:

```bash
cp .env.example .env
```

Edit `.env` and replace the sample `POSTGRES_PASSWORD` with a local password. Build and start the application:

```bash
docker compose up --build -d
```

Open [http://localhost:8000](http://localhost:8000). Check container status or follow application logs with:

```bash
docker compose ps
docker compose logs -f web
```

Stop the containers while preserving the database volume:

```bash
docker compose down
```

PostgreSQL data persists in the `open-event-cad-data` volume. Back it up with:

```bash
docker compose exec -T db pg_dump -U floorplanner floorplanner > open-event-cad.sql
```

## Run with Podman

Podman can use the same Compose file. Install Podman and `podman-compose`, then create the environment file:

```bash
cp .env.example .env
```

Edit `.env` and replace the sample `POSTGRES_PASSWORD` with a local password. Build and start the application:

```bash
podman-compose up --build -d
```

Open [http://localhost:8000](http://localhost:8000). Check container status or follow application logs with:

```bash
podman-compose ps
podman-compose logs -f web
```

Stop the containers while preserving the database volume:

```bash
podman-compose down
```

Back up the PostgreSQL database with:

```bash
podman-compose exec -T db pg_dump -U floorplanner floorplanner > open-event-cad.sql
```

The shared starter catalog is served by the application. Floorplans, custom inventory, custom venues, and reusable layout groups stay in the user's browser unless they are exported as JSON.

## Local development

Install Python requirements and `npm install`, then run `flask --app wsgi run`.

```bash
npm run test:unit
python -m pytest -q
```
