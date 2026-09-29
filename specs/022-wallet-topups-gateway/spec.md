# Feature Specification: Wallet Top-ups through Payment Gateways

**Feature Branch**: `022-wallet-topups-gateway`
**Created**: 2026-09-29
**Status**: Draft
**Input**: User description: "Spec 022 de _temp_plan.md" — "Recargas de la billetera del portero mediante pasarelas de pagos, con una pasarela configurable por país. El portero recarga desde la app en cualquier momento, solo con montos predefinidos por país (no un monto libre). No existen recargas por fuera de una pasarela. (1) Varias pasarelas detrás de un mismo puerto; la primera es Wompi (Colombia). Un administrador asocia a cada país la pasarela y puede cambiarla (endpoints de administración). Las credenciales secretas no se guardan en la base de datos sino en un gestor de secretos; la base de datos guarda qué pasarela usa cada país y los datos no secretos. (2) Endpoint con los montos de recarga del país del portero; Colombia: 10.000, 20.000, 30.000, 50.000 y 100.000 COP. (3) Iniciar una recarga crea una recarga pendiente con referencia única, registra la pasarela y devuelve lo necesario para pagar; con Wompi, Web Checkout con URL firmada por el servidor que la app abre en el navegador del sistema. (4) La confirmación llega por webhook de cada pasarela, con autenticidad verificada; la redirección de vuelta a la app solo informa, nunca acredita. (5) Una recarga aprobada se acredita exactamente una vez; rechazada, anulada o con error no acredita; el barrido consulta desde el backend las recargas pendientes. (6) Cambiar la pasarela de un país no afecta las recargas en curso. (7) Una recarga cubre primero la deuda; el portero consulta sus recargas. (7b) El costo de la pasarela lo paga el portero: costos por pasarela y país (porcentaje, valor fijo, IVA); antes de pagar ve monto, costo y saldo neto; se acredita el neto dejando bruto y costo en el libro. El saldo no se puede retirar. (7c) Debe haber aceptado los términos vigentes. (8) Pasarelas detrás de un puerto para que los tests no las usen de verdad."

**Context**: Step 022 of the goalkeeper-guarantee roadmap (repository-root `_temp_plan.md`, §2.2). The goalkeeper's wallet, its ledger and the per-zone commission exist since 011; until now money only enters through an administrator's adjustment. This feature is **mandatory before production**: without top-ups no goalkeeper can accept matches. The terms-acceptance record exists since the first features. The every-minute sweep exists since 013.

**Decided in the roadmap**: Wompi first, with its hosted **Web Checkout** opened in the phone's system browser (not an embedded widget), so bank, PSE and wallet redirects work.

## Clarifications

### Session 2026-09-29

- Q: How does the goalkeeper get back to the app after paying at the gateway? → A: Through a platform-hosted HTTPS return page. It shows the top-up's current status and a "Volver a PorterosPRO" button, and the same address is registered as an Android App Link / iOS Universal Link, so the phone opens the app directly when it can. The page never credits.
- Q: Is the goalkeeper notified (push and inbox) when a top-up is approved or fails? → A: Yes, both. On approval: "Recarga aprobada: +17.000 COP. Tu saldo es X". When declined, voided, failed or expired: "Tu recarga no se completó", so they can try another payment method. Balance decides whether they see and accept matches, so telling them at once speeds up assignment.

## User Scenarios & Testing *(mandatory)*

The users are the **goalkeeper**, who needs balance to accept matches, and the **administrator**, who chooses the payment gateway of each country.

### User Story 1 - The goalkeeper tops up the wallet with a predefined amount (Priority: P1)

From the app, the goalkeeper sees the top-up amounts of their country (Colombia: 10.000, 20.000, 30.000, 50.000 and 100.000 COP). For each, they see:
- the amount to pay;
- the gateway's transaction cost;
- the balance they'll get (amount − cost).

They choose one and are taken to the gateway's payment page in the phone's browser. They pay with any method the gateway offers, and are sent back to the app. The app shows the top-up as pending until the gateway confirms it.

**Why this priority**: It's the only way money enters the platform in production. Without it no goalkeeper can pay commissions, so none can accept matches.

