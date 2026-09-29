import type { IPaymentGateway, IPaymentGatewayRegistry } from '../../application/features/payments/common/ports.js';

/** The gateways this deployment can use, by name. */
export class PaymentGatewayRegistry implements IPaymentGatewayRegistry {
  private readonly gateways: Map<string, IPaymentGateway>;

  constructor(gateways: readonly IPaymentGateway[]) {
    this.gateways = new Map(gateways.map((gateway) => [gateway.name, gateway]));
  }

  get(name: string): IPaymentGateway | null {
    return this.gateways.get(name) ?? null;
  }
}
