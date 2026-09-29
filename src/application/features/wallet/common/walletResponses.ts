import type { WalletMovement } from '../../../../domain/wallet/walletMovement.js';
import type { OffersStatus } from '../../../../domain/wallet/fundsPolicy.js';

/** `GET …/wallet` (contracts/goalkeeper-wallet.md). */
export interface WalletViewResponse {
  balance: number;
  currency: string;
  offers: OffersStatus;
  movementCount: number;
}

/** A movement as the goalkeeper sees it: no invoicing data, no administrator identity. */
export interface MovementItemResponse {
  movementId: string;
  sequence: number;
  type: string;
  amount: number;
  currency: string;
  balanceAfter: number;
  occurredAt: string;
  references: WalletMovement['references'];
  cancellation: { by: string; at: string; reason: string } | null;
  reason: string | null;
  /** Only on VAT movements (feature 023): the rate charged, in basis points. */
  taxRateBps?: number;
}

/** A movement as an administrator sees it (contracts/admin-wallet.md). */
export interface AdminMovementItemResponse extends MovementItemResponse {
  actor: WalletMovement['actor'];
  causeKey: string;
  invoicing: WalletMovement['invoicing'];
}

export function toMovementItem(movement: WalletMovement): MovementItemResponse {
  return {
    movementId: movement.id,
    sequence: movement.sequence,
    type: movement.type,
    amount: movement.amount,
    currency: movement.currency,
    balanceAfter: movement.balanceAfter,
    occurredAt: movement.occurredAt.toISOString(),
    references: movement.references,
    cancellation: movement.cancellation
      ? { by: movement.cancellation.by, at: movement.cancellation.at.toISOString(), reason: movement.cancellation.reason }
      : null,
    reason: movement.reason,
    ...(movement.taxRateBps !== null ? { taxRateBps: movement.taxRateBps } : {}),
  };
}

export function toAdminMovementItem(movement: WalletMovement): AdminMovementItemResponse {
  return { ...toMovementItem(movement), actor: movement.actor, causeKey: movement.causeKey, invoicing: movement.invoicing };
}
