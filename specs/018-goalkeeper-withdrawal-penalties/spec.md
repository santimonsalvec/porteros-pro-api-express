# Feature Specification: Goalkeeper Withdrawal, Penalties and Suspensions ✅

**Feature Branch**: `018-goalkeeper-withdrawal-penalties`
**Created**: 2026-09-28
**Status**: ✅ Implemented — merged into `main` on 2026-09-28. Manual checks deferred to the end of the roadmap (`_temp_pruebas.md`).
**Input**: User description: "Spec 018 de _temp_plan.md" — "El portero se retira de una reserva que aceptó. Requisitos: (1) El portero puede retirarse en cualquier momento antes del partido (incluida fuerza mayor). La comisión cobrada no se devuelve. La reserva termina en estado "retiro del portero" y no se reabre; al cliente no se le cobra nada y recibe aviso para que haga una nueva búsqueda. (2) Penalidades (valores configurables por país): retiro con menos de 2 h de anticipación → 3 días sin ver partidos ni recibir ofertas; con más de 2 h → sin suspensión; al 3.er retiro en cualquier ventana de 7 días consecutivos → además, 7 días sin recibir ofertas. Las suspensiones no se suman: rige la que termina más tarde. (3) Registro de cada retiro con su anticipación y las penalidades aplicadas. (4) Endpoints de administración (rol admin, sin interfaz todavía) para listar retiros y penalidades de un portero y revertir una penalidad (devolución tipificada en la billetera y/o levantar la suspensión), con motivo obligatorio. (5) La regla de penalidades es una política de dominio reutilizable: la feature de inasistencia la aplicará igual que un retiro con menos de 2 h."

**Context**: Step 018 of the goalkeeper-guarantee roadmap (repository-root `_temp_plan.md`, §2.6). It builds on:
- 012: acceptance, which charges the commission, and the suspension that already hides matches and blocks accepting;
- 011: the wallet;
- 013: events;
- 015: offers, which exclude suspended goalkeepers;
- 016 and 017: the lifecycle store, the shared refund and the outcome notices.

Feature 021 (no-show) will reuse the penalty rule defined here.

## Clarifications

### Session 2026-09-28

- Q: Do all suspensions have the same effect? → A: Yes. The late-withdrawal and the weekly-limit suspensions both mean what "suspended" already means since 012 and 015: no available matches, no offers, and the goalkeeper can't accept. One suspension end date, the latest one in force.
- Q: Does a withdrawal whose penalty an administrator reversed still count toward the "3 in 7 days" limit? → A: No. Once an administrator reverses its money or lifts its suspension, that withdrawal stops counting for future weekly-limit checks: force majeure is forgiven entirely.
- Q: When a goalkeeper withdraws, does the platform search for a replacement automatically or ask the client to search again? → A: Automatically. The withdrawn booking ends, and right away a replacement booking is created in the same request, with the same price, commission and search end, and offered to eligible goalkeepers like any new booking (015). The client is told "Tu portero se retiró; ya estamos buscando otro". If the search time is already over, no replacement is created, and the client is told it couldn't be replaced. Rationale (owner): confirm a goalkeeper as fast as possible so the client doesn't look elsewhere.

## User Scenarios & Testing *(mandatory)*

The users are the **goalkeeper**, who can no longer make a match; the **client**, who must find another goalkeeper quickly; and the **operations team** (administrators), who review force-majeure cases and can reverse a penalty.

### User Story 1 - A goalkeeper withdraws from a match they took, and the client is told (Priority: P1)

A goalkeeper who can't make a match they accepted withdraws from it, at any time before it starts, force majeure included. The booking ends as **"goalkeeper withdrew"**. The commission they paid is **not refunded**: that's the money penalty, and there is no extra charge. The client pays nothing.

Right away, the platform **searches for a replacement** (clarification 3). A new booking is created in the same request, with the same price, the same commission and the same search end, and it's offered to eligible goalkeepers exactly like a new booking (first notification and reminders, 015). The goalkeeper who withdrew can't take it. The client is told "Tu portero se retiró del partido en Bello · …; ya estamos buscando otro". If the search time is already over (less than the travel margin before the start), no replacement is created, and the client is told it couldn't be replaced, so they can decide. In a 2-goalkeeper request, the other goalkeeper stays.

**Why this priority**: Without it, a goalkeeper who can't come simply doesn't show up, and the client finds out at the pitch. An explicit withdrawal plus an automatic replacement search gives the best chance of still covering the match, without the client doing anything.

