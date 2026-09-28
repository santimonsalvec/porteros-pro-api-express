# Feature Specification: Notify Eligible Goalkeepers of Available Matches

**Feature Branch**: `015-notify-eligible-goalkeepers`
**Created**: 2026-09-28
**Status**: Draft
**Input**: User description: "Spec 015 de _temp_plan.md" — "Notificar a los porteros elegibles cuando hay partidos disponibles. Requisitos: (1) Al recibir el evento de reserva creada (feature 013), determinar los porteros elegibles con las mismas reglas que "partidos disponibles" de la feature 012: activos, con la zona habilitada, no suspendidos, con fondos para esa comisión, sin choque de horario, y que no sean el cliente. (2) Registrar una notificación por portero en su bandeja (colección de notificaciones), de forma idempotente, y enviarle un push por FCM (feature 014) con texto legible (zona, fecha y hora local, duración) y datos para abrir el partido en la app. (3) Mientras una reserva siga sin portero y su búsqueda no haya terminado, reenviar cada 5 minutos (configurable) a los elegibles, con UN solo push por portero y por ronda que agrupe todas sus solicitudes abiertas ("Hay 3 partidos disponibles en tus zonas"); no reenviar a un portero una solicitud que ya abrió o descartó. (4) Endpoints para que el usuario consulte su bandeja (paginada), la marque como leída y descarte una oferta. (5) Eliminar los tokens que FCM reporte como inválidos. La lógica de elegibilidad vive en un command de la capa de aplicación; el endpoint que recibe de Pub/Sub solo lo invoca. El envío por FCM queda detrás de un puerto." Draft success criteria from the roadmap: 0 notifications to non-eligible goalkeepers; the same event N times → 1 notification per goalkeeper; in each round each goalkeeper receives at most 1 push.

**Context**: Step 015 of the goalkeeper-guarantee roadmap (repository-root `_temp_plan.md`, §2.3). It builds on:
- 012: the "available matches" rules and the accept flow;
- 013: the "booking created" event and the every-minute sweep with its scheduled jobs;
- 014: the push capability, which already removes tokens the push service reports invalid.

It is the first feature where goalkeepers **learn** about a match without opening the app. Feature 019 will reuse the inbox for client notifications.

## Clarifications

### Session 2026-09-28

- Q: How long and how often should reminders continue? → A: At most 3 reminders per offer, at least 5 minutes apart, after the first notification. No quiet hours: matches can be at any hour (e.g. 1 a.m.).
- Q (added by the owner): Can a goalkeeper stop receiving offers? → A: Yes. A goalkeeper has an "available for offers" switch they turn on or off. Off: no offers reach them (neither the first notification nor reminders). On: offers reach them at any hour.
- Q: With the switch off, what happens to "available matches" (012)? → A: The goalkeeper must be available to see or take matches. Off hides "available matches" (with a reason telling them to turn it on) and refuses acceptance. Rationale (owner): the platform relies on notifications to assign a goalkeeper as fast as possible; a goalkeeper who browses matches whenever they want slows assignment, and a client left waiting may find a goalkeeper elsewhere.
- Q: When a goalkeeper turns the switch on, when do the offers for open matches reach them? → A: Immediately. Turning it on creates their inbox entries for the open matches they can take and sends one grouped push right away. That push counts as the first notification of those offers, and the 5-minute interval runs from it.

## User Scenarios & Testing *(mandatory)*

