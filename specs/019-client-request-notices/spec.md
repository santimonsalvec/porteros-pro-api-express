# Feature Specification: Client Request Notices ✅

**Feature Branch**: `019-client-request-notices`
**Created**: 2026-09-28
**Status**: ✅ Implemented — merged into `main` on 2026-09-28. Manual checks deferred to the end of the roadmap (`_temp_pruebas.md`).
**Input**: User description: "Spec 019 de _temp_plan.md" — "Notificaciones al cliente sobre sus solicitudes, como consumidores de los eventos (feature 013) enviados por FCM (feature 014) y guardados en su bandeja. Avisar cuando: se asigna un portero a una de sus reservas; la solicitud tiene todos sus porteros; un portero se retira (invitando a hacer una nueva búsqueda); y cuando a inicio + 15 min el portero no ha hecho check-in (con el WhatsApp del portero). Cada aviso es idempotente y lleva datos para abrir la solicitud en la app."

**Context**: Step 019 of the goalkeeper-guarantee roadmap (repository-root `_temp_plan.md`, §2.10). Some client notices already ship:
- 016: "no goalkeeper found", "only some found" and "cancelled by cancel all";
- 018: "your goalkeeper withdrew". Since 018 (clarification 3), that notice says a replacement is being searched, not "search again".

This feature adds:
- the notices that are still missing: a goalkeeper was assigned, and the request is complete;
- the rule that the client and the goalkeepers see each other's name and WhatsApp **only in the last hour before the match** (clarifications 2 and 3);
- a notice to both when the contacts become visible (clarification 4).

The "no check-in at start + 15 min" notice moves to feature 020 (clarification 1).

It builds on:
- 013: events and consumers;
- 014: push;
- 015/016: the inbox and its de-duplication;
- 012: after assignment, the client sees the goalkeeper's name and WhatsApp, and the goalkeeper sees the client's. Both now apply only from one hour before the match.

## Clarifications

### Session 2026-09-28

- Q: Where does the "your goalkeeper hasn't confirmed arrival" notice live, given that 020 (check-in) detects the missing check-in? → A: In feature 020. It detects the missing check-in at start + 15 min and sends the notice itself, reusing this feature's client-notice mechanism. 019 covers only "goalkeeper assigned" and "request complete".
- Q: When an acceptance completes the request, how many notices does the client get? → A: One. The "complete" notice replaces the "assigned" notice for that acceptance. Owner rule added with this answer: the client can see the goalkeepers' names (and WhatsApp) only when the match is one hour away or less, never before. Otherwise the client could arrange directly with the goalkeeper and cancel the booking. So no notice carries goalkeeper names or contacts.
- Q: Does the rule also apply the other way, to what the goalkeeper sees of the client? → A: Yes, symmetric. The goalkeeper sees the client's name and WhatsApp only from one hour before the match. Before that, their agenda shows the match (place, time, pitch location) without client data.
- Q: When the contacts become visible (one hour before), are the parties told? → A: Yes, both. At start − 60 min, the client gets their goalkeepers' names and WhatsApp, and each goalkeeper gets the client's. If the booking is taken with less than one hour to go, the contacts are visible right away. The client's assignment notice then carries the goalkeeper's contact directly, and the goalkeeper sees the client's in the acceptance answer.

## User Scenarios & Testing *(mandatory)*

The user is the **client** who asked for goalkeepers. Their main worry after booking is "did someone take my match?". Who the goalkeeper is only matters close to the match.

### User Story 1 - The client learns a goalkeeper took one of their bookings (Priority: P1)

As soon as a goalkeeper accepts one of the client's bookings, and the request still has other bookings searching, the client gets a notice (push and inbox): "Un portero tomó tu partido en Bello · dom 4 oct, 3:00 p. m. Seguimos buscando el otro." Tapping it opens the request. When the booking was a **replacement** of a goalkeeper who withdrew (018), the notice says another goalkeeper was found. The notice doesn't name the goalkeeper while the match is more than one hour away (clarification 2). If the goalkeeper takes it in the last hour, the notice carries their name and WhatsApp (clarification 4).

**Why this priority**: This is the moment the platform delivers its promise. Telling the client right away prevents them from hiring someone elsewhere.

