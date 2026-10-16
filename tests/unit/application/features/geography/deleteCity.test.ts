import { describe, expect, it } from 'vitest';
import { DeleteCityCommand } from '../../../../../src/application/features/geography/commands/deleteCity/deleteCityCommand.js';
import { DeleteCityCommandHandler } from '../../../../../src/application/features/geography/commands/deleteCity/deleteCityCommandHandler.js';
import { geographyKit } from './geographyTestKit.js';

describe('DeleteCityCommandHandler', () => {
  it.each(['city_in_use'] as const)('keeps a city that is used (%s)', async (reason) => {
    const kit = geographyKit();
    kit.usage.use('ita', reason);

    expect(await new DeleteCityCommandHandler(kit).handle(new DeleteCityCommand('ita'))).toEqual({ outcome: 'in_use', reason });
    expect(kit.cities.items.has('ita')).toBe(true);
  });

  it('deletes an unused city, and says when it is already gone', async () => {
    const kit = geographyKit();
    const handler = new DeleteCityCommandHandler(kit);

    expect(await handler.handle(new DeleteCityCommand('ita'))).toEqual({ outcome: 'deleted' });
    expect(kit.cities.items.has('ita')).toBe(false);
    expect(await handler.handle(new DeleteCityCommand('ita'))).toEqual({ outcome: 'not_found' });
  });
});