**Independent Test**:
- A goalkeeper withdraws from an assigned booking 3 hours before: the booking is "goalkeeper withdrew", and their balance is unchanged (the commission stays charged).
- A replacement booking now appears in other eligible goalkeepers' available matches and offers, with the same price, but not for the goalkeeper who withdrew.
- The client gets one notice saying a replacement is being searched.
- A withdrawal 20 minutes before (search already over): no replacement, and the client is told it couldn't be replaced.

**Acceptance Scenarios**:

1. **Given** a booking assigned to the goalkeeper, **When** they withdraw before the start, **Then** it becomes "goalkeeper withdrew" (who, when, how long before the start, and an optional reason), and a "goalkeeper withdrew" event is recorded.
2. **Given** the withdrawal, **Then** no commission is refunded, and the client is charged nothing.
3. **Given** a withdrawal before the search end (start − travel margin), **Then** one replacement booking is created in the same request (same price, commission and search end, pending), and it's offered to eligible goalkeepers as a new booking. The goalkeeper who withdrew is not eligible for it.
4. **Given** that, **Then** the client receives one notice (push and inbox): "Tu portero se retiró; ya estamos buscando otro", with data to open the request.
5. **Given** a withdrawal at or after the search end, **Then** no replacement is created, and the client receives one notice that the goalkeeper withdrew and couldn't be replaced.
6. **Given** the withdrawn booking itself, **Then** it is never offered again, and the other bookings of the request are unaffected.
7. **Given** the same withdrawal repeated, **Then** it answers the same, with no second penalty, replacement, event or notice.
8. **Given** a booking the goalkeeper doesn't hold, a booking not assigned any more (cancelled, expired), or a match that already started, **Then** the withdrawal is refused with a clear reason, and nothing changes.

---

### User Story 2 - Late or repeated withdrawals suspend the goalkeeper (Priority: P1)

The platform applies penalties automatically, with values configurable per country (Colombia defaults):
- A withdrawal **less than 2 hours** before the start → the goalkeeper is **suspended for 3 days**.
- A withdrawal **2 hours or more** before → no suspension.
- The **3rd withdrawal within any 7 consecutive days** (a rolling window) → additionally, a **7-day suspension**, whatever the notice.
- Suspensions **don't add up**: the goalkeeper is suspended until the latest end among the suspensions in force.

Every suspension has the same effect (clarification 1): while suspended, the goalkeeper sees no available matches, receives no offers and can't accept, which is what "suspended" already means since 012 and 015. Their agenda is unaffected.

The goalkeeper is told when a withdrawal suspends them, and until when.

**Why this priority**: Withdrawals hurt clients, especially late ones. The penalties make them rare without forbidding them, which keeps the promise of finding a goalkeeper credible.

**Independent Test**:
- A withdrawal 90 minutes before → suspended 3 days from the withdrawal, and available matches say "suspended until …".
- A withdrawal 5 hours before → not suspended.
- Three withdrawals within 7 days, the last one 5 hours before → suspended 7 days.
- A late 3rd withdrawal (both rules) → suspended until the later of the two ends.

**Acceptance Scenarios**:

1. **Given** a withdrawal less than the late threshold (2 h) before the start, **Then** a 3-day suspension penalty is recorded, and the goalkeeper's suspension end becomes the later of the current end and now + 3 days.
2. **Given** a withdrawal at or more than 2 hours before, **Then** no suspension comes from the notice rule.
3. **Given** a withdrawal that makes it the 3rd within the last 7 days (counting it), **Then** a 7-day suspension penalty is recorded as well.
4. **Given** overlapping suspensions, **Then** the goalkeeper is suspended until the latest end, never the sum.
5. **Given** a suspension is applied, **Then** the goalkeeper receives a notice saying they are suspended and until when.
6. **Given** a suspended goalkeeper, whichever rule suspended them, **Then** until the end they see no available matches, receive no offers, and accepting is refused as suspended.

---

### User Story 3 - Every withdrawal and penalty is on record (Priority: P2)

Every withdrawal is recorded with the booking, the request, when it happened, how long before the start, the optional reason, and the penalties it caused. The goalkeeper can see their own withdrawals and penalties: dates, suspensions and until when. So can the administrators.

**Why this priority**: Penalties need to be explainable, to the goalkeeper who asks "why can't I see matches?" and to operations handling force-majeure claims.

**Independent Test**: After two withdrawals, one late, the goalkeeper's history lists both, with their notice and the 3-day suspension attached to the late one.

**Acceptance Scenarios**:

1. **Given** withdrawals, **Then** each is listed newest first, with its match, notice, reason and penalties.
2. **Given** a goalkeeper, **Then** they see only their own history.

---

### User Story 4 - An administrator reverses a penalty (Priority: P2)

