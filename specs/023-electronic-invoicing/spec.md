# Feature Specification: Electronic Invoicing (per country, Colombia first)

**Feature Branch**: `023-electronic-invoicing`
**Created**: 2026-09-29
**Status**: Draft
**Input**: User description: "Spec 023 de _temp_plan.md" — "Facturación electrónica ante la DIAN de los ingresos de la plataforma. [SEGÚN EL CONTADOR: qué se factura (cada comisión cobrada al aceptar una reserva, cada recarga, o un consolidado periódico), a nombre de quién (el portero, con sus datos de identificación ya registrados en su perfil de portero), cuándo se emite, y cómo se manejan devoluciones (notas crédito por comisiones devueltas).] La emisión se hace con un proveedor tecnológico autorizado, detrás de un puerto, de forma idempotente (un evento facturable produce una sola factura) y con reintentos si el proveedor falla. El portero puede consultar y descargar sus facturas."

**Context**: Step 023, the last of the goalkeeper-guarantee roadmap (repository-root `_temp_plan.md`, §2.2 and §6). In Colombia, electronic invoicing before the tax authority (DIAN) is **mandatory** for the platform's income. The money flows exist already:
- **011**: the wallet ledger. Every movement keeps what invoicing needs: type, signed amount, currency, date, references to the booking or top-up, and the goalkeeper's document type and number at that moment.
- **012**: a commission is charged when a goalkeeper accepts a booking.
- **016–018**: commissions are refunded when a booking is cancelled, and penalties are charged (and can be reversed by an administrator).
- **022**: top-ups through Wompi, with the gateway fee as its own movement.

Decided with the owner and their accountant (2026-09-29): each commission and each penalty is invoiced right after it's charged; each refunded commission and each reversed penalty gets a credit note referencing the original invoice; the provider for Colombia is Siigo. Each country gets its own provider, configured by administrators (clarification 6), so the service can open in other countries.

## Clarifications

### Session 2026-09-29

- Q: How is issuing an invoice triggered? → A: By events. When a commission is charged (or refunded), a "commission charged" (or "commission refunded") event is recorded together with the charge, in the same all-or-nothing step, so a charge without its event, or an event without its charge, can't exist. A separate, independent process consumes the event and issues the document. The goalkeeper's acceptance never waits for the provider, and the event is kept and delivered again until the document is issued or rejected for its data, so no invoice is ever lost.
- Q: Are penalties invoiced too? → A: Yes. Each penalty (a withdrawal's or a no-show's) is invoiced like a commission, from its own "penalty charged" event, and each reversal by an administrator gets a credit note, from a "penalty reversed" event, referencing that invoice.
- Q: Does the charged amount already include VAT? → A: No. The commission (and the penalty) is the platform's net; VAT is charged on top, as its own wallet debit in the same step, at a rate the administrator configures per country (Colombia 19 %, or 0 %). The invoice's base is the commission and its VAT is that debit. A refund or reversal gives back both.
- Q: How does the goalkeeper receive each document? → A: The provider emails it (PDF and XML) to the goalkeeper's account email when it's issued, which is the delivery the tax authority requires. It's also listed in the app to consult and download. No inbox notice and no push.
- Q: Is VAT also charged on top of penalties? → A: Yes. The configured penalty is the net; its VAT is debited on top as its own movement (it may leave the balance negative, like the penalty itself), and a reversal gives both back.
- Q: Is the invoicing provider fixed? → A: No. An administrator sets, per country, which invoicing provider to use and its non-secret configuration; each provider's credentials for each country live in the secret manager. Siigo serves Colombia first; other countries get their own providers later. Each document keeps the provider it was sent to, and its credit note goes to the same one, even if the country's provider changes afterwards.

## User Scenarios & Testing *(mandatory)*

The actors are the **goalkeeper** (the buyer: the platform charges them), the **platform**, which issues invoices automatically, and the **administrator**, who watches that every invoice was accepted by the tax authority.

### User Story 1 - Every billable charge gets exactly one electronic invoice (Priority: P1)

Whenever the platform earns money from a goalkeeper, a billable event is recorded, and an electronic invoice is issued to that goalkeeper through an authorized technological provider. The billable charges are **each commission**, charged when the goalkeeper accepts a booking, and **each penalty**, charged for a withdrawal or a no-show (clarification 2). Each is invoiced right after it's charged (decided with the accountant). Top-ups are not invoiced: they're balance the goalkeeper keeps to pay commissions.

