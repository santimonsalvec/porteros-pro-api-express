import type { PushMessage } from '../devices/deviceRules.js';
import { formatAmount } from './outcomeMessages.js';

/** Inbox and push types of a wallet top-up's outcome (feature 022). Both open the wallet. */
export const TOP_UP_APPROVED_TYPE = 'wallet.top_up_approved';
export const TOP_UP_FAILED_TYPE = 'wallet.top_up_failed';

/** "Recarga aprobada: +17.000 COP. Tu saldo es 37.000 COP." */
export function topUpApprovedMessage(net: number, balance: number, currency: string, topUpId: string): PushMessage {
  return {
    title: 'Recarga aprobada',
    body: `Recarga aprobada: +${formatAmount(net, currency)}. Tu saldo es ${formatAmount(balance, currency)}.`,
    data: { type: TOP_UP_APPROVED_TYPE, topUpId },
  };
}

/** Declined, voided, failed or expired: the money never arrived. */
export function topUpFailedMessage(amount: number, currency: string, topUpId: string): PushMessage {
  return {
    title: 'Recarga no completada',
    body: `Tu recarga de ${formatAmount(amount, currency)} no se completó. Puedes intentar con otro medio de pago.`,
    data: { type: TOP_UP_FAILED_TYPE, topUpId },
  };
}

/** Inbox and push type of a manual balance adjustment by an administrator. It opens the wallet. */
export const WALLET_ADJUSTED_TYPE = 'wallet.adjusted';

/** "Tu saldo cambió: +15.000 COP (Saldo de prueba). Tu saldo es 15.000 COP." */
export function walletAdjustedMessage(amount: number, reason: string, balance: number, currency: string): PushMessage {
  const sign = amount > 0 ? '+' : '−';
  return {
    title: 'Tu saldo cambió',
    body: `${sign}${formatAmount(Math.abs(amount), currency)} (${reason}). Tu saldo es ${formatAmount(balance, currency)}.`,
    data: { type: WALLET_ADJUSTED_TYPE },
  };
}
