# Contract: Device Endpoints and the Push Capability

**Feature**: `014-fcm-device-registration` | **Spec**: [../spec.md](../spec.md)

All three endpoints require a valid access token (`Authorization: Bearer …`). They are open to any role (client, goalkeeper, administrator) and don't require a completed profile. Tokens travel **only in JSON bodies**, never in the URL (research §8). All three appear in the OpenAPI document under the tag `Devices`.

Common error responses, with the existing `{ error, message }` shape:
- `401 unauthorized`: missing, invalid or expired access token;
- `400 validation_failed`: body shape invalid, with `fieldErrors` when available.

---

## `POST /api/devices` — register or refresh this device

**Request**

```json
{ "token": "fcm-registration-token", "platform": "android" }
```

| Field | Rules |
|---|---|
| `token` | string, trimmed, 1–4,096 chars |
| `platform` | `"ios"` or `"android"` |

**Responses**
- `204 No Content`: stored. The same answer for a new device, a refresh (FR-003) and a transfer from another user (FR-006), so no information about other users leaks.
- `400 validation_failed` / `401 unauthorized`.

**Effects**
- Upsert keyed by the token hash; `lastSeenAt = now`; the owner becomes the caller.
- If the caller now has more than `PUSH_MAX_DEVICES_PER_USER` devices, the least recently seen ones are removed.

**When the app calls it**: after sign-in, on every app start with a session, and on every `onTokenRefresh`.

---

## `POST /api/devices/unregister` — forget this device (sign-out)

**Request**

```json
{ "token": "fcm-registration-token" }
```

**Responses**
- `204 No Content`: always, whether the token was the caller's, someone else's, or unknown (FR-008). It is idempotent.
- `400 validation_failed` / `401 unauthorized`.

**Effects**: deletes `{ _id: hash(token), userId: caller }`. Nothing else.

**When the app calls it**: before discarding the session on sign-out. If the access token has expired, the app refreshes it first (`POST /api/auth/tokens/refresh`).

---

## `POST /api/devices/test-push` — send a test push to my devices

**Request**: empty body.

**Responses**
- `200 OK`:

  ```json
  { "reached": 2, "removed": 0, "failed": 0, "noDevice": false }
  ```

  With no device: `{ "reached": 0, "removed": 0, "failed": 0, "noDevice": true }`. It is not an error (Story 6, scenario 2).
- `429 too_many_requests`: more than `PUSH_TEST_LIMIT_PER_MINUTE` calls in the current minute. Includes `retryAfterSeconds` and a `Retry-After` header.
- `401 unauthorized`.

**Push content**:
- `title`: `"PorterosPRO"`;
- `body`: `"Notificación de prueba: tus avisos están funcionando."`;
- `data`: `{ "type": "test", "sentAt": "<ISO-8601>" }`.

---

## Internal capability for later features: `IPushNotifier`

Not an HTTP endpoint. It is injected into the application handlers of 015 and 019.

```ts
interface IPushNotifier {
  /** Never throws (FR-015). Removes tokens the push service reports invalid (FR-012). */
  sendToUsers(userIds: readonly string[], message: PushMessage): Promise<PushSendResult>;
}

interface PushMessage {
  title: string;                  // 1–100 chars
  body: string;                   // 1–500 chars
  data: Record<string, string>;   // must include `type`; ≤ 20 keys; whole message ≤ 3 KB
}
```

An invalid `PushMessage` is a programming error in the calling feature. `sendToUsers` logs it as `push_message_invalid` and returns a result with every device counted as `failed`, without sending anything.

## Push data convention (FR-019)

Every push that 014, 015 and 019 send follows this convention.

| Key | Required | Meaning |
|---|---|---|
| `type` | yes | What happened; the app routes by it. Known values: `test` (014). `booking.available` and `bookings.available` (015) and `request.*` (019) are defined by those features. |
| `bookingId` | when relevant | uuid of the booking to open |
| `requestId` | when relevant | uuid of the request to open |
| `v` | no | Payload version, `"1"` if absent |

All values are strings. An unknown `type` opens the app's home or inbox screen and is logged by the app.