Issuing is **event-driven** (clarification 1): charging a commission or a penalty records a "commission charged" or "penalty charged" event in the same step, and a separate process consumes it and issues the invoice. The acceptance answers without waiting for the provider.

**VAT is charged on top** (clarification 3): the commission or penalty is the platform's net, the base of the invoice. The VAT, at the country's configured rate, is debited from the wallet as its own movement in the same step, and is the invoice's tax. With 19 %, accepting a 7.000 COP booking debits 7.000 + 1.330 = 8.330 COP.

The invoice is addressed to the goalkeeper, with the identification registered in their goalkeeper profile (document type and number, full name) as it was when the charge happened.

**Why this priority**: It's a legal obligation. Without it the platform can't operate in production.

**Independent Test**: A billable event for a goalkeeper produces one invoice request to the provider with the goalkeeper's identification, the concept, the amount and the currency. The same event processed twice still produces one invoice.

**Acceptance Scenarios**:

1. **Given** a billable event, **When** it's processed, **Then** one invoice is issued to the goalkeeper who was charged, with their identification at the time of the charge, the concept, the date, the amount and the currency, and it's stored with the tax authority's unique code (CUFE) and its number.
2. **Given** the same billable event processed again (a retry or a duplicate), **Then** no second invoice is issued.
3. **Given** the provider is down or answers with a temporary error, **Then** the invoice stays pending and is retried automatically until it's issued; the charge itself is never undone or delayed.
4. **Given** the provider or the tax authority rejects the invoice for a data problem, **Then** it's marked rejected with the reason, and administrators can see it to fix the data and retry.
5. **Given** Colombia's VAT rate is 19 % and the commission is 7.000 COP, **When** a goalkeeper accepts a booking, **Then** the wallet gets a 7.000 commission debit and a 1.330 VAT debit together, and the invoice shows base 7.000, VAT 1.330 and total 8.330.
6. **Given** a goalkeeper whose balance covers the commission but not the commission plus VAT, **Then** they don't see that match and can't accept it.
7. **Given** a country with a 0 % rate, **Then** no VAT debit is recorded and the invoice carries no VAT.
8. **Given** a 7.000 COP penalty at 19 %, **When** it's charged for a withdrawal or a no-show, **Then** the wallet gets a 7.000 penalty debit and a 1.330 VAT debit together (even if the balance goes negative), and one invoice is issued with base 7.000 and VAT 1.330, with the concept of the penalty (clarification 5).
9. **Given** a goalkeeper accepts a booking, **When** the commission is charged, **Then** the "commission charged" event exists if and only if the charge exists, and the acceptance answers without waiting for the invoice.
10. **Given** the invoicing process stops (a crash or a deploy) after the event was recorded, **Then** the event is delivered again later and its invoice is still issued, once.

---

### User Story 2 - Refunds and reversals are reflected with credit notes (Priority: P1)

When money the platform invoiced is given back to the goalkeeper (a refunded commission, or a penalty an administrator reverses), the invoice is corrected with **a credit note for each refund or reversal**, for the refunded amount, referencing the original invoice (decided with the accountant).

**Why this priority**: Refunds happen every day (client cancellations, "cancel all", withdrawal reversals). Invoices that ignore them overstate the platform's income.

**Independent Test**: A charge that was invoiced and then refunded ends with the correcting document the accountant chose, linked to the original, and the goalkeeper sees both.

**Acceptance Scenarios**:

1. **Given** an invoiced charge, **When** it's fully refunded, **Then** the commission (or penalty) and its VAT are both given back to the wallet in the same step, and the correcting document is issued once, for base and VAT, referencing the original invoice.
2. **Given** a refund repeated or processed twice, **Then** only one correcting document exists.
3. **Given** a commission is refunded or a penalty reversed, **Then** a "commission refunded" or "penalty reversed" event is recorded in the same step, and a separate process issues the credit note from it.
4. **Given** a refund whose original invoice is still pending, **Then** the correction waits for the original and is issued after it.

---

### User Story 3 - The goalkeeper consults and downloads their invoices (Priority: P2)

From the app, the goalkeeper lists their invoices and credit notes (newest first) with number, date, concept, amount and status, and downloads the PDF (and the XML the tax authority requires) of each.

**Why this priority**: The goalkeeper needs their invoices for their own accounting, but it doesn't block operating.

**Independent Test**: After two issued invoices and one credit note, the goalkeeper lists three documents and downloads each one; another goalkeeper's document can't be read.

