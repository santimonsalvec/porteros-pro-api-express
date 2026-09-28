---

description: "Task list for Device Registration for Push Notifications"
---

# Tasks: Device Registration for Push Notifications

**Input**: Design documents from `/specs/014-fcm-device-registration/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/devices-endpoints.md, quickstart.md

**Tests**: Included, per the repository convention:
- hand-written fakes plus `FixedClock`;
- the repository tested against `tests/fakes/fakeMongoCollection.ts` (or a mocked collection, as in 013's store tests);
- HTTP tests with **`await buildTestApp()`**;
- **no real FCM and no real Google credentials** (FR-016). `GoogleAuth` is mocked with `vi.mock('google-auth-library')`;
- real phones are manual checks (quickstart §4).

**Organization**:
- Phase 2 builds the generic pieces: rules, ports, token hashing, fakes and the Mongo repository.
- The stories then add behavior:
  - US1: register;
  - US2: ownership transfer and unregister;
  - US3: `PushNotifier` and the FCM sender;
  - US4: the TTL cleanup;
  - US6: the test push, which needs US3;
  - US5: the Flutter guide.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no unmet dependency)
- **[Story]**: US1–US6 (spec.md); Setup, Foundational and Polish tasks carry no label

---

## Phase 1: Setup

- [X] T001 Extend `src/infrastructure/config.ts` with:

  ```ts
  config.push = {
    mode: optionalEnv('PUSH_MODE', 'log') as 'log' | 'fcm',
    firebaseProjectId: () => requireEnv('FIREBASE_PROJECT_ID'),
    inactivityDays: Number(optionalEnv('PUSH_DEVICE_INACTIVITY_DAYS', '60')),
    maxDevicesPerUser: Number(optionalEnv('PUSH_MAX_DEVICES_PER_USER', '10')),
    testLimitPerMinute: Number(optionalEnv('PUSH_TEST_LIMIT_PER_MINUTE', '5')),
  }
  ```

  Add `assertPushConfig()`:
  - it throws a clear error when `mode` is not `log`/`fcm`;
  - it throws when `mode === 'fcm'` and `FIREBASE_PROJECT_ID` is missing;
  - it throws when a numeric value is not a positive integer.

  Mirror 013's `assertEventsConfig()`. Add the variables, with comments, to `.env.example` under a "Push notifications (feature 014)" block. Follow the existing helpers' exact names in `config.ts` (`optionalEnv` / `requireEnv` or their equivalents).

---

## Phase 2: Foundational (registry pieces every story uses)

**⚠️ CRITICAL**: blocks every story. It must end green (`npx tsc --noEmit -p .`, `npm test`).

- [X] T002 [P] Create `src/domain/devices/deviceRules.ts` (pure, no imports outside the domain):
  - `type DevicePlatform = 'ios' | 'android'`, and `DEVICE_PLATFORMS`;
  - `normalizeToken(raw: string): string | null`: trims; `null` if empty or longer than 4,096 chars;
  - `interface PushMessage { title: string; body: string; data: Record<string, string> }`;
  - `validatePushMessage(m): { ok: true } | { ok: false; reason: string }`. It checks:
    - `title` is 1–100 chars and `body` 1–500;
    - `data` has ≤ 20 keys, and every value is a string;
    - `data.type` is non-empty;
    - `Buffer.byteLength(JSON.stringify(m)) ≤ 3072`. Use `TextEncoder`, not `Buffer`, to stay runtime-neutral in the domain.

  Add `tests/unit/domain/devices/deviceRules.test.ts`:
  - trim and bounds (0, 1, 4,096, 4,097 chars);
  - each message rule, including a missing `type` and a non-string value;
  - the size limit.
- [X] T003 Create `src/application/features/devices/common/ports.ts`:
  - `Device { token: string; userId: string; platform: DevicePlatform; lastSeenAt: Date }`;
  - `IDeviceRepository`:
    - `upsert(token, userId, platform, now): Promise<{ kind: 'registered' } | { kind: 'refreshed' } | { kind: 'transferred'; previousUserId: string }>`;
    - `trimToLimit(userId, max): Promise<Device[]>` (returns the removed ones);
    - `removeOwned(token, userId): Promise<boolean>`;
    - `removeByTokens(tokens: readonly string[]): Promise<number>`;
    - `findByUserIds(userIds: readonly string[]): Promise<Device[]>`.
  - `PushSendOutcome = 'sent' | 'invalid' | 'failed' | 'fatal'`, and `IPushSender { send(device: Device, message: PushMessage, signal: AbortSignal): Promise<{ outcome: PushSendOutcome; reason?: string }> }`. It never throws.
  - `UserPushResult { reached; removed; failed; noDevice }`, and `PushSendResult { perUser: Record<string, UserPushResult>; totals: { reached; removed; failed; usersWithoutDevice } }`.
  - `IPushNotifier { sendToUsers(userIds: readonly string[], message: PushMessage): Promise<PushSendResult> }`.
  - `IRateLimiter { tryConsume(key, limit, windowSeconds, now): { allowed: true } | { allowed: false; retryAfterSeconds: number } }`.
  - `IDeviceLogger { info(entry, msg); warn(entry, msg); error(entry, msg) }`. The pino `logger` satisfies it, as with 013's `IEventLogger`.
  - `ITokenFingerprint { ref(token: string): string }`, so the application can log `tokenRef` without importing `node:crypto`.

  Re-export `PushMessage` from `deviceRules`.
- [X] T004 [P] Create `src/infrastructure/push/tokenRef.ts`:
  - `tokenHash(token) = sha256 hex`;
  - `tokenRef(token) = tokenHash(token).slice(0, 12)`;
  - `sha256TokenFingerprint: ITokenFingerprint`.

  Add `tests/unit/infrastructure/push/tokenRef.test.ts`: a known vector, the 64/12 lengths, and different tokens give different refs.
- [X] T005 [P] Create the fakes:
  - `tests/fakes/fakeDeviceRepository.ts`: an in-memory map keyed by token, with the same semantics as the Mongo repository (upsert kinds, `trimToLimit` by `lastSeenAt` desc, owner-scoped remove) and `all()` for assertions;
  - `tests/fakes/fakePushSender.ts`: it records `{ token, message }` calls. `setOutcome(token, outcome)` defaults to `sent`. `throwOn(token)` simulates a buggy sender, so the notifier's never-throw guard gets tested;
  - `tests/fakes/fakeRateLimiter.ts`: `allowAll()` / `denyWith(retryAfterSeconds)`.
- [X] T006 Create `src/infrastructure/persistence/mongo/deviceRepository.ts`, with `DEVICES_COLLECTION = 'devices'` and `MongoDeviceRepository implements IDeviceRepository`, built with `(db, inactivityDays)`:
  - `upsert`: the `findOneAndUpdate({ _id: tokenHash(token) }, { $set: { token, userId, platform, lastSeenAt: now }, $setOnInsert: { createdAt: now } }, { upsert: true, returnDocument: 'before' })` of research §3. A `null` before-image means `registered`; the same `userId` means `refreshed`; otherwise `transferred`. An E11000 (code 11000) is retried once.
  - `trimToLimit`: `find({ userId }).sort({ lastSeenAt: -1 }).skip(max)`, then `deleteMany({ _id: { $in } })`; returns the removed devices.
  - `removeOwned`: `deleteOne({ _id: tokenHash(token), userId })` → `deletedCount === 1`.
  - `removeByTokens`: `deleteMany({ _id: { $in: tokens.map(tokenHash) } })`. An empty list makes no call.
  - `findByUserIds`: `find({ userId: { $in } })`. An empty list returns `[]` without a query.
  - `ensureIndexes()`:
    - creates `userId_lastSeen` `{ userId: 1, lastSeenAt: -1 }`;
    - creates the TTL `lastSeen_ttl` `{ lastSeenAt: 1 }` with `expireAfterSeconds = inactivityDays × 86400`;
    - first reads `listIndexes()`. If `lastSeen_ttl` exists with a different `expireAfterSeconds`, it runs `db.command({ collMod: DEVICES_COLLECTION, index: { name: 'lastSeen_ttl', expireAfterSeconds } })` instead of `createIndex`.

  Add `tests/unit/infrastructure/persistence/mongo/deviceRepository.test.ts` on a mocked collection:
  - the filters, update and options of the upsert;
  - the three kinds;
  - the E11000 retry;
  - trim sort, skip and delete;
  - owner-scoped delete;
  - empty-list shortcuts;
  - index creation;
  - the `collMod` path when the TTL differs.

**Checkpoint**: tsc and `npm test` are green.

---

## Phase 3: User Story 1 - A signed-in phone can receive notifications (Priority: P1) 🎯 MVP

**Goal**: `POST /api/devices` stores or refreshes the caller's device and keeps at most 10 per user.

**Independent Test**:
- Register token A (Android) twice: 1 device with a newer `lastSeenAt`.
- Register token B (iOS): 2 devices.
- An 11th device removes the least recently seen.
- An invalid body gives 400; no session gives 401.

- [X] T007 [US1] Create `src/application/features/devices/commands/registerDevice/registerDeviceCommand.ts`:
  - `RegisterDeviceCommand(userId, token, platform) extends ICommand<RegisterDeviceResult>`;
  - `RegisterDeviceResult = { outcome: 'registered' | 'refreshed' | 'transferred' } | { outcome: 'invalid_token' }`.

  Create `registerDeviceCommandHandler.ts`, with deps `{ devices: IDeviceRepository, clock, logger: IDeviceLogger, fingerprint: ITokenFingerprint, maxDevicesPerUser }`:
  1. `normalizeToken`; `null` → `invalid_token`;
  2. `upsert`;
  3. log the outcome: `device_registered`, `device_refreshed`, or `device_transferred` with `previousUserId`. Every entry has `{ userId, platform, tokenRef }` and never the token;
  4. `trimToLimit(userId, max)`, logging `device_removed { reason: 'limit', userId, tokenRef }` for each removed device;
  5. return the outcome.
- [X] T008 [P] [US1] Create `src/controllers/requests/devices/registerDeviceRequest.ts`, the zod schema `{ token: z.string().trim().min(1).max(4096), platform: z.enum(['ios', 'android']) }`. Create `src/controllers/devicesController.ts` with `createDevicesController(deps: { mediator: ISender; verifyAccessToken })`:
  - `router.use(requireAuth(deps.verifyAccessToken))`. No role check and no `requireCompleteProfile` (FR-001).
  - `POST /` parses the body and sends the command. An exhaustive `switch` maps `registered | refreshed | transferred` to `204`, and `invalid_token` to `ApiError(400, 'validation_failed', …)`.

  Mount it in `src/app.ts` with `app.use('/api/devices', createDevicesController(deps))`, next to the other `/api` routes.
- [X] T009 [US1] Wiring:
  - `src/infrastructure/di.ts`: call `assertPushConfig()`; create `MongoDeviceRepository(db, config.push.inactivityDays)` and run `await …ensureIndexes()`; register `RegisterDeviceCommand` with its handler (`logger`, `sha256TokenFingerprint`, `config.push.maxDevicesPerUser`);
  - `tests/http/testAppFactory.ts`: create `deviceRepository = new FakeDeviceRepository()`, register the same handler with max 10, and expose `context.deviceRepository`.
- [X] T010 [P] [US1] Add `tests/unit/application/features/devices/registerDeviceCommandHandler.test.ts`:
  - new → `registered`;
  - same user again → `refreshed`, with `lastSeenAt` updated;
  - blank or 4,097-char token → `invalid_token`, and nothing stored;
  - 11th device → the oldest is removed and logged with `reason: 'limit'`;
  - **no log entry contains the raw token** (serialize the logged entries and assert the token string is absent).
- [X] T011 [P] [US1] Add `tests/http/controllers/devices.test.ts` (register section), signing in with the existing test sign-in helpers (the same ones `internalAuth.test.ts` and the goalkeeper tests use):
  - register → `204` and 1 device in `context.deviceRepository`;
  - again → `204` and still 1;
  - a second token → 2;
  - a user **without a completed profile** can register → `204`;
  - a goalkeeper and an admin can register;
  - missing token, empty token, 4,097 chars or `platform: 'web'` → `400`;
  - no bearer → `401`;
  - 20 concurrent registrations of the same token by the same user → 1 device (SC-003).

**Checkpoint**: devices are registered. Nothing is sent yet.

---

## Phase 4: User Story 2 - A shared phone notifies only the person signed in (Priority: P1)

**Goal**: A token has one owner; it moves on registration by another user, and the owner can remove it with `POST /api/devices/unregister`.

**Independent Test**:
- A registers T, then B registers T: only B has it.
- A unregisters T: `204`, and B still has it.
- B unregisters T: `204`, and nobody has it.
- Repeat: `204`.

- [X] T012 [US2] Create `src/application/features/devices/commands/unregisterDevice/unregisterDeviceCommand.ts`: `UnregisterDeviceCommand(userId, token)`, with result `{ outcome: 'removed' | 'not_found' | 'invalid_token' }`. Create `unregisterDeviceCommandHandler.ts`, with deps `{ devices, logger, fingerprint }`: `normalizeToken`, then `removeOwned`. Log `device_unregistered { userId, tokenRef }` only when removed; `not_found` is not logged.
- [X] T013 [US2] Create `src/controllers/requests/devices/unregisterDeviceRequest.ts` (`{ token }`, same bounds). In `devicesController.ts`, add `POST /unregister`: `removed | not_found` → `204`; `invalid_token` → `400`. Register the handler in `di.ts` and `testAppFactory.ts`.
- [X] T014 [P] [US2] Unit tests:
  - `tests/unit/application/features/devices/unregisterDeviceCommandHandler.test.ts`: own token → `removed`; someone else's → `not_found`, and it still exists; unknown → `not_found`; repeat → `not_found`;
  - extend `registerDeviceCommandHandler.test.ts`: A then B → `transferred`, with `previousUserId = A` in the log, and `findByUserIds([A])` empty.
- [X] T015 [P] [US2] Extend `tests/http/controllers/devices.test.ts` (ownership section):
  - A registers T, B registers T → `204`; `context.deviceRepository.all()` has one T, owned by B;
  - A unregisters T → `204`, and T is still B's;
  - B unregisters T → `204`, and it is gone;
  - B unregisters again → `204`;
  - an invalid body → `400`;
  - no bearer → `401`;
  - 20 concurrent registrations of T split between A and B → exactly 1 document, owned by A or B (SC-003).

**Checkpoint**: SC-002 with fakes.

---

## Phase 5: User Story 3 - The platform reaches a set of users and drops dead devices (Priority: P1)

**Goal**: `IPushNotifier.sendToUsers` works with the real FCM adapter, removes invalid tokens and never throws.

**Independent Test**: A has 2 devices and B has 1. One of A's is `invalid` and B's is `failed`: the result is A `{ reached 1, removed 1 }`, B `{ failed 1 }`; only the invalid token is gone; the sender saw 3 calls.

- [X] T016 [P] [US3] Create `src/application/features/devices/common/runWithConcurrency.ts`: `runWithConcurrency<T, R>(items, limit, worker): Promise<R[]>`. It keeps the order of results and never runs more than `limit` workers at once. Add `tests/unit/application/features/devices/runWithConcurrency.test.ts`: the max in flight is ≤ the limit, the order is preserved, and an empty input works.
- [X] T017 [US3] Create `src/application/features/devices/common/pushNotifier.ts`: `PushNotifier implements IPushNotifier`, with deps `{ devices, sender, logger, fingerprint, concurrency = 10, timeoutMs = 5000 }`. The flow of plan "Implementation notes":
  1. `validatePushMessage`. If invalid, log `push_message_invalid` at `error` and return every user with `noDevice: false` and `failed = the number of their devices`, without sending.
  2. Deduplicate `userIds`, then `findByUserIds`.
  3. `runWithConcurrency` over the devices, calling `sender.send(device, message, AbortSignal.timeout(timeoutMs))`. Once any send returns `fatal`, the remaining **not-yet-started** sends are skipped and counted as `failed`. Log `push_send_fatal` once at `error`.
  4. Log each `failed` as `push_send_failed { userId, tokenRef, reason }` at `warn`.
  5. `removeByTokens(invalid tokens)`, logging `device_removed { reason: 'invalid', userId, tokenRef }` for each.
  6. Build `perUser` (users with 0 devices → `noDevice: true`) and `totals`.

  Wrap everything in a try/catch that logs `push_notifier_failed` and returns an all-failed result (FR-015).
- [X] T018 [P] [US3] Add `tests/unit/application/features/devices/pushNotifier.test.ts`, with `FakeDeviceRepository` and `FakePushSender`:
  - the Independent Test scenario;
  - a user with no device → `noDevice: true`, and it is not an error;
  - duplicated user ids are sent once per device;
  - `fatal` → the rest are skipped and counted `failed`, and nothing is removed for them;
  - an invalid message → 0 sends;
  - a sender that throws → the result is returned and no exception escapes;
  - `findByUserIds` throws → an all-failed result;
  - 50 users × 3 devices → 150 sends, never more than 10 in flight (SC-006 shape);
  - no log entry contains a raw token.
- [X] T019 [P] [US3] Create `src/infrastructure/push/fcmPushSender.ts`: `FcmPushSender implements IPushSender`, built with `(projectId)`.
  - It uses `new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/firebase.messaging'] })`.
  - The URL is `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`.
  - The body is `{ message: { token, notification: { title, body }, data, android: { priority: 'high', notification: { channel_id: 'default' } }, apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default' } } } } }` (research §12).
  - The call is `auth.request({ url, method: 'POST', data, signal, validateStatus: () => true })`.
  - It classifies the response per research §6:
    - read `error.details[]`: the `FcmError` `errorCode`, and `BadRequest.fieldViolations[].field`;
    - 2xx → `sent`;
    - `UNREGISTERED` / 404 → `invalid`;
    - `SENDER_ID_MISMATCH` → `invalid`;
    - `INVALID_ARGUMENT` with the field `message.token` → `invalid`; otherwise `failed`, with reason `invalid_argument`;
    - `THIRD_PARTY_AUTH_ERROR` → `failed`, with reason `apns_auth`;
    - 401/403 `UNAUTHENTICATED` / `PERMISSION_DENIED` → `fatal`;
    - 429/500/503 → `failed`;
    - an exception (network, abort, credentials not found) → `failed`, except a `GoogleAuth` credential-loading error, which is `fatal`.
  - `reason` never includes the token.

  Add `tests/unit/infrastructure/push/fcmPushSender.test.ts` with `vi.mock('google-auth-library')`:
  - the URL, the body shape, the signal passed through;
  - one case per row of the research §6 table;
  - the `INVALID_ARGUMENT` payload-vs-token distinction;
  - an abort → `failed`.
