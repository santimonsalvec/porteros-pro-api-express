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
