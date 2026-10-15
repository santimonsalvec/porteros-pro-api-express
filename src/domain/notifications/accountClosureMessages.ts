import type { PushMessage } from '../devices/deviceRules.js';
import { formatAmount } from './outcomeMessages.js';

/** Inbox and push types of the account closure (feature 029). They all open the closing screen. */
export const ACCOUNT_CLOSURE_REQUESTED_TYPE = 'account_closure.requested';
export const ACCOUNT_CLOSURE_DEBT_DEPOSIT_TYPE = 'account_closure.debt_deposit_required';
export const ACCOUNT_CLOSURE_REFUND_TYPE = 'account_closure.refund_recorded';
export const ACCOUNT_CLOSURE_CLOSED_TYPE = 'account_closure.closed';
export const ACCOUNT_CLOSURE_REJECTED_TYPE = 'account_closure.rejected';

export function closureRequestedMessage(closureId: string): PushMessage {
  return {
    title: 'Recibimos tu solicitud de cierre',
    body: 'Tu cuenta queda inactiva mientras la revisamos.',
    data: { type: ACCOUNT_CLOSURE_REQUESTED_TYPE, closureId },
  };
}

/** `debt` is positive: what the saldo operativo owes. */
export function closureDebtDepositMessage(debt: number, currency: string, closureId: string): PushMessage {
  return {
    title: 'Cubre tu deuda para cerrar la cuenta',
    body: `Deposita ${formatAmount(debt, currency)} para cubrir tu saldo operativo negativo.`,
    data: { type: ACCOUNT_CLOSURE_DEBT_DEPOSIT_TYPE, closureId },
  };
}

export function closureRefundMessage(amount: number, currency: string | null, closureId: string): PushMessage {
  return {
    title: 'Registramos tu devolución',
    body: amount > 0 && currency ? `Te devolvimos ${formatAmount(amount, currency)} de tu saldo operativo.` : 'No había saldo para devolver.',
    data: { type: ACCOUNT_CLOSURE_REFUND_TYPE, closureId },
  };
}

export function closureClosedMessage(closureId: string): PushMessage {
  return {
    title: 'Tu cuenta está cerrada',
    body: 'Si vuelves a ingresar, la reactivamos.',
    data: { type: ACCOUNT_CLOSURE_CLOSED_TYPE, closureId },
  };
}

export function closureRejectedMessage(reason: string, closureId: string): PushMessage {
  return {
    title: 'Tu cuenta sigue activa',
    body: reason,
    data: { type: ACCOUNT_CLOSURE_REJECTED_TYPE, closureId },
  };
}
