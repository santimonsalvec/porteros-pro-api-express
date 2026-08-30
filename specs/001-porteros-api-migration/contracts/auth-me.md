# Contract: Protected Diagnostic Endpoint

## `GET /api/auth/me`

Exercises and verifies the internal JWT authorization pipeline end-to-end. Ported unchanged from the source system (`002-google-sso-login/contracts/auth-me.md`, extended by `003-complete-profile/contracts/profile-status-claim.md`).

### Request

Requires header: `Authorization: Bearer <accessToken>`

### Response — valid access token

**Status**: `200 OK`

```json
{ "userId": "665f1a2b3c4d5e6f7a8b9c0d", "email": "user@example.com", "isAdmin": false, "isProfileComplete": false }
```

### Response — missing or invalid access token

**Status**: `401 Unauthorized`

No response body.

**Contract rules** (FR-012, FR-020):

- The claims returned come only from the validated internal JWT — this endpoint performs no additional database lookup.
- `isProfileComplete` is sourced from the access token's `profileComplete` claim, not re-read from the database, so a caller holding a token issued before profile completion sees a stale value until that (short-lived) token's next refresh — an accepted, bounded staleness window (see `token-claims.md`).
- Not protected by the `CompleteProfile` policy (gating this endpoint would be circular — a client must be able to discover its own completion status regardless of that status).
- Any future capability needing authorization reuses the same bearer-token verification this endpoint exercises; no per-feature authentication setup is expected.
