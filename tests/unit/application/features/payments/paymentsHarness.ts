import { PushNotifier } from '../../../../../src/application/features/devices/common/pushNotifier.js';
import { ApplyGatewayEventCommand } from '../../../../../src/application/features/payments/commands/applyGatewayEvent/applyGatewayEventCommand.js';
import { ApplyGatewayEventCommandHandler } from '../../../../../src/application/features/payments/commands/applyGatewayEvent/applyGatewayEventCommandHandler.js';
import { DepositReconcileJob } from '../../../../../src/application/features/deposits/jobs/depositReconcileJob.js';
import type { GatewayOutcome } from '../../../../../src/application/features/payments/common/ports.js';
import { StartDepositCommand } from '../../../../../src/application/features/deposits/commands/startDeposit/startDepositCommand.js';
import { StartDepositCommandHandler } from '../../../../../src/application/features/deposits/commands/startDeposit/startDepositCommandHandler.js';
import { GetDepositOptionsQueryHandler } from '../../../../../src/application/features/deposits/queries/getDepositOptions/getDepositOptionsQueryHandler.js';
import { TermsAcceptance } from '../../../../../src/domain/users/termsAcceptance.js';
import { sha256TokenFingerprint } from '../../../../../src/infrastructure/push/tokenRef.js';
import { FakeDeviceRepository } from '../../../../fakes/fakeDeviceRepository.js';
import { FakeNotificationRepository } from '../../../../fakes/fakeNotificationRepository.js';
import { FakePaymentGateway, FakePaymentGatewayRegistry, signedEvent } from '../../../../fakes/fakePaymentGateway.js';
import { FakePaymentGatewaySettingsRepository } from '../../../../fakes/fakePaymentGatewaySettingsRepository.js';
import { FakePaymentSecrets, TEST_GATEWAY_SECRETS } from '../../../../fakes/fakePaymentSecrets.js';
import { FakePushSender } from '../../../../fakes/fakePushSender.js';
import { FakeTermsAcceptanceRepository } from '../../../../fakes/fakeTermsAcceptanceRepository.js';
import { FakeDepositRepository } from '../../../../fakes/fakeDepositRepository.js';
import { FakeDepositStore } from '../../../../fakes/fakeDepositStore.js';
import { buildGoalkeeperProfile } from '../../../../fixtures/operatingBalanceFixtures.js';
import { OperatingBalanceHarness } from '../operatingBalance/operatingBalanceHarness.js';

export const TERMS_VERSION = '2.0';
export const PUBLIC_BASE_URL = 'https://api.porterospro.co';

/** A logger that keeps every entry, so tests can check what was (and was not) logged. */
export function recordingLogger() {
  const entries: { level: 'info' | 'warn'; entry: Record<string, unknown>; message: string }[] = [];
  return {
    entries,
    info: (entry: Record<string, unknown>, message: string) => void entries.push({ level: 'info', entry, message }),
    warn: (entry: Record<string, unknown>, message: string) => void entries.push({ level: 'warn', entry, message }),
  };
}

/**
 * The Cali operating balance world plus deposits: Colombia's Wompi settings (20 000 costs 1 464), its secrets,
 * a fake gateway that signs like Wompi, and the inbox and push for notices.
 */
export class PaymentsHarness {
  readonly operatingBalance = new OperatingBalanceHarness();
  readonly settings = new FakePaymentGatewaySettingsRepository();
  readonly terms = new FakeTermsAcceptanceRepository();
  readonly gateway = new FakePaymentGateway();
  readonly gateways = new FakePaymentGatewayRegistry([this.gateway]);
  readonly secrets = new FakePaymentSecrets();
  readonly deposits = new FakeDepositRepository();
  readonly store = new FakeDepositStore(this.deposits, this.operatingBalance.store);
  readonly notifications = new FakeNotificationRepository();
  readonly devices = new FakeDeviceRepository();
  readonly pushSender = new FakePushSender();
  readonly logger = recordingLogger();
  readonly pushNotifier = new PushNotifier({
    devices: this.devices,
    sender: this.pushSender,
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    fingerprint: sha256TokenFingerprint,
  });
  private counter = 0;
  readonly idGenerator = { newId: () => `0192f000-0000-7000-8000-${String(++this.counter).padStart(12, '0')}` };

