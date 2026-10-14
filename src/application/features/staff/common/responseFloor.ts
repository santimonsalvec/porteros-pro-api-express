/** Measures a request and waits, so answers never come back sooner than a floor (admin spec 009, research §7). */
export interface IResponseTimer {
  /** Starts a stopwatch; calling the result gives the milliseconds since. */
  stopwatch(): () => number;
  sleep(ms: number): Promise<void>;
}

export const realResponseTimer: IResponseTimer = {
  stopwatch: () => {
    const started = performance.now();
    return () => performance.now() - started;
  },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** Runs `work` and answers no sooner than `minMs` after it started. */
export async function withResponseFloor<T>(timer: IResponseTimer, minMs: number, work: () => Promise<T>): Promise<T> {
  const elapsed = timer.stopwatch();
  try {
    return await work();
  } finally {
    const remaining = minMs - elapsed();
    if (remaining > 0) await timer.sleep(remaining);
  }
}
