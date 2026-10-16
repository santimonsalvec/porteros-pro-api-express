import { describe, expect, it } from 'vitest';
import { SaveBillingSectionCommand } from '../../../../../../src/application/features/goalkeepers/commands/saveBillingSection/saveBillingSectionCommand.js';
import { SaveBillingSectionCommandHandler } from '../../../../../../src/application/features/goalkeepers/commands/saveBillingSection/saveBillingSectionCommandHandler.js';
import { UpdateGoalkeeperBillingCommand } from '../../../../../../src/application/features/goalkeepers/commands/updateGoalkeeperBilling/updateGoalkeeperBillingCommand.js';
import { UpdateGoalkeeperBillingCommandHandler } from '../../../../../../src/application/features/goalkeepers/commands/updateGoalkeeperBilling/updateGoalkeeperBillingCommandHandler.js';
import { City } from '../../../../../../src/domain/locations/city.js';
import { GoalkeeperRegistration } from '../../../../../../src/domain/goalkeepers/goalkeeperRegistration.js';
import { FakeCityRepository } from '../../../../../fakes/fakeCityRepository.js';
import { FakeGoalkeeperProfileRepository } from '../../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { FakeGoalkeeperRegistrationRepository } from '../../../../../fakes/fakeGoalkeeperRegistrationRepository.js';
import { buildGoalkeeperProfile } from '../../../../../fixtures/operatingBalanceFixtures.js';

function world() {
  const registrations = new FakeGoalkeeperRegistrationRepository();
  const profiles = new FakeGoalkeeperProfileRepository();
  const cities = new FakeCityRepository();
  cities.seed(new City({ id: 'city-rionegro', name: 'Rionegro', regionId: 'antioquia', daneStateCode: '05', daneCityCode: '615' }));
  cities.seed(new City({ id: 'city-uncoded', name: 'Sin código', regionId: 'antioquia' }));
  let next = 0;
  const ids = { newId: () => `reg-${++next}` };
  return {
    registrations,
    profiles,
    save: (fields: ConstructorParameters<typeof SaveBillingSectionCommand>[1], userId = 'user-1') =>
      new SaveBillingSectionCommandHandler(registrations, cities, ids).handle(new SaveBillingSectionCommand(userId, fields)),
    update: (fields: ConstructorParameters<typeof UpdateGoalkeeperBillingCommand>[1], userId = 'gk-1') =>
      new UpdateGoalkeeperBillingCommandHandler(profiles, registrations, cities).handle(new UpdateGoalkeeperBillingCommand(userId, fields)),
  };
}

describe('SaveBillingSectionCommandHandler (spec 031, FR-023, contract A6)', () => {
  it('saves the draft field by field, creating the registration on the first save', async () => {
    const { registrations, save } = world();

    const first = await save({ cityId: 'city-rionegro' });
    const second = await save({ address: '  Calle 10 # 20-30 ', addressComplement: '' });

    expect(first).toMatchObject({ outcome: 'success', registration: { sections: { billing: { complete: false } } } });
    expect(second).toMatchObject({
      outcome: 'success',
      registration: { billing: { cityId: 'city-rionegro', address: 'Calle 10 # 20-30', addressComplement: null }, sections: { billing: { complete: true } } },
    });
    expect((await registrations.getByUserId('user-1'))!.billing.address).toBe('Calle 10 # 20-30');
  });

  it('refuses a municipality that does not exist or has no official codes', async () => {
    const { save } = world();
    expect(await save({ cityId: 'nope' })).toEqual({ outcome: 'invalid_city' });
    expect(await save({ cityId: 'city-uncoded' })).toEqual({ outcome: 'invalid_city' });
  });

  it('refuses broken fields and an active registration', async () => {
    const { registrations, save } = world();
    expect(await save({ address: 'Cl 1' })).toEqual({ outcome: 'validation_failed', fieldErrors: { address: 'invalid_length' } });

    const active = GoalkeeperRegistration.createEmpty('reg-x', 'user-2');
    active.activate();
    await registrations.add(active);
    expect(await save({ address: 'Calle 10 # 20-30' }, 'user-2')).toEqual({ outcome: 'already_active' });
  });
});

describe('UpdateGoalkeeperBillingCommandHandler (spec 031, contract A7)', () => {
  it("replaces an active goalkeeper's billing data", async () => {
    const { profiles, update } = world();
    profiles.seed(buildGoalkeeperProfile('gk-1'));

    const result = await update({ cityId: 'city-rionegro', address: 'Carrera 5 # 1-2', addressComplement: 'Torre 3' });

    expect(result).toMatchObject({ outcome: 'success', goalkeeper: { billing: { cityId: 'city-rionegro', address: 'Carrera 5 # 1-2', addressComplement: 'Torre 3' } } });
    expect((await profiles.getByUserId('gk-1'))!.billing.addressComplement).toBe('Torre 3');
  });

  it('refuses an unknown municipality, broken fields and someone who is not an active goalkeeper', async () => {
    const { profiles, update } = world();
    profiles.seed(buildGoalkeeperProfile('gk-1'));

    expect(await update({ cityId: 'city-uncoded', address: 'Carrera 5 # 1-2', addressComplement: null })).toEqual({ outcome: 'invalid_city' });
    expect(await update({ cityId: 'city-rionegro', address: 'x', addressComplement: null })).toEqual({ outcome: 'validation_failed', fieldErrors: { address: 'invalid_length' } });
    expect((await update({ cityId: 'city-rionegro', address: 'Carrera 5 # 1-2', addressComplement: null }, 'nobody')).outcome).toBe('not_a_goalkeeper');
  });
});
