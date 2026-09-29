# Feature Specification: Reliable Domain Events and Scheduled Jobs ✅

**Feature Branch**: `013-domain-events-outbox`
**Created**: 2026-09-28
**Status**: ✅ Implemented — merged into `main` on 2026-09-28. Manual checks deferred to the end of the roadmap (`_temp_pruebas.md`).
**Input**: User description: "Spec 013 de _temp_plan.md" — "Infraestructura de eventos de dominio confiable y de trabajos por tiempo. Requisitos: (1) Los cambios relevantes de solicitudes y reservas (reserva creada, portero asignado, reserva cancelada, retiro del portero, reserva vencida, etc.) registran un evento en una colección outbox dentro de la MISMA transacción que el cambio: el cambio y su evento existen los dos o ninguno. Las repeticiones idempotentes no emiten eventos. (2) Un relay publica los eventos pendientes en Google Cloud Pub/Sub justo después del commit, dentro de la misma petición, y los marca como publicados. (3) Un endpoint interno protegido, llamado por Cloud Scheduler cada minuto, reenvía los eventos pendientes y ejecuta los trabajos programados por tiempo (registrables por otras features: vencimientos, reenvío de ofertas, etc.), de forma que dos ejecuciones simultáneas no procesen dos veces lo mismo. (4) Los consumidores reciben los eventos por suscripciones push de Pub/Sub en endpoints internos autenticados con el token OIDC de Google. Cada consumidor es idempotente (la entrega es al menos una vez). Existe un dead-letter topic. (5) El mediator de la aplicación gana la capacidad de publicar un evento a varios handlers, además de enviar commands/queries a uno solo. El publicador queda detrás de un puerto para que los tests no usen Pub/Sub real. (6) Documentar la infraestructura a crear en Google Cloud (topic, suscripciones, dead-letter, cuenta de servicio, job de Cloud Scheduler) y el modo de desarrollo local. En esta feature basta con el evento 'reserva creada' y un consumidor de registro que confirme la entrega; los consumidores reales llegan después." Success criteria from the roadmap (draft): interrupting between the commit and the publication → the event is published by the next sweep (0 lost); the same event delivered N times → its effect happens once.

**Context**: Step 013 of the goalkeeper-guarantee roadmap (repository-root `_temp_plan.md`, sections 4.1–4.3). It builds on feature 010 (a confirmed quote creates a request and one booking per goalkeeper). The platform's upcoming features depend on it:
- 015 notifies eligible goalkeepers when a booking is created, and again every 5 minutes;
- 016 expires bookings and runs "cancel all";
- 017 and 018 handle cancellations and withdrawals;
- 019 notifies clients;
- 020 detects missing check-ins.

## Clarifications

### Session 2026-09-28

- Q: One "booking created" event per booking or per request? → A: One per booking. A 2-goalkeeper request produces 2 events, because each booking is accepted, expires and is cancelled on its own. Consumers group per request or per goalkeeper when they need to.
- Q: Does acceptance (012) already record "goalkeeper assigned" in this feature? → A: Yes. The acceptance transaction also records a "goalkeeper assigned" event. There is no dedicated consumer yet: only the delivery log records it. Client notifications (019) will consume it.
- Q: How long may in-request publication delay the response when the messaging service is slow or down? → A: At most 2 seconds. After that, the operation responds normally and the event stays pending for the sweep.

## User Scenarios & Testing *(mandatory)*

The "users" of this feature are the platform itself and the features built on it. Goalkeepers and clients see its effect indirectly: every notification and every automatic transition of later features depends on events not being lost and jobs running on time.

### User Story 1 - A relevant change and its event are never separated (Priority: P1)

When something relevant happens to a request or a booking — in this feature, a booking is created when a client confirms a quote, and a goalkeeper is assigned when they accept a booking — the platform records a **domain event** describing it (what happened, to which booking and request, when). The event is recorded **together with the change**: either both exist or neither does. A retry or double tap that changes nothing (a replayed confirmation) records no event.

**Why this priority**: If a booking can exist without its event, eligible goalkeepers are never told about it and the match goes uncovered. If an event can exist without its booking, goalkeepers are told about a match that doesn't exist.

**Independent Test**: Confirm a 2-goalkeeper quote. Check that there is one "booking created" event per booking, each naming its booking and request. Confirm again (a replay) and check that no new event exists. Make the confirmation fail midway and check that neither the bookings nor their events exist.

