---
audience: engineer
task: api_implementation
topics: [backend, process, code_review]
owning_team: engineering
---

# Pull Request Checklist

Use this checklist before opening a PR for backend API changes. Not every item applies to every PR — use your judgment — but skipping one should be a conscious decision, not an oversight.

This supplements the general PR process described in the **Repository Structure and Git Workflows** doc.

## Before Opening the PR

### Code Quality

- [ ] **Linting passes:** `ruff check .` from the `backend/` directory
- [ ] **Type checking passes:** `mypy .` from the `backend/` directory
- [ ] **Tests pass:** `pytest` from the `backend/` directory
- [ ] **No commented-out code** left behind. If you're removing something, remove it. Don't leave it commented "just in case."
- [ ] **No debug statements** (`print()`, `breakpoint()`, `import pdb`) in committed code

### API Design

- [ ] **URL follows conventions** (lowercase, hyphenated, plural nouns). See **API Design Guidelines**.
- [ ] **Correct HTTP method and status codes.** POST creates → 201. GET reads → 200. Don't return 200 for everything.
- [ ] **Request/response schemas defined** in `schemas/`. Not returning raw dicts or ORM objects.
- [ ] **camelCase in JSON** — schemas inherit from `CamelModel`. See **Request Validation and Serialization**.
- [ ] **Pagination** for list endpoints (if returning more than a handful of items).

### Authentication & Authorization

- [ ] **Endpoint requires auth** unless it's explicitly public. Missing `get_current_user` = public endpoint.
- [ ] **Role/permission checks** are in place if the endpoint has access restrictions.
- [ ] **Row-level access** is handled in the service layer where needed.
- See **Authentication and Authorization** for details.

### Database

- [ ] **Migration included** if you added or changed models. Generated with `alembic revision --autogenerate`.
- [ ] **Migration reviewed** — autogenerate can miss things or add unnecessary operations. Read the generated file.
- [ ] **Queries filter soft-deleted records** (`deleted_at IS NULL`), unless there's a specific reason to include them.
- [ ] **No N+1 queries.** If you're loading related objects in a loop, consider a join or eager load.

### Error Handling

- [ ] **Errors use the standard format** (`detail`, `code`). See **Error Handling and Logging**.
- [ ] **No sensitive data in error messages** — no SQL, no stack traces, no PII.
- [ ] **Appropriate status codes for errors** — 400 for bad input, 404 for not found, 403 for forbidden. Not 500.

### Testing

- [ ] **Integration test for happy path** at minimum
- [ ] **Auth tests** — 401 (unauthenticated) and 403 (wrong role) if applicable
- [ ] **Validation test** — bad input returns 400/422, not 500
- [ ] **Edge cases** covered where relevant
- See **Testing Backend APIs** for full expectations.

### Logging

- [ ] **No PII in log messages** — use user IDs, not emails or names
- [ ] **Meaningful log messages** — enough context to debug without being overwhelming
- [ ] **Structured format** for new log statements (`extra={...}`)

## PR Description

When you open the PR:

- [ ] **Fill out the PR template.** Summary, testing notes, migration steps (if any).
- [ ] **Link the Jira ticket** in the PR description.
- [ ] **Call out anything unusual** — workarounds, known limitations, things that might surprise the reviewer.
- [ ] **Screenshots or curl examples** if the change is hard to verify from code alone.

## After Opening the PR

- [ ] **CI passes.** If it fails, fix it before requesting review (unless it's a known flaky test).
- [ ] **Request review** from at least one team member. If your change touches code owned by another team (check `CODEOWNERS`), they'll be added automatically.
- [ ] **Respond to feedback promptly.** If you disagree with a suggestion, explain why rather than just dismissing it.

## Merging

- [ ] **At least one approval** (two for auth, billing, or infra changes)
- [ ] **CI green**
- [ ] **Use squash and merge** to keep `main` history clean
- [ ] **Delete the branch** after merging (GitHub can be configured to do this automatically)

## Post-Merge

- [ ] **Verify in staging** after the auto-deploy. Spend two minutes checking that your endpoint works as expected in the staging environment.
- [ ] **Update the Jira ticket** — move it to Done or whatever your team's workflow says.

_Last updated: 2025-11-20_
