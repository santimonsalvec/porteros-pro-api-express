/** Where an audit log page ended: the last entry seen, by time and then id (both descending). */
export interface AuditPosition {
  at: Date;
  id: string;
}

/**
 * The opaque cursor of the audit log (spec 002, research §3): base64url of `<at ISO>|<id>`. Stable
 * however many entries arrive meanwhile, and fast at any depth, unlike page numbers.
 */
export function encodeAuditCursor(position: AuditPosition): string {
  return Buffer.from(`${position.at.toISOString()}|${position.id}`, 'utf8').toString('base64url');
}

/** The position in a cursor, or null when it is not one. */
export function decodeAuditCursor(cursor: string): AuditPosition | null {
  if (!/^[A-Za-z0-9_-]+$/.test(cursor)) return null;
  const text = Buffer.from(cursor, 'base64url').toString('utf8');
  const separator = text.indexOf('|');
  if (separator === -1) return null;
  const at = new Date(text.slice(0, separator));
  const id = text.slice(separator + 1);
  if (Number.isNaN(at.getTime()) || id === '') return null;
  return { at, id };
}
