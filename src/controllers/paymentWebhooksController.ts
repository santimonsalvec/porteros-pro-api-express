import { Router } from 'express';
import type { ISender } from '../application/common/mediator/types.js';
import { ApplyGatewayEventCommand } from '../application/features/payments/commands/applyGatewayEvent/applyGatewayEventCommand.js';
import { logger } from '../infrastructure/observability/logger.js';

export interface PaymentWebhooksControllerDependencies {
  mediator: ISender;
}

/**
 * Payment gateways' event notifications (feature 022, research.md §2). No platform auth: each
 * event's signature is verified with the gateway's secret. Every handled event is answered `200`
 * (a retry of an invalid or unknown event could never succeed); only an internal failure answers
 * `500`, so the gateway delivers it again. Neither the body nor its signature is logged.
 */
export function createPaymentWebhooksController(deps: PaymentWebhooksControllerDependencies): Router {
  const router = Router();

  router.post('/:gateway', async (req, res) => {
    const headers = { 'x-event-checksum': req.header('x-event-checksum') };
    const result = await deps.mediator.send(new ApplyGatewayEventCommand(req.params.gateway, req.body, headers));
    logger.info({ outcome: `payment_event_${result.outcome}`, gateway: req.params.gateway }, 'Payment gateway event');
    res.status(result.outcome === 'error' ? 500 : 200).json({});
  });

  return router;
}
