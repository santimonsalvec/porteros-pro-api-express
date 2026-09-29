# Feature Specification: Goalkeeper Check-in with Photo

**Feature Branch**: `020-goalkeeper-check-in`
**Created**: 2026-09-29
**Status**: Draft
**Input**: User description: "Spec 020 de _temp_plan.md" — "Confirmación de llegada del portero. Requisitos: (1) Entre inicio − 30 min e inicio + 15 min (configurable), el portero asignado puede hacer check-in en la reserva enviando una foto (almacenamiento de imágenes existente) y la ubicación del teléfono; la ubicación se guarda como evidencia pero no bloquea el check-in. (2) El check-in es idempotente y queda visible para el cliente en su solicitud. (3) Si a inicio + 15 min no hay check-in, se avisa al cliente (push + bandeja) con el WhatsApp del portero, reutilizando el mecanismo de avisos al cliente de la 019."

**Context**: Step 020 of the goalkeeper-guarantee roadmap (repository-root `_temp_plan.md`, §2.8). It builds on:
- 002: image storage;
- 012: the assigned booking;
- 013: the every-minute sweep;
- 019: client notices (`notifyOnce`) and the rule that client and goalkeeper see each other's contact only from one hour before;
- 007/010: per-country booking settings.

Feature 021 (close, rating and no-show) uses the check-in as the proof of attendance.

## Clarifications

### Session 2026-09-29

- Q: What happens when the goalkeeper arrives after start + 15 min? → A: Nothing new: the window closes at start + 15 min, and after that there's no check-in. Owner's reason: arriving 15 minutes late to a 60-minute match is as bad as not coming, and the service is only good if goalkeepers are punctual. The client's rating or the no-show rule (021) settles it.
- Q: Is the goalkeeper reminded to check in? → A: Yes, twice. When the window opens (start − 30 min): "Ya puedes confirmar tu llegada". At start + 5 min, only if they haven't checked in: "Te quedan 10 minutos para confirmar tu llegada".
- Q: Does the client see the check-in photo? → A: Yes. The client sees the check-in time and the photo, which confirms it's their goalkeeper at the right pitch and serves as evidence for 021's rating. The location stays for operations only.

## User Scenarios & Testing *(mandatory)*

The users are:
- the **goalkeeper**, who proves they arrived;
- the **client**, who wants to know their goalkeeper is there, or how to reach them if not.

### User Story 1 - The goalkeeper checks in at the pitch with a photo (Priority: P1)

From 30 minutes before the start until 15 minutes after it, the assigned goalkeeper opens the booking and checks in. They send a photo taken at the pitch and the phone's location. The location is stored as evidence, but it never blocks the check-in, even if it's far from the pitch or missing. A repeat changes nothing.

**Why this priority**: The check-in is the platform's proof that the goalkeeper attended. Without it, feature 021 can't tell attendance from a no-show, and the client has no confirmation.

**Independent Test**:
- An assigned goalkeeper checks in 10 minutes before the start with a photo and a location → the booking records the check-in (time, photo, location, distance to the pitch).
- Repeating it answers the same.
- Outside the window, or for someone else's booking, it's refused.

**Acceptance Scenarios**:

1. **Given** a booking assigned to the goalkeeper, **When** they check in between start − 30 min and start + 15 min (inclusive), with a valid photo and a location, **Then** the check-in is recorded:
   - the time;
   - the photo;
   - the location, and its distance to the pitch.
2. **Given** a check-in without a location, or with a location far from the pitch, **Then** it's still recorded. The missing or far location is kept as evidence (FR-003).
3. **Given** a check-in already recorded, **When** the goalkeeper checks in again, **Then** the answer is the recorded check-in, and nothing changes.
4. **Given** a check-in before start − 30 min or after start + 15 min, **Then** it's refused and says when the window opens or that it closed.
5. **Given** a booking the goalkeeper doesn't hold (someone else's, cancelled, withdrawn or expired), **Then** it's refused.
6. **Given** a file that isn't an image, or is too large, **Then** it's refused and nothing is recorded.

---

### User Story 2 - The client sees that their goalkeeper arrived (Priority: P1)

Once the goalkeeper checks in, the client's request shows that booking as "arrived", with the check-in time and the photo. The client also gets a notice: "Tu portero llegó a la cancha".

