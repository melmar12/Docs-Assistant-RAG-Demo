---
topics: [onboarding, backend, frontend, architecture]
owning_team: platform
---

# System Architecture Overview

This doc gives you a high-level view of how ABC Corp's platform is put together. It's not exhaustive — each team has deeper docs for their own services — but it should help you understand how the pieces fit.

## High-Level Overview

The platform follows a fairly standard web application architecture:

- A **React + TypeScript** single-page application (SPA) serves as the frontend
- A **FastAPI (Python)** backend handles API requests, business logic, and authentication
- **PostgreSQL** is the primary data store
- **Redis** is used for caching and background job queues in some services
- Everything runs on **AWS**, deployed via **Docker** containers orchestrated with ECS

Traffic flows through an AWS Application Load Balancer (ALB) to the frontend (served from S3/CloudFront in production) and backend services.

## Core Services

### API Gateway / Backend

The main backend is a FastAPI application. It handles:

- REST API endpoints consumed by the frontend
- JWT-based authentication and authorization
- Business logic for operations management, reporting, and user management
- Database access via SQLAlchemy ORM with Alembic migrations

Most squads add their endpoints to the main backend, though a few services have been extracted (see below).

### Frontend

The React app is a single-page application built with Vite. It uses:

- TypeScript throughout
- Tailwind CSS for styling
- React Router for client-side routing
- Axios for API calls (though some newer code uses `fetch` directly — we're in the middle of migrating, honestly)

The frontend is built and deployed as static assets to S3, served through CloudFront.

### Database

PostgreSQL 15 is the primary database. We run a single RDS instance in production (with a read replica for reporting queries). Key points:

- Schema migrations are managed with **Alembic**
- Most tables follow a soft-delete pattern (`deleted_at` timestamp)
- The `reporting` schema is used by the analytics/reporting team and has some denormalized tables — don't write to these directly
- Database access goes through SQLAlchemy. Avoid raw SQL unless you have a good reason.

### Authentication

Auth is JWT-based:

- Users log in via `/auth/login`, which returns an access token and a refresh token
- Access tokens are short-lived (15 minutes); refresh tokens last 7 days
- Tokens are validated via middleware on protected endpoints
- Role-based access control (RBAC) is enforced at the API layer — roles include `admin`, `manager`, and `member`

The auth system is owned by the platform team. If you need to change anything auth-related, check with them first.

### Background Jobs

We use **Celery** with Redis as the broker for async tasks:

- Report generation (some reports take 30+ seconds)
- Email notifications
- Data imports and bulk operations

The Celery workers run as a separate ECS service. Logging goes to CloudWatch, same as the main backend.

## Infrastructure

- **AWS ECS** (Fargate) for container orchestration
- **RDS** for PostgreSQL
- **ElastiCache** for Redis
- **S3 + CloudFront** for frontend static assets and file uploads
- **CloudWatch** for logs and basic monitoring
- **GitHub Actions** for CI/CD

Deployments to staging happen automatically on merge to `main`. Production deploys are triggered manually through the release pipeline in GitHub Actions, usually on Tuesdays and Thursdays. The infra team has more docs on this if you're curious.

## Service Ownership

| Service / Area       | Owning Team       |
|---------------------|-------------------|
| Core API backend     | varies by squad   |
| Frontend SPA         | varies by squad   |
| Auth & user management | Platform         |
| CI/CD & infra        | Platform / Infra  |
| Reporting engine     | Reporting squad   |
| Billing integration  | Billing squad     |
| Background jobs      | Platform          |

If you're not sure who owns something, ask in `#engineering-general` or check the `CODEOWNERS` file in the repo.

## What's Not Covered Here

- **Monitoring and alerting** — we use CloudWatch and PagerDuty. There's a separate runbook for on-call, which you'll get access to after your first month.
- **Data pipeline** — the data engineering team has their own stack (Airflow, dbt). It's mostly separate from the main application.
- **Third-party integrations** — we integrate with a few external services for payments, email, etc. These are documented per-integration by the owning team.

_Last updated: 2025-09-30_
