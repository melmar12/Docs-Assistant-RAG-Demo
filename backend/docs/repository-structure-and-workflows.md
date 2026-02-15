---
topics: [onboarding, process, git, development]
owning_team: platform
---

# Repository Structure and Git Workflows

This doc covers how our codebase is organized and how we use Git day-to-day. If you've worked in a monorepo before, most of this will feel familiar.

## Repository Layout

We use a single monorepo (`abc-platform`) for the main product. The top-level structure looks roughly like this:

```
abc-platform/
  backend/           # FastAPI application
    app/
      main.py        # Application entrypoint
      routers/       # API route modules (grouped by domain)
      models/        # SQLAlchemy models
      schemas/       # Pydantic request/response schemas
      services/      # Business logic layer
      utils/         # Shared utilities
    tests/           # Backend test suite
    alembic/         # Database migrations
    requirements.txt
  frontend/          # React + TypeScript SPA
    src/
      components/    # Reusable UI components
      pages/         # Route-level page components
      hooks/         # Custom React hooks
      api/           # API client functions
      types/         # Shared TypeScript types
    tests/
  docker-compose.yml
  .github/
    workflows/       # GitHub Actions CI/CD pipelines
```

A few squads have their own repositories for services that were extracted from the monorepo (e.g., the billing integration service). Your manager can tell you if your team has any of these.

## Branching Strategy

We use a **trunk-based development** model:

- `main` is the primary branch. All work merges into `main`.
- Feature branches are short-lived — ideally a day or two, a week at most.
- Branch names should follow the pattern: `<your-initials>/<ticket-number>-<short-description>` (e.g., `jd/ENG-1234-fix-report-export`)
- There are no long-lived `develop` or `release` branches. Staging deploys happen on every merge to `main`.

## Pull Request Process

1. **Create a PR** against `main` from your feature branch
2. **Fill out the PR template** — it asks for a summary, testing notes, and any migration steps
3. **Get at least one approval** from a team member. For changes touching auth, billing, or infrastructure, you'll usually want a second reviewer from the owning team.
4. **CI must pass** — this includes linting, type checking, and the full test suite
5. **Squash and merge** — we use squash merges to keep `main` history clean

### Code Review Norms

- Try to review PRs within a few hours if possible. If it'll take longer, leave a comment so the author knows.
- Be specific in feedback. "This could be cleaner" isn't helpful; "Consider extracting this into a helper because X" is.
- Use GitHub's suggestion feature for small changes.
- If a PR is large, it's fine to ask the author to break it up.

## Commit Messages

We use **conventional commits** loosely:

- `feat: add export button to reports page`
- `fix: handle null user in billing lookup`
- `chore: update dependencies`

This isn't strictly enforced in a linter, but it's the expected convention and it makes the git log more readable.

## CI/CD Pipeline

On every PR, GitHub Actions runs:

- **Linting** (`ruff` for Python, `eslint` for TypeScript)
- **Type checking** (`mypy` for Python, `tsc` for TypeScript)
- **Tests** (`pytest` for backend, `vitest` for frontend)
- **Build** (Docker image build to catch any packaging issues)

If CI fails, check the Actions tab in GitHub for logs. Most failures are test-related, but occasionally you'll hit a flaky test — if you're confident it's flaky and not your change, re-run the job and mention it in the PR.

On merge to `main`, the pipeline automatically deploys to staging. Production deploys are manually triggered.

## Running Tests Locally

- **Backend:** `cd backend && pytest` (make sure your virtualenv is active)
- **Frontend:** `cd frontend && npm test`
- **Specific tests:** `pytest tests/test_reports.py -k "test_export"` or `npm test -- --grep "export"`

Tests should pass locally before you push. CI will catch it either way, but it's faster to iterate locally.

## CODEOWNERS

The repo has a `CODEOWNERS` file that maps directories to teams. GitHub uses this to auto-assign reviewers. If your PR touches code owned by another team, they'll be added as reviewers automatically.

_Last updated: 2025-10-05_
