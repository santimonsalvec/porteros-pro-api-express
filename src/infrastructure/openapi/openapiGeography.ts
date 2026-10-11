/**
 * The admin web's geography and catalog endpoints (spec 003 of the admin), for `openapiSpec.ts`.
 * Bodies and answers are described in `contracts/geography-api.md` of porteros-pro-admin.
 */

const json = (description: string) => ({ description, content: { 'application/json': { schema: { type: 'object' } } } });
const error = (description: string) => ({ description, content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } });
const validation = (description = '`validation_failed`, with `fieldErrors`') => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
});
const COMMON = { '401': { description: 'No admin session' }, '403': error('`forbidden`: the role lacks the permission') };
const body = (description: string) => ({ required: true, content: { 'application/json': { schema: { type: 'object', description } } } });
const pathId = (name: string) => [{ name, in: 'path', required: true, schema: { type: 'string' } }];
const pageParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
];
const query = (...names: string[]) => names.map((name) => ({ name, in: 'query', schema: { type: 'string' } }));
const WRITE_CONFLICTS = '`stale_revision` (another edit saved first) or `warnings_unacknowledged` (send again with `acknowledgeWarnings: true`)';

interface ResourceDoc {
  path: string;
  idName: string;
  tag: string;
  noun: string;
  read: string;
  write: string;
  listQuery: string[];
  createBody: string;
  updateBody: string;
  conflicts: string;
  /** Null when the resource is never deleted. */
  deleteConflicts: string | null;
  notFound: string;
}

/** List, read, create, edit and delete of one reference resource. */
function crud(doc: ResourceDoc) {
  const security = [{ adminBearerAuth: [] }];
  const tags = [doc.tag];
  return {
    [doc.path]: {
      get: {
        summary: `${doc.noun}: one page (${doc.read})`,
        tags,
        security,
        parameters: [...query(...doc.listQuery), ...pageParams],
        responses: { '200': json('`{ items, page, pageSize, totalItems, totalPages }`'), '400': validation(), ...COMMON },
      },
      post: {
        summary: `Creates one (${doc.write}); audited`,
        tags,
        security,
        requestBody: body(doc.createBody),
        responses: { '201': json('The created record'), '400': validation(), ...COMMON, '409': error(`${doc.conflicts} or \`warnings_unacknowledged\``) },
      },
    },
    [`${doc.path}/{${doc.idName}}`]: {
      get: {
        summary: `One (${doc.read})`,
        tags,
        security,
        parameters: pathId(doc.idName),
        responses: { '200': json('The record'), ...COMMON, '404': error(`\`${doc.notFound}\``) },
      },
      patch: {
        summary: `Edits one with the \`revision\` read (${doc.write}); audited`,
        tags,
        security,
        parameters: pathId(doc.idName),
        requestBody: body(doc.updateBody),
        responses: {
          '200': json('The record, with its new revision'),
          '400': validation(),
          ...COMMON,
          '404': error(`\`${doc.notFound}\``),
          '409': error(`${WRITE_CONFLICTS}; ${doc.conflicts}`),
        },
      },
    },
    ...(doc.deleteConflicts === null ? {} : deletePath(doc, security, tags, doc.deleteConflicts)),
  };
}

function deletePath(doc: ResourceDoc, security: object[], tags: string[], conflicts: string) {
  return {
    [`${doc.path}/{${doc.idName}}/delete`]: {
      post: {
        summary: `Deletes one nothing points at (${doc.write}); the reason goes to the audit log`,
        tags,
        security,
        parameters: pathId(doc.idName),
        requestBody: body('`{ reason }` of 3–300 characters'),
        responses: { '204': { description: 'Deleted' }, '400': validation('`validation_failed`: reason missing'), ...COMMON, '404': error(`\`${doc.notFound}\``), '409': error(conflicts) },
      },
    },
  };
}

