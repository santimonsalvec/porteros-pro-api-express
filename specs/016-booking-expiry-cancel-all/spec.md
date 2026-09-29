# Feature Specification: Booking Expiry and "Cancel All" ✅

**Feature Branch**: `016-booking-expiry-cancel-all`
**Created**: 2026-09-28
**Status**: ✅ Implemented — merged into `main` on 2026-09-28. Manual checks deferred to the end of the roadmap (`_temp_pruebas.md`).
**Input**: User description: "Spec 016 de _temp_plan.md" — "Vencimiento de la búsqueda de porteros y aplicación automática de la preferencia del cliente. Requisitos (ejecutados por el barrido programado de la feature 013): (1) A inicio − plazo de cancelación gratuita (configurable, hoy 60 min), en solicitudes con preferencia "cancelar todo": si no todas sus reservas están asignadas, se cancelan todas; a los porteros asignados se les devuelve la comisión (movimiento tipificado con el detalle) y se les avisa; el cliente recibe aviso. Desde ese momento las reservas asignadas quedan firmes. (2) A inicio − margen de traslado (configurable, hoy 30 min), toda reserva todavía sin portero pasa a vencida, deja de aparecer en partidos disponibles y el cliente recibe el aviso "no logramos hallar un portero para tu partido". En solicitudes "quedarme con los confirmados" las reservas asignadas siguen normalmente. (3) Cada transición ocurre exactamente una vez aunque el barrido se ejecute varias veces o en paralelo, y emite su evento."

**Context**: Step 016 of the goalkeeper-guarantee roadmap (repository-root `_temp_plan.md`, §2.4 and §3). It builds on:
- 010: the request with one booking per goalkeeper, and the client's preference chosen before booking, "keep the confirmed goalkeepers" (default) or "cancel all";
- 011: the wallet and its typed refund movement;
- 012: acceptance, which charges the commission;
- 013: the events and the every-minute sweep with its scheduled jobs;
- 014 and 015: push notifications and the inbox.

Until now a booking nobody takes stays "pending" forever, and a "cancel all" preference is stored but never applied. This feature closes the search.

## Clarifications

### Session 2026-09-28

- Q: When is a "cancel all" request evaluated if it was created with less than the free-cancellation period left before its start? → A: It can't be created. "Cancel all" is only offered while the whole free-cancellation period remains. The quote tells the app whether it can be chosen, and confirming a late request with "cancel all" is refused, so the client picks "keep the confirmed goalkeepers". Rationale: a preference that can no longer be applied shouldn't be offered, and late assigned goalkeepers are never cancelled at the last minute.
- Q: Do the client's "expired" and "cancelled by cancel all" notices ship in this feature or wait for 019? → A: Here. 016 sends both to the client (push + inbox), and 019 adds the remaining client notices (goalkeeper assigned, request complete, withdrawal, missing check-in).

## User Scenarios & Testing *(mandatory)*

The users are the **client**, who learns the outcome of their search in time to react, and the **goalkeepers** who had taken a booking of a request that gets cancelled: they get their commission back and are told the match is off.

### User Story 1 - A booking nobody took expires, and the client is told (Priority: P1)

A booking's search ends at start − travel margin (30 minutes by default). If no goalkeeper took it by then, the booking becomes **expired**:
- it disappears from every goalkeeper's available matches and offers;
- no one can accept it any more;
- the client gets a notice, push and inbox: "No logramos hallar un portero para tu partido".

An expired booking costs nobody anything. In a "keep the confirmed goalkeepers" request, the other booking, if it was taken, goes on normally.

**Why this priority**: Without it, the client doesn't know no goalkeeper is coming until the match starts, and the booking stays "searching" forever.

**Independent Test**:
- Create a 2-goalkeeper "keep confirmed" request; one goalkeeper accepts one booking.
- Move time past start − 30 min and run the sweep:
  - the untaken booking is expired, and the taken one is still assigned;
  - the client got one notice;
  - no goalkeeper sees the expired booking;
  - accepting it is refused.
- Run the sweep again: nothing changes and no second notice is sent.

**Acceptance Scenarios**:

