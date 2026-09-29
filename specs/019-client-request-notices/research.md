# Research: Client Request Notices

**Feature**: `019-client-request-notices` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

The spec leaves these to the plan:
- where the contact rule is enforced (§1);
- the assignment and complete notices (§2–§3);
- the contacts-visible sweep (§4);
- the texts (§5) and the reusable notice helper for 020 (§6).

The clarifications fix four things:
1. the "no check-in" notice lives in 020;
2. "complete" replaces "assigned";
3. contacts are hidden both ways until one hour before the match;
4. both sides are told when the contacts appear, or at once for late assignments.

---

## §1 One rule, enforced where the views are built

**Decision**: A pure domain function in `src/domain/bookings/contactVisibility.ts`:
- `contactsVisibleFrom(request) = request.freeCancellationUntil()`, which is start − free-cancellation period (60 min in Colombia);
- `contactsVisibleAt(request, now) = now ≥ contactsVisibleFrom(request)`. It's inclusive, so the contacts show at the same instant free cancellation ends.

It's applied inside the two response builders, so every view obeys it without each handler remembering:
- **Client views**: `toRequestResponse(request, bookings, now, contacts)`, used by the confirmation (010), the requests list (010), the cancellation (017) and the replay.
  - Before `contactsVisibleFrom`, each assigned booking's `goalkeeper` is `null`.
  - The request gains `contactsVisibleFrom` (ISO).
- **Goalkeeper views**: `toAgendaItem(booking, context, client, now)` gains `now`, used by the agenda (012), the acceptance (012) and the withdrawal (018).
  - Before the moment, `client` is `null`.
  - The item gains `clientContactVisibleFrom`.
  - An agenda item whose booking the goalkeeper no longer holds (withdrawn, cancelled) always has `client: null` (spec edge case).

**Alternatives considered**:
- Filtering in each handler: easy to forget in the next feature.
- A separate "contacts" endpoint: the app would need two calls.

## §2 The assignment notice (Stories 1–2)

**Decision**: A new consumer, `ClientAssignmentNoticeHandler`, on `goalkeeper.assigned` (013 subscribers, `runOnce`), in the `bookingLifecycle` slice. For each event:
1. Load the request and its bookings.
2. Skip if any of these holds (FR-008):
   - the booking is no longer `assigned` to `payload.goalkeeperId`;
   - the request is missing;
   - the match already ended (`now ≥ endsAt`).
