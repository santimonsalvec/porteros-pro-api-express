import {
  EventHandlersFailedError,
  MediatorHandlerNotFoundError,
  MediatorRegistrationError,
  NotificationSubscriptionError,
} from './errors.js';
import type { IBaseRequest, INotification, INotificationHandler, IPublisher, ISender, RequestConstructor } from './types.js';

interface AnyHandler {
  handle(request: IBaseRequest<unknown>): Promise<unknown>;
}

export interface HandlerRegistration {
  requestType: RequestConstructor;
  handler: AnyHandler;
}

export interface SubscriberRegistration {
  type: string;
  handler: INotificationHandler<INotification>;
}

/**
 * Self-built, in-process CQRS mediator: routes each command/query to exactly one
 * registered handler. No third-party mediator library is used (see research.md §9).
 * It also publishes notifications to every handler subscribed to their type (feature 013).
 */
export class Mediator implements ISender, IPublisher {
  private readonly handlers = new Map<RequestConstructor, AnyHandler>();
  private readonly subscribers = new Map<string, INotificationHandler<INotification>[]>();

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

  subscribe(type: string, handler: INotificationHandler<INotification>): void {
    const current = this.subscribers.get(type) ?? [];
    if (current.some((existing) => existing.name === handler.name)) {
      throw new NotificationSubscriptionError(type, handler.name);
    }
    this.subscribers.set(type, [...current, handler]);
  }

  /**
   * Runs the handlers one after another (research §6). A failing handler does not stop the
   * others; the failures are reported together afterwards. No handler is a no-op.
   */
  async publish(notification: INotification, options: { only?: string } = {}): Promise<void> {
    const handlers = (this.subscribers.get(notification.type) ?? []).filter(
      (handler) => options.only === undefined || handler.name === options.only,
    );
    const failed: string[] = [];
    const causes: unknown[] = [];
    for (const handler of handlers) {
      try {
        await handler.handle(notification);
      } catch (error) {
        failed.push(handler.name);
        causes.push(error);
      }
    }
    if (failed.length > 0) throw new EventHandlersFailedError(notification.type, failed, causes);
  }
}

/** Composition-root helper: registers every handler up front, failing fast on duplicates. */
export function registerHandlers(mediator: Mediator, registrations: HandlerRegistration[]): void {
  for (const { requestType, handler } of registrations) {
    mediator.register(requestType, handler);
  }
}

/** Composition-root helper: subscribes every notification handler up front. */
export function registerSubscribers(mediator: Mediator, registrations: SubscriberRegistration[]): void {
  for (const { type, handler } of registrations) {
    mediator.subscribe(type, handler);
  }
}
