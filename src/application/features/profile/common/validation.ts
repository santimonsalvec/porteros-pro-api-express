export const MIN_WHATSAPP_DIGITS = 6;
export const MAX_WHATSAPP_DIGITS = 14;

/** Shared field-level validation used by both profile completion and profile update. */
export function validateNameAndWhatsApp(params: {
  firstName: string;
  lastName: string;
  whatsAppNumber: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!params.firstName.trim()) errors.firstName = 'First name is required.';
  if (!params.lastName.trim()) errors.lastName = 'Last name is required.';

  const digitCount = params.whatsAppNumber.replace(/\D/g, '').length;
  if (digitCount < MIN_WHATSAPP_DIGITS || digitCount > MAX_WHATSAPP_DIGITS) {
    errors.whatsAppNumber = `WhatsApp number must be ${MIN_WHATSAPP_DIGITS} to ${MAX_WHATSAPP_DIGITS} digits.`;
  }

  return errors;
}
