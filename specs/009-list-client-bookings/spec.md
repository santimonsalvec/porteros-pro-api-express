# Feature Specification: List the Client's Own Bookings (Paginated)

**Feature Branch**: `009-list-client-bookings`
**Created**: 2026-09-25
**Status**: Draft
**Input**: User description: "Acabamos de implementar la funcionalidad para crear reservas ahora necesito el endpoint para que el cliente que hizo la reservas reservas pueda ver las reservas que ha realizado, el endpoint debe ser paginado. Esten nuevo endpoint es solo para el usuario por lo cual el id del usuario lo debe tomar del token."

## Clarifications

### Session 2026-09-25

- Q: How should the client's bookings be ordered? → A: Upcoming matches first (soonest start first), then past matches (most recent start first). A match is "upcoming" when its start instant is at or after the moment of the request.
- Q: How are the zone and city shown in each listed booking? → A: Their identifiers plus their current names, resolved from the zone and city reference data at request time (not a snapshot taken at booking time).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A client sees the bookings they have made (Priority: P1)

A client who has confirmed one or more bookings (feature 008) opens "My bookings" in the app. The app asks for the client's bookings without sending any user identifier: the system knows who the client is from their session, and returns only that client's bookings: upcoming matches first (the next match at the top), then past matches (the most recent at the top). Each booking shows what the client accepted: its status, the match details (place, zone, city, local start time, number of goalkeepers, duration) and the exact price breakdown they agreed to.

**Why this priority**: This is the capability the feature exists for. Today a booking can only be seen at the moment it is confirmed; once the confirmation screen is closed the client has no way to see what they booked or what they will pay.

**Independent Test**: As client A, confirm three bookings; request the list and verify that exactly those three bookings are returned, in upcoming-then-past order, each with match details and price identical to what the confirmation returned.

**Acceptance Scenarios**:

1. **Given** client A has bookings for matches starting tomorrow, in 10 days and 5 days ago, **When** A requests their bookings, **Then** all 3 are returned in the order: tomorrow, in 10 days, 5 days ago — each with its identifier, status, match details, price breakdown and creation time.
2. **Given** client A has two past matches (3 days ago and 20 days ago) and no upcoming ones, **When** A requests their bookings, **Then** they are returned as: 3 days ago, then 20 days ago.
3. **Given** client A has no bookings, **When** A requests their bookings, **Then** the response is a successful, empty list (not an error), showing a total of 0.
4. **Given** a booking was confirmed at a price of 120.000 COP and the zone rate changed afterwards, **When** the client lists their bookings, **Then** the booking still shows 120.000 COP (the stored price, never recalculated).

---

### User Story 2 - A client can never see another client's bookings (Priority: P1)

The list is strictly personal. The client is identified only from their session; any identifier the app might send in the request (a user id, a client id) is ignored, so no client can view — or even learn the existence of — another client's bookings.

**Why this priority**: Bookings contain a client's location, schedule and spending. Leaking them is a privacy failure, so this guarantee ships together with Story 1.