**Acceptance Scenarios**:

1. **Given** a client confirms a quote for 2 goalkeepers, **When** the confirmation succeeds, **Then** exactly 2 "booking created" events are recorded, one per booking, each with its booking, its request, the zone, the start and the time of the change.
2. **Given** the same confirmation is repeated, **When** it returns the existing request, **Then** no event is recorded.
3. **Given** the confirmation fails after the bookings were written but before it completes, **Then** neither the bookings nor their events exist.
4. **Given** a confirmation is refused (expired quote, duplicate request…), **Then** no event is recorded.
5. **Given** a goalkeeper accepts a pending booking, **When** the acceptance succeeds, **Then** exactly one "goalkeeper assigned" event is recorded with the booking, request, goalkeeper and commission, in the same all-or-nothing operation as the assignment and the charge.
6. **Given** the same goalkeeper repeats the acceptance, or the acceptance is refused (taken, clash, funds…), **Then** no event is recorded.

---

### User Story 2 - Every recorded event reaches its subscribers, even after a failure (Priority: P1)

Right after the change is saved, and before the client gets the response, the platform hands the new events to the messaging service and marks them as published. If that hand-off fails, or the service stops between saving and publishing, the event stays **pending**. A periodic sweep, run every minute, publishes every pending event. No event is ever lost.

**Why this priority**: The guarantee to the client ("a goalkeeper will be found") starts with goalkeepers learning about the match. A lost event is a match nobody hears about.

**Independent Test**: Make publishing fail during a confirmation. The confirmation still succeeds, and the event stays pending. Run the sweep: the event is published and marked as published. Run the sweep again: nothing is published twice.

**Acceptance Scenarios**:

1. **Given** the messaging service is available, **When** a booking is created, **Then** its event is published before the response is returned and is marked as published.
2. **Given** the messaging service fails while publishing, **When** a booking is created, **Then** the confirmation still succeeds for the client, the event stays pending and the failure is logged.
3. **Given** a pending event, **When** the sweep runs, **Then** the event is published and marked as published.
4. **Given** an event that was already published, **When** the sweep runs, **Then** it is not published again.
5. **Given** the service stopped between saving the change and publishing, **When** the next sweep runs (within about a minute), **Then** the event is published.

---

### User Story 3 - Each event takes effect exactly once for each consumer (Priority: P1)

The messaging service delivers each event to every consumer that subscribed to it, **at least once**: the same event may arrive twice or more, and events may arrive out of order. Each consumer records which events it already processed and ignores repeats. A consumer that keeps failing on an event does not block the others: after a limited number of attempts, the event is set aside in a **dead-letter** holding area for manual review.

In this feature the only consumer is a **delivery log**. It records that the "booking created" event arrived, proving the whole chain works end to end. The real consumers (goalkeeper notifications, client notifications…) come in later features and follow the same rules.

**Why this priority**: Duplicated deliveries are normal. Without idempotent consumers, a goalkeeper would get the same push twice, or a refund would be paid twice.

**Independent Test**: Deliver the same "booking created" event to the delivery-log consumer 5 times. It is recorded once, and every delivery is acknowledged as successful. Deliver an event the consumer cannot process, repeatedly: after the maximum number of attempts, it ends up in the dead-letter area.

**Acceptance Scenarios**:

1. **Given** an event delivered for the first time, **When** the consumer processes it, **Then** its effect happens and the delivery is acknowledged.
2. **Given** the same event delivered again, **When** the consumer receives it, **Then** its effect does not happen again and the delivery is acknowledged, so the messaging service stops re-sending it.
3. **Given** an event a consumer fails to process, **Then** the delivery is reported as failed and the messaging service retries it later.
4. **Given** an event that keeps failing, **When** the maximum number of delivery attempts is reached, **Then** it is moved to the dead-letter area and no longer retried.
5. **Given** an event of a type the consumer doesn't handle, or a malformed message, **Then** it is acknowledged without effect and logged, so it isn't retried forever.

---

### User Story 4 - Time-based jobs run every minute, once (Priority: P2)

Several future rules depend on time passing, not on a user action:
- bookings expire at start − travel margin;
- "cancel all" is evaluated at start − 60 minutes;
- offers are re-sent every 5 minutes;
- a missing check-in is detected at start + 15 minutes;
- bookings are closed at the end of the match.

