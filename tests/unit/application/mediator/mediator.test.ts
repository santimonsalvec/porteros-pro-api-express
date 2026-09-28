import { describe, expect, it } from 'vitest';
import { Mediator, registerHandlers, registerSubscribers } from '../../../../src/application/common/mediator/mediator.js';
import {
  EventHandlersFailedError,
  MediatorHandlerNotFoundError,
  MediatorRegistrationError,
  NotificationSubscriptionError,
} from '../../../../src/application/common/mediator/errors.js';
import { ICommand } from '../../../../src/application/common/mediator/types.js';
import type { ICommandHandler } from '../../../../src/application/common/mediator/types.js';

class PingCommand extends ICommand<string> {
  constructor(public readonly message: string) {
    super();
  }
}

class PingCommandHandler implements ICommandHandler<PingCommand, string> {
  callCount = 0;

  async handle(command: PingCommand): Promise<string> {
    this.callCount += 1;
    return `pong:${command.message}`;
  }
}

class UnregisteredCommand extends ICommand<void> {}

describe('Mediator', () => {
  it('dispatches to the exactly-one registered handler and returns its result', async () => {
    const mediator = new Mediator();
    const handler = new PingCommandHandler();
    registerHandlers(mediator, [{ requestType: PingCommand, handler }]);

    const result = await mediator.send(new PingCommand('hello'));

    expect(result).toBe('pong:hello');
    expect(handler.callCount).toBe(1);
  });

  it('throws MediatorHandlerNotFoundError when no handler is registered', async () => {
    const mediator = new Mediator();

    await expect(mediator.send(new UnregisteredCommand())).rejects.toBeInstanceOf(
      MediatorHandlerNotFoundError,
    );
  });

  it('throws MediatorRegistrationError when two handlers register for the same request type', () => {
    const mediator = new Mediator();
    const handlerA = new PingCommandHandler();
    const handlerB = new PingCommandHandler();
    mediator.register(PingCommand, handlerA);

    expect(() => mediator.register(PingCommand, handlerB)).toThrow(MediatorRegistrationError);
  });
});

describe('Mediator — publish (feature 013)', () => {
  const notification = { type: 'thing.happened', id: 'n-1' };

  function recorder(name: string, fail = false) {
    const seen: string[] = [];
    return {
      seen,
      handler: {
        name,
        async handle(n: { type: string }) {
          seen.push(n.type);
          if (fail) throw new Error(`${name} broke`);
        },
      },
    };
  }

  it('runs every handler subscribed to the type', async () => {
    const mediator = new Mediator();
    const a = recorder('a');
    const b = recorder('b');
    registerSubscribers(mediator, [
      { type: 'thing.happened', handler: a.handler },
      { type: 'thing.happened', handler: b.handler },
    ]);

    await mediator.publish(notification);

    expect(a.seen).toEqual(['thing.happened']);
    expect(b.seen).toEqual(['thing.happened']);
  });

  it('still runs the other handlers when one fails, and names the failed ones', async () => {
    const mediator = new Mediator();
    const broken = recorder('broken', true);
    const fine = recorder('fine');
    mediator.subscribe('thing.happened', broken.handler);
    mediator.subscribe('thing.happened', fine.handler);

    const error = await mediator.publish(notification).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EventHandlersFailedError);
    expect((error as EventHandlersFailedError).failedHandlers).toEqual(['broken']);
    expect(fine.seen).toHaveLength(1);
  });

  it('runs only the named handler with `only`', async () => {
    const mediator = new Mediator();
    const a = recorder('a');
    const b = recorder('b');
    mediator.subscribe('thing.happened', a.handler);
    mediator.subscribe('thing.happened', b.handler);

    await mediator.publish(notification, { only: 'b' });

    expect(a.seen).toEqual([]);
    expect(b.seen).toHaveLength(1);
  });

  it('does nothing for a type nobody subscribed to', async () => {
    await expect(new Mediator().publish({ type: 'unknown' })).resolves.toBeUndefined();
  });

  it('refuses two handlers with the same name for one type', () => {
    const mediator = new Mediator();
    mediator.subscribe('thing.happened', recorder('a').handler);

    expect(() => mediator.subscribe('thing.happened', recorder('a').handler)).toThrow(NotificationSubscriptionError);
  });
});