**Independent Test**: A goalkeeper who accepted the current terms lists the amounts, starts a 20.000 top-up and gets a payment link. The top-up is pending with a unique reference and the gateway it was started with.

**Acceptance Scenarios**:

1. **Given** a goalkeeper of a country with a gateway configured, **When** they list the top-up amounts, **Then** each amount comes with its cost and net balance, in the country's currency.
2. **Given** one of those amounts, **When** they start a top-up, **Then** a pending top-up is created. It has a unique reference, the gateway, the amount, the cost and the net, and the answer carries what the app needs to open the payment page.
3. **Given** an amount that isn't one of the country's, **Then** starting is refused.
4. **Given** a goalkeeper who hasn't accepted the current version of the terms, **Then** starting is refused, telling them to accept the terms first.
5. **Given** a country without a gateway configured, **Then** the amounts list says top-ups aren't available, and starting is refused.
6. **Given** the gateway sends the goalkeeper back, **Then** they land on the platform's return page, which shows the top-up's current status and a button to open the app. When the phone recognizes the address as the app's link, it opens the app directly (clarification 1). Nothing is credited by that return.

---

### User Story 2 - An approved payment credits the wallet exactly once (Priority: P1)

When the gateway confirms the payment, the platform checks the confirmation is genuine and credits the wallet with the net balance. The ledger shows the gross amount and the gateway cost as separate movements. A negative balance (from penalties) is covered first, automatically. A rejected, voided or failed payment credits nothing. A repeated confirmation never credits twice.

**Why this priority**: Money must be exact. A missed credit angers the goalkeeper; a double credit loses money.

**Independent Test**:
- A genuine "approved" confirmation → the balance increases by exactly the net once, and the ledger has the gross top-up and the cost.
- The same confirmation again → nothing new.
- A confirmation with a bad signature → rejected, nothing credited.

**Acceptance Scenarios**:

1. **Given** a pending top-up, **When** a genuine "approved" confirmation arrives for its reference with the same amount, **Then** it's marked approved, and the wallet gets the gross amount as a top-up and the cost as a gateway-fee debit. The balance increases by the net.
2. **Given** a negative balance of −5.000 and a net of 17.000, **Then** the balance becomes 12.000: the debt is covered first.
3. **Given** a "declined", "voided" or "error" confirmation, **Then** the top-up gets that final status and nothing is credited.
4. **Given** the same confirmation delivered again, or confirmations for an already final top-up, **Then** nothing changes.
5. **Given** a confirmation whose authenticity check fails, or whose amount or currency doesn't match the top-up, **Then** nothing is credited, and it's logged for review.
6. **Given** a confirmation for an unknown reference, **Then** it's acknowledged and logged, and nothing changes.

---

### User Story 3 - Pending top-ups are reconciled from the platform side (Priority: P1)

Gateways retry their confirmations only a few times. So the platform itself asks the gateway, on a schedule, for the status of top-ups that have been pending for a while. It applies the answer exactly like a confirmation. A top-up pending for too long is closed as expired, without credit.

**Why this priority**: A single lost confirmation would leave a paid goalkeeper without balance.

**Independent Test**: A top-up pending for 15 minutes with no confirmation → the scheduled check asks the gateway, which says "approved" → it's credited once. One the gateway still reports pending after the maximum wait → expired, nothing credited.

**Acceptance Scenarios**:

1. **Given** a top-up pending for at least 15 minutes, **Then** the scheduled check asks the gateway it was started with. It does so at increasing intervals, so a top-up isn't asked every minute.
2. **Given** the answer is final, **Then** it's applied like a confirmation (Story 2), exactly once.
3. **Given** no final status after 48 hours, **Then** the top-up becomes expired, with no credit. A late approval of an expired top-up is still credited, and logged.
4. **Given** the gateway can't be reached, **Then** it's retried on a later run, and nothing changes meanwhile.

---

### User Story 4 - The goalkeeper sees their top-ups (Priority: P2)

The goalkeeper lists their top-ups, newest first. Each shows the amount, the cost, the net, the status (pending, approved, declined, voided, error, expired), when it was started and when it became final. The app uses the top-up's status when returning from the payment page.