- [X] T020 [P] [US3] Create `src/infrastructure/push/loggingPushSender.ts`: `LoggingPushSender implements IPushSender`, built with `(logger)`. It logs `push_sent { userId, platform, tokenRef, title, dataKeys }` at info and returns `sent`. Add a unit test that it never logs the token.
- [X] T021 [US3] Wiring in `src/infrastructure/di.ts`:
  - the sender by `config.push.mode`: `FcmPushSender(config.push.firebaseProjectId())` or `LoggingPushSender(logger)`;
  - `pushNotifier = new PushNotifier({ devices, sender, logger, fingerprint: sha256TokenFingerprint })`;
  - log `push_mode` at startup, with a warning when `NODE_ENV=production` and the mode is `log`, like 013's `events_mode`.

  Expose `pushNotifier` from the DI result so 015 and 019 can inject it. `tests/http/testAppFactory.ts`: a real `PushNotifier` with `FakePushSender`, with `context.pushSender` exposed.

**Checkpoint**: SC-004 with fakes. The capability 015 and 019 need exists.

---

## Phase 6: User Story 4 - Abandoned devices disappear by themselves (Priority: P2)

**Goal**: The 60-day TTL is in place and follows configuration changes.

**Independent Test**: `ensureIndexes` creates `lastSeen_ttl` with 5,184,000 s; with a different existing value it runs `collMod`; a registration refreshes `lastSeenAt`.

