import { describe, expect, it } from 'vitest';
import { ExportTopUpsQuery } from '../../../../../src/application/features/payments/queries/exportTopUps/exportTopUpsQuery.js';
import { ExportTopUpsQueryHandler } from '../../../../../src/application/features/payments/queries/exportTopUps/exportTopUpsQueryHandler.js';
import { GetTopUpAdminQuery } from '../../../../../src/application/features/payments/queries/getTopUpAdmin/getTopUpAdminQuery.js';
import { GetTopUpAdminQueryHandler } from '../../../../../src/application/features/payments/queries/getTopUpAdmin/getTopUpAdminQueryHandler.js';
import { ListTopUpsAdminQuery } from '../../../../../src/application/features/payments/queries/listTopUpsAdmin/listTopUpsAdminQuery.js';
import { ListTopUpsAdminQueryHandler } from '../../../../../src/application/features/payments/queries/listTopUpsAdmin/listTopUpsAdminQueryHandler.js';
import { TopUp, type TopUpProps } from '../../../../../src/domain/payments/topUp.js';
import { User } from '../../../../../src/domain/users/user.js';
import { FakeTopUpAdminReader } from '../../../../fakes/fakeTopUpAdminReader.js';
import { FakeTopUpRepository } from '../../../../fakes/fakeTopUpRepository.js';
import { FakeUserRepository } from '../../../../fakes/fakeUserRepository.js';
import { Country } from '../../../../../src/domain/countries/country.js';

// Admin spec 007, US1 (FR-003, FR-004, FR-024): the top-up list, its detail and its export.

const CREATED = new Date('2026-10-13T21:15:00.000Z');

function topUp(overrides: Partial<TopUpProps> = {}): TopUp {
  return TopUp.rehydrate({
    id: 't-1',
    goalkeeperId: 'gk-1',
    countryId: 'country-co',
    gateway: 'wompi',
    environment: 'production',
    reference: 'PPR-1',
    gatewayTransactionId: null,
    amount: 50000,
    cost: 2233,
    net: 47767,
    currency: 'COP',
    status: 'pending',
    createdAt: CREATED,
    finalizedAt: null,
    lastCheckedAt: new Date('2026-10-13T22:15:00.000Z'),
    nextCheckAt: new Date('2026-10-14T03:15:00.000Z'),
    checks: 2,
    ...overrides,
  });
}

function person(id: string, first: string, last: string) {
  const user = User.createFromExternalIdentity({ id, email: `${id}@x.co`, displayName: null, provider: 'google', subject: id });
  user.completeProfile(first, last, '+57', '3001234567');
  return user;
}

function setup(...topUps: TopUp[]) {
  const repository = new FakeTopUpRepository();
  for (const item of topUps) repository.put(item);
  const users = new FakeUserRepository();
  users.seed(person('gk-1', 'Juan', 'Pérez'));
  users.seed(person('staff-user-1', 'Santiago', 'Monsalve'));
  const colombia = new Country({ id: 'country-co', name: 'Colombia', dialCode: '+57', countryCode: 'CO', currency: 'COP' });
  const deps = { reader: new FakeTopUpAdminReader(repository), users, countries: { getById: async (id: string) => (id === colombia.id ? colombia : null) } };
  return { repository, deps };
}

describe('ListTopUpsAdminQueryHandler', () => {
  it('lists rows with the goalkeeper and country names, newest first', async () => {
    const { deps } = setup(topUp(), topUp({ id: 't-2', reference: 'PPR-2', createdAt: new Date('2026-10-13T20:02:00.000Z'), status: 'declined' }));

    const result = await new ListTopUpsAdminQueryHandler(deps).handle(new ListTopUpsAdminQuery({ page: 1, pageSize: 20 }));

    expect(result.page).toMatchObject({ page: 1, pageSize: 20, totalItems: 2, totalPages: 1 });
    expect(result.page.items[0]).toEqual({
      topUpId: 't-1',
      createdAt: '2026-10-13T21:15:00.000Z',
      goalkeeper: { userId: 'gk-1', name: 'Juan Pérez' },
      countryId: 'country-co',
      countryName: 'Colombia',
      amount: 50000,
      cost: 2233,
      net: 47767,
      currency: 'COP',
      gateway: 'wompi',
      environment: 'production',
      status: 'pending',
    });
    expect(result.page.items.map((row) => row.topUpId)).toEqual(['t-1', 't-2']);
  });

  it('filters by status', async () => {
    const { deps } = setup(topUp(), topUp({ id: 't-2', status: 'approved' }));
    const result = await new ListTopUpsAdminQueryHandler(deps).handle(new ListTopUpsAdminQuery({ status: 'approved', page: 1, pageSize: 20 }));
    expect(result.page.items.map((row) => row.topUpId)).toEqual(['t-2']);
  });
});

