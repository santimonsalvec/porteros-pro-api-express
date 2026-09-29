import type { GatewaySecrets, IPaymentSecrets } from '../../src/application/features/payments/common/ports.js';
import type { GatewayName } from '../../src/domain/payments/gatewaySettings.js';

export const TEST_GATEWAY_SECRETS: GatewaySecrets = {
  privateKey: 'prv_test_fake-private-key',
  eventsSecret: 'test_events_fake-events-secret',
  integritySecret: 'test_integrity_fake-integrity-secret',
};

/** Secrets per `gateway:COUNTRY`; Colombia's Wompi secrets are there unless removed. */
export class FakePaymentSecrets implements IPaymentSecrets {
  readonly secrets = new Map<string, GatewaySecrets>([['wompi:CO', TEST_GATEWAY_SECRETS]]);

  forGateway(gateway: GatewayName, countryCode: string): GatewaySecrets | null {
    return this.secrets.get(`${gateway}:${countryCode.toUpperCase()}`) ?? null;
  }
}
