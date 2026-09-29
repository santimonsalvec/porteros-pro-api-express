/** Hand-written OpenAPI 3.0 document mirroring specs/001-porteros-api-migration/contracts/. */
/** `page` / `pageSize` query parameters of the paged lists (1-based, 20 by default, at most 50). */
const PAGING = [
  { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'pageSize', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
];

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
      RegisterDeviceRequest: {
        type: 'object',
        properties: {
          token: { type: 'string', minLength: 1, maxLength: 4096, description: 'The FCM registration token of this device' },
          platform: { type: 'string', enum: ['ios', 'android'] },
        },
        required: ['token', 'platform'],
      },
      UnregisterDeviceRequest: {
        type: 'object',
        properties: { token: { type: 'string', minLength: 1, maxLength: 4096 } },
        required: ['token'],
      },
      NotificationItem: {
        type: 'object',
        properties: {
          notificationId: { type: 'string' },
          type: { type: 'string', example: 'booking.available' },
          title: { type: 'string', example: 'Partido disponible' },
          body: { type: 'string', example: 'Bello · dom 4 oct, 3:00 p. m. · 90 min' },
          data: { type: 'object', additionalProperties: { type: 'string' }, example: { type: 'booking.available', requestId: '0191…', bookingId: '0191…' } },
          createdAt: { type: 'string', format: 'date-time' },
          readAt: { type: 'string', format: 'date-time', nullable: true, description: 'For an offer, read means opened: no more reminders' },
          dismissedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Offers only; null for other types' },
          stillAvailable: { type: 'boolean', nullable: true, description: 'Offers only: the caller can still take a booking of that match now' },
        },
        required: ['notificationId', 'type', 'title', 'body', 'data', 'createdAt', 'readAt', 'dismissedAt', 'stillAvailable'],
      },
      NotificationsPage: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { $ref: '#/components/schemas/NotificationItem' } },
          page: { type: 'integer' },
          pageSize: { type: 'integer' },
          totalItems: { type: 'integer' },
          totalPages: { type: 'integer' },
          unreadCount: { type: 'integer' },
        },
        required: ['items', 'page', 'pageSize', 'totalItems', 'totalPages', 'unreadCount'],
      },
      UserPushResult: {
        type: 'object',
        properties: {
          reached: { type: 'integer', example: 2, description: 'Devices the push service accepted the push for' },
          removed: { type: 'integer', example: 0, description: 'Devices removed because the push service reported their token invalid' },
          failed: { type: 'integer', example: 0, description: 'Devices that failed temporarily (kept)' },
          noDevice: { type: 'boolean', example: false, description: 'The user had no registered device' },
        },
        required: ['reached', 'removed', 'failed', 'noDevice'],
      },
      WalletViewResponse: {
        type: 'object',
        properties: {
          balance: { type: 'integer', example: 13000, description: 'Whole currency units; may be negative after penalties' },
          currency: { type: 'string', example: 'COP' },
          offers: {
            type: 'object',
            properties: {
              canSeeOffers: { type: 'boolean', description: 'false → the goalkeeper sees no matches and receives no offers' },
              lowestCommission: { type: 'integer', nullable: true, example: 7000, description: 'Lowest configured commission among the enabled zones' },
              missingAmount: { type: 'integer', example: 0, description: 'max(0, lowestCommission − balance)' },
            },
            required: ['canSeeOffers', 'lowestCommission', 'missingAmount'],
          },
          movementCount: { type: 'integer', example: 2 },
        },
        required: ['balance', 'currency', 'offers', 'movementCount'],
      },
      WalletMovementItem: {
        type: 'object',
        properties: {
          movementId: { type: 'string' },
          sequence: { type: 'integer', example: 1 },
          type: { type: 'string', enum: ['top_up', 'commission_charge', 'commission_refund', 'penalty', 'penalty_reversal', 'admin_adjustment', 'gateway_fee'] },
          amount: { type: 'integer', example: -7000, description: 'Signed: credits > 0, debits < 0' },
          currency: { type: 'string', example: 'COP' },
          balanceAfter: { type: 'integer', example: 13000 },
          occurredAt: { type: 'string', format: 'date-time' },
          references: {
            type: 'object',
            properties: {
              bookingId: { type: 'string' },
              requestId: { type: 'string' },
              topUpId: { type: 'string' },
              caseId: { type: 'string' },
              penaltyMovementId: { type: 'string' },
            },
          },
          cancellation: {
            type: 'object',
            nullable: true,
            properties: { by: { type: 'string', enum: ['client', 'system', 'admin'] }, at: { type: 'string', format: 'date-time' }, reason: { type: 'string' } },
          },
          reason: { type: 'string', nullable: true },
        },
        required: ['movementId', 'sequence', 'type', 'amount', 'currency', 'balanceAfter', 'occurredAt', 'references', 'cancellation', 'reason'],
      },
      AdminWalletMovementItem: {
        allOf: [
          { $ref: '#/components/schemas/WalletMovementItem' },
          {
            type: 'object',
            properties: {
              actor: { type: 'object', properties: { kind: { type: 'string', enum: ['system', 'goalkeeper', 'admin'] }, userId: { type: 'string', nullable: true } } },
              causeKey: { type: 'string', example: 'commission:01925a00-1b2d-7aaa-8bbb-000000000001' },
              invoicing: { type: 'object', properties: { documentType: { type: 'string' }, documentNumber: { type: 'string' } } },
            },
            required: ['actor', 'causeKey', 'invoicing'],
          },
        ],
      },
      WalletMovementsPage: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { $ref: '#/components/schemas/WalletMovementItem' } },
          page: { type: 'integer' },
          pageSize: { type: 'integer' },
          totalItems: { type: 'integer' },
          totalPages: { type: 'integer' },
        },
        required: ['items', 'page', 'pageSize', 'totalItems', 'totalPages'],
      },
      Contact: {
        type: 'object',
        description: 'The only personal data either side of an assigned booking sees of the other.',
        properties: {
          firstName: { type: 'string', nullable: true, example: 'Ana' },
          lastName: { type: 'string', nullable: true, example: 'Portera' },
          whatsApp: { type: 'string', nullable: true, example: '+57 300 123 4567', description: '"<country calling code> <number>"' },
        },
        required: ['firstName', 'lastName', 'whatsApp'],
      },
      AvailableBookingItem: {
        type: 'object',
        description: 'A booking the goalkeeper can take. No client data.',
        properties: {
          bookingId: { type: 'string' },
          requestId: { type: 'string' },
          zoneId: { type: 'string' },
          zoneName: { type: 'string', nullable: true },
          cityId: { type: 'string' },
          cityName: { type: 'string', nullable: true },
          startsAt: { type: 'string', format: 'date-time' },
          startsAtLocal: { type: 'string', example: '2026-09-21T15:00:00-05:00' },
          timeZone: { type: 'string', example: 'America/Bogota' },
          durationMinutes: { type: 'integer', example: 90 },
          goalkeeperCount: { type: 'integer', description: 'How many goalkeepers the request asked for' },
          earnings: { type: 'integer', example: 60000, description: 'What the client pays the goalkeeper for this booking (rate + surcharge)' },
          commission: { type: 'integer', example: 7000, description: 'The platform commission charged on acceptance, fixed when the quote was issued' },
          currency: { type: 'string', example: 'COP' },
        },
        required: ['bookingId', 'requestId', 'zoneId', 'zoneName', 'cityId', 'cityName', 'startsAt', 'startsAtLocal', 'timeZone', 'durationMinutes', 'goalkeeperCount', 'earnings', 'commission', 'currency'],
      },
      AvailableBookingsPage: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { $ref: '#/components/schemas/AvailableBookingItem' } },
          page: { type: 'integer' },
          pageSize: { type: 'integer' },
          totalItems: { type: 'integer' },
          totalPages: { type: 'integer' },
          unavailableReason: {
            type: 'string',
            nullable: true,
            enum: ['not_available_for_offers', 'insufficient_funds', 'suspended', null],
            description:
              'Why the list is empty whatever the matches, checked in this order: not_available_for_offers (the goalkeeper turned offers off), suspended, insufficient_funds. null when the goalkeeper can see offers',
          },
          missingAmount: { type: 'integer', nullable: true, description: 'With insufficient_funds' },
          suspendedUntil: { type: 'string', format: 'date-time', nullable: true, description: 'With suspended' },
        },
        required: ['items', 'page', 'pageSize', 'totalItems', 'totalPages', 'unavailableReason', 'missingAmount', 'suspendedUntil'],
      },
      AgendaItem: {
        allOf: [
          { $ref: '#/components/schemas/AvailableBookingItem' },
          {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['assigned', 'completed', 'cancelled', 'goalkeeper_withdrew'] },
              assignedAt: { type: 'string', format: 'date-time', nullable: true },
              latitude: { type: 'number', description: 'The pitch' },
              longitude: { type: 'number', description: 'The pitch' },
              client: {
                allOf: [{ $ref: '#/components/schemas/Contact' }],
                nullable: true,
                description: 'Only for a booking the goalkeeper holds, from clientContactVisibleFrom on',
              },
              clientContactVisibleFrom: {
                type: 'string',
                format: 'date-time',
                description: "From when the client's name and WhatsApp are shown (one hour before the match in Colombia)",
              },
              checkIn: {
                type: 'object',
                nullable: true,
                description: 'The goalkeeper\u2019s check-in (feature 020), with their distance to the pitch (null without a location)',
                properties: {
                  at: { type: 'string', format: 'date-time' },
                  photoUrl: { type: 'string' },
                  distanceMeters: { type: 'integer', nullable: true },
                },
                required: ['at', 'photoUrl', 'distanceMeters'],
              },
            },
            required: ['status', 'assignedAt', 'latitude', 'longitude', 'client', 'clientContactVisibleFrom', 'checkIn'],
          },
        ],
      },
      WithdrawalDecision: {
        type: 'object',
        description: "An administrator's decision. `by` (the administrator's user id) only in the admin view.",
        properties: {
          by: { type: 'string' },
          at: { type: 'string', format: 'date-time' },
          reason: { type: 'string' },
        },
        required: ['at', 'reason'],
      },
      WithdrawalPenalty: {
        type: 'object',
        properties: {
          penaltyId: { type: 'string' },
          kind: { type: 'string', enum: ['late', 'weekly_limit'] },
          days: { type: 'integer' },
          startsAt: { type: 'string', format: 'date-time' },
          endsAt: { type: 'string', format: 'date-time' },
          reversal: { allOf: [{ $ref: '#/components/schemas/WithdrawalDecision' }], nullable: true },
        },
        required: ['penaltyId', 'kind', 'days', 'startsAt', 'endsAt', 'reversal'],
      },
      WithdrawalSummary: {
        type: 'object',
        properties: {
          withdrawalId: { type: 'string' },
          occurredAt: { type: 'string', format: 'date-time' },
          noticeMinutes: { type: 'integer', description: 'Whole minutes before the start' },
          late: { type: 'boolean', description: 'Less notice than the country threshold (2 h in Colombia)' },
          replacementCreated: { type: 'boolean', description: 'A replacement booking is being searched' },
          penalties: { type: 'array', items: { $ref: '#/components/schemas/WithdrawalPenalty' } },
          suspendedUntil: { type: 'string', format: 'date-time', nullable: true },
        },
        required: ['withdrawalId', 'occurredAt', 'noticeMinutes', 'late', 'replacementCreated', 'penalties', 'suspendedUntil'],
      },
      WithdrawalItem: {
        type: 'object',
        properties: {
          withdrawalId: { type: 'string' },
          kind: { type: 'string', enum: ['withdrawal', 'no_show'], description: 'A withdrawal (018) or a no-show (021)' },
          bookingId: { type: 'string' },
          requestId: { type: 'string' },
          startsAt: { type: 'string', format: 'date-time' },
          occurredAt: { type: 'string', format: 'date-time' },
          noticeMinutes: { type: 'integer' },
          late: { type: 'boolean' },
          reason: { type: 'string', nullable: true },
          replacementCreated: { type: 'boolean' },
          penalties: { type: 'array', items: { $ref: '#/components/schemas/WithdrawalPenalty' } },
          moneyReversal: {
            nullable: true,
            allOf: [
              { $ref: '#/components/schemas/WithdrawalDecision' },
              { type: 'object', properties: { amount: { type: 'integer' }, currency: { type: 'string' } }, required: ['amount', 'currency'] },
            ],
          },
          forgiven: { type: 'boolean', description: 'Reversed in any way: no longer counts toward the weekly limit' },
        },
        required: ['withdrawalId', 'kind', 'bookingId', 'requestId', 'startsAt', 'occurredAt', 'noticeMinutes', 'late', 'reason', 'replacementCreated', 'penalties', 'moneyReversal', 'forgiven'],
      },
      WithdrawalPage: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { $ref: '#/components/schemas/WithdrawalItem' } },
          page: { type: 'integer' },
          pageSize: { type: 'integer' },
          totalItems: { type: 'integer' },
          totalPages: { type: 'integer' },
          suspendedUntil: { type: 'string', format: 'date-time', nullable: true, description: 'The suspension in force now' },
        },
        required: ['items', 'page', 'pageSize', 'totalItems', 'totalPages', 'suspendedUntil'],
      },
      AgendaPage: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { $ref: '#/components/schemas/AgendaItem' } },
          page: { type: 'integer' },
          pageSize: { type: 'integer' },
          totalItems: { type: 'integer' },
          totalPages: { type: 'integer' },
        },
        required: ['items', 'page', 'pageSize', 'totalItems', 'totalPages'],
      },
      RecordWalletAdjustmentRequest: {
        type: 'object',
        properties: {
          amount: { type: 'integer', example: 50000, description: 'Non-zero; positive = credit, negative = debit' },
          reason: { type: 'string', minLength: 3, maxLength: 500, example: 'Saldo inicial de pruebas' },
          operationKey: { type: 'string', format: 'uuid', description: 'Generated by the caller; repeating it returns the original movement' },
        },
        required: ['amount', 'reason', 'operationKey'],
      },
      TopUpOption: {
        type: 'object',
        properties: { amount: { type: 'integer' }, cost: { type: 'integer', description: 'Gateway fee, VAT included, rounded up' }, net: { type: 'integer', description: 'What reaches the wallet' } },
        required: ['amount', 'cost', 'net'],
      },
      TopUpOptionsResponse: {
        type: 'object',
        properties: {
          available: { type: 'boolean', description: 'false when the country has no gateway configured' },
          gateway: { type: 'string', nullable: true, example: 'wompi' },
          currency: { type: 'string', example: 'COP' },
          termsAccepted: { type: 'boolean', description: 'Whether the current terms version is accepted' },
          termsVersion: { type: 'string' },
          options: { type: 'array', items: { $ref: '#/components/schemas/TopUpOption' } },
        },
        required: ['available', 'gateway', 'currency', 'termsAccepted', 'termsVersion', 'options'],
      },
      TopUpResponse: {
        type: 'object',
        properties: {
          topUpId: { type: 'string' },
          reference: { type: 'string', example: 'PPR-0192f0000000700080000000000000001' },
          status: { type: 'string', enum: ['pending', 'approved', 'declined', 'voided', 'error', 'expired'] },
          amount: { type: 'integer' },
          cost: { type: 'integer' },
          net: { type: 'integer' },
          currency: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          finalizedAt: { type: 'string', format: 'date-time', nullable: true },
        },
        required: ['topUpId', 'reference', 'status', 'amount', 'cost', 'net', 'currency', 'createdAt', 'finalizedAt'],
      },
      StartedTopUpResponse: {
        allOf: [
          { $ref: '#/components/schemas/TopUpResponse' },
          {
            type: 'object',
            properties: { checkoutUrl: { type: 'string', format: 'uri', description: "The gateway's hosted checkout, signed by the server; open it in the system browser" } },
            required: ['checkoutUrl'],
          },
        ],
      },
      TopUpsPage: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { $ref: '#/components/schemas/TopUpResponse' } },
          page: { type: 'integer' },
          pageSize: { type: 'integer' },
          totalItems: { type: 'integer' },
          totalPages: { type: 'integer' },
        },
        required: ['items', 'page', 'pageSize', 'totalItems', 'totalPages'],
      },
      GatewaySettingsRequest: {
        type: 'object',
        additionalProperties: false,
        properties: {
          gateway: { type: 'string', enum: ['wompi'] },
          publicConfig: {
            type: 'object',
            additionalProperties: false,
            properties: { publicKey: { type: 'string', description: 'pub_test_… in sandbox, pub_prod_… in production' }, environment: { type: 'string', enum: ['sandbox', 'production'] } },
            required: ['publicKey', 'environment'],
          },
          costs: {
            type: 'object',
            properties: { percentBps: { type: 'integer', minimum: 0, maximum: 10000 }, fixed: { type: 'integer', minimum: 0 }, vatBps: { type: 'integer', minimum: 0, maximum: 10000 } },
            required: ['percentBps', 'fixed', 'vatBps'],
          },
          amounts: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'integer', minimum: 1 } },
        },
        required: ['gateway', 'publicConfig', 'costs', 'amounts'],
        description: 'No secrets: they live in Google Secret Manager.',
      },
      GatewaySettingsResponse: {
        type: 'object',
        properties: {
          countryId: { type: 'string' },
          gateway: { type: 'string' },
          publicConfig: { type: 'object', properties: { publicKey: { type: 'string' }, environment: { type: 'string' } } },
          currency: { type: 'string' },
          costs: { type: 'object', properties: { percentBps: { type: 'integer' }, fixed: { type: 'integer' }, vatBps: { type: 'integer' } } },
          amounts: { type: 'array', items: { type: 'integer' } },
          options: { type: 'array', items: { $ref: '#/components/schemas/TopUpOption' } },
          updatedAt: { type: 'string', format: 'date-time' },
          updatedBy: { type: 'string' },
        },
      },
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
          unitSurcharge: { type: 'integer', example: 5000, description: 'Lead-time surcharge per goalkeeper; 0 when none applies' },
          surcharge: { type: 'integer', example: 10000, description: 'unitSurcharge x goalkeeperCount: the surcharge is paid once per goalkeeper' },
          total: { type: 'integer', example: 120000, description: 'subtotal + surcharge = (unitRate + unitSurcharge) x goalkeeperCount' },
          currency: { type: 'string', example: 'COP', description: 'The currency of the country the location is in; every amount above is in it' },
          startsAt: { type: 'string', example: '2026-09-21T20:00:00.000Z', description: 'Resolved start instant, UTC' },
          startsAtLocal: { type: 'string', example: '2026-09-21T15:00:00-05:00', description: 'The same instant in the city\u2019s time zone' },
          timeZone: { type: 'string', example: 'America/Bogota' },
          quoteId: {
            type: 'string',
            example: '01924f6e-8c1b-7c3a-9d4e-2b7f5a1c9e00',
            description: 'Send it to POST /api/goalkeeper-requests/bookings to book this exact price',
          },
          expiresAt: {
            type: 'string',
            format: 'date-time',
            example: '2026-09-21T18:33:00.000Z',
            description: 'UTC; the quote can be confirmed strictly before this instant (3 minutes after issuance)',
          },
          cancelAllAvailable: {
            type: 'boolean',
            description: 'Whether partialFulfillment "cancel_all" can be chosen when confirming. Hide the option when false',
          },
          cancelAllUntil: {
            type: 'string',
            format: 'date-time',
            description: 'UTC: start − free-cancellation period, when a "cancel all" request is evaluated',
          },
        },
        required: [
          'unitRate',
          'goalkeeperCount',
          'subtotal',
          'unitSurcharge',
          'surcharge',
          'total',
          'currency',
          'startsAt',
          'startsAtLocal',
          'timeZone',
          'quoteId',
          'expiresAt',
          'cancelAllAvailable',
          'cancelAllUntil',
        ],
      },
      ConfirmBookingRequest: {
        type: 'object',
        properties: {
          quoteId: { type: 'string', example: '01924f6e-8c1b-7c3a-9d4e-2b7f5a1c9e00', description: 'The quoteId returned by POST /quote' },
          partialFulfillment: {
            type: 'string',
            enum: ['keep_confirmed', 'cancel_all'],
            default: 'keep_confirmed',
            description: 'What to do if only some of the goalkeepers are confirmed. Ignored when the request already exists (a replay).',
          },
        },
        required: ['quoteId'],
      },
      BookingItemResponse: {
        type: 'object',
        description: 'One goalkeeper\u2019s place in a request, at the per-goalkeeper price of the quote.',
        properties: {
          bookingId: { type: 'string' },
          status: {
            type: 'string',
            enum: ['pending_assignment', 'assigned', 'cancelled', 'expired', 'goalkeeper_withdrew', 'completed'],
          },
          unitRate: { type: 'integer', example: 55000 },
          unitSurcharge: { type: 'integer', example: 5000 },
          total: { type: 'integer', example: 60000, description: 'unitRate + unitSurcharge' },
          currency: { type: 'string', example: 'COP' },
          createdAt: { type: 'string', format: 'date-time' },
          goalkeeper: {
            allOf: [{ $ref: '#/components/schemas/Contact' }],
            nullable: true,
            description: 'The goalkeeper who took this booking; null while nobody has, and until contactsVisibleFrom (feature 019)',
          },
          assignedAt: { type: 'string', format: 'date-time', nullable: true },
          checkIn: {
            type: 'object',
            nullable: true,
            description: 'When the goalkeeper checked in and the photo (feature 020). The location is never shown to the client',
            properties: { at: { type: 'string', format: 'date-time' }, photoUrl: { type: 'string' } },
            required: ['at', 'photoUrl'],
          },
        },
        required: ['bookingId', 'status', 'unitRate', 'unitSurcharge', 'total', 'currency', 'createdAt', 'goalkeeper', 'assignedAt', 'checkIn'],
      },
      RequestResponse: {
        type: 'object',
        description:
          'A request (the match) with one booking per goalkeeper. Match and price are exact copies of the confirmed quote; the bookings\u2019 totals add up to `total`. Amounts are integers in whole currency units.',
        properties: {
          requestId: { type: 'string' },
          quoteId: { type: 'string' },
          status: {
            type: 'string',
            enum: ['searching', 'partially_assigned', 'assigned', 'completed', 'cancelled', 'expired', 'closed'],
            description: 'Derived from the bookings. cancelled: cancelled by "cancel all"; expired: no goalkeeper was found',
          },
          partialFulfillment: { type: 'string', enum: ['keep_confirmed', 'cancel_all'] },
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          zoneId: { type: 'string' },
          cityId: { type: 'string' },
          startsAt: { type: 'string', example: '2026-09-21T20:00:00.000Z' },
          startsAtLocal: { type: 'string', example: '2026-09-21T15:00:00-05:00' },
          timeZone: { type: 'string', example: 'America/Bogota' },
          goalkeeperCount: { type: 'integer', enum: [1, 2] },
          durationMinutes: { type: 'integer', enum: [60, 90, 120] },
          unitRate: { type: 'integer', example: 55000 },
          subtotal: { type: 'integer', example: 110000 },
          unitSurcharge: { type: 'integer', example: 5000 },
          surcharge: { type: 'integer', example: 10000 },
          total: { type: 'integer', example: 120000 },
          currency: { type: 'string', example: 'COP' },
          cancellation: {
            type: 'object',
            properties: {
              freeCancellationUntil: { type: 'string', format: 'date-time', description: 'startsAt minus the free-cancellation period' },
              freeCancellationAvailable: {
                type: 'boolean',
                description: 'false when, at confirmation, the match already is inside the free-cancellation period: assigned bookings cannot be cancelled and the goalkeeper must be paid',
              },
            },
            required: ['freeCancellationUntil', 'freeCancellationAvailable'],
          },
          contactsVisibleFrom: {
            type: 'string',
            format: 'date-time',
            description: "From when the assigned goalkeepers' name and WhatsApp are shown (the end of free cancellation, one hour before in Colombia). Until then each booking's goalkeeper is null",
          },
          createdAt: { type: 'string', format: 'date-time' },
          bookings: { type: 'array', items: { $ref: '#/components/schemas/BookingItemResponse' } },
        },
        required: [
          'requestId', 'quoteId', 'status', 'partialFulfillment', 'latitude', 'longitude', 'zoneId', 'cityId', 'startsAt',
          'startsAtLocal', 'timeZone', 'goalkeeperCount', 'durationMinutes', 'unitRate', 'subtotal', 'unitSurcharge',
          'surcharge', 'total', 'currency', 'cancellation', 'contactsVisibleFrom', 'createdAt', 'bookings',
        ],
      },
      ListedRequestResponse: {
        description: 'A listed request: exactly the POST /bookings body, plus the current zone and city names.',
        allOf: [
          { $ref: '#/components/schemas/RequestResponse' },
          {
            type: 'object',
            properties: {
              zoneName: { type: 'string', nullable: true, example: 'Laureles', description: 'Current name; null if the zone no longer exists' },
              cityName: { type: 'string', nullable: true, example: 'Medellín', description: 'Current name; null if the city no longer exists' },
            },
            required: ['zoneName', 'cityName'],
          },
        ],
      },
      RequestsPageResponse: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { $ref: '#/components/schemas/ListedRequestResponse' } },
          page: { type: 'integer', example: 1 },
          pageSize: { type: 'integer', example: 20 },
          totalItems: { type: 'integer', example: 45, description: 'Number of requests' },
          totalPages: { type: 'integer', example: 3, description: 'ceil(totalItems / pageSize); 0 when there are no requests' },
        },
        required: ['items', 'page', 'pageSize', 'totalItems', 'totalPages'],
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
          availableForOffers: {
            type: 'boolean',
            nullable: true,
            description: 'The "available for offers" switch; null unless status is active. Off: no offers, no available matches, cannot accept',
          },
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
              'time_zone_not_configured, or service_not_configured (missing: bookingWindowDays | minNoticeMinutes | leadTimeSurcharge | currency | commission)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/api/goalkeeper-requests/quote': {
      post: {
        summary: 'Quote the total price of a goalkeeper booking and hold it for 3 minutes',
        description:
          'total = (unit rate + lead-time surcharge) x goalkeeperCount: both the rate and the surcharge are charged per goalkeeper, so with two goalkeepers the surcharge is paid twice. The unit rate is the zone rate for the duration, else the city rate. The booking window, minimum notice and surcharge tiers are configured per country (city overrides allowed); an area with any of them missing is refused, never assumed. Evaluation order: validation_failed, location_not_covered, time_zone_not_configured, invalid_start_time, start_time_in_past, service_not_configured, insufficient_notice, outside_booking_window, rate_not_configured. No price is ever returned with an error. A successful quote is stored for 3 minutes (refusals are never stored) and can be booked with POST /api/goalkeeper-requests/bookings; if it cannot be stored the call fails with 500 and returns no price.',
        tags: ['Goalkeeper requests'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ServiceQuoteRequest' } } },
        },
        responses: {
          '200': {
            description: 'The price breakdown, with the id and expiry of the stored quote',
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
              'The request is well-formed but the service is not set up for that area or duration: time_zone_not_configured, service_not_configured (missing: bookingWindowDays | minNoticeMinutes | leadTimeSurcharge | currency — the country\u2019s currency — | commission — the platform commission of the zone, city or country) or rate_not_configured',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/api/goalkeeper-requests/bookings/{requestId}/cancel': {
      post: {
        summary: 'Cancel the whole request (every searching and assigned booking, all or nothing)',
        description:
          'Searching bookings are cancelled for free. Assigned ones are cancelled with the commission refunded to their goalkeeper while the free-cancellation period is open. If any assigned booking is past it, nothing is cancelled (409).',
        tags: ['Goalkeeper requests'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'requestId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: { type: 'object', properties: { reason: { type: 'string', minLength: 1, maxLength: 200, example: 'Un amigo cubre el arco' } } },
            },
          },
        },
        responses: {
          '200': { description: 'Cancelled now, or already cancelled by the client (idempotent): the request as it is now', content: { 'application/json': { schema: { $ref: '#/components/schemas/RequestResponse' } } } },
          '400': { description: 'validation_failed: reason', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
          '401': { description: 'Not signed in' },
          '404': { description: 'request_not_found or booking_not_found (unknown, or another client\u2019s)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '409': {
            description:
              'booking_not_cancellable (status: expired, cancelled by the system, completed, withdrawn) or cancellation_window_closed (bookingId, freeCancellationUntil: a goalkeeper is assigned and the free-cancellation period is over — use the goalkeeper or pay them; nothing changed)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
          '503': { description: 'cancellation_temporarily_unavailable: the refund cannot be recorded right now (Retry-After: 60); nothing changed' },
        },
      },
    },
    '/api/goalkeeper-requests/bookings/{requestId}/bookings/{bookingId}/cancel': {
      post: {
        summary: 'Cancel one booking of the request (e.g. a friend covers one goal)',
        description:
          'Free while it is searching. Once a goalkeeper is assigned, allowed until the end of the free-cancellation period, refunding their commission and notifying them.',
        tags: ['Goalkeeper requests'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'requestId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'bookingId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: { type: 'object', properties: { reason: { type: 'string', minLength: 1, maxLength: 200, example: 'Un amigo cubre el arco' } } },
            },
          },
        },
        responses: {
          '200': { description: 'Cancelled now, or already cancelled by the client (idempotent): the request as it is now', content: { 'application/json': { schema: { $ref: '#/components/schemas/RequestResponse' } } } },
          '400': { description: 'validation_failed: reason', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
          '401': { description: 'Not signed in' },
          '404': { description: 'request_not_found or booking_not_found (unknown, or another client\u2019s)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '409': {
            description:
              'booking_not_cancellable (status: expired, cancelled by the system, completed, withdrawn) or cancellation_window_closed (bookingId, freeCancellationUntil: a goalkeeper is assigned and the free-cancellation period is over — use the goalkeeper or pay them; nothing changed)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
          '503': { description: 'cancellation_temporarily_unavailable: the refund cannot be recorded right now (Retry-After: 60); nothing changed' },
        },
      },
    },
    '/api/goalkeeper-requests/bookings': {
      get: {
        summary: "List the caller's own requests (one per match, with their bookings), one page at a time",
        description:
          'Upcoming matches first (start at or after the request time, soonest first), then past matches (most recent first); ties are broken by requestId. The client is always the token’s subject: any clientId, userId or other unknown parameter is ignored. A page past the last one returns an empty list with the real totals. Amounts and match details are the stored values; zone and city names are the current ones.',
        tags: ['Goalkeeper requests'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'pageSize', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
        ],
        responses: {
          '200': {
            description: 'One page of the caller’s bookings (possibly empty)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RequestsPageResponse' } } },
          },
          '400': {
            description: 'validation_failed: page or pageSize is not a whole number, is out of range (page ≥ 1, pageSize 1–50) or is repeated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
          },
          '401': { description: 'Not signed in' },
          '403': { description: 'Not a client, or the client profile is not complete' },
        },
      },
      post: {
        summary: 'Confirm a quote: one request plus one booking per goalkeeper, at exactly the quoted price (idempotent per quoteId)',
        description:
          'Deletes the caller’s unexpired quote and creates the request with its bookings (one per goalkeeper, each at the per-goalkeeper price) in one transaction: all of it happens or none of it does. However many times the same quoteId is confirmed, one request exists and every successful call returns it with its bookings as they are now (201 the first time, 200 afterwards). Only quoteId and partialFulfillment are read; any other field is ignored. Refusals never create anything and never change or delete a quote.',
        tags: ['Goalkeeper requests'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ConfirmBookingRequest' } } },
        },
        responses: {
          '201': {
            description: 'Request and bookings created by this call',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RequestResponse' } } },
          },
          '200': {
            description: 'The request already existed (a retry or a double tap) — the same request and bookings, nothing created',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RequestResponse' } } },
          },
          '400': {
            description: 'validation_failed: quoteId missing or not a string, or partialFulfillment not keep_confirmed or cancel_all',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } },
          },
          '401': { description: 'Not signed in' },
          '403': { description: 'Not a client, or the client profile is not complete' },
          '404': {
            description:
              'quote_not_found: no quote or booking with that id for this client — never existed, malformed id, already removed after expiry, or another client’s (indistinguishable). Request a new quote.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
          '409': {
            description:
              'duplicate_request (requestId of the caller’s existing active request for the same zone and start; the quote is left untouched) or confirmation_in_progress (another confirmation of this quote has not committed yet; retry after the Retry-After header, 1 second), or cancel_all_not_available (cancelAllUntil; "cancel_all" chosen once the free-cancellation period started — confirm with "keep_confirmed")',
            headers: { 'Retry-After': { schema: { type: 'integer' }, description: 'Only with confirmation_in_progress' } },
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
          '410': {
            description: 'quote_expired: the quote is past its expiry but has not been removed yet. Request a new quote (same as 404).',
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
    '/api/goalkeepers/me/available-bookings': {
      get: {
        summary: 'The bookings the goalkeeper can take now, soonest first',
        description:
          'Pending bookings in the goalkeeper\u2019s enabled zones whose search is still open (start \u2212 travel margin), whose commission the balance covers, that do not clash with their assigned bookings (travel margin included), that are not of a request they already hold a booking of, and that are not of their own requests. A suspended goalkeeper, or one whose balance does not cover the lowest commission of their zones, gets an empty list with unavailableReason. So does a goalkeeper with offers switched off (PUT /api/goalkeepers/me/offers-availability).',
        tags: ['Goalkeeper bookings'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'pageSize', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
        ],
        responses: {
          '200': { description: 'One page of takeable bookings', content: { 'application/json': { schema: { $ref: '#/components/schemas/AvailableBookingsPage' } } } },
          '400': { description: 'validation_failed: invalid page or pageSize', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
          '401': { description: 'Not signed in' },
          '404': { description: 'goalkeeper_not_found: not an active goalkeeper', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/goalkeepers/me/bookings/{bookingId}/accept': {
      post: {
        summary: 'Take a booking: assigned to the goalkeeper and the commission charged, all or nothing',
        description:
          'Only one goalkeeper can take a booking. Repeating the acceptance answers 200 with the same booking and charges nothing again. No body.',
        tags: ['Goalkeeper bookings'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'bookingId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '201': { description: 'Accepted now; the commission was charged', content: { 'application/json': { schema: { $ref: '#/components/schemas/AgendaItem' } } } },
          '200': { description: 'Already assigned to this goalkeeper; nothing charged again', content: { 'application/json': { schema: { $ref: '#/components/schemas/AgendaItem' } } } },
          '401': { description: 'Not signed in' },
          '403': { description: 'goalkeeper_suspended (suspendedUntil)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '404': { description: 'booking_not_available (unknown or malformed id, cancelled, expired or completed), or goalkeeper_not_found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '409': {
            description:
              'booking_already_taken, search_ended (now \u2265 start \u2212 travel margin), zone_not_enabled, insufficient_funds (missingAmount), schedule_conflict (conflictingBookingId), own_request, same_request, or goalkeeper_not_available (offers switched off; nothing charged)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/api/goalkeepers/me/bookings': {
      get: {
        summary: "The goalkeeper's agenda: upcoming bookings soonest first, then past ones most recent first",
        tags: ['Goalkeeper bookings'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'pageSize', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
        ],
        responses: {
          '200': { description: 'One page of the goalkeeper\u2019s bookings, with the client contact', content: { 'application/json': { schema: { $ref: '#/components/schemas/AgendaPage' } } } },
          '400': { description: 'validation_failed: invalid page or pageSize', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
          '401': { description: 'Not signed in' },
          '404': { description: 'goalkeeper_not_found: not an active goalkeeper', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/goalkeepers/me/wallet': {
      get: {
        summary: "The goalkeeper's wallet: balance, currency and whether they can see offers",
        tags: ['Wallet'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'The wallet (balance 0 before any movement)', content: { 'application/json': { schema: { $ref: '#/components/schemas/WalletViewResponse' } } } },
          '401': { description: 'Not signed in' },
          '404': { description: 'goalkeeper_not_found: not an active goalkeeper', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '422': { description: 'wallet_not_configured: the currency of the goalkeeper country cannot be resolved', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/goalkeepers/me/wallet/movements': {
      get: {
        summary: "The goalkeeper's wallet movements, newest first, one page at a time",
        tags: ['Wallet'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'pageSize', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
        ],
        responses: {
          '200': { description: 'One page of movements (no invoicing or administrator data)', content: { 'application/json': { schema: { $ref: '#/components/schemas/WalletMovementsPage' } } } },
          '400': { description: 'validation_failed: invalid page or pageSize', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
          '401': { description: 'Not signed in' },
          '404': { description: 'goalkeeper_not_found: not an active goalkeeper' },
        },
      },
    },
    '/api/goalkeepers/me/wallet/top-up-options': {
      get: {
        summary: 'The top-up amounts of the goalkeeper\'s country, each with its cost and net (feature 022)',
        tags: ['Wallet'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'The options, and whether the current terms are accepted', content: { 'application/json': { schema: { $ref: '#/components/schemas/TopUpOptionsResponse' } } } },
          '401': { description: 'Not signed in' },
          '404': { description: 'goalkeeper_not_found' },
          '422': { description: 'wallet_not_configured' },
        },
      },
    },
    '/api/goalkeepers/me/wallet/top-ups': {
      post: {
        summary: 'Starts a top-up and answers the gateway checkout address (feature 022)',
        description: 'Nothing is credited here: only the gateway confirmation or the reconciliation credits.',
        tags: ['Wallet'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { amount: { type: 'integer', minimum: 1 } }, required: ['amount'] } } },
        },
        responses: {
          '201': { description: 'A pending top-up', content: { 'application/json': { schema: { $ref: '#/components/schemas/StartedTopUpResponse' } } } },
          '400': { description: 'validation_failed, or invalid_amount (with the valid `amounts`)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
          '401': { description: 'Not signed in' },
          '404': { description: 'goalkeeper_not_found' },
          '409': { description: 'terms_not_accepted (with `termsVersion`) or top_ups_unavailable', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '422': { description: 'wallet_not_configured' },
          '503': { description: 'gateway_unavailable' },
        },
      },
      get: {
        summary: "The goalkeeper's top-ups, newest first (feature 022)",
        tags: ['Wallet'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'pageSize', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
        ],
        responses: {
          '200': { description: 'One page of top-ups', content: { 'application/json': { schema: { $ref: '#/components/schemas/TopUpsPage' } } } },
          '400': { description: 'validation_failed' },
          '401': { description: 'Not signed in' },
          '404': { description: 'goalkeeper_not_found' },
        },
      },
    },
    '/api/goalkeepers/me/wallet/top-ups/{topUpId}': {
      get: {
        summary: 'One of the goalkeeper\'s top-ups (feature 022)',
        tags: ['Wallet'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'topUpId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'The top-up', content: { 'application/json': { schema: { $ref: '#/components/schemas/TopUpResponse' } } } },
          '401': { description: 'Not signed in' },
          '404': { description: "top_up_not_found (also another goalkeeper's)" },
        },
      },
    },
    '/api/admin/payment-gateways/{countryId}': {
      get: {
        summary: "A country's top-up gateway settings (administrators only, feature 022)",
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'countryId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'The settings, never a secret', content: { 'application/json': { schema: { $ref: '#/components/schemas/GatewaySettingsResponse' } } } },
          '401': { description: 'Not signed in' },
          '403': { description: 'Not an administrator' },
          '404': { description: 'settings_not_found' },
        },
      },
      put: {
        summary: "Sets a country's top-up gateway, public key, costs and amounts (administrators only, feature 022)",
        description: 'Pending top-ups keep the gateway and environment they started with.',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'countryId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/GatewaySettingsRequest' } } } },
        responses: {
          '200': { description: 'Saved', content: { 'application/json': { schema: { $ref: '#/components/schemas/GatewaySettingsResponse' } } } },
          '400': { description: 'validation_failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
          '401': { description: 'Not signed in' },
          '403': { description: 'Not an administrator' },
          '404': { description: 'country_not_found' },
        },
      },
    },
    '/api/profile/terms/accept': {
      post: {
        summary: 'Accepts the current terms and privacy policy versions (feature 022)',
        tags: ['Profile'],
        security: [{ bearerAuth: [] }],
        responses: {
          '201': {
            description: 'Recorded with the IP and user agent',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { termsVersion: { type: 'string' }, privacyPolicyVersion: { type: 'string' }, acceptedAt: { type: 'string', format: 'date-time' } },
                },
              },
            },
          },
          '401': { description: 'Not signed in' },
        },
      },
    },
    '/webhooks/payments/{gateway}': {
      post: {
        summary: "A payment gateway's event notification (not part of the API; feature 022)",
        description:
          "Called by the gateway (Wompi's `transaction.updated`), not by the app. No platform auth: the event's signature is verified. Always 200 except on an internal error (500, so the gateway retries).",
        tags: ['Payments (non-API)'],
        parameters: [{ name: 'gateway', in: 'path', required: true, schema: { type: 'string', enum: ['wompi'] } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'Handled (applied, repeated, ignored or rejected)' }, '500': { description: 'Internal error' } },
      },
    },
    '/pagos/retorno/{reference}': {
      get: {
        summary: 'The page the gateway returns to (not part of the API; feature 022)',
        description: 'Public HTML in Spanish with the status and amounts only. It never credits. Also opened by the app through App Links / Universal Links.',
        tags: ['Payments (non-API)'],
        parameters: [{ name: 'reference', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'HTML page (also for an unknown reference)', content: { 'text/html': { schema: { type: 'string' } } } } },
      },
    },
    '/api/admin/goalkeepers/{userId}/wallet': {
      get: {
        summary: "Any goalkeeper's wallet (administrators only)",
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'The wallet, plus goalkeeperId', content: { 'application/json': { schema: { $ref: '#/components/schemas/WalletViewResponse' } } } },
          '401': { description: 'Not signed in' },
          '403': { description: 'Not an administrator' },
          '404': { description: 'goalkeeper_not_found' },
          '422': { description: 'wallet_not_configured' },
        },
      },
    },
    '/api/admin/goalkeepers/{userId}/wallet/movements': {
      get: {
        summary: "Any goalkeeper's wallet movements, with actor, cause key and invoicing data (administrators only)",
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string' } }, ...[
          { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'pageSize', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
        ]],
        responses: {
          '200': { description: 'One page of movements (items are AdminWalletMovementItem)', content: { 'application/json': { schema: { $ref: '#/components/schemas/WalletMovementsPage' } } } },
          '400': { description: 'validation_failed' },
          '401': { description: 'Not signed in' },
          '403': { description: 'Not an administrator' },
          '404': { description: 'goalkeeper_not_found' },
        },
      },
    },
    '/api/admin/goalkeepers/{userId}/wallet/adjustments': {
      post: {
        summary: 'Record a manual credit or debit with a mandatory reason (administrators only; idempotent per operationKey)',
        description:
          'A debit may not leave the balance below zero (only penalties can). Until payment-gateway top-ups exist, this is how money enters a wallet in development.',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RecordWalletAdjustmentRequest' } } } },
        responses: {
          '201': { description: 'Recorded: the movement (AdminWalletMovementItem) plus balance', content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminWalletMovementItem' } } } },
          '200': { description: 'The operationKey was already recorded: the original movement, nothing new' },
          '400': { description: 'validation_failed: amount, reason or operationKey', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
          '401': { description: 'Not signed in' },
          '403': { description: 'Not an administrator' },
          '404': { description: 'goalkeeper_not_found' },
          '409': { description: 'insufficient_funds: the debit would leave the balance below zero (includes balance)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '422': { description: 'wallet_not_configured' },
        },
      },
    },
    '/api/goalkeepers/me/bookings/{bookingId}/check-in': {
      post: {
        summary: 'Confirm arrival at the pitch with a photo (feature 020)',
        description:
          'Upload the photo first with POST /api/images, then send its id. Allowed from start − 30 min to start + 15 min (per country, inclusive, platform clock); no check-in after the window. The location is optional evidence and never blocks. Repeating it answers the recorded check-in.',
        tags: ['Goalkeeper bookings'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'bookingId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  imageId: { type: 'string', description: 'An image uploaded by the caller' },
                  location: {
                    type: 'object',
                    properties: {
                      latitude: { type: 'number', minimum: -90, maximum: 90 },
                      longitude: { type: 'number', minimum: -180, maximum: 180 },
                      accuracyMeters: { type: 'number', minimum: 0 },
                    },
                    required: ['latitude', 'longitude'],
                  },
                },
                required: ['imageId'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Checked in now or already: the agenda item with checkIn', content: { 'application/json': { schema: { $ref: '#/components/schemas/AgendaItem' } } } },
          '400': { description: 'validation_failed, or invalid_photo (missing, or not uploaded by the caller)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '401': { description: 'Not signed in' },
          '404': { description: 'goalkeeper_not_found, or booking_not_found (unknown, or never theirs)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '409': {
            description: 'booking_not_assigned (status), check_in_not_open (opensAt) or check_in_closed (closedAt)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/api/goalkeepers/me/bookings/{bookingId}/withdraw': {
      post: {
        summary: 'Withdraw from a booking the goalkeeper took (feature 018)',
        description:
          'Allowed strictly before the start. The commission is not refunded. While the search is open (start − travel margin), a replacement booking with the same price is created and offered to other goalkeepers; the client is told. Less notice than the country threshold (2 h) suspends 3 days, and the 3rd withdrawal within 7 days suspends 7 days; suspensions never add up. Repeating it answers the same.',
        tags: ['Goalkeeper bookings'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'bookingId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: false,
          content: { 'application/json': { schema: { type: 'object', properties: { reason: { type: 'string', maxLength: 200, example: 'Me enfermé' } } } } },
        },
        responses: {
          '200': {
            description: 'Withdrawn now or already: the agenda item (status goalkeeper_withdrew) plus `withdrawal`',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/AgendaItem' },
                    { type: 'object', properties: { withdrawal: { $ref: '#/components/schemas/WithdrawalSummary' } }, required: ['withdrawal'] },
                  ],
                },
              },
            },
          },
          '400': { description: 'validation_failed: reason', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
          '401': { description: 'Not signed in' },
          '404': { description: 'goalkeeper_not_found, or booking_not_found (unknown, or never theirs)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '409': { description: 'booking_not_withdrawable (status) or match_started (startsAt)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/goalkeepers/me/withdrawals': {
      get: {
        summary: "The caller's withdrawals and penalties, newest first (feature 018)",
        tags: ['Goalkeeper bookings'],
        security: [{ bearerAuth: [] }],
        parameters: PAGING,
        responses: {
          '200': { description: 'A page of withdrawals and the suspension in force', content: { 'application/json': { schema: { $ref: '#/components/schemas/WithdrawalPage' } } } },
          '400': { description: 'validation_failed: page or pageSize' },
          '401': { description: 'Not signed in' },
          '404': { description: 'goalkeeper_not_found' },
        },
      },
    },
    '/api/admin/goalkeepers/{userId}/withdrawals': {
      get: {
        summary: "A goalkeeper's withdrawals and penalties, with who reversed what (administrators only)",
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string' } }, ...PAGING],
        responses: {
          '200': { description: 'A page of withdrawals', content: { 'application/json': { schema: { $ref: '#/components/schemas/WithdrawalPage' } } } },
          '400': { description: 'validation_failed: page or pageSize' },
          '401': { description: 'Not signed in' },
          '403': { description: 'Not an administrator' },
          '404': { description: 'goalkeeper_not_found' },
        },
      },
    },
    '/api/admin/goalkeepers/{userId}/withdrawals/{withdrawalId}/reversal': {
      post: {
        summary: "Reverse a withdrawal's money and/or suspensions, with a mandatory reason (administrators only)",
        description:
          'refund gives back the booking commission once (a commission_refund by the administrator); liftSuspension lifts its penalties and recomputes the suspension end immediately. Either one forgives the withdrawal: it no longer counts toward the weekly limit. Repeating it changes nothing.',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'withdrawalId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  refund: { type: 'boolean', default: false },
                  liftSuspension: { type: 'boolean', default: false },
                  reason: { type: 'string', minLength: 3, maxLength: 500, example: 'Incapacidad médica presentada' },
                },
                required: ['reason'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Reversed now, or nothing left to reverse: the withdrawal (admin view) and the suspension end',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    withdrawal: { $ref: '#/components/schemas/WithdrawalItem' },
                    suspendedUntil: { type: 'string', format: 'date-time', nullable: true },
                  },
                  required: ['withdrawal', 'suspendedUntil'],
                },
              },
            },
          },
          '400': { description: 'validation_failed: reason, or neither refund nor liftSuspension', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
          '401': { description: 'Not signed in' },
          '403': { description: 'Not an administrator' },
          '404': { description: 'goalkeeper_not_found or withdrawal_not_found' },
          '409': { description: 'missing_charge (bookingId): the booking has no commission charge to refund; nothing changed' },
          '422': { description: 'wallet_not_configured: a refund is asked but the goalkeeper wallet context cannot be resolved' },
        },
      },
    },
    '/api/ratings/pending': {
      get: {
        summary: "The caller's ratings still to give (feature 021), shown when the app opens (no push)",
        tags: ['Ratings'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Newest match first. side client → question goalkeeper_arrived; side goalkeeper → question payment_received',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          bookingId: { type: 'string' },
                          requestId: { type: 'string' },
                          side: { type: 'string', enum: ['client', 'goalkeeper'] },
                          question: { type: 'string', enum: ['goalkeeper_arrived', 'payment_received'] },
                          zoneName: { type: 'string', nullable: true },
                          cityName: { type: 'string', nullable: true },
                          startsAt: { type: 'string', format: 'date-time' },
                          startsAtLocal: { type: 'string' },
                          otherParty: { type: 'object', nullable: true, properties: { firstName: { type: 'string', nullable: true }, lastName: { type: 'string', nullable: true } } },
                          dueUntil: { type: 'string', format: 'date-time' },
                        },
                      },
                    },
                  },
                  required: ['items'],
                },
              },
            },
          },
          '401': { description: 'Not signed in' },
        },
      },
    },
    '/api/ratings/bookings/{bookingId}': {
      post: {
        summary: 'Rate the other side of a booking, once (feature 021; private)',
        description:
          'The client answers whether the goalkeeper came; the goalkeeper whether they were paid. A client "no" without a check-in records a no-show at once (3-day suspension) and opens a case; other "no" answers open a case. Open from the end of the match (the client also from the check-in) until 7 days after.',
        tags: ['Ratings'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'bookingId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { answer: { type: 'boolean' }, stars: { type: 'integer', minimum: 1, maximum: 5 }, comment: { type: 'string', maxLength: 500 } },
                required: ['answer', 'stars'],
              },
            },
          },
        },
        responses: {
          '201': { description: 'The rating (ratingId, bookingId, side, answer, stars, comment, createdAt)' },
          '400': { description: 'validation_failed' },
          '401': { description: 'Not signed in' },
          '404': { description: 'booking_not_found (unknown, or not the caller\u2019s)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '409': { description: 'already_rated, or not_rateable (reason: not_finished, expired, no_goalkeeper)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/admin/cases': {
      get: {
        summary: 'Cases for manual review, open first (administrators only; feature 021)',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['open', 'resolved'] } }, ...PAGING],
        responses: {
          '200': {
            description: 'A page of cases',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { items: { type: 'array', items: {
                type: 'object',
                properties: {
                  caseId: { type: 'string' },
                  type: { type: 'string', enum: ['goalkeeper_no_show', 'payment_not_received', 'late_attendance_claim'] },
                  status: { type: 'string', enum: ['open', 'resolved'] },
                  bookingId: { type: 'string' },
                  requestId: { type: 'string' },
                  clientId: { type: 'string' },
                  goalkeeperId: { type: 'string' },
                  noShowIncidentId: { type: 'string', nullable: true, description: 'Reverse it with the withdrawal reversal (018) if fair' },
                  createdAt: { type: 'string', format: 'date-time' },
                  resolution: { type: 'object', nullable: true, properties: { by: { type: 'string' }, at: { type: 'string', format: 'date-time' }, note: { type: 'string' } } },
                },
              } }, page: { type: 'integer' }, pageSize: { type: 'integer' }, totalItems: { type: 'integer' }, totalPages: { type: 'integer' } },
                },
              },
            },
          },
          '400': { description: 'validation_failed' },
          '401': { description: 'Not signed in' },
          '403': { description: 'Not an administrator' },
        },
      },
    },
    '/api/admin/cases/{caseId}': {
      get: {
        summary: 'One case with the rating that opened it and the check-in evidence (location included)',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'caseId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'The case, plus rating and checkIn' },
          '401': { description: 'Not signed in' },
          '403': { description: 'Not an administrator' },
          '404': { description: 'case_not_found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/admin/cases/{caseId}/resolve': {
      post: {
        summary: 'Close a case with a mandatory note (administrators only)',
        description: 'Resolving undoes nothing by itself: to lift a no-show penalty, reverse its incident (noShowIncidentId) with the withdrawal reversal.',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'caseId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { note: { type: 'string', minLength: 3, maxLength: 500 } }, required: ['note'] } } },
        },
        responses: {
          '200': { description: 'The resolved case' },
          '400': { description: 'validation_failed: note' },
          '401': { description: 'Not signed in' },
          '403': { description: 'Not an administrator' },
          '404': { description: 'case_not_found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '409': { description: 'case_already_resolved', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
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
    '/api/devices': {
      post: {
        summary: 'Register or refresh this device for push notifications',
        description:
          'Call after sign-in, on every app start with a session, and on every token refresh. Any signed-in user, with or without a completed profile. A token belongs to one user: registering a token another user had moves it to the caller. Tokens travel only in the body.',
        tags: ['Devices'],
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterDeviceRequest' } } } },
        responses: {
          '204': { description: 'Stored (new, refreshed or moved from another user — indistinguishable on purpose)' },
          '400': { description: 'validation_failed: token or platform', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
          '401': { description: 'Not signed in' },
        },
      },
    },
    '/api/devices/unregister': {
      post: {
        summary: 'Forget this device (call before signing out)',
        description: "Removes the token only when it is the caller's. Answers 204 whatever the token was, and is idempotent.",
        tags: ['Devices'],
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UnregisterDeviceRequest' } } } },
        responses: {
          '204': { description: 'Done' },
          '400': { description: 'validation_failed: token', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
          '401': { description: 'Not signed in' },
        },
      },
    },
    '/api/devices/test-push': {
      post: {
        summary: "Send a test push to the caller's own devices",
        description: 'data.type is "test". Limited per user (default 5 per minute).',
        tags: ['Devices'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Per-device result for the caller', content: { 'application/json': { schema: { $ref: '#/components/schemas/UserPushResult' } } } },
          '401': { description: 'Not signed in' },
          '429': {
            description: 'too_many_requests: body includes retryAfterSeconds; a Retry-After header is set',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/api/notifications': {
      get: {
        summary: "The caller's inbox, newest first, one page at a time",
        description: 'Any signed-in user. In feature 015 the entries are match offers to goalkeepers (type booking.available).',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'pageSize', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
        ],
        responses: {
          '200': { description: 'One page, with the unread count', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotificationsPage' } } } },
          '400': { description: 'validation_failed: invalid page or pageSize', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
          '401': { description: 'Not signed in' },
        },
      },
    },
    '/api/notifications/read-all': {
      post: {
        summary: "Mark every unread entry of the caller read",
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        responses: { '204': { description: 'Done' }, '401': { description: 'Not signed in' } },
      },
    },
    '/api/notifications/{notificationId}/read': {
      post: {
        summary: 'Mark one entry read (for an offer: opened, so it is never reminded again)',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'notificationId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '204': { description: 'Read (idempotent)' },
          '401': { description: 'Not signed in' },
          '404': { description: "notification_not_found: unknown, malformed, or someone else's", content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/notifications/{notificationId}/dismiss': {
      post: {
        summary: 'Dismiss an offer: never reminded again, and marked read',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'notificationId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '204': { description: 'Dismissed (idempotent)' },
          '401': { description: 'Not signed in' },
          '404': { description: 'notification_not_found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '409': { description: 'not_an_offer: only match offers can be dismissed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/goalkeepers/me/offers-availability': {
      put: {
        summary: 'Turn offers on or off',
        description:
          'Off: no offers (first notifications or reminders), an empty available-matches list and no accepting; the agenda is unaffected. Turning it on sends the offers for the open matches the goalkeeper can take right away, in one push.',
        tags: ['Goalkeeper bookings'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { available: { type: 'boolean' } }, required: ['available'] } } },
        },
        responses: {
          '200': {
            description: 'Saved; offersSent counts the new offers sent by turning it on',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { availableForOffers: { type: 'boolean' }, offersSent: { type: 'integer' } },
                  required: ['availableForOffers', 'offersSent'],
                },
              },
            },
          },
          '400': { description: 'validation_failed: available must be true or false', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } } } },
          '401': { description: 'Not signed in' },
          '404': { description: 'goalkeeper_not_found: not an active goalkeeper', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
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