**Why this priority**: The goalkeeper needs to know whether a payment went through, especially when it stays pending (for example, a bank transfer).

**Independent Test**: After one approved and one declined top-up, the list shows both with their statuses and amounts. One top-up's status can be read by its id.

**Acceptance Scenarios**:

1. **Given** top-ups, **Then** the goalkeeper lists them paginated, newest first, only their own.
2. **Given** a top-up id, **Then** the goalkeeper gets its current status; another goalkeeper's is not found.

---

### User Story 5 - An administrator chooses each country's gateway (Priority: P2)

An administrator:
- sets which gateway charges in each country, with its non-secret data (such as a public key) and its cost formula (percentage, fixed amount, VAT on the cost);
- sets each country's top-up amounts;
- can change the gateway at any time.

Top-ups already started keep being confirmed with the gateway they started with. Secret credentials never go in the database; they live in the platform's secret store.

**Why this priority**: Gateways differ per country, and switching must not disrupt payments in flight.

**Independent Test**: An administrator sets Colombia to Wompi with its public key, costs and amounts → new top-ups use Wompi. Switching Colombia to another gateway → new top-ups use the new one, and a pending Wompi top-up is still confirmed with Wompi.

**Acceptance Scenarios**:

1. **Given** an administrator, **Then** they can read and set a country's gateway configuration: gateway, non-secret data, costs and amounts.
2. **Given** a change of gateway, **Then** only top-ups started afterwards use it.
3. **Given** a non-administrator, **Then** these endpoints are refused.
4. **Given** a configuration that names an unsupported gateway, or has invalid amounts or costs, **Then** it's refused.

---

### Edge Cases

- **Two taps on "pay"**: each start creates its own pending top-up and reference. Only the ones actually paid are credited.
- **Paid after 48 h** (a delayed bank transfer): an expired top-up that the gateway later reports approved is credited, once, and logged. The goalkeeper paid, so they get the balance.
- **The gateway reports a different amount**: never credited automatically. The top-up is flagged for review (logged), and operations resolves it outside the platform.
- **Cost rounding**: the cost is rounded up to the whole unit of the currency, and the net is always ≥ 1. An amount whose cost would leave no net is not offered.
- **The goalkeeper stops being a goalkeeper, or the wallet isn't configured**: starting is refused. An approved payment for an existing top-up is still credited.
- **The country's gateway changes while a top-up is pending**: it's reconciled with its own gateway (US5).
- **A wallet is never withdrawable**: there's no payout of balance in this or any feature (roadmap §2.2).

## Requirements *(mandatory)*

### Functional Requirements

**Amounts and start (Story 1)**

- **FR-001**: Each country MUST have a list of top-up amounts (Colombia: 10.000, 20.000, 30.000, 50.000, 100.000 COP), and a goalkeeper MUST be able to list those of their wallet's country, each with its cost and net.
- **FR-002**: The cost MUST be computed from the country's gateway cost formula: a percentage of the amount, plus a fixed value, plus VAT on that cost when configured. It's rounded up to whole currency units. The net is the amount minus the cost.
- **FR-003**: A goalkeeper MUST be able to start a top-up only for one of their country's amounts, only after accepting the current terms version, and only when their country has a gateway configured.
- **FR-004**: Starting MUST create a pending top-up with:
  - a unique reference;
  - the gateway;
  - amount, cost, net and currency.

  It MUST answer with what the app needs to complete the payment. For Wompi, that's the full Web Checkout address, signed on the server; the signing secret is never sent to the app.
- **FR-005**: Top-ups MUST only happen through a gateway. There is no other way for money to enter a wallet besides the administrator's typed adjustment (011).

**Confirmation and credit (Stories 2 and 3)**

- **FR-006**: The platform MUST accept confirmations from each gateway on its own address. It MUST verify their authenticity with that gateway's method (for Wompi, the event checksum with the events secret). Unauthentic confirmations change nothing.
- **FR-007**: An approved top-up MUST be credited exactly once:
  - the gross amount as a top-up movement;
  - the cost as a gateway-fee debit;
  - both referencing the top-up.

  A negative balance is covered first by the arithmetic of the ledger.
