---
audience: engineer
task: api_implementation
topics: [backend, api, auth, security]
owning_team: platform
---

# Authentication and Authorization

This doc covers how authentication and authorization work in the ABC Corp backend. The auth system is owned by the platform team — if you need to change anything in the core auth flow, check with them first.

For a higher-level overview of how auth fits into the architecture, see the **System Architecture Overview** doc.

## Authentication: How It Works

We use **JWT-based authentication**. Here's the flow:

1. User sends credentials to `POST /auth/login`
2. Backend validates credentials against the database (passwords are hashed with bcrypt)
3. On success, the backend returns an **access token** and a **refresh token**
4. The frontend stores the access token in memory and the refresh token in an HTTP-only cookie
5. Subsequent API requests include the access token in the `Authorization: Bearer <token>` header

### Token Details

| Token | Lifetime | Storage |
|-------|----------|---------|
| Access token | 15 minutes | Frontend memory |
| Refresh token | 7 days | HTTP-only cookie |

- Access tokens are signed with the `JWT_SECRET` environment variable (see Local Development Setup doc for configuring this locally)
- Tokens include the user's `id`, `email`, and `roles` in the payload
- The refresh endpoint (`POST /auth/refresh`) issues a new access token without requiring re-login

## Using Authentication in Your Endpoints

For most endpoints, just add the `get_current_user` dependency:

```python
from app.dependencies.auth import get_current_user

@router.get("/reports")
def list_reports(user=Depends(get_current_user)):
    # user is a User model instance
    ...
```

This extracts and validates the JWT from the request. If the token is missing, expired, or invalid, it returns a `401` automatically.

For **public endpoints** (no auth required), simply don't include the dependency. These are rare — health checks, login, and a few webhook receivers.

## Authorization: Roles and Permissions

We use **role-based access control (RBAC)**. The three roles are:

| Role | Description |
|------|-------------|
| `member` | Default role. Can access their own data and team-level resources. |
| `manager` | Can access data for their direct reports. Can approve certain actions. |
| `admin` | Full access. Can manage users, roles, and system configuration. |

### Checking Roles

Use the `require_role` dependency:

```python
from app.dependencies.auth import require_role

@router.delete("/users/{user_id}")
def delete_user(user_id: int, user=Depends(require_role("admin"))):
    ...
```

This returns a `403` if the user doesn't have the required role.

### Checking Permissions

For more granular access control, we have a permissions system layered on top of roles. Permissions look like `resource:action` (e.g., `reports:write`, `users:read`).

```python
from app.dependencies.auth import require_permission

@router.post("/reports")
def create_report(req: CreateReportRequest, user=Depends(require_permission("reports:write"))):
    ...
```

The mapping of roles to permissions is defined in `backend/app/config/permissions.py`. This file is the source of truth — if you need to add a new permission, add it there and coordinate with the platform team.

### Row-Level Access

Roles and permissions control **what actions** a user can take. They don't automatically control **which records** a user can see. Row-level filtering (e.g., "managers can only see reports from their team") is handled in the service layer.

This is an area where the codebase isn't fully consistent. Some services check ownership explicitly, others rely on query scoping. When you're building a new endpoint, think about who should see what and implement the filtering in your service function. If you're unsure about the expected access pattern, check with your manager or the product owner on the ticket.

## Common Mistakes

- **Forgetting auth entirely.** If your endpoint doesn't have `get_current_user` or one of the role/permission dependencies, it's public. That's almost never intentional for new endpoints.
- **Checking roles in the route handler instead of using dependencies.** Don't do `if user.role != "admin": raise 403`. Use `require_role` — it's consistent and testable.
- **Hardcoding role names in service logic.** If you find yourself writing `if user.role == "manager"` deep in business logic, consider whether a permission check at the route level would be cleaner.
- **Returning 401 when you mean 403.** 401 = "who are you?" (no valid token). 403 = "I know who you are, but you can't do this." Get this right.
- **Not testing auth scenarios.** Every endpoint should have at least one test for the unauthorized case and one for the forbidden case (if it has role requirements). See the **Testing Backend APIs** doc.

## Token Debugging

If you're debugging auth issues locally:

- Check that `JWT_SECRET` is set in your `.env` file
- Use the Swagger UI (`/docs`) — it has an "Authorize" button where you can paste a token
- Decode tokens at the `/auth/debug-token` endpoint (local/staging only, disabled in production)
- Access token expired? The frontend should silently refresh. If it's not working, check the browser dev tools for failed `/auth/refresh` calls.

_Last updated: 2025-10-28_
