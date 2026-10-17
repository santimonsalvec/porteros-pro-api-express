import type { PushMessage } from '../devices/deviceRules.js';
import type { Language } from '../i18n/language.js';
import { catalog } from '../i18n/messages/catalog.js';
import { formatAmount } from './outcomeMessages.js';

/** Inbox and push types of the account closure (feature 029). They all open the closing screen. */
export const ACCOUNT_CLOSURE_REQUESTED_TYPE = 'account_closure.requested';
export const ACCOUNT_CLOSURE_DEBT_DEPOSIT_TYPE = 'account_closure.debt_deposit_required';
export const ACCOUNT_CLOSURE_REFUND_TYPE = 'account_closure.refund_recorded';
export const ACCOUNT_CLOSURE_CLOSED_TYPE = 'account_closure.closed';
export const ACCOUNT_CLOSURE_REJECTED_TYPE = 'account_closure.rejected';

export function closureRequestedMessage(language: Language, closureId: string): PushMessage {
  return { ...catalog(language).closureRequested(), data: { type: ACCOUNT_CLOSURE_REQUESTED_TYPE, closureId } };
}

/** `debt` is positive: what the saldo operativo owes. */
export function closureDebtDepositMessage(language: Language, debt: number, currency: string, closureId: string): PushMessage {
  return { ...catalog(language).closureDebtDeposit(formatAmount(debt, currency)), data: { type: ACCOUNT_CLOSURE_DEBT_DEPOSIT_TYPE, closureId } };
}

export function closureRefundMessage(language: Language, amount: number, currency: string | null, closureId: string): PushMessage {
  return {
    ...catalog(language).closureRefund(amount > 0 && currency ? formatAmount(amount, currency) : null),
    data: { type: ACCOUNT_CLOSURE_REFUND_TYPE, closureId },
  };
}

export function closureClosedMessage(language: Language, closureId: string): PushMessage {
  return { ...catalog(language).closureClosed(), data: { type: ACCOUNT_CLOSURE_CLOSED_TYPE, closureId } };
}

export function closureRejectedMessage(language: Language, reason: string, closureId: string): PushMessage {
  return { ...catalog(language).closureRejected(reason), data: { type: ACCOUNT_CLOSURE_REJECTED_TYPE, closureId } };
}
