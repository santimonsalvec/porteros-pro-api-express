# Contract: Get Client Profile Endpoint

## `GET /api/clients/me`

Returns the authenticated caller's own client profile. Requires a valid internal access token whose `isAdmin` claim is `"false"` (`requireClientOnly`) — the target user is always the token's own subject. Succeeds regardless of whether the caller's profile has been completed yet. Ported unchanged from the source system (`004-get-client-profile/contracts/get-client-profile.md`).

### Request

No body, no query parameters.

### Response — success

**Status**: `200 OK`

```json
{ "firstName": "Jhon", "lastName": "Doe", "email": "jhondoe@gmail.com", "countryCallingCode": "+57", "whatsAppNumber": "300 123 4567", "createdAt": "2024-01-15T09:30:00Z" }
```

| Field | Type | Notes |
|---|---|---|
| `firstName` | `string \| null` | `null` when the profile hasn't been completed yet |
| `lastName` | `string \| null` | `null` when the profile hasn't been completed yet |
| `email` | `string` | Always present; read-only |
| `countryCallingCode` | `string \| null` | `null` when incomplete; a separate field from `whatsAppNumber`, never concatenated |
| `whatsAppNumber` | `string \| null` | `null` when the profile hasn't been completed yet |
| `createdAt` | `string` (ISO 8601) | Always present; the app formats this for display |

### Response — caller is an admin account

**Status**: `403 Forbidden` — no custom body; the `requireClientOnly` middleware rejects the request before the handler runs.

### Response — caller is not signed in

**Status**: `401 Unauthorized` — no custom body; no profile data is present anywhere in this response.

### Response — account no longer exists

**Status**: `404 Not Found`

```json
{ "error": "account_not_found", "message": "This account no longer exists." }
```

**Contract rules** (FR-029 through FR-031, FR-036):

- Only ever returns the caller's own data — the target user id comes solely from the validated JWT's subject claim.
- Never includes any field beyond the five listed above.
- Does not require a completed profile — unlike `PATCH /api/clients/me`, this endpoint carries no `requireCompleteProfile` check.
