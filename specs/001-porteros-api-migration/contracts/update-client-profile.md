# Contract: Update Client Profile Endpoint

## `PATCH /api/clients/me`

Updates the authenticated caller's first name, last name, and WhatsApp number (with country prefix). Requires a valid internal access token whose `isAdmin` claim is `"false"` **and** whose `profileComplete` claim is `"true"` (`requireClientOnly` stacked with `requireCompleteProfile`) — the target user is always the token's own subject. Email and account creation date can never be changed through this or any other capability. Ported unchanged from the source system (`004-get-client-profile/contracts/update-client-profile.md`).

### Request

```json
{ "firstName": "Jhon", "lastName": "Doe", "countryCode": "CO", "whatsAppNumber": "301 987 6543" }
```

| Field | Required | Notes |
|---|---|---|
| `firstName` | Yes | Non-empty after trimming |
| `lastName` | Yes | Non-empty after trimming |
| `countryCode` | Yes | ISO alpha-2; must exist in country reference data — same validation as `POST /api/profile/complete` |
| `whatsAppNumber` | Yes | 6–14 digits once non-digit characters are stripped, same bounds as `POST /api/profile/complete` |

No `email` field exists on this request — submitting one has no effect.

### Response — success

**Status**: `200 OK` — the caller's refreshed profile, same shape as `get-client-profile.md`'s success response.

### Response — validation failed

**Status**: `400 Bad Request`

```json
{ "error": "validation_failed", "message": "One or more fields are missing or invalid.", "fieldErrors": { "whatsAppNumber": "WhatsApp number must be 6 to 14 digits." } }
```

### Response — country code not recognized

**Status**: `400 Bad Request`

```json
{ "error": "invalid_country_code", "message": "The provided country code is not recognized." }
```

### Response — WhatsApp number already in use by a different account

**Status**: `409 Conflict`

```json
{ "error": "duplicate_phone_number", "message": "This WhatsApp number is already associated with another account." }
```

The caller's own current number is excluded from this check.

### Response — caller is an admin account, or profile isn't complete yet

**Status**: `403 Forbidden` — no custom body; `requireClientOnly` and/or `requireCompleteProfile` reject the request before the handler runs. A caller whose profile isn't complete must use `POST /api/profile/complete` first.

### Response — profile not complete (defense-in-depth path)

**Status**: `409 Conflict`

```json
{ "error": "profile_not_complete", "message": "Complete your profile before updating it." }
```

Under correct middleware configuration this is never reachable over HTTP (`requireCompleteProfile` already returns `403` first); it exists because the handler independently re-checks completion as defense-in-depth, exercised directly in handler-level unit tests.

### Response — caller is not signed in

**Status**: `401 Unauthorized` — no custom body.

### Response — account no longer exists

**Status**: `404 Not Found`

```json
{ "error": "account_not_found", "message": "This account no longer exists." }
```

**Contract rules** (FR-032 through FR-036):

- Applies only to the caller's own account.
- A full replace of `firstName` + `lastName` + `whatsAppNumber`/`countryCallingCode` together in one request — no partial single-field patch shape.
- Never accepts or changes `email` or `createdAt`.
- `countryCode` is resolved server-side to a dial code exactly as `POST /api/profile/complete` does.
