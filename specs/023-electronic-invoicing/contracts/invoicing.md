# Contract: Electronic Invoicing

**Feature**: `023-electronic-invoicing` | **Research**: [../research.md](../research.md)

## 1. The goalkeeper's documents

`GET /api/goalkeepers/me/invoices?page&pageSize` (goalkeeper token) returns `{ items, page, pageSize, totalItems, totalPages }`, newest first. Each item:

```json
{ "documentId": "…", "kind": "invoice", "concept": "commission", "status": "issued",
  "number": "FV-2-22", "cufe": "…", "base": 7000, "vat": 1330, "total": 8330, "currency": "COP",
  "vatRatePercent": 19, "bookingId": "…", "originalDocumentId": null,
  "occurredAt": "…", "issuedAt": "…", "downloadable": true }
```

- `GET /api/goalkeepers/me/invoices/{documentId}` → one item. Another goalkeeper's or an unknown one → `404 invoicing_document_not_found`.
- `GET /api/goalkeepers/me/invoices/{documentId}/pdf` and `…/xml`:
  - `200` with the file (`application/pdf` or `application/xml`, `Content-Disposition: attachment`);
  - `409 document_not_issued` while pending, awaiting or rejected;
  - `404 file_not_available` when the provider has no XML;
  - `503 provider_unavailable`.
- A signed-in user who isn't a goalkeeper → `404 goalkeeper_not_found`.

## 2. Administrators: documents

`GET /api/admin/invoicing/documents?status=pending|awaiting_authority|issued|rejected&page&pageSize` → the page of documents, oldest first. Each item is the goalkeeper's item plus:
- `goalkeeperId`, `countryId`, `provider`;
- `buyer` (document type and number, name, email);
- `attempts`;
- `lastError { kind, code, message, at }`;
- `stale` (pending or awaiting for more than 24 h).

`POST /api/admin/invoicing/documents/{documentId}/retry`:
- `202` with the item: the document is back to `pending`, its buyer data is refreshed and the retry is immediate;
- `409 document_not_retryable` unless it's `rejected`;
- `404 invoicing_document_not_found`.

## 3. Administrators: the invoicing provider per country

`GET /api/admin/invoicing/settings/{countryId}` → `200 { countryId, provider, config, updatedAt, updatedBy }` (never secrets), or `404 settings_not_found`.

`PUT /api/admin/invoicing/settings/{countryId}` with `{ "provider": "siigo", "config": { … } }`:
- `200` with the settings, plus `credentialsPresent: true|false` (whether the country's secrets exist; never their values);
- `400 validation_failed` (an unsupported provider, or a missing or invalid config field);
- `404 country_not_found`.

Documents already sent keep their provider; unsent ones use the new setting.

## 3b. Administrators: VAT per country

- `GET /api/admin/tax-settings/{countryId}` → `200 { countryId, vatRateBps, vatRatePercent, updatedAt, updatedBy }`, or `404 settings_not_found` (meaning 0 %).
- `PUT /api/admin/tax-settings/{countryId}` with `{ "vatRateBps": 1900 }`:
  - `200`;
  - `400 validation_failed` (an integer 0–10 000);
  - `404 country_not_found`.

  It applies to charges made afterwards.

Non-administrators get `403`.

## 4. Changed responses (FR-017)

- **`GET /api/goalkeepers/me/wallet`**: `offers` gains `lowestCharge` (the lowest commission plus its VAT) and `vatRateBps`. `missingAmount` becomes `max(0, lowestCharge − balance)`.
- **Available bookings**: each item gains `vat` and `totalCharge` next to `commission`, at the goalkeeper's current rate. The agenda is unchanged: what was charged is in the wallet movements.
- **`POST …/bookings/{bookingId}/accept`**: `insufficient_funds.missingAmount` is computed on the commission plus VAT.
- **Wallet movements**: the new types `commission_vat`, `commission_vat_refund`, `penalty_vat` and `penalty_vat_reversal`, with `taxRateBps`.

## 5. Events (internal)

`commission.charged`, `commission.refunded`, `penalty.charged` and `penalty.reversed` go through 013's `/internal/events`. Payload in data-model.md.
