# Feature Specification: Persisted Quotes and Idempotent Booking Creation

**Feature Branch**: `008-quote-to-booking`
**Created**: 2026-09-25
**Status**: Draft
**Input**: User description: "Persistencia de Cotizaciones y Creación Idempotente de Reservas. Actualmente la aplicación calcula las cotizaciones al vuelo sin guardarlas. Se requiere: (1) modificar el servicio de cotización para que almacene cada cotización en MongoDB con un estado inicial (`PENDING`) y un tiempo de vida (15 minutos desde su creación), devolviendo el `quoteId` al cliente; (2) crear la funcionalidad para convertir una cotización en una reserva (Booking) garantizando idempotencia, seguridad financiera y atomicidad con las capacidades nativas de MongoDB (sin Redis). La cotización guarda: usuario, estado [`PENDING`, `CONSUMED`, `EXPIRED`], detalles del partido (fecha, hora, cantidad de porteros, ubicación…), foto exacta del precio (precio base, recargo, total, moneda), `expires_at`, `created_at` y `consumed_at`. El cliente móvil únicamente envía el `quoteId` para confirmar la reserva. Para evitar condiciones de carrera (dos clics rápidos) o reservas duplicadas por reintentos de red, la cotización se consume con una única operación atómica condicionada a `status = PENDING` y `expires_at > ahora`, que la pasa a `CONSUMED` con `consumed_at`."

## Clarifications

### Session 2026-09-25

- Q: Does confirming a quote charge the client? → A: No. This feature has no payment step: the booking is created unpaid, and payment will come in a later feature. "Financial safety" means only that the booked price equals the quoted price and a quote can never produce two bookings.
- Q: Should booking rules (e.g. minimum notice) be re-checked when a quote is confirmed? → A: No. The quoted price must be honored as issued, and nothing is re-checked at confirmation. The risk of confirming a match that is now too close is handled by making the validity short: a quote expires 3 minutes after issuance (instead of 15), which is enough time for the client to decide to book.
- Q: Does this feature include reading bookings back (get by id, list my bookings)? → A: No. This feature only creates the booking. Retrieving bookings and showing them to the client or the goalkeeper will come in future features; the confirmation response (and replaying it) is the only way to get a booking here.
- Q: Can a client book the same match twice by confirming two different quotes? → A: No. A client may hold only one booking per zone and start time; confirming a second quote for the same zone and start time is refused as a duplicate booking (the quote stays pending and lapses). Different zone or different start time is allowed.
- Q: How long are quotes kept, and who deletes them? → A: A quote only lives while it can still be confirmed. When a booking is created, the confirmation flow deletes the quote in the same operation (the booking keeps the quote identifier and a full copy of its details and price). Unconfirmed quotes are never cleaned up by the application: the database removes them automatically once their expiry time has passed (native time-based expiry on the expiry field). This supersedes the stored `CONSUMED`/`EXPIRED` states and the 30-day retention: a stored quote is always pending, and "consumed" or "expired" means the quote is gone (or, for the short lag before the database removes it, past its expiry).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Confirm a booking from a quote at exactly the quoted price (Priority: P1)

A client has just received a price for their goalkeeper request (location, start time, number of goalkeepers, duration). They tap "Confirm" in the app. The app sends only the identifier of the quote it was shown. The system turns that quote into a booking whose match details and price are exactly those of the quote — nothing is recalculated, and the client cannot alter the price or the match details at confirmation.

**Why this priority**: This is the new capability the feature exists for. Without it the app can show a price but cannot book anything. Locking the price to what the client saw is also the financial guarantee the business needs: the amount booked is the amount quoted, never a figure supplied or modified by the client.

**Independent Test**: Request a quote, then confirm it with its identifier; verify that a booking is created, that its match details and every price amount are identical to the quote, that the booking references the quote identifier, and that the quote no longer exists.

**Acceptance Scenarios**:

1. **Given** a client holds a pending quote created 1 minute ago (total 120.000 COP, 2 goalkeepers, 90 minutes), **When** they confirm it, **Then** a booking is created with the same match details and the same breakdown (total 120.000 COP), the booking records the quote identifier, and the quote is deleted.
2. **Given** the booking rules or rates changed after the quote was issued (e.g. the zone rate went up), **When** the client confirms the still-valid quote, **Then** the booking carries the price stored in the quote, not the new price.
3. **Given** a confirmation request that also includes price or match fields, **When** it is processed, **Then** those extra fields are ignored and the booking uses only what the quote holds.

