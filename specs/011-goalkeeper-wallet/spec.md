# Feature Specification: Goalkeeper Wallet and Platform Commission ✅

**Feature Branch**: `011-goalkeeper-wallet`
**Created**: 2026-09-27
**Status**: ✅ Implemented — merged into `main` on 2026-09-27. Manual checks deferred to the end of the roadmap (`_temp_pruebas.md`).
**Input**: User description: "Billetera del portero y comisión de la plataforma. El cliente le paga al portero directamente; la plataforma gana una comisión fija por cada reserva que el portero acepta, que se descuenta de la billetera del portero. Requisitos: (1) Cada portero tiene una billetera con saldo en la moneda de su país. El saldo solo cambia mediante movimientos registrados en un libro inmutable: recarga, cobro de comisión, devolución de comisión, penalidad, reversión de penalidad y ajuste administrativo. Cada movimiento guarda tipo, monto, saldo resultante, fecha y referencias (reserva, solicitud, recarga, caso) y, en devoluciones, el detalle de la cancelación (quién canceló, cuándo, motivo). (2) La comisión es un monto fijo configurable por país, por ciudad ancla o por zona; aplica la más específica (zona, luego ciudad ancla, luego país). (3) Reglas de fondos, expuestas como política de dominio reutilizable: el portero no ve partidos ni recibe ofertas si su saldo es menor que la comisión más baja de las zonas que tiene habilitadas; y solo puede ver y aceptar partidos cuya comisión puede pagar. El saldo puede quedar negativo solo por penalidades. (4) Endpoint para que el portero consulte su saldo y sus movimientos (paginado). (5) Endpoints de administración (rol admin, sin interfaz todavía): consultar la billetera y los movimientos de un portero, y registrar un ajuste manual con motivo obligatorio. Las recargas con pasarela de pagos son la última feature del plan; hasta entonces el saldo se carga con el ajuste administrativo (motivo obligatorio). El cobro y la devolución de comisiones los usarán las features de aceptación y cancelación."

**Context**: Step 011 of the goalkeeper-guarantee roadmap (repository-root `_temp_plan.md`, section 2.2). The client pays the goalkeeper directly, outside the app. The platform's revenue is a fixed commission per accepted booking, taken from the goalkeeper's prepaid wallet. Colombia's initial commission is 7.000 COP. The wallet balance **cannot be withdrawn**: it is credit for commissions and penalties only.

## Clarifications

### Session 2026-09-27

- Q: What happens with the matches of a zone whose commission is not configured at any level? → A: They are offered to no goalkeeper, and a warning naming the zone is logged so operations configures it (same principle as an unconfigured area in the quote).
- Q: May an administrator's debit adjustment leave a balance below 0? → A: No. It is refused; only penalties can create a debt. To correct an over-credit the administrator debits at most the available balance and handles the rest manually.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Every change to a goalkeeper's money is a recorded movement (Priority: P1)

Every active goalkeeper has a wallet in the currency of their country. The balance never changes by itself or by editing a number: each change is a **movement** in an append-only record. The possible movements are:
- top-up;
- commission charge;
- commission refund;
- penalty;
- penalty reversal;
- administrative adjustment.

Each movement states its type, amount, the balance right after it, when it happened, and what it refers to (booking, request, top-up or case). Refunds also carry the details of the cancellation that caused them.

**Why this priority**: It is the foundation of all money handling in the roadmap: acceptance charges commissions, cancellations refund them, withdrawals penalize, and top-ups arrive later. A wallet that can be edited silently could not be trusted, audited or invoiced.

**Independent Test**: Record a series of movements for one goalkeeper: an adjustment +20.000, a commission −7.000, a refund +7.000 and a penalty −7.000. Verify that:
- the balance always equals the sum of the movements;
- each movement shows the balance right after it;
- no movement can be edited or deleted;
- the same cause (for example, the commission of booking X) can never be recorded twice.

**Acceptance Scenarios**:

1. **Given** a goalkeeper with an empty wallet, **When** movements +20.000, −7.000 and +7.000 are recorded in order, **Then** the balance is 20.000 and the movements show resulting balances of 20.000, 13.000 and 20.000.
2. **Given** a commission charge already recorded for booking X, **When** a second charge for booking X is attempted, **Then** it is not recorded again, and the result identifies the existing movement.
3. **Given** a commission refund caused by a client cancellation, **When** it is recorded, **Then** the movement carries the booking and request, who cancelled, when and the stated reason.
4. **Given** several movements recorded at the same moment for the same goalkeeper, **Then** none is lost and the final balance equals the sum of all of them.

---

### User Story 2 - The goalkeeper sees their balance and history (Priority: P1)

