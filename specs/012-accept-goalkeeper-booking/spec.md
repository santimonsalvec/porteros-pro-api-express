# Feature Specification: Goalkeepers See Available Matches and Accept One ✅

**Feature Branch**: `012-accept-goalkeeper-booking`
**Created**: 2026-09-27
**Status**: ✅ Implemented — merged into `main` on 2026-09-28. Manual checks deferred to the end of the roadmap (`_temp_pruebas.md`).
**Input**: User description: "El portero ve los partidos disponibles y acepta uno. Cada reserva es de 1 portero (feature 010) y la plataforma cobra una comisión al aceptar (feature 011). Requisitos: (1) Endpoint paginado de partidos disponibles para el portero: reservas pendientes de asignación en las zonas que tiene habilitadas, cuya búsqueda no ha terminado (termina a inicio − margen de traslado, configurable, hoy 30 min), cuya comisión puede pagar, que no le generan choque de horario, y que no son de una solicitud suya como cliente. Si está suspendido o no tiene fondos suficientes (regla de la feature 011), no ve ninguno. (2) Aceptar una reserva, de forma atómica e idempotente: asigna al portero, cobra la comisión en la billetera en la misma operación y deja la reserva asignada. Si varios porteros aceptan a la vez la misma reserva, solo uno la obtiene y los demás reciben un rechazo claro. Si el mismo portero repite la aceptación, no se cobra dos veces. (3) Regla de choque de horario con margen de traslado, como política de dominio pura y reutilizable: dos partidos A y B chocan si A.inicio < B.fin + margen y B.inicio < A.fin + margen (fin = inicio + duración). Un portero no puede aceptar un partido que choque con otro que ya aceptó, aunque acepte los dos al mismo tiempo desde dos dispositivos. Un portero tampoco puede aceptar dos reservas de la misma solicitud. (4) Tras la asignación, el portero ve el nombre y el WhatsApp del cliente, y el cliente ve el nombre y el WhatsApp del portero en su solicitud; ningún otro dato personal. (5) Endpoint de la agenda del portero: sus reservas asignadas, próximas y pasadas. (6) Auditoría de cada aceptación y rechazo."

**Context**: Step 012 of the goalkeeper-guarantee roadmap (repository-root `_temp_plan.md`, sections 2.3, 2.7 and 2.10). It builds on:
- feature 010: one booking per goalkeeper, grouped in a request;
- feature 011: the goalkeeper's wallet, the commission and the funds rules.

## Clarifications

### Session 2026-09-27