**Why this priority**: It's the confirmation the client is waiting for in the minutes before the match, and it closes the loop of the guarantee.

**Independent Test**: After a check-in, the client's request shows the booking as arrived with the time and the photo, and the client has one "arrived" notice.

**Acceptance Scenarios**:

1. **Given** a checked-in booking, **Then** every client view of the request shows its check-in time and the photo.
2. **Given** a check-in, **Then** the client receives exactly one notice (push and inbox) with data to open the request.
3. **Given** a check-in repeated or redelivered, **Then** still one notice.
4. **Given** the goalkeeper's location, **Then** the client does **not** see it. It's evidence for operations, not shared.

---

### User Story 3 - The client is told when the goalkeeper hasn't checked in (Priority: P1)

At 15 minutes after the start, if an assigned booking has no check-in, the client gets a notice with the goalkeeper's name and WhatsApp: "Tu portero Juan Pérez no ha confirmado su llegada al partido en Bello. Escríbele: +57 300 …". The contacts are visible by then (019).

**Why this priority**: It gives the client an immediate way to reach the goalkeeper when it matters most.

**Independent Test**: An assigned booking without check-in → at start + 15 min the client gets exactly one notice with the goalkeeper's WhatsApp. A checked-in booking → nothing.

**Acceptance Scenarios**:

1. **Given** an assigned booking with no check-in at start + 15 min, **Then** the client receives exactly one "no check-in" notice (push and inbox) with the goalkeeper's name and WhatsApp and the match, and data to open the request.
2. **Given** a checked-in booking, **Then** no such notice.
3. **Given** the scheduled check running twice or late, **Then** still one notice. None once the match ended.
4. **Given** a 2-goalkeeper request where one checked in and the other didn't, **Then** one notice for the missing one only.

---

### User Story 4 - The goalkeeper is reminded to check in (Priority: P2)

Punctuality is part of the service, and there's no check-in after the window (clarification 1). So the platform reminds the goalkeeper twice (clarification 2):
- when the window opens (start − 30 min): "Ya puedes confirmar tu llegada al partido en Bello · 3:00 p. m.";
- at start + 5 min, only if they still haven't checked in: "Te quedan 10 minutos para confirmar tu llegada".

**Why this priority**: It keeps a goalkeeper who is at the pitch but forgot the check-in from being treated as a no-show (021).

**Independent Test**: An assigned booking → the goalkeeper gets one reminder at start − 30 min. Without a check-in, a second one at start + 5 min. With a check-in before start + 5 min, no second one.

**Acceptance Scenarios**:

1. **Given** an assigned booking at start − 30 min, **Then** its goalkeeper receives exactly one "window open" reminder (push and inbox) with data to open the booking.
2. **Given** no check-in at start + 5 min, **Then** the goalkeeper receives exactly one "10 minutes left" reminder.
3. **Given** a check-in before start + 5 min, **Then** no second reminder.
4. **Given** a booking assigned inside the window (a replacement taken late), **Then** the "window open" reminder is sent at once. The second one follows the same rule.
5. **Given** the scheduled check running twice or late, **Then** each reminder is sent at most once. None is sent for a booking no longer assigned, or after the window closed.

---

### Edge Cases

- **Exactly at start − 30 or start + 15**: allowed (inclusive).
- **Check-in after the "no check-in" notice** is impossible: the window closes at the same instant the notice fires.
- **A goalkeeper who arrives after start + 15 min** can't check in (clarification 1). The app tells them the window closed. Lateness beyond 15 minutes counts as not attending, unless the client's rating says they came (021).
- **The goalkeeper withdraws** (018) before checking in: the booking is no longer theirs, so check-in is refused. The replacement's goalkeeper checks in on the replacement booking.
- **The client cancels** in the window: not possible for assigned bookings in the last hour (017), so the check-in window is always on a booking the client can't cancel.
- **Photo uploaded but the check-in fails** (e.g. window closed): nothing is recorded. The orphan photo is cleaned up like any unused image.
- **Location permission denied**: the check-in goes through without location, and that's recorded.
- **Clock skew on the phone**: the platform's time decides the window, never the phone's.

## Requirements *(mandatory)*

### Functional Requirements