export const geographyPaths = {
  ...crud({
    path: '/admin/countries',
    idName: 'countryId',
    tag: 'Admin geography',
    noun: 'Countries',
    read: 'geography.read',
    write: 'geography.manage',
    listQuery: ['q'],
    createBody: '`{ name, countryCode, dialCode, currency? }`',
    updateBody: '`{ revision, name?, countryCode?, dialCode?, currency?, acknowledgeWarnings? }`',
    conflicts: '`country_code_taken` or `currency_locked`',
    // A country is never deleted.
    deleteConflicts: null,
    notFound: 'country_not_found',
  }),
  ...crud({
    path: '/admin/regions',
    idName: 'regionId',
    tag: 'Admin geography',
    noun: 'Regions',
    read: 'geography.read',
    write: 'geography.manage',
    listQuery: ['countryId', 'q'],
    createBody: '`{ name, countryId }`',
    updateBody: '`{ revision, name?, countryId? }`',
    conflicts: 'none besides the revision',
    deleteConflicts: '`region_has_cities`',
    notFound: 'region_not_found',
  }),
  ...crud({
    path: '/admin/cities',
    idName: 'cityId',
    tag: 'Admin geography',
    noun: 'Cities, with their state (`operating`/`available`) and readiness',
    read: 'geography.read',
    write: 'geography.manage',
    listQuery: ['countryId', 'regionId', 'q', 'anchor', 'state'],
    createBody: '`{ name, regionId, timeZone?, zoneCityId?, daneStateCode?, daneCityCode? }`',
    updateBody: '`{ revision, …the create fields, acknowledgeWarnings? }`',
    conflicts: '`city_has_zones`',
    deleteConflicts: '`city_has_zones`, `city_is_anchor` or `city_in_use`',
    notFound: 'city_not_found',
  }),
  ...crud({
    path: '/admin/zones',
    idName: 'zoneId',
    tag: 'Admin geography',
    noun: "An anchor city's zones, all of them, without polygons (`cityId` required; not paged)",
    read: 'geography.read',
    write: 'geography.manage',
    listQuery: ['cityId'],
    createBody: '`{ cityId, name, slug, geometry, active, displayOrder, acknowledgeWarnings? }`; an invalid polygon answers 400 with `geometryErrors`',
    updateBody: '`{ revision, name?, slug?, geometry?, active?, displayOrder?, reason?, acknowledgeWarnings? }`; `reason` to deactivate or to redraw a zone in use',
    conflicts: '`zone_slug_taken` or `zone_city_not_anchor`',
    deleteConflicts: '`zone_in_use`',
    notFound: 'zone_not_found',
  }),
  '/admin/zones/shapes': {
    get: {
      summary: "An anchor city's polygons, simplified (~6 m) for the map, with `geometryValid` (geography.read). The list `/admin/zones` carries none",
      tags: ['Admin geography'],
      security: [{ adminBearerAuth: [] }],
      parameters: query('cityId'),
      responses: { '200': json('`{ items: [{ id, name, active, geometry, geometryValid }] }`'), '400': validation(), ...COMMON, '404': error('`city_not_found`'), '409': error('`zone_city_not_anchor`') },
    },
  },
  '/admin/zones/validate': {
    post: {
      summary: 'Checks a polygon without saving nor auditing it (geography.manage)',
      tags: ['Admin geography'],
      security: [{ adminBearerAuth: [] }],
      requestBody: body('`{ cityId, geometry, zoneId?, displayOrder? }`'),
      responses: { '200': json('`{ errors, warnings }`'), '400': validation(), ...COMMON, '404': error('`city_not_found`'), '409': error('`zone_city_not_anchor`') },
    },
  },
  '/admin/time-zones': {
    get: {
      summary: "The runtime's IANA time zones a city may be saved with (geography.read)",
      tags: ['Admin geography'],
      security: [{ adminBearerAuth: [] }],
      responses: { '200': json('`{ timeZones }`, cacheable for a day'), ...COMMON },
    },
  },
  '/admin/readiness': {
    get: {
      summary: "What a country (dashboard) or a city still needs to quote (geography.read); exactly one of `countryId` and `cityId`",
      tags: ['Admin geography'],
      security: [{ adminBearerAuth: [] }],
      parameters: query('countryId', 'cityId'),
      responses: { '200': json('A country dashboard or a city checklist'), '400': validation(), ...COMMON, '404': error('`country_not_found` or `city_not_found`') },
    },
  },
  ...crud({
    path: '/admin/document-types',
    idName: 'documentTypeId',
    tag: 'Admin catalogs',
    noun: 'Document types, with `invoiceable` and `inUse`',
    read: 'geography.read',
    write: 'catalogs.manage',
    listQuery: ['q'],
    createBody: '`{ code, name, acknowledgeWarnings? }`',
    updateBody: '`{ revision, code?, name?, acknowledgeWarnings? }`',
    conflicts: '`document_type_code_taken` or `document_type_code_in_use`',
    deleteConflicts: '`document_type_in_use`',
    notFound: 'document_type_not_found',
  }),
  ...crud({
    path: '/admin/match-surfaces',
    idName: 'surfaceId',
    tag: 'Admin catalogs',
    noun: 'Playing surfaces, by order',
    read: 'geography.read',
    write: 'catalogs.manage',
    listQuery: ['active'],
    createBody: '`{ name, active, order }`',
    updateBody: '`{ revision, name?, active?, order?, reason? }`; `reason` to deactivate',
    conflicts: 'none besides the revision',
    deleteConflicts: '`surface_in_use`',
    notFound: 'surface_not_found',
  }),
};
