# Contract: SSO Discovery Endpoint

## `GET /api/auth/sso-options?platform={platform}`

Returns the SSO providers available to the calling client and the configuration data needed to start each one. Requires no authentication. `platform` is a required query parameter: `mobile` or `admin-web`. Ported unchanged from the source system (`002-google-sso-login/contracts/sso-options.md`) — same route, same shapes, same status codes (FR-040).

### Response — providers available

**Status**: `200 OK`

```json
{
  "providers": [
    { "provider": "google", "clientId": "1234567890-abc.apps.googleusercontent.com", "scopes": ["openid", "email", "profile"] }
  ]
}
```

### Response — no providers configured for this platform

**Status**: `200 OK`

```json
{ "providers": [] }
```

### Response — missing or unrecognized `platform`

**Status**: `400 Bad Request`

```json
{ "error": "invalid_platform", "message": "The 'platform' query parameter is required and must be one of: mobile, admin-web." }
```

**Contract rules** (FR-007, FR-008):

- `platform` MUST be present and one of the recognized values; any other value or its absence returns `400` rather than silently defaulting.
- The response includes only providers configured for the requested platform; a provider with incomplete/missing configuration is omitted rather than returned partially filled.
- The response body never includes a client secret or any credential — only public, client-safe configuration.
