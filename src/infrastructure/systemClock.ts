import type { IClock } from '../application/common/clock.js';

export class SystemClock implements IClock {
  now(): Date {
    return new Date();
  }
}
