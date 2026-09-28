# Research: Goalkeeper Withdrawal, Penalties and Suspensions

**Feature**: `018-goalkeeper-withdrawal-penalties` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

The spec leaves these to the plan:
- the endpoints (§1);
- the transaction (§2) and the replacement booking (§3);
- how offers reach goalkeepers who already had an offer for the request (§4);
- where penalties live (§5), the policy (§6) and the configuration (§7);
- the notices (§8), the admin reversal (§9) and how 016 and 017 treat withdrawn bookings (§10).

The clarifications fix three things:
1. every suspension has the same effect (`suspendedUntil`);
2. a reversed withdrawal stops counting toward the weekly limit;
3. a withdrawal before the search end creates a replacement booking automatically.

---

## §1 Endpoints

**Decision**:

| Method and path | Who | Purpose |
|---|---|---|
| `POST /api/goalkeepers/me/bookings/{bookingId}/withdraw` | goalkeeper | Withdraw (body `{ "reason"?: string ≤ 200 }`) |
| `GET /api/goalkeepers/me/withdrawals?page&pageSize` | goalkeeper | Own withdrawals and penalties, newest first |
| `GET /api/admin/goalkeepers/{userId}/withdrawals?page&pageSize` | admin | The same list for any goalkeeper |
| `POST /api/admin/goalkeepers/{userId}/withdrawals/{withdrawalId}/reversal` | admin | Reverse the money and/or lift the suspensions (body `{ refund, liftSuspension, reason }`) |