  constructor() {
    this.settings.seed();
  }

  get clock() {
    return this.operatingBalance.clock;
  }

  get noticeDeps() {
    return { notifications: this.notifications, pushNotifier: this.pushNotifier, idGenerator: this.idGenerator, clock: this.clock };
  }

  /** An active goalkeeper of Cali who accepted the current terms, with Colombia's gateway configured. */
  goalkeeper(id = 'gk-1', options: { acceptedVersion?: string | null } = {}): string {
    this.operatingBalance.profiles.seed(buildGoalkeeperProfile(id));
    const version = options.acceptedVersion === undefined ? TERMS_VERSION : options.acceptedVersion;
    if (version !== null) {
      this.terms.records.push(
        new TermsAcceptance({
          id: `terms-${id}`,
          userId: id,
          termsVersion: version,
          privacyPolicyVersion: '1.0',
          acceptedAt: this.clock.now(),
          ipAddress: null,
          userAgent: null,
        }),
      );
    }
    return id;
  }

  optionsHandler(): GetDepositOptionsQueryHandler {
    return new GetDepositOptionsQueryHandler(this.operatingBalance.context, this.settings, this.terms, { termsVersion: TERMS_VERSION });
  }

  startHandler(publicBaseUrl = PUBLIC_BASE_URL): StartDepositCommandHandler {
    return new StartDepositCommandHandler({
      context: this.operatingBalance.context,
      settingsRepository: this.settings,
      termsRepository: this.terms,
      gateways: this.gateways,
      secrets: this.secrets,
      depositRepository: this.deposits,
      idGenerator: this.idGenerator,
      clock: this.clock,
      logger: this.logger,
      settings: { termsVersion: TERMS_VERSION, publicBaseUrl },
    });
  }

  /** Starts a deposit through the real command; throws unless it started. */
  async start(goalkeeperId = 'gk-1', amount = 20000) {
    const result = await this.startHandler().handle(new StartDepositCommand(goalkeeperId, amount));
    if (result.outcome !== 'started') throw new Error(`deposit not started: ${result.outcome}`);
    return result;
  }

  eventHandler(): ApplyGatewayEventCommandHandler {
    return new ApplyGatewayEventCommandHandler({
      operatingBalanceContext: this.operatingBalance.context,
      store: this.store,
      notices: this.noticeDeps,
      logger: this.logger,
      gateways: this.gateways,
      secrets: this.secrets,
      depositRepository: this.deposits,
      countryLookup: this.operatingBalance.countries,
      clock: this.clock,
    });
  }

  reconcileJob(): DepositReconcileJob {
    return new DepositReconcileJob({
      operatingBalanceContext: this.operatingBalance.context,
      store: this.store,
      notices: this.noticeDeps,
      logger: this.logger,
      depositRepository: this.deposits,
      gateways: this.gateways,
      secrets: this.secrets,
      countryLookup: this.operatingBalance.countries,
    });
  }

  /** What the gateway's transactions query answers for a deposit. */
  answer(reference: string, status: GatewayOutcome['status'], amountInCents = 2000000): GatewayOutcome {
    return { reference, transactionId: `tx-${reference}`, status, amountInCents, currency: 'COP' };
  }

  /** Delivers an event to the webhook command, as the controller does. */
  deliver(body: unknown, gateway = 'wompi') {
    return this.eventHandler().handle(new ApplyGatewayEventCommand(gateway, body, {}));
  }

  /** A Wompi event for a deposit's reference, signed with Colombia's events secret. */
  event(reference: string, status: string, overrides: { amountInCents?: number; currency?: string; id?: string; secret?: string } = {}) {
    return signedEvent(
      {
        id: overrides.id ?? `tx-${reference}`,
        reference,
        amount_in_cents: overrides.amountInCents ?? 2000000,
        currency: overrides.currency ?? 'COP',
        status,
      },
      overrides.secret ?? TEST_GATEWAY_SECRETS.eventsSecret,
    );
  }
}