**Independent Test**: In a 2-goalkeeper request, a goalkeeper accepts one booking → the client gets exactly one notice, without the goalkeeper's name or phone, with the request id to open.

**Acceptance Scenarios**:

1. **Given** a request with bookings still searching, **When** a goalkeeper accepts one booking more than one hour before the start and the request still has others searching, **Then** the client receives one "goalkeeper assigned" notice (push and inbox) with the match place and time, data to open the request, and no goalkeeper name or contact.
2. **Given** the accepted booking replaces a withdrawn one, **Then** the notice says another goalkeeper was found.
3. **Given** the same assignment event delivered twice, **Then** the client has exactly one notice and one push.
4. **Given** the booking is no longer assigned to that goalkeeper when the notice is processed (cancelled or withdrawn in between), **Then** no "assigned" notice is sent.
5. **Given** the acceptance happens one hour or less before the start, **Then** the same notice also carries that goalkeeper's name and WhatsApp.

---

### User Story 2 - The client learns the request is complete (Priority: P1)

When the last booking of a request gets its goalkeeper, the client gets **one** notice saying the request is complete. More than one hour before the start, it has no names and says when they'll be able to see their goalkeepers; in the last hour, it lists them with their WhatsApp (clarification 4):
- 2 goalkeepers: "¡Listo! Tus 2 porteros están confirmados para el partido en Bello · dom 4 oct, 3:00 p. m. Verás sus datos 1 hora antes."
- 1 goalkeeper: "Tu portero está confirmado …".

This notice **replaces** the "goalkeeper assigned" notice for the acceptance that completes the request, so the client doesn't get two pushes at once (clarification 2). If the request becomes incomplete again and is later completed, the client is told again. That happens when a goalkeeper withdraws and a replacement is searched (018).

**Why this priority**: "Complete" is what the client waits for.

**Independent Test**:
- A 1-goalkeeper request is accepted → exactly one notice, "Tu portero está confirmado", and no separate "assigned" notice.
- A 2-goalkeeper request, with both accepted → one "assigned" notice for the first and one "complete" notice for the second.

**Acceptance Scenarios**:

1. **Given** an acceptance that leaves no booking of the request searching and at least one assigned, **Then** the client receives exactly one "request complete" notice and no "assigned" notice for that acceptance.
2. **Given** a 1-goalkeeper request, **Then** its acceptance produces only the "complete" notice.
3. **Given** a complete request where a goalkeeper withdraws and a replacement is later taken, **Then** the client receives a new "complete" notice.
4. **Given** redeliveries or concurrent deliveries of the events of one completion, **Then** at most one "complete" notice exists for it.
5. **Given** a request with one booking cancelled by the client (017) and the other assigned, **Then** the request counts as complete when its remaining bookings are assigned.

---

### User Story 3 - Client and goalkeeper see each other only in the last hour (Priority: P1)

Before the match is one hour away:
- the client's request shows each booking as "goalkeeper confirmed", without the goalkeeper's name or WhatsApp, and says from when they'll be visible;
- the goalkeeper's agenda shows the match (place, time, pitch location) without the client's name or WhatsApp, and says from when they'll be visible (clarification 3).

From one hour before the start, both see each other's name and WhatsApp, as they did since 012.

**Why this priority**: Without it, a client and a goalkeeper who see each other's contact right after booking can arrange directly, and the client cancels for free. The platform loses the booking (owner rule, clarifications 2 and 3).

**Independent Test**:
- A goalkeeper takes a booking 3 hours before the match. The client's request shows the booking assigned, without name or contact. The goalkeeper's agenda and acceptance answer show no client data. Both show the time from when the contact will be visible.
- With the clock at start − 60 min, both show the name and WhatsApp.

**Acceptance Scenarios**:

1. **Given** an assigned booking and the match more than one hour away, **Then** every client view of the request shows the booking as assigned, with no goalkeeper name or contact, and the moment the contact becomes visible (start − 60 min).
   - The views are: the confirmation answer, the requests list, and the cancellation answer.
2. **Given** the match one hour away or less, **Then** those views show the goalkeeper's name and WhatsApp.
3. **Given** an assigned booking and the match more than one hour away, **Then** every goalkeeper view of it shows no client name or contact, and the moment it becomes visible.
   - The views are: the agenda, the acceptance answer, and the withdrawal answer.