An active goalkeeper opens "Mi billetera" in the app and sees three things:
- their current balance and currency;
- whether they can currently see offers, and if not, how much they need to reach the minimum;
- their movements, newest first, one page at a time.

**Why this priority**: The goalkeeper must understand why they see no matches, and must be able to check every charge. It is the only goalkeeper-facing part of this feature.

**Independent Test**: For a goalkeeper with an adjustment of +20.000 and a commission of −7.000, request the wallet and the first page of movements. The balance must be 13.000 COP, the offers status must be visible, and the two movements must be listed newest first with types, amounts, resulting balances and references.

**Acceptance Scenarios**:

1. **Given** an active goalkeeper with movements, **When** they request their wallet, **Then** they see their balance, currency and offers status, and never another goalkeeper's data.
2. **Given** a goalkeeper with 45 movements, **When** they page through them 20 at a time, **Then** they see 20, 20 and 5, newest first, each exactly once, with correct totals.
3. **Given** an active goalkeeper who has never had a movement, **When** they request their wallet, **Then** they see a balance of 0 in their country's currency and an empty history, not an error.
4. **Given** a signed-in user who is not an active goalkeeper, **When** they request a wallet, **Then** the request is refused.

---

### User Story 3 - Commission defined per country, anchor city or zone (Priority: P1)

The business defines the commission as a fixed amount per country, and can override it for an anchor city or for a single zone. For any zone, the commission that applies is the most specific one defined: the zone's own, else its anchor city's, else its country's.

**Why this priority**: Acceptance (next feature) charges this amount, and the offers rule (Story 4) depends on it. Without a defined commission, nothing can be charged.

**Independent Test**: With Colombia at 7.000, the anchor city Medellín at 8.000 and zone Laureles at 9.000, resolve the commission for Laureles (9.000), for another Medellín zone (8.000) and for a Cali zone (7.000).

**Acceptance Scenarios**:

1. **Given** only the country commission (7.000), **When** the commission of any of its zones is resolved, **Then** it is 7.000.
2. **Given** an anchor-city override (8.000), **When** a zone of that city without its own value is resolved, **Then** it is 8.000.
3. **Given** a zone override (9.000), **When** that zone is resolved, **Then** it is 9.000, regardless of the city and country values.
4. **Given** a zone whose country, city and zone all lack a commission, **When** it is resolved, **Then** the result is "not configured", and that zone's matches cannot be offered or accepted (see Story 4). The gap is logged so operations can configure it.

---

### User Story 4 - A goalkeeper only sees matches they can pay the commission for (Priority: P1)

The funds rules are defined here as a reusable decision, used by the next features (available matches, acceptance, notifications):
- If a goalkeeper's balance is lower than the **lowest commission among the zones they have enabled**, they see no matches and receive no offers at all.
- Otherwise, they see and can accept only the matches whose zone commission they **can pay** with their current balance.

**Why this priority**: It keeps the platform from assigning goalkeepers who cannot pay the commission. It also tells the app exactly why a goalkeeper sees nothing.

**Independent Test**: Take a goalkeeper with zones whose commissions are 7.000 and 9.000:
- with a balance of 6.000 → no offers at all;
- with 8.000 → offers only for the 7.000 zone;
- with 9.000 → both zones;
- with −2.000 → none.

**Acceptance Scenarios**:

1. **Given** a balance below the lowest commission of the enabled zones, **Then** the decision is "sees no offers", together with the amount missing to reach that lowest commission.
2. **Given** a balance of 8.000 and zones at 7.000 and 9.000, **Then** only matches of the 7.000 zone are affordable.
3. **Given** a balance exactly equal to a zone's commission, **Then** that zone's matches are affordable (the balance may end at 0).
4. **Given** a negative balance (after a penalty), **Then** the goalkeeper sees no offers until the balance covers the lowest commission again.
5. **Given** an enabled zone whose commission is not configured, **Then** that zone is ignored for the minimum and its matches are never affordable.

---

### User Story 5 - Administrators can inspect wallets and credit or debit them manually (Priority: P2)

Until payment-gateway top-ups exist (the last feature of the roadmap), an administrator is the only way money enters a wallet in development and testing. Administrators can:
- look up any goalkeeper's wallet and movements;
- record a **manual adjustment** (credit or debit) with a mandatory reason.

These capabilities are exposed so a future administration interface only needs screens.

**Why this priority**: Without it, no goalkeeper could accept matches before the gateway exists. It is internal tooling, so it ranks below the goalkeeper-facing stories.

