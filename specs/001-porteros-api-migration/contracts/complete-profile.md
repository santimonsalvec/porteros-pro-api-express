# Contract: Complete Profile Endpoint

## `POST /api/profile/complete`

Submits the required profile fields and terms acceptance for the authenticated user. Requires a valid internal access token (`requireAuth`) — the target user is always the token's own subject, never client-specified. Ported unchanged from the source system (`003-complete-profile/contracts/complete-profile.md`).

### Request

```json
{ "firstName": "Jhon", "lastName": "Doe", "countryCode": "CO", "whatsAppNumber": "300 123 4567", "acceptedTerms": true }
```

| Field | Required | Notes |
|---|---|---|
| `firstName` | Yes | Non-empty after trimming |
| `lastName` | Yes | Non-empty after trimming |
| `countryCode` | Yes | ISO alpha-2 (e.g. `"CO"`); must exist in the country reference data |
| `whatsAppNumber` | Yes | 6–14 digits once non-digit characters are stripped |
| `acceptedTerms` | Yes | Must be `true` |

### Response — success

**Status**: `200 OK`

Same shape as `sso-exchange.md` / `token-refresh.md` — a freshly issued token pair whose access token now carries `profileComplete: "true"` (see `token-claims.md`).

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

### Response — WhatsApp number already in use

**Status**: `409 Conflict`

```json
{ "error": "duplicate_phone_number", "message": "This WhatsApp number is already associated with another account." }
```

### Response — profile already complete

**Status**: `409 Conflict`

```json
{ "error": "profile_already_complete", "message": "This account's profile has already been completed; no changes were made." }
```

**Contract rules** (FR-020 through FR-028, FR-043):

- Only ever accepted for a caller whose profile is currently incomplete; any non-success outcome leaves the stored profile untouched.
- `profile_already_complete` reads identically whether the account is genuinely already complete or does not exist at all — never a distinguishing detail (FR-043).
- On success, exactly one terms-acceptance record is created; on every non-success outcome, none is created.
- `countryCode` is resolved server-side to a dial code via country reference data — the client never submits a dial code directly.
- The response never includes an `email` field — this endpoint neither returns nor accepts it; email remains sourced solely from the Google identity captured at account creation.