**Check-in (Story 1)**

- **FR-001**: The goalkeeper assigned to a booking MUST be able to check in from start − 30 min to start + 15 min, inclusive, measured on the platform's clock. The two values are configurable per country, with the Colombia defaults.
- **FR-002**: A check-in MUST include a photo (an image, validated like the platform's other images). It MAY include the phone's location (latitude, longitude, accuracy).
- **FR-003**: The location MUST NOT block the check-in. The platform MUST store it with its distance to the pitch, or record that it was missing.
- **FR-004**: The check-in MUST be recorded once per booking. A repeat MUST answer the recorded check-in, and change nothing.
- **FR-005**: A check-in MUST be refused, recording nothing, for:
  - a booking the goalkeeper doesn't hold, or that isn't assigned;
  - a time outside the window, saying when it opens or that it closed;
  - an invalid photo.

**Visibility and notices (Stories 2 and 3)**

- **FR-006**: The client's views of the request MUST show, for each checked-in booking, the check-in time and the photo (clarification 3). The location MUST NOT be shown to the client.
- **FR-006a**: Only the client of the request, the goalkeeper who took it and administrators MAY see the check-in photo.
- **FR-007**: The goalkeeper's agenda MUST show whether they checked in and when.
- **FR-008**: A check-in MUST produce one "goalkeeper arrived" notice to the client (push and inbox), idempotent.
- **FR-009**: At start + 15 min, for each assigned booking without a check-in, the client MUST receive one "no check-in" notice with the goalkeeper's name, WhatsApp and the match. It's exactly once per booking, and never after the match ended. It reuses 019's notice mechanism.
- **FR-010**: Each check-in and each "no check-in" MUST be recorded as a fact that feature 021 can rely on (attendance evidence).

**Reminders (Story 4)**

- **FR-011**: When the check-in window opens, the goalkeeper of each assigned booking MUST receive one reminder (push and inbox) with data to open the booking (clarification 2). A booking assigned after the window opened gets it at once.
- **FR-012**: At start + 5 min, the goalkeeper of each assigned booking without a check-in MUST receive one "10 minutes left" reminder (clarification 2).
- **FR-013**: Each reminder MUST be sent at most once per booking. None is sent for a booking no longer assigned, or once the window closed.

### Key Entities

- **Check-in**: one per booking. It holds:
  - the goalkeeper and the booking;
  - the time;
  - the photo;
  - the location (or its absence);
  - its distance to the pitch.
- **Check-in window**: start − 30 min to start + 15 min, per country (booking settings).
- **"No check-in" mark**: that the notice for a booking was sent at start + 15 min (so it's sent once).
- **Notices**:
  - to the client: "goalkeeper arrived" and "no check-in";
  - to the goalkeeper: "window open" and "10 minutes left" (Story 4).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A goalkeeper can check in in under 1 minute from opening the booking (one photo, one action).
- **SC-002**: 100% of check-ins inside the window are accepted whatever the location, and 100% outside it are refused.
- **SC-003**: The client sees the arrival within 10 seconds of the check-in.
- **SC-004**: 100% of assigned bookings without a check-in at start + 15 min produce exactly one notice to the client, within 2 minutes.
- **SC-005**: 0 duplicate check-ins or notices under repeats or redeliveries.
- **SC-006**: 100% of assigned goalkeepers get the "window open" reminder within 2 minutes of start − 30 min. 100% of those without a check-in get the second reminder within 2 minutes of start + 5 min.

## Assumptions

- **The photo** goes through the existing image storage (002), with the same formats and size limits, and belongs to the goalkeeper.
- **The distance to the pitch** is computed from the match's coordinates (the request's point). It's informational only. The operations team uses it, not the client.
- **The window values** live in the country's booking settings, like 018's penalty values: a missing value falls back to the Colombia default (−30 / +15), with a warning.
- **After start + 15 min** no check-in is possible (clarification 1: punctuality is part of the service). Whether the goalkeeper actually came is then settled by the client's rating, or by the no-show rule (021).
- **The client's name and WhatsApp** are not part of this feature's notices to the goalkeeper. The goalkeeper already sees them from one hour before (019).
- **Out of scope**:
  - completing the booking;
  - the rating;
  - no-show penalties and cases (all 021).