3. **Complete?** Among the bookings not ended otherwise (`pending_assignment` or `assigned`), none is pending and at least one is assigned (FR-003). This matches the client-visible status `assigned`.
   - **Complete** → a `request.complete` notice with dedupe key `request-complete:{requestId}`, or `request-complete:{requestId}:{latestReplacementId}` when the request has replacements (FR-004; the same rule as 018's outcome key, now a shared helper `completionRound(bookings)`).
   - **Not complete** → a `booking.goalkeeper_assigned` notice with dedupe key `goalkeeper-assigned:{bookingId}`.
4. **Contacts in the notice** (FR-005, clarification 4): only when the booking was assigned at or after `contactsVisibleFrom`, meaning it was taken in the last hour.
   - For "complete", it lists the contacts of the bookings assigned in the last hour.
   - Bookings assigned earlier are revealed by the sweep (§4).
   - The test uses `assignedAt`, not the processing time, so a late-processed event and the sweep never disagree.

**Concurrency**: two acceptances processed at once may both see the request complete. They share the "complete" dedupe key, so only one inbox entry is written and only its writer pushes (016's pattern).

## §3 Texts of the replacement case

**Decision**: The "assigned" notice for a booking with `replacesBookingId` says "Encontramos otro portero para tu partido …" (FR-002). The "complete" notice doesn't distinguish replacements, since the request is simply complete again.

## §4 The contacts-visible sweep (Story 4)

**Decision**: A new scheduled job, `ContactsRevealJob` (`contacts-reveal`, 013's `IScheduledJob`). It's registered in the sweep's `jobs` list after `offer-reminders`.

1. **Select**: `requestRepository.findDueForContactsReveal(now, cap)`. The query is:
   - `active: true`;
   - `contactsRevealedAt: null`;
   - `startsAt > now` and `startsAt ≤ now + 1 day` (the lookahead, like 016's "cancel all");

   and then filtered in code by `now ≥ contactsVisibleFrom(request)`. New index: `contactsReveal_due` `{ contactsRevealedAt: 1, startsAt: 1 }`.
2. **Per request**, the bookings `assigned` with `assignedAt < contactsVisibleFrom`:
   - **Client**: one `request.contacts_visible` notice listing those goalkeepers' contacts. Dedupe key `contacts-visible:{requestId}`.
   - **Each goalkeeper**: one `booking.client_contact_visible` notice with the client's contact. Dedupe key `client-contact-visible:{bookingId}`.
   - No such bookings → nothing is sent (FR-015, scenario 4).
3. **Then** `markContactsRevealed(requestId, now)`, a conditional `$set` where `contactsRevealedAt` is null.

The notices are written **before** the mark, and each is idempotent by its dedupe key. So a crash between the two only repeats a no-op on the next run (FR-017). A run after the start finds nothing (`startsAt > now`). A request that stops being active (all ended) is never selected.

**Why a sweep and not an event**: the moment is time-driven. The sweep runs every minute (013), which meets SC-007 (within 2 minutes).

## §5 Messages

A new `src/domain/notifications/assignmentMessages.ts` (Spanish, `where(match)` and `localWhen` from 016/015):

| Type | For | Text |
|---|---|---|
| `booking.goalkeeper_assigned` | client | "Un portero tomó tu partido en Bello · dom 4 oct, 3:00 p. m. Seguimos buscando el otro." A replacement says "Encontramos otro portero para tu partido …". In the last hour, it adds "Es Juan Pérez · WhatsApp +57 300 …". |
| `request.complete` | client | "¡Listo! Tus 2 porteros están confirmados para el partido en … Verás sus datos 1 hora antes." With 1 goalkeeper: "Tu portero está confirmado …". In the last hour, it lists names and WhatsApp instead of "Verás…". |
| `request.contacts_visible` | client | Title "Tus porteros". Body: "Para el partido en … : Juan Pérez · WhatsApp +57 300 …; Pedro Gómez · WhatsApp …" (with 1 goalkeeper, "Tu portero para el partido … es …"). |
| `booking.client_contact_visible` | goalkeeper | "Tu cliente para el partido en … es Ana Ruiz · WhatsApp +57 310 …" |

- A name falls back to "Tu portero" / "Tu cliente" when missing, and a missing WhatsApp is omitted.
- Push `data` holds strings only (014): `type`, `requestId`, `bookingId` (none for the request-level ones).

## §6 A reusable "notify a user once" helper (FR-010)

**Decision**: Extract the inbox-then-push step that 016's and 018's handlers repeat into `notifyOnce(deps, { userId, message, dedupeKey })` (`src/application/features/bookingLifecycle/common/notifyOnce.ts`):
- `createIfAbsent` with the dedupe key;
- if created, `sendToUsers`;
- it returns whether it sent.

The new handler and the sweep use it, and 018's `WithdrawalNoticeHandler` is switched to it. Feature 020 will call it for its "no check-in" notice. 016's handlers are left as they are, since changing them brings no benefit.

## §7 What changes for existing features

- **010 / 017 client answers**: `goalkeeper: null` before the moment, plus the new `contactsVisibleFrom`. Existing HTTP tests that expected a contact right after acceptance move their clock into the last hour, or expect `null`.
- **012 goalkeeper answers** (agenda, acceptance): the same with `client` and `clientContactVisibleFrom`.
- **018 withdrawal answer**: already `client: null`; it gains `clientContactVisibleFrom`.
- **The sweep report** (013 internal endpoint) lists the new job. Its HTTP test expectation is updated.
