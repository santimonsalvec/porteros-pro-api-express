# Quickstart: Migración del Backend PorterosPRO a Express + TypeScript

## Prerequisites

- Node.js 24 (Active LTS)
- A reachable MongoDB instance — a MongoDB Atlas cluster (or any other MongoDB deployment) already provisioned with the `users`, `refreshTokens`, `termsAcceptances`, and `Countries` collections. Docker is **not** required for anything in this project — the app always talks to a real MongoDB endpoint via `MONGODB_CONNECTION_STRING`, and the automated test suite never touches a real database at all (see Clarifications session 2026-08-30 in spec.md; the repository test tier mocks the MongoDB driver instead).
- A Google Cloud project with OAuth 2.0 client IDs for each platform you want to test (Web client ID for the admin web, mobile client ID(s) for the mobile app) — the same ones the existing `.NET` backend already uses

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `MONGODB_CONNECTION_STRING` | Yes | MongoDB connection string backing `users`, `refreshTokens`, `termsAcceptances`, `Countries` — a local `mongodb://` URI or an Atlas `mongodb+srv://` URI both work |
| `JWT_SIGNING_KEY` | Yes | Symmetric key used to sign and validate internal access tokens (32+ random bytes; never commit it) |
| `GOOGLE_CLIENT_ID_MOBILE` | Yes, to test the mobile flow | Google OAuth client ID(s) accepted as `aud` for `platform=mobile` credentials |
| `GOOGLE_CLIENT_ID_WEB` | Yes, to test the admin web flow | Google OAuth client ID accepted as `aud` for `platform=admin-web` credentials |
| `JWT_ACCESS_TOKEN_LIFETIME_MINUTES` | No (default `15`) | Access token lifetime |
| `JWT_REFRESH_TOKEN_LIFETIME_DAYS` | No (default `30`) | Refresh token lifetime |
| `LEGAL_TERMS_VERSION` | No (default `"1.0"`) | Terms & Conditions version recorded on acceptance |
| `LEGAL_PRIVACY_POLICY_VERSION` | No (default `"1.0"`) | Privacy Policy version recorded on acceptance |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | OTLP trace collector endpoint; falls back to console export when unset |
| `PORT` | No (default `3000`) | HTTP port the Express server listens on |

Locally, copy these into an untracked `.env` file (loaded via `dotenv` in development only — never in production, and never committed).

## Install & run

```bash
npm install
npm run dev        # tsx watch src/server.ts — hot-reload dev server
# or, for a production-like run:
npm run build       # tsc -> dist/
npm start            # node dist/server.js
```

## Try the discovery endpoint

```bash
curl -s "http://localhost:3000/api/auth/sso-options?platform=mobile" | jq
curl -s "http://localhost:3000/api/auth/sso-options?platform=admin-web" | jq
curl -i "http://localhost:3000/api/auth/sso-options"                    # 400 — missing platform
curl -i "http://localhost:3000/api/auth/sso-options?platform=desktop"   # 400 — unrecognized platform
```

## Try the exchange endpoint (requires a real Google ID token)

Obtain a real Google ID token the same way as when developing against the source `.NET` backend (a minimal Google Identity Services test page, or the mobile app's own Sign-In SDK in a dev build). Then:

```bash
curl -s -X POST http://localhost:3000/api/auth/sso/exchange \
  -H "Content-Type: application/json" \
  -d '{"provider":"google","platform":"mobile","credential":"<paste-id-token-here>"}' | jq
```

Expect `200 OK` with `accessToken`, `refreshToken`, and `expiresInSeconds` on first sign-in (a new account is created for `mobile`). Re-running with a fresh token for the same Google account returns a token pair for the *same* underlying account (no duplicate).

For `platform=admin-web`, the exchange returns `403 Forbidden` unless an account with `isAdmin: true` and a matching `externalIdentities` entry already exists — provision one directly in MongoDB for testing:

```js
// mongosh
use porterospro
db.users.insertOne({
  email: "admin@example.com",
  isAdmin: true,
  isProfileComplete: false,
  externalIdentities: [{ provider: "google", subject: "<the-google-sub-claim-from-the-id-token>", email: "admin@example.com" }],
  createdAt: new Date()
})
```

## Try the refresh, complete-profile, and client-profile endpoints

```bash
# Renew a session
curl -s -X POST http://localhost:3000/api/auth/tokens/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refreshToken-from-the-exchange-response>"}' | jq

# Complete a mobile account's mandatory profile
curl -s -X POST http://localhost:3000/api/profile/complete \
  -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{"firstName":"Jhon","lastName":"Doe","countryCode":"CO","whatsAppNumber":"300 123 4567","acceptedTerms":true}' | jq

# View / update the client's own profile
curl -s http://localhost:3000/api/clients/me -H "Authorization: Bearer <accessToken>" | jq
curl -s -X PATCH http://localhost:3000/api/clients/me \
  -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{"firstName":"Jhon","lastName":"Doe","countryCode":"CO","whatsAppNumber":"301 987 6543"}' | jq
```

## Verify the protected diagnostic endpoint, country catalog, and health

```bash
curl -i http://localhost:3000/api/auth/me                                                # 401 — no token
curl -s http://localhost:3000/api/auth/me -H "Authorization: Bearer <accessToken>" | jq   # 200 — your claims
curl -s http://localhost:3000/api/locations/countries | jq                                # 200 — no auth required
curl -s http://localhost:3000/health | jq                                                 # 200 while Mongo is reachable
```

## Run the test suite (no real resource — see Clarifications session 2026-08-30)

```bash
npm run test              # Vitest — unit tests (handlers, mediator; hand-written fakes, no real network/DB)
npm run test:http         # Vitest + supertest — HTTP-level endpoint tests against the assembled Express app, fake-backed
npm run test:all          # everything above, plus repository-layer tests (mocked MongoDB driver) and the architecture/layering check
```

No Docker, containers, or a real database are ever required to run the test suite — repository-layer tests under `tests/unit/infrastructure/persistence/mongo/` mock the MongoDB driver's `Collection`/`Db` directly instead of exercising a real one.

All tests must pass, and `npm run build` must complete with zero TypeScript errors (SC-002).