- The withdraw path sits next to 012's `/me/bookings/{bookingId}/accept`. A `POST` sub-resource, like accept and cancel.
- The withdraw success is `200` with the agenda item (012's `toAgendaItem`, now `goalkeeper_withdrew`) plus a `withdrawal` summary: notice, penalties, `suspendedUntil`, `replacementCreated`.
- The admin endpoints go under the existing `adminController` (`requireAuth` + `requireAdmin`).

**Rationale**: They reuse the routers and answer shapes the apps already have.

## §2 One transaction per withdrawal

**Decision**: `IBookingLifecycleStore.withdraw(args)` in 016's `MongoBookingLifecycleStore`, one `withTransaction`:
1. **Read the booking.**
   - Missing, or never held by this goalkeeper → `not_found`.
   - Already `goalkeeper_withdrew` by this goalkeeper → `replayed` with the stored withdrawal. No write (FR-006).
   - Not `assigned` → `not_withdrawable { status }`.
   - `now ≥ startsAt` → `match_started`.
2. **Mark it withdrawn.** A conditional update `assigned → goalkeeper_withdrew`, with `endedAt`, `endReason: 'goalkeeper_withdrew'`, `cancelledBy: 'goalkeeper'` and `cancellationNote: reason`. `goalkeeperId` is kept, so the agenda still shows it.
3. **Replacement.** If `now < searchEndsAt`, insert the replacement booking (§3).
4. **Penalties.**
   - Read the goalkeeper's incidents in the window, those not forgiven.
   - Apply the policy (§6) with the config the handler resolved (§7).
   - Insert the withdrawal incident with its penalties (§5).
5. **Suspension.** Recompute the suspension end from every penalty in force (§5), and **always** write it to the goalkeeper's profile (`suspendedUntil`, `penaltiesUpdatedAt`).
6. **Events.** Build `goalkeeper.withdrew`, plus `booking.created` for the replacement. `appendEventsInSession`, then 016's `deactivateIfEnded`.

After the commit, the handler relays the events (013) and audits.

**Races**:
- **With a client cancellation, "cancel all" or expiry** (FR-007): each one writes the booking document, so the driver retries the loser. It then reads the winner's status:
  - the client cancelled first → `not_withdrawable { status: 'cancelled' }`;
  - the withdrawal won → the client gets `already_final`.

  Exactly one outcome, never a refund plus a penalty.
- **Between two of the same goalkeeper's withdrawals**: they would otherwise be write-skew on the weekly count. Both always write the same profile document, so one of them retries and counts the other.

**Alternatives considered**: a separate `WithdrawalStore`. Rejected: 016's `refundCommissionInSession`, `deactivateIfEnded` and `LifecycleAbort` live in the lifecycle store, and 021's no-show will be another lifecycle transition.

## §3 The replacement booking (clarification 3)

**Decision**: `Booking.replacementFor(original, id, goalkeeperId, now)`:
- the same `requestId`, `clientId`, `zoneId`, `startsAt`, `endsAt`, `price`, `commission`, `travelBufferMinutes` and `searchEndsAt`;
- `status: 'pending_assignment'`, `createdAt: now`;
- two new fields:
  - `replacesBookingId` = the original's id;
  - `excludedGoalkeeperIds` = the original's excluded ids + the withdrawing goalkeeper. A replacement of a replacement excludes both goalkeepers.

The exclusion is enforced in one place:
- the domain's `isEligible` gets `if (booking.excludedGoalkeeperIds.includes(snapshot.goalkeeperId)) return false`, which covers available matches, offers and reminders (015);
- the accept handler's `classify` refuses it as `not_available`.

The field never changes after creation, so there's no race.

- **Event**: `booking.created`, whose payload gains optional `replacesBookingId`. `goalkeeperCount` is the request's.
- **Response**: the request's bookings (010) include the replacement like any booking. The client's view already counts pending bookings as "searching".

**Rationale**: A normal pending booking inherits 015's offers and reminders, 016's expiry and "cancel all", and 017's client cancellation, all without changes.

## §4 Offers for the replacement

**Problem**: 015 keeps **one offer per goalkeeper and request** (`offer_unique`), and `OfferSender` in `first` mode only pushes offers it just created. A goalkeeper who already got the offer for the original booking, and maybe dismissed it, would never hear about the replacement.

**Decision**: A new send mode, `renew`, used by `NotifyBookingOffersCommand` when the booking has `replacesBookingId`.
- For each eligible goalkeeper, `INotificationRepository.renewOffer(offer, bookingId)`:
  - if an offer for the request exists and doesn't already point at this booking: update it in place (new title, body and data, `createdAt: now`, `readAt`/`dismissedAt`/`notifiedAt: null`, `reminderCount: 0`) and return `true`;
  - if none exists: `createOfferIfAbsent`;
  - otherwise (a redelivery): `false`.
- Pushes follow `first`: only offers this call created or renewed, one push per goalkeeper. Reminders then work as usual (015).

**Alternatives considered**: a second offer entry per request. Rejected: it breaks `offer_unique` and the inbox's one-offer-per-request contract.

## §5 Where withdrawals and penalties live

**Decision**: A new collection **`goalkeeperIncidents`**, one document per incident:
- `kind: 'withdrawal'` (021 adds `'no_show'`), so both count in one query (FR-008);
- `bookingId` is unique per kind;
- the penalties are **embedded** in the incident: each has an `id`, a `kind`, `days`, `startsAt`, `endsAt` and its reversal;
- `forgivenAt` is set by any admin reversal (clarification 2).

**Indexes**:
- `goalkeeper_occurred` (`goalkeeperId, occurredAt desc, _id`) for the history and the window;
- `kind_booking_unique` (`kind, bookingId`, unique).

**Suspension end** (FR-012): the latest `endsAt` among the goalkeeper's penalties that aren't reversed and end after now, or `null`. It's computed by `suspensionEndOf(incidents, now)` in the domain. It's written to `goalkeeperProfiles.suspendedUntil`, the field 012 and 015 already read (clarification 1). Only penalties ending after now matter, so the read is `goalkeeperId` + `penalties.endsAt > now`.

**Rationale**: One document per withdrawal keeps the history, the reversal and the forgiveness together. Embedding penalties avoids a join, since there are at most two per incident.

## §6 The penalty policy (FR-008–FR-011)

**Decision**: A pure domain function, `penaltiesFor(input)` in `src/domain/goalkeepers/penaltyPolicy.ts`:

```text
input:  { occurredAt, late: boolean, recentCount: number /* counted incidents in the window, before this one */, config }
output: Array<{ kind: 'late' | 'weekly_limit'; days; startsAt: occurredAt; endsAt: occurredAt + days }>
```

- `late` (from `noticeMinutes < config.lateNoticeMinutes`) → a `late` penalty of `lateSuspensionDays`.
- `recentCount + 1 ≥ config.weeklyLimit` → a `weekly_limit` penalty of `limitSuspensionDays`.

A 4th or 5th withdrawal in the window is also "at the limit", so it suspends again. That's the rolling-window reading of "the 3rd within any 7 days". **The window**: incidents with `occurredAt > now − windowDays × 24 h` and `forgivenAt: null`, all kinds. **Exactly 2 h** is not late (strict `<`). Feature 021 calls the same function with `late: true`.

## §7 Configuration per country

**Decision**: The country-scope `bookingSettings` document gains an optional `goalkeeperPenalties` object:
- `lateNoticeMinutes` (120);
- `lateSuspensionDays` (3);
- `weeklyLimit` (3);
- `windowDays` (7);
- `limitSuspensionDays` (7).

The values are integers ≥ 1, validated like the other settings. The city scope is not read: penalties are a country policy.

The handler resolves the goalkeeper's country (011's `resolveGoalkeeperWalletContext`: city → region → country) and reads it with `IBookingSettingsRepository.findFor`. A missing object, a missing field, or an unresolvable country → the Colombia defaults (`DEFAULT_GOALKEEPER_PENALTIES`), with a `penalty_config_defaulted` warning. The withdrawal never fails for configuration (spec edge case).

## §8 Notices

