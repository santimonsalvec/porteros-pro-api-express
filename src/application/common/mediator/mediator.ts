import { MediatorHandlerNotFoundError, MediatorRegistrationError } from './errors.js';
import type { IBaseRequest, ISender, RequestConstructor } from './types.js';

interface AnyHandler {
  handle(request: IBaseRequest<unknown>): Promise<unknown>;
}

export interface HandlerRegistration {
  requestType: RequestConstructor;
  handler: AnyHandler;
}

/**
 * Self-built, in-process CQRS mediator: routes each command/query to exactly one
 * registered handler. No third-party mediator library is used (see research.md §9).
 */
export class Mediator implements ISender {
  private readonly handlers = new Map<RequestConstructor, AnyHandler>();

  register(requestType: RequestConstructor, handler: AnyHandler): void {
    if (this.handlers.has(requestType)) {
      throw new MediatorRegistrationError(requestType.name);
    }
    this.handlers.set(requestType, handler);
  }

  async send<TResponse>(request: IBaseRequest<TResponse>): Promise<TResponse> {
    const requestType = request.constructor as RequestConstructor;
    const handler = this.handlers.get(requestType);
    if (!handler) {
      throw new MediatorHandlerNotFoundError(requestType.name);
    }
    return handler.handle(request) as Promise<TResponse>;
  }
}

/** Composition-root helper: registers every handler up front, failing fast on duplicates. */
export function registerHandlers(mediator: Mediator, registrations: HandlerRegistration[]): void {
  for (const { requestType, handler } of registrations) {
    mediator.register(requestType, handler);
  }
}