1. **Given** a pending booking whose search has ended, **When** the sweep runs, **Then** it becomes expired, exactly once, and an "expired" event is recorded.
2. **Given** an expired booking, **Then** it no longer appears in available matches, offers or reminders, and accepting it is refused as no longer available.
3. **Given** a booking expires, **Then** the client receives one notice (push and inbox) saying no goalkeeper was found for that match, with data to open the request.
4. **Given** a 2-goalkeeper request where both bookings expire in the same sweep, **Then** the client receives **one** notice for the request, not two.
5. **Given** a "keep the confirmed goalkeepers" request with one booking assigned and one expired, **Then** the assigned booking is unaffected: it stays in the goalkeeper's agenda, and no money moves.
6. **Given** a goalkeeper accepts at the same moment the booking expires, **Then** exactly one of the two happens: the booking is assigned and charged, or it is expired and nothing is charged. Never both.
7. **Given** the sweep runs twice at the same time, or again later, **Then** each booking expires once, one event is recorded, and one notice is sent.

---

### User Story 2 - "Cancel all" is applied automatically when the match isn't complete (Priority: P1)

For a request whose client chose **"cancel all"**, the platform checks it at **start − free-cancellation period** (60 minutes by default):
- **Not every booking is assigned** → every booking of the request is **cancelled**:
  - pending bookings are simply cancelled;
  - each assigned goalkeeper gets their **commission refunded** (a typed refund movement: cancelled by the system, when, reason "cancel all");
  - each assigned goalkeeper gets a notice that the match was cancelled and their commission returned;
  - the client gets one notice that the request was cancelled because not all goalkeepers were confirmed.
- **Every booking is assigned** → nothing happens, and from then on the assignments are **firm**: this check never runs again for that request.

**Why this priority**: This is the promise the client relied on when choosing "cancel all" (for example, a match that needs two goalkeepers or none). Refunding the goalkeepers who had paid is what makes the cancellation fair to them.

**Independent Test**:
- Create a 2-goalkeeper "cancel all" request; goalkeeper A accepts one booking.
- Move time to start − 60 min and run the sweep:
  - both bookings are cancelled;
  - A's wallet shows a refund of exactly the charged commission, typed as a system cancellation;
  - A and the client each got one notice.
- Run it again: no second refund and no second notice.

**Acceptance Scenarios**:

1. **Given** a "cancel all" request with at least one booking not assigned at start − free-cancellation period, **When** the sweep runs, **Then** every booking of the request is cancelled, and a "cancelled" event is recorded for each, exactly once.
2. **Given** such a request had assigned bookings, **Then** each assigned goalkeeper gets exactly one refund of the commission they were charged, typed as a commission refund with the details: cancelled by the system, when, and reason "cancel all", plus the booking and request.
3. **Given** the cancellation, **Then** each assigned goalkeeper receives one notice (push and inbox) with the match and the refunded amount, and the match is shown as cancelled in their agenda.
4. **Given** the cancellation, **Then** the client receives one notice for the request.
5. **Given** a "cancel all" request whose bookings are all assigned at evaluation time, **Then** nothing changes, and the request is never evaluated again.
6. **Given** a "keep the confirmed goalkeepers" request, **Then** this evaluation never applies to it.
7. **Given** a goalkeeper accepts the last pending booking at the same moment the evaluation runs, **Then** either the acceptance completes first (all assigned, nothing is cancelled) or the cancellation wins (the acceptance is refused, nothing is charged). Never a charged acceptance on a cancelled request, and never a cancelled request with a goalkeeper charged and not refunded.
8. **Given** the sweep runs twice at the same time, or again later, **Then** each goalkeeper is refunded once, each booking is cancelled once, and each notice is sent once.
9. **Given** a quote for a match that starts in less than the free-cancellation period, **Then** the quote says "cancel all" is not available, and confirming it with "cancel all" is refused with a clear reason, creating nothing. With "keep the confirmed goalkeepers" the confirmation succeeds as before (clarification 1).

---

### User Story 3 - The request shows how it ended (Priority: P2)

The client's request views ("my requests") and the goalkeeper's agenda show the new outcomes:
- a request whose bookings **all expired** shows "no goalkeeper found";
- a request cancelled by "cancel all" shows "cancelled";
- a "keep confirmed" request with one assigned and one expired booking shows as assigned, with the expired booking marked as such.

A request that ended without any goalkeeper (all expired or all cancelled) **no longer blocks** the client from creating a new request for the same zone and start.

**Why this priority**: The notice may be missed; the client and the goalkeepers must be able to see the outcome in the app. Releasing the "one active request per match" rule lets the client try again.

**Independent Test**:
- After the scenarios above, the client's request list shows "no goalkeeper found" and "cancelled" respectively.
- The goalkeeper's agenda shows the cancelled match as cancelled.
- The client can create a new request for the same zone and start.