---

### User Story 2 - Double taps and network retries never create a second booking (Priority: P1)

A client taps "Confirm" twice in quick succession, or the app retries the confirmation because the first response was lost on a flaky mobile connection. However many times the same quote is confirmed, exactly one booking exists for it, and every repeated confirmation by that client receives that same booking back instead of an error or a duplicate.

**Why this priority**: A duplicate booking means a client is charged twice or two goalkeepers are dispatched for one match — a direct financial and trust failure. It shares top priority with Story 1 because confirmation without this guarantee is unsafe to release.

**Independent Test**: Confirm the same quote several times — both sequentially and simultaneously — and verify that exactly one booking exists for it and that every successful response refers to that single booking.

**Acceptance Scenarios**:

1. **Given** a quote that was already turned into a booking by this client, **When** the same client confirms it again (e.g. a retry after a lost response), **Then** the system returns the existing booking, identified as the original booking and not as a newly created one, and creates nothing.
2. **Given** a pending quote, **When** two confirmations for it arrive at the same moment, **Then** exactly one booking is created; the other request either receives that same booking or a response telling the app the confirmation is still being processed and can be safely retried — never a second booking.
3. **Given** a quote was turned into a booking (and therefore deleted), **When** a retry arrives, even after the quote's validity period has passed, **Then** the client still receives the existing booking (a booking is always retrievable by replaying the confirmation of its quote), not an "expired" or "not found" refusal.

---

### User Story 3 - Every quote is recorded and can be confirmed within its validity window (Priority: P2)

When a client asks for a price, the system still calculates it exactly as it does today, but now it also records the quote — who asked, the match details, the exact price breakdown, when it was issued and until when it can be confirmed — and returns the quote's identifier and expiry time along with the existing breakdown, so the app can confirm it later and show how long the price is held.

**Why this priority**: It is the prerequisite for Stories 1 and 2 (there is nothing to confirm without a stored quote), but on its own it delivers little visible value to the client, so it ranks just below them. It can be shipped and tested first.

**Independent Test**: Request a quote and verify that the response contains the existing breakdown plus a quote identifier and an expiry 3 minutes after issuance, and that a stored pending quote with the requesting client, the match details and the same amounts exists; then verify that it is removed automatically once its expiry has passed.

**Acceptance Scenarios**:

1. **Given** a request that today returns a price, **When** the client requests the quote, **Then** the response contains the same breakdown as before plus a quote identifier and an expiry time 3 minutes after issuance, and the quote is recorded as pending.
2. **Given** a request that today is refused (e.g. location not covered, insufficient notice, rate not configured), **When** the client requests the quote, **Then** it is refused exactly as before and nothing is recorded.
3. **Given** a client requests the same match twice, **When** both quotes are returned, **Then** each is recorded as its own quote with its own identifier and expiry; either can be confirmed while valid, but once one of them becomes a booking the other is refused as a duplicate booking (FR-022).

---

### User Story 4 - Stale, foreign or unknown quotes are refused clearly (Priority: P2)

A client who left the app open and returns after the price hold has lapsed, or an app that sends an identifier that does not exist or belongs to another client, gets a clear refusal that tells the app what to do next (typically: request a new quote), and nothing is booked. Because expired quotes are removed automatically shortly after they expire, a lapsed quote may be reported either as "expired" (if not yet removed) or as "not found"; the app treats both the same way: ask for a new quote.

**Why this priority**: Protects the business from honoring outdated prices and protects clients from acting on each other's quotes. It is necessary for correctness but secondary to the booking path itself.

**Independent Test**: Attempt to confirm an expired quote, an unknown identifier and another client's quote; verify each is refused with its own reason, that no booking is created and that no quote is changed or deleted by the refusal.

**Acceptance Scenarios**:

