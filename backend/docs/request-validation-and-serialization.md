---
audience: engineer
task: api_implementation
topics: [backend, api, fastapi, pydantic]
owning_team: platform
---

# Request Validation and Serialization

This doc covers how we validate incoming requests and serialize outgoing responses in the ABC Corp backend. We lean heavily on **Pydantic** and FastAPI's built-in integration for this.

## The Basics

Every endpoint should have explicit Pydantic models for its request body and response. These live in `backend/app/schemas/`, organized by domain (e.g., `schemas/reports.py`, `schemas/users.py`).

Why we're strict about this:

- It gives us automatic input validation with clear error messages
- It keeps internal models separate from the API contract
- Swagger documentation is generated from these models automatically
- It prevents accidental data leaks (you only return fields you explicitly include)

## Request Schemas

A typical request schema:

```python
from pydantic import BaseModel, Field

class CreateReportRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    team_id: int

    model_config = {"populate_by_name": True}
```

### Conventions

- Use `Field(...)` for required fields with constraints (min/max length, regex, etc.)
- Optional fields should have a default of `None`
- Use Python type hints — Pydantic validates based on these
- Don't put business logic validation in schemas. Schemas validate **shape and type**; service functions validate **business rules** (e.g., "does this team exist?", "is this user allowed to create reports for this team?")

### camelCase Handling

The frontend sends and expects **camelCase** JSON keys. Our Python code uses **snake_case**. Pydantic handles the conversion.

We have a base schema class in `backend/app/schemas/base.py` that configures the alias generator:

```python
from pydantic import BaseModel
from pydantic.alias_generators import to_camel

class CamelModel(BaseModel):
    model_config = {
        "alias_generator": to_camel,
        "populate_by_name": True,
    }
```

Most schemas should inherit from `CamelModel` instead of plain `BaseModel`. This way, `team_id` in Python becomes `teamId` in JSON automatically.

Some older schemas don't use this and handle aliasing manually with `Field(alias="teamId")`. Don't follow that pattern for new code.

## Response Schemas

Response schemas control what the client sees. Always define one — never return a raw SQLAlchemy model or dict.

```python
class ReportResponse(CamelModel):
    id: int
    title: str
    description: str | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}
```

The `from_attributes = True` config lets you create response objects directly from SQLAlchemy models:

```python
report = db.query(Report).get(report_id)
return ReportResponse.model_validate(report)
```

### What to Include in Responses

- Include IDs, not full nested objects, unless the frontend needs them (and even then, consider a separate endpoint)
- Don't return `deleted_at`, `password_hash`, or other internal fields
- Include `created_at` and `updated_at` if the frontend uses them
- For list endpoints, wrap items in a paginated response (see API Design Guidelines)

## Validation Error Responses

When Pydantic validation fails, FastAPI returns a `422 Unprocessable Entity` with a body like:

```json
{
  "detail": [
    {
      "loc": ["body", "title"],
      "msg": "String should have at least 1 character",
      "type": "string_too_short"
    }
  ]
}
```

This is FastAPI's default behavior and it's fine for input validation. We don't customize this format.

For **business logic** validation failures (e.g., "this team doesn't exist"), use a `400` or `404` with our standard error format. See the **Error Handling and Logging** doc.

## Query Parameter Validation

For GET endpoints with query parameters, use a Pydantic model with `Query`:

```python
from fastapi import Query

@router.get("/reports")
def list_reports(
    status: str | None = Query(None, regex="^(draft|pending|approved)$"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    ...
```

Or, if you have many parameters, define a dependency model. There are a few examples of this in the codebase — check `routers/reports.py` for a pattern you can follow.

## Common Pitfalls

- **Returning a SQLAlchemy model directly.** FastAPI might serialize it, but you'll leak fields you didn't intend to expose. Always use a response schema.
- **Not inheriting from CamelModel.** If your response keys are snake_case, the frontend will be annoyed.
- **Putting business validation in schemas.** Don't check "does this user exist?" in a Pydantic validator. That's a service-layer concern.
- **Forgetting `from_attributes = True`.** Without this, `model_validate(orm_obj)` won't work and you'll get a confusing error.
- **Over-nesting response schemas.** If you find yourself nesting three levels deep, reconsider the API design. Maybe the client should make a separate call.

_Last updated: 2025-11-15_
