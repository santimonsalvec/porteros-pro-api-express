# Feature Specification: Client Cancels Bookings

**Feature Branch**: `017-client-cancel-booking`
**Created**: 2026-09-28
**Status**: Draft
**Input**: User description: "Spec 017 de _temp_plan.md" — "El cliente cancela porteros. Requisitos: (1) El cliente puede cancelar una reserva individual (p. ej. un amigo cubrirá uno de los arcos) o la solicitud completa. (2) Una reserva sin portero se puede cancelar en cualquier momento, sin costo. (3) Una reserva con portero asignado se puede cancelar hasta inicio − plazo de cancelación gratuita (configurable, hoy 60 min): se devuelve la comisión al portero (movimiento tipificado con el detalle: quién canceló, cuándo, motivo), el portero recibe aviso (push y bandeja) y el partido sale de su agenda. (4) Dentro del plazo (última hora), cancelar una reserva asignada se rechaza con un mensaje claro: el cliente debe usar al portero o, en todo caso, pagarle. (5) La cancelación es idempotente y atómica frente a una aceptación simultánea: si un portero acepta mientras el cliente cancela, el resultado es coherente (o queda cancelada con devolución, o queda asignada y la cancelación se evalúa con las reglas de reserva asignada). (6) Emite los eventos correspondientes."

**Context**: Step 017 of the goalkeeper-guarantee roadmap (repository-root `_temp_plan.md`, §2.5). It builds on:
- 010: the request with one booking per goalkeeper, and its free-cancellation period fixed at quote time;
- 011: the wallet and its typed refund;
- 012: acceptance, which charges the commission;
- 013: events;
- 014 and 015: push and inbox;
- 016: the `cancelled` status, the shared refund (one per booking whatever path refunds it) and the goalkeeper's "match cancelled" notice.

Until now a client who no longer needs a goalkeeper has no way to say so: the goalkeeper shows up, or the request lingers as "searching".

## Clarifications

### Session 2026-09-28

- Q: Cancelling the whole request in the last hour when a goalkeeper is already assigned? → A: Refused as a whole; nothing changes. "Cancel the request" means "the match is off", which is no longer possible with a goalkeeper on the way. The answer tells the client which booking can't be cancelled, and that the goalkeeper must be used or paid. A booking still searching can be cancelled on its own.
- Q: How does the goalkeeper's agenda show a match the client cancelled? → A: It stays in the agenda with status "cancelled", like 016's "cancel all" cancellations: one rule for every cancellation, and the goalkeeper sees what happened. It no longer blocks their schedule.
- Q: In a "cancel all" request, what happens when the client cancels one of its bookings themselves? → A: That booking stops counting: the "cancel all" evaluation (016) only looks at the bookings the client still wants. Example: of 2 goalkeepers, the client cancels one; at start − 60 only the other is evaluated, and it's kept if assigned.

## User Scenarios & Testing *(mandatory)*

The users are the **client**, who changes plans, and the **goalkeeper** who had taken the match, who gets their commission back and is told the match is off.

### User Story 1 - The client cancels a booking nobody has taken yet (Priority: P1)

A client whose friend will cover one goal, or who no longer needs a goalkeeper, cancels a booking that is still searching. It's free and allowed at any time while it's searching. The booking stops being offered to goalkeepers immediately.

**Why this priority**: It's the simplest and most common cancellation. Without it, goalkeepers keep receiving offers for a match nobody needs, which wastes their attention and the platform's credibility.

**Independent Test**:
- A client with a 2-goalkeeper request cancels one pending booking: it becomes cancelled, it disappears from goalkeepers' available matches and offers, the other booking keeps searching, and no money moves.
- Cancelling it again answers the same, with nothing new.

**Acceptance Scenarios**:

1. **Given** a pending booking of the client's request, **When** the client cancels it, **Then** it becomes cancelled (by the client, when, optional reason), and a "booking cancelled" event is recorded.
2. **Given** that cancellation, **Then** the booking no longer appears in any goalkeeper's available matches, offers or reminders.
3. **Given** the same cancellation repeated, **Then** it answers the same result and changes nothing more.
4. **Given** a booking of another client's request, or an unknown one, **Then** the answer is "not found", and nothing changes.
5. **Given** a booking that already expired, or was already cancelled by the system, **Then** it can't be cancelled, and the answer says why.

---

### User Story 2 - The client cancels a taken booking in time, and the goalkeeper is refunded and told (Priority: P1)

A booking a goalkeeper has taken can be cancelled by the client **until start − free-cancellation period** (60 minutes by default; the value fixed on the request when quoted). Then:
- the goalkeeper gets their **commission refunded**: a typed refund with who cancelled (the client), when and why;
- the goalkeeper gets a **notice** (push and inbox): "El cliente canceló tu partido en Bello · … Te devolvimos 7.000 COP";
- the match no longer counts in the goalkeeper's schedule.

