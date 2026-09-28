# Feature Specification: Goalkeeper Request with One Booking per Goalkeeper

**Feature Branch**: `010-goalkeeper-request-bookings`
**Created**: 2026-09-27
**Status**: Draft
**Input**: User description: "Reestructurar la reserva: hoy (features 008 y 009) una reserva puede pedir 1 o 2 porteros (`goalkeeperCount`). Se requiere que cuando el cliente confirme una cotización se cree una SOLICITUD (el partido) y, por cada portero pedido, una RESERVA independiente de 1 solo portero que referencia a la solicitud. Requisitos: (1) Confirmar una cotización de N porteros crea, en una sola transacción, la solicitud y sus N reservas; sigue siendo idempotente por quoteId (repetir la confirmación devuelve la misma solicitud con sus reservas, sin crear nada). (2) Cada reserva tiene el precio de 1 portero tomado de la cotización (tarifa por portero + recargo por portero); nada se recalcula. La suma de las reservas es igual al total cotizado. (3) Antes de confirmar, el cliente elige qué hacer si solo se confirma parte de los porteros: "quedarme con los porteros confirmados" (por defecto) o "cancelar todo". Se guarda en la solicitud. (4) La regla de no duplicar un partido pasa a la solicitud: un cliente no puede tener dos solicitudes activas para la misma zona e inicio. (5) "Mis reservas" (GET paginado de la feature 009) pasa a listar solicitudes, cada una con sus reservas, conservando el orden (próximas primero, luego pasadas) y los nombres actuales de zona y ciudad. (6) Si al confirmar faltan menos minutos para el inicio que el plazo de cancelación gratuita (configurable, hoy 60 min), la respuesta indica que la reserva no podrá cancelarse una vez asignada. (7) Migración de los datos existentes: las reservas de 2 porteros se parten en dos reservas bajo una solicitud. Las reservas quedan en estado "pendiente de asignación". Estados posteriores (asignada, cancelada, vencida, retiro del portero, completada) se definen ahora en el modelo pero sus transiciones llegan en features posteriores."

**Context**: This is step 010 of the goalkeeper-guarantee roadmap (repository-root `_temp_plan.md`, sections 2 and 3). Later features (goalkeeper acceptance, expirations, client cancellation, goalkeeper withdrawal, check-in, closing) act on each booking separately, which is why a match with two goalkeepers must become two independent bookings now.

## Clarifications

### Session 2026-09-27