- **FR-008**: Declined, voided and failed top-ups MUST end with that status and no credit. A final top-up never changes again, except an expired one reported approved later (edge case).
- **FR-008a**: When a top-up is approved, the goalkeeper MUST receive one notice (push and inbox) with the credited net and the new balance. When it ends declined, voided, failed or expired, they MUST receive one notice saying it wasn't completed. A late approval of an expired top-up sends the approval notice. Each notice is sent once per top-up and outcome (clarification 2).
- **FR-009**: A confirmation whose amount or currency differs from the top-up MUST NOT credit. It MUST be logged for review.
- **FR-010**: The return from the payment page MUST NOT credit anything.
- **FR-010a**: The platform MUST serve a public HTTPS return page for a top-up reference (clarification 1). It shows the top-up's status (pending, approved, declined…), amounts and a "Volver a PorterosPRO" button that opens the app. It shows nothing more about the goalkeeper. The platform MUST also publish the files that let Android and iOS open the app directly from that address (App Link / Universal Link association).
- **FR-011**: The scheduled check MUST ask each gateway for the status of top-ups pending for at least 15 minutes, at increasing intervals (15 min, 1 h, 6 h, 24 h). It MUST apply the answers like confirmations, and expire top-ups still pending after 48 hours.

**Queries and administration (Stories 4 and 5)**

- **FR-012**: A goalkeeper MUST be able to list their top-ups (paginated, newest first) and read one by id. Other goalkeepers' top-ups are not found.
- **FR-013**: An administrator MUST be able to read and set, per country:
  - the gateway;
  - its non-secret data;
  - its cost formula;
  - the top-up amounts.

  Changes apply to top-ups started afterwards only.
- **FR-014**: Secret gateway credentials MUST be kept outside the database, in the platform's secret store, and never returned by any endpoint.
- **FR-015**: Every gateway interaction MUST go through one replaceable boundary, so automated tests never contact a real gateway.

### Key Entities

- **Top-up**: one goalkeeper's attempt to add balance. It holds:
  - the goalkeeper and their country;
  - the gateway it started with;
  - the unique reference and the gateway's transaction id (once known);
  - amount, cost, net and currency;
  - its status and when it was started, confirmed and last checked.
- **Country gateway configuration**: per country:
  - the gateway;
  - its non-secret data (such as the public key and the return address);
  - the cost formula;
  - the top-up amounts.
- **Gateway fee movement**: a new ledger movement type, a debit of the transaction cost that references the top-up.
- **Top-up notices**: "approved" and "not completed", to the goalkeeper (clarification 2).
- **Gateway confirmation**: an authenticated message from the gateway with a transaction's final status. It's logged whether or not it changes anything.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A goalkeeper can go from "top up" to the payment page in under 20 seconds, and sees the cost and the net before paying.
- **SC-002**: 100% of approved payments are credited exactly once, within 1 minute of the gateway's confirmation, or within the next reconciliation when the confirmation is lost.
- **SC-003**: 0 credits from unauthentic confirmations, mismatched amounts or returns from the payment page.
- **SC-004**: Changing a country's gateway affects 0 top-ups already in flight.
- **SC-005**: No secret credential appears in the database, the logs or any response.
- **SC-006**: 100% of approved or failed top-ups notify the goalkeeper within 1 minute of the platform learning the outcome.

## Assumptions

- **Wompi Web Checkout** is the first gateway (roadmap decision). Other gateways plug in behind the same boundary later.
- **The return address** is the platform's return page (clarification 1). The app identifiers for the link association are configuration. The page only informs.
- **Initial Colombia values**: amounts 10.000–100.000 COP. The cost formula is seeded by an administrator from Wompi's current commercial terms; no specific rate is assumed here.
- **The terms version** is the one the platform already uses for the profile's terms acceptance (the current version). If the goalkeeper accepted an older version, they must accept again.
- **Reconciliation timings** (15 min first check, then 1 h, 6 h, 24 h; expiry at 48 h) are defaults of this feature, adjustable later.
- **Invoicing** of top-ups or commissions is feature 023.
- **Out of scope**:
  - refunds or chargebacks through the gateway (handled manually by operations);
  - withdrawals of balance (never allowed);
  - saved cards or automatic top-ups.
