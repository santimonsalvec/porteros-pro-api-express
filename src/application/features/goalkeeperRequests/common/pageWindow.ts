/** Which part of each segment a page covers; `null` means that segment is not queried. */
export interface PageWindow {
  upcoming: { skip: number; limit: number } | null;
  past: { skip: number; limit: number } | null;
}

/**
 * Splits the page `[offset, offset + pageSize)` of the list `upcoming ++ past` into a slice of
 * each segment (research.md §1). A page straddling the boundary takes the tail of the upcoming
 * segment and the head of the past one; a page past the end takes nothing.
 */
export function pageWindow(offset: number, pageSize: number, upcomingCount: number, pastCount: number): PageWindow {
  const upcoming =
    offset < upcomingCount ? { skip: offset, limit: Math.min(pageSize, upcomingCount - offset) } : null;

  const pastSkip = Math.max(0, offset - upcomingCount);
  const pastLimit = pageSize - (upcoming?.limit ?? 0);
  const past = pastLimit > 0 && pastSkip < pastCount ? { skip: pastSkip, limit: pastLimit } : null;

  return { upcoming, past };
}