**Acceptance Scenarios**:

1. **Given** a request whose bookings all expired, **Then** its derived status is "expired" (no goalkeeper found).
2. **Given** a request cancelled by "cancel all", **Then** its derived status is "cancelled".
3. **Given** a request that ended with no assigned booking, **Then** it no longer counts as active for the one-active-request-per-match rule.
4. **Given** a goalkeeper whose booking was cancelled by "cancel all", **Then** their agenda shows it with status "cancelled", and it no longer counts for their schedule clashes.

---

### Edge Cases

- **The sweep is delayed** (the service was asleep): transitions happen at the first sweep after their time, and notices say what happened. A booking whose search ended while the service was down is expired then, not left pending.
- **The search end and the cancel-all time are configured the other way round** (travel margin larger than the free-cancellation period): for a "cancel all" request, bookings may expire before the evaluation. At evaluation, an expired booking counts as "not assigned", so the whole request is cancelled.
- **The match already started** when a transition is processed (a very long outage): the transitions still apply. The notice is still sent, marked with what happened.
- **A goalkeeper who holds a cancelled booking** is free again for that time slot: clashes only count assigned matches.
- **The refund can't be recorded** (wallet not configured for the goalkeeper's country): the cancellation of that request doesn't happen partially. It is retried on the next sweep, and the failure is logged for operations.
- **Offers already sent** for an expired or cancelled booking: they show as "no longer available" in the inbox, and reminders stop, because the booking is no longer takeable (feature 015).
- **Many requests reach their time in the same minute**: all are processed in that sweep, each independently. One request's failure doesn't block the others.
- **The client already cancelled a booking themselves** (feature 017, later): only bookings still pending or assigned are affected by these transitions.

## Requirements *(mandatory)*

### Functional Requirements

**Expiry (Story 1)**

- **FR-001**: A booking still pending when its search ends (start − travel margin) MUST become expired at the first sweep at or after that moment.
- **FR-002**: An expired booking MUST no longer be takeable. It disappears from available matches, offers and reminders, and accepting it is refused as not available.
- **FR-003**: Each expiry MUST record exactly one "booking expired" event. It carries the booking, the request, the client and the zone.
- **FR-004**: The client MUST receive one notice per request per sweep for its bookings that expired in that sweep, not one per booking. It goes to their inbox and as a push: "No logramos hallar un portero para tu partido", with the zone and local start time, and data to open the request.
- **FR-005**: Expiry MUST NOT move money and MUST NOT affect other bookings of the request.

**"Cancel all" (Story 2)**

- **FR-006**: A request with the "cancel all" preference MUST be evaluated once, at the first sweep at or after start − its free-cancellation period (the value fixed on the request when it was quoted).
- **FR-006a**: "Cancel all" MUST only be accepted for requests confirmed before start − free-cancellation period (clarification 1). The quote MUST tell the app whether "cancel all" can be chosen, as a yes/no plus the deadline. A confirmation with "cancel all" after that moment MUST be refused with a specific reason and create nothing. "Keep the confirmed goalkeepers" stays available.
- **FR-007**: If at evaluation any booking of the request is not assigned (pending or expired), every pending and assigned booking of the request MUST be cancelled, with reason "cancel all" and cancelled by the system.
- **FR-008**: Each assigned goalkeeper whose booking is cancelled this way MUST get exactly one commission refund:
  - the amount charged at acceptance;
  - typed as a commission refund;
  - with the cancellation details: by system, when, reason "cancel all";
  - with references to the booking and the request.
- **FR-009**: The cancellation of a request — its bookings' changes, the refunds and the events — MUST be all or nothing. No request is left half-cancelled, and no goalkeeper is refunded without the booking being cancelled, or the reverse.
- **FR-010**: If every booking is assigned at evaluation, nothing changes, and the request MUST be marked as evaluated so it is never evaluated again. From then on its assignments are firm for this rule.
- **FR-011**: Each cancelled booking MUST record exactly one "booking cancelled" event, with the reason and who cancelled.
- **FR-012**: Each assigned goalkeeper of a cancelled request MUST receive one notice (push and inbox) with the match and the refunded amount. The client MUST receive one notice for the request.
- **FR-013**: Requests with "keep the confirmed goalkeepers" MUST never be evaluated by this rule.

**Consistency with acceptance (Stories 1–2)**

- **FR-014**: An acceptance and an expiry, or an acceptance and a "cancel all" evaluation, touching the same booking or request at the same time MUST resolve to exactly one consistent outcome (Story 1 scenario 6, Story 2 scenario 7). A goalkeeper is never charged for a booking that ends cancelled or expired without a refund.