- Q: The "My bookings" list changes shape (requests instead of bookings). Is there a published app screen depending on the feature 009 format? → A: No. The screen isn't published (or doesn't exist yet); the format changes in place with no versioning, and the app is adapted later in the app plan.
- Q: Should existing bookings be migrated to the new shape? → A: No. Only development test data exists (feature 008 is not in production). Existing bookings are deleted when releasing, as a documented cleanup step; there is no migration.
- Q: What happens when neither the country nor the city has the free-cancellation period configured? → A: Use 60 minutes by default and log a warning so operations can configure it; the confirmation is never refused for this. (The client-cancellation feature, where the period decides refunds, may make it mandatory.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Confirming a quote creates one request and one booking per goalkeeper (Priority: P1)

A client has a quote for a match (location, start time, 1 or 2 goalkeepers, duration). When they confirm it, the system records the match once, as a **request**, and creates one **booking** per goalkeeper asked for. Each booking stands for a single goalkeeper and carries the price of one goalkeeper, exactly as quoted. Two goalkeepers mean two bookings of the same request, and together they cost exactly the quoted total.

**Why this priority**: It is the structural change every later feature depends on. Acceptance, cancellation, withdrawal and check-in all act on a single goalkeeper's booking, and that is impossible while one booking holds two goalkeepers.

**Independent Test**: Confirm a 2-goalkeeper quote and a 1-goalkeeper quote. Verify that each produces one request with 2 and 1 bookings respectively, that each booking is for 1 goalkeeper at the per-goalkeeper price of the quote, and that the bookings of a request add up to the quoted total.

**Acceptance Scenarios**:

1. **Given** a valid 2-goalkeeper quote whose price is (55.000 rate + 5.000 surcharge) per goalkeeper = 120.000 COP in total, **When** the client confirms it, **Then** one request is created for the match and 2 bookings reference it. Each booking is for 1 goalkeeper at 55.000 + 5.000 = 60.000 COP, the two add up to 120.000 COP, and both are pending assignment.
2. **Given** a valid 1-goalkeeper quote, **When** the client confirms it, **Then** one request with exactly 1 booking is created, at the quoted price.
3. **Given** the rates or the surcharge rules changed after the quote was issued, **When** the client confirms the still-valid quote, **Then** every booking carries the quoted per-goalkeeper price, not a recalculated one.
4. **Given** the confirmation of a 2-goalkeeper quote fails midway (for example, the service stops after creating the request), **Then** no request or booking exists and the quote is still confirmable while valid. Never a request with only part of its bookings.

---

### User Story 2 - Retries and double taps still create nothing twice (Priority: P1)

The idempotency guarantees of feature 008 keep holding with the new shape. However many times the same quote is confirmed, sequentially or at the same moment, exactly one request with its bookings exists, and every successful repeat returns that same request with the same bookings.

**Why this priority**: A duplicated request would mean duplicated goalkeepers sent to one match. It shares top priority with Story 1 because the new shape is unsafe to release without it.

**Independent Test**: Confirm the same 2-goalkeeper quote several times, sequentially and concurrently. Verify that exactly one request and two bookings exist, and that every successful response names that same request and those same two bookings.

**Acceptance Scenarios**:

1. **Given** a quote already confirmed by this client, **When** the same client confirms it again (even after the quote's validity has passed), **Then** the system returns the existing request with its bookings, marked as already existing, and creates nothing.
2. **Given** a pending quote, **When** two confirmations arrive at the same moment, **Then** exactly one request with its bookings is created. The other confirmation receives that same request, or a retryable "confirmation in progress" answer, never a second request.
3. **Given** a quote that is expired, unknown, malformed or belongs to another client, **When** it is confirmed, **Then** it is refused exactly as in feature 008 ("quote expired" or "quote not found"). Another client's quote is indistinguishable from a non-existent one, and nothing is created.

---

### User Story 3 - The client decides up front what happens if only part of the goalkeepers is confirmed (Priority: P1)

When asking for more than one goalkeeper, the client chooses before confirming what should happen if, in the end, only some of the goalkeepers are confirmed:
- **keep the confirmed goalkeepers** (the default), or
- **cancel everything**.

The choice is stored with the request so a later feature can apply it automatically without asking the client again.

**Why this priority**: The rule decided for the whole lifecycle is that the client is never asked at the last minute. The choice has to be captured at the moment of confirming, and that moment is this feature.

**Independent Test**: Confirm one 2-goalkeeper quote without a preference and another with "cancel everything". Verify that the first request stores "keep the confirmed goalkeepers" and the second "cancel everything". Also verify that an unknown preference value is refused as invalid input without creating anything.

**Acceptance Scenarios**:

1. **Given** a 2-goalkeeper quote, **When** the client confirms it without stating a preference, **Then** the request stores "keep the confirmed goalkeepers".
2. **Given** a 2-goalkeeper quote, **When** the client confirms it choosing "cancel everything", **Then** the request stores "cancel everything".
3. **Given** a 1-goalkeeper quote, **When** it is confirmed with or without a preference, **Then** it is accepted. For one goalkeeper the preference has no practical effect, and the request stores the given value or the default.
4. **Given** a confirmation with an unrecognised preference value, **Then** it is refused as invalid input and nothing is created.
5. **Given** a quote that was already confirmed, **When** it is confirmed again with a different preference, **Then** the existing request is returned unchanged. A repeat never modifies the stored preference.

---

### User Story 4 - A client cannot book the same match twice (Priority: P2)

The rule of feature 008 "one booking per client, zone and start" moves up to the request: a client cannot hold two active requests for the same zone and start time. With two bookings per request, the old per-booking rule would wrongly reject the second booking of the same request.

**Why this priority**: It protects against accidental duplicate matches, which is necessary for correctness. It is a rule carried over from 008, and it only needs to live at the new level.

**Independent Test**: Confirm a quote for zone Z at 15:00, then confirm a different quote for the same zone and start. Verify that the second is refused as a duplicate and names the existing request, that a 2-goalkeeper request is not refused against itself, and that the same zone at another time, or another zone at the same time, is allowed.

**Acceptance Scenarios**:

1. **Given** the client holds an active request for zone Z at 15:00, **When** they confirm a different valid quote for zone Z at 15:00, **Then** it is refused as a duplicate. The answer identifies the existing request, nothing is created and the second quote is left untouched until it expires.
2. **Given** two different quotes for the same client, zone and start confirmed at the same moment, **Then** exactly one request is created and the other is refused as a duplicate.
3. **Given** the same zone at a different start, or a different zone at the same start, **Then** both requests are allowed.

---

### User Story 5 - "My bookings" shows one entry per match, with its bookings inside (Priority: P2)

The client's paginated list from feature 009 now lists **requests**, one entry per match, each containing its bookings. It keeps everything 009 guaranteed:
- the client is taken only from the session;
- upcoming matches come first (soonest first), then past matches (most recent first), with a deterministic tie-breaker;
- the current zone and city names are shown, empty when missing;
- the same pagination parameters and totals apply.

**Why this priority**: Without it, a two-goalkeeper match would show as two rows. It is the client-facing half of the restructure, but it depends on Story 1.

**Independent Test**: As a client with a 2-goalkeeper request tomorrow, a 1-goalkeeper request in 10 days and a past 2-goalkeeper request, list the first page. Verify that there are three entries in the order tomorrow → in 10 days → past, that each lists its bookings with their per-goalkeeper prices and states, and that the totals count requests, not bookings.

**Acceptance Scenarios**:

1. **Given** the requests above, **When** the client lists them, **Then** 3 entries are returned in upcoming-then-past order, and the totals report 3 items.
2. **Given** a 2-goalkeeper request, **When** it is listed, **Then** the entry shows the match details once and contains 2 bookings, each with its own identifier, state and per-goalkeeper price, plus the request total and the client's preference.
3. **Given** another client's requests exist, **When** the caller lists theirs, **Then** only the caller's requests appear, and identifiers sent as parameters are ignored, as in feature 009.
4. **Given** a page past the last one or invalid pagination values, **Then** the answer is the same as in feature 009: an empty page with the real totals, or "invalid input" naming the parameter.

---

### User Story 6 - The client is warned when confirming close to the match (Priority: P3)

If the client confirms with less time before the start than the free-cancellation period (configurable, 60 minutes today), the confirmation answer tells them that once a goalkeeper is assigned they will not be able to cancel, and will owe the goalkeeper the payment.

**Why this priority**: It sets the right expectation for a rule that is enforced later, in the client-cancellation feature. It is informative only, so it ranks last.

**Independent Test**: With a 60-minute free-cancellation period, confirm one quote for a match starting in 45 minutes and another starting in 3 hours. Verify that only the first answer carries the "cannot cancel once assigned" indication.

**Acceptance Scenarios**:

1. **Given** a free-cancellation period of 60 minutes and a match starting in 45 minutes, **When** the quote is confirmed, **Then** the answer indicates that the bookings cannot be cancelled once assigned.
2. **Given** a match starting in 3 hours, **When** the quote is confirmed, **Then** the answer indicates that free cancellation is available until 60 minutes before the start.
3. **Given** an area where neither the city nor the country has the free-cancellation period configured, **When** a quote is confirmed, **Then** the confirmation succeeds using 60 minutes, and a warning is logged naming the city so operations can configure it.

---

### Edge Cases

- **The per-goalkeeper price and the total**: a request's total always equals the sum of its bookings. Bookings are built from the quote's per-goalkeeper amounts (rate and surcharge), so no rounding can occur: amounts are whole currency units and are never divided.
- **Partial failure while creating a 2-goalkeeper request**: never visible. Either the request and all its bookings exist (and the quote is gone), or none of them do (and the quote is still pending). This is the same all-or-nothing rule as in 008.
- **Replay after the request's bookings changed state** (in later features, for example one booking already assigned): the replay returns the request with the current state of its bookings, never a fresh copy.
- **Duplicate check against inactive requests**: a request whose bookings are all in an ended state (cancelled, expired, goalkeeper withdrew, completed) no longer blocks a new request for the same zone and start. No booking can reach an ended state in this feature; the rule is defined now so later features need no data change.
- **Match starting exactly at the free-cancellation boundary** (exactly 60 minutes after confirming): counts as "cancellation available", because the period is "until 60 minutes before the start", inclusive.
- **Client lists requests while a confirmation is in progress**: the list shows either the whole request with all its bookings or nothing of it, never a request with a missing booking.

## Requirements *(mandatory)*

### Functional Requirements

**Request and bookings**

- **FR-001**: Confirming a valid quote MUST create exactly one **request** representing the match and exactly N **bookings**, where N is the number of goalkeepers of the quote (1 or 2). Each booking is for exactly one goalkeeper and references its request.
- **FR-002**: The request MUST record: the client, the originating quote reference, the match details (location, zone, city, start instant, local start time and time zone, duration, number of goalkeepers asked for), the client's partial-confirmation preference, the quote's issuance time and its own creation time.
- **FR-003**: Each booking MUST record: its request, the client, a state, the per-goalkeeper price (rate per goalkeeper, surcharge per goalkeeper, booking total = rate + surcharge, currency) and its creation time. The match details belong to the request and MUST NOT diverge between the request and its bookings.
- **FR-004**: Booking prices MUST be taken from the quote's per-goalkeeper amounts. Nothing is recalculated, and no rate, surcharge rule or setting is re-read at confirmation. The sum of the booking totals of a request MUST equal the quoted total.
- **FR-005**: Creating the request and all its bookings, and removing the confirmed quote, MUST take effect together or not at all. No observable state may contain a request without all of its bookings, bookings without their request, or a removed quote without its request.
- **FR-006**: Every new booking MUST start in the state "pending assignment". The booking states MUST be defined now as: pending assignment, assigned, cancelled, expired, goalkeeper withdrew, completed. Only "pending assignment" is reachable in this feature; transitions into the others belong to later features.
- **FR-007**: A request's overall status MUST be derivable from its bookings (for example: all pending, some assigned, all assigned, ended), so no separate status can contradict them.

**Idempotency and refusals (carried over from feature 008)**

- **FR-008**: Confirming a quote that already produced a request for the same client MUST return that request with its current bookings, MUST NOT create anything, and MUST indicate that it already existed. This holds regardless of elapsed time, including after the quote's validity ends.
- **FR-009**: Concurrent confirmations of the same quote MUST result in exactly one request with its bookings. Every other concurrent confirmation MUST receive either that request or the retryable "confirmation in progress" answer.
- **FR-010**: The refusals of feature 008 MUST keep their meaning and distinct reasons: "quote not found" (unknown, malformed, or another client's quote, all indistinguishable), "quote expired", "confirmation in progress", "duplicate" (now per request, FR-013) and "invalid input". A refused confirmation MUST NOT create anything and MUST NOT change or remove any quote.
- **FR-011**: Every creation, idempotent replay and refused confirmation MUST keep being written to the audit log, now referencing the request and its bookings when they exist.

**Partial-confirmation preference**

- **FR-012**: The confirmation MUST accept an optional partial-confirmation preference with exactly two values: "keep the confirmed goalkeepers" (the default when not sent) and "cancel everything". Any other value MUST be refused as invalid input. A replay MUST NOT modify the stored preference.

**No duplicate matches**

- **FR-013**: A client MUST NOT hold more than one **active** request for the same zone and start instant. A request is active while at least one of its bookings is pending assignment or assigned. A confirmation that would create a second active request MUST be refused as a duplicate, identifying the existing request. This MUST hold when two such confirmations arrive at the same moment, and MUST NOT refuse the bookings of one request against each other.

**Late-confirmation notice**

- **FR-014**: A new setting, the **free-cancellation period** (minutes before the start), MUST be configurable per country with an optional per-city override, following the same inheritance as the existing booking settings. Initial value for Colombia: 60 minutes. When neither level defines it, the system MUST use 60 minutes, MUST NOT refuse the confirmation, and MUST log a warning identifying the city.
- **FR-015**: The confirmation answer MUST state whether the client can still cancel assigned bookings free of charge. Cancellation is available when the start is at least the free-cancellation period away at confirmation time. When it is not available, the answer indicates that assigned bookings cannot be cancelled and that the goalkeeper will have to be paid. The answer also indicates until what moment free cancellation is possible when it is available.

**"My bookings" list (reshaping feature 009)**

- **FR-016**: The client's paginated list MUST return **requests** instead of bookings. Each entry contains: the request identifier, match details, the current zone and city names (empty when missing), the preference, the number of goalkeepers asked for, the request total, the derived overall status and the list of its bookings (identifier, state, per-goalkeeper price breakdown, creation time).
- **FR-017**: The list MUST keep every guarantee of feature 009, applied to requests:
  - the caller comes only from the session, and parameters naming other users are ignored;
  - upcoming matches come first by start ascending, then past matches by start descending, with a deterministic tie-breaker;
  - the same pagination parameters, defaults, limits and validation apply;
  - totals count requests;
  - an empty page is returned past the end.

**Release cleanup**

- **FR-018**: Bookings created before this feature are development test data and are **not migrated**. The release procedure MUST include a documented step that deletes every existing booking (and any stored quote), so that only the new request/booking shape exists afterwards. No code path needs to read the old shape.

### Key Entities

- **Request** (new): the match a client asked goalkeepers for. It holds the client, the quote reference (unique: at most one request per quote), the match details, the number of goalkeepers asked for, the partial-confirmation preference, the quote issuance time and the creation time. Its overall status is derived from its bookings. At most one active request per client, zone and start.
- **Booking** (reshaped from feature 008): one goalkeeper's place in a request. It holds the request reference, the client, the state (pending assignment → later: assigned, cancelled, expired, goalkeeper withdrew, completed), the per-goalkeeper price and the creation time. Later features add the assigned goalkeeper and the times of each transition.
- **Booking settings** (extended): gain the free-cancellation period, per country with a per-city override.
- **Quote** (unchanged): still stored for 3 minutes and deleted on confirmation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a test of 100 simultaneous confirmations of the same 2-goalkeeper quote, repeated 50 times, exactly 1 request with exactly 2 bookings exists per quote in 100% of runs, and every successful answer names that request.
- **SC-002**: In 100% of confirmations the booking totals of a request add up exactly to the quoted total, including when rates or surcharge rules changed between quoting and confirming.
- **SC-003**: When a confirmation is interrupted at any point, 0 requests exist with fewer bookings than goalkeepers asked for, and 0 quotes are removed without their request.
- **SC-004**: When one client confirms N different valid quotes for the same zone and start (sequentially or at once), exactly 1 active request is created in 100% of runs, and the other N−1 are refused as duplicates.
- **SC-005**: For a client with R requests (tested with R = 0, 1, 20, 21, 45, mixing 1- and 2-goalkeeper requests), walking all pages returns each request exactly once, in upcoming-then-past order, with every one of its bookings, and the totals equal R.
- **SC-006**: After the release cleanup, 0 bookings of the old shape (one booking holding more than one goalkeeper) exist, and every booking belongs to a request.
- **SC-007**: 100% of confirmations with less time to the start than the free-cancellation period carry the "cannot cancel once assigned" indication, and 0% of confirmations outside that period carry it.

## Assumptions

- **Scope**: only the restructure, the preference, the per-request duplicate rule, the reshaped list, the late-confirmation notice and the release cleanup are in scope. Goalkeeper acceptance, expirations, applying the preference, cancellation, withdrawal, notifications, the wallet and payments belong to later features of the roadmap (`_temp_plan.md`).
- **The client pays the goalkeeper directly**; the app never charges the client. The late-confirmation notice is informative only.
- **Default free-cancellation period** (confirmed in Clarifications): 60 minutes with a logged warning when not configured. The later client-cancellation feature, where the period decides refunds, may make it mandatory.
- **Contract change** (confirmed in Clarifications): the confirmation answer and the "My bookings" list change shape **in place, without versioning**. No published app screen depends on the 009 format; the Flutter work is planned separately after the backend roadmap.
- **Preference for 1-goalkeeper requests** is stored but irrelevant.
- **No migration** (confirmed in Clarifications): the existing bookings are development test data and are deleted at release.
- **Quote endpoint unchanged**: it still returns the full match price for N goalkeepers. The per-goalkeeper split happens at confirmation.
- **Dependencies**: features 007 (quote and booking settings), 008 (confirmation, idempotency, audit) and 009 (client list).