**Inside the last period** (the last hour by default), cancelling a taken booking is **refused** with a clear message: the goalkeeper is on their way, so the client must use them or pay them anyway, outside the app.

**Why this priority**: This is the fairness rule both sides rely on. The client can change plans with enough notice, and the goalkeeper is never left out of pocket or surprised at the last minute.

**Independent Test**:
- A goalkeeper takes a booking; the client cancels it 2 hours before: cancelled, the goalkeeper's balance returns to what it was, one notice to the goalkeeper.
- Another taken booking, the client tries 45 minutes before: refused with the "last hour" reason; nothing changes.

**Acceptance Scenarios**:

1. **Given** an assigned booking, **When** the client cancels it before start − free-cancellation period, **Then** it becomes cancelled (by the client), the goalkeeper gets exactly one refund of the commission they paid, with the details, and a "booking cancelled" event is recorded.
2. **Given** that cancellation, **Then** the goalkeeper receives one notice with the match and the refunded amount.
3. **Given** an assigned booking, **When** the client tries to cancel it at or after start − free-cancellation period, **Then** it's refused with a reason that says the goalkeeper must be used or paid, and the deadline that passed. Nothing changes.
4. **Given** a goalkeeper accepts at the same moment the client cancels a pending booking, **Then** the outcome is coherent. Either the cancellation wins (cancelled, and the acceptance is refused with nothing charged), or the acceptance wins (assigned), and then the cancellation is judged by the assigned-booking rules: refunded if in time, refused if inside the last period.
5. **Given** the client repeats the cancellation, **Then** there is no second refund and no second notice.

---

### User Story 3 - The client cancels the whole request (Priority: P1)

The client can cancel the **whole request** in one action. Each of its bookings follows the rules above: pending ones are cancelled for free, and assigned ones are cancelled with a refund if in time.

When the request has an **assigned booking inside the last period**, cancelling the whole request is **refused as a whole** and nothing changes (clarification 1). The answer names the booking that can't be cancelled and says the goalkeeper must be used or paid. The client can still cancel any booking that is still searching on its own (Story 1).

**Why this priority**: The most common real case is "the match is off". Making the client cancel booking by booking, and understand the rules for each, is error-prone.

**Independent Test**:
- A 2-goalkeeper request with one booking taken and one searching, 2 hours before: cancelling the request cancels both, refunds the goalkeeper once and notifies them.
- The same request 45 minutes before the start: refused as a whole, and both bookings stay as they were.
- The request shows as cancelled, and a new request for the same match is allowed.

**Acceptance Scenarios**:

1. **Given** a request whose bookings can all be cancelled, **When** the client cancels the request, **Then** every pending and assigned booking becomes cancelled, with refunds and notices for the assigned ones, all or nothing.
2. **Given** the request has no pending or assigned booking left after the cancellation, **Then** it stops being active, and the client can create a new request for the same zone and start.
3. **Given** a request with an assigned booking inside the last period, **When** the client cancels the whole request, **Then** it's refused with the "last hour" reason and the deadline. No booking changes, including pending ones.
4. **Given** the request cancellation is repeated, **Then** nothing changes the second time: no refund, no notice.
5. **Given** another client's request, or an unknown one, **Then** the answer is "not found".

---

### Edge Cases

- **"Cancel all" requests and the client's own cancellation**: a booking the client cancels themselves stops counting for 016's "cancel all" evaluation. If the client cancels one booking of a 2-goalkeeper "cancel all" request, the evaluation looks only at the remaining booking: the client chose to need one goalkeeper fewer.
- **The client cancels after the system already acted** (the booking expired, or "cancel all" cancelled it): the booking is already final. The answer says it's no longer cancellable, and nothing changes.
- **The match already started**: a pending booking can't still be pending, since it expired at search end. An assigned one is inside the last period, so it's refused.
- **The goalkeeper's wallet can't be resolved** (configuration gap): the cancellation of that assigned booking is refused with a temporary-error answer and nothing changes, so the client can retry. It's never cancelled without its refund.
- **The refund was already recorded by another path** (for example, "cancel all" raced the client): the shared refund key makes the second path a no-op. Never two refunds.
- **Reason**: the client can add a short optional reason ("un amigo cubre el arco"). It's recorded on the booking and on the refund. It's never shown to the goalkeeper word for word; they get a standard notice.
- **Offers already sent** for a cancelled booking show as "no longer available" in the goalkeepers' inbox, and reminders stop (feature 015).
- **Time zone**: all deadlines come from the request's own start and free-cancellation period, not from the client's phone time.

## Requirements *(mandatory)*

### Functional Requirements

**Cancelling a booking (Stories 1–2)**