**Idempotency and reliability (requirement 3)**

- **FR-015**: Every transition MUST happen exactly once, even when the sweep runs several times or two sweeps overlap. Repeating a sweep produces no second event, refund or notice.
- **FR-016**: A failure on one request or booking MUST NOT stop the others in the same sweep. It is logged and retried on the next sweep.
- **FR-017**: Each sweep MUST report how many bookings expired, how many requests were cancelled, how many refunds were recorded and how many failed.

**Outcome visibility (Story 3)**

- **FR-018**: The request's derived status MUST distinguish "expired" (no goalkeeper found: all bookings expired) and "cancelled" (cancelled by "cancel all"). A "keep confirmed" request with some bookings assigned and the rest expired keeps showing as assigned.
- **FR-019**: A request that ends with no assigned booking MUST stop counting as active, so the client can create a new request for the same zone and start.
- **FR-020**: The goalkeeper's agenda MUST show a booking cancelled by "cancel all" with status "cancelled". Cancelled bookings MUST NOT count for schedule clashes.

### Key Entities

- **Booking**: gains two reachable statuses, `expired` and `cancelled`. It also records **when** it expired or was cancelled, **by whom** (system) and **why** ("search ended", "cancel all").
- **Request**:
  - gains the moment its "cancel all" evaluation happened, so it runs once;
  - stops being active when it ends with no goalkeeper;
  - its status stays derived from its bookings, with the new "expired" and "cancelled" outcomes.
- **Commission refund** (existing movement type, 011): system cancellation, reason "cancel all", references to the booking and request.
- **Events**: "booking expired" and "booking cancelled", recorded with the change (feature 013).
- **Client and goalkeeper notices**: inbox entries plus pushes (features 014 and 015), with new types for "no goalkeeper found", "request cancelled" and "match cancelled, commission refunded".

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of bookings still pending at their search end are expired within 2 minutes of that moment, while the service is running.
- **SC-002**: 100% of "cancel all" requests not fully assigned at their evaluation time are cancelled within 2 minutes, and every assigned goalkeeper is refunded exactly the commission they paid.
- **SC-003**: Running the sweep N times, or two sweeps at once, over the same requests produces exactly 1 transition, 1 event, 1 refund and 1 notice per item. Verified with 2 simultaneous sweeps over 100 due items.
- **SC-004**: 0 cases, under concurrency tests, of a goalkeeper charged for a booking that ends cancelled or expired without the matching refund.
- **SC-005**: The client receives exactly 1 notice per request outcome: expired, or cancelled.
- **SC-006**: 0 expired or cancelled bookings appear in any goalkeeper's available matches, offers or reminders after the transition.
- **SC-007**: A client can create a new request for the same zone and start right after their previous request ended with no goalkeeper.
- **SC-008**: 0 "cancel all" requests exist whose confirmation happened after their evaluation time.

## Assumptions

- **Runs on the every-minute sweep of feature 013**, as scheduled jobs. Transitions happen at most about a minute after their time, which is acceptable for a 30- and 60-minute threshold.
- **The thresholds are the ones fixed on each request and booking** when quoted (010, 012): the free-cancellation period and the search end. Configuration changes don't move the times of existing requests.
- **Client notices for these two outcomes ship here** (clarification 2; the inbox and push capabilities exist since 014 and 015). Feature 019 adds the remaining client notices: goalkeeper assigned, request complete, withdrawal, missing check-in.
- **Texts are in Spanish**, with times in the city's time zone, like 015.
- **The goalkeeper's agenda keeps cancelled matches visible** with status "cancelled", so the goalkeeper understands why a match disappeared. Feature 017 may refine how client-cancelled matches show.
- **Expired bookings stay expired under "cancel all"**: an expired booking is already final. Only pending and assigned bookings become cancelled.
- **Change to feature 010**: the quote gains "cancel all available" (and until when), and the confirmation gains the "cancel all not available" refusal (clarification 1). The app's booking form hides "cancel all" when it's not available.
- **Out of scope**:
  - client-initiated cancellation (017);
  - goalkeeper withdrawal and penalties (018);
  - check-in and closing (020, 021).
- **Technical decisions left to the plan**:
  - how due bookings and requests are found efficiently (indexes);
  - how the transitions stay exactly-once under overlapping sweeps (conditional updates, transactions);
  - the notice data keys.