describe('GetTopUpAdminQueryHandler', () => {
  it('answers not_found', async () => {
    const { deps } = setup();
    expect(await new GetTopUpAdminQueryHandler(deps).handle(new GetTopUpAdminQuery('nope'))).toEqual({ outcome: 'not_found' });
  });

  it('gives the detail with its checks, who asked, the next check and when it expires', async () => {
    const { repository, deps } = setup(topUp());
    const at = new Date('2026-10-13T22:31:00.000Z');
    await repository.recordCheck('t-1', { at, lastAt: at, by: 'staff', staffUserId: 'staff-user-1', answer: 'PENDING', result: 'still_pending', statusAfter: 'pending', repeats: 1 });

    const result = await new GetTopUpAdminQueryHandler(deps).handle(new GetTopUpAdminQuery('t-1'));

    expect(result).toMatchObject({
      outcome: 'ok',
      topUp: {
        topUpId: 't-1',
        reference: 'PPR-1',
        gatewayTransactionId: null,
        finalizedAt: null,
        lastCheckedAt: '2026-10-13T22:15:00.000Z',
        checks: 2,
        nextCheckAt: '2026-10-14T03:15:00.000Z',
        expiresAt: '2026-10-15T21:15:00.000Z',
        canReconcile: true,
        checkLog: [
          {
            at: '2026-10-13T22:31:00.000Z',
            lastAt: '2026-10-13T22:31:00.000Z',
            by: 'staff',
            staff: { userId: 'staff-user-1', name: 'Santiago Monsalve' },
            answer: 'PENDING',
            result: 'still_pending',
            statusAfter: 'pending',
            repeats: 1,
          },
        ],
      },
    });
  });

  it('has no next check nor expiry once final, and cannot be reconciled', async () => {
    const { deps } = setup(topUp({ status: 'approved', finalizedAt: CREATED, nextCheckAt: null }));
    const result = await new GetTopUpAdminQueryHandler(deps).handle(new GetTopUpAdminQuery('t-1'));
    expect(result).toMatchObject({ outcome: 'ok', topUp: { nextCheckAt: null, expiresAt: null, canReconcile: false, checkLog: [] } });
  });
});

describe('ExportTopUpsQueryHandler', () => {
  it('refuses more than 10.000 rows with the count', async () => {
    const { deps } = setup();
    deps.reader.count = async () => 14302;
    const result = await new ExportTopUpsQueryHandler(deps).handle(new ExportTopUpsQuery({}));
    expect(result).toEqual({ outcome: 'too_large', count: 14302, limit: 10000 });
  });

  it('writes the CSV columns in order, with dates on Colombia time', async () => {
    const { deps } = setup(topUp({ status: 'approved', finalizedAt: new Date('2026-10-13T22:31:00.000Z'), gatewayTransactionId: 'w-9' }));

    const result = await new ExportTopUpsQueryHandler(deps).handle(new ExportTopUpsQuery({}));

    expect(result.outcome).toBe('ok');
    if (result.outcome !== 'ok') return;
    expect(result.rows).toBe(1);
    const [header, row] = result.csv.replace('﻿', '').split('\r\n');
    expect(header).toBe(
      'fecha_creacion;zona_horaria;referencia;portero;portero_id;pais;pasarela;entorno;estado;monto;costo;neto;moneda;fecha_cierre;transaccion_pasarela',
    );
    expect(row).toBe('2026-10-13 16:15;America/Bogota;PPR-1;Juan Pérez;gk-1;Colombia;Wompi;Producción;Aprobada;50000;2233;47767;COP;2026-10-13 17:31;w-9');
  });
});
