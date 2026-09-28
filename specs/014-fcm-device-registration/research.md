# Research: Device Registration for Push Notifications

**Feature**: `014-fcm-device-registration` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

The platform choice comes from the roadmap (`_temp_plan.md` §4.4): Firebase Cloud Messaging, per-token sends, the Cloud Run service identity. The spec leaves these decisions to the plan:
- how the automatic cleanup runs (§4);
- how push-service errors are classified (§6);
- the batching of sends (§7);
- the endpoint paths (§8).

---

## §1 FCM over REST with `google-auth-library`, not `firebase-admin`

**Decision**: Send through the FCM HTTP v1 API:

```text
POST https://fcm.googleapis.com/v1/projects/{projectId}/messages:send
```

It is authenticated with `GoogleAuth` from the already-installed `google-auth-library`, with scope `https://www.googleapis.com/auth/firebase.messaging` and Application Default Credentials: the App Hosting / Cloud Run service account in production, and `gcloud auth application-default login` locally. The adapter is `FcmPushSender` in `src/infrastructure/push/`. It sends one HTTP request per token.

**Rationale**:
- It is the exact pattern of 013's `PubSubEventPublisher`: same library, same credentials, same testing approach.
- No new dependency. `firebase-admin` is large (~20 MB installed, with a gRPC/Firestore dependency tree) for the one call used here.
- HTTP v1 has no multi-token endpoint. `firebase-admin`'s `sendEachForMulticast` itself issues one HTTP v1 request per token. The legacy batch endpoint was shut down in 2024. Nothing is lost.
- No key file: the service account's own identity is used (spec Assumptions).

**Alternatives considered**:
- `firebase-admin`: it is what the roadmap (§4.4) named, but it only adds weight and a second way to obtain credentials. The roadmap's intent, the Firebase backend with the service account, is kept.
- FCM topics: rejected by the roadmap, which chose per-token sends.

## §2 Device document keyed by a hash of the token

**Decision**: Collection `devices`. `_id` is `sha256(token)` in hex, and the token itself is stored in `token`.

**Rationale**:
- **Uniqueness across users** (FR-006) comes for free from `_id`: one document per token, whoever owns it.
- **Fixed-size key**: tokens reach ~160–300 chars today, and the spec allows up to 4,096. `_id` stays 64 chars.
- **Log fingerprint** (FR-022): the first 12 hex chars of the same hash, `tokenRef`. It is non-reversible and lets support correlate log lines with a document.

**Alternatives considered**:
- `_id` uuid plus a unique index on `token`: two indexes instead of one, and a fingerprint still needed.
- Storing only the hash: impossible, because the token is needed to send.

## §3 Register = one atomic upsert that also transfers ownership

**Decision**: Registration runs as follows.

```ts
findOneAndUpdate(
  { _id: hash },
  { $set: { token, userId, platform, lastSeenAt: now }, $setOnInsert: { createdAt: now } },
  { upsert: true, returnDocument: 'before' },
)
```

- The `before` document tells whether the device was new (`null`), refreshed (same `userId`), or transferred (another `userId`). This is for the log (FR-023).
- A concurrent upsert that hits E11000 on `_id` is retried once. The retry is then a plain update.

**Rationale**:
- One document write is atomic in MongoDB, so there is never a moment where two users own the token (FR-006, SC-003).
- It is idempotent (FR-003) and needs no transaction.

**Alternatives considered**: delete-then-insert in a transaction. That is heavier, and it has the same outcome.

## §4 Automatic cleanup = TTL index on `lastSeenAt`

**Decision**: A TTL index `lastSeen_ttl` on `{ lastSeenAt: 1 }`, with `expireAfterSeconds = inactivityDays × 86400`, default 60 days (clarification 3).
- `ensureIndexes` compares the existing index's `expireAfterSeconds` with the configured value. When they differ, it runs `collMod` to change it, so the setting can change without dropping the index.

**Rationale**:
- The TTL monitor runs every ~60 s. That meets SC-005 (within 1 day) with no code.
- Re-registration on app open refreshes `lastSeenAt`, which renews the device (Story 4, scenario 3).

**Alternatives considered**: a scheduled job on 013's sweep. It works, but it is code, a lock and tests for what the database does natively. The sweep stays for rules that need domain logic.

## §5 At most 10 devices per user

