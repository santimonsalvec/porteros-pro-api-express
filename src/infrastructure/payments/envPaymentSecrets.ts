import type { GatewaySecrets, IPaymentSecrets } from '../../application/features/payments/common/ports.js';
import type { GatewayName } from '../../domain/payments/gatewaySettings.js';

/**
 * Gateway secrets from environment variables named `{GATEWAY}_{COUNTRY}_{NAME}`, e.g.
 * `WOMPI_CO_INTEGRITY_SECRET` (research.md §4). In the cloud, App Hosting fills them from Secret
 * Manager. The values are never logged.
 */
export class EnvPaymentSecrets implements IPaymentSecrets {
  constructor(private readonly env: Readonly<Record<string, string | undefined>>) {}

  forGateway(gateway: GatewayName, countryCode: string): GatewaySecrets | null {
    const prefix = `${gateway}_${countryCode}`.toUpperCase();
    const read = (name: string): string | null => {
      const value = this.env[`${prefix}_${name}`]?.trim();
      return value ? value : null;
    };
    const privateKey = read('PRIVATE_KEY');
    const eventsSecret = read('EVENTS_SECRET');
    const integritySecret = read('INTEGRITY_SECRET');
    if (!privateKey || !eventsSecret || !integritySecret) return null;
    return { privateKey, eventsSecret, integritySecret };
  }
}
