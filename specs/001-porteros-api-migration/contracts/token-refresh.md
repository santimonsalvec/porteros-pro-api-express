# Contract: Token Refresh Endpoint

## `POST /api/auth/tokens/refresh`

Exchanges a valid, unexpired, unused refresh token for a new access/refresh token pair, without repeating the Google sign-in flow. Requires no `Authorization` header (the refresh token itself is the credential). Ported unchanged from the source system (`002-google-sso-login/contracts/token-refresh.md`) — same route, shapes, and status codes (FR-040).

### Request

```json
{ "refreshToken": "<opaque-refresh-token>" }
```

### Response — success

**Status**: `200 OK`

```json
{ "accessToken": "<new-internal-jwt>", "refreshToken": "<new-opaque-refresh-token>", "expiresInSeconds": 900 }
```

### Response — expired, already-used, or unrecognized refresh token

**Status**: `401 Unauthorized`

```json
{ "error": "invalid_refresh_token", "message": "The refresh token is invalid, expired, or has already been used." }
```

**Contract rules** (FR-017, FR-018, FR-043, SC-012):

- The submitted refresh token is single-use: on success, it is marked used and can never be redeemed again, even if unexpired. A second attempt returns `invalid_refresh_token` identically to an expired or unrecognized one — the response never distinguishes "already used" from "never existed" from "expired," to avoid leaking state to a caller holding a stolen token (FR-043).
- A successful refresh always returns a **new** refresh token in addition to the new access token (rotation); the client MUST discard the old one.
- No Google interaction occurs during a refresh; completes in under 5 seconds of backend processing time (SC-012).
