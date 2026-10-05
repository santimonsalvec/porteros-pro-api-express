import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ListGoalkeeperAgendaQuery } from '../../../../../src/application/features/goalkeeperRequests/queries/listGoalkeeperAgenda/listGoalkeeperAgendaQuery.js';
import { ListGoalkeeperAgendaQueryHandler } from '../../../../../src/application/features/goalkeeperRequests/queries/listGoalkeeperAgenda/listGoalkeeperAgendaQueryHandler.js';
import { GoalkeeperBookingHarness, inHours } from './goalkeeperBookingHarness.js';
import { CHECK_IN_DEFAULTS } from '../../../../../src/domain/bookings/checkInWindow.js';

let h: GoalkeeperBookingHarness;
let handler: ListGoalkeeperAgendaQueryHandler;

beforeEach(() => {
  h = new GoalkeeperBookingHarness();
  handler = new ListGoalkeeperAgendaQueryHandler({
    windowResolver: () => async () => CHECK_IN_DEFAULTS,
    goalkeeperProfileRepository: h.profiles,
    bookingRepository: h.bookings,
    requestRepository: h.requests,
    zoneRepository: h.zones,
    cityRepository: h.cities,
    userRepository: h.users,
    clock: h.clock,
  });
});

const agenda = (goalkeeperId = 'gk-1', page = 1, pageSize = 20) =>
  handler.handle(new ListGoalkeeperAgendaQuery(goalkeeperId, page, pageSize));
const requestIds = async (page = 1, pageSize = 20) => {
  const result = await agenda('gk-1', page, pageSize);
  return result.outcome === 'success' ? result.items.map((item) => item.requestId) : [];
};

/** A 1-goalkeeper request `id` starting `hours` from now, taken by `goalkeeperId`. */
function held(id: string, hours: number, goalkeeperId = 'gk-1') {
  const { bookings } = h.seedRequest(id, inHours(hours), { goalkeeperCount: 1 });
  return h.assign(bookings[0]!, goalkeeperId);
}

describe('ListGoalkeeperAgendaQueryHandler — US6: the goalkeeper\'s agenda', () => {
  it('shows upcoming bookings soonest first, then past ones most recent first', async () => {
    held('in-5-days', 5 * 24);
    held('3-days-ago', -3 * 24);
    held('tomorrow', 24);
    held('yesterday', -24);

    expect(await requestIds()).toEqual(['tomorrow', 'in-5-days', 'yesterday', '3-days-ago']);
  });

  it('pages across the upcoming/past boundary with exact totals', async () => {
    held('tomorrow', 24);
    held('in-5-days', 5 * 24);
    held('yesterday', -24);

    expect(await requestIds(1, 2)).toEqual(['tomorrow', 'in-5-days']);
    expect(await requestIds(2, 2)).toEqual(['yesterday']);
    expect(await agenda('gk-1', 2, 2)).toMatchObject({ totalItems: 3, totalPages: 2 });
  });

  it('shows the pitch, the status and, in the last hour, the client\'s contact, and nothing else about the client', async () => {
    const booking = held('in-half-hour', 0.5);

    const result = await agenda();

    expect(result.outcome === 'success' && result.items[0]).toMatchObject({
      bookingId: booking.id,
      status: 'assigned',
      assignedAt: h.clock.now().toISOString(),
      latitude: expect.any(Number),
      longitude: expect.any(Number),
      zoneName: 'Norte',
      cityName: 'Cali',
      earnings: 60000,
      commission: 7000,
      client: { firstName: 'Ana', lastName: 'Cliente', whatsApp: '+57 300 111 2222' },
      clientContactVisibleFrom: new Date(inHours(0.5).getTime() - 3_600_000).toISOString(),
    });
    expect(JSON.stringify(result)).not.toMatch(/@example\.com/);
  });

  it('gives each match its check-in window, from 30 minutes before to 15 after the start (feature 020)', async () => {
    held('tomorrow', 24);

    const result = await agenda();

    const start = inHours(24).getTime();
    expect(result.outcome === 'success' && result.items[0]).toMatchObject({
      checkInOpensAt: new Date(start - 30 * 60_000).toISOString(),
      checkInClosesAt: new Date(start + 15 * 60_000).toISOString(),
    });
  });

  it("hides the client's contact until one hour before the match (feature 019)", async () => {
    held('tomorrow', 24);

    const result = await agenda();

    expect(result.outcome === 'success' && result.items[0]).toMatchObject({
      client: null,
      clientContactVisibleFrom: inHours(23).toISOString(),
    });
  });

  it("never shows another goalkeeper's bookings, nor pending ones", async () => {
    h.addGoalkeeper('gk-2');
    held('mine', 24);
    held('theirs', 30, 'gk-2');
    h.seedRequest('open', inHours(40), { goalkeeperCount: 1 });

    expect(await requestIds()).toEqual(['mine']);
  });

  it('answers an empty page for a goalkeeper with no bookings, reading no users', async () => {
    const getByIds = vi.spyOn(h.users, 'getByIds');

    expect(await agenda()).toEqual({ outcome: 'success', items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
    expect(getByIds).not.toHaveBeenCalled();
  });

  it('refuses a user who is not an active goalkeeper', async () => {
    expect(await agenda('client-a')).toEqual({ outcome: 'not_a_goalkeeper' });
  });
});
