# Implementation Plan: Device Registration for Push Notifications

**Branch**: `014-fcm-device-registration` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/014-fcm-device-registration/spec.md`

## Summary

A new `devices` collection keeps one document per push token. The document is keyed by `sha256(token)`, so a token has one owner at most. It holds the owner, the platform, `createdAt` and `lastSeenAt`.
- **Registering** is one atomic `findOneAndUpdate` upsert. It creates, refreshes or transfers the token in a single write. It then trims the user to their 10 most recently seen devices.
- **Unregistering** deletes only when the caller owns the token, and always answers 204.
- **Automatic cleanup** is a TTL index on `lastSeenAt` (60 days, configurable).

Sending is included (clarification 1):
- `PushNotifier` is an application service that 015 and 019 inject. It looks up the devices of a set of users and sends through the `IPushSender` port, 10 at a time with a 5 s timeout each. It removes the tokens the push service condemns, and returns a per-user result. It never throws.
- `FcmPushSender` calls FCM HTTP v1 over REST with the already-installed `google-auth-library` and the service account's own credentials. That is the same pattern as 013's Pub/Sub publisher, with no `firebase-admin`.
- Errors are classified so that only answers about **the token** remove it.

Three authenticated endpoints under `/api/devices`, with tokens carried in bodies only:
- register;
- unregister;
- a self-only test push, limited to 5 per minute in memory (clarification 2).

`docs/push-notifications.md` documents the cloud setup and the Flutter side, including the push data convention that 015 and 019 follow.

Decisions: [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript ~6.x on Node.js 24 LTS. Unchanged.
**Primary Dependencies**: The existing stack only. FCM HTTP v1 is called over REST with `google-auth-library` (already installed; research §1). No new dependency, and no `firebase-admin`.
**Storage**: MongoDB. One new collection, `devices`:
- `_id` = token hash;
- index `userId_lastSeen`;
- TTL `lastSeen_ttl`, 60 days.

No existing collection changes. See [data-model.md](./data-model.md).
**Testing**: Vitest tiers as in 008–013:
- unit tests for the rules, the handlers, `PushNotifier`, the FCM error classification (with a mocked `GoogleAuth.request`) and the repository (collection mocks);
- HTTP tests of the three endpoints with `FakePushSender` and `FakeDeviceRepository`;
- no real FCM (FR-016).

Manual device checks are in [quickstart.md](./quickstart.md) §4.
**Target Platform**: Firebase App Hosting (Cloud Run, `maxInstances: 1`) plus FCM, delivering through APNs on iOS and directly on Android.
**Project Type**: Single backend web service, plus a documentation guide for the Flutter app.
**Performance Goals**:
- SC-001: registration ≤ 5 s end to end (one write);
- SC-006: 150 sends ≤ 5 s (10 in parallel, about 100 ms each → about 1.5 s).

**Constraints**:
- one owner per token, atomically;
- tokens never logged or put in URLs;
- only token-specific errors remove a token;
- the push capability never throws into callers.

**Scale/Scope**: At most 10 devices per user, and a few thousand users → at most tens of thousands of small documents.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the template. The plan follows the 001–013 discipline:
- **Layering**:
  - domain-level pure rules (`deviceRules`: token, platform, push-message validation);
  - application commands and the `PushNotifier` service, behind the ports `IDeviceRepository`, `IPushSender`, `IRateLimiter` and `IDeviceLogger`;
  - Mongo, `google-auth-library` and pino in infrastructure only. The architecture test keeps them out of application and domain.
- **CQRS**: register, unregister and test push are mediator commands. `PushNotifier` is an injected service, like 013's `EventRelay`.
- **Exhaustive outcome mapping** in the controller.
- **Tests without real resources.**
- **No new dependency.**

Gate: **pass**.

*Post-Phase-1 re-check*: still passes.
- No existing file changes behavior. The only edits to existing code are wiring: `config.ts`, `di.ts`, `appDependencies.ts`, `app.ts`, the OpenAPI document, the README and `.env.example`.

## Project Structure

### Documentation (this feature)

```text
specs/014-fcm-device-registration/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/devices-endpoints.md
├── checklists/requirements.md
└── tasks.md                 # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/devices/
│   └── deviceRules.ts                        # NEW: DevicePlatform, validateToken, validatePushMessage (limits)
│
├── application/features/devices/
│   ├── common/
│   │   ├── ports.ts                          # NEW: IDeviceRepository, IPushSender, IPushNotifier, IRateLimiter, IDeviceLogger
│   │   │                                     #      (the pino logger satisfies it, as in 013), ITokenFingerprint,
│   │   │                                     #      Device, PushMessage, PushSendOutcome, PushSendResult
│   │   ├── pushNotifier.ts                   # NEW: PushNotifier (lookup → pool of 10 → remove invalid → result; never throws)
│   │   └── runWithConcurrency.ts             # NEW: tiny bounded pool
│   └── commands/
│       ├── registerDevice/                   # NEW: command + handler (upsert, trim, log registered|refreshed|transferred)
│       ├── unregisterDevice/                 # NEW: command + handler (owner-scoped delete)
│       └── sendTestPush/                     # NEW: command + handler (rate limit → PushNotifier for [caller])
│
├── infrastructure/
│   ├── push/
│   │   ├── fcmPushSender.ts                  # NEW: FCM HTTP v1 via GoogleAuth; error classification (research §6)
│   │   ├── loggingPushSender.ts              # NEW: PUSH_MODE=log
│   │   ├── inMemoryRateLimiter.ts            # NEW: fixed window (research §10)
│   │   └── tokenRef.ts                       # NEW: sha256(token) → _id and 12-char log fingerprint
│   ├── persistence/mongo/deviceRepository.ts # NEW: upsert (before-image), trimToLimit, removeOwned, removeByTokens,
│   │                                         #      findByUserIds, ensureIndexes (TTL + collMod)
│   ├── openapi/openapiSpec.ts                # MODIFIED: tag Devices, 3 paths
│   ├── config.ts                             # MODIFIED: config.push (mode, firebaseProjectId, inactivityDays, maxDevices, testLimit)
│   └── di.ts                                 # MODIFIED: repository + indexes, sender by mode, notifier, limiter, 3 handlers
├── controllers/
│   ├── devicesController.ts                  # NEW: POST /, /unregister, /test-push (requireAuth only)
│   └── requests/devices/                     # NEW: zod request schemas
├── appDependencies.ts                        # MODIFIED (if the controller needs new deps; mediator + verifyAccessToken exist)
└── app.ts                                    # MODIFIED: mount /api/devices

