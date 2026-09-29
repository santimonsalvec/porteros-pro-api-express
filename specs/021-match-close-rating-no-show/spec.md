# Feature Specification: Match Close, Minimal Rating and No-shows

**Feature Branch**: `021-match-close-rating-no-show`
**Created**: 2026-09-29
**Status**: Draft
**Input**: User description: "Spec 021 de _temp_plan.md" — "Cierre del partido, calificación mínima y detección de inasistencias. Requisitos: (1) Al llegar inicio + duración, cada reserva asignada pasa a completada (barrido programado, exactamente una vez). (2) Calificación mínima, solo cliente → portero y portero → cliente: el cliente responde "¿llegó tu portero?" (sí/no), estrellas y comentario; el portero responde "¿recibiste el pago?" (sí/no), estrellas y comentario. La calificación pendiente se muestra al abrir la app (sin push). Una calificación por parte y por reserva. (3) Inasistencia: si el portero no hizo check-in y el cliente no lo califica dentro de 1 hora desde el fin del partido (configurable), se registra como inasistencia y se aplica la política de penalidades de retiro con menos de 2 h (incluye el conteo semanal); la comisión no se devuelve. Si el cliente responde que sí llegó, no hay inasistencia. (4) Si el cliente responde que el portero no llegó, o el portero que no recibió el pago, se abre un caso (PQRS) para revisión manual. (5) Endpoints de administración (rol admin, sin interfaz todavía) para listar y resolver casos. Los criterios detallados de calificación (puntualidad, respeto, indumentaria, habilidades) quedan para una feature posterior."

**Context**: Step 021 of the goalkeeper-guarantee roadmap (repository-root `_temp_plan.md`, §2.8–§2.9). It builds on:
- 020: the check-in is the proof of attendance, and "no check-in" is recorded at start + 15 min. Arriving after that counts as not attending unless the client says the goalkeeper came (020, clarification 1).
- 018:
  - the penalty policy, applied to a no-show as a withdrawal with less than 2 hours' notice;
  - the incidents record, which already anticipates no-shows;
  - the administrator's reversal.
- 013: the every-minute sweep.
- 012 and 019: assigned bookings, and the contacts visible from one hour before.

## Clarifications

### Session 2026-09-29

- Q: When the client answers "no" and the goalkeeper didn't check in, is the goalkeeper penalized right away? → A: Yes. The no-show is recorded immediately (3-day suspension, counts toward the weekly limit) and a case is opened. Without a check-in the platform has no proof of attendance, and the client's answer confirms it. An administrator can reverse it (018) if the case shows it was wrong.
- Q: Are ratings (stars) shown or used for anything in this version? → A: No, they're private. They're stored for operations and future features. There are no visible averages and no effect on offers: with few ratings at the start, an average would mislead, and the detailed criteria are still in the backlog.

## User Scenarios & Testing *(mandatory)*

The users are:
- the **client**, who says whether the goalkeeper came and rates them;
- the **goalkeeper**, who says whether they were paid and rates the client;
- the **operations team** (administrators), who review disputes.

### User Story 1 - The match closes on its own (Priority: P1)

When a match reaches its end (start + duration), every booking still assigned becomes **completed**, exactly once, whatever happened at the pitch. The request then shows as completed, and the rating becomes due for both sides.

**Why this priority**: Completion is what opens the rating and the no-show check. Without it, bookings stay "assigned" forever.

**Independent Test**: An assigned booking whose match ended → it's completed within one scheduled run, and a second run changes nothing. A booking that was cancelled, expired or withdrawn is untouched.

**Acceptance Scenarios**:

1. **Given** an assigned booking at start + duration, **Then** it becomes completed, with the moment it was completed.
2. **Given** the scheduled check running twice or late, **Then** each booking is completed exactly once.
3. **Given** bookings that ended otherwise (cancelled, expired, withdrawn), **Then** they are never completed.
4. **Given** all the request's assigned bookings completed, **Then** the request shows as completed.

---

### User Story 2 - Client and goalkeeper rate each other (Priority: P1)

After the match, each side rates the other once per booking:
- the client: "¿Llegó tu portero?" (yes/no), 1–5 stars and an optional comment;
- the goalkeeper: "¿Recibiste el pago?" (yes/no), 1–5 stars and an optional comment.

A pending rating is shown when the user opens the app (no push). The client can rate as soon as the goalkeeper checked in; otherwise, once the match ended.

**Why this priority**: The rating is the client's word on attendance, which decides no-shows. It's also the goalkeeper's word on payment, which the platform can't see.

**Independent Test**:
- After a completed booking, both sides see one pending rating each.
- Each rates once; a second rating is refused.
- The pending list empties.

