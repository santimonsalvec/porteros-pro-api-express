import { Router } from 'express';
import { EventHandlersFailedError } from '../application/common/mediator/errors.js';
import type { IPublisher, ISender } from '../application/common/mediator/types.js';
import { RunSweepCommand } from '../application/features/events/commands/runSweep/runSweepCommand.js';
import { decodePushEnvelope } from '../application/features/events/common/eventSchemas.js';
import { requireInternalCaller } from '../infrastructure/auth/middleware/requireInternalCaller.js';
import { logger } from '../infrastructure/observability/logger.js';

export interface InternalControllerDependencies {
  mediator: ISender;
  publisher: IPublisher;
  verifyInternalCaller: (token: string) => Promise<boolean>;
}

/**
 * Endpoints only the platform calls (contracts/internal-endpoints.md), mounted apart from the app's routes and
 * absent from the public API documentation.
 */
export function createInternalController(deps: InternalControllerDependencies): Router {
  const router = Router();

  router.use(requireInternalCaller(deps.verifyInternalCaller));

  // Pub/Sub push delivery. 204 acknowledges; 500 makes Pub/Sub retry (then dead-letter).
  router.post('/events', async (req, res) => {
    const { event, messageId } = decodePushEnvelope(req.body);
    if (!event) {
      // Malformed or unknown: acknowledged so it is never retried forever (FR-015).
      logger.warn({ outcome: 'event_rejected', messageId }, 'Unreadable or unknown event acknowledged');
      res.status(204).end();
      return;
    }
    const only = typeof req.query.consumer === 'string' ? req.query.consumer : undefined;
    try {
      await deps.publisher.publish(event, { only });
      res.status(204).end();
    } catch (error) {
      if (!(error instanceof EventHandlersFailedError)) throw error;
      logger.warn(
        { outcome: 'event_handlers_failed', eventId: event.id, type: event.type, failedHandlers: error.failedHandlers, causes: error.causes },
        'Event handlers failed; Pub/Sub will retry',
      );
      res.status(500).json({ error: 'event_handlers_failed', message: 'At least one consumer failed; the event will be retried.' });
    }
  });

  // Cloud Scheduler, every minute.
  router.post('/sweep', async (_req, res) => {
    res.status(200).json(await deps.mediator.send(new RunSweepCommand()));
  });

  return router;
}
