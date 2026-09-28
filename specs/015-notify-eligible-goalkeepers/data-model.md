# Data Model: Notify Eligible Goalkeepers of Available Matches

**Feature**: `015-notify-eligible-goalkeepers` | **Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

## New collection: `notifications` (the inbox)

Written by this system. One document per message to one user. Generic, so feature 019 adds client types without changes.

| Field | Type | Rules |
|---|---|---|
| `_id` | string (uuid v7) | |
| `userId` | string | Recipient. Every read and write is scoped by it (FR-018). |
| `type` | string | `booking.available` in this feature (an offer). 019 adds `request.*`. |
| `title` | string | As pushed (Spanish). |
| `body` | string | As pushed. |
| `data` | `Record<string,string>` | 014's convention: `type`, `requestId`, `bookingId`. |
| `createdAt` | Date | TTL: removed after 90 days (FR-019). |
| `readAt` | Date \| null | Set by "mark read", "mark all read" and "dismiss". For offers, read means **opened** (FR-016). |
| `requestId` | string | Offers only. |
| `dismissedAt` | Date \| null | Offers only (FR-017). |
| `notifiedAt` | Date \| null | Offers only: when their first push went out. Null means created but not pushed yet (research §4, §6). |
| `reminderCount` | integer | Offers only: reminders that included this offer; at most `maxReminders` (FR-013). |
| `lastRemindedAt` | Date \| null | Offers only. |

**Indexes**:

| Name | Keys | Options | Used by |
|---|---|---|---|
| `user_created` | `{ userId: 1, createdAt: -1 }` | none | inbox list, unread count, read-all |
| `offer_unique` | `{ userId: 1, requestId: 1 }` | unique, `partialFilterExpression: { type: 'booking.available' }` | one offer per goalkeeper and request (FR-005) |
| `created_ttl` | `{ createdAt: 1 }` | `expireAfterSeconds: 7776000` (90 d) | retention |

**Offer lifecycle** (derived, not stored as a status):

```text
created (notifiedAt null) ──first push──▶ notified ──reminder ×≤3──▶ (cap reached: never reminded again)
      │                                        │
      └──────────── read (opened) / dismissed ─┴──▶ never reminded again (stays in the inbox)
"still available" = computed when listing (research §11)
```

## New collection: `offerPushState`

One small document per goalkeeper who was ever pushed an offer.

| Field | Type | Rules |
|---|---|---|
| `_id` | string | The goalkeeper's user id. |
| `lastOfferPushAt` | Date | The last offer push, first, catch-up or reminder. Rounds only push when it is at least `reminderIntervalMinutes` old, claimed atomically (research §6). |

No extra index is needed; lookups are by `_id`.

## Changed collection: `goalkeeperProfiles`

| Field | Type | Rules |
|---|---|---|
| `availableForOffers` | boolean | New. Absent means `true` (FR-024): no migration. Written only by `setAvailableForOffers`. |

New index: `zone_offers` `{ zoneIds: 1, availableForOffers: 1 }` (multikey), for `findOfferCandidates(zoneIds)`, which filters `availableForOffers: { $ne: false }`.

## Changed collection: `bookings`

No shape change. New index: `status_searchEnds` `{ status: 1, searchEndsAt: 1 }`, for `findOpenPending(now, cap)`.

## Domain additions (pure)

- **`GoalkeeperProfile.availableForOffers`**: a constructor parameter defaulting to `true`.
- **`OfferSnapshot`** (`src/domain/bookings/offerEligibility.ts`): `{ goalkeeperId, zoneIds, availableForOffers, suspendedUntil, balance, canSeeOffers, held: Commitment[] }`.
- **`isEligible(snapshot, booking, now)`**: research §1.
- **`offerMessages`** (`src/domain/notifications/offerMessages.ts`): `singleOfferMessage`, `groupedOfferMessage` (research §7).

## Application ports (new or extended)

| Port | Methods |
|---|---|
| `INotificationRepository` (new, `features/notifications`) | `createOfferIfAbsent(entry): Promise<boolean>`; `listForUser(userId, skip, limit)`; `countForUser(userId)`; `countUnread(userId)`; `markRead(id, userId, now): Promise<boolean>`; `markAllRead(userId, now)`; `dismissOffer(id, userId, now): Promise<'dismissed' \| 'not_found' \| 'not_an_offer'>`; `findOffers(userIds, requestIds)`; `markNotified(ids, now)`; `markReminded(ids, now)` |
| `IOfferPushState` (new) | `tryClaim(goalkeeperId, now, intervalMinutes): Promise<boolean>`; `markPushed(goalkeeperIds, now)` |
| `IGoalkeeperProfileRepository` (extended) | `findOfferCandidates(zoneIds)`; `setAvailableForOffers(userId, value): Promise<{ previous: boolean } \| null>` |
| `IWalletRepository` (extended) | `findByGoalkeeperIds(ids): Promise<Wallet[]>` |
| `IBookingRepository` (extended) | `findOpenPending(now, cap)`; `findAssignedToGoalkeepers(ids)` |

## Configuration (`config.offers`)

| Env var | Default | Meaning |
|---|---|---|
| `OFFER_REMINDER_INTERVAL_MINUTES` | `5` | Minimum time between offer pushes to one goalkeeper in rounds (FR-009). |
| `OFFER_MAX_REMINDERS` | `3` | Reminders per offer (FR-013). |

Constant: a round reads at most 2,000 open bookings (research §3).