1. **Given** a quote issued 4 minutes ago that the database has not yet removed, **When** the client confirms it, **Then** the request is refused as "quote expired" and no booking is created; if the quote has already been removed, it is refused as "quote not found".
2. **Given** a quote issued by client A, **When** client B tries to confirm it, **Then** the request is refused exactly as if the quote did not exist, and client A's quote is not affected.
3. **Given** an identifier that matches no quote and no booking of this client (or is malformed), **When** it is confirmed, **Then** the request is refused as "quote not found".
4. **Given** a pending quote at exactly its expiry instant, **When** it is confirmed, **Then** it is refused as expired (a quote is confirmable only strictly before its expiry).
5. **Given** the client already has a booking for zone Z starting at 15:00, **When** they confirm a different valid quote for zone Z at 15:00, **Then** the request is refused as "duplicate booking", no booking is created, and the second quote is left untouched until it expires and is removed.

---

### Edge Cases

- **Confirmation lands at the expiry boundary**: validity is decided once, at the instant the quote is claimed; a quote claimed one moment before expiry becomes a booking even if the booking is finished being written after the expiry instant.
- **Failure between claiming the quote and recording the booking** (e.g. the service crashes or the database becomes unreachable mid-operation): the system must never be left with a quote deleted without a booking, nor with a booking whose quote still exists as pending. Either both changes take effect or neither does; if neither did, the client can retry and the quote is still confirmable while valid.
- **Retry of a confirmation whose first attempt failed without effect**: behaves like a first confirmation (the quote is still pending if within validity).
- **Match start time is now closer than when quoted**: a valid quote is honored as quoted; the booking rules (minimum notice, window, surcharge tier) are not re-evaluated at confirmation. The short validity (3 minutes) is what keeps this safe: with the current minimum notice of 30 minutes, a confirmed match still starts at least 27 minutes later.
- **Client's account is suspended or loses client status between quote and confirmation**: confirmation is subject to the same access rules as quoting at the moment of confirmation; if the caller is no longer allowed, it is refused and the quote stays pending.
- **Two different quotes for the same match confirmed at the same moment**: exactly one becomes a booking; the other is refused as a duplicate booking and its quote is left to expire. The duplicate rule holds under concurrency just like the one-booking-per-quote rule.
- **Same start time, different zone, or same zone, different start time**: not a duplicate; both can be booked (overlapping bookings in different places are the client's responsibility).
- **Quote past its expiry but not yet removed by the database** (automatic removal can lag behind the expiry time): refused as expired; expiry is always decided by the expiry time, never by whether the quote has been removed yet.
- **Many unconfirmed quotes from one client**: allowed; each lapses after 3 minutes and is removed automatically. Quoting is not rate-limited by this feature.
- **Quote stored before this feature shipped**: does not exist — quotes issued before release were never stored, so no identifier from before release can be confirmed.

## Requirements *(mandatory)*

### Functional Requirements

**Quote recording (changes to the existing quote)**

- **FR-001**: Every successful quote MUST be recorded before it is returned to the client. The record MUST contain: a unique quote identifier, the requesting client, status `PENDING`, the match details (location coordinates, identified zone and city, start instant, local start time and time zone, number of goalkeepers, duration), the exact price breakdown returned to the client (unit rate, goalkeeper subtotal, surcharge per goalkeeper, surcharge in total, total, currency), the issuance time, and the expiry time.
- **FR-002**: The expiry time MUST be 3 minutes after the issuance time. During that window the quoted price is guaranteed.
- **FR-003**: The quote response MUST keep every field it returns today, unchanged, and add the quote identifier and the expiry time. Existing app versions that ignore the new fields MUST keep working.
- **FR-004**: The price calculation, validation rules, refusal reasons and evaluation order of the existing quote MUST NOT change. A refused quote MUST NOT be recorded.
- **FR-005**: If the quote cannot be recorded, the request MUST fail with a generic error and MUST NOT return a price or an identifier — a client must never be shown a price it cannot confirm.
- **FR-006**: The booking-configuration read endpoint is unaffected and records nothing.

**Booking creation**

- **FR-007**: The system MUST provide a way for an authenticated client to confirm a quote by sending only its identifier. Any other data sent with the confirmation MUST be ignored.
- **FR-008**: Confirmation is subject to the same access rules as requesting a quote (an authenticated client with a complete profile).
- **FR-009**: A quote MUST be confirmable only when all of the following hold at the moment it is claimed: it exists (is pending), it was issued to the confirming client, and the current time is strictly before its expiry.
- **FR-010**: Claiming a quote MUST be a single indivisible check-and-remove: verifying the conditions of FR-009 and taking the quote out of the pending set (deleting it) MUST happen as one operation, so that of any number of concurrent confirmations of the same quote, at most one can succeed in claiming it.
- **FR-011**: A successful claim MUST produce exactly one booking. The deletion of the quote and the creation of its booking MUST take effect together or not at all: there MUST never be, at any observable moment after the operation completes, a quote deleted by confirmation without a booking, or a booking whose quote still exists.
- **FR-012**: The system MUST guarantee that no more than one booking can ever exist for a given quote, independently of the claim step (a second, independent safeguard against duplicates).
- **FR-013**: The booking MUST copy the match details and the full price breakdown from the quote. Nothing is recalculated at confirmation and no rate, surcharge tier, booking rule or configuration is re-read.
- **FR-014**: A newly created booking MUST have an initial status meaning "confirmed, awaiting goalkeeper assignment", and MUST record the client, the originating quote identifier, the match details, the price breakdown, the quote's issuance time and its own creation time. Since the quote is deleted, the booking is the only lasting record of what the client accepted.

**Idempotency**

- **FR-015**: When the confirming client confirms a quote identifier that already has a booking for that client (the quote itself having been deleted), the system MUST return that existing booking, MUST NOT create another, and MUST indicate that the booking already existed (as opposed to having just been created). This MUST hold regardless of how much time has passed, including after the quote's expiry.
- **FR-016**: When a confirmation finds its quote already claimed by a concurrent confirmation whose booking is not yet visible, the system MUST either return the booking once it exists or respond with a distinct, retryable "confirmation in progress" reason. It MUST NOT create a booking and MUST NOT report the quote as expired or not found.
- **FR-017**: The same booking identifier MUST be returned to every successful confirmation of the same quote.

**Refusals**

- **FR-018**: The system MUST refuse, with distinct reasons, a confirmation whose quote: (a) does not exist, has a malformed identifier, or belongs to another client — all three reported identically as "quote not found", so a client cannot learn whether another client's quote exists; (b) is expired; (c) is in progress per FR-016; (d) would duplicate an existing booking per FR-022. Missing or invalid input MUST be refused as invalid input.
- **FR-019**: When a confirmation finds a quote whose expiry has passed but which has not yet been removed, the system MUST refuse it as expired and MUST NOT modify or delete it (removal is left to the automatic expiry of FR-023). When neither the quote nor a booking for that identifier exists, the refusal is "quote not found" (FR-018a); the app MUST be able to treat "expired" and "not found" identically (request a new quote).
- **FR-020**: A quote whose expiry has passed MUST be treated as expired for every purpose, whether or not it has been removed yet — expiry is decided by the expiry time, never by the automatic removal having run.
- **FR-021**: A refused confirmation MUST NOT create a booking and MUST NOT change or delete any quote. In particular, a quote refused as a duplicate booking is left as is until it expires and is removed.
- **FR-022**: A client MUST NOT hold more than one booking for the same zone and the same start instant. A confirmation that would create such a second booking MUST be refused with a distinct "duplicate booking" reason. This MUST hold even when the two confirmations (of different quotes) arrive at the same moment. It does not apply to an idempotent replay of the same quote (FR-015), which returns the existing booking. Since bookings cannot yet be cancelled, every existing booking of the client counts.

**Retention and audit**

- **FR-023**: A quote MUST exist only while it can be confirmed. A confirmed quote is deleted by the confirmation itself (FR-010/FR-011). A quote that is never confirmed MUST be removed automatically by the database once its expiry time has passed, using the database's native time-based expiry on the expiry field; the system MUST NOT run its own cleanup job for quotes. Removal may lag the expiry time by a short interval, which FR-019/FR-020 account for.
- **FR-024**: Every booking creation, every idempotent replay and every refused confirmation MUST be written to the audit log with the client, the quote identifier and (when any) the booking identifier.

### Key Entities

- **Quote** (now stored, short-lived): the price offer made to one client for one match, held for 3 minutes. Attributes: identifier, client, status (always `PENDING` while stored), match details (location, zone, city, start instant, local start and time zone, number of goalkeepers, duration), price breakdown (unit rate, goalkeeper subtotal, surcharge per goalkeeper, surcharge in total, total, currency), issued at, expires at. It is deleted when confirmed into a booking, or removed automatically after it expires; "consumed" and "expired" are therefore not stored states. Previously transient (feature 007); this feature makes it persistent for its validity window.
- **Booking** (new): a client's confirmed request for goalkeepers for one match, created from exactly one quote. Attributes: identifier, client, originating quote identifier (unique: at most one booking per quote; also what idempotent replays are matched on), status (initially "awaiting goalkeeper assignment"), match details and price breakdown copied from the quote, quote issued at, created at. At most one booking per client, zone and start instant (FR-022). Later lifecycle (assignment, payment, cancellation) belongs to future features.
- **Client** (existing): the authenticated user who both requests the quote and confirms it; a quote can only ever be confirmed by the client it was issued to.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a test of 100 simultaneous confirmations of the same quote, repeated 50 times, exactly one booking exists per quote in 100% of runs, and every successful response names that booking.
- **SC-002**: 100% of bookings carry match details and amounts identical to their quote, including when rates or booking rules were changed between quoting and confirming.
- **SC-003**: 100% of replayed confirmations (sequential retries, including after expiry) return the original booking and create nothing.
- **SC-004**: At the expiry boundary (claimed one second before expiry vs. at expiry, before automatic removal) 100% of confirmations are classified correctly (booked vs. refused as expired).
- **SC-009**: 100% of unconfirmed quotes are gone within a few minutes of their expiry with no application cleanup process running, and 0 quotes remain stored after being confirmed.
- **SC-005**: When the confirmation is interrupted at any point between claiming the quote and recording the booking, 0 quotes are deleted without a booking and 0 bookings coexist with their still-pending quote.
- **SC-006**: 95% of confirmations receive their answer in under 2 seconds under normal load, and quoting remains within its existing 2-second target despite now recording the quote.
- **SC-007**: 100% of refused confirmations carry a reason that identifies the specific cause (not found, expired, in progress, duplicate booking, invalid input), and another client's quote is indistinguishable from a non-existent one.
- **SC-008**: When one client confirms N different valid quotes for the same zone and start time (sequentially or all at once), exactly 1 booking is created in 100% of runs and the other N−1 are refused as duplicate bookings.

## Assumptions

- **Payment is out of scope** (confirmed in Clarifications). "Financial safety" here means the price booked is exactly the price quoted and a quote can never produce two bookings. Charging the client, holds or refunds are not part of this feature; the booking is created unpaid and carries no payment state, which a later payment feature will add.
- **Reading bookings is out of scope** (confirmed in Clarifications). No endpoint to get or list bookings is added; showing bookings to the client or to the goalkeeper belongs to future features.
- **Goalkeeper assignment is out of scope.** The booking is only the confirmed request; matching it to goalkeepers, availability, notifications, cancellation and any later booking status belong to future features.
- **No re-validation at confirmation.** A valid quote is a firm offer for its 3 minutes (confirmed in Clarifications): the minimum notice, booking window and surcharge tier evaluated when quoting are not re-checked when confirming (see Edge Cases for why the match start is still in the future).
- **Fixed 3-minute validity.** The quote validity is a single service-wide value of 3 minutes, not a per-country or per-city setting. It is meant to give the client just enough time to decide whether to book. It must stay well below the smallest configured minimum notice; if a market is ever configured with a minimum notice close to 3 minutes, this assumption must be revisited.
- **Price breakdown mapping.** The user description's `base_price` / `service_fee` / `total_price` / `currency` correspond to the breakdown the quote already returns: goalkeeper subtotal, lead-time surcharge in total, total and currency; the unit rate and surcharge per goalkeeper are stored too, so the whole returned breakdown is preserved. Field naming follows the repository's existing conventions.
- **Quote identifiers** follow the repository's existing identifier convention for new entities, and are opaque to the app.
- **No external cache or lock service** (e.g. Redis) is introduced: atomicity and duplicate prevention rely only on the database the system already uses.
- **Existing access rules are reused**: the same client authentication and complete-profile requirement that protect the quote protect the confirmation.
- **Only successful quotes are stored**, and only for their 3-minute validity (plus the database's short removal lag), so the stored volume stays close to the number of quotes issued in the last few minutes.
- **Automatic removal lag.** The database's native time-based expiry removes documents periodically (roughly once a minute), not at the exact expiry instant; this is acceptable because expiry is enforced by time at confirmation (FR-020).
