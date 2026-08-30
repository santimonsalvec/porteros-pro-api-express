# Contract: Internal Access Token Claims

Not an HTTP endpoint — documents the claim set carried by every internal access JWT issued by `POST /api/auth/sso/exchange`, `POST /api/auth/tokens/refresh`, and `POST /api/profile/complete`. Ported unchanged from the source system (`002-google-sso-login`'s original claim set, extended by `003-complete-profile/contracts/profile-status-claim.md`).

| Claim | Type | Notes |
|---|---|---|
| `sub` | `string` | The account's id — the sole source of "who is calling" for every protected capability; never taken from a request body |
| `email` | `string` | The account's email, as of token issuance |
| `isAdmin` | `string` (`"true"` / `"false"`) | String-boolean convention (mirrors the source exactly, to keep claim parsing identical for any client reading raw JWT payloads) |
| `profileComplete` | `string` (`"true"` / `"false"`) | Reflects `User.isProfileComplete` as of the moment the token was issued |

**Contract rules** (FR-012, FR-020, SC-006):

- A client that has just completed `POST /api/profile/complete` sees `profileComplete: "true"` in the token pair that call itself returns — it never needs to call `sso/exchange` or `tokens/refresh` again just to observe the update.
- A client holding an older access token issued before profile completion sees a stale `profileComplete: "false"` claim until that token's natural (short) expiry and next refresh — an accepted, bounded staleness window given access tokens are already short-lived and non-revocable (FR-019).
- The `requireClientOnly` middleware (Express equivalent of the source's `ClientOnly` policy) succeeds when `isAdmin === "false"`; the `requireCompleteProfile` middleware (equivalent of the `CompleteProfile` policy) succeeds when `profileComplete === "true"`. Either failing returns `403 Forbidden` with no custom body, mirroring ASP.NET Core's standard policy-failure response.