**Independent Test**: As an administrator:
- credit +50.000 with the reason "Saldo inicial de pruebas";
- debit −10.000 with a reason;
- verify both movements, the administrator who made them, the reasons and the resulting balance;
- verify that an adjustment without a reason, or by a non-administrator, is refused.

**Acceptance Scenarios**:

1. **Given** an administrator, **When** they credit +50.000 to a goalkeeper with a reason, **Then** an administrative-adjustment movement records the amount, the reason, the administrator and the resulting balance.
2. **Given** an adjustment with an empty or missing reason, or an amount of 0, **Then** it is refused as invalid input and nothing is recorded.
3. **Given** a debit that would leave the balance below 0, **Then** it is refused: only penalties may take a balance negative.
4. **Given** the same adjustment submitted twice with the same operation key (for example, a double click), **Then** exactly one movement is recorded and both answers return it.
5. **Given** a non-administrator, **When** they call any administration capability, **Then** it is refused.
6. **Given** an administrator looks up a user who is not an active goalkeeper, **Then** the answer is "not found".

---

### Edge Cases

- **Two movements at the same instant** (for example, a commission charge and an admin credit): both are recorded, the balance equals the sum of all movements, and the resulting balances follow a single consistent order. There are never two movements with the same "previous balance".
- **A debit adjustment larger than the balance**: refused, and nothing recorded. A penalty in the same situation is recorded and leaves the balance negative (only penalties may do this).
- **Charging a commission the goalkeeper cannot afford** (a later feature asks the wallet to do it): refused as "insufficient funds", and nothing recorded. The funds rule is re-checked at the moment of the charge, not only when listing.
- **Goalkeeper changes zones**: the "lowest commission of enabled zones" always uses the zones enabled now.
- **Commission changed after a charge**: past movements keep the amount charged. Refunds return exactly what was charged for that booking, never the current commission.
- **Currency**: a wallet has a single currency (its country's). A movement in another currency is refused.
- **Wallet not yet created**: it behaves as an empty wallet (balance 0) until its first movement.

## Requirements *(mandatory)*

### Functional Requirements

**Wallet and movements**

- **FR-001**: Every active goalkeeper MUST have exactly one wallet, in the currency of the country of their profile's city. A goalkeeper without movements has a balance of 0.
- **FR-002**: The balance MUST change only through movements. Movements are **append-only**: never edited or deleted. The balance MUST always equal the sum of the wallet's movements.
- **FR-003**: Movement types MUST be exactly: top-up, commission charge, commission refund, penalty, penalty reversal, administrative adjustment. Credits (top-up, refund, penalty reversal, positive adjustment) increase the balance; debits (commission, penalty, negative adjustment) decrease it.
- **FR-004**: Every movement MUST record:
  - its type and signed amount (whole currency units);
  - the currency;
  - the resulting balance;
  - when it happened;
  - who or what caused it (the system, the goalkeeper, or an administrator identified by user);
  - its references when they apply (booking, request, top-up, case).

  A commission refund MUST also record the cancellation details: who cancelled (client, system, administrator), when, and the reason.
- **FR-005**: Each movement MUST also keep what a later electronic-invoicing feature will need: type, amounts, currency, date, references, and the goalkeeper's identification as registered in their profile (document type and number). No data migration should be needed when invoicing is added.
- **FR-006**: A given cause MUST produce at most one movement: one commission charge per booking, one refund per charged booking, one penalty per penalized event, one reversal per penalty, one top-up per payment, one adjustment per operation key. Repeating a recording of the same cause MUST return the existing movement without changing the balance.
- **FR-007**: Concurrent movements on the same wallet MUST all be recorded without losing any. Each movement's resulting balance MUST be consistent with a single order of all the wallet's movements.
- **FR-008**: Only penalties MAY leave the balance negative. Any other debit (commission charge, negative adjustment) that would leave it negative MUST be refused without recording anything.

**Commission**

- **FR-009**: The commission MUST be a fixed amount, configurable per country, with optional overrides per anchor city and per zone. For a zone, the effective commission is the zone's own value, else its anchor city's, else its country's. The initial value for Colombia is 7.000 COP at country level.
- **FR-010**: When no level defines a commission for a zone, that zone's commission MUST be "not configured": its matches are never affordable (FR-012), and the gap MUST be logged naming the zone.
- **FR-011**: A refund MUST return exactly the amount charged for that booking, regardless of the commission in force when the refund is recorded.

**Funds rules (reusable decision)**

- **FR-012**: The funds rules MUST be a single reusable decision, used by every later feature that lists, offers, notifies or accepts matches:
  - **(a) Can the goalkeeper see offers at all?** Only if their balance is at least the lowest configured commission among the zones they currently have enabled. When not, the decision gives the amount missing.
  - **(b) Can they afford a given match?** Only if their balance is at least the configured commission of the match's zone.

  A balance equal to the commission counts as enough. A negative balance never qualifies.
- **FR-013**: Charging a commission MUST re-apply rule (b) at the moment of the charge, and MUST be refused as "insufficient funds" when it fails, recording nothing.

**Goalkeeper access**

- **FR-014**: An active goalkeeper MUST be able to consult their own wallet:
  - balance;
  - currency;
  - the result of rule (a): can see offers, the lowest commission of their enabled zones, and the amount missing;
  - their movements, paginated, newest first (ties broken deterministically).

  Pagination follows the same conventions as the client's bookings list: page (default 1), page size (default 20, max 50) and totals. The goalkeeper is identified only by their session.
- **FR-015**: A user who is not an active goalkeeper MUST be refused access to a goalkeeper wallet.

**Administration**

- **FR-016**: An administrator MUST be able to consult any active goalkeeper's wallet (same content as FR-014) and their movements (paginated), by the goalkeeper's user identifier.
- **FR-017**: An administrator MUST be able to record an administrative adjustment on a goalkeeper's wallet with:
  - a signed, non-zero whole amount;
  - a mandatory reason (non-empty text);
  - an operation key for idempotency.

  The movement records the administrator. A negative adjustment that would leave the balance below 0 is refused (FR-008).
- **FR-018**: Administration capabilities MUST be refused to non-administrators. A user who is not an active goalkeeper MUST be answered as "not found".
- **FR-019**: The capabilities that later features need (charge a commission for a booking, refund it with the cancellation details, apply a penalty, reverse it, credit a top-up) MUST exist as internal operations with the guarantees above. No endpoint exposes them in this feature: their callers arrive in later features.

### Key Entities

- **Wallet**: one per active goalkeeper. Holds the goalkeeper (user), the currency (their country's), the current balance (always the sum of its movements) and its creation time.
- **Wallet movement**: an immutable entry. Holds the wallet, the type, the signed amount, the currency, the resulting balance, when it happened, who caused it, its references (booking, request, top-up, case), the cancellation details for refunds, the reason for administrative adjustments, the cause key that makes it unique, and the goalkeeper's identification for invoicing.
- **Commission setting**: a fixed amount per country, with optional anchor-city and zone overrides.
- **Funds decision**: the result of the reusable rules. For offers: allowed or not, the lowest commission and the amount missing. For a match: affordable or not.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of wallets, the balance equals the sum of the movements, including after 100 movements recorded concurrently on the same wallet, repeated 50 times.
- **SC-002**: Recording the same cause twice (sequentially or concurrently) produces exactly 1 movement in 100% of attempts.
- **SC-003**: 0 debits other than penalties ever leave a balance below 0.
- **SC-004**: The funds decision matches the expected result in 100% of the test table (balances below, equal to and above each zone's commission, negative balances, unconfigured zones).
- **SC-005**: A goalkeeper sees their balance and first page of movements in under 1 second in 95% of requests, for wallets with up to 1.000 movements.
- **SC-006**: 100% of administrative adjustments record the administrator and a non-empty reason; 100% of calls by non-administrators are refused.

## Assumptions

- **Scope**:
  - In scope: the wallet, the movement record, commission configuration and resolution, the funds rules, the goalkeeper's read access, and administrator reads and adjustments.
  - Out of scope, arriving in later features: actually charging commissions on acceptance (012), refunds on cancellation (016–017), penalties and their reversals (018) and gateway top-ups (022). This feature provides the internal operations they will call.
- **No withdrawals**: the balance is credit for commissions and penalties only (roadmap decision). No payout exists.
- **Admin debits cannot go below 0** (confirmed in Clarifications): only penalties can create a debt. To correct an over-credit, the administrator debits at most the available balance and handles the rest manually.
- **Wallet currency** is taken from the country of the goalkeeper's profile city (city → region → country, the same path the quote uses). Zones enabled by a goalkeeper belong to that same country.
- **Lazy creation**: a wallet may be created at its first movement. Before that, reads show a balance of 0.
- **The goalkeeper's identification for invoicing** comes from the goalkeeper profile (document type and number captured during registration). What exactly gets invoiced is decided in feature 023.
- **Commission configuration is seeded by operations** (like rates and booking settings); managing it from an admin interface is future work. The initial Colombia value is 7.000 COP.
- **Operation key for admin adjustments**: provided by the caller (the future admin interface) to make double submissions harmless.
- **Dependencies**: goalkeeper profiles and enabled zones (005), zones, cities, regions and countries (005/007), the admin role in the session (001).
