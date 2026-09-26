import { describe, expect, it } from 'vitest';
import { pageWindow } from '../../../../../src/application/features/goalkeeperRequests/common/pageWindow.js';

/** `page` is 1-based, as in the API; the function takes the offset. */
const windowFor = (page: number, size: number, upcoming: number, past: number) =>
  pageWindow((page - 1) * size, size, upcoming, past);

describe('pageWindow', () => {
  it('splits a page straddling the boundary into the upcoming tail and the past head', () => {
    expect(windowFor(1, 20, 3, 42)).toEqual({ upcoming: { skip: 0, limit: 3 }, past: { skip: 0, limit: 17 } });
  });

  it('continues the past segment exactly where the previous page ended', () => {
    expect(windowFor(2, 20, 3, 42)).toEqual({ upcoming: null, past: { skip: 17, limit: 20 } });
    expect(windowFor(3, 20, 3, 42)).toEqual({ upcoming: null, past: { skip: 37, limit: 20 } });
  });

  it('queries nothing for a page past the end', () => {
    expect(windowFor(4, 20, 3, 42)).toEqual({ upcoming: null, past: null });
  });

  it('stays in the upcoming segment when there are no past bookings', () => {
    expect(windowFor(2, 20, 25, 0)).toEqual({ upcoming: { skip: 20, limit: 5 }, past: null });
  });

  it('queries nothing when the client has no bookings', () => {
    expect(windowFor(1, 20, 0, 0)).toEqual({ upcoming: null, past: null });
  });

  it('starts the past segment at 0 when a page begins exactly at the boundary', () => {
    expect(windowFor(1, 20, 20, 5)).toEqual({ upcoming: { skip: 0, limit: 20 }, past: null });
    expect(windowFor(2, 20, 20, 5)).toEqual({ upcoming: null, past: { skip: 0, limit: 20 } });
  });

  it('crosses the boundary one item at a time with page size 1', () => {
    expect(windowFor(1, 1, 1, 2)).toEqual({ upcoming: { skip: 0, limit: 1 }, past: null });
    expect(windowFor(2, 1, 1, 2)).toEqual({ upcoming: null, past: { skip: 0, limit: 1 } });
    expect(windowFor(3, 1, 1, 2)).toEqual({ upcoming: null, past: { skip: 1, limit: 1 } });
  });

  it('reads only the past segment when nothing is upcoming', () => {
    expect(windowFor(1, 20, 0, 7)).toEqual({ upcoming: null, past: { skip: 0, limit: 20 } });
  });
});