**Independent Test**: Create bookings for clients A and B; as A, request the list (also trying to pass B's identifier in the request) and verify that only A's bookings are returned and B's total count is not revealed.

**Acceptance Scenarios**:

1. **Given** client A has 2 bookings and client B has 5, **When** A requests their bookings, **Then** only A's 2 bookings are returned and the total is 2.
2. **Given** the request carries B's identifier as a parameter, **When** A sends it, **Then** the identifier is ignored and only A's bookings are returned.
3. **Given** a request with no valid session, **When** it is sent, **Then** it is refused as unauthenticated and no booking data is returned.
4. **Given** a signed-in user who is not allowed to act as a client (same access rules as requesting a quote or confirming a booking), **When** they request the list, **Then** it is refused as forbidden.

---

### User Story 3 - Browsing a long booking history page by page (Priority: P2)

A frequent client has dozens of bookings. The app loads them a page at a time (e.g. as the user scrolls), asking for a given page number and optionally a page size. Each response says which page it is, the page size used, the total number of bookings and the total number of pages, so the app knows when to stop loading.

**Why this priority**: Most clients will have few bookings at first, so a single first page already covers them; pagination matters as history grows, and keeps each response small and fast on mobile connections.

**Independent Test**: As a client with 45 bookings, request pages 1, 2 and 3 with page size 20 and verify they contain 20, 20 and 5 bookings respectively, with no booking repeated or missing, and that each response reports a total of 45 and 3 pages.

**Acceptance Scenarios**:

1. **Given** a client with 45 bookings, **When** they request page 1 without specifying a size, **Then** they receive the first 20 bookings in upcoming-then-past order, with total 45 and 3 pages.
2. **Given** the same client, **When** they request page 3 with size 20, **Then** they receive the last 5 bookings of that order (the past matches that started longest ago).
3. **Given** the same client, **When** they request page 4, **Then** they receive an empty page (not an error) that still reports total 45 and 3 pages.
4. **Given** a page size larger than the maximum (e.g. 500), a page size below 1, a page number below 1, or non-numeric values, **When** the request is sent, **Then** it is refused as invalid input, stating which parameter is wrong.

---

### Edge Cases

- **Two bookings with the same start instant** (possible in different zones): the order is still deterministic (a stable tie-breaker), so paging never repeats or skips one of them.
- **A match starting exactly at the request instant**: counts as upcoming.
- **A match starts between two page requests** (it moves from upcoming to past): "upcoming" is evaluated at each request, so that booking may shift position between pages; as with new bookings, the client can refresh from the first page.
- **A new booking is created while the client is paging**: pages are computed per request; a booking created between two page requests may shift items by one position. This is acceptable for this feature (the client can refresh from the first page); no snapshot consistency across pages is promised.
- **Page beyond the last page**: returns an empty list with the correct totals, never an error.
- **Client whose account became suspended or lost client status**: the list is refused under the same access rules as the rest of the client booking flow.
- **Parameters omitted**: page defaults to 1 and page size defaults to 20.
- **A booking's zone or city no longer exists in the reference data** (or has no name): the booking is still listed, with its identifiers and an empty (null) name for the missing one; the list never fails because of it.
- **A zone or city was renamed after the booking**: the current name is shown.
- **Unknown extra parameters** (including any user or client identifier): ignored; they never change whose bookings are returned.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a way for an authenticated client to list the bookings they have made.
- **FR-002**: The client whose bookings are listed MUST be determined exclusively from the caller's authenticated session. The request MUST NOT accept any user or client identifier; any such value sent MUST be ignored.
- **FR-003**: The list MUST contain only bookings whose client is the caller. No information about other clients' bookings (including their count) MUST be exposed.
- **FR-004**: The endpoint MUST be subject to the same access rules as requesting a quote and confirming a booking: a request without a valid session MUST be refused as unauthenticated; a caller not allowed to act as a client MUST be refused as forbidden.
- **FR-005**: The list MUST be paginated. The caller MAY specify a page number (1-based, default 1) and a page size (default 20, minimum 1, maximum 50).
- **FR-006**: A page number or page size that is below its minimum, above its maximum (page size only) or not a whole number MUST be refused as invalid input, naming the offending parameter. No partial result is returned.
- **FR-007**: Bookings MUST be ordered in two groups: first the upcoming matches (start instant at or after the moment of the request), ordered by start instant ascending (soonest first); then the past matches (start instant before the moment of the request), ordered by start instant descending (most recent first). Ties MUST be broken deterministically so that consecutive pages never overlap or skip a booking when no booking is added and no match starts in between. The ordering spans all pages: page 2 continues exactly where page 1 ended.
- **FR-008**: Every response MUST include, besides the bookings of the requested page: the page number, the page size applied, the total number of the caller's bookings and the total number of pages.
- **FR-009**: A page beyond the last page, and a caller with no bookings, MUST produce a successful response with an empty list and correct totals.
- **FR-010**: Each listed booking MUST include: booking identifier, originating quote identifier, status, match details (location coordinates, zone identifier and name, city identifier and name, start instant, local start time and time zone, number of goalkeepers, duration), price breakdown (unit rate, goalkeeper subtotal, surcharge per goalkeeper, surcharge in total, total, currency) and the booking's creation time — i.e. the same booking representation returned when the booking was confirmed, plus the zone and city names (FR-013).
- **FR-011**: Listed bookings MUST show their stored values exactly; nothing (price, rules, zone assignment) is recalculated or re-read when listing. The only values read at listing time are the zone and city display names (FR-013).
- **FR-012**: Listing MUST NOT modify any booking or quote.
- **FR-013**: Each listed booking MUST include the current name of its zone and of its city, resolved from the zone and city reference data at the time of the request. If the zone or city can no longer be found, the booking MUST still be listed with that name empty (null); the request MUST NOT fail for that reason.

### Key Entities

- **Booking** (existing, from feature 008, read-only here): a client's confirmed request for goalkeepers for one match. Attributes used: identifier, client, originating quote identifier, status, match details, price breakdown, quote issued at, created at. This feature only reads it.
- **Zone** and **City** (existing reference data, read-only): used only to resolve the display name for a booking's zone and city identifiers.
- **Bookings page** (response concept): a slice of one client's bookings plus its position — page number, page size, total bookings, total pages.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In tests with several clients holding bookings, 100% of list responses contain only the caller's bookings, including when another client's identifier is passed in the request.
- **SC-002**: For a client with N bookings (tested with N = 0, 1, 20, 21, 45), walking all pages at any valid page size returns each of the N bookings exactly once, in upcoming-then-past order (FR-007), and the reported totals equal N and ⌈N / page size⌉.
- **SC-003**: 100% of listed bookings show match details and amounts identical to those returned when they were confirmed.
- **SC-004**: 100% of listed bookings whose zone and city exist show their current names; bookings whose zone or city is missing are still listed (0 failed requests due to missing reference data).
- **SC-005**: A client with up to 500 bookings gets any page of their list in under 1 second in 95% of requests under normal load.
- **SC-006**: 100% of requests with invalid pagination values are refused as invalid input naming the parameter, and 100% of unauthenticated or non-client requests are refused without returning booking data.

## Assumptions

- **Scope is the client's own list only.** Viewing a single booking by identifier, the goalkeeper's view of bookings, and any administrative listing are out of scope and belong to future features.
- **No filters.** Filtering by status or by upcoming/past matches is out of scope: bookings currently have a single status ("awaiting goalkeeper assignment"). Filters can be added once cancellation/assignment introduce more statuses.
- **Ordering is upcoming-then-past by match start** (confirmed in Clarifications): the next match is what a client most often looks for. The split is evaluated against the moment of each request; no separate upcoming/past filter is offered.
- **Page-number pagination with totals** (page, page size, total, total pages) was chosen as the default because it is simple for the mobile app and a client's booking history is small; no cross-page snapshot consistency is promised.
- **Default page size 20, maximum 50** are reasonable mobile defaults and can be tuned later without changing the behavior described here.
- **Zone and city names are resolved at request time** (confirmed in Clarifications): the booking keeps only identifiers, and the list shows their current names. No name snapshot is stored at booking time, so feature 008 is unchanged.
- **Same access rules as the booking flow** (authenticated, acting as a client) are reused; no new role or permission is introduced.
- **Depends on feature 008** (bookings are created and stored there); this feature adds no new data, only a read over existing bookings.
