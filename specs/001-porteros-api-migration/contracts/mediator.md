# Contract: Self-Built Mediator (in-process, internal)

Not an HTTP contract — the internal contract the Application layer (and controllers) use to dispatch Commands/Queries. Ported unchanged from the source system (`001-clean-architecture-foundation/contracts/mediator.md`).

## `ISender.send<TResponse>(request: IBaseRequest<TResponse>): Promise<TResponse>`

| Scenario | Behavior |
|---|---|
| Exactly one handler registered for `request`'s type | The handler executes exactly once; its result is returned |
| No handler registered for `request`'s type | Throws `MediatorHandlerNotFoundError` naming the unresolved request type |
| Two or more handlers registered for the same request type | Detected and rejected at registration time (composition-root wiring in `di.ts`), throwing `MediatorRegistrationError` — never reaches `send` |

## `registerHandlers(mediator, handlers)` (composition-root wiring, equivalent of the source's `AddMediator(...)`)

- Registers each handler against its request type tag at application startup.
- Throws `MediatorRegistrationError` immediately (before the server starts listening) if the same request type is registered more than once.
