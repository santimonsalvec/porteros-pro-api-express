import type { TopUp } from '../../../../domain/payments/topUp.js';

/** A top-up as its goalkeeper sees it: amounts and status only, never gateway data or secrets. */
export interface TopUpResponse {
  topUpId: string;
  reference: string;
  status: TopUp['status'];
  amount: number;
  cost: number;
  net: number;
  currency: string;
  createdAt: string;
  finalizedAt: string | null;
}

export function toTopUpResponse(topUp: TopUp): TopUpResponse {
  return {
    topUpId: topUp.id,
    reference: topUp.reference,
    status: topUp.status,
    amount: topUp.amount,
    cost: topUp.cost,
    net: topUp.net,
    currency: topUp.currency,
    createdAt: topUp.createdAt.toISOString(),
    finalizedAt: topUp.finalizedAt ? topUp.finalizedAt.toISOString() : null,
  };
}
