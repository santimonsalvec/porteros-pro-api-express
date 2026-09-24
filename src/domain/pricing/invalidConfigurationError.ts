/**
 * A stored rate, settings or time-zone value is malformed. Thrown loudly instead of
 * silently falling back to another level, since inheriting the wrong value would
 * mis-price or mis-refuse quotes without anyone noticing. The global error handler
 * turns it into a generic 500 and logs the detail.
 */
export class InvalidConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidConfigurationError';
  }
}
