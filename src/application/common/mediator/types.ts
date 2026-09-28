/**
 * Base for any request dispatched through the mediator. Implemented as an abstract
 * class (not a bare interface) purely so TypeScript retains the phantom `TResponse`
 * type through inheritance for `ISender.send` inference — the `__responseType` field
 * is declaration-only and never read at runtime. Concrete commands/queries extend
 * `ICommand<TResponse>` / `IQuery<TResponse>`, matching the source system's naming.
 */
export abstract class IBaseRequest<TResponse> {
  declare readonly __responseType: TResponse;
}

/** An intent to change state, dispatched through the mediator to exactly one handler. */
export abstract class ICommand<TResponse> extends IBaseRequest<TResponse> {}

/** An intent to read data, dispatched through the mediator to exactly one handler, no side effects. */
export abstract class IQuery<TResponse> extends IBaseRequest<TResponse> {}

export interface ICommandHandler<TCommand extends ICommand<TResponse>, TResponse> {
  handle(command: TCommand): Promise<TResponse>;
}

export interface IQueryHandler<TQuery extends IQuery<TResponse>, TResponse> {
  handle(query: TQuery): Promise<TResponse>;
}

/** A constructor function, used as the registry key for a request type. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RequestConstructor = new (...args: any[]) => IBaseRequest<unknown>;

export interface ISender {
  send<TResponse>(request: IBaseRequest<TResponse>): Promise<TResponse>;
}

/**
 * Something that happened, published to every handler subscribed to its `type` (feature 013).
 * Unlike commands and queries, a notification has zero or many handlers and no response.
 */
export interface INotification {
  readonly type: string;
}

export interface INotificationHandler<TNotification extends INotification> {
  /** Unique per notification type; also the consumer name used for idempotency. */
  readonly name: string;
  handle(notification: TNotification): Promise<void>;
}

export interface IPublisher {
  /** Runs every handler of the notification's type (only the named one with `only`). */
  publish(notification: INotification, options?: { only?: string }): Promise<void>;
}
