# Quickstart: Electronic Invoicing (per country, Colombia first)

**Feature**: `023-electronic-invoicing` | **Contract**: [contracts/invoicing.md](./contracts/invoicing.md)

## 0. Setup

1. **Siigo account for Colombia** (owner):
   - the DIAN invoicing resolution and numbering range loaded in Siigo Nube;
   - a **product** for the commission and one for penalties;
   - the **VAT 19 %** tax;
   - the invoice and credit-note **document types**;
   - a **seller**;
   - a **payment method** ("Otros" / prepaid balance).

   Note their ids and codes.
2. **Secrets for Colombia** (Secret Manager, through `apphosting.yaml`): `SIIGO_CO_USERNAME` and `SIIGO_CO_ACCESS_KEY` (Siigo Nube → Alianzas → Mi Credencial API).
3. **Environment**: `INVOICING_ENABLED=true` (and `SIIGO_BASE_URL` only to override `https://api.siigo.com`).
4. **Colombia's provider** (administrator):

   ```bash
   curl -s -X PUT "$API/admin/invoicing/settings/$CO" -H "Authorization: Bearer $TA" -H "$H" -d '{
     "provider": "siigo",
     "config": { "partnerId": "PorterosPRO", "invoiceDocumentId": 24446, "creditNoteDocumentId": 24447,
                 "sellerId": 629, "commissionProductCode": "COMISION", "penaltyProductCode": "PENALIDAD",
                 "vatTaxId": 13156, "paymentMethodId": 5636 } }'
   ```
5. **Data** (database owner): `daneStateCode` and `daneCityCode` on every Colombian city with goalkeepers.
6. **VAT**: `PUT /api/admin/tax-settings/{countryCoId} {"vatRateBps":1900}`.

## 1. Commission invoice

A goalkeeper with 10.000 COP accepts a booking with a 7.000 commission.

**Expected**:
- the wallet shows `commission_charge −7.000` and `commission_vat −1.330` (balance 1.670);
- within a minute, `GET /api/goalkeepers/me/invoices` lists an `issued` invoice with base 7.000, VAT 1.330, total 8.330, a number and a CUFE;
- the goalkeeper receives it by email;
- the PDF downloads.

## 2. Funds with VAT

A goalkeeper with 7.500 COP (enough for the commission, not with VAT).

**Expected**: no offers, no available matches, and accepting answers `insufficient_funds` with `missingAmount: 830`.

## 3. Credit note

The client cancels that booking.

**Expected**: `commission_refund +7.000` and `commission_vat_refund +1.330`; a credit note for 8.330 referencing the invoice.

## 4. Outage

Set a wrong `SIIGO_CO_ACCESS_KEY`, accept a booking, fix it.

**Expected**: the invoice stays `pending`, then is issued by the sweep after the fix, once.

## 5. Manual checks (add to `_temp_pruebas.md` §17, deferred to the end of the roadmap)

- §1–§4 against Siigo's sandbox, then once in production.
- Siigo accepts a buyer without a street address (the city name as address), and the XML endpoint exists.
- A goalkeeper of a country without a provider: the document stays pending (`provider_not_configured`) and is issued after the country is configured.
- A rejected invoice (for example a city without DANE codes) appears in `GET /api/admin/invoicing/documents?status=rejected`, and after seeding the codes and retrying it's issued.
