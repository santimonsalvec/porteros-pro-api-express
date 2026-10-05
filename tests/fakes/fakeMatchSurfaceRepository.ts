import type { IMatchSurfaceRepository } from '../../src/application/features/goalkeeperRequests/common/ports.js';
import { MatchSurface } from '../../src/domain/pricing/matchSurface.js';

/** The five default surfaces of `scripts/seed-match-surfaces.ts`. */
export const DEFAULT_TEST_SURFACES = [
  new MatchSurface({ id: 'synthetic_grass', name: 'Grama sintética', active: true, order: 1 }),
  new MatchSurface({ id: 'natural_grass', name: 'Grama natural', active: true, order: 2 }),
  new MatchSurface({ id: 'hard_court', name: 'Asfalto/Placa', active: true, order: 3 }),
  new MatchSurface({ id: 'wood', name: 'Madera', active: true, order: 4 }),
  new MatchSurface({ id: 'dirt', name: 'Arena', active: true, order: 5 }),
];

export class FakeMatchSurfaceRepository implements IMatchSurfaceRepository {
  private readonly surfaces: MatchSurface[];

  constructor(surfaces: MatchSurface[] = DEFAULT_TEST_SURFACES) {
    this.surfaces = [...surfaces];
  }

  seed(surface: MatchSurface): void {
    const index = this.surfaces.findIndex((existing) => existing.id === surface.id);
    if (index >= 0) this.surfaces.splice(index, 1);
    this.surfaces.push(surface);
  }

  async listActive(): Promise<MatchSurface[]> {
    return this.surfaces
      .filter((surface) => surface.active)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }

  async findById(id: string): Promise<MatchSurface | null> {
    return this.surfaces.find((surface) => surface.id === id) ?? null;
  }
}