**Acceptance Scenarios**:

1. **Given** a completed booking, or a checked-in one, **Then** the client has a pending rating for its goalkeeper. **Given** a completed booking, **Then** the goalkeeper has a pending rating for its client.
2. **Given** a rating with the yes/no answer and 1–5 stars (comment optional, up to 500 characters), **Then** it's recorded once for that side and booking.
3. **Given** a second rating by the same side for the same booking, **Then** it's refused, and the first one stands.
4. **Given** a booking the user isn't part of, or one that never had that goalkeeper (cancelled before, withdrawn), **Then** rating is refused.
5. **Given** the app opens, **Then** it can list the user's pending ratings, newest match first, with enough to show the match (place, time, the other party's name).
6. **Given** more than 7 days after the match, **Then** the rating is no longer pending, and it's refused.

---

### User Story 3 - No-shows are detected and penalized (Priority: P1)

One hour after the match ended (configurable per country), the platform settles attendance for each completed booking:
- **checked in** → attended;
- **no check-in, and the client answered "yes, they came"** → attended;
- **no check-in, and the client didn't rate by then** → **no-show**;
- **no check-in, and the client answered "no"** → **no-show**, plus a case (Story 4).

A no-show applies the penalty policy exactly like a withdrawal with less than 2 hours' notice (018):
- a 3-day suspension;
- it counts toward the "3 in 7 days" limit;
- no commission refund.

The goalkeeper is told they were marked as a no-show, and until when they're suspended.

**Why this priority**: A goalkeeper who doesn't come is the worst outcome for the client. Without a consequence, the guarantee is empty.

**Independent Test**:
- A completed booking with no check-in and no rating → at end + 1 h it's a no-show, the goalkeeper is suspended 3 days, and the no-show appears in their withdrawals/penalties history.
- With a check-in, or with the client's "yes", → no no-show.

**Acceptance Scenarios**:

1. **Given** no check-in and no client rating at end + 60 min, **Then** a no-show is recorded once. The policy applies a 3-day suspension and counts it toward the weekly limit, and the goalkeeper gets a notice (push and inbox).
2. **Given** a check-in, **Then** never a no-show, whatever the rating.
3. **Given** no check-in and the client's "yes" before end + 60 min, **Then** no no-show.
4. **Given** no check-in and the client's "no", at any time before end + 60 min, **Then** a no-show is recorded right away, and a case is opened.
5. **Given** the scheduled check running twice or late, **Then** at most one no-show per booking.
6. **Given** a no-show, **Then** it appears in the goalkeeper's and the administrators' history (018), and an administrator can reverse it like a withdrawal's penalty. It then stops counting toward the weekly limit.

---

### User Story 4 - Disputes open a case for manual review (Priority: P2)

A case is opened for operations when:
- the client says the goalkeeper **didn't come** (whether or not they checked in);
- or the goalkeeper says they **weren't paid**.

Administrators can list the cases (open first) and resolve each one with a mandatory resolution note. Reversing the penalty of a no-show uses the existing reversal (018).

**Why this priority**: Both answers point to something the platform can't verify on its own: a checked-in goalkeeper the client says never came, or a client who didn't pay.

**Independent Test**: A client's "no" → one open case with the booking, the parties and the answer. An administrator resolves it with a note → it's closed and shows who, when and the note.

**Acceptance Scenarios**:

1. **Given** a client's "no", **Then** one case of type "goalkeeper didn't come" is opened. It holds the booking, request, client, goalkeeper, the check-in (if any) and the rating.
2. **Given** a goalkeeper's "no", **Then** one case of type "payment not received" is opened.
3. **Given** an administrator, **Then** they can list cases (filter by status, open first, paginated) and see one case's detail.
4. **Given** an administrator resolves an open case with a note (3–500 characters), **Then** it's closed with who, when and the note. Resolving it again is refused, as already resolved.
5. **Given** a non-administrator, **Then** the case endpoints are refused.

---

### Edge Cases