For force majeure or an error, an administrator can **reverse** a withdrawal's penalty, with a **mandatory reason**:
- the **money**: the goalkeeper gets the commission of that booking refunded (a typed refund: by an administrator, when, the reason);
- and/or the **suspension**: its effect is lifted, and the goalkeeper's suspension end is recomputed from the penalties still in force.

A withdrawal with any reversal (money or suspension) **stops counting** toward the "3 in 7 days" limit from then on (clarification 2).

The endpoints exist now; the admin interface comes later.

**Why this priority**: Real force majeure happens (an accident, an illness). Without a reversal path, a fair goalkeeper keeps an unfair suspension or loses money for good.

**Independent Test**:
- An admin reverses the money and the suspension of a late withdrawal with a reason: the goalkeeper's balance goes back up by the commission, the suspension is lifted, and the history shows the reversal with who, when and why.
- Reversing again changes nothing.

**Acceptance Scenarios**:

1. **Given** a withdrawal, **When** an administrator reverses its money with a reason, **Then** the goalkeeper gets exactly one refund of that booking's commission (by an administrator, with the reason), and a second reversal refunds nothing.
2. **Given** a suspension penalty, **When** an administrator lifts it with a reason, **Then** the goalkeeper's suspension end becomes the latest end among the suspensions still in force (or none), immediately.
3. **Given** a reversal without a reason, **Then** it's refused.
4. **Given** a non-administrator, **Then** these endpoints are refused.
5. **Given** a reversal, **Then** it's recorded on the penalty (who, when, reason) and visible in both histories.

---

### Edge Cases

- **Withdrawal from a "cancel all" request before its evaluation** (016): the replacement booking is pending. If nobody takes it by start − 60 min, the whole request is cancelled and the other goalkeeper refunded, as the client chose. The withdrawn booking itself doesn't count; only the replacement does. After the evaluation the request is firm: a withdrawal still creates a replacement, which just expires at its search end if nobody takes it (016).
- **The replacement is withdrawn from too**: it follows the same rules; each withdrawal creates at most one replacement for the booking it ends.
- **The client cancels the replacement** (017): allowed like any searching booking.
- **The client cancels while the goalkeeper withdraws**, at the same time: exactly one wins. Either the client's cancellation (refunded to the goalkeeper, no penalty) or the withdrawal (no refund, penalties). Never both.
- **Withdrawing exactly at the 2-hour mark**: 2 h or more is not late. Less than 2 h is late.
- **A withdrawal while already suspended**: allowed. Penalties apply, and the end is the later one.
- **The 7-day window** counts withdrawals by the moment they happened, including the current one, over the 7 × 24 h before it, excluding reversed ones (clarification 2). Feature 021's no-shows will count the same way.
- **Configuration per country**: the goalkeeper's country (from their city) decides the thresholds. A missing country value falls back to the Colombia defaults, and a warning is logged.
- **Many withdrawals at once** (a goalkeeper withdrawing from several matches): each is its own withdrawal, with its own replacement. The weekly count sees the earlier ones.
- **The withdrawing goalkeeper and the replacement**: they never see or get offered the replacement of their own withdrawal, even if they'd otherwise be eligible.

## Requirements *(mandatory)*

### Functional Requirements

**Withdrawal (Story 1)**

- **FR-001**: A goalkeeper MUST be able to withdraw from a booking assigned to them, at any time strictly before its start, with an optional reason (≤ 200 characters).
- **FR-002**: The booking MUST end as "goalkeeper withdrew" and MUST NOT be offered again. The other bookings of the request are unaffected.
- **FR-002a**: In the same all-or-nothing operation, if the withdrawal happens before the booking's search end, exactly one **replacement booking** MUST be created in the same request (clarification 3):
  - same price, commission, travel margin and search end;
  - pending;
  - a "booking created" event, so it's offered like any new booking (015).

  The goalkeeper who withdrew MUST NOT be eligible for it. At or after the search end, no replacement is created.
- **FR-003**: The commission MUST NOT be refunded, and nothing MUST be charged to the client.
- **FR-004**: Each withdrawal MUST record exactly one "goalkeeper withdrew" event. It carries the goalkeeper, the booking, the request and how long before the start it happened.
- **FR-005**: The client MUST receive one notice (push and inbox), with data to open the request. It says "a replacement is being searched" when one was created, and "couldn't be replaced" otherwise.
- **FR-006**: Withdrawal MUST be idempotent (a repeat changes nothing), and MUST be refused for a booking the goalkeeper doesn't hold, a booking no longer assigned, or a match already started.
- **FR-007**: A withdrawal and a concurrent client cancellation of the same booking MUST resolve to exactly one outcome (edge case).

**Penalties (Story 2, requirement 5)**

