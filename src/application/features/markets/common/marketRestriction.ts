/**
 * The markets a list keeps (spec 031, FR-042): those it selected (`undefined` = all), within those
 * the member holds (`undefined` = all of them).
 */
export function withinAllowed(selected: readonly string[] | undefined, allowed: readonly string[] | undefined): string[] | undefined {
  if (!allowed) return selected ? [...selected] : undefined;
  return (selected ?? allowed).filter((id) => allowed.includes(id));
}
