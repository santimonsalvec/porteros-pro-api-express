import { CreateInvoicingDocumentHandler } from '../../../../../src/application/features/invoicing/handlers/createInvoicingDocument.js';
import { InvoicingIssuerJob } from '../../../../../src/application/features/invoicing/jobs/invoicingIssuerJob.js';
import {
  commissionChargeDraft,
  commissionRefundDraft,
  commissionVatDraft,
  commissionVatRefundDraft,
} from '../../../../../src/application/features/operatingBalance/common/operatingBalanceLedger.js';
import { commissionCharged, commissionRefunded, type BillingEvent } from '../../../../../src/domain/events/billingEvents.js';
import { User } from '../../../../../src/domain/users/user.js';
import type { BalanceMovement } from '../../../../../src/domain/operatingBalance/balanceMovement.js';
import { FakeBillableMovementScanner } from '../../../../fakes/fakeBillableMovementScanner.js';
import { FakeCityRepository } from '../../../../fakes/fakeCityRepository.js';
import { City } from '../../../../../src/domain/locations/city.js';
import { FakeInvoicingDocumentRepository } from '../../../../fakes/fakeInvoicingDocumentRepository.js';
import { FakeInvoicingProvider, FakeInvoicingProviderRegistry } from '../../../../fakes/fakeInvoicingProvider.js';
import { FakeInvoicingSecrets } from '../../../../fakes/fakeInvoicingSecrets.js';
import { FakeInvoicingSettingsRepository } from '../../../../fakes/fakeInvoicingSettingsRepository.js';
import { FakeUserRepository } from '../../../../fakes/fakeUserRepository.js';
import { buildGoalkeeperProfile } from '../../../../fixtures/operatingBalanceFixtures.js';
import { recordingLogger } from '../payments/paymentsHarness.js';
import { OperatingBalanceHarness } from '../operatingBalance/operatingBalanceHarness.js';

/**
 * The Cali operating balance world plus invoicing: Colombia configured with a fake Siigo and its credentials.
 * Charges are appended straight to the ledger, and their events handed to the consumer, as the
 * outbox would.
 */
export class InvoicingHarness {
  readonly operatingBalance = new OperatingBalanceHarness();
  readonly documents = new FakeInvoicingDocumentRepository();
  readonly settings = new FakeInvoicingSettingsRepository();
  readonly provider = new FakeInvoicingProvider();
  readonly providers = new FakeInvoicingProviderRegistry([this.provider]);
  readonly secrets = new FakeInvoicingSecrets();
  readonly users = new FakeUserRepository();
  readonly logger = recordingLogger();
  private counter = 0;
  readonly idGenerator = { newId: () => `0192f000-0000-7000-8000-${String(++this.counter).padStart(12, '0')}` };
  enabled = true;

  constructor() {
    this.settings.seed();
    this.municipalities.seed(new City({ id: 'mun-cali', name: 'Cali', regionId: 'valle', daneStateCode: '76', daneCityCode: '001' }));
  }

  get clock() {
    return this.operatingBalance.clock;
  }

  /** The municipalities of the buyers' billing data (spec 031). */
  readonly municipalities = new FakeCityRepository();

  get deps() {
    return {
      documents: this.documents,
      settings: this.settings,
      providers: this.providers,
      secrets: this.secrets,
      countryLookup: this.operatingBalance.countries,
      cityRepository: this.municipalities,
      logger: this.logger,
      enabled: this.enabled,
      movements: this.operatingBalance.store,
      users: this.users,
      operatingBalanceContext: this.operatingBalance.context,
      idGenerator: this.idGenerator,
      clock: this.clock,
    };
  }

  handler(): CreateInvoicingDocumentHandler {
    return new CreateInvoicingDocumentHandler(this.deps);
  }

  job(): InvoicingIssuerJob {
    return new InvoicingIssuerJob({ ...this.deps, scanner: new FakeBillableMovementScanner(this.operatingBalance.store, this.documents), cap: 100 });
  }

  /** An active goalkeeper of Cali with 50 000 of balance and a complete user profile. */
  async goalkeeper(id = 'gk-1'): Promise<string> {
    this.operatingBalance.profiles.seed(buildGoalkeeperProfile(id));
    const user = User.createFromExternalIdentity({ id, email: `${id}@example.com`, displayName: null, provider: 'google', subject: `sub-${id}`, isAdmin: false });
    user.completeProfile('Ana', 'Portera', '+57', '3000000000');
    this.users.seed(user);
    await this.operatingBalance.credit(id, 50000);
    return id;
  }

  /** Charges a booking's commission (and VAT) as the acceptance does, and returns its billing event. */
  async charge(bookingId = 'b-1', rateBps = 1900, goalkeeperId = 'gk-1'): Promise<{ event: BillingEvent; movements: BalanceMovement[] }> {
    const owner = this.operatingBalance.owner(goalkeeperId);
    const refs = { bookingId, requestId: `r-${bookingId}` };
    const now = this.clock.now();
    const drafts = [
      commissionChargeDraft(owner, { ...refs, amount: 7000 }, this.idGenerator.newId(), now),
      commissionVatDraft(owner, { ...refs, base: 7000, rateBps }, this.idGenerator.newId(), now),
    ].filter((draft) => draft !== null);
    const movements: BalanceMovement[] = [];
    for (const draft of drafts) {
      const result = await this.operatingBalance.store.append(draft);
      if (result.kind !== 'recorded') throw new Error(result.kind);
      movements.push(result.movement);
    }
    const [commission, vat] = movements;
    const event = commissionCharged(this.idGenerator.newId(), refs, now, {
      goalkeeperId,
      movementId: commission!.id,
      vatMovementId: vat?.id ?? null,
      base: 7000,
      vat: vat ? -vat.amount : 0,
      vatRateBps: vat ? rateBps : 0,
      currency: 'COP',
    });
    return { event, movements };
  }

  /** Gives back a booking's commission and VAT as the lifecycle store does, and returns its billing event. */
  async refund(bookingId = 'b-1', goalkeeperId = 'gk-1'): Promise<BillingEvent> {
    const owner = this.operatingBalance.owner(goalkeeperId);
    const now = this.clock.now();
    const refs = { bookingId, requestId: `r-${bookingId}` };
    const charge = (await this.operatingBalance.store.findByCauseKey(`commission:${bookingId}`))!;
    const vatCharge = await this.operatingBalance.store.findByCauseKey(`commission_vat:${bookingId}`);
    const refund = await this.operatingBalance.store.append(
      commissionRefundDraft(owner, { ...refs, amount: 7000, cancellation: { by: 'client', at: now, reason: 'Cancelado' } }, this.idGenerator.newId(), now),
    );
    if (refund.kind !== 'recorded') throw new Error(refund.kind);
    let vatMovementId: string | null = null;
    if (vatCharge) {
      const vatRefund = await this.operatingBalance.store.append(
        commissionVatRefundDraft(owner, { ...refs, amount: -vatCharge.amount, rateBps: vatCharge.taxRateBps! }, this.idGenerator.newId(), now),
      );
      if (vatRefund.kind !== 'recorded') throw new Error(vatRefund.kind);
      vatMovementId = vatRefund.movement.id;
    }
    return commissionRefunded(this.idGenerator.newId(), refs, now, {
      goalkeeperId,
      movementId: refund.movement.id,
      vatMovementId,
      base: 7000,
      vat: vatCharge ? -vatCharge.amount : 0,
      vatRateBps: vatCharge?.taxRateBps ?? 0,
      currency: 'COP',
      originalMovementId: charge.id,
    });
  }
}
