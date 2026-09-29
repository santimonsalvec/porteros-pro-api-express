import pino from 'pino';

export const logger = pino({
  level: process.env.VITEST ? 'silent' : (process.env.LOG_LEVEL ?? 'info'),
  // Request logs never carry credentials or a payment event's signature (feature 022).
  redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-event-checksum"]'],
});
