import { describe, expect, it } from 'vitest';
import { ExportDocumentsQuery } from '../../../../../src/application/features/invoicing/queries/exportDocuments/exportDocumentsQuery.js';
import { ExportDocumentsQueryHandler } from '../../../../../src/application/features/invoicing/queries/exportDocuments/exportDocumentsQueryHandler.js';
import { GetDocumentAdminQuery } from '../../../../../src/application/features/invoicing/queries/getDocumentAdmin/getDocumentAdminQuery.js';
import { GetDocumentAdminQueryHandler } from '../../../../../src/application/features/invoicing/queries/getDocumentAdmin/getDocumentAdminQueryHandler.js';
import { ListDocumentsForAdminQuery } from '../../../../../src/application/features/invoicing/queries/listDocumentsForAdmin/listDocumentsForAdminQuery.js';
import { ListDocumentsForAdminQueryHandler } from '../../../../../src/application/features/invoicing/queries/listDocumentsForAdmin/listDocumentsForAdminQueryHandler.js';
import { Country } from '../../../../../src/domain/countries/country.js';
import { User } from '../../../../../src/domain/users/user.js';
import { buildDocument } from '../../../../fixtures/invoicingAdminFixtures.js';
import { FixedClock } from '../../../../fakes/fakeClock.js';
import { FakeInvoicingDocumentAdminReader } from '../../../../fakes/fakeInvoicingDocumentAdminReader.js';
import { FakeInvoicingDocumentRepository } from '../../../../fakes/fakeInvoicingDocumentRepository.js';
import { FakeUserRepository } from '../../../../fakes/fakeUserRepository.js';

// Admin spec 007, US2 (FR-007, FR-008, FR-024): the document list, its detail and its export.

const NOW = new Date('2026-10-15T14:00:00.000Z');

function person(id: string, first: string, last: string) {
  const user = User.createFromExternalIdentity({ id, email: `${id}@x.co`, displayName: null, provider: 'google', subject: id });
  user.completeProfile(first, last, '+57', '3001234567');
  return user;
}

function setup(...documents: ReturnType<typeof buildDocument>[]) {
  const repository = new FakeInvoicingDocumentRepository();
  for (const document of documents) repository.put(document);
  const users = new FakeUserRepository();
  users.seed(person('gk-1', 'Juan', 'Pérez'));
  const clock = new FixedClock(NOW);
  const colombia = new Country({ id: 'country-co', name: 'Colombia', dialCode: '+57', countryCode: 'CO', currency: 'COP' });
  const deps = {
    reader: new FakeInvoicingDocumentAdminReader(repository),
    documents: repository,
    users,
    countries: { getById: async (id: string) => (id === colombia.id ? colombia : null) },
    clock,
    issuingEnabled: false,
  };
  return { repository, deps };
}

const issued = buildDocument({
  id: 'inv-1',
  status: 'issued',
  provider: { name: 'siigo', config: {}, id: 's-1', number: 'FE-1024', cufe: 'cufe-1' },
  issuedAt: new Date('2026-10-13T14:05:00.000Z'),
});
const note = buildDocument({
  id: 'nc-1',
  kind: 'credit_note',
  originalDocumentId: 'inv-1',
  createdAt: new Date('2026-10-13T15:00:00.000Z'),
  occurredAt: new Date('2026-10-13T15:00:00.000Z'),
});
const rejected = buildDocument({
  id: 'rej-1',
  status: 'rejected',
  createdAt: new Date('2026-10-14T10:00:00.000Z'),
  occurredAt: new Date('2026-10-14T10:00:00.000Z'),
  lastError: { kind: 'rejected', code: 'buyer_city_not_coded', message: 'The city has no DANE codes', at: new Date('2026-10-14T10:01:00.000Z') },
});

describe('ListDocumentsForAdminQueryHandler', () => {
  it('lists as before without the new filters, adding the goalkeeper and whether issuing is on', async () => {
    const { deps } = setup(issued, note, rejected);

    const result = await new ListDocumentsForAdminQueryHandler(deps).handle(new ListDocumentsForAdminQuery(null, 1, 20));

    expect(result).toMatchObject({ page: 1, pageSize: 20, totalItems: 3, totalPages: 1, issuingEnabled: false });
    expect(result.items.map((item) => item.documentId)).toEqual(['inv-1', 'nc-1', 'rej-1']);
    expect(result.items[0]).toMatchObject({ documentId: 'inv-1', number: 'FE-1024', goalkeeper: { userId: 'gk-1', name: 'Juan Pérez' } });
  });

  it('filters by kind, country, dates and the ones waiting more than 24 hours', async () => {
    const { deps } = setup(issued, note, rejected);
    const ids = async (filters: ConstructorParameters<typeof ListDocumentsForAdminQuery>[3]) =>
      (await new ListDocumentsForAdminQueryHandler(deps).handle(new ListDocumentsForAdminQuery(null, 1, 20, filters))).items.map((item) => item.documentId);

    expect(await ids({ kind: 'credit_note' })).toEqual(['nc-1']);
    expect(await ids({ countryId: 'country-pe' })).toEqual([]);
    expect(await ids({ from: new Date('2026-10-14T05:00:00.000Z') })).toEqual(['rej-1']);
    expect(await ids({ stale: true })).toEqual(['nc-1']);
  });
});