- **FR-001**: A client MUST be able to cancel one booking of their own request, with an optional reason (up to 200 characters).
- **FR-002**: A pending booking MUST be cancellable at any time while it is pending, free of charge.
- **FR-003**: An assigned booking MUST be cancellable only strictly before start − the request's free-cancellation period. Then:
  - the goalkeeper gets exactly one refund of the commission charged at acceptance, typed as a commission refund, with the cancellation details (by the client, when, reason);
  - the booking is cancelled.
- **FR-004**: At or after that deadline, cancelling an assigned booking MUST be refused with a specific reason, and the deadline, telling the client the goalkeeper must be used or paid. Nothing changes.
- **FR-005**: Bookings already expired or cancelled MUST NOT be cancellable. The answer says the booking is already final, with its status.
- **FR-006**: A cancelled booking MUST record who cancelled it (the client), when, and the reason, if any.

**Cancelling the request (Story 3)**

- **FR-007**: A client MUST be able to cancel their whole request in one action, applying FR-002 and FR-003 to each booking, all or nothing.
- **FR-008**: If any assigned booking of the request is at or after its deadline (FR-004), cancelling the whole request MUST be refused as a whole, with the "last hour" reason and the deadline, and MUST change nothing (clarification 1).

**Consistency and idempotency (requirement 5)**

- **FR-009**: A cancellation and a concurrent acceptance of the same booking MUST resolve to one coherent outcome (Story 2, scenario 4). A goalkeeper is never left charged for a booking cancelled without a refund.
- **FR-010**: Repeating a cancellation MUST produce the same answer, with no second refund, event or notice.
- **FR-011**: Refunds MUST use the same one-per-booking guarantee as feature 016: whichever path refunds a booking first, no other path refunds it again.

**Effects**

- **FR-012**: Each cancelled booking MUST record exactly one "booking cancelled" event (requirement 6). It carries who cancelled (client), the reason, the goalkeeper if assigned, and the refunded amount.
- **FR-013**: Each goalkeeper whose assigned booking the client cancelled MUST receive one notice (push and inbox) with the match and the refunded amount. The wording says the client cancelled.
- **FR-014**: Cancelled bookings MUST disappear from available matches, offers and reminders, and MUST NOT count for the goalkeeper's schedule clashes.
- **FR-015**: A request left with no pending or assigned booking MUST stop being active (the one-active-request-per-match rule), and its derived status MUST show "cancelled".
- **FR-016**: A booking the client cancelled MUST NOT count as "not assigned" in 016's "cancel all" evaluation (clarification 3). The evaluation considers only the bookings the client still wants. If none remain, there is nothing to evaluate.
- **FR-017**: The goalkeeper's agenda MUST keep showing a client-cancelled match, with status "cancelled", as 016 does for "cancel all" (clarification 2).
- **FR-018**: Only the request's client MUST be able to cancel its bookings or the request. Anyone else, and unknown ids, get "not found" without revealing that it exists.

### Key Entities

- **Booking** (existing): its cancellation now also records `cancelledBy: client` and an optional client **reason**. Its end reason is "client".
- **Commission refund** (existing type): cancellation by the client, when, and the reason.
- **Event** "booking cancelled" (existing type, feature 016): gains the client as author and the client reason.
- **Goalkeeper notice** "match cancelled" (existing type, feature 016): new wording for client cancellations.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A client can cancel a booking or a whole request in one action, and sees the result immediately.
- **SC-002**: 100% of assigned bookings the client cancels in time refund the goalkeeper exactly the commission they paid, once, and notify them once.
- **SC-003**: 0 assigned bookings are cancelled by the client inside the last period.
- **SC-004**: Under concurrent acceptance and cancellation of the same booking (tested with simultaneous requests), 0 cases end with a goalkeeper charged for a booking that is cancelled without a refund.
- **SC-005**: Repeating a cancellation N times produces 1 transition, 1 event, at most 1 refund and at most 1 notice.
- **SC-006**: 0 client-cancelled bookings remain visible to goalkeepers as available or offered after the cancellation.
- **SC-007**: A client whose request was fully cancelled can immediately create a new request for the same zone and start.

## Assumptions

- **The deadline is the request's own**: start − the free-cancellation period fixed when quoted (010), the same instant 016 uses for "cancel all". It's inclusive the same way: at exactly `freeCancellationUntil` it is still free (010's `canCancelFreeAt`).
- **No cost for the client in the app**: the app never charges clients. "Paying the goalkeeper anyway" in the last hour happens outside the app (roadmap §2.2).
- **The goalkeeper's notice** reuses 016's `booking.cancelled` inbox type, with wording that says the client cancelled.
- **Reason**: optional free text up to 200 characters, stored for support. The goalkeeper sees a standard text.
- **Out of scope**:
  - goalkeeper withdrawal and penalties (018);
  - the remaining client notices (019);
  - admin cancellations.
- **Technical decisions left to the plan**:
  - the endpoint paths;
  - how the store transaction mirrors 012's acceptance and 016's "cancel all";
  - how 016's evaluation excludes client-cancelled bookings.
