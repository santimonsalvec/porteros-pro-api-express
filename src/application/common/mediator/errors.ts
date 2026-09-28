export class MediatorHandlerNotFoundError extends Error {
  constructor(requestTypeName: string) {
    super(`No handler is registered for request type '${requestTypeName}'.`);
    this.name = 'MediatorHandlerNotFoundError';
  }
}

export class MediatorRegistrationError extends Error {
  constructor(requestTypeName: string) {
    super(`A handler is already registered for request type '${requestTypeName}'.`);
    this.name = 'MediatorRegistrationError';
  }
}

/** One or more handlers of a published notification failed; the others still ran (feature 013). */
export class EventHandlersFailedError extends Error {
  constructor(
    public readonly notificationType: string,
    public readonly failedHandlers: readonly string[],
    public readonly causes: readonly unknown[],
  ) {
    super(`Handlers failed for '${notificationType}': ${failedHandlers.join(', ')}.`);
    this.name = 'EventHandlersFailedError';
  }
}

export class NotificationSubscriptionError extends Error {
  constructor(notificationType: string, handlerName: string) {
    super(`A handler named '${handlerName}' is already subscribed to '${notificationType}'.`);
    this.name = 'NotificationSubscriptionError';
  }
}
