import type { PushMessage } from '../devices/deviceRules.js';
import { formatAmount } from './outcomeMessages.js';

/** Inbox and push types of a operating balance deposit's outcome (feature 022). Both open the operating balance. */
export const DEPOSIT_APPROVED_TYPE = 'operating_balance.deposit_approved';
export const DEPOSIT_FAILED_TYPE = 'operating_balance.deposit_failed';

/** "Depósito aprobado: +17.000 COP. Tu saldo operativo es 37.000 COP." */
export function depositApprovedMessage(net: number, balance: number, currency: string, depositId: string): PushMessage {
  return {
    title: 'Depósito aprobado',
    body: `Depósito aprobado: +${formatAmount(net, currency)}. Tu saldo operativo es ${formatAmount(balance, currency)}.`,
    data: { type: DEPOSIT_APPROVED_TYPE, depositId },
  };
}

/** Declined, voided, failed or expired: the money never arrived. */
export function depositFailedMessage(amount: number, currency: string, depositId: string): PushMessage {
  return {
    title: 'Depósito no completado',
    body: `Tu depósito de ${formatAmount(amount, currency)} no se completó. Puedes intentar con otro medio de pago.`,
    data: { type: DEPOSIT_FAILED_TYPE, depositId },
  };
}

/** Inbox and push type of a manual balance adjustment by an administrator. It opens the operating balance. */
export const OPERATING_BALANCE_ADJUSTED_TYPE = 'operating_balance.adjusted';

/** "Tu saldo operativo cambió: +15.000 COP (Saldo de prueba). Tu saldo operativo es 15.000 COP." */
export function operatingBalanceAdjustedMessage(amount: number, reason: string, balance: number, currency: string): PushMessage {
  const sign = amount > 0 ? '+' : '−';
  return {
    title: 'Tu saldo operativo cambió',
    body: `${sign}${formatAmount(Math.abs(amount), currency)} (${reason}). Tu saldo operativo es ${formatAmount(balance, currency)}.`,
    data: { type: OPERATING_BALANCE_ADJUSTED_TYPE },
  };
}