The same every-minute sweep runs these **scheduled jobs**. Each later feature registers its own job without changing the sweep. Two sweeps running at the same time (a slow sweep overlapping the next one, or a manual call) never process the same thing twice. A failing job does not stop the others.

**Why this priority**: No job exists yet in this feature (the first ones arrive in 015 and 016). The mechanism must be ready and safe so those features only add their rule.

**Independent Test**: Register two test jobs, one that fails. Run the sweep: both run, and the failure is logged without stopping the other job or the publication of pending events. Run two sweeps at once: each job runs once per sweep window, and each pending event is published once.

**Acceptance Scenarios**:

1. **Given** registered jobs, **When** the sweep runs, **Then** each job runs once and the sweep reports what each one did.
2. **Given** one job fails, **When** the sweep runs, **Then** the other jobs and the publication of pending events still run, and the failure is logged.
3. **Given** two sweeps start at the same time, **Then** no pending event is published twice, and no job processes the same item twice.
4. **Given** a sweep takes longer than a minute, **When** the next one starts, **Then** it doesn't redo the work the first one has already claimed.

---

### User Story 5 - Only the platform can trigger the sweep and deliver events (Priority: P1)

The sweep endpoint and the consumer endpoints are **internal**. Only the platform's own scheduler and messaging service may call them, proving who they are with a signed identity token. Any other caller — a user of the app, a stranger, a request without a token or with a token for another audience — is refused, and nothing runs.

**Why this priority**: A public sweep would let anyone force expirations or cancellations at will. A public consumer would let anyone fake events ("booking created") and trigger notifications or refunds.

**Independent Test**: Call the sweep and a consumer endpoint with no token, with a regular user's access token, and with a scheduler token issued for a different audience or identity. All are refused, and nothing is published, run or recorded. Call them with a valid platform token: they run.

**Acceptance Scenarios**:

1. **Given** a call without an identity token, **Then** it is refused as unauthenticated.
2. **Given** a call with an app user's access token (even an administrator's), **Then** it is refused.
3. **Given** a signed token for another audience or from an unexpected identity, **Then** it is refused.
4. **Given** a valid token from the platform's scheduler or messaging service, **Then** the call is processed.

---

### User Story 6 - The team can set up the cloud resources and work locally (Priority: P3)

The team has a written guide listing every cloud resource to create — the events topic, the consumer subscription(s), the dead-letter area, the service identities and their permissions, and the every-minute scheduler job — with the exact values the service expects. Developers can also run the whole chain on their machine without any cloud resource: events recorded by a local confirmation reach the local consumers.

**Why this priority**: Without the guide, deploying the feature depends on memory. Without a local mode, every developer would need cloud access to try a booking.

**Independent Test**: Follow the guide in a fresh cloud project and confirm a booking: the delivery log records the event. Locally, with no cloud configuration, confirm a booking: the delivery log records the event too.

**Acceptance Scenarios**:

1. **Given** the guide, **When** an operator creates the listed resources, **Then** the deployed service publishes, delivers and sweeps without code changes, only configuration.
2. **Given** a developer machine with no cloud configuration, **When** a booking is created, **Then** the local consumers still receive the event.

---

### Edge Cases

- **Publication succeeds but marking it as published fails**: the sweep publishes the event again. That is a duplicate delivery, which consumers already ignore (Story 3).
- **The messaging service is down for a long time**: events accumulate as pending, and each sweep retries them. Confirmations keep working. When events stay pending longer than a threshold (default 5 minutes), a warning is logged with how many there are.
- **An event is pending while the sweep and the in-request publication both try to publish it**: it may be published twice. That's harmless, for the same reason.
- **Events arrive out of order** (for example, "goalkeeper assigned" before "booking created"): consumers must not assume an order. Each reads the current state it needs.
- **A consumer endpoint receives a message whose content cannot be read**: it is acknowledged, logged and not retried (Story 3, scenario 5).
- **The sweep runs while no event is pending and no job is registered**: it succeeds and does nothing.
- **A registered job throws or takes too long**: the error is logged, and the other jobs and the event publication are not blocked. A job left half-done is picked up again by a later sweep, because jobs are written to be safe to repeat.
- **Old published events**: they are removed after a retention period (default 7 days), so the store does not grow forever. Pending events are never removed.
- **A confirmation that creates bookings is interrupted after the commit but before the response**: the bookings and events exist, and the sweep publishes the events. The client retries and gets a replay, which records no new events.

