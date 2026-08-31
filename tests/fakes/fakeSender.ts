import type { IBaseRequest, ISender } from '../../src/application/common/mediator/types.js';

/**
 * Records every request dispatched through it and returns a pre-configured result
 * keyed by request constructor — used by handlers that compose other features'
 * commands via the mediator instead of depending on their ports directly (research.md §5).
 */
export class FakeSender implements ISender {
  readonly sent: IBaseRequest<unknown>[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly results = new Map<abstract new (...args: any[]) => IBaseRequest<unknown>, unknown>();

  respondWith<TResponse>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    requestType: abstract new (...args: any[]) => IBaseRequest<TResponse>,
    result: TResponse,
  ): void {
    this.results.set(requestType, result);
  }

  async send<TResponse>(request: IBaseRequest<TResponse>): Promise<TResponse> {
    this.sent.push(request);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requestType = request.constructor as abstract new (...args: any[]) => IBaseRequest<TResponse>;
    if (!this.results.has(requestType)) {
      throw new Error(`FakeSender has no configured result for ${request.constructor.name}`);
    }
    return this.results.get(requestType) as TResponse;
  }
}
