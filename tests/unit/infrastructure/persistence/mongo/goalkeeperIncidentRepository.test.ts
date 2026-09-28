import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { GoalkeeperIncident } from '../../../../../src/domain/goalkeepers/goalkeeperIncident.js';
import {
  GoalkeeperIncidentRepository,
  incidentFromDocument,
  incidentToDocument,
} from '../../../../../src/infrastructure/persistence/mongo/goalkeeperIncidentRepository.js';
import { createFakeCollection, toArrayCursor } from '../../../../fakes/fakeMongoCollection.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new GoalkeeperIncidentRepository(db);
}

const at = new Date('2026-09-21T18:30:00.000Z');
const decision = { by: 'admin-1', at, reason: 'Incapacidad médica' };
const incident = GoalkeeperIncident.rehydrate({
  id: 'w-1',
  kind: 'withdrawal',
  goalkeeperId: 'gk-1',
  bookingId: 'b-1',
  requestId: 'r-1',
  startsAt: new Date('2026-09-21T20:00:00.000Z'),
  occurredAt: at,
  noticeMinutes: 90,
  late: true,
  reason: 'Me enfermé',
  replacementBookingId: 'b-2',
  penalties: [{ id: 'p-1', kind: 'late', days: 3, startsAt: at, endsAt: new Date('2026-09-24T18:30:00.000Z'), reversal: decision }],
  moneyReversal: { ...decision, amount: 7000, currency: 'COP' },
  forgivenAt: at,
});

describe('GoalkeeperIncidentRepository (mocked driver)', () => {
  it('maps an incident to its document and back', () => {
    const doc = incidentToDocument(incident);

    expect(doc).toMatchObject({ _id: 'w-1', kind: 'withdrawal', goalkeeperId: 'gk-1', bookingId: 'b-1', noticeMinutes: 90, late: true });
    expect(incidentFromDocument(doc)).toEqual(incident);
  });

  it('reads absent optional fields as empty', () => {
    const bare = incidentToDocument(incident);
    for (const field of ['penalties', 'moneyReversal', 'forgivenAt', 'reason', 'replacementBookingId']) delete bare[field];
    const read = incidentFromDocument(bare);

    expect(read).toMatchObject({ penalties: [], moneyReversal: null, forgivenAt: null, reason: null, replacementBookingId: null });
  });

  it('creates the history and uniqueness indexes', async () => {
    const collection = createFakeCollection();

    await repositoryWith(collection).ensureIndexes();

    expect(collection.createIndex).toHaveBeenCalledWith({ goalkeeperId: 1, occurredAt: -1, _id: -1 }, { name: 'goalkeeper_occurred' });
    expect(collection.createIndex).toHaveBeenCalledWith({ kind: 1, bookingId: 1 }, { name: 'kind_booking_unique', unique: true });
  });

  it("lists a goalkeeper's incidents newest first, paged", async () => {
    const collection = createFakeCollection();
    const cursor = toArrayCursor([incidentToDocument(incident)]);
    collection.find.mockReturnValue(cursor);
    collection.countDocuments.mockResolvedValue(1);
    const repository = repositoryWith(collection);

    expect(await repository.listForGoalkeeper('gk-1', 20, 10)).toEqual([incident]);
    expect(collection.find).toHaveBeenCalledWith({ goalkeeperId: 'gk-1' });
    expect(cursor.sort).toHaveBeenCalledWith({ occurredAt: -1, _id: -1 });
    expect(cursor.skip).toHaveBeenCalledWith(20);
    expect(cursor.limit).toHaveBeenCalledWith(10);
    expect(await repository.countForGoalkeeper('gk-1')).toBe(1);
  });
});
