import type { MatchFormat, Modality } from '../../../../domain/bookings/matchFormat.js';

/** How a match's format is serialized everywhere (contract §0 of feature 024). */
export interface MatchFormatResponse {
  modality: Modality;
  surface: { id: string; name: string };
}

export function matchFormatResponse(format: MatchFormat): MatchFormatResponse {
  return { modality: format.modality, surface: { id: format.surfaceId, name: format.surfaceName } };
}

/** `null` for requests created before feature 024. */
export function toMatchFormatResponse(format: MatchFormat | null): MatchFormatResponse | null {
  return format === null ? null : matchFormatResponse(format);
}