The users are **goalkeepers**, who receive offers, and the **client**, who benefits indirectly: the faster eligible goalkeepers hear about the match, the likelier it is covered. The inbox is the goalkeeper's record of every offer, and the place where nothing is lost when a push doesn't arrive (roadmap §2.10: push delivery isn't guaranteed).

### User Story 1 - Eligible goalkeepers hear about a new match right away (Priority: P1)

When a client confirms a request, every goalkeeper who could take one of its bookings right now gets an **offer**:
- an entry in their inbox;
- a push with the zone, the local date and time, and the duration, for example "Partido en Bello · sáb 4 oct, 3:00 p. m. · 90 min".

Tapping the push opens that match in the app, where the goalkeeper can accept it (012).

A goalkeeper is **eligible** for a booking when it appears in their "available matches" (012) **and** they are available for offers:
- they are an active goalkeeper, with the match's zone enabled;
- they have their **"available for offers"** switch on (Story 4);
- they are not suspended;
- their balance covers the lowest commission of their zones, and this booking's commission;
- the match doesn't clash with a match they already hold, travel margin included;
- they don't already hold a booking of the same request;
- they are not the client who made the request.

A request for 2 goalkeepers produces **one** offer per goalkeeper, not two: they can only take one of its bookings.

**Why this priority**: This is the heart of the guarantee to the client. Nobody accepts a match they don't know about.

**Independent Test**:
- Set up 5 goalkeepers in the match's zone: A eligible; B suspended; C whose balance is below the commission; D who holds a clashing match; F with the "available for offers" switch off. Also set up E, eligible but in another zone, and let the client also be an active goalkeeper of that zone.
- Confirm a 2-goalkeeper request: only A gets an offer, with 1 inbox entry and 1 push, and the push text shows the zone, the local date and time, and the duration.
- Deliver the same "booking created" events again: A still has 1 entry and got 1 push.

**Acceptance Scenarios**:

1. **Given** a newly created booking, **When** its "booking created" event is processed, **Then** each eligible goalkeeper gets exactly one inbox entry for that request and one push.
2. **Given** a goalkeeper who is not eligible for any of the seven reasons above, **Then** they get no entry and no push.
3. **Given** a 2-goalkeeper request (two "booking created" events), **Then** each eligible goalkeeper gets one entry and one push for the request, not two.
4. **Given** the same event delivered several times, or both events of one request processed at the same moment, **Then** no goalkeeper gets a second entry or a second push for that request.
5. **Given** an eligible goalkeeper with no registered device, **Then** the inbox entry is still created. It's not an error.
6. **Given** a booking that is no longer pending (already assigned, cancelled or expired) or whose search already ended when its event is processed, **Then** nobody is notified for it.

---

### User Story 2 - Goalkeepers who haven't acted are reminded, with one push per round (Priority: P1)

While a booking has no goalkeeper and its search is open (until start − travel margin), the platform reminds eligible goalkeepers of it: **at most 3 reminders per offer**, at least **5 minutes** apart, after the first notification (clarification 1). There are no quiet hours: matches can be at any hour, and a goalkeeper who doesn't want offers turns their availability off (Story 4). A goalkeeper with several open offers gets **one** push per round that groups them all: "Hay 3 partidos disponibles en tus zonas". With a single open offer, the push describes that match.

A goalkeeper is **not** reminded of an offer they already **opened** or **dismissed**. Offers they can no longer take are dropped from the reminder:
- someone else took the last open booking;
- the booking expired or was cancelled;
- they became ineligible (suspended, short of funds, now clashing, availability turned off);
- they were already reminded of it 3 times.

A goalkeeper who **became eligible** after the booking was created — they topped up, enabled the zone, turned their availability on, or their suspension ended — gets the offer in the next round, as a new inbox entry and a push. That new offer then gets its own 3 reminders.

**Why this priority**: Goalkeepers miss pushes: they are playing, driving, or asleep. Without reminders, a match that nobody took in the first minutes is likely lost. Grouping keeps the reminders from becoming spam.

**Independent Test**:
- Give goalkeeper A two unopened offers from different requests.
- Run a reminder round: A gets **one** push saying 2 matches are available.
- A opens one offer; next round: the push describes the remaining one.
- A dismisses it; next round: no push.
- Run two rounds within 5 minutes: the second sends nothing to A.
- Give A one offer and run 5 rounds 5 minutes apart: A gets exactly 3 reminders, then nothing.

**Acceptance Scenarios**:

1. **Given** a goalkeeper with 3 open, unopened, undismissed offers, **When** a reminder round runs, **Then** they get exactly one push that says 3 matches are available.
2. **Given** a goalkeeper with exactly 1 such offer, **When** a round runs, **Then** the push describes that match (zone, local date and time, duration) and opens it when tapped.
3. **Given** an offer the goalkeeper opened or dismissed, **Then** it is never counted in a reminder again.
4. **Given** a goalkeeper was pushed less than 5 minutes ago (first offer or reminder), **When** a round runs, **Then** they get nothing in that round.
5. **Given** an offer whose request has no booking the goalkeeper can take any more (taken, expired, cancelled, search ended, or the goalkeeper became ineligible), **Then** it is not counted and doesn't trigger a push.
6. **Given** a goalkeeper who became eligible after the booking was created, **When** the next round runs, **Then** they get an inbox entry for it and it counts in their push.
7. **Given** two rounds running at the same time, **Then** no goalkeeper gets two pushes.
8. **Given** an offer already included in 3 reminders, **Then** it is never included in another reminder. It stays in the inbox, and the match stays in available matches.
9. **Given** a grouped reminder covering several offers, **Then** it counts as one reminder for each offer it covered.
10. **Given** a round at any hour of the day or night, **Then** it runs the same way. There are no quiet hours.

---

### User Story 3 - Users read their inbox, mark it read and dismiss offers (Priority: P1)

Any signed-in user has an **inbox**: every notification the platform sent them, newest first, one page at a time, with an unread count. In this feature the only notifications are match offers to goalkeepers. Feature 019 adds client notifications to the same inbox.

A user can:
- **mark one notification as read**. Opening an offer from the inbox or from its push does this, and counts as "opened" for reminders;
- **mark all as read**;
- **dismiss an offer**, meaning "not interested". It stops the reminders for it and shows as dismissed in the inbox.

Each offer shows whether it is **still available** to take, so the goalkeeper isn't sent to a match that's already gone.

**Why this priority**: Push delivery isn't guaranteed. The inbox is where a goalkeeper finds every offer, and "opened" and "dismissed" are what make reminders stop.

**Independent Test**:
- A goalkeeper with 3 offers lists the inbox: 3 entries, newest first, unread count 3.
- Mark one read: count 2.
- Dismiss another: it shows as dismissed.
- Mark all read: count 0.
- Another user can't read, mark or dismiss these entries.
- An offer whose match was taken shows as no longer available.

**Acceptance Scenarios**:

1. **Given** a user with notifications, **When** they list the inbox, **Then** they get their own notifications only, newest first, paginated, with the total and the unread count.
2. **Given** an unread notification, **When** the user marks it read, **Then** it's read and the unread count drops by one. Repeating it changes nothing.
3. **Given** an offer, **When** the goalkeeper dismisses it, **Then** it shows as dismissed and is never included in a reminder. Dismissing again changes nothing.
4. **Given** notifications, **When** the user marks all read, **Then** the unread count becomes 0.
5. **Given** a notification that belongs to another user, or that doesn't exist, **When** a user tries to read, mark or dismiss it, **Then** the answer is "not found", and nothing changes.
6. **Given** an offer whose request no longer has a booking the goalkeeper can take, **Then** the inbox shows it as no longer available.
7. **Given** a user with no notifications, **Then** the inbox is empty, which is not an error.

---

### User Story 4 - A goalkeeper turns offers on or off (Priority: P1)

An active goalkeeper has an **"available for offers"** switch, on by default. When it's off, no offer reaches them: no first notification, no reminder, no new inbox entry for a match. When they turn it on, they start getting offers again, at any hour. Matches can be at 1 a.m., so there are no quiet hours; the switch is how a goalkeeper rests.

Turning it on doesn't wait for the next new match, nor for the next round (clarification 4): right away, they get an inbox entry for each open match they can take and don't have an offer for yet, plus **one** push that groups them (or describes the match, if there's only one). That push is the first notification of those offers, so their 3 reminders and the 5-minute interval start from it.

The switch also gates **seeing and taking matches** (clarification 3). While it's off, "available matches" is empty and tells them to turn it on, and accepting a match is refused with the same reason, even from an old push or inbox entry. Their agenda of matches they already hold is not affected. The goal is speed: goalkeepers who want matches keep the switch on and answer the notifications, instead of browsing whenever they feel like it while clients wait.

**Why this priority**: Without it, the only way to stop the pushes is to disable notifications for the whole app, which also silences their agenda and, later, cancellations. With it, reminders at any hour are acceptable. And because the switch also gates seeing and taking matches, every goalkeeper who can take a match is one the platform can reach right away.

**Independent Test**:
- A goalkeeper turns the switch off: a new eligible match gives them no entry and no push, the next round sends nothing, "available matches" is empty with the reason "not available", and accepting that match is refused.
- They turn it on: right away they get the open match's offer in the inbox and one push, and a round within the next 5 minutes sends them nothing.
- Their profile shows the switch's current value.
- A client who is not a goalkeeper can't change it.

**Acceptance Scenarios**:

1. **Given** an active goalkeeper, **Then** their switch is on unless they turned it off. Goalkeepers who existed before this feature are on.
2. **Given** a goalkeeper with the switch off, **When** a booking they could take is created, or a round runs, **Then** they get no inbox entry and no push.
3. **Given** a goalkeeper with the switch off, **When** they turn it on, **Then** immediately they get an inbox entry for each open match they can take and don't have an offer for, and one push grouping them. Turning it on when there are no such matches sends nothing. Offers they already had are not re-sent by this.
4. **Given** a goalkeeper, **When** they turn the switch on or off, **Then** the change is saved right away, it's idempotent, and their profile shows the new value.
5. **Given** a goalkeeper with the switch off, **When** they open "available matches", **Then** it's empty and says they must turn availability on to see matches.
6. **Given** a signed-in user who is not an active goalkeeper, **When** they try to change the switch, **Then** it's refused as "not a goalkeeper".
7. **Given** a goalkeeper with the switch off, **When** they try to accept a pending match (from the app, an old push or an inbox entry), **Then** it's refused as "not available", nothing is charged, and the booking stays pending for others.
8. **Given** a goalkeeper with the switch off, **Then** their agenda still shows the matches they already hold, and turning the switch off never releases them.

---

### Edge Cases

- **The goalkeeper accepts from the push**: the acceptance is 012's flow. The offer then shows as no longer available, and the other open booking of a 2-goalkeeper request is not offered to them again, because they already hold one.
- **Two goalkeepers accept the last booking at the same time**: 012 decides the winner. The loser's offer shows as no longer available.
- **A goalkeeper is eligible for one booking of a request but not the other** (for example, different commissions): one offer covers the request. It opens a booking they can take.
- **A booking created with very little notice**: its search may end within minutes. The first notification goes out if the search is still open; no reminder is sent after it ends.
- **Very many eligible goalkeepers** (a busy zone): all of them get the offer. The send never blocks the client's confirmation, because it happens after the confirmation, from the event.
- **The push service is down**: inbox entries are still created. The failed push is not retried by itself; the next reminder round covers it.
- **The event is processed late** (the messaging service was down): eligibility is evaluated when it's processed, not when the booking was created.
- **A goalkeeper deactivates or loses the zone after being notified**: their offer is no longer available and no longer reminded.
- **Local time**: dates and times in the push and the inbox use the match's city time zone, in Spanish.
- **Old notifications**: kept for 90 days, then removed automatically.
- **The goalkeeper turns availability off between the first notification and a reminder**: no reminder is sent. The existing inbox entry stays; it shows whether the match is still available to take.
- **A goalkeeper toggles the switch repeatedly**: each "on" makes them newly eligible again only for offers they don't already have. An offer they already received keeps its reminder count, so toggling never resets the 3-reminder cap.

## Requirements *(mandatory)*

### Functional Requirements

**Eligibility (Story 1, Story 2)**

- **FR-001**: A goalkeeper MUST be eligible for a booking only when all of these hold, evaluated at the time of notifying:
  - they are an active goalkeeper, with the booking's zone enabled;
  - their "available for offers" switch is on (FR-024);
  - they are not suspended;
  - their balance covers the lowest commission of their enabled zones (012's "can see offers" rule), and it covers this booking's commission;
  - the booking doesn't clash with any booking they hold, with the travel margin (roadmap §2.7);
  - they don't already hold a booking of the same request;
  - they are not the client of the request.
- **FR-002**: Eligibility MUST give the same answer as "available matches" (012, gated by the switch per FR-028) for the same goalkeeper, booking and moment. A booking is notified to a goalkeeper only if it would appear in their available matches.
- **FR-003**: Only bookings that are still pending and whose search is open (now < start − travel margin) MUST be notified or reminded.

**First notification (Story 1)**

- **FR-004**: When a "booking created" event is processed, every eligible goalkeeper MUST get one inbox entry for the booking's request, and one push, unless they already have an entry for that request.
- **FR-005**: There MUST be at most one offer entry per goalkeeper and request, even with repeated or simultaneous events. Only the processing that creates the entry sends its push.
- **FR-006**: The push and the inbox entry MUST show:
  - the zone name;
  - the match's local date and time, in the city's time zone, in Spanish;
  - the duration.

  They MUST carry the data the app needs to open the match: the type `booking.available`, the request id, and the id of a booking of that request the goalkeeper can take.
- **FR-007**: Processing the event MUST be idempotent (feature 013). A delivery that fails is retried by the messaging service. A repeat does not create entries or send pushes again.

**Reminders (Story 2)**

- **FR-008**: A recurring job MUST, every round, work out for each goalkeeper their **open offers**: requests with a booking they are eligible for (FR-001, FR-003), which they have not opened or dismissed, and which have been included in fewer than 3 reminders (FR-013).
- **FR-009**: A goalkeeper MUST get at most one push per round, and no push if their last offer push, first or reminder, was less than the reminder interval ago (default 5 minutes, configurable). Rounds run at any hour: there are no quiet hours.
- **FR-010**: The reminder push MUST describe the match when there is one open offer, and say how many there are when there are several: "Hay N partidos disponibles en tus zonas". Its data opens the match (one offer) or the available-matches list (several).
- **FR-011**: A goalkeeper who is eligible but has no entry for a request MUST get the entry during the round, and it counts in that round's push.
- **FR-012**: Two rounds running at the same time MUST NOT push the same goalkeeper twice.
- **FR-013**: Each offer MUST be included in at most 3 reminders (configurable), after its first notification. A grouped reminder counts as one reminder for every offer it covers. An offer that reached the cap stays in the inbox but is never reminded again. Toggling the availability switch never resets the count.

**Inbox (Story 3)**

- **FR-014**: A signed-in user MUST be able to list their inbox, newest first, paginated (default 20, max 50 per page). The answer includes the total and the unread count.
- **FR-015**: Each entry MUST show:
  - its type, title, body and creation time;
  - whether it is read and when;
  - the data needed to open it.

  Offers also show whether they are dismissed, and whether they are **still available**: the request still has a booking the goalkeeper is eligible for (FR-001, FR-003).
- **FR-016**: A user MUST be able to mark one entry as read, and to mark all their entries as read. Both are idempotent. Marking an offer read counts as "opened" (FR-008).
- **FR-017**: A goalkeeper MUST be able to dismiss an offer. It's idempotent, and it also marks the offer read. Dismissing applies only to offers.
- **FR-018**: A user MUST only see and change their own entries. Another user's entry or an unknown one MUST answer "not found", without revealing that it exists.
- **FR-019**: Inbox entries MUST be removed automatically 90 days after creation.

**Delivery and reliability**

- **FR-020**: Pushes MUST go through the push capability of feature 014, which removes the tokens the push service reports as invalid (requirement 5 of the input).
- **FR-021**: A push failure MUST NOT prevent the inbox entry from being created, nor fail the event processing (feature 014: sending never fails).
- **FR-022**: Each processing (event or round) MUST be logged with: the booking or round, the number of eligible goalkeepers, the entries created and the pushes reached, removed and failed.
- **FR-023**: The notification work MUST never slow down or fail the client's confirmation. It runs from the event and the scheduled job, not during the request.

**Availability switch (Story 4)**

- **FR-024**: Every active goalkeeper MUST have an "available for offers" value, on by default, including goalkeepers activated before this feature.
- **FR-025**: An active goalkeeper MUST be able to turn it on or off. The change is saved immediately and is idempotent. Their goalkeeper profile MUST show the current value.
- **FR-026**: With the switch off, the goalkeeper MUST receive no offer: no first notification, no reminder, no new offer entry.
- **FR-027**: When a goalkeeper turns the switch on (from off), the platform MUST immediately create their offer entries for the open matches they are eligible for and don't have an offer for yet, and send one push: grouped when there are several, describing the match when there is one, nothing when there are none. That push counts as the first notification of those offers and as their last offer push for the interval (FR-009). A failure to send never fails the switch change. Turning it on when it's already on does nothing.
- **FR-028**: With the switch off, "available matches" (012) MUST return no matches and a reason stating that the goalkeeper is not available (alongside 012's existing reasons: suspended, insufficient funds), and accepting a match (012) MUST be refused with that reason, charging nothing. The agenda of held matches MUST NOT be affected, and turning the switch off MUST NOT release any held match.
- **FR-029**: A signed-in user who is not an active goalkeeper MUST be refused when changing the switch.

### Key Entities

- **Notification (inbox entry)**: one message to one user. Holds:
  - the recipient;
  - the type (`booking.available` in this feature);
  - the title, the body, and the data to open it;
  - when it was created, read and dismissed;
  - for offers, the request it is about.

  An offer is unique per recipient and request, and counts how many reminders included it (at most 3). Entries are removed after 90 days.
- **Offer push state (per goalkeeper)**: when the goalkeeper was last sent an offer push, first or reminder. It enforces the reminder interval and "one push per round".
- **Goalkeeper availability for offers**: an on/off value on the goalkeeper's profile, on by default.
- **Eligible goalkeeper**: not stored. It's the result of the eligibility rules (FR-001) for a booking at a moment.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 0 offers (entries or pushes) to goalkeepers who are not eligible under FR-001 at the time of sending. Verified over every non-eligibility reason.
- **SC-002**: The same "booking created" event processed N times (N = 5, and 20 simultaneous deliveries) produces exactly 1 entry and 1 push per eligible goalkeeper per request. A 2-goalkeeper request produces 1, not 2.
- **SC-003**: In every reminder round, each goalkeeper receives at most 1 push. No goalkeeper receives two offer pushes less than 5 minutes apart.
- **SC-004**: With the messaging service available, 95% of eligible goalkeepers with a registered device get the first push within 10 seconds of the client's confirmation.
- **SC-005**: A goalkeeper who opened or dismissed an offer receives 0 reminders for it. No offer is ever included in more than 3 reminders.
- **SC-009**: A goalkeeper with availability off receives 0 offers, sees 0 available matches and can accept 0 matches. After turning it on, they receive the offers for the currently open matches they can take within 10 seconds.
- **SC-006**: 100% of offers whose match can no longer be taken by that goalkeeper show as "no longer available" in their inbox, and are excluded from reminders.
- **SC-007**: The client's confirmation time does not change because of notifications (compared with 013).
- **SC-008**: A reminder round with 500 open bookings and 1,000 goalkeepers completes within 30 seconds.

## Assumptions

- **Eligibility is 012's**, evaluated from the booking's side: the same rules and the same schedule-clash function. The goalkeeper's availability hours aren't a condition yet (roadmap backlog).
- **One offer per request, not per booking**: a goalkeeper can hold only one booking of a request (012). The offer opens a booking of the request that they can take.
- **"Opened" means marked read**: the app marks an offer read when the goalkeeper opens it, from the inbox or by tapping its push. Seeing it in the available-matches list doesn't count.
- **Dismissing only affects notifications**: while the switch is on, the match still appears in the goalkeeper's available matches (012), so they can change their mind and accept.
- **Offer data convention** (feature 014):
  - type `booking.available` with `requestId` and `bookingId`, for one match;
  - type `bookings.available`, for a grouped reminder that opens the available-matches list.
- **Texts are in Spanish.** Times are in the city's time zone, which cities already carry since 007.
- **The inbox is for any user** (clients, goalkeepers, administrators). Feature 019 adds client notification types without changing it.
- **Retention**: 90 days for inbox entries.
- **Reminders** (clarification 1): at most 3 per offer, at least 5 minutes apart, both configurable (roadmap §2.11 places them at country level; while Colombia is the only country they are one global setting, moving to per-country when a second country launches). The every-minute sweep of 013 runs the reminder job; the interval is enforced per goalkeeper. No quiet hours.
- **Availability switch** (clarifications 2 and 3): on by default, controlled by the goalkeeper only. It's not a schedule of availability hours (roadmap backlog), only an on/off. Off hides "available matches" and refuses acceptance, which changes 012's behavior; the agenda is unaffected.
- **Out of scope**:
  - client notifications (019);
  - expirations and "cancel all" (016);
  - notification preferences or muting beyond the availability switch;
  - a detailed offer screen beyond what 012's available matches already show.
- **Technical decisions left to the plan**:
  - how eligible goalkeepers are found from a booking (indexes);
  - how the round claims goalkeepers so two rounds don't double-push;
  - the exact endpoint paths;
  - where the per-country interval is configured.
