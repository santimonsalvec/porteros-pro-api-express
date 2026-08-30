export class InvalidPlatformError extends Error {
  constructor(platform: string) {
    super(`Unrecognized platform: '${platform}'.`);
    this.name = 'InvalidPlatformError';
  }
}
