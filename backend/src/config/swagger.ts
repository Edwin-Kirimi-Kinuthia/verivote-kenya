/**
 * VeriVote Kenya - Swagger / OpenAPI Configuration
 *
 * Defines the complete OpenAPI 3.0 specification for the VeriVote Kenya API.
 * Mounted at GET /api/docs (Swagger UI) and GET /api/docs.json (raw spec).
 */

import type { Options } from 'swagger-jsdoc';

export const swaggerOptions: Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'VeriVote Kenya API',
      version: '1.0.0',
      description: `
Hybrid Electronic Voting System API for IEBC Kenya.

**Authentication:** Most endpoints require a Bearer JWT obtained from \`POST /api/voters/login\`.

**Roles:**
- \`VOTER\` — Can register, cast votes, verify receipts.
- \`ADMIN\` — Full access including manual verification, print queue management.

**Rate Limits:**
- Global: 100 req / 15 min
- Auth endpoints: 5 req / 15 min
- Vote casting: 5 req / 15 min
- Admin endpoints: 200 req / 15 min
      `.trim(),
      contact: {
        name: 'IEBC VeriVote Team',
        url: 'https://github.com/Edwin-Kirimi-Kinuthia/verivote-kenya',
      },
      license: {
        name: 'MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Local development server',
      },
      {
        url: 'https://api.verivote.iebc.go.ke',
        description: 'Production server',
      },
    ],
    tags: [
      { name: 'Health', description: 'Server status and health checks' },
      { name: 'Voters', description: 'Voter registration, login, and profile management' },
      { name: 'Votes', description: 'Vote casting and verification' },
      { name: 'Receipts', description: 'Cryptographic vote receipt verification' },
      { name: 'Print Queue', description: 'Centralized vote printing system (Admin only)' },
      { name: 'Admin', description: 'IEBC manual verification review (Admin only)' },
      { name: 'Appointments', description: 'Polling station appointment scheduling' },
      { name: 'Blockchain', description: 'Blockchain record queries' },
      { name: 'Stations', description: 'Polling station directory' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from POST /api/voters/login',
        },
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for mobile clients (issued by IEBC)',
        },
      },
      schemas: {
        // ── Common ──────────────────────────────────────────────────
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Descriptive error message' },
          },
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            total: { type: 'integer', example: 150 },
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 20 },
            totalPages: { type: 'integer', example: 8 },
            hasNext: { type: 'boolean', example: true },
            hasPrev: { type: 'boolean', example: false },
          },
        },
        // ── Enums ───────────────────────────────────────────────────
        VoterStatus: {
          type: 'string',
          enum: [
            'PENDING_VERIFICATION',
            'PENDING_MANUAL_REVIEW',
            'REGISTERED',
            'VERIFICATION_FAILED',
            'VOTED',
            'REVOTED',
            'DISTRESS_FLAGGED',
            'SUSPENDED',
          ],
        },
        VoteStatus: {
          type: 'string',
          enum: ['PENDING', 'CONFIRMED', 'SUPERSEDED', 'INVALIDATED'],
        },
        PrintStatus: {
          type: 'string',
          enum: ['PENDING', 'PRINTING', 'PRINTED', 'FAILED', 'CANCELLED'],
        },
        // ── Entities ────────────────────────────────────────────────
        Voter: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            nationalId: { type: 'string', example: '12345678' },
            fullName: { type: 'string', example: 'Jane Doe' },
            status: { $ref: '#/components/schemas/VoterStatus' },
            role: { type: 'string', enum: ['VOTER', 'ADMIN'] },
            pollingStationId: { type: 'string', format: 'uuid', nullable: true },
            voteCount: { type: 'integer', example: 0 },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Vote: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            serialNumber: { type: 'string', example: 'A1B2C3D4E5F60001' },
            status: { $ref: '#/components/schemas/VoteStatus' },
            encryptedVoteHash: { type: 'string' },
            blockchainTxHash: { type: 'string', nullable: true },
            isDistressFlagged: { type: 'boolean' },
            pollingStationId: { type: 'string', format: 'uuid' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        PrintJob: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            voteId: { type: 'string', format: 'uuid' },
            pollingStationId: { type: 'string', format: 'uuid' },
            status: { $ref: '#/components/schemas/PrintStatus' },
            priority: { type: 'integer', minimum: 0, maximum: 100, example: 0 },
            printerId: { type: 'string', nullable: true },
            printedAt: { type: 'string', format: 'date-time', nullable: true },
            printAttempts: { type: 'integer', example: 0 },
            lastError: { type: 'string', nullable: true },
            ballotNumber: { type: 'string', nullable: true, example: 'BAL-NAIR-LPX7-3A2F' },
            qrCodeData: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        PrintJobWithDetails: {
          allOf: [
            { $ref: '#/components/schemas/PrintJob' },
            {
              type: 'object',
              properties: {
                vote: { $ref: '#/components/schemas/Vote' },
                pollingStation: { $ref: '#/components/schemas/PollingStation' },
              },
            },
          ],
        },
        SecurePrintFormat: {
          type: 'object',
          description: 'Secure ballot format returned to the printer driver',
          properties: {
            ballotNumber: { type: 'string', example: 'BAL-NAIR-LPX7-3A2F' },
            serialNumber: { type: 'string', example: 'A1B2C3D4E5F60001' },
            voteHash: { type: 'string', example: 'sha256-of-encrypted-data' },
            pollingStation: { type: 'string', example: 'Nairobi Central (NAIR001)' },
            timestamp: { type: 'string', format: 'date-time' },
            verificationCode: { type: 'string', example: 'AB12CD34' },
            isDistress: { type: 'boolean' },
          },
        },
        PrintQueueStats: {
          type: 'object',
          properties: {
            total: { type: 'integer' },
            byStatus: {
              type: 'object',
              properties: {
                pending: { type: 'integer' },
                printing: { type: 'integer' },
                printed: { type: 'integer' },
                failed: { type: 'integer' },
                cancelled: { type: 'integer' },
              },
            },
            failureRate: { type: 'number', description: 'Percentage of failed prints', example: 2.5 },
          },
        },
        ReconciliationReport: {
          type: 'object',
          properties: {
            totalJobs: { type: 'integer' },
            printed: { type: 'integer' },
            pending: { type: 'integer' },
            failed: { type: 'integer' },
            cancelled: { type: 'integer' },
            failureRate: { type: 'number' },
            stuckJobsReset: { type: 'integer', description: 'Jobs reset from PRINTING back to PENDING' },
            generatedAt: { type: 'string', format: 'date-time' },
          },
        },
        PollingStation: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            code: { type: 'string', example: 'NAIR001' },
            name: { type: 'string', example: 'Nairobi Central Primary' },
            county: { type: 'string', example: 'Nairobi' },
            constituency: { type: 'string', example: 'Starehe' },
            ward: { type: 'string', example: 'Nairobi Central' },
            registeredVoters: { type: 'integer' },
            isActive: { type: 'boolean' },
          },
        },
      },
      // ── Reusable Parameters ──────────────────────────────────────
      parameters: {
        PageParam: {
          name: 'page',
          in: 'query',
          schema: { type: 'integer', minimum: 1, default: 1 },
        },
        LimitParam: {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
      // ── Reusable Responses ───────────────────────────────────────
      responses: {
        Unauthorized: {
          description: 'Missing or invalid JWT',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        Forbidden: {
          description: 'Insufficient permissions',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        BadRequest: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        InternalError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
      },
    },
    // ── Inline path definitions ─────────────────────────────────────
    paths: {
      // ── Health ──────────────────────────────────────────────────
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Server health check',
          description: 'Returns current status of the server, database, and blockchain connection.',
          responses: {
            '200': {
              description: 'Server is healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'healthy' },
                      timestamp: { type: 'string', format: 'date-time' },
                      uptime: { type: 'number', example: 3600 },
                      database: { type: 'string', example: 'connected' },
                      blockchain: { type: 'string', example: 'connected' },
                    },
                  },
                },
              },
            },
            '503': { description: 'Server is unhealthy' },
          },
        },
      },
      '/api/stats': {
        get: {
          tags: ['Health'],
          summary: 'Get aggregate system statistics',
          responses: {
            '200': {
              description: 'Statistics returned',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          voters: { type: 'object' },
                          votes: { type: 'object' },
                          pollingStations: { type: 'object' },
                          printQueue: { $ref: '#/components/schemas/PrintQueueStats' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      // ── Polling Stations ────────────────────────────────────────
      '/api/polling-stations': {
        get: {
          tags: ['Stations'],
          summary: 'List polling stations',
          parameters: [
            { $ref: '#/components/parameters/PageParam' },
            { $ref: '#/components/parameters/LimitParam' },
            { name: 'county', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'Paginated list of active polling stations' },
          },
        },
      },
      '/api/counties': {
        get: {
          tags: ['Stations'],
          summary: 'List all counties with polling stations',
          responses: {
            '200': { description: 'Array of county names' },
          },
        },
      },
      // ── Voters ──────────────────────────────────────────────────
      '/api/voters/register': {
        post: {
          tags: ['Voters'],
          summary: 'Register a new voter',
          description: 'Initiates voter registration with national ID verification via Persona.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['nationalId', 'fullName', 'pin'],
                  properties: {
                    nationalId: { type: 'string', example: '12345678' },
                    fullName: { type: 'string', example: 'Jane Doe' },
                    pin: { type: 'string', minLength: 4, maxLength: 6, example: '1234' },
                    pollingStationId: { type: 'string', format: 'uuid' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Voter registered successfully' },
            '400': { $ref: '#/components/responses/BadRequest' },
            '409': { description: 'Voter already registered' },
          },
        },
      },
      '/api/voters/login': {
        post: {
          tags: ['Voters'],
          summary: 'Voter login',
          description: 'Authenticate with national ID and PIN. Returns a JWT.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['nationalId', 'pin'],
                  properties: {
                    nationalId: { type: 'string', example: '12345678' },
                    pin: { type: 'string', example: '1234' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Login successful',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          token: { type: 'string' },
                          voter: { $ref: '#/components/schemas/Voter' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/api/voters/me': {
        get: {
          tags: ['Voters'],
          summary: 'Get current voter profile',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { description: 'Voter profile' },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      // ── Votes ───────────────────────────────────────────────────
      '/api/votes/cast': {
        post: {
          tags: ['Votes'],
          summary: 'Cast a vote',
          description: 'Encrypted vote casting. Voter must be REGISTERED or eligible for revote.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['selections'],
                  properties: {
                    selections: {
                      type: 'object',
                      description: 'Map of race ID → candidate ID',
                      example: { 'president': 'cand-uuid', 'governor': 'cand-uuid' },
                    },
                    pollingStationId: { type: 'string', format: 'uuid' },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Vote cast successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          serialNumber: { type: 'string', example: 'A1B2C3D4E5F60001' },
                          voteId: { type: 'string', format: 'uuid' },
                          blockchainTxHash: { type: 'string', nullable: true },
                          timestamp: { type: 'string', format: 'date-time' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { $ref: '#/components/responses/BadRequest' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
          },
        },
      },
      '/api/votes/verify/{serial}': {
        get: {
          tags: ['Votes'],
          summary: 'Verify a vote by serial number',
          description: 'Public endpoint — verifies cryptographic integrity and blockchain record.',
          parameters: [
            {
              name: 'serial',
              in: 'path',
              required: true,
              schema: { type: 'string', pattern: '^[0-9A-Fa-f]{16}$' },
              example: 'A1B2C3D4E5F60001',
            },
          ],
          responses: {
            '200': { description: 'Verification result' },
            '400': { $ref: '#/components/responses/BadRequest' },
            '404': { $ref: '#/components/responses/NotFound' },
          },
        },
      },
      // ── Receipts ────────────────────────────────────────────────
      '/api/receipts/{serial}': {
        get: {
          tags: ['Receipts'],
          summary: 'Get vote receipt by serial number',
          parameters: [
            {
              name: 'serial',
              in: 'path',
              required: true,
              schema: { type: 'string', pattern: '^[0-9A-Fa-f]{16}$' },
            },
          ],
          responses: {
            '200': { description: 'Receipt found' },
            '404': { $ref: '#/components/responses/NotFound' },
          },
        },
      },
      // ── Print Queue ─────────────────────────────────────────────
      '/api/print-queue/add': {
        post: {
          tags: ['Print Queue'],
          summary: 'Add a vote to the print queue',
          description: 'Idempotent — duplicate votes are silently ignored.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['voteId', 'pollingStationId'],
                  properties: {
                    voteId: { type: 'string', format: 'uuid' },
                    pollingStationId: { type: 'string', format: 'uuid' },
                    priority: { type: 'integer', minimum: 0, maximum: 100, default: 0 },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Job created (or existing job returned)',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/SuccessResponse' },
                      {
                        type: 'object',
                        properties: {
                          data: { $ref: '#/components/schemas/PrintJob' },
                        },
                      },
                    ],
                  },
                },
              },
            },
            '400': { $ref: '#/components/responses/BadRequest' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
            '404': { $ref: '#/components/responses/NotFound' },
          },
        },
      },
      '/api/print-queue/batch': {
        post: {
          tags: ['Print Queue'],
          summary: 'Batch-add multiple votes to the print queue',
          description: 'Add up to 500 votes at once. Duplicates are skipped automatically.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['voteIds', 'pollingStationId'],
                  properties: {
                    voteIds: {
                      type: 'array',
                      items: { type: 'string', format: 'uuid' },
                      maxItems: 500,
                    },
                    pollingStationId: { type: 'string', format: 'uuid' },
                    priority: { type: 'integer', minimum: 0, maximum: 100, default: 0 },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Batch result',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          added: { type: 'integer' },
                          skipped: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/print-queue/process': {
        post: {
          tags: ['Print Queue'],
          summary: 'Claim and process the next pending print job',
          description: 'Returns the secure ballot format for the printer driver. Returns null if no pending jobs.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['printerId'],
                  properties: {
                    printerId: { type: 'string', maxLength: 100, example: 'PRINTER-001' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Print job result or null if queue empty',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        nullable: true,
                        type: 'object',
                        properties: {
                          jobId: { type: 'string', format: 'uuid' },
                          ballotNumber: { type: 'string' },
                          qrCodeData: { type: 'string' },
                          printFormat: { $ref: '#/components/schemas/SecurePrintFormat' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/print-queue/stats': {
        get: {
          tags: ['Print Queue'],
          summary: 'Get print queue statistics',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'Statistics',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { $ref: '#/components/schemas/PrintQueueStats' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/print-queue/reconcile': {
        get: {
          tags: ['Print Queue'],
          summary: 'Run print queue reconciliation',
          description: 'Resets stuck PRINTING jobs and returns a reconciliation report.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'stuckMinutes',
              in: 'query',
              description: 'Minutes before a PRINTING job is considered stuck (default 5)',
              schema: { type: 'integer', minimum: 1, default: 5 },
            },
          ],
          responses: {
            '200': {
              description: 'Reconciliation report',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { $ref: '#/components/schemas/ReconciliationReport' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/print-queue': {
        get: {
          tags: ['Print Queue'],
          summary: 'List print jobs',
          security: [{ bearerAuth: [] }],
          parameters: [
            { $ref: '#/components/parameters/PageParam' },
            { $ref: '#/components/parameters/LimitParam' },
            {
              name: 'status',
              in: 'query',
              schema: { $ref: '#/components/schemas/PrintStatus' },
            },
            {
              name: 'pollingStationId',
              in: 'query',
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': { description: 'Paginated list of print jobs' },
          },
        },
      },
      '/api/print-queue/{id}': {
        get: {
          tags: ['Print Queue'],
          summary: 'Get a single print job with full details',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': {
              description: 'Print job detail',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { $ref: '#/components/schemas/PrintJobWithDetails' },
                    },
                  },
                },
              },
            },
            '404': { $ref: '#/components/responses/NotFound' },
          },
        },
      },
      '/api/print-queue/{id}/cancel': {
        patch: {
          tags: ['Print Queue'],
          summary: 'Cancel a print job',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': { description: 'Job cancelled' },
            '404': { $ref: '#/components/responses/NotFound' },
            '409': { description: 'Job cannot be cancelled (already printed or cancelled)' },
          },
        },
      },
      '/api/print-queue/{id}/retry': {
        patch: {
          tags: ['Print Queue'],
          summary: 'Retry a failed print job',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': { description: 'Job reset to PENDING' },
            '404': { $ref: '#/components/responses/NotFound' },
            '409': { description: 'Only FAILED jobs can be retried' },
          },
        },
      },
      '/api/print-queue/{id}/priority': {
        patch: {
          tags: ['Print Queue'],
          summary: 'Update job priority',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['priority'],
                  properties: {
                    priority: { type: 'integer', minimum: 0, maximum: 100 },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Priority updated' },
            '404': { $ref: '#/components/responses/NotFound' },
          },
        },
      },
      // ── Admin ───────────────────────────────────────────────────
      '/api/admin/pending-reviews': {
        get: {
          tags: ['Admin'],
          summary: 'List voters awaiting manual verification',
          security: [{ bearerAuth: [] }],
          parameters: [
            { $ref: '#/components/parameters/PageParam' },
            { $ref: '#/components/parameters/LimitParam' },
          ],
          responses: {
            '200': { description: 'Paginated list of voters pending manual review' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
          },
        },
      },
      '/api/admin/review-stats': {
        get: {
          tags: ['Admin'],
          summary: 'Get manual review statistics',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Review statistics' } },
        },
      },
      '/api/admin/review/{voterId}': {
        get: {
          tags: ['Admin'],
          summary: 'Get voter details for review',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'voterId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: { '200': { description: 'Voter review details' } },
        },
      },
      '/api/admin/approve/{voterId}': {
        post: {
          tags: ['Admin'],
          summary: 'Approve a voter manual verification',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'voterId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    reviewerId: { type: 'string' },
                    notes: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Voter approved' } },
        },
      },
      '/api/admin/reject/{voterId}': {
        post: {
          tags: ['Admin'],
          summary: 'Reject a voter manual verification',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'voterId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['reviewerId', 'reason'],
                  properties: {
                    reviewerId: { type: 'string' },
                    reason: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Voter rejected' } },
        },
      },
      // ── Blockchain ──────────────────────────────────────────────
      '/api/blockchain/status': {
        get: {
          tags: ['Blockchain'],
          summary: 'Get blockchain connection status',
          responses: { '200': { description: 'Blockchain status' } },
        },
      },
    },
  },
  apis: [], // Using inline paths above, not JSDoc scanning
};