- **The client rates "yes" after the no-show was already recorded** (after end + 60 min): the no-show stands. The rating is kept, and a case is opened so operations can review and, if fair, reverse it (018).
- **A goalkeeper who withdrew or was replaced**: only the goalkeeper who held the booking at the end is rated and checked. A withdrawn booking is never completed, rated or checked for no-shows.
- **A 2-goalkeeper request**: each booking is completed, rated and checked on its own.
- **The client never rates, but the goalkeeper checked in**: attended. The client's rating simply stays pending until it expires (7 days).
- **Both sides say "no"** (goalkeeper not paid, client says they didn't come): two cases, one per answer.
- **Suspension already in force**: the no-show's penalty follows 018. The latest end wins; suspensions don't add up.
- **Country values**: the no-show grace period (60 min) is per country, like 018's and 020's values, with the Colombia default.

## Requirements *(mandatory)*

### Functional Requirements

**Close (Story 1)**

- **FR-001**: At start + duration, every assigned booking MUST become completed, exactly once, recording when. Bookings in other states are never completed.
- **FR-002**: The request MUST show as completed when its bookings that were assigned are completed.

**Rating (Story 2)**

- **FR-003**: The client MUST be able to rate the goalkeeper of a booking once:
  - "did they come" (yes/no);
  - 1–5 stars;
  - an optional comment of up to 500 characters.

  It's available from the check-in, or from the end if there was none, until 7 days after the match.
- **FR-004**: The goalkeeper MUST be able to rate the client of a completed booking once, until 7 days after the match:
  - "were you paid" (yes/no);
  - 1–5 stars;
  - an optional comment of up to 500 characters.
- **FR-005**: Each user MUST be able to list their pending ratings (not yet given, still in time), with the match place and time and the other party's name. No push is sent for pending ratings.
- **FR-006**: Ratings MUST be refused for users who aren't that side of the booking, for bookings the goalkeeper didn't hold at the end, for repeats, and after 7 days.
- **FR-006a**: Ratings MUST NOT be shown to other users or change eligibility or offers (clarification 2). Only the rating's author and administrators see it.

**No-shows (Story 3)**

- **FR-007**: At end + the grace period (60 min, per country), each completed booking without a check-in and without the client's "yes" MUST be recorded as a no-show, at most once.
- **FR-008**: The client's "no" on a booking without a check-in MUST record the no-show immediately, even before the grace period ends, and open a case (clarification 1).
- **FR-009**: A no-show MUST apply the penalty policy as a late withdrawal (018): a 3-day suspension, counting toward the weekly limit. No commission refund. It's recorded in the goalkeeper's incidents history, reversible by an administrator like a withdrawal.
- **FR-010**: The goalkeeper MUST receive one notice (push and inbox) of the no-show, with the suspension end.

**Cases (Story 4)**

- **FR-011**: A case MUST be opened, once per answer, when:
  - the client answers "no";
  - the goalkeeper answers "no";
  - or the client answers "yes" after a no-show was already recorded.
- **FR-012**: A case MUST hold:
  - its type;
  - the booking, request, client and goalkeeper;
  - the rating that opened it;
  - the check-in, if any;
  - its status (open/resolved);
  - its resolution (who, when, note).
- **FR-013**: Administrators MUST be able to list cases (by status, open first, paginated), see one, and resolve an open one with a mandatory note (3–500 characters). The endpoints MUST be refused to non-administrators.

### Key Entities

- **Completed booking**: a booking whose match ended while assigned, with its completion time.
- **Rating**: one per side and booking. It holds the side (client→goalkeeper, goalkeeper→client), the yes/no answer, the stars, the comment and when.
- **No-show**: an incident of the goalkeeper for a booking, of kind "no-show", in the same record as withdrawals (018). It carries the penalties the policy applied.
- **Case**: a dispute for manual review. It holds:
  - its type ("goalkeeper didn't come", "payment not received", "late attendance claim");
  - its links (booking, request, parties, rating, check-in);
  - its status and resolution.
- **Grace period**: minutes after the end to wait for the client's answer (60, per country).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of assigned bookings are completed within 2 minutes of their end, exactly once.
- **SC-002**: A user can give a rating in under 30 seconds (one answer, stars, optional comment).
- **SC-003**: 100% of completed bookings without a check-in or the client's "yes" become a no-show within 2 minutes of the end of the grace period. 0 bookings with a check-in ever do.
- **SC-004**: 100% of "no" answers open exactly one case.
- **SC-005**: An administrator can find and resolve an open case in under 2 minutes.

## Assumptions

- **Ratings are private** (clarification 2): stored for operations and future features. Visible averages, public profiles and any effect on offers are out of scope, and so are the detailed criteria (backlog).
- **No push for pending ratings** (roadmap): the app asks when opened.
- **7 days** is the rating deadline, after which a rating is no longer pending.
- **The no-show penalty** is exactly 018's policy with the "late" flag. Country values and the weekly count are shared with withdrawals. 018's reversal endpoint also reverses no-shows.
- **The grace period** lives with the other country values (booking settings), default 60 minutes.
- **Cases** have no messaging, assignment or SLA here. Operations contacts the parties outside the platform.
- **Out of scope**:
  - refunds on a case: the money side is resolved by 018's reversal when fair;
  - payments to or from clients;
  - rating criteria;
  - showing ratings to other users.