**Acceptance Scenarios**:

1. **Given** issued documents, **When** the goalkeeper lists them, **Then** they see only their own, newest first, paginated.
2. **Given** an issued document, **When** they download it, **Then** they get its PDF or its XML.
3. **Given** a pending or rejected document, **Then** it's listed with its status and can't be downloaded yet.
4. **Given** a document is issued, **Then** the goalkeeper receives it by email at their account's address, without a push or an inbox notice.

---

### User Story 4 - Administrators configure each country's provider, watch invoicing and retry failures (Priority: P2)

An administrator chooses each country's invoicing provider and its non-secret configuration (clarification 6); the credentials are set in the secret manager. They list documents by status (pending, issued, rejected), see why a document was rejected, and retry it after the data is fixed.

**Why this priority**: A rejected invoice is a legal gap that someone must close; without visibility it stays silent.

**Independent Test**: A rejected invoice appears in the administrators' list with its reason; after the goalkeeper's data is corrected, retrying issues it once.

**Acceptance Scenarios**:

1. **Given** documents in every status, **When** an administrator filters by status, **Then** they see the matching ones with goalkeeper, concept, amount, date and reason.
2. **Given** a rejected document, **When** an administrator retries it, **Then** it's issued again with the current data, and a document already issued can't be retried.
3. **Given** documents pending for more than 24 hours, **Then** administrators are warned.
4. **Given** Colombia configured with Siigo, **When** a Colombian goalkeeper is charged, **Then** the document is issued through Siigo with Colombia's credentials.
5. **Given** a country without an invoicing provider configured, **When** a goalkeeper there is charged, **Then** the document is created and stays pending ("provider not configured"), visible to administrators, and is issued once the country gets a provider.
6. **Given** a document already sent to a country's provider, **When** the country switches provider, **Then** that document, and any credit note for it, stay with the original provider.
7. **Given** a provider whose credentials for that country are missing, **Then** its documents stay pending and administrators are warned; no secret appears in any response or log.

### Edge Cases

