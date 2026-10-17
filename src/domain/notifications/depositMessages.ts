import type { PushMessage } from '../devices/deviceRules.js';
import type { Language } from '../i18n/language.js';
import { catalog } from '../i18n/messages/catalog.js';
import { formatAmount } from './outcomeMessages.js';

/** Inbox and push types of a operating balance deposit's outcome (feature 022). Both open the operating balance. */
export const DEPOSIT_APPROVED_TYPE = 'operating_balance.deposit_approved';
export const DEPOSIT_FAILED_TYPE = 'operating_balance.deposit_failed';

/** "Depósito aprobado: +17.000 COP. Tu saldo operativo es 37.000 COP." */
export function depositApprovedMessage(language: Language, net: number, balance: number, currency: string, depositId: string): PushMessage {
  return { ...catalog(language).depositApproved(formatAmount(net, currency), formatAmount(balance, currency)), data: { type: DEPOSIT_APPROVED_TYPE, depositId } };
}

/** Declined, voided, failed or expired: the money never arrived. */
export function depositFailedMessage(language: Language, amount: number, currency: string, depositId: string): PushMessage {
  return { ...catalog(language).depositFailed(formatAmount(amount, currency)), data: { type: DEPOSIT_FAILED_TYPE, depositId } };
}

/** Inbox and push type of a manual balance adjustment by an administrator. It opens the operating balance. */
export const OPERATING_BALANCE_ADJUSTED_TYPE = 'operating_balance.adjusted';

/** "Tu saldo operativo cambió: +15.000 COP (Saldo de prueba). Tu saldo operativo es 15.000 COP." */
export function operatingBalanceAdjustedMessage(language: Language, amount: number, reason: string, balance: number, currency: string): PushMessage {
  const sign = amount > 0 ? '+' : '−';
  return {
    ...catalog(language).operatingBalanceAdjusted(`${sign}${formatAmount(Math.abs(amount), currency)}`, reason, formatAmount(balance, currency)),
    data: { type: OPERATING_BALANCE_ADJUSTED_TYPE },
  };
}
