import type { Deposit } from '../../../../domain/deposits/deposit.js';

/** A deposit as its goalkeeper sees it: amounts and status only, never gateway data or secrets. */
export interface DepositResponse {
  depositId: string;
  reference: string;
  status: Deposit['status'];
  amount: number;
  cost: number;
  net: number;
  currency: string;
  createdAt: string;
  finalizedAt: string | null;
}

export function toDepositResponse(deposit: Deposit): DepositResponse {
  return {
    depositId: deposit.id,
    reference: deposit.reference,
    status: deposit.status,
    amount: deposit.amount,
    cost: deposit.cost,
    net: deposit.net,
    currency: deposit.currency,
    createdAt: deposit.createdAt.toISOString(),
    finalizedAt: deposit.finalizedAt ? deposit.finalizedAt.toISOString() : null,
  };
}
