/**
 * Where a goalkeeper lives, for their electronic invoices (spec 031, FR-023): a municipality of
 * the billing catalog (with official codes) and an address. It says nothing about where they play.
 */
export interface BillingData {
  cityId: string | null;
  address: string | null;
  addressComplement: string | null;
}

export const EMPTY_BILLING: BillingData = Object.freeze({ cityId: null, address: null, addressComplement: null });

export const BILLING_ADDRESS_MIN = 5;
export const BILLING_ADDRESS_MAX = 120;
export const BILLING_COMPLEMENT_MAX = 80;

/** An invoice needs the municipality and the address; the complement is optional. */
export function isBillingComplete(billing: BillingData): boolean {
  return billing.cityId !== null && billing.address !== null;
}

/** The fields sent that break a rule, by name; the municipality's existence is the command's check. */
export function billingFieldErrors(fields: Partial<BillingData>): Record<string, string> {
  const errors: Record<string, string> = {};
  if (fields.cityId !== undefined && fields.cityId !== null && fields.cityId.trim() === '') errors.cityId = 'required';
  if (fields.address !== undefined && fields.address !== null) {
    const length = fields.address.trim().length;
    if (length < BILLING_ADDRESS_MIN || length > BILLING_ADDRESS_MAX) errors.address = 'invalid_length';
  }
  if (fields.addressComplement !== undefined && fields.addressComplement !== null && fields.addressComplement.trim().length > BILLING_COMPLEMENT_MAX) {
    errors.addressComplement = 'invalid_length';
  }
  return errors;
}

/** The fields as stored: trimmed, and an empty complement as none. */
export function normalizedBilling(fields: Partial<BillingData>): Partial<BillingData> {
  const out: Partial<BillingData> = {};
  if (fields.cityId !== undefined) out.cityId = fields.cityId;
  if (fields.address !== undefined) out.address = fields.address === null ? null : fields.address.trim();
  if (fields.addressComplement !== undefined) {
    const complement = fields.addressComplement?.trim() ?? '';
    out.addressComplement = complement === '' ? null : complement;
  }
  return out;
}
