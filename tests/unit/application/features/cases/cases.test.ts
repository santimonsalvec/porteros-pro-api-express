import { describe, expect, it } from 'vitest';
import { closeHarness } from '../bookingLifecycle/closeHarness.js';

describe('cases — US4 (feature 021)', () => {
  it('opens one "goalkeeper didn’t come" case with the no-show on the client’s "no"', async () => {
    const h = await closeHarness();
    await h.close();

    await h.rate(h.booking.id, 'client-a', false, 1);

    const [item] = h.store.cases.all();
    expect(item).toMatchObject({ type: 'goalkeeper_no_show', status: 'open', bookingId: h.booking.id, clientId: 'client-a', goalkeeperId: 'g', checkIn: null });
    expect(item!.noShowIncidentId).toBe(h.store.incidents()[0]!.id);
  });

  it('opens a case without penalty when the goalkeeper had checked in', async () => {
    const h = await closeHarness();
    await h.checkInNow();
    await h.close();

    await h.rate(h.booking.id, 'client-a', false, 1);

    expect(h.store.cases.all()).toMatchObject([{ type: 'goalkeeper_no_show', noShowIncidentId: null, checkIn: { photoUrl: expect.any(String) } }]);
    expect(h.store.incidents()).toHaveLength(0);
  });

  it('opens "payment not received" on the goalkeeper’s "no", and a late claim on a "yes" after a no-show', async () => {
    const h = await closeHarness();
    await h.close();
    await h.rate(h.booking.id, 'g', false, 2);
    h.at(60);
    await h.settle();
    await h.rate(h.booking.id, 'client-a', true, 5);

    expect(h.store.cases.all().map((item) => item.type).sort()).toEqual(['late_attendance_claim', 'payment_not_received']);
    expect(h.current(h.booking.id).attendance).toBe('no_show');
  });

  it('lists open first and resolves once with a note', async () => {
    const h = await closeHarness();
    await h.close();
    await h.rate(h.booking.id, 'client-a', false, 1);
    await h.rate(h.booking.id, 'g', false, 1);
    const [first, second] = h.store.cases.all();

    expect(await h.resolveCase(first!.id, 'no')).toMatchObject({ outcome: 'invalid_note' });
    expect(await h.resolveCase(first!.id, 'Se habló con ambas partes')).toMatchObject({
      outcome: 'resolved',
      case: { status: 'resolved', resolution: { by: 'admin-1', note: 'Se habló con ambas partes' }, rating: { answer: false } },
    });
    expect(await h.resolveCase(first!.id, 'Otra vez')).toEqual({ outcome: 'case_already_resolved' });
    expect(await h.resolveCase('missing', 'Nota válida')).toEqual({ outcome: 'case_not_found' });

    const listed = await h.listCases();
    expect(listed.items.map((item) => item.caseId)).toEqual([second!.id, first!.id]);
    expect((await h.listCases('open')).totalItems).toBe(1);
  });
});
