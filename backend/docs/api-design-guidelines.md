---
audience: engineer
task: api_implementation
topics: [backend, api, fastapi, rest]
owning_team: platform
---

# API Design Guidelines

These are the conventions we follow when designing REST APIs at ABC Corp. They're not rigid rules — there are places where we've deviated for good reason — but new endpoints should follow these patterns unless you have a compelling reason not to.

## URL Structure

- Use **lowercase, hyphenated** paths: `/expense-reports`, not `/expenseReports` or `/expense_reports`
- Resources are **plural nouns**: `/users`, `/reports`, `/invoices`
- Nest resources only one level deep: `/users/{user_id}/reports` is fine; `/users/{user_id}/reports/{report_id}/line-items/{item_id}` is not. If you need deeper nesting, flatten it: `/line-items/{item_id}`
- Actions that don't map cleanly to CRUD can use a verb suffix: `/reports/{id}/export`, `/invoices/{id}/void`. Try to keep these rare.

## HTTP Methods

| Method | Use |
|--------|-----|
| GET | Read a resource or list of resources |
| POST | Create a new resource |
| PUT | Full replacement of a resource (we rarely use this) |
| PATCH | Partial update of a resource |
| DELETE | Remove a resource (usually soft-delete) |

We generally prefer PATCH over PUT for updates since most of our updates are partial.

## Status Codes

Use the right status code. A few that come up frequently:

- `200` — Success (GET, PATCH, DELETE)
- `201` — Created (POST that creates a resource)
- `204` — No content (DELETE when there's nothing to return)
- `400` — Bad request (validation failure, malformed input)
- `401` — Unauthorized (missing or invalid token)
- `403` — Forbidden (valid token, but insufficient permissions)
- `404` — Not found
- `409` — Conflict (duplicate resource, version mismatch)
- `422` — Unprocessable entity (FastAPI's default for Pydantic validation errors)
- `500` — Internal server error (something we didn't handle)

Don't return `200` for errors. Don't return `500` for things that are the client's fault. This sounds obvious but it happens.

## Pagination

List endpoints must be paginated. We use **offset-based pagination** with `limit` and `offset` query parameters:

```
GET /reports?limit=20&offset=40
```

Response should include pagination metadata:

```json
{
  "items": [...],
  "total": 150,
  "limit": 20,
  "offset": 40
}
```

- Default `limit` is 20, max is 100
- Some older endpoints use `page` and `page_size` instead — don't follow that pattern for new work. We're gradually migrating.

If you're building something with very large datasets or real-time cursoring (rare), talk to the platform team about cursor-based pagination.

## Filtering and Sorting

- Use query parameters for filtering: `/reports?status=pending&created_after=2025-01-01`
- Sorting: `?sort=created_at&order=desc`
- Keep filter names consistent with the resource's field names
- Don't build overly complex filtering — if a use case requires it, consider a dedicated search endpoint

## Error Responses

All error responses should follow this shape:

```json
{
  "detail": "Human-readable message describing what went wrong",
  "code": "REPORT_NOT_FOUND",
  "errors": []
}
```

- `detail` — always present, should be helpful but not leak internals
- `code` — a machine-readable error code. Use UPPER_SNAKE_CASE. See the Error Handling and Logging doc for the full list of conventions.
- `errors` — optional array for field-level validation errors

FastAPI's default 422 response for Pydantic validation already returns a structured error, which is fine for input validation. For business logic errors, use the format above.

## Request and Response Bodies

- Use **camelCase** for JSON field names in request and response bodies (this matches what the frontend expects)
- Pydantic models handle the snake_case ↔ camelCase conversion via `alias_generator`. See the Request Validation and Serialization doc for details.
- Don't return fields the client doesn't need. Be intentional about your response schema.
- Avoid returning raw database rows — always go through a Pydantic response model.

## Versioning

We don't currently version our API (it's internal-only). If we ever need to, the plan is URL-based versioning (`/v2/reports`), but that hasn't been necessary yet. If you're making a breaking change to an existing endpoint, coordinate with the frontend team and migrate together.

## A Note on Consistency

The codebase isn't perfectly consistent. Older endpoints may not follow all of these conventions. That's fine — don't refactor the world in your PR. But new code should follow these guidelines, and if you're touching an old endpoint, consider bringing it up to spec if the change is small.

_Last updated: 2025-11-18_
