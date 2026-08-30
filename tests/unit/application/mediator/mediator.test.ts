import { describe, expect, it } from 'vitest';
import { Mediator, registerHandlers } from '../../../../src/application/common/mediator/mediator.js';
import {
  MediatorHandlerNotFoundError,
  MediatorRegistrationError,
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
