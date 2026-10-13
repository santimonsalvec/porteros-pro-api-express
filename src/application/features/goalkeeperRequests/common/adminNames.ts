import { userName } from '../../users/common/userViewing.js';
import type { RequestsAdminDependencies } from './requestsAdminDependencies.js';
import type { PersonRef, PlaceRef } from './adminViews.js';

/** Users by id, as `{ userId, name }`; an unknown user keeps its id with no name. */
export async function personNames(deps: Pick<RequestsAdminDependencies, 'users'>, ids: readonly string[]): Promise<(id: string) => PersonRef> {
  const unique = [...new Set(ids)];
  const users = unique.length > 0 ? await deps.users.getByIds(unique) : [];
  const byId = new Map(users.map((user) => [user.id, userName(user)]));
  return (id) => ({ userId: id, name: byId.get(id) ?? null });
}

/** Cities and zones by id, as `{ id, name }`. */
export async function placeNames(
  deps: Pick<RequestsAdminDependencies, 'cities' | 'zones'>,
  cityIds: readonly string[],
  zoneIds: readonly string[],
): Promise<{ city: (id: string) => PlaceRef; zone: (id: string) => PlaceRef }> {
  const [cities, zones] = await Promise.all([
    cityIds.length > 0 ? deps.cities.getByIds([...new Set(cityIds)]) : [],
    zoneIds.length > 0 ? deps.zones.getManyByIds([...new Set(zoneIds)]) : [],
  ]);
  const cityNames = new Map(cities.map((city) => [city.id, city.name]));
  const zoneNames = new Map(zones.map((zone) => [zone.id, zone.name]));
  return {
    city: (id) => ({ id, name: cityNames.get(id) ?? null }),
    zone: (id) => ({ id, name: zoneNames.get(id) ?? null }),
  };
}
