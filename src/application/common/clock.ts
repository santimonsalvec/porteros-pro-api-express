/**
 * The current moment, injected so rules that depend on "now" (past, minimum notice,
 * booking window, surcharge tier) can be tested at exact boundaries.
 */
export interface IClock {
  now(): Date;
}
