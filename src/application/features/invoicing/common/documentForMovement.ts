import type { IClock } from '../../../common/clock.js';
import { InvoicingDocument, type InvoicingConcept, type InvoicingDocumentKind } from '../../../../domain/invoicing/invoicingDocument.js';
import type { WalletMovement } from '../../../../domain/wallet/walletMovement.js';
import type { IIdGenerator, IUserRepository } from '../../auth/common/ports.js';
import { resolveGoalkeeperWalletContext, type GoalkeeperWalletContextDependencies } from '../../wallet/common/goalkeeperWalletContext.js';
import type { IWalletMovementRepository } from '../../wallet/common/ports.js';
import type { IInvoicingDocumentRepository } from './ports.js';

export interface DocumentForMovementDependencies {
  documents: IInvoicingDocumentRepository;
  movements: IWalletMovementRepository;
  users: IUserRepository;
  walletContext: GoalkeeperWalletContextDependencies;
  idGenerator: IIdGenerator;
  clock: IClock;
}

const KINDS: Record<string, { kind: InvoicingDocumentKind; concept: InvoicingConcept; vatPrefix: string; prefix: string }> = {
  commission_charge: { kind: 'invoice', concept: 'commission', prefix: 'commission:', vatPrefix: 'commission_vat:' },
  commission_refund: { kind: 'credit_note', concept: 'commission', prefix: 'commission_refund:', vatPrefix: 'commission_vat_refund:' },
  penalty: { kind: 'invoice', concept: 'penalty', prefix: 'penalty:', vatPrefix: 'penalty_vat:' },
  penalty_reversal: { kind: 'credit_note', concept: 'penalty', prefix: 'penalty_reversal:', vatPrefix: 'penalty_vat_reversal:' },
};

/** The charge a refund or reversal gives back. */
async function originalMovementOf(deps: DocumentForMovementDependencies, movement: WalletMovement): Promise<WalletMovement | null> {
  if (movement.type === 'commission_refund') return deps.movements.findByCauseKey(`commission:${movement.references.bookingId}`);
  if (movement.type === 'penalty_reversal' && movement.references.penaltyMovementId) return deps.movements.findById(movement.references.penaltyMovementId);
  return null;
}

/**
 * The invoicing document of one billable ledger movement, created if it doesn't exist yet
 * (research.md §2, §5). Everything comes from the ledger — the amounts, the VAT movement recorded
 * with it (found by its cause key), the buyer's document as it was at the charge — plus the
 * goalkeeper's current name, email and city. A credit note's invoice is created first when
 * missing. Idempotent: the source movement is unique. `null` when the movement isn't billable.
 */
export async function documentForMovement(
  deps: DocumentForMovementDependencies,
  movementId: string,
  sourceEventId: string | null,
): Promise<{ created: boolean; document: InvoicingDocument } | null> {
  const known = await deps.documents.findBySourceMovementId(movementId);
  if (known) return { created: false, document: known };

  const movement = await deps.movements.findById(movementId);
  if (!movement) throw new Error(`Billable movement ${movementId} does not exist`);
  const shape = KINDS[movement.type];
  if (!shape) return null;

  let originalDocumentId: string | null = null;
  if (shape.kind === 'credit_note') {
    const original = await originalMovementOf(deps, movement);
    if (!original) throw new Error(`Movement ${movement.id} gives back a charge that does not exist`);
    const originalDocument = await documentForMovement(deps, original.id, null);
    if (!originalDocument) throw new Error(`Movement ${original.id} is not billable`);
    originalDocumentId = originalDocument.document.id;
  }

  const vatMovement = await deps.movements.findByCauseKey(`${shape.vatPrefix}${movement.causeKey.slice(shape.prefix.length)}`);
  const context = await resolveGoalkeeperWalletContext(deps.walletContext, movement.walletId);
  if (context.kind !== 'ok') throw new Error(`Goalkeeper ${movement.walletId} of movement ${movement.id} has no wallet context (${context.kind})`);
  const user = await deps.users.getById(movement.walletId);
  const now = deps.clock.now();

  return deps.documents.createIfAbsent(
    InvoicingDocument.create({
      id: deps.idGenerator.newId(),
      kind: shape.kind,
      concept: shape.concept,
      goalkeeperId: movement.walletId,
      countryId: context.countryId,
      sourceEventId,
      sourceMovementId: movement.id,
      vatMovementId: vatMovement?.id ?? null,
      bookingId: movement.references.bookingId ?? null,
      requestId: movement.references.requestId ?? null,
      originalDocumentId,
      base: Math.abs(movement.amount),
      vat: vatMovement ? Math.abs(vatMovement.amount) : 0,
      vatRateBps: vatMovement?.taxRateBps ?? 0,
      currency: movement.currency,
      buyer: {
        documentType: movement.invoicing.documentType,
        documentNumber: movement.invoicing.documentNumber,
        firstName: user?.firstName ?? '',
        lastName: user?.lastName ?? '',
        email: user?.email ?? '',
        cityId: context.profile.cityId,
      },
      occurredAt: movement.occurredAt,
      createdAt: now,
    }),
  );
}
