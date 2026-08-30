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