## Requirements *(mandatory)*

### Functional Requirements

**Recording events (Story 1)**

- **FR-001**: A domain event MUST describe a past fact and carry:
  - a unique event id;
  - its type (for example `booking.created`);
  - the time it happened;
  - the ids of what it concerns (booking, request);
  - a small payload with only the data needed to route and understand it.

  Consumers look up anything else they need.
- **FR-002**: Every event MUST be recorded in the same all-or-nothing operation as the change that produces it: the change and its events either both exist or neither does.
- **FR-003**: Confirming a quote MUST record one "booking created" event per booking created. Each event MUST include the booking id, the request id, the client id, the zone id, the start time and the commission.
- **FR-003a**: A successful acceptance MUST record one "goalkeeper assigned" event in the same all-or-nothing operation as the assignment and the commission charge. The event MUST include the booking id, the request id, the goalkeeper id, the client id, the start time and the commission charged. A replayed or refused acceptance records none.
- **FR-004**: An operation that changes nothing — an idempotent replay, or any refusal — MUST NOT record an event.
- **FR-005**: The recording mechanism MUST be reusable by later features for their own events (goalkeeper assigned, booking cancelled, goalkeeper withdrew, booking expired…) without changing it.

**Publishing (Story 2)**

- **FR-006**: After the change is saved, and before the response is returned, the platform MUST publish the events that operation recorded and mark each successfully published event as published.
- **FR-007**: A publication failure MUST NOT fail the user's operation. The event stays pending and the failure is logged with the event id and type.
- **FR-007a**: In-request publication MUST give up after 2 seconds. The user's operation then responds normally, and the unpublished events stay pending for the sweep. The timeout is logged like a failure.
- **FR-008**: The sweep MUST publish every pending event, oldest first, and mark each as published.
- **FR-009**: The sweep MUST log a warning when events have been pending longer than a threshold (default 5 minutes), with their count and the oldest one's age.
- **FR-010**: Published events MUST be removed after a retention period (default 7 days). Pending events MUST never be removed automatically.

**Consuming (Story 3)**

- **FR-011**: Events MUST be delivered to each subscribed consumer at least once. Consumers MUST NOT depend on delivery order.
- **FR-012**: Each consumer MUST be idempotent: it records the events it processed, and a repeated delivery of the same event MUST NOT repeat its effect.
- **FR-013**: A consumer MUST acknowledge an event after processing it or after recognizing it as a repeat. It MUST report failure when processing fails, so the event is retried.
- **FR-014**: After a maximum number of failed delivery attempts (default 5), an event MUST be moved to a dead-letter area for manual review and no longer retried.
- **FR-015**: A malformed message or an event type the consumer doesn't handle MUST be acknowledged without effect and logged.
- **FR-016**: This feature MUST include a delivery-log consumer of "booking created" and "goalkeeper assigned", which records each event received once. It proves the chain works end to end.
- **FR-017**: Inside the application, an event MUST be able to reach several handlers: publishing one event runs every handler registered for its type. This is in addition to the existing one-handler commands and queries.

**Scheduled jobs (Story 4)**

- **FR-018**: A single sweep, triggered every minute, MUST publish pending events (FR-008) and then run every registered scheduled job.
- **FR-019**: Later features MUST be able to register a scheduled job, each with a unique name, without changing the sweep.
- **FR-020**: A failing job MUST NOT prevent the other jobs, or the publication of pending events, from running. Each failure is logged with the job name.
- **FR-021**: Two sweeps running at the same time MUST NOT publish the same pending event twice in the same pass, and MUST NOT let two sweeps run the same job at the same time.
- **FR-022**: The sweep MUST report the result: events published, events still pending, and per job whether it succeeded, failed or was skipped because another sweep was running it.

**Security (Story 5)**

- **FR-023**: The sweep endpoint and the consumer endpoints MUST be internal. They MUST accept only calls carrying a valid signed identity token issued to the platform's scheduler or messaging service, for the service's own audience.
- **FR-024**: Calls without a token, with an app user's access token (including an administrator's), or with a token for another audience or identity MUST be refused, and nothing is run, published or recorded.
- **FR-025**: The internal endpoints MUST NOT appear in the public API documentation used by the mobile app, or MUST be clearly marked as internal.