- [X] T022 [US4] Verify T006's TTL behavior end to end in unit tests: the `inactivityDays = 60` → `5184000` mapping, and the `collMod` path; extend `deviceRepository.test.ts` if something is missing. Add an assertion in `registerDeviceCommandHandler.test.ts` that a re-registration of a device last seen 59 days ago moves `lastSeenAt` to now (Story 4, scenario 3). Add the TTL check to the manual list (T030).

**Checkpoint**: FR-017. The real expiry is verified manually (quickstart §4, item 7).

---

## Phase 7: User Story 6 - A signed-in user can check that pushes reach their phone (Priority: P3)

**Goal**: `POST /api/devices/test-push` sends to the caller's own devices, at most 5 per minute.

**Independent Test**:
- With 2 devices: `200 { reached: 2, removed: 0, failed: 0, noDevice: false }`.
- With none: `200 { …, noDevice: true }`.
- The 6th call within a minute: `429` with `Retry-After`.

- [X] T023 [P] [US6] Create `src/infrastructure/push/inMemoryRateLimiter.ts`: `InMemoryRateLimiter implements IRateLimiter`, a fixed window per key (research §10), pruning expired keys on each call. Add `tests/unit/infrastructure/push/inMemoryRateLimiter.test.ts`: 5 allowed, the 6th denied with a correct `retryAfterSeconds`, a reset after the window, and independent keys.
- [X] T024 [US6] Create `src/application/features/devices/commands/sendTestPush/sendTestPushCommand.ts`: `SendTestPushCommand(userId)`, with result `{ outcome: 'sent'; result: UserPushResult } | { outcome: 'rate_limited'; retryAfterSeconds }`. Create `sendTestPushCommandHandler.ts`, with deps `{ notifier: IPushNotifier, limiter: IRateLimiter, clock, limitPerMinute }`:
  1. `tryConsume('test-push:' + userId, limitPerMinute, 60, now)`;
  2. `notifier.sendToUsers([userId], { title: 'PorterosPRO', body: 'Notificación de prueba: tus avisos están funcionando.', data: { type: 'test', sentAt: now.toISOString() } })`;
  3. return `perUser[userId]`.