**Decision**: A new consumer, `WithdrawalNoticeHandler`, on `goalkeeper.withdrew` (013 subscribers, `runOnce`), in the `bookingLifecycle` slice:
- **Client** (FR-005), inbox type `booking.goalkeeper_withdrew`, dedupe key `withdrawal-client:{bookingId}`:
  - with a replacement: "Tu portero se retiró · Bello · dom 4 oct, 3:00 p. m. Ya estamos buscando otro portero.";
  - without one: "… No alcanzamos a buscar otro portero." (title "Tu portero se retiró").
- **Goalkeeper** (FR-014), only when the event says a suspension was applied: inbox type `goalkeeper.suspended`, dedupe key `withdrawal-suspension:{bookingId}`: "Quedaste suspendido hasta el lun 5 oct, 6:30 p. m. por retirarte de un partido."

Push is sent only when the inbox entry was written, as in 016. The texts go in a new `src/domain/notifications/withdrawalMessages.ts`, using `localWhen` and the match's time zone. The goalkeeper's end date uses the match city's time zone too, the only one the event has, which is the goalkeeper's own city in practice.

**016's `ClientOutcomeNoticeHandler`**:
- ignores withdrawn bookings when computing an outcome, since the replacement stands in their place;
- its dedupe key becomes `request-outcome:{requestId}` for a request without replacements, and `request-outcome:{requestId}:{latestReplacementId}` otherwise. A replacement that expires after an earlier outcome notice still produces its own final notice.

## §9 Admin reversal (FR-017–FR-021)

**Decision**: `ReverseWithdrawalPenaltyCommand { adminId, goalkeeperId, withdrawalId, refund, liftSuspension, reason }`.
- **Validation**:
  - `reason` is trimmed, 3–500 characters;
  - at least one of `refund` or `liftSuspension` is true, else `400 validation_failed`.
- **Owner**: the handler resolves the ledger owner (`resolveGoalkeeperWalletContext`). It's needed for a refund.
- **The transaction**: `IBookingLifecycleStore.reverseWithdrawal(args)`, one `withTransaction`:
  1. Read the incident. It must belong to the goalkeeper, else `not_found`.
  2. `refund` and no `moneyReversal` yet → `refundCommissionInSession` (016) with:
     - cancellation `{ by: 'admin', at, reason }`;
     - the admin as the movement's actor: `commissionRefundDraft` gains an optional `actor`, defaulting to the system;
     - the key `commission_refund:{bookingId}`, so it's once per booking whatever path.

     Record `moneyReversal { by, at, reason, amount, currency }`.
  3. `liftSuspension` → every penalty without a reversal gets `reversal { by, at, reason }`.
  4. Anything changed → set `forgivenAt` (if null), recompute `suspendedUntil` (§5) and write the profile.
  5. Nothing changed → `replayed` (FR-020).
- **Answer**: `200` with the updated withdrawal and the goalkeeper's `suspendedUntil`.
- **Refusals**:
  - `404 withdrawal_not_found`;
  - `404 goalkeeper_not_found`;
  - `422 wallet_not_configured` (as 011's wallet routes), when a refund is asked and the owner can't be resolved;
  - `409 missing_charge`, a data problem.
- **Earlier penalties**: not recomputed (FR-021). Forgiveness only changes later counts.
- **Audit**: `logPenaltyReversal`.

## §10 Effects on 016 and 017

- **"Cancel all"** (016): the evaluation ignores `goalkeeper_withdrew` bookings, just like the client-cancelled ones, in the store and the fake. The replacement is pending, so an incomplete request is cancelled as the client chose (spec edge case).
- **Client cancellation** (017): a withdrawn booking is `already_final`. Cancelling the whole request cancels the pending replacement too. Nothing to change.
- **Request status**: `requestStatusOf` already ignores statuses other than pending, assigned, completed, cancelled and expired. A request whose only booking was withdrawn late (no replacement) is `closed`.

## §11 Domain changes

`Booking`:
- `endReason` gains `'goalkeeper_withdrew'`;
- `cancelledBy` gains `'goalkeeper'`;
- `replacesBookingId: string | null` and `excludedGoalkeeperIds: string[]` (absent in stored documents means `null` and `[]`);
- a new `replacementFor(...)`;
- `withdrawalNoticeMinutes(now)` = `floor((startsAt − now) / 60 000)`.

The reason uses 017's `normalizeCancellationNote` (≤ 200).

## §12 Answers of the withdraw endpoint

| Outcome | HTTP |
|---|---|
| `withdrawn` / `replayed` | `200` with the agenda item and `withdrawal` |
| `not_a_goalkeeper` | `404 goalkeeper_not_found` |
| `not_found` | `404 booking_not_found` |
| `not_withdrawable` | `409 booking_not_withdrawable { status }` |
| `match_started` | `409 match_started { startsAt }` |

Every attempt is audited (`logWithdrawal`), like 012's acceptance.
