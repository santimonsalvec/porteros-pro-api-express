/** Hand-written OpenAPI 3.0 document mirroring specs/001-porteros-api-migration/contracts/. */
export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'PorterosPRO API',
    version: '1.0.0',
    description:
      'Express + TypeScript port of SMC.PorterosPRO.Backend. See specs/001-porteros-api-migration/ for the full specification.',
  },
  servers: [{ url: '/' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: { error: { type: 'string' }, message: { type: 'string' } },
        required: ['error', 'message'],
      },
      ValidationErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' },
          fieldErrors: { type: 'object', additionalProperties: { type: 'string' } },
        },
        required: ['error', 'message', 'fieldErrors'],
      },
      BookingConfigResponse: {
        type: 'object',
        description: 'What a client may pick for a pitch, so an app can build its selectors without hardcoding limits or using the phone\u2019s clock.',
        properties: {
          timeZone: { type: 'string', example: 'America/Bogota' },
          now: { type: 'string', example: '2026-09-21T13:00:00-05:00', description: 'Server time in the city\u2019s local time, with its offset' },
          bookingWindowDays: { type: 'integer', example: 2, description: 'Today plus the next N-1 local calendar days' },
          availableDates: { type: 'array', items: { type: 'string' }, example: ['2026-09-21', '2026-09-22'], description: 'Bookable local dates (YYYY-MM-DD), starting today' },
          minNoticeMinutes: { type: 'integer', example: 30 },
          slotStepMinutes: { type: 'integer', example: 30, description: 'Start times sit on multiples of this many minutes (local :00 and :30)' },
          earliestStartsAt: {
            type: 'string',
            nullable: true,
            example: '2026-09-21T13:30:00-05:00',
            description: 'The soonest start a quote accepts right now (now + minimum notice, rounded up to the next slot mark). null when nothing can be booked at the moment',
          },
          goalkeeperCount: { type: 'object', properties: { min: { type: 'integer', example: 1 }, max: { type: 'integer', example: 2 } } },
          durationOptions: { type: 'array', items: { type: 'integer' }, example: [60, 90, 120] },
          currency: { type: 'string', example: 'COP', description: 'The country\u2019s currency; every quote amount is in it' },
        },
        required: ['timeZone', 'now', 'bookingWindowDays', 'availableDates', 'minNoticeMinutes', 'slotStepMinutes', 'earliestStartsAt', 'goalkeeperCount', 'durationOptions', 'currency'],
      },
      ServiceQuoteRequest: {
        type: 'object',
        properties: {
          latitude: { type: 'number', minimum: -90, maximum: 90, example: 3.45 },
          longitude: { type: 'number', minimum: -180, maximum: 180, example: -76.5 },
          startsAt: {
            type: 'string',
            example: '2026-09-21T15:00:00',
            description:
              'ISO-8601 date-time. With an offset (Z or ±HH:mm) it is converted to that instant; WITHOUT an offset it is read as local time in the city where the location is (never the caller\u2019s or the server\u2019s). Must fall exactly on a local :00 or :30 with zero seconds.',
          },
          goalkeeperCount: { type: 'integer', enum: [1, 2] },
          durationMinutes: { type: 'integer', enum: [60, 90, 120] },
        },
        required: ['latitude', 'longitude', 'startsAt', 'goalkeeperCount', 'durationMinutes'],
      },
      ServiceQuoteResponse: {
        type: 'object',
        description: 'Amounts are integers in whole units of the country\u2019s currency.',
        properties: {
          unitRate: { type: 'integer', example: 55000, description: 'Price per goalkeeper (zone rate, else city rate)' },
          goalkeeperCount: { type: 'integer', enum: [1, 2] },
          subtotal: { type: 'integer', example: 110000, description: 'unitRate x goalkeeperCount' },
          surcharge: { type: 'integer', example: 5000, description: 'Lead-time surcharge; 0 when none applies' },
          total: { type: 'integer', example: 115000, description: 'subtotal + surcharge' },
          currency: { type: 'string', example: 'COP', description: 'The currency of the country the location is in; every amount above is in it' },
          startsAt: { type: 'string', example: '2026-09-21T20:00:00.000Z', description: 'Resolved start instant, UTC' },
          startsAtLocal: { type: 'string', example: '2026-09-21T15:00:00-05:00', description: 'The same instant in the city\u2019s time zone' },
          timeZone: { type: 'string', example: 'America/Bogota' },
        },
        required: ['unitRate', 'goalkeeperCount', 'subtotal', 'surcharge', 'total', 'currency', 'startsAt', 'startsAtLocal', 'timeZone'],
      },
      TokenPairResponse: {
        type: 'object',
        properties: {
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
          expiresInSeconds: { type: 'integer' },
        },
        required: ['accessToken', 'refreshToken', 'expiresInSeconds'],
      },
      SsoOptionsResponse: {
        type: 'object',
        properties: {
          providers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                provider: { type: 'string' },
                clientId: { type: 'string' },
                scopes: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
      MeResponse: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          email: { type: 'string' },
          isAdmin: { type: 'boolean' },
          isProfileComplete: { type: 'boolean' },
        },
      },
      ClientProfileResponse: {
        type: 'object',
        properties: {
          firstName: { type: 'string', nullable: true },
          lastName: { type: 'string', nullable: true },
          email: { type: 'string' },
          countryCallingCode: { type: 'string', nullable: true },
          whatsAppNumber: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      StoredImageResponse: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          url: { type: 'string' },
          format: { type: 'string' },
          bytes: { type: 'integer' },
          width: { type: 'integer' },
          height: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'url', 'format', 'bytes', 'width', 'height', 'createdAt'],
      },
      CountriesResponse: {
        type: 'object',
        properties: {
          countries: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                countryCode: { type: 'string' },
                name: { type: 'string' },
                dialCode: { type: 'string' },
              },
            },
          },
        },
      },
      GoalkeeperRegistrationResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['not_started', 'in_progress', 'active'] },
          sections: {
            type: 'object',
            properties: {
              identification: { type: 'object', properties: { complete: { type: 'boolean' } } },
              physicalData: { type: 'object', properties: { complete: { type: 'boolean' } } },
              availability: { type: 'object', properties: { complete: { type: 'boolean' } } },
            },
          },
          documentType: { type: 'string', nullable: true },
          documentNumber: { type: 'string', nullable: true },
          issueDate: { type: 'string', format: 'date', nullable: true },
          birthDate: { type: 'string', format: 'date', nullable: true },
          documentPhotoASubmitted: { type: 'boolean' },
          documentPhotoBSubmitted: { type: 'boolean' },
          heightCm: { type: 'number', nullable: true },
          weightKg: { type: 'number', nullable: true },
          cityId: { type: 'string', nullable: true },
          serviceZoneIds: { type: 'array', items: { type: 'string' } },
          city: {
            type: 'object',
            nullable: true,
            description:
              'Display data for cityId (region is the region name). Only returned by GET /api/goalkeepers/me — null when no city is saved or it no longer resolves; omitted from the write endpoints.',
            properties: { id: { type: 'string' }, name: { type: 'string' }, region: { type: 'string' } },
          },
        },
      },
      CitiesResponse: {
        type: 'object',
        properties: {
          cities: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                region: { type: 'string' },
                hasZones: { type: 'boolean' },
              },
            },
          },
        },
      },
      ZonesResponse: {
        type: 'object',
        properties: {
          zones: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                slug: { type: 'string' },
                displayOrder: { type: 'number' },
                geometry: { type: 'object' },
              },
            },
          },
        },
      },
      DocumentTypesResponse: {
        type: 'object',
        properties: {
          documentTypes: {
            type: 'array',
            items: {
              type: 'object',
              properties: { code: { type: 'string' }, name: { type: 'string' } },
            },
          },
        },
      },
      HealthReportResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['Healthy', 'Degraded', 'Unhealthy'] },
          checks: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: { type: 'string' }, status: { type: 'string' } },
            },
          },
        },
      },
    },
  },
  paths: {
    '/api/auth/sso-options': {
      get: {
        summary: 'Discover available SSO providers for a platform',
        tags: ['Auth'],
        parameters: [
          {
            name: 'platform',
            in: 'query',
            required: true,
            schema: { type: 'string', enum: ['mobile', 'admin-web'] },
          },
        ],
        responses: {
          '200': {
            description: 'Providers available for the requested platform',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SsoOptionsResponse' } } },
          },
          '400': {
            description: 'Missing or unrecognized platform',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/api/auth/sso/exchange': {
      post: {
        summary: 'Exchange a Google credential for an internal session',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  provider: { type: 'string', example: 'google' },
                  platform: { type: 'string', enum: ['mobile', 'admin-web'] },
                  credential: { type: 'string' },
                },
                required: ['provider', 'platform', 'credential'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Session issued',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenPairResponse' } } },
          },
          '401': {
            description: 'Invalid credential',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
          '403': {
            description: 'No matching administrator account (admin-web only)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/api/auth/tokens/refresh': {
      post: {
        summary: 'Redeem a refresh token for a new session',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { refreshToken: { type: 'string' } },
                required: ['refreshToken'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'New session issued',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenPairResponse' } } },
          },
          '401': {
            description: 'Invalid, expired, or already-used refresh token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/api/auth/me': {
      get: {
        summary: 'Read the authenticated caller’s claims',
        tags: ['Auth'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Claims from the validated access token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/MeResponse' } } },
          },
          '401': { description: 'Missing or invalid access token' },
        },
      },
    },
    '/api/profile/complete': {
      post: {
        summary: 'Complete the mandatory mobile onboarding profile',
        tags: ['Profile'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  countryCode: { type: 'string', example: 'CO' },
                  whatsAppNumber: { type: 'string', example: '300 123 4567' },
                  acceptedTerms: { type: 'boolean' },
                },
                required: ['firstName', 'lastName', 'countryCode', 'whatsAppNumber', 'acceptedTerms'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Profile completed; fresh session returned',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenPairResponse' } } },
          },
          '400': {
            description: 'Validation failed or unrecognized country code',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
          },
          '409': {
            description: 'Duplicate phone number or profile already complete',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/api/clients/me': {
      get: {
        summary: 'View my own client profile',
        tags: ['Clients'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'The caller’s own profile',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ClientProfileResponse' } } },
          },
          '401': { description: 'Not signed in' },
          '403': { description: 'Caller is an administrator account' },
          '404': {
            description: 'Account no longer exists',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
      patch: {
        summary: 'Update my name and WhatsApp number',
        tags: ['Clients'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  countryCode: { type: 'string', example: 'CO' },
                  whatsAppNumber: { type: 'string', example: '301 987 6543' },
                },
                required: ['firstName', 'lastName', 'countryCode', 'whatsAppNumber'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated profile',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ClientProfileResponse' } } },
          },
          '400': {
            description: 'Validation failed or unrecognized country code',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
          },
          '401': { description: 'Not signed in' },
          '403': { description: 'Caller is an administrator, or profile is not complete' },
          '404': { description: 'Account no longer exists' },
          '409': { description: 'Duplicate phone number, or profile not complete (defense-in-depth)' },
        },
      },
    },
    '/api/images': {
      post: {
        summary: 'Upload and store an optimized image',
        tags: ['Images'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: { image: { type: 'string', format: 'binary' } },
                required: ['image'],
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Stored, provider-optimized image',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/StoredImageResponse' } } },
          },
          '400': {
            description: 'Missing file, or content is not a supported image',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
          '401': { description: 'Not signed in' },
          '413': {
            description: 'File exceeds the maximum allowed size',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
          '502': {
            description: 'Storage provider failure',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/api/images/{id}': {
      get: {
        summary: 'Resolve a stored image to its accessible location',
        tags: ['Images'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'The stored image',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/StoredImageResponse' } } },
          },
          '401': { description: 'Not signed in' },
          '403': {
            description: 'Caller did not upload this image',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
          '404': {
            description: 'Image does not exist',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
      delete: {
        summary: 'Permanently delete a stored image',
        tags: ['Images'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '204': { description: 'Deleted' },
          '401': { description: 'Not signed in' },
          '403': {
            description: 'Caller did not upload this image',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
          '404': {
            description: 'Image does not exist, or was already deleted',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/api/locations/countries': {
      get: {
        summary: 'Browse the public country reference catalog',
        tags: ['Locations'],
        responses: {
          '200': {
            description: 'Full country catalog',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CountriesResponse' } } },
          },
        },
      },
    },
    '/api/locations/cities': {
      get: {
        summary: 'Search cities by name (typeahead), with service-zone availability per result',
        tags: ['Locations'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Up to 15 matching cities',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CitiesResponse' } } },
          },
          '401': { description: 'Not signed in' },
        },
      },
    },
    '/api/zones': {
      get: {
        summary: "Preview a city's active service zones (resolving a satellite city to its metro anchor)",
        tags: ['Zones'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'cityId', in: 'query', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: "The city's active service zones, sorted by display order",
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ZonesResponse' } } },
          },
          '401': { description: 'Not signed in' },
          '404': {
            description: 'city_not_found (the city does not exist) or no_zones_configured (it has no active zones yet)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/api/goalkeeper-requests/config': {
      get: {
        summary: 'What a client may pick for a pitch: bookable dates, minimum notice, goalkeeper counts, durations (read-only)',
        description:
          'Resolves the location exactly like the quote does, so it refuses exactly where a quote would refuse; a 200 here means /quote will accept a request within these limits. The window and the minimum notice are configured per country (city overrides allowed); the goalkeeper counts, durations and slot step are fixed.',
        tags: ['Goalkeeper requests'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'latitude', in: 'query', required: true, schema: { type: 'number', minimum: -90, maximum: 90 } },
          { name: 'longitude', in: 'query', required: true, schema: { type: 'number', minimum: -180, maximum: 180 } },
        ],
        responses: {
          '200': {
            description: 'The booking configuration for that location',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/BookingConfigResponse' } } },
          },
          '400': {
            description: 'validation_failed (with fieldErrors naming every offending parameter) or location_not_covered',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
          },
          '401': { description: 'Not signed in' },
          '403': { description: 'Not a client, or the client profile is not complete' },
          '422': {
            description:
              'time_zone_not_configured, or service_not_configured (missing: bookingWindowDays | minNoticeMinutes | leadTimeSurcharge | currency)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/api/goalkeeper-requests/quote': {
      post: {
        summary: 'Quote the total price of a goalkeeper booking (read-only — creates nothing)',
        description:
          'total = (unit rate x goalkeeperCount) + lead-time surcharge. The unit rate is the zone rate for the duration, else the city rate. The booking window, minimum notice and surcharge tiers are configured per country (city overrides allowed); an area with any of them missing is refused, never assumed. Evaluation order: validation_failed, location_not_covered, time_zone_not_configured, invalid_start_time, start_time_in_past, service_not_configured, insufficient_notice, outside_booking_window, rate_not_configured. No price is ever returned with an error.',
        tags: ['Goalkeeper requests'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ServiceQuoteRequest' } } },
        },
        responses: {
          '200': {
            description: 'The price breakdown',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ServiceQuoteResponse' } } },
          },
          '400': {
            description:
              'validation_failed (with fieldErrors naming every offending field), location_not_covered, invalid_start_time (reason: not_on_slot | nonexistent_local_time | ambiguous_local_time), start_time_in_past, insufficient_notice (minNoticeMinutes — there is not enough time for a goalkeeper to reach the zone), or outside_booking_window (bookingWindowDays)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
          },
          '401': { description: 'Not signed in' },
          '403': { description: 'Not a client, or the client profile is not complete' },
          '422': {
            description:
              'The request is well-formed but the service is not set up for that area or duration: time_zone_not_configured, service_not_configured (missing: bookingWindowDays | minNoticeMinutes | leadTimeSurcharge | currency — the country\u2019s currency) or rate_not_configured',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/api/goalkeepers/document-types': {
      get: {
        summary: 'List valid identification document types',
        tags: ['Goalkeepers'],
        responses: {
          '200': {
            description: 'Fixed, manually seeded reference catalog',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/DocumentTypesResponse' } } },
          },
        },
      },
    },
    '/api/goalkeepers/me': {
      get: {
        summary: "Get the caller's current goalkeeper registration status",
        tags: ['Goalkeepers'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Current registration state (not_started/in_progress/active)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/GoalkeeperRegistrationResponse' } } },
          },
          '401': { description: 'Not signed in' },
          '403': { description: 'Caller is an administrator, or client profile is not complete' },
        },
      },
    },
    '/api/goalkeepers/me/identification': {
      patch: {
        summary: 'Save (partially) the identification section',
        tags: ['Goalkeepers'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  documentType: { type: 'string' },
                  documentNumber: { type: 'string' },
                  issueDate: { type: 'string', format: 'date' },
                  birthDate: { type: 'string', format: 'date' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated registration',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/GoalkeeperRegistrationResponse' } } },
          },
          '400': {
            description: 'Validation failed, or unrecognized document type',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
          },
          '401': { description: 'Not signed in' },
          '403': { description: 'Caller is an administrator, or client profile is not complete' },
          '409': {
            description: 'Duplicate document, or registration already active',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/api/goalkeepers/me/physical-data': {
      patch: {
        summary: 'Save (partially) the physical data section',
        tags: ['Goalkeepers'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { heightCm: { type: 'number' }, weightKg: { type: 'number' } },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated registration',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/GoalkeeperRegistrationResponse' } } },
          },
          '400': {
            description: 'Validation failed',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
          },
          '401': { description: 'Not signed in' },
          '403': { description: 'Caller is an administrator, or client profile is not complete' },
          '409': {
            description: 'Registration already active',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/api/goalkeepers/me/availability': {
      patch: {
        summary: 'Save the availability section — the chosen service city and its service zones, together',
        tags: ['Goalkeepers'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['cityId', 'zoneIds'],
                properties: {
                  cityId: { type: 'string' },
                  zoneIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated registration',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/GoalkeeperRegistrationResponse' } } },
          },
          '400': {
            description: 'validation_failed (missing/empty fields), invalid_city, or invalid_zones (with invalidZoneIds)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
          '401': { description: 'Not signed in' },
          '403': { description: 'Caller is an administrator, or client profile is not complete' },
          '409': {
            description: 'Registration already active',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/api/goalkeepers/me/document-photo': {
      post: {
        summary: 'Upload one or both identification document photos',
        tags: ['Goalkeepers'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  sideA: { type: 'string', format: 'binary' },
                  sideB: { type: 'string', format: 'binary' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated registration (documentPhotoASubmitted/documentPhotoBSubmitted reflect the upload)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/GoalkeeperRegistrationResponse' } } },
          },
          '400': {
            description: 'No file provided, or content is not a supported image',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
          '401': { description: 'Not signed in' },
          '403': { description: 'Caller is an administrator, or client profile is not complete' },
          '409': {
            description: 'Registration already active',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
          '413': {
            description: 'File exceeds the maximum allowed size',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
          '502': {
            description: 'Storage provider failure',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/api/goalkeepers/me/profile/physical-data': {
      patch: {
        summary: 'Edit the physical data of an ACTIVE goalkeeper (partial: send heightCm, weightKg, or both)',
        description:
          'Does not change the goalkeeper’s status or require reactivation. Idempotent; last write wins. Authorized against the database (an existing goalkeeper profile), not the isGoalkeeper token claim.',
        tags: ['Goalkeepers'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                minProperties: 1,
                properties: {
                  heightCm: { type: 'number', minimum: 120, maximum: 230 },
                  weightKg: { type: 'number', minimum: 40, maximum: 150 },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated (same shape as GET /api/goalkeepers/me, without `city`)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/GoalkeeperRegistrationResponse' } } },
          },
          '400': {
            description: 'validation_failed — out-of-range value (fieldErrors), empty body, or wrong type',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
          },
          '401': { description: 'Not signed in' },
          '403': { description: 'Caller is an administrator, or client profile is not complete' },
          '404': {
            description: 'goalkeeper_not_found — the client never started a goalkeeper registration',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
          '409': {
            description: 'goalkeeper_not_active — a draft registration exists but is not activated yet',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/api/goalkeepers/me/profile/availability': {
      put: {
        summary: 'Replace the city and service zones of an ACTIVE goalkeeper',
        description:
          'City and zones are saved together, atomically. Same validations as the draft registration. Does not change the goalkeeper’s status. Idempotent; last write wins.',
        tags: ['Goalkeepers'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['cityId', 'zoneIds'],
                properties: {
                  cityId: { type: 'string' },
                  zoneIds: { type: 'array', minItems: 1, items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated (same shape as GET /api/goalkeepers/me, without `city`)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/GoalkeeperRegistrationResponse' } } },
          },
          '400': {
            description: 'validation_failed (missing/empty fields), invalid_city, or invalid_zones (with invalidZoneIds)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
          '401': { description: 'Not signed in' },
          '403': { description: 'Caller is an administrator, or client profile is not complete' },
          '404': {
            description: 'goalkeeper_not_found — the client never started a goalkeeper registration',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
          '409': {
            description: 'goalkeeper_not_active — a draft registration exists but is not activated yet',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/api/goalkeepers/me/activate': {
      post: {
        summary: 'Activate the goalkeeper profile once all sections are complete',
        tags: ['Goalkeepers'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description:
              'Now active. The caller’s current access token does not carry the `isGoalkeeper: "true"` claim yet — call POST /api/auth/tokens/refresh to obtain a token that does.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/GoalkeeperRegistrationResponse' } } },
          },
          '401': { description: 'Not signed in' },
          '403': { description: 'Caller is an administrator, or client profile is not complete' },
          '409': { description: 'goalkeeper_profile_incomplete (body includes missingSections: string[] — any of "identification", "physicalData", "availability"), or already_active' },
        },
      },
    },
    '/api/goalkeepers/me/cancel': {
      post: {
        summary: 'Cancel an in-progress registration, discarding all saved data and photos',
        tags: ['Goalkeepers'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Reset to not_started',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/GoalkeeperRegistrationResponse' } } },
          },
          '401': { description: 'Not signed in' },
          '403': { description: 'Caller is an administrator, or client profile is not complete' },
          '409': {
            description: 'Registration already active',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/health': {
      get: {
        summary: 'Service and database health',
        tags: ['Health'],
        responses: {
          '200': {
            description: 'Healthy or degraded',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthReportResponse' } } },
          },
          '503': {
            description: 'Unhealthy',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthReportResponse' } } },
          },
        },
      },
    },
  },
};