**Operations (Story 6)**

- **FR-026**: A written guide MUST list every cloud resource to create, with the exact names and settings the service expects, and the configuration variables to set:
  - the events topic;
  - the consumer subscription(s), with their endpoint and authentication;
  - the dead-letter area, with its maximum number of attempts;
  - the service identities and their permissions;
  - the every-minute scheduler job.
- **FR-027**: A local development mode MUST deliver recorded events to the local consumers without any cloud resource, using the same consumers and the same idempotency rules.
- **FR-028**: Automated tests MUST NOT use the real messaging service. The publisher MUST be replaceable by a test double.

### Key Entities

- **Domain event (outbox entry)**: one past fact to publish. Holds:
  - id, type and when it happened;
  - the ids it concerns, and a small payload;
  - its status (`pending` or `published`), when it was published, and the number of publication attempts.

  It is created in the same operation as the change and removed some days after publication.
- **Processed event (per consumer)**: the record that a given consumer already handled a given event id. It is what makes consumers idempotent.
- **Scheduled job**: a named, time-based unit of work registered by a feature and run by each sweep. Holds its name, and whether a sweep is running it right now (so two sweeps don't run it at once).
- **Delivery log entry**: what the example consumer records for each event received: event id, event type, booking id and time received.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 0 lost events. For every event recorded (booking created, goalkeeper assigned), including when the service is stopped between saving and publishing, the delivery log records its event within 2 minutes (the next sweep plus delivery).
- **SC-002**: With the messaging service available, 95% of "booking created" events reach the delivery log within 5 seconds of the confirmation.
- **SC-003**: Delivering the same event N times to a consumer produces its effect exactly once. Verified with N = 5 and with 20 simultaneous deliveries of one event.
- **SC-004**: Two sweeps started at the same instant, with 100 pending events, publish each event once (100 publications in total, not 200). Each registered job is run by only one of them.
- **SC-005**: 100% of calls to the internal endpoints without a valid platform identity are refused, and none of them runs, publishes or records anything.
- **SC-006**: A publication failure never fails a confirmation or an acceptance. With the messaging service unavailable or not answering, 100% of valid confirmations and acceptances still succeed, none takes more than 2 seconds longer than normal, and their events stay pending.
- **SC-007**: Publishing adds no more than 300 ms at p95 to the confirmation response time, compared with 012.
- **SC-008**: A replayed confirmation or acceptance records 0 events. Each successful acceptance records exactly 1 "goalkeeper assigned" event.
- **SC-009**: A developer can create a booking locally, with no cloud configuration, and see its event in the delivery log.

## Assumptions

- **Platform choices** (roadmap §4.2–4.3, already decided by the owner):
  - the messaging service is Google Cloud Pub/Sub, delivering to consumers by push subscriptions;
  - the every-minute trigger is Google Cloud Scheduler;
  - the signed identity token is Google's OIDC token for the service's own identity;
  - the service runs on Cloud Run (Firebase App Hosting) with one instance, where work after the response is not reliable. That is why publication happens before the response and the sweep is the safety net.
- **One event per booking** (clarified 2026-09-28): a 2-goalkeeper request produces two "booking created" events. Feature 015 notifies per booking and groups pushes per goalkeeper.
- **Two event types in this feature**: "booking created" (confirmation) and "goalkeeper assigned" (acceptance, clarified 2026-09-28). The other types (cancelled, withdrew, expired…) are added by the features that produce them, using the same mechanism (FR-005).
- **No real scheduled job** is registered in this feature. The first ones come with 015 (re-sending offers) and 016 (expirations, "cancel all"). Tests use test jobs.
- **Defaults**:
  - maximum delivery attempts before dead-letter: 5;
  - pending-event warning threshold: 5 minutes;
  - published-event retention: 7 days;
  - sweep frequency: every minute (a scheduler setting, not a code constant).
- **Dead-lettered events** are reviewed manually. There is no admin screen or replay tool in this feature.
- **Out of scope**:
  - push notifications to devices (014);
  - choosing and notifying eligible goalkeepers (015);
  - any rule that reacts to the events beyond the delivery log.
- **Technical decisions left to the plan**: one topic for all event types vs. one per type; the exact retention mechanism; the local mode (emulator or in-process delivery); how the sweep claims events and jobs so two sweeps don't overlap.