4. **Given** the match one hour away or less, **Then** the goalkeeper views show the client's name and WhatsApp.
5. **Given** any notice sent more than one hour before the start (to the client or the goalkeeper, from this feature or 015–018), **Then** it never includes the other party's name or contact.

---

### User Story 4 - Both parties are told when they can see each other (Priority: P2)

At one hour before the start, the platform tells both sides who the other is:
- the client gets **one** notice for the request with every assigned goalkeeper's name and WhatsApp: "Tu portero para el partido en Bello · 3:00 p. m. es Juan Pérez · WhatsApp +57 300 …" (both, for 2 goalkeepers);
- each assigned goalkeeper gets one notice with the client's name and WhatsApp: "Tu cliente para el partido en Bello · 3:00 p. m. es Ana Ruiz · WhatsApp +57 310 …".

If a booking is taken with less than one hour to go (a late booking, or a replacement taken late), there's nothing to wait for: the contacts are visible at once.
- The client's assignment or complete notice carries the goalkeeper's contact.
- The goalkeeper sees the client's contact in the acceptance answer.

No separate "contacts visible" notice is sent for that booking.

**Why this priority**: It's when they need to coordinate the arrival. Without a notice, each side would have to open the app at the right moment.

**Independent Test**:
- A 2-goalkeeper request fully assigned the day before → at start − 60 min, the client gets one notice with both goalkeepers' contacts, and each goalkeeper gets one with the client's.
- A booking taken 40 minutes before → no separate notice. The client's assignment notice carries the goalkeeper's contact.

**Acceptance Scenarios**:

1. **Given** assigned bookings at start − 60 min, **Then** the client receives exactly one "contacts visible" notice for the request, listing every goalkeeper assigned at that moment.
2. **Given** that, **Then** each of those goalkeepers receives exactly one notice with the client's name and WhatsApp.
3. **Given** a booking assigned after start − 60 min, **Then** no "contacts visible" notice is sent for it. The client's assignment notice carries the goalkeeper's contact.
4. **Given** a request with no assigned booking at start − 60 min, **Then** nothing is sent.
5. **Given** the scheduled check runs twice or late (before the start), **Then** each party still gets exactly one notice. Once the match started, nothing is sent.

---

### Edge Cases