- Q: Which commission is charged when a goalkeeper accepts a booking? → A: The commission is fixed when the quote is issued (resolved for the quote's zone, like the price and the free-cancellation period) and respected until the end of the flow: it travels with the request and each booking, it is what the goalkeeper sees in the list, what is charged at acceptance and what a later refund returns. Later changes to the commission configuration never affect existing quotes, requests or bookings.
- Q: What happens when a client quotes in a zone with no commission configured at any level? → A: The quote is refused as "service not configured" with `missing` including `commission` (like missing rates or settings), and a warning is logged. No request or booking can exist without a commission.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A goalkeeper sees the matches they can take (Priority: P1)

An active goalkeeper opens "Partidos disponibles" and sees, one page at a time and soonest first, the bookings they can actually take. That means bookings that are all of the following:
- still waiting for a goalkeeper;
- in a zone the goalkeeper has enabled;
- whose search has not ended yet;
- whose commission they can pay;
- that don't clash with a match they already accepted;
- that don't belong to a request they made themselves as a client.

For each one they see where and when (zone, city, local start, duration), what they will earn (the booking price the client pays them) and the commission the platform will charge. They do **not** see who the client is until they accept.

**Why this priority**: A goalkeeper can't take a match they can't find. Showing only takeable matches avoids frustrating refusals at the moment of accepting.

**Independent Test**: With bookings in enabled and non-enabled zones, some ending their search soon, one clashing with an accepted match, one from the goalkeeper's own request and one with an unaffordable commission, the list shows exactly the takeable ones, soonest first.

**Acceptance Scenarios**:

1. **Given** a goalkeeper with zones Norte and Sur enabled and enough balance, **When** pending bookings exist in Norte, Sur and Centro, **Then** only those of Norte and Sur are listed.
2. **Given** a booking starting at 20:00 with a 30-minute travel margin, **When** the goalkeeper lists at 19:29, **Then** it is listed; at 19:30 or later it is not (the search has ended).
3. **Given** the goalkeeper already accepted a 90-minute match at 18:00 (it ends at 19:30), **When** a booking starts at 19:45 (inside the 30-minute margin after 19:30), **Then** it is not listed. A booking at 20:00 or later is listed.
4. **Given** a balance of 8.000 and zones whose commissions are 7.000 and 9.000, **Then** only bookings of the 7.000 zone are listed.
5. **Given** a balance below the lowest commission of their zones, or an active suspension, **Then** the list is empty. The answer says why (insufficient funds with the missing amount, or suspended until when), so the app can explain it.
6. **Given** a pending booking of a request created by the goalkeeper themselves, as a client, **Then** it is not listed.
7. **Given** the goalkeeper already holds one booking of a 2-goalkeeper request, **Then** the other booking of that request is not listed.

---

### User Story 2 - Accepting a match assigns it and charges the commission, all or nothing (Priority: P1)

The goalkeeper taps "Aceptar" on a match. In one indivisible step:
- the booking becomes **assigned** to them;
- the platform's commission for that booking's zone is **charged** to their wallet.

Either both happen or neither does. The booking is immediately gone from other goalkeepers' lists. The client's request reflects the new state (partially assigned or assigned).

**Why this priority**: It is the core of the guarantee: a match gets a goalkeeper, and the platform earns its commission. An assignment without a charge, or a charge without an assignment, is unacceptable.

**Independent Test**: Accept a pending booking with enough balance. Verify that:
- the booking is assigned to the goalkeeper with the acceptance time;
- exactly one commission charge of the zone's amount is recorded, referencing the booking and request;
- the balance dropped by that amount;
- the request's status moved to partially assigned or assigned.

**Acceptance Scenarios**:

1. **Given** a pending booking with a commission of 7.000 and a goalkeeper with 20.000, **When** they accept, **Then** the booking is assigned to them, their balance becomes 13.000, and the charge references the booking and the request.
2. **Given** the same goalkeeper accepts the same booking again (a double tap or a retry), **Then** they get the same assignment back and are **not** charged again.
3. **Given** two goalkeepers accept the same booking at the same moment, **Then** exactly one gets it and is charged; the other receives "already taken" and is not charged.
4. **Given** the assignment cannot be completed for any reason (for example, the service stops midway), **Then** neither the assignment nor the charge exists, and the booking is still available.
5. **Given** a 2-goalkeeper request where one booking gets assigned, **Then** the request shows "partially assigned". When the second is assigned, it shows "assigned".

---

### User Story 3 - A goalkeeper can never hold two matches they can't physically reach (Priority: P1)

A goalkeeper cannot accept a match that clashes with one they already hold, counting the time needed to travel between pitches. Two matches A and B clash when A starts before B ends plus the travel margin **and** B starts before A ends plus the travel margin. This holds even if the goalkeeper accepts two clashing matches at the same moment from two devices. A goalkeeper also cannot take two bookings of the same request (the same match).

**Why this priority**: A goalkeeper who can't arrive breaks the guarantee for the client. The clash rule is the real protection; the list (Story 1) only filters.

**Independent Test**: With a travel margin of 30 minutes, a goalkeeper holding a 90-minute match at 18:00:
- cannot accept one at 19:45 (clash);
- can accept one at 20:00 (no clash);
- accepting two clashing matches at the same instant yields exactly one success.

**Acceptance Scenarios**:

1. **Given** an accepted match 18:00–19:30 and a travel margin of 30 minutes, **When** the goalkeeper accepts a match at 19:45, **Then** it is refused as "schedule conflict", nothing is charged, and the booking stays available to others.
2. **Given** the same accepted match, **When** they accept a match starting at 20:00, **Then** it is accepted (19:30 + 30 = 20:00: no clash).
3. **Given** an accepted match at 20:00, **When** they accept a match that ends at 19:40 (starts 18:10, 90 min), **Then** it is refused (it ends inside the margin before 20:00).
4. **Given** two clashing pending bookings, **When** the same goalkeeper accepts both at the same instant, **Then** exactly one succeeds and the other is refused as a conflict, with exactly one charge.
5. **Given** a 2-goalkeeper request, **When** a goalkeeper who holds one of its bookings tries to accept the other, **Then** it is refused.

---

### User Story 4 - Refusals are clear and change nothing (Priority: P1)

When a goalkeeper cannot accept a booking, they get a specific reason and nothing changes: no assignment, no charge, and no change to the booking. The reasons are:
- **already taken** — another goalkeeper got it;
- **search ended** — too close to the start;
- **not in your zones**;
- **insufficient funds** — together with how much is missing;
- **suspended** — together with until when;
- **schedule conflict**;
- **own request**;
- **same match**;
- **not available** — the booking was cancelled or expired, or doesn't exist.

**Why this priority**: The app must tell the goalkeeper exactly what to do next: recharge, wait for the suspension to end, or look for another match.

**Independent Test**: Trigger each reason once and verify the distinct answer, that no charge exists, and that the booking is unchanged.

**Acceptance Scenarios**:

1. **Given** each refusal cause listed above, **When** the goalkeeper accepts, **Then** they receive that cause's specific reason, and no movement or assignment is recorded.
2. **Given** a booking that does not exist, or whose identifier is malformed, **Then** the answer is "not available", the same as for a cancelled or expired one.
3. **Given** a user who is not an active goalkeeper, **Then** the request is refused before anything else.

---

### User Story 5 - Both sides can contact each other after the assignment (Priority: P2)

Once a booking is assigned, the goalkeeper sees the **client's name and WhatsApp number** for that match, and the client sees the **goalkeeper's name and WhatsApp number** on that booking of their request. No other personal data is shared, and nothing is shared before the assignment.

**Why this priority**: They must coordinate at the pitch (arrival, payment). It depends on Stories 2–3 and is simple, so it ranks just after them.

**Independent Test**: After an assignment:
- the goalkeeper's agenda item shows the client's name and WhatsApp;
- the client's "Mis reservas" shows the goalkeeper's name and WhatsApp on that booking;
- before the assignment, neither is shown;
- no email, document or photo is exposed.

**Acceptance Scenarios**:

1. **Given** an assigned booking, **When** the client lists their requests, **Then** that booking shows the goalkeeper's first name, last name and WhatsApp number (with country calling code). Unassigned bookings show no goalkeeper.
2. **Given** an assigned booking, **When** the goalkeeper views it in their agenda, **Then** they see the client's first name, last name and WhatsApp number.
3. **Given** available matches that aren't accepted yet, **When** listed, **Then** no client identity is shown.

---

### User Story 6 - The goalkeeper's agenda (Priority: P2)

The goalkeeper has an agenda with the bookings assigned to them, one page at a time:
- upcoming matches first (soonest first), then past ones (most recent first);
- for each one, the match details, what they earn, the commission charged and the client's contact.

**Why this priority**: After accepting, the goalkeeper needs to know where and when to go and whom to call. It ranks after acceptance itself.

**Independent Test**: A goalkeeper with 2 upcoming and 1 past assigned booking sees them in the order soonest upcoming → later upcoming → past, with totals and client contact. Another goalkeeper's bookings never appear.

**Acceptance Scenarios**:

1. **Given** assigned bookings tomorrow, in 5 days and 3 days ago, **When** the goalkeeper views the agenda, **Then** they appear in that order, with their details and the client's contact.
2. **Given** no assigned bookings, **Then** the agenda is empty, not an error.
3. **Given** pagination values out of range, **Then** the answer is "invalid input" naming the parameter, as in the other paginated lists.

---

### Edge Cases

- **Accepting exactly at the end of the search** (start − travel margin): refused as "search ended". The search is open strictly before that instant.
- **Commission configuration changed after the quote**: irrelevant for existing bookings. Each booking carries the commission fixed when its quote was issued, and that is what is listed and charged. The funds check is repeated at acceptance against that same amount.
- **Balance drops between listing and accepting** (for example, another accepted match or a penalty): the acceptance is refused as "insufficient funds" if the balance no longer covers the commission.
- **Zone disabled by the goalkeeper between listing and accepting**: refused as "not in your zones".
- **A clashing accepted match ends in a cancelled or withdrawn state later**: it no longer counts for clashes. Only bookings currently assigned to the goalkeeper count.
- **A goalkeeper is also the client of a request**: never listed and never acceptable, even if everything else matches.
- **Travel margin not configured**: 30 minutes is used and a warning is logged (same approach as the free-cancellation period in 010).
- **Commission not configured when quoting**: the quote is refused as "service not configured" (missing: commission), so no request or booking can exist without a commission. This extends feature 007/010's quote rules.

## Requirements *(mandatory)*

### Functional Requirements

**Available matches**

- **FR-001**: An active goalkeeper MUST be able to list available bookings, paginated (same page and page-size conventions as the other lists: default 20, maximum 50, with totals), soonest start first, with a deterministic tie-breaker. A booking is available to the goalkeeper when **all** of these hold:
  - (a) it is pending assignment;
  - (b) its zone is among the goalkeeper's enabled zones;
  - (c) its search has not ended: now < start − travel margin;
  - (d) the goalkeeper can afford the booking's fixed commission (feature 011, rule b);
  - (e) it does not clash with any booking currently assigned to the goalkeeper (FR-008);
  - (f) its request was not created by the goalkeeper as a client;
  - (g) the goalkeeper holds no other booking of the same request.
- **FR-002**: When the goalkeeper cannot see offers at all, the list MUST be empty and MUST state the reason. The goalkeeper cannot see offers when:
  - their balance is below the lowest commission of their enabled zones (feature 011, rule a) → reason "insufficient funds", with the missing amount;
  - they are suspended → reason "suspended", with the end of the suspension.
- **FR-003**: Each available item MUST show:
  - the booking and request identifiers;
  - the match details (zone and city with their current names, local start time and time zone, duration);
  - the number of goalkeepers the request asked for;
  - what the goalkeeper earns (the booking price: rate + surcharge);
  - the commission that will be charged (the booking's fixed commission).

  It MUST NOT show any client identity.

**Acceptance**

- **FR-004**: An active goalkeeper MUST be able to accept an available booking. Acceptance MUST, as one indivisible operation:
  - (a) mark the booking as assigned to the goalkeeper, recording when;
  - (b) charge the booking's fixed commission (set when the quote was issued) to the goalkeeper's wallet, through the feature 011 ledger, referencing the booking and request.

  Either both happen or neither does.
- **FR-005**: Acceptance MUST re-check every condition of FR-001 at the moment of accepting, plus "not suspended" and "funds cover the commission". When any condition fails, it MUST refuse with its distinct reason: already taken, search ended, not in your zones, insufficient funds (with the missing amount), suspended (with the end of the suspension), schedule conflict, own request, same match, not available. A refusal MUST NOT record anything.
- **FR-006**: When several goalkeepers accept the same booking at the same moment, exactly one MUST obtain it and be charged. The others MUST receive "already taken" and not be charged.
- **FR-007**: Repeating the acceptance of a booking already assigned to the same goalkeeper MUST return the existing assignment, MUST NOT charge again, and MUST indicate that it already existed.

**Schedule clashes**

- **FR-008**: The clash rule MUST be a single reusable rule: bookings A and B clash when `A.start < B.end + margin` **and** `B.start < A.end + margin`, where `end = start + duration` and margin = the travel margin. Only bookings currently **assigned** to the goalkeeper count.
- **FR-009**: The clash rule and the one-booking-per-request rule MUST hold even when the same goalkeeper accepts several bookings at the same moment: at most one of a set of mutually clashing bookings, or of the same request, can end up assigned to them.
- **FR-010**: The travel margin MUST be configurable per country with an optional per-city override (booking settings, like the free-cancellation period). Initial value for Colombia: 30 minutes. When neither level defines it, the system MUST use 30 minutes and log a warning naming the city.

**Suspension**

- **FR-011**: A goalkeeper MAY carry a "suspended until" instant. While now is before it, they see no offers (FR-002) and cannot accept (FR-005). How suspensions are applied (penalties) belongs to feature 018; this feature only honors them.

**Contact sharing**

- **FR-012**: After assignment, the client's view of the request (the "Mis reservas" list and the confirmation replay) MUST show, on each assigned booking, the goalkeeper's first name, last name and WhatsApp number (with country calling code), and nothing else about the goalkeeper. Unassigned bookings show no goalkeeper.
- **FR-013**: After assignment, the goalkeeper's view of that booking (agenda, acceptance answer) MUST show the client's first name, last name and WhatsApp number, and nothing else about the client.

**Agenda**

- **FR-014**: An active goalkeeper MUST be able to list the bookings assigned to them, paginated:
  - upcoming (start ≥ now) soonest first, then past most recent first, with a deterministic tie-breaker;
  - each item has the match details with current names, what they earn, the commission charged for it, the booking's status and the client's contact (FR-013).

  Another goalkeeper's bookings MUST never appear.

**Audit and access**

- **FR-015**: Every acceptance, idempotent replay and refusal MUST be written to the audit log with the goalkeeper, the booking, the request (when known) and the outcome.
- **FR-016**: Only active goalkeepers (with an existing goalkeeper profile) MAY list available matches, accept, or view the agenda. The goalkeeper is always taken from the session.
- **FR-017**: Issuing a quote MUST resolve the commission of the quote's zone (zone → anchor city → country, feature 011) and store it with the quote. It is then copied to the request and to each booking at confirmation. When no commission is configured, the quote MUST be refused as "service not configured", with `commission` among the missing settings, and a warning MUST be logged. The quote response to the client does not show the commission.

### Key Entities

- **Booking** (extended from 010): gains its **fixed commission** (copied from the quote through the request), the assigned goalkeeper and the assignment time. It moves from pending assignment to assigned in this feature.
- **Quote** (extended from 008/010): gains the commission resolved for its zone when issued. A quote cannot be issued when no commission is configured.
- **Request** (from 010): its derived status now reflects assignments (searching → partially assigned → assigned).
- **Booking settings** (extended): gain the travel margin, per country with a per-city override.
- **Goalkeeper profile** (extended): gains an optional "suspended until" instant, read here and written by feature 018.
- **Commission charge** (feature 011 movement): recorded in the same operation as the assignment, for the booking's fixed commission.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a test of 100 goalkeepers accepting the same booking simultaneously, repeated 50 times, exactly 1 assignment and exactly 1 commission charge exist per booking in 100% of runs.
- **SC-002**: In a test where one goalkeeper accepts 2 to 5 mutually clashing bookings simultaneously, repeated 50 times, exactly 1 is assigned to them, with exactly 1 charge, in 100% of runs.
- **SC-003**: 0 assignments exist without their commission charge, and 0 commission charges exist without their assignment, including when the operation is interrupted at any point.
- **SC-004**: 100% of refusals carry the correct specific reason, and 0 refusals change a booking or a wallet.
- **SC-005**: A goalkeeper sees their first page of available matches in under 1 second in 95% of requests, with up to 500 pending bookings in their zones.
- **SC-006**: 0 client identities appear in available-match lists, and 0 goalkeeper identities appear on unassigned bookings.

## Assumptions

- **Scope**:
  - In scope: listing, accepting, the clash rule, contact sharing after assignment, the agenda, suspension honoring and the travel-margin setting.
  - Out of scope: notifications to goalkeepers (feature 015) or clients (feature 019); expirations and "cancel all" (016); cancellation by the client (017); withdrawal and penalties, including setting suspensions (018); check-in (020).
- **The commission is fixed at quote time** (confirmed in Clarifications). It is resolved with feature 011's zone → anchor city → country rule, stored on the quote, copied to the request and each booking, and charged unchanged at acceptance. Refunds return exactly the charged amount (feature 011).
- **What the goalkeeper earns** is the booking price (rate + surcharge per goalkeeper), which the client pays the goalkeeper directly. The commission is shown separately so the goalkeeper sees their net.
- **Travel margin default**: 30 minutes, with a warning when unconfigured (roadmap decision, mirrors the free-cancellation default).
- **Search end = start − travel margin** (roadmap section 2.3). Acceptance is allowed strictly before it.
- **Only currently assigned bookings count for clashes**: cancelled, expired, withdrawn or completed bookings do not.
- **Contact data** comes from the user's completed profile (first name, last name, country calling code and WhatsApp number), already required to book or to be a goalkeeper.
- **Dependencies**:
  - 010: request and bookings;
  - 011: wallet, commission, funds rules, `appendMovementInSession`;
  - 005/006: goalkeeper profile and enabled zones;
  - 009: pagination conventions.