- **FR-008**: The penalty rule MUST be one reusable policy. Given the goalkeeper's recent withdrawals and no-shows, whether this one is "late", and the country's values, it returns the suspensions to apply. Feature 021 applies it to a no-show as a late withdrawal.
- **FR-009**: Country values, with Colombia defaults:
  - late threshold 2 h;
  - late suspension 3 days;
  - weekly limit 3 withdrawals within 7 days;
  - limit suspension 7 days.
- **FR-010**: A late withdrawal (less than the threshold before the start) MUST record a suspension penalty of the late duration.
- **FR-011**: A withdrawal that is the N-th (N = the limit) within the window, counting itself, MUST record a suspension penalty of the limit duration, in addition to any late penalty.
- **FR-012**: The goalkeeper's suspension end MUST always equal the latest end among their suspension penalties in force. Suspensions never add up.
- **FR-013**: While suspended, whichever rule caused it, a goalkeeper MUST see no available matches, receive no offers and be refused when accepting (012 and 015's existing suspension effect; clarification 1).
- **FR-014**: When a withdrawal applies a suspension, the goalkeeper MUST receive a notice with the end date and time (local).

**Record (Story 3)**

- **FR-015**: Each withdrawal MUST be stored with the goalkeeper, booking, request, match start, withdrawal time, notice (minutes before the start), reason, and its penalties (type, duration, start, end, reversal).
- **FR-016**: A goalkeeper MUST be able to list their own withdrawals and penalties (paginated, newest first).

**Administration (Story 4)**

- **FR-017**: An administrator MUST be able to list a goalkeeper's withdrawals and penalties.
- **FR-018**: An administrator MUST be able to reverse a withdrawal's money (a refund of that booking's commission, once, by the administrator, with the reason) and/or lift any of its suspension penalties, each with a mandatory reason (3–500 characters).
- **FR-019**: Lifting a suspension MUST immediately recompute the goalkeeper's suspension end from the penalties still in force.
- **FR-020**: Reversals MUST be idempotent, recorded (who, when, reason), and visible in both histories.
- **FR-021**: A withdrawal with any reversal (money or suspension) MUST NOT count toward the weekly limit in later checks (clarification 2). Penalties already applied to other withdrawals are not recomputed.
- **FR-022**: The administration endpoints MUST be refused to non-administrators.

### Key Entities

- **Withdrawal**: one goalkeeper withdrawing from one booking. Holds the goalkeeper, booking, request, match start, withdrawal time, notice in minutes, the optional reason, and the replacement booking (if one was created). Unique per booking.
- **Replacement booking**: a normal booking of the request, created by a withdrawal. It records which booking it replaces, and the goalkeeper excluded from it.
- **Penalty**: a suspension caused by a withdrawal (or, from 021, a no-show). Holds:
  - its kind (late / weekly limit);
  - its duration, start and end;
  - its source (the withdrawal);
  - its reversal (who, when, reason), if any.
- **Goalkeeper suspension end** (existing, 012): derived from the penalties in force; it's what hides matches and offers.
- **Money reversal**: the existing commission refund, by an administrator with the reason, once per booking (the shared refund key).
- **Event**: "goalkeeper withdrew".

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A goalkeeper can withdraw in one action, and the client is notified within 10 seconds.
- **SC-001a**: 100% of withdrawals made before the search end produce exactly one replacement booking, offered to eligible goalkeepers (except the one who withdrew) within the same 10 seconds.
- **SC-002**: 100% of late withdrawals suspend the goalkeeper for exactly the configured duration from the withdrawal, and 0 withdrawals at or above the threshold do.
- **SC-003**: 100% of 3rd withdrawals within 7 days add the weekly-limit suspension, and suspensions never exceed the latest single end.
- **SC-004**: Repeating a withdrawal or a reversal produces exactly 1 effect (penalties, events, notices, refunds).
- **SC-005**: Under a simultaneous withdrawal and client cancellation of the same booking, exactly one outcome happens in 100% of runs.
- **SC-006**: After an administrator lifts the only suspension in force, the goalkeeper sees available matches again immediately.

## Assumptions

- **"Before the match"** means strictly before the booking's start. From the start on, it's a no-show matter (021).
- **The client's notice ships here**, like 016's outcomes. Feature 019 keeps the remaining client notices.
- **Money reversal** = refund of the booking's commission through the existing refund (one per booking, whatever path). There is no separate "penalty" movement, because the money penalty is the non-refunded commission.
- **Configuration** lives with the country's booking settings (per country, Colombia values as defaults).
- **Administrators** use the existing admin role. There's no admin UI in this feature.
- **Out of scope**:
  - no-show detection (021), which reuses the policy;
  - the remaining client notices (019);
  - reopening the withdrawn booking itself: a new replacement booking is created instead.