- **Exactly one hour before**: the contact is visible at start − 60 min, inclusive. That's the same instant free cancellation ends.
- **Assignment within the last hour** (a late booking, or a replacement taken late): both contacts are visible right away. The client's notice carries the goalkeeper's contact, and no separate "contacts visible" notice is sent (clarification 4).
- **A booking the goalkeeper no longer holds** (withdrawn, cancelled): the goalkeeper's agenda shows no client contact for it, even in the last hour.
- **Client without devices**: the inbox entry is still created (FCM doesn't guarantee delivery; the inbox does).
- **The client is also a goalkeeper**: they can't take their own request (012), so no self-notice case arises.
- **Two goalkeepers accept both bookings almost at once**: the client gets one "assigned" notice and one "complete" notice, never two "complete". If both events are processed after both assignments, the client gets only the "complete" notice.
- **Late processing**: a notice is not sent after the match ended.
- **Withdrawal notices (018) and outcome notices (016)** are unchanged; they already carry no goalkeeper data.

## Requirements *(mandatory)*

### Functional Requirements

**Notices (Stories 1 and 2)**

- **FR-001**: When a goalkeeper is assigned to a booking of a client's request, and the request still has bookings searching, the client MUST receive one "goalkeeper assigned" notice. It has the match place and local time, and data to open the request and booking.
- **FR-002**: When the assigned booking replaces a withdrawn one, the notice MUST say another goalkeeper was found.
- **FR-003**: When an assignment leaves the request with no booking searching and at least one assigned, the client MUST receive one "request complete" notice **instead of** the "assigned" notice for that assignment. Bookings cancelled, expired or withdrawn don't count as missing.
- **FR-004**: A request completed again after a replacement MUST produce a new "complete" notice. Otherwise there is at most one "complete" notice per request.
- **FR-005**: Client notices about an assignment MUST NOT include the goalkeeper's name or contact before start − 60 min (clarification 2). From then on they MUST include them (clarification 4).
- **FR-006**: Every notice MUST be stored in the client's inbox and pushed to their devices, with a type the app routes by, the request id and the booking id.
- **FR-007**: Every notice MUST be idempotent: redeliveries and concurrent deliveries produce one inbox entry and one push.
- **FR-008**: A notice MUST NOT be sent when its reason no longer holds when it's processed: the booking is no longer assigned to that goalkeeper, or the match already ended.
- **FR-009**: Failures to push MUST NOT lose the inbox entry, and MUST NOT block other consumers of the same events.
- **FR-010**: The notice mechanism MUST be reusable by feature 020 for its "no check-in" notice to the client (clarification 1).

**Contact visibility (Story 3)**

- **FR-011**: Every client view of a request MUST hide the assigned goalkeepers' name and WhatsApp until one hour before the start (start − the free-cancellation period, 60 min in Colombia), and show them from then on. Before that, the booking still shows as assigned.
- **FR-012**: Each assigned booking in those views MUST say from when its goalkeeper's contact is visible.
- **FR-013**: Every goalkeeper view of a booking they hold MUST hide the client's name and WhatsApp until the same moment, and show them from then on, saying from when they're visible (clarification 3). The views are the agenda, the acceptance answer and the withdrawal answer. Available matches and offers already carry no client data (012, 015).
- **FR-014**: No notice to either party MUST include the other party's name or contact before start − 60 min.

**Contacts-visible notices (Story 4)**

- **FR-015**: At start − 60 min, for every request with assigned bookings, the client MUST receive one notice with the name and WhatsApp of every goalkeeper assigned at that moment. Each of those goalkeepers MUST receive one notice with the client's name and WhatsApp.
- **FR-016**: Bookings assigned after start − 60 min MUST NOT produce a separate "contacts visible" notice (FR-005 covers the client; the acceptance answer covers the goalkeeper).
- **FR-017**: The contacts-visible notices MUST be sent exactly once per request (client) and per booking (goalkeeper), whatever the number of runs of the scheduled check. Once the match has started, they MUST NOT be sent.

### Key Entities

- **Client notice**: an inbox entry for the client. It holds:
  - its type (goalkeeper assigned, request complete, contacts visible);
  - title and text;
  - the request and booking ids;
  - a de-duplication key: per booking for "assigned", per request and completion round for "complete", per request (client) and per booking (goalkeeper) for "contacts visible".
- **Goalkeeper notice**: "contacts visible", with the client's name and WhatsApp, in the goalkeeper's inbox.
- **Contact**: name and WhatsApp (012). The goalkeeper's is visible to the client, and the client's to the goalkeeper, only from start − 60 min.
- **Event consumed**: "goalkeeper assigned" (012).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 95% of clients are notified within 10 seconds of a goalkeeper accepting their booking.
- **SC-002**: 100% of completed requests produce exactly one "complete" notice per completion, and 0 duplicate pushes under redelivery.
- **SC-003**: 100% of notices open the right request in the app (they carry its id).
- **SC-004**: 0 notices are sent for a booking that was no longer assigned when the notice was processed.
- **SC-005**: Every notice is in the client's inbox even when the push fails.
- **SC-006**: 0 views or notices reveal a goalkeeper's contact to the client, or a client's contact to the goalkeeper, earlier than one hour before the match.
- **SC-007**: 100% of requests with assigned bookings at start − 60 min produce one notice to the client and one to each goalkeeper, within 2 minutes of that moment.

## Assumptions

- **Withdrawal**: the notice "your goalkeeper withdrew" already ships in 018, with "ya estamos buscando otro" instead of "search again" (018, clarification 3). It's not rebuilt here.
- **"One hour before"** is the request's free-cancellation deadline (start − 60 min in Colombia, configurable per country/city). Once a client can no longer cancel for free, knowing each other no longer risks a cancellation.
- **Texts** are in Spanish, with the match's place and local time, like 015–018. The inbox is the existing one (90 days).
- **No quiet hours**, like 015.
- **Out of scope**:
  - other goalkeeper-side notices (done in 015–018);
  - rating reminders (021, no push);
  - the check-in and its "no check-in at start + 15 min" notice (020, clarification 1).