- [X] T025 [US6] In `devicesController.ts`, add `POST /test-push`:
  - `sent` → `200` with the `UserPushResult`;
  - `rate_limited` → set the `Retry-After` header, then throw `ApiError(429, 'too_many_requests', 'Too many test pushes; try again shortly.', undefined, { retryAfterSeconds })`. Match `ApiError`'s real constructor for `extra`.

  Register the handler in `di.ts` (`InMemoryRateLimiter`, `config.push.testLimitPerMinute`) and in `testAppFactory.ts` (a real `InMemoryRateLimiter` with a `FixedClock`, or `FakeRateLimiter`, whichever the factory's clock supports).
- [X] T026 [P] [US6] Tests:
  - `tests/unit/application/features/devices/sendTestPushCommandHandler.test.ts`: the message content, `data.type = 'test'`, only the caller's id is passed, and the rate-limited path never calls the notifier;
  - extend `tests/http/controllers/devices.test.ts` (test-push section):
    - 2 devices → `200 { reached: 2, … }`, and `context.pushSender` saw only the caller's tokens, never another user's;
    - no devices → `noDevice: true`;
    - `setOutcome(token, 'invalid')` → `removed: 1`, and the device is gone;
    - 6 calls → the 6th is `429` with a `Retry-After` header and `retryAfterSeconds`;
    - no bearer → `401`.

**Checkpoint**: the whole chain can be tested from the app.

---

## Phase 8: User Story 5 - The mobile team knows exactly how to wire the app (Priority: P2)

- [X] T027 [P] [US5] Create `docs/push-notifications.md` (in Spanish, like `docs/events-infrastructure.md`) from quickstart §3 and §5 and the contract's "Push data convention". It must cover:
  - the cloud setup table (FCM API, IAM role, APNs key, env variables);
  - the Flutter packages and `flutterfire configure`;
  - the iOS capabilities and the real-device note;
  - Android 13 permission and the `default` channel;
  - the permission UX and the denied path;
  - registration after sign-in, on each start and on `onTokenRefresh`, waiting for the APNs token on iOS;
  - sign-out order (unregister → `deleteToken` → clear the session);
  - the `onMessage` / `onMessageOpenedApp` / `getInitialMessage` / `onBackgroundMessage` handling, with a routing example by `data['type']`;
  - the data convention table;
  - a debugging section: the test push, and the `PUSH_MODE=fcm` local setup.

  Include short Dart snippets for registration and routing. Link it from `README.md`.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T028 [P] Update `src/infrastructure/openapi/openapiSpec.ts`: tag `Devices`, and the 3 paths from `contracts/devices-endpoints.md`, with request bodies, `204`/`200`/`400`/`401`/`429`, bearer security and the `UserPushResult` schema. Extend or add an OpenAPI assertion in the HTTP tests that the 3 paths exist.
- [X] T029 [P] `README.md`: rows in the environment table for `PUSH_MODE`, `FIREBASE_PROJECT_ID`, `PUSH_DEVICE_INACTIVITY_DAYS`, `PUSH_MAX_DEVICES_PER_USER` and `PUSH_TEST_LIMIT_PER_MINUTE`, plus a deployment paragraph linking `docs/push-notifications.md`, in the same style as the 013 rows.
- [X] T030 [P] Add a "8. Dispositivos y push (spec 014)" section to `_temp_pruebas.md` (repository root, git-ignored, in Spanish), with the quickstart §1, §2 and §4 steps, commands and expected results, in the file's existing format.
- [X] T031 Run `npx tsc --noEmit -p .`, `npm test`, `npm run lint`, `npm run test:http` (10 consecutive runs, 0 failures) and `npm run test:architecture` (no `mongodb`, `google-auth-library` or `node:crypto` imports in application or domain). Fix any failure.
- [ ] T032 Manual, deferred to the end of the roadmap (per `_temp_pruebas.md` §8): the cloud setup, and the real-device checks on iOS and Android (quickstart §4).

---

## Dependencies & Execution Order

- **Phase 1** → **Phase 2** (must end green) → **US1** → **US2** → **US3** → **US4** → **US6** → **US5** → **Polish**.
- US2 extends US1's controller and handler tests.
- US6 needs US3 (`PushNotifier`).
- US4 only verifies what T006 built, so it can run any time after Phase 2.
- US5 (the guide) is independent of the code and can be written in parallel with any phase after Phase 2. It is listed late only because it documents the final endpoint behavior.

### Parallel opportunities

- Phase 2: T002 ∥ T004 ∥ T005 (T005 needs T003's types, so start it after T003); T006 after T003 and T004.
- US1: T008 ∥ T010 after T007; then T009; then T011.
- US2: T014 ∥ T015 after T012 and T013.
- US3: T016 ∥ T019 ∥ T020; then T017; then T018 ∥ T021.
- US6: T023 first; then T024 → T025; then T026.
- Polish: T027 ∥ T028 ∥ T029 ∥ T030.

## Implementation Strategy

1. Phase 1–2: config, rules, ports, repository, green.
2. US1 + US2: the MVP. Devices are registered, move between users and are removed on sign-out.
3. US3: sending with real FCM and invalid-token cleanup. 015 and 019 are unblocked.
4. US4 + US6: TTL verification and the test push. The mobile team can verify end to end.
5. US5 + Polish: the Flutter guide, OpenAPI, README and manual checks list.

## Notes

- The raw token **never** appears in a log line, an audit entry or a URL. Every log uses `tokenRef` from `ITokenFingerprint`.
- Only responses about **the token itself** remove it. A payload error or a credentials error never removes anything.
- `PushNotifier` and `IPushSender` never throw. 015 and 019 call `sendToUsers` without a try/catch.
- No new npm dependency, and no `firebase-admin`: FCM is called over REST with `google-auth-library`.
