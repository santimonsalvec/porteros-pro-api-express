# Contract: SSO Credential Exchange Endpoint

## `POST /api/auth/sso/exchange`

Validates a provider credential the client already obtained and, if valid, issues an internal access/refresh token pair. Requires no authentication (this endpoint *is* the login). Ported unchanged from the source system (`002-google-sso-login/contracts/sso-exchange.md`) — same route, shapes, and status codes (FR-040).

### Request

```json
{ "provider": "google", "platform": "mobile", "credential": "<google-id-token-jwt>" }
```

| Field | Required | Notes |
|---|---|---|
| `provider` | Yes | Only `"google"` is supported |
| `platform` | Yes | `mobile` or `admin-web`; selects the account-resolution policy |
| `credential` | Yes | The Google-issued ID token obtained by the client's own sign-in flow |

### Response — success (mobile, new or returning user; admin web, existing admin user)

**Status**: `200 OK`

```json
{ "accessToken": "<internal-jwt>", "refreshToken": "<opaque-refresh-token>", "expiresInSeconds": 900 }
```

### Response — credential invalid (bad signature, expired, wrong audience, malformed)

**Status**: `401 Unauthorized`

```json
{ "error": "invalid_credential", "message": "The provided credential could not be verified." }
```

### Response — admin web, no matching admin account

**Status**: `403 Forbidden`

```json
{ "error": "unauthorized_admin_account", "message": "No administrator account is associated with this identity." }
```

**Contract rules** (FR-009 through FR-016, FR-043):

- No internal token is ever issued when the credential fails validation, regardless of reason; the error body never includes underlying validation-exception detail — only the generic `invalid_credential` reason.
- `platform: "mobile"`: if no account matches the verified identity, one is created (`isAdmin: false`) and the login succeeds.
- `platform: "admin-web"`: if no account matches, **or** the matched account's `isAdmin` is `false`, the request is rejected with `403` and no account is created and no token is issued — both cases return the *identical* body, so a caller cannot tell "no such identity" from "identity exists but isn't an admin" (FR-043, account-enumeration protection). This is the only case that returns `403` rather than `401` — the credential itself was valid, but the identity is not authorized for this platform.
- A returning identity (same `provider` + Google `sub`) on either platform resolves to the same underlying account — never a duplicate.
- Every attempt (success or failure, and why) is recorded for security audit; the audit record is internal-only and never part of the HTTP response.