- A charge of a goalkeeper whose profile lacks a document number or name the tax authority accepts → the document is rejected with the reason, never issued with invented data, and the charge stands.
- The goalkeeper changes their identification after a charge → the invoice keeps the identification of the moment of the charge (the ledger snapshot).
- A charge in a country without an invoicing provider → its document waits, pending, until the country is configured; nothing is lost.
- A country's provider is changed while documents are in flight → each keeps the provider it was sent to; unsent ones use the new provider.
- The provider issued the invoice but its answer was lost → the retry must recognize it by the same event and not issue a second one.
- A commission refunded in the same minute it was charged, before its invoice was issued → the invoice is still issued, then its credit note, in that order.
- Gateway fees (022) are paid to the gateway on the goalkeeper's behalf, not platform income → not invoiced by the platform.
- Administrator adjustments are corrections, not sales → not invoiced (the accountant may say otherwise).
- The goalkeeper's account has no usable email → the document is still issued and listed in the app; the failed email delivery is visible to administrators.
- The provider's credentials are missing → no document is issued; they stay pending and administrators are warned. Credentials are never stored in the database, logs or responses.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST issue electronic invoices, before the tax authority (DIAN) through an authorized technological provider, for each commission and each penalty charged, right after it's charged.
- **FR-002**: Each invoice MUST be addressed to the goalkeeper who was charged, with the document type, document number and name as of the moment of the charge.
- **FR-002a**: Charging a commission or a penalty MUST record a "commission charged" or "penalty charged" event, and refunding a commission or reversing a penalty a "commission refunded" or "penalty reversed" event, in the same all-or-nothing step as the ledger movement: neither can exist without the other.
- **FR-002b**: Documents MUST be issued by a separate process that consumes those events, independent of the request that caused the charge. The event MUST be kept and delivered again (after a crash, a deploy or a provider failure) until its document is issued or rejected for its data; no event may be lost.
- **FR-003**: Each billable event MUST produce at most one invoice, even when processed more than once or concurrently.
- **FR-004**: Invoicing MUST never block, delay or undo the charge itself; a failed issuance is retried automatically with increasing waits.
- **FR-005**: A document rejected for its data MUST be marked rejected with the reason and not retried automatically; administrators can retry it after fixing the data.
- **FR-006**: Refunds of invoiced amounts MUST be reflected as one credit note per refunded commission or reversed penalty, at most once each, linked to the original invoice.
- **FR-007**: For each issued document, System MUST keep its number, the tax authority's unique code (CUFE), the issue date, the concept, the amounts (base, taxes, total), the currency, and access to its PDF and XML.
- **FR-007a**: Each issued document MUST be delivered by the provider to the email of the goalkeeper's account (PDF and XML). No inbox notice or push is sent for it.
- **FR-008**: Goalkeepers MUST be able to list their own documents (paginated, newest first) and download the PDF and XML of issued ones; never another goalkeeper's.
- **FR-009**: Administrators MUST be able to list documents by status, see rejection reasons, and retry rejected ones.
- **FR-010**: Administrators MUST be warned of documents pending for more than 24 hours.
- **FR-011**: Each provider's credentials for each country MUST come from the secret manager, never from the database, logs or responses (as in 022).
- **FR-012**: Documents MUST be issued through the invoicing provider configured for the goalkeeper's country. Providers sit behind one replaceable connection point, so several can coexist, tests never call them, and new ones can be added. The first provider is **Siigo**, for Colombia.
- **FR-013**: Administrators MUST be able to set, per country, the invoicing provider and its non-secret configuration (for Siigo: document types, seller, products, tax and payment identifiers), and read it back without secrets. A document keeps the provider it was first sent to; credit notes go to their invoice's provider. A country without a provider keeps its documents pending until it has one.
- **FR-014**: Gateway fees and administrator adjustments are not invoiced.
- **FR-015**: Administrators MUST be able to set each country's VAT rate (0 % to 100 %); the change applies to charges made afterwards, never to existing ones.
- **FR-016**: Charging a commission or a penalty MUST also debit its VAT (the amount × the country's rate, rounded to whole currency units) as its own wallet movement, in the same all-or-nothing step and with the same guarding rules as the charge (a penalty's VAT may leave the balance negative; a commission's may not). At 0 % no VAT movement is recorded.
- **FR-017**: Every rule that compares the balance with a commission (seeing matches, being offered them, accepting them) MUST use the commission plus its VAT.
- **FR-018**: Refunding a commission or reversing a penalty MUST give back exactly the VAT that was charged with it, in the same step.

### Key Entities

- **Billable event**: a "commission charged", "commission refunded", "penalty charged" or "penalty reversed" event, recorded with the ledger movement and consumed by the invoicing process. It carries which movement, which goalkeeper, amount, currency, date, and the goalkeeper's identification at that moment. Unique per movement.
- **Invoicing document**: an invoice or a credit note for a goalkeeper. Number, CUFE, type, status (pending, issued, rejected), concept, amounts, currency, dates, the events it covers, the original invoice (for a credit note), attempts and last error.
- **VAT setting**: a country's VAT rate, set by administrators; each VAT debit keeps the rate it was charged at.
- **Invoicing configuration** (per country): the provider in use and its non-secret configuration; the issuer's legal data (tax identification, resolution and numbering range) lives in the provider's own account. Credentials are in the secret manager, per provider and country.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100 % of billable events have exactly one document; zero duplicates in any audit.
- **SC-002**: With the provider available, 95 % of documents are issued within 5 minutes of their event.
- **SC-003**: A provider outage of up to 24 hours causes no lost documents: all are issued after it recovers, without anyone's intervention.
- **SC-004**: Every refund of an invoiced amount is reflected, and per goalkeeper the invoiced bases match the platform's net income and the invoiced VAT matches the VAT debited, to the peso.
- **SC-005**: A goalkeeper finds and downloads any of their documents in under 30 seconds.
- **SC-006**: Every rejected or long-pending document is visible to administrators the same day.
- **SC-007**: Accepting a booking takes no longer with invoicing than without it, and a restart of the invoicing process in the middle of work loses no document.

## Assumptions

- The platform is the issuer and already has (or will get) its invoicing resolution and numbering range from the tax authority; they're configuration.
- The goalkeeper's identification in their profile (document type and number, from registration in 003) and name (from the user profile) are enough for the tax authority; missing data leads to a rejection, never to invented data.
- The VAT rate is configuration per country (clarification 3); withholdings, if the accountant requires them, are also configuration, not hard-coded.
- Documents are kept for as long as the law requires (at least 5 years in Colombia); nothing in this feature deletes them.
- Each new country needs its own provider integration (an adapter) before it can be configured; this feature delivers Siigo only.
- Documents are issued in the country's language and currency; Colombia's are in Spanish and COP.
- The owner opens the Siigo account and gets its API credentials before production; tests never call Siigo.