**Decision**: After a successful registration, the repository runs `trimToLimit(userId, max)`:
1. find the user's devices sorted by `lastSeenAt` descending;
2. skip `max`;
3. delete the rest, and log each one as `device_removed` with reason `limit`.

**Rationale**:
- It is simple and bounded.
- Two concurrent registrations may briefly leave 11. The next registration trims it, and FR-005's purpose, bounding growth, holds.
- It uses the `userId_lastSeen` index that the lookups need anyway.

**Alternatives considered**: a transaction that counts and deletes. Strict, but not worth a transaction for a soft limit.

## §6 Classifying FCM errors: invalid vs. temporary vs. fatal

**Decision**: The adapter maps each per-token response to one of four outcomes.

| FCM response | Outcome | Effect |
|---|---|---|
| 2xx | `sent` | none |
| 404 `UNREGISTERED` | `invalid` | token removed |
| 403 `SENDER_ID_MISMATCH` | `invalid` | token removed (it belongs to another Firebase project) |
| 400 `INVALID_ARGUMENT` **whose details point at `message.token`** | `invalid` | token removed |
| 400 `INVALID_ARGUMENT` about anything else (our payload) | `failed` (logged as **error**) | kept |
| 429 `QUOTA_EXCEEDED`, 500 `INTERNAL`, 503 `UNAVAILABLE`, timeout, network error | `failed` | kept |
| 401 `THIRD_PARTY_AUTH_ERROR` (APNs key/certificate) | `failed` (logged as **error**) | kept |
| 401 / 403 `PERMISSION_DENIED` on our own credentials | `fatal` | kept; the remaining sends of this call are skipped |

- The FCM error code is read from `error.details[]`, from the entry with `@type` `type.googleapis.com/google.firebase.fcm.v1.FcmError` and its `errorCode`.
- The token check for `INVALID_ARGUMENT` reads `google.rpc.BadRequest.fieldViolations[].field === 'message.token'`.

**Rationale**:
- Only answers that condemn **the token** remove it (FR-012, SC-004).
- A bug in our own payload also returns `INVALID_ARGUMENT`, for every token. Treating that as "invalid" would wipe every device in the database, so it is narrowed to the token field.
- A credentials problem affects every token equally, so trying the rest wastes time and log volume (the "whole request rejected" edge case).

**Alternatives considered**: removing on any 4xx. Too dangerous, for the reason above.

## §7 Sending: bounded parallelism, per-request timeout, never throws

**Decision**: `PushNotifier.sendToUsers(userIds, message)` (application service, §9) works as follows:
1. One `devices` lookup: `userId ∈ userIds`, through the `userId_lastSeen` index.
2. Sends run with a concurrency limit of 10 (a small in-house pool, no dependency). Each request has a 5 s timeout through an `AbortSignal`.
3. The `invalid` tokens are then removed with one `deleteMany({ _id: { $in } })`.
4. It returns `PushSendResult`: `{ perUser: { [userId]: { reached, removed, failed, noDevice } }, totals }`.
5. Any unexpected error, such as a lookup failure, is caught and logged, and turned into a result with every device counted as failed (FR-015).

**Rationale**:
- 50 users × 3 devices = 150 requests. At about 100 ms each, 10 at a time, that is about 1.5 s, which meets SC-006 (≤ 5 s).
- A per-request timeout keeps one slow token from holding the whole call.

**Alternatives considered**:
- Unbounded `Promise.all`: it can hit sockets and quota at scale.
- Sequential sends: 150 × 100 ms = 15 s, which fails SC-006.

## §8 Endpoints: tokens only in the body, never in the URL

**Decision**: Under `/api/devices`, with `requireAuth` only (no role, no complete profile, FR-001):

| Method and path | Purpose | Success |
|---|---|---|
| `POST /api/devices` | register or refresh `{ token, platform }` | `204` |
| `POST /api/devices/unregister` | remove `{ token }` (sign-out) | `204` always (FR-008) |
| `POST /api/devices/test-push` | test push to the caller's devices | `200` with the result, or `429` |

**Rationale**:
- `pino-http` logs every request URL. A token in the path or query (for example `DELETE /api/devices/:token`) would end up in the logs, which violates FR-022.
- `DELETE` with a body is poorly supported by some HTTP clients and proxies, so removal is a `POST` to a sub-resource.
- `204` everywhere keeps registration and removal idempotent, and doesn't reveal whether a token existed (FR-008).

