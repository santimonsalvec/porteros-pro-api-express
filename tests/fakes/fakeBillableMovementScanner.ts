import type { BillableMovementRef, IBillableMovementScanner } from '../../src/application/features/invoicing/common/ports.js';
import { BILLABLE_MOVEMENT_TYPES, type BillableMovementType } from '../../src/domain/wallet/walletMovement.js';
import type { FakeInvoicingDocumentRepository } from './fakeInvoicingDocumentRepository.js';
import type { FakeWalletStore } from './fakeWalletStore.js';

const WINDOW_MS = 7 * 24 * 60 * 60_000;

/** The safety net's scan over the in-memory ledger and documents. */
export class FakeBillableMovementScanner implements IBillableMovementScanner {
  constructor(
    private readonly wallet: FakeWalletStore,
    private readonly documents: FakeInvoicingDocumentRepository,
  ) {}

  async findWithoutDocument(olderThan: Date, cap: number): Promise<BillableMovementRef[]> {
    const documented = new Set(this.documents.all().map((document) => document.sourceMovementId));
    return this.wallet
      .movements()
      .filter((movement) => (BILLABLE_MOVEMENT_TYPES as readonly string[]).includes(movement.type))
      .filter((movement) => movement.occurredAt <= olderThan && movement.occurredAt.getTime() >= olderThan.getTime() - WINDOW_MS)
      .filter((movement) => !documented.has(movement.id))
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
      .slice(0, cap)
      .map((movement) => ({ movementId: movement.id, type: movement.type as BillableMovementType }));
  }
}