describe('GetDocumentAdminQueryHandler', () => {
  it('answers not_found', async () => {
    const { deps } = setup();
    expect(await new GetDocumentAdminQueryHandler(deps).handle(new GetDocumentAdminQuery('nope'))).toEqual({ outcome: 'not_found' });
  });

  it('gives an invoice with the credit notes that correct it', async () => {
    const { deps } = setup(issued, note);
    const result = await new GetDocumentAdminQueryHandler(deps).handle(new GetDocumentAdminQuery('inv-1'));
    expect(result).toMatchObject({
      outcome: 'ok',
      document: { documentId: 'inv-1', requestId: 'r-1', bookingId: 'b-1', original: null, creditNotes: [{ documentId: 'nc-1', number: null, status: 'pending' }] },
    });
  });

  it('gives a credit note with the invoice it corrects, and what it waits for', async () => {
    const { deps } = setup(issued, note);
    const result = await new GetDocumentAdminQueryHandler(deps).handle(new GetDocumentAdminQuery('nc-1'));
    expect(result).toMatchObject({
      outcome: 'ok',
      document: { documentId: 'nc-1', kind: 'credit_note', waitingFor: 'inv-1', nextAttemptAt: expect.any(String), original: { documentId: 'inv-1', number: 'FE-1024', status: 'issued' }, creditNotes: [] },
    });
  });
});

describe('ExportDocumentsQueryHandler', () => {
  it('refuses more than 10.000 rows', async () => {
    const { deps } = setup();
    deps.reader.count = async () => 10_001;
    expect(await new ExportDocumentsQueryHandler(deps).handle(new ExportDocumentsQuery({}))).toEqual({ outcome: 'too_large', count: 10_001, limit: 10_000 });
  });

  it('writes the CSV columns, never the buyer document nor the email', async () => {
    const { deps } = setup(issued, rejected);

    const result = await new ExportDocumentsQueryHandler(deps).handle(new ExportDocumentsQuery({}));

    if (result.outcome !== 'ok') throw new Error(result.outcome);
    expect(result.rows).toBe(2);
    const [header, first, second] = result.csv.replace('﻿', '').split('\r\n');
    expect(header).toBe('fecha;zona_horaria;tipo;concepto;numero;cufe;estado;portero;portero_id;pais;base;iva;tarifa_iva;total;moneda;motivo_rechazo;factura_original');
    expect(first).toBe('2026-10-13 09:00;America/Bogota;Factura;Comisión;FE-1024;cufe-1;Emitido;Juan Pérez;gk-1;Colombia;7000;1330;19;8330;COP;;');
    expect(second).toBe('2026-10-14 05:00;America/Bogota;Factura;Comisión;;;Rechazado;Juan Pérez;gk-1;Colombia;7000;1330;19;8330;COP;La ciudad del portero no tiene códigos DANE;');
    expect(result.csv).not.toContain('1020304050');
    expect(result.csv).not.toContain('juan@x.co');
  });

  it('names the invoice a credit note corrects, and keeps unknown reasons, countries and originals as they are', async () => {
    const odd = buildDocument({
      id: 'odd-1',
      countryId: 'country-pe',
      status: 'rejected',
      createdAt: new Date('2026-10-14T11:00:00.000Z'),
      occurredAt: new Date('2026-10-14T11:00:00.000Z'),
      lastError: { kind: 'rejected', code: 'weird', message: 'Campo inválido', at: new Date('2026-10-14T11:01:00.000Z') },
    });
    const orphanNote = buildDocument({ id: 'nc-2', kind: 'credit_note', originalDocumentId: 'gone', createdAt: new Date('2026-10-14T12:00:00.000Z'), occurredAt: new Date('2026-10-14T12:00:00.000Z') });
    const { deps } = setup(issued, note, odd, orphanNote);

    const result = await new ExportDocumentsQueryHandler(deps).handle(new ExportDocumentsQuery({}));

    if (result.outcome !== 'ok') throw new Error(result.outcome);
    const lines = result.csv.replace('\uFEFF', '').split('\r\n');
    expect(lines[2]).toMatch(/;FE-1024$/);
    expect(lines[3]).toContain(';;7000;');
    expect(lines[3]).toContain(';Campo inválido;');
    expect(lines[4]).toMatch(/;gone$/);
  });
});