docs/push-notifications.md                    # NEW: cloud setup + Flutter guide (quickstart §3, §5) + data convention
README.md, .env.example                       # MODIFIED: PUSH_* variables, link to the guide
tests/
├── fakes/fakePushSender.ts, fakeDeviceRepository.ts, fakeRateLimiter.ts   # NEW
├── unit/domain/devices/deviceRules.test.ts
├── unit/application/features/devices/{registerDevice,unregisterDevice,sendTestPush,pushNotifier}.test.ts
├── unit/infrastructure/push/{fcmPushSender,inMemoryRateLimiter,tokenRef}.test.ts
├── unit/infrastructure/persistence/mongo/deviceRepository.test.ts
└── http/controllers/devices.test.ts
```

**Structure Decision**:
- A new `devices` application slice owns everything about push: registry, sending and the test push.
- 015 and 019 depend only on `IPushNotifier` and `PushMessage` from `features/devices/common/ports.ts`.
- Infrastructure adds a `push/` folder, parallel to 013's `events/`.

## Implementation notes

- **Controller mapping**:
  - `registered | refreshed | transferred` → 204;
  - `removed | not_found` → 204;
  - `sent` → 200 with `perUser[caller]` flattened;
  - `rate_limited` → `ApiError(429, 'too_many_requests', …, extra: { retryAfterSeconds })` plus the `Retry-After` header.
- **Validation**: zod in the controller for the shape; `deviceRules` in the handler for business limits, so the same rules protect `PushNotifier`. The token is trimmed before hashing, so the app and the backend hash the same string.
- **Upsert race**: an E11000 on the first upsert is retried once (research §3).
- **Trim after upsert**: `trimToLimit(userId, max)` returns the removed devices, and the handler logs each as `device_removed` / `limit`.
- **`PushNotifier` flow**:
  1. `validatePushMessage`;
  2. `findByUserIds`;
  3. `runWithConcurrency(10)` over the devices, each with `sender.send(device, message, AbortSignal.timeout(5000))`;
  4. on the first `fatal`, the remaining sends are skipped and counted as `failed`;
  5. `removeByTokens(invalidTokens)`;
  6. build the result.

  The whole flow sits inside a try/catch that logs `push_notifier_failed` and returns an all-failed result.
- **`FcmPushSender`**:
  - `auth.request({ url, method: 'POST', data: { message }, signal, validateStatus: () => true })`, so non-2xx responses are classified instead of thrown;
  - network errors and aborts → `failed`.
- **Config**: `PUSH_MODE=fcm` without `FIREBASE_PROJECT_ID` fails at startup, like 013's `pubsub` mode.
- **Indexes**: `ensureIndexes` reads `listIndexes()`. If `lastSeen_ttl` exists with another `expireAfterSeconds`, it runs `db.command({ collMod: 'devices', index: { name, expireAfterSeconds } })`.
- **Test app** (`tests/http/testAppFactory.ts`): exposes `context.deviceRepository` and `context.pushSender` (fakes), like 013's `context.eventPublisher`.

## Complexity Tracking

*No entries.*
