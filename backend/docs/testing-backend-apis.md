---
audience: engineer
task: api_implementation
topics: [backend, api, testing, pytest]
owning_team: platform
---

# Testing Backend APIs

This doc covers how we test backend APIs at ABC Corp. Tests live in `backend/tests/` and we use **pytest** as our test runner. CI runs the full suite on every PR, and it must pass before merging.

## Test Types

We generally write two kinds of tests for API work:

### Unit Tests

Unit tests cover **service-layer logic** — the business rules, calculations, and data transformations that happen independent of HTTP or the database.

- Located in `tests/unit/`
- Fast to run, no external dependencies
- Mock database calls and external services
- Good for: complex business logic, edge cases, data transformations

### Integration Tests

Integration tests cover **full endpoint behavior** — they send real HTTP requests to the FastAPI app and assert on the response.

- Located in `tests/integration/`
- Use a test database (PostgreSQL, spun up via Docker in CI)
- Test the full stack: routing → validation → auth → service → database → response
- Good for: verifying endpoints work end-to-end, auth checks, error responses

### When to Write Which

| Scenario | Unit test | Integration test |
|----------|-----------|-----------------|
| New endpoint (happy path) | | Required |
| New endpoint (error cases) | | At least 401/403 + main 400/404 |
| Complex business logic | Required | Optional |
| Simple CRUD with no logic | Optional | Required |
| Bug fix | Whichever reproduces the bug | |

Use your judgment. The goal is confidence that the code works, not checkbox coverage metrics.

## Test Structure

### Integration Test Example

```python
def test_create_report(client, auth_headers, sample_team):
    response = client.post(
        "/reports",
        json={"title": "Q4 Summary", "teamId": sample_team.id},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Q4 Summary"
    assert "id" in data
```

### Key Fixtures

We have shared fixtures in `tests/conftest.py`:

- `client` — a FastAPI `TestClient` instance
- `db_session` — a scoped database session that rolls back after each test
- `auth_headers` — valid JWT headers for a default test user
- `admin_headers` — valid JWT headers for an admin user
- `sample_user`, `sample_team`, etc. — factory fixtures for common entities

If you need a new fixture, add it to `conftest.py` or a domain-specific conftest. Don't create test data inline in every test if it can be shared.

## Mocking

- **Mock external services** (email, payment APIs, etc.) — always. We use `unittest.mock.patch` or `pytest-mock`.
- **Don't mock the database in integration tests.** The point is to test the real query behavior.
- **Mock the database in unit tests.** Service functions should be testable without a live DB.
- **Be cautious mocking internal modules.** If you're mocking three internal functions to test one function, the test might not be telling you much. Consider restructuring.

## Running Tests

Locally:

```
cd backend
pytest                           # full suite
pytest tests/integration/        # integration only
pytest tests/unit/               # unit only
pytest -k "test_create_report"   # specific test by name
pytest --tb=short                # shorter tracebacks
```

Make sure Docker is running if you're running integration tests — they need the test database.

### Test Database

Integration tests use a separate PostgreSQL database (`abc_test` by default). The `conftest.py` handles creating and migrating it. If you see migration-related errors in tests, try:

```
cd backend
alembic -x db=test upgrade head
```

## What Reviewers Look For

When reviewing test code on a PR, we generally check:

- **Happy path is covered** for new endpoints
- **Auth is tested** — at least one test for unauthenticated (401) and unauthorized (403) if the endpoint has role requirements
- **Validation is tested** — sending bad input returns 400/422, not 500
- **Edge cases** — empty lists, missing optional fields, boundary values
- **No sleep() calls or timing-dependent assertions** — these make tests flaky
- **Tests are independent** — order shouldn't matter, no shared mutable state between tests

## Flaky Tests

If you encounter a flaky test (passes sometimes, fails sometimes):

1. Re-run it a few times to confirm it's actually flaky
2. Check if it depends on test ordering or shared state
3. If you can fix it quickly, do so. If not, mark it with `@pytest.mark.skip(reason="flaky - ENG-XXXX")` and file a ticket
4. Don't just re-run CI until it passes and call it done

We track flaky tests in Jira. If you're bored, picking one off the list is always appreciated.

_Last updated: 2025-11-12_
