import type { IClock } from '../../src/application/common/clock.js';

/** A clock the test controls — boundary tests (29:59 vs 30:00 of notice) are impossible against the real one. */
export class FixedClock implements IClock {
  private current: Date;

  constructor(initial: Date | string = '2026-09-21T18:00:00.000Z') {
    this.current = new Date(initial);
  }

  now(): Date {
    return new Date(this.current);
  }

  set(value: Date | string): void {
    this.current = new Date(value);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}
