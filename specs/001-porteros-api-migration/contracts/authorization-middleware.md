# Contract: Authorization Middleware (`requireAuth`, `requireClientOnly`, `requireCompleteProfile`)

Not HTTP endpoints — the Express-middleware equivalents of the source system's `[Authorize]` attribute and its `ClientOnly`/`CompleteProfile` named policies (`003-complete-profile/contracts/complete-profile-policy.md`, `004-get-client-profile/contracts/client-only-policy.md`).

## `requireAuth`

Verifies the `Authorization: Bearer <token>` header against the internal JWT signing key; on success attaches the decoded claims (`sub`, `email`, `isAdmin`, `profileComplete`) to the request for downstream handlers/middleware. On a missing or invalid token, responds `401 Unauthorized` with no body and does not call `next()`.

## `requireClientOnly` (applied after `requireAuth`)

Succeeds when the attached claims' `isAdmin === "false"`. Any other value (`"true"`, missing) responds `403 Forbidden` with no body.

## `requireCompleteProfile` (applied after `requireAuth`)

Succeeds when the attached claims' `profileComplete === "true"`. Any other value responds `403 Forbidden` with no body.

## Composition per route

| Route | Middleware stack |
|---|---|
| `GET /api/auth/me` | `requireAuth` only |
| `GET /api/clients/me` | `requireAuth`, `requireClientOnly` |
| `PATCH /api/clients/me` | `requireAuth`, `requireClientOnly`, `requireCompleteProfile` |
| `POST /api/profile/complete` | `requireAuth` only |
| `POST /api/auth/sso/exchange`, `POST /api/auth/tokens/refresh`, `GET /api/auth/sso-options`, `GET /api/locations/countries`, `GET /health` | none (public) |

**Contract rules**:

- `POST /api/auth/sso/exchange`, `POST /api/auth/tokens/refresh`, and `POST /api/profile/complete` are never protected by `requireCompleteProfile` — completing the profile must remain reachable precisely when the profile is incomplete (FR-028 would otherwise be unsatisfiable).
- `GET /api/auth/me` is not protected by `requireCompleteProfile` either — gating it would be circular (a client needs to read its own completion status regardless of that status).
- Each middleware is a single, composable, independently unit-testable function reading only the claims `requireAuth` already attached — no per-route duplication of claim-parsing logic (mirrors the source's single-claim-check-per-policy design, SC-003-style "zero duplicated code").