**Alternatives considered**:
- `PUT /api/devices/{hash}`: the app would have to hash the token itself, which is needless coupling.
- Per-role paths (`/api/clients/me/devices`…): devices are role-independent, and administrators need them too.

## §9 Application shape

**Decision**: A new application slice `src/application/features/devices/`:
- **Commands**, through the mediator:
  - `RegisterDeviceCommand`, outcomes `registered | refreshed | transferred`, all mapped to 204;
  - `UnregisterDeviceCommand`, outcome `removed | not_found`, both mapped to 204;
  - `SendTestPushCommand`, outcome `sent (result) | rate_limited`.
- **Ports** (`common/ports.ts`): `IDeviceRepository`, `IPushSender` (one token → `sent | invalid | failed | fatal`), `IRateLimiter`, `IDeviceLogger`.
- **Service** (`common/pushNotifier.ts`): `PushNotifier implements IPushNotifier`. This is what 015 and 019 inject. It is not a mediator request, the same as 013's `EventRelay`, because it is an internal capability, not a use case invoked by a controller.
- **Validation** (`common/deviceRules.ts`, domain-level pure functions): token length, platform enum and the `PushMessage` shape. Data values must be strings, ≤ 20 keys, total payload ≤ 3 KB: the FCM limit is 4 KB, which leaves room for the notification block.

**Rationale**: It follows the 010–013 layering. Only infrastructure touches `mongodb` and `google-auth-library`, and the architecture test enforces it.

## §10 Test push rate limit: in-memory fixed window

**Decision**: An `InMemoryRateLimiter` (infrastructure) implements `IRateLimiter.tryConsume(key, limit, windowSeconds, now)`. It keeps a `Map` of `key → { windowStart, count }`, pruned on each call. Test pushes use the key `test-push:{userId}`, with a limit of 5 per 60 s (FR-021).

**Rationale**:
- The service runs with `maxInstances: 1`.
- A restart, or scale-to-zero, only resets a developer tool's counter. That is harmless, unlike the business state the README forbids keeping in memory.
- If instances grow later, the limit becomes per instance, which is still an acceptable bound for a self-only tool.

**Alternatives considered**: a MongoDB counter with a TTL. It survives restarts, but it is a collection and a write per request for a debug endpoint.

## §11 Local and test modes

**Decision**: `PUSH_MODE` accepts two values.
- `log` (the default): `LoggingPushSender` logs `push_sent` with `tokenRef`, the title and the data keys, and answers `sent`. It needs no Firebase access.
- `fcm`: `FcmPushSender`. It requires `FIREBASE_PROJECT_ID` and fails fast at startup without it, like 013's `pubsub` mode.

Locally, a developer testing on a real phone with the `levanta-la-app` skill sets `PUSH_MODE=fcm` and runs `gcloud auth application-default login`.

Automated tests use `FakePushSender`, which is scriptable per token (`sent`, `invalid`, `failed`, `fatal`), and `FakeDeviceRepository` (FR-016). There is no real FCM.

## §12 Push data convention (FR-019)

**Decision**: Every push carries a `data` map of strings:
- `type` (required): what happened, which also names the destination screen. Examples: `test`; `booking.available` (015); `request.goalkeeper_assigned` (019).
- The ids the screen needs, as separate keys: `bookingId`, `requestId`.
- Optionally `v: "1"` for future changes.

The app routes by `type`, and ignores and logs unknown types, opening the home or inbox screen instead. The title and body are also sent in the `notification` block, so the operating system shows the push when the app is in the background or closed.

Platform blocks:
- Android: `android.priority = "high"`, `android.notification.channel_id = "default"`;
- iOS: `apns.headers['apns-priority'] = "10"`, `apns.payload.aps.sound = "default"`.

**Rationale**: `onMessageOpenedApp` and `getInitialMessage` in Flutter only expose `data`, so routing needs to live there. Strings only, because FCM requires string values in `data`.

## §13 What is logged (FR-022, FR-023)

**Decision**: Pino structured entries, never the token, only `tokenRef` (§2):
- `device_registered`, `device_refreshed`, `device_transferred` (with `previousUserId`);
- `device_unregistered`;
- `device_removed` with `reason: 'invalid' | 'limit'`;
- `push_send_failed` (with `userId`, `tokenRef`, `reason`);
- `push_send_fatal`.

TTL removals are done by MongoDB and are not logged individually. That is acceptable: they are by definition devices nobody has used in 60 days.
