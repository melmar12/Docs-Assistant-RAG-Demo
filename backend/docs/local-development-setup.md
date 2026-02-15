---
topics: [onboarding, backend, frontend, setup]
owning_team: engineering
---

# Local Development Environment Setup

This guide walks you through getting the ABC Corp application running on your local machine. It assumes you're on a Mac — if you're on Linux, most of this still applies, but a few paths and install steps may differ. Ask in `#platform-eng` if you get stuck.

## Prerequisites

Make sure the following are installed before you start:

- **Git** — should be pre-installed on macOS, or install via Homebrew
- **Docker Desktop** — required for running PostgreSQL and other services locally
- **Node.js 18+** — we recommend using `nvm` to manage versions
- **Python 3.11+** — the backend runs on FastAPI with Python 3.11
- **pip** and **virtualenv** (or use the built-in `venv` module)

## Step 1: Clone the Repository

You'll need access to the GitHub org first. If you don't have it, ask your manager or ping `#it-help`.

Clone the main monorepo:

```
git clone git@github.com:abc-corp/abc-platform.git
cd abc-platform
```

## Step 2: Set Up the Backend

The backend is a FastAPI application located in the `backend/` directory.

```
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Copy the example environment file and fill in your local values:

```
cp .env.example .env
```

You'll need to set at least `DATABASE_URL` and `JWT_SECRET`. The `.env.example` file has comments explaining each variable. For local dev, the database URL usually points to the Dockerized PostgreSQL instance (see Step 4).

Start the dev server:

```
uvicorn app.main:app --reload
```

The API should be available at `http://localhost:8000`. You can verify at `http://localhost:8000/docs` (Swagger UI).

## Step 3: Set Up the Frontend

The frontend is a React + TypeScript app in the `frontend/` directory.

```
cd frontend
npm install
npm run dev
```

This starts the Vite dev server, usually at `http://localhost:5173`. It proxies API requests to the backend at port 8000.

## Step 4: Start Local Services with Docker

We use Docker Compose to run PostgreSQL (and Redis, if your team uses it) locally.

```
docker compose up -d
```

This starts a PostgreSQL 15 container with the default credentials from `.env.example`. The database is seeded with a small development dataset on first run.

If you need to reset the database, you can tear down the volume:

```
docker compose down -v
docker compose up -d
```

## Step 5: Run Database Migrations

We use Alembic for database migrations:

```
cd backend
alembic upgrade head
```

If you see errors about missing tables after pulling new changes, you probably need to run migrations.

## Common Issues

- **Port 8000 already in use:** Something else is using that port. Kill it or change the port with `--port 8001`.
- **Docker not running:** Make sure Docker Desktop is actually started. The CLI tools won't work without the daemon.
- **Python version mismatch:** Check `python --version`. If it's showing 3.9 or lower, make sure your virtualenv was created with the right Python.
- **npm install failures:** Try deleting `node_modules` and `package-lock.json`, then run `npm install` again. If that doesn't work, check your Node version.
- **JWT_SECRET not set:** The backend will crash on startup if this is missing. Just set it to any random string for local dev.

## Editor Setup

Most of the team uses VS Code. We have a shared `.vscode/` config in the repo with recommended extensions and settings. You're free to use whatever editor you want, but linting and formatting are enforced in CI regardless.

## What About Tests?

There's a separate section in the repo structure doc about running tests. The short version:

- Backend: `pytest` from the `backend/` directory
- Frontend: `npm test` from the `frontend/` directory

CI runs both on every PR, so you'll want to make sure they pass locally before pushing.

_Last updated: 2025-10-22_
