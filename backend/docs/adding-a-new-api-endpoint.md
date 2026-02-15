---
audience: engineer
task: api_implementation
topics: [backend, api, fastapi, process]
owning_team: platform
---

# Adding a New API Endpoint

This doc walks through the typical steps for adding a new API endpoint to the ABC Corp backend. It's a checklist, not a tutorial — if you need deeper context on any step, follow the cross-references to the relevant docs.

## Before You Start

- [ ] **Read the ticket carefully.** Make sure you understand the expected behavior, edge cases, and who the consumer is (usually the frontend, sometimes another service).
- [ ] **Check if a similar endpoint already exists.** Look in `backend/app/routers/` for related routes. It may make more sense to extend an existing endpoint than create a new one.
- [ ] **Clarify the contract with the frontend.** If the frontend team has already started work, they may have assumptions about the request/response shape. A 5-minute Slack conversation now saves a revision cycle later.

## Step-by-Step

### 1. Define the Route

Add your endpoint to the appropriate router in `backend/app/routers/`. Routes are grouped by domain — if you're adding a reports endpoint, it goes in `routers/reports.py`.

If your feature needs a new router file, create it and register it in `main.py` using `app.include_router(...)`. Follow the naming convention of existing routers.

Refer to the **API Design Guidelines** doc for URL structure, HTTP methods, and status codes.

### 2. Create Request and Response Schemas

Define Pydantic models in `backend/app/schemas/`. These handle:

- Input validation
- Serialization (snake_case ↔ camelCase)
- API documentation (Swagger picks these up automatically)

See the **Request Validation and Serialization** doc for our conventions around schema design, optional fields, and alias handling.

### 3. Implement Business Logic

Business logic goes in `backend/app/services/`, not in the route handler. Route handlers should be thin — they validate input, call a service function, and return the response.

```python
# In the router — keep it simple
@router.post("/reports", status_code=201)
def create_report(req: CreateReportRequest, user=Depends(get_current_user)):
    report = report_service.create(req, user)
    return ReportResponse.from_orm(report)
```

If your feature interacts with the database, use the existing SQLAlchemy patterns. Models live in `backend/app/models/`.

### 4. Add Authentication and Authorization

Most endpoints require authentication. Use the `get_current_user` dependency to extract the user from the JWT.

For endpoints that require specific roles or permissions, see the **Authentication and Authorization** doc. The short version: use `require_role("admin")` or `require_permission("reports:write")` as dependencies.

### 5. Handle Errors

Use the standard error response format. Raise `HTTPException` for expected errors (not found, forbidden, validation failures). Let unexpected errors propagate — the global exception handler catches them.

See the **Error Handling and Logging** doc for conventions on error codes, logging, and what not to leak in error messages.

### 6. Write Tests

At minimum:

- **Unit tests** for the service layer logic
- **Integration tests** for the endpoint (happy path + key error cases)

See the **Testing Backend APIs** doc for how we structure tests, what fixtures are available, and when mocking is appropriate.

### 7. Run the Full Check Locally

Before opening your PR:

```
cd backend
pytest
ruff check .
mypy .
```

All three must pass. CI runs these too, but catching failures locally is faster.

### 8. Add a Database Migration (If Needed)

If you added or changed a model, generate an Alembic migration:

```
cd backend
alembic revision --autogenerate -m "add reports table"
alembic upgrade head
```

Review the generated migration file — autogenerate doesn't always get it right. Check for unnecessary drops or renames.

### 9. Open a PR

Follow the **Pull Request Checklist** doc. Key things reviewers will look for:

- Schema changes have a migration
- Tests cover the new endpoint
- Error handling follows conventions
- No PII in logs

## Common Gotchas

- **Forgetting to register the router.** If your endpoint doesn't show up in Swagger, check that the router is included in `main.py`.
- **Returning the wrong status code.** POST that creates something → 201. Not 200.
- **Leaking internal details in error messages.** Don't include stack traces, SQL queries, or internal IDs in user-facing errors.
- **Not handling soft-deleted records.** Most of our models use soft-delete. Make sure your queries filter on `deleted_at IS NULL` unless there's a reason not to.

_Last updated: 2025-11-20_
