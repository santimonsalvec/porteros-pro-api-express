# Data Model: Device Registration for Push Notifications

**Feature**: `014-fcm-device-registration` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

## New collection: `devices`

Owned and written by this system. One document per push token, whoever owns it.

| Field | Type | Rules |
|---|---|---|
| `_id` | string | `sha256(token)` as 64 lowercase hex chars (research §2). Unique by construction, so a token has at most one owner (FR-006). |
| `token` | string | The push token as the app sent it. 1–4,096 chars (FR-004). Never logged (FR-022). |
| `userId` | string | The owner (`users._id`, uuid). Changes when another user registers the same token (ownership transfer). |
| `platform` | `'ios' \| 'android'` | Updated on every registration (FR-003). |
| `createdAt` | Date | Set on insert only (`$setOnInsert`). Kept across ownership transfers. |
| `lastSeenAt` | Date | Set on every registration. Drives the TTL and the per-user limit. |

**Indexes** (created by `MongoDeviceRepository.ensureIndexes()` at startup):

| Name | Keys | Options | Used by |
|---|---|---|---|
| `_id_` | `{ _id: 1 }` | built in | register (upsert), unregister, invalid-token removal |
| `userId_lastSeen` | `{ userId: 1, lastSeenAt: -1 }` | none | lookups by set of users (FR-010), per-user trim (FR-005) |
| `lastSeen_ttl` | `{ lastSeenAt: 1 }` | `expireAfterSeconds = PUSH_DEVICE_INACTIVITY_DAYS × 86400` (default 60 d) | automatic cleanup (FR-017). Adjusted with `collMod` when the setting changes (research §4). |

**Lifecycle**:

```text
             register (new token)
   (none) ───────────────────────▶ owned by U ──── register by U again ──▶ owned by U (lastSeenAt, platform updated)
                                      │
                                      ├── register by V ─────────────────▶ owned by V (createdAt kept)
                                      ├── unregister by U ───────────────▶ (removed)
                                      ├── push service says invalid ─────▶ (removed)
                                      ├── U registers an 11th device and this is U's oldest ──▶ (removed)
                                      └── lastSeenAt older than 60 d ────▶ (removed by TTL)
```

`unregister` by any user other than the owner matches nothing: the filter is `{ _id: hash, userId: caller }` (FR-008).

## Application types (no persistence)

**`DevicePlatform`**: `'ios' | 'android'`.

**`Device`** (read model returned by the repository): `{ token, userId, platform, lastSeenAt }`. The hash is not exposed to the application; the repository computes it.

**`PushMessage`** (what 015 and 019 send, validated by `deviceRules.validatePushMessage`):

| Field | Rules |
|---|---|
| `title` | 1–100 chars |
| `body` | 1–500 chars |
| `data` | `Record<string, string>` with ≤ 20 keys. `type` is required (research §12). Serialized size ≤ 3 KB together with the title and body. |

**`PushSendOutcome`** (per token, from `IPushSender`): `'sent' | 'invalid' | 'failed' | 'fatal'` (research §6).

**`PushSendResult`** (from `IPushNotifier.sendToUsers`):

```ts
{
  perUser: Record<string, { reached: number; removed: number; failed: number; noDevice: boolean }>;
  totals: { reached: number; removed: number; failed: number; usersWithoutDevice: number };
}
```

`noDevice` is `true` when the user had 0 devices at lookup time. It is not an error (FR-014).

**Rate limit window** (in memory, research §10): key `test-push:{userId}` → `{ windowStart, count }`. It is not persisted.

## Configuration (`config.push`)

| Env var | Default | Meaning |
|---|---|---|
| `PUSH_MODE` | `log` | `log`: log instead of sending. `fcm`: send through FCM HTTP v1. |
| `FIREBASE_PROJECT_ID` | none | Required when `PUSH_MODE=fcm`. Startup fails without it. |
| `PUSH_DEVICE_INACTIVITY_DAYS` | `60` | TTL of unseen devices (clarification 3). |
| `PUSH_MAX_DEVICES_PER_USER` | `10` | FR-005. |
| `PUSH_TEST_LIMIT_PER_MINUTE` | `5` | FR-021. |

Fixed constants (not configuration): send concurrency 10, per-request timeout 5 s (research §7).

## Existing collections

None is changed. `users` is only referenced by `devices.userId`. No foreign-key check is made: the caller's id comes from a verified access token.
