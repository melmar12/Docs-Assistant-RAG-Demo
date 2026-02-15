---
audience: engineer
task: api_implementation
topics: [backend, api, errors, logging, security]
owning_team: platform
---

# Error Handling and Logging

This doc covers how we handle errors and write log messages in the ABC Corp backend. Getting this right matters — bad error handling confuses users and makes debugging harder; bad logging either gives you nothing useful or leaks sensitive data.

## Error Response Format

All API error responses should follow this structure:

```json
{
  "detail": "Report not found",
  "code": "REPORT_NOT_FOUND",
  "errors": []
}
```

- **`detail`** — a human-readable message. Should be helpful to the frontend (and ultimately the user) without exposing internal details.
- **`code`** — a machine-readable error code in `UPPER_SNAKE_CASE`. The frontend uses these for i18n and specific error handling.
- **`errors`** — an optional list of field-level errors, primarily used for validation. Each entry should have `field` and `message`.

The one exception is Pydantic validation errors (422s), which use FastAPI's default format. We don't override those.

## Raising Errors

For expected errors, raise `HTTPException`:

```python
from fastapi import HTTPException

raise HTTPException(
    status_code=404,
    detail="Report not found",
)
```

For errors that need the `code` field, we have a helper:

```python
from app.exceptions import APIError

raise APIError(
    status_code=404,
    detail="Report not found",
    code="REPORT_NOT_FOUND",
)
```

`APIError` extends `HTTPException` and is caught by our global exception handler, which formats the response correctly.

### Error Code Conventions

- Use `UPPER_SNAKE_CASE`
- Prefix with the resource: `REPORT_NOT_FOUND`, `USER_ALREADY_EXISTS`, `TEAM_LIMIT_EXCEEDED`
- Keep them specific enough to be useful but don't create one for every possible scenario
- There's an informal registry in `backend/app/exceptions.py`. Check what exists before creating new ones, but it's not strictly enforced.

## What NOT to Put in Error Messages

- **Stack traces** — never in production responses. The global handler logs them, but they don't go to the client.
- **SQL queries or database details** — a `404` is "Report not found", not "No rows returned from SELECT * FROM reports WHERE..."
- **Internal IDs that aren't meaningful to the user** — internal correlation IDs are fine in logs, not in user-facing messages.
- **Anything that helps an attacker** — "Invalid password" is fine. "User exists but password is wrong" is not.

## Global Exception Handler

We have a global exception handler in `backend/app/middleware/errors.py` that catches unhandled exceptions and returns a generic `500`:

```json
{
  "detail": "An unexpected error occurred",
  "code": "INTERNAL_ERROR"
}
```

It also logs the full exception with traceback. If you're seeing a 500 in staging or production, check CloudWatch logs for the traceback.

Don't catch exceptions broadly in your route handlers just to return a nicer error. Let unexpected errors propagate to the global handler — that's what it's for.

## Logging

We use Python's standard `logging` module. Each module should have its own logger:

```python
import logging

logger = logging.getLogger(__name__)
```

### Log Levels

| Level | Use for |
|-------|---------|
| `DEBUG` | Detailed diagnostic info. Noisy. Off in production by default. |
| `INFO` | Normal operations worth recording: requests processed, jobs completed, config loaded. |
| `WARNING` | Something unexpected but not broken: deprecated feature used, retry needed, slow query. |
| `ERROR` | Something failed: unhandled exception, external service down, data integrity issue. |
| `CRITICAL` | System is unusable. Rare — usually means "page someone." |

In practice, most of your logging will be `INFO` and `ERROR`.

### What to Log

- **Do log:** request context (user ID, resource ID), operation being performed, external service calls, failures with enough context to debug
- **Don't log:** full request/response bodies (too noisy), successful auth tokens, anything that's already in the HTTP access log

### PII and Sensitive Data

**Do not log personally identifiable information (PII).** This includes:

- Email addresses
- Full names
- Phone numbers
- IP addresses (in most contexts)
- Authentication tokens or secrets

If you need to reference a user in logs, use their internal user ID. If you need to log a request for debugging, redact sensitive fields.

This isn't just good practice — it's a compliance requirement. If you're unsure whether something counts as PII, ask the security team in `#security`.

### Structured Logging

We're gradually moving toward structured (JSON) logging. Newer code should use:

```python
logger.info("Report created", extra={"report_id": report.id, "user_id": user.id})
```

Older code uses string formatting, which is fine but harder to query in CloudWatch. Don't refactor working log statements just for the sake of it, but use the structured pattern for new code.

## Monitoring and Alerts

Errors in production are sent to CloudWatch. We have alerts configured for:

- Sustained 5xx error rates
- Specific error codes that indicate data issues
- Background job failures

You generally don't need to set up new alerts for individual endpoints. But if your feature has specific failure modes that should trigger an alert, talk to the platform team.

For more on monitoring and on-call, see the on-call runbook (you'll get access after your first month).

_Last updated: 2025-11-08_
