/** The game modalities a client can choose; `any` leaves the modality open (feature 024). */
export const MODALITIES = ['micro_futsal', 'futbol_medio', 'futbol_11', 'any'] as const;
export type Modality = (typeof MODALITIES)[number];

/** The modalities a rate or commission can be configured for: `any` is never stored. */
export const PRICED_MODALITIES = ['micro_futsal', 'futbol_medio', 'futbol_11'] as const;
export type PricedModality = (typeof PRICED_MODALITIES)[number];

export function isModality(value: unknown): value is Modality {
  return typeof value === 'string' && (MODALITIES as readonly string[]).includes(value);
}

export function isPricedModality(value: unknown): value is PricedModality {
  return typeof value === 'string' && (PRICED_MODALITIES as readonly string[]).includes(value);
}

/**
 * What kind of match the client asked for. The surface name is a snapshot taken when the quote
 * was issued, so renaming or deactivating a surface never changes an existing request.
 */
export class MatchFormat {
  readonly modality: Modality;
  readonly surfaceId: string;
  readonly surfaceName: string;

  constructor(params: { modality: string; surfaceId: string; surfaceName: string }) {
    if (!isModality(params.modality)) throw new Error(`MatchFormat: unknown modality '${params.modality}'`);
    for (const key of ['surfaceId', 'surfaceName'] as const) {
      if (typeof params[key] !== 'string' || params[key].trim() === '') {
        throw new Error(`MatchFormat: ${key} is required`);
      }
    }
    this.modality = params.modality;
    this.surfaceId = params.surfaceId;
    this.surfaceName = params.surfaceName;
  }
}
