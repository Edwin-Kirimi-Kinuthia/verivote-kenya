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
        url: 'http://localhost:3005',
        description: 'Local development server',
      },
      {
        url: 'https://api.verivote.iebc.go.ke',
        description: 'Production server',
      },
    ],
    tags: [
      { name: 'Health', description: 'Server status and health checks' },
      { name: 'Admin Auth', description: 'Multi-step admin authentication (password → OTP/WebAuthn)' },
      { name: 'Voters', description: 'Voter registration, login, and profile management' },
      { name: 'Elections', description: 'Election management — lifecycle, positions, candidates, enrollments' },
      { name: 'Votes', description: 'Vote casting, ballot retrieval, and verification' },
      { name: 'Declarations', description: 'Formal result declarations by Returning Officers' },
      { name: 'Paper Ballots', description: 'Form 34A-style audit manifests and print event logging' },
      { name: 'Staff', description: 'IEBC staff management — roles, jurisdictions, dashboard' },
      { name: 'Receipts', description: 'Cryptographic vote receipt verification' },
      { name: 'Print Queue', description: 'Centralized vote printing system (Admin only)' },
      { name: 'Admin', description: 'IEBC manual verification, tally ceremony, and distress management' },
      { name: 'Appointments', description: 'Polling station appointment scheduling' },
      { name: 'Blockchain', description: 'Blockchain record queries and vote anchoring' },
      { name: 'Stations', description: 'Polling station directory and geographic hierarchy' },
      { name: 'AI', description: 'On-premise AI fraud detection and reporting service' },
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
      '/api/blockchain/verify-vote/{serialNumber}': {
        get: {
          tags: ['Blockchain'],
          summary: 'Verify a vote record on the blockchain',
          parameters: [
            { name: 'serialNumber', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'Vote blockchain record' },
            '404': { $ref: '#/components/responses/NotFound' },
          },
        },
      },
      // ── Admin Auth (multi-step) ─────────────────────────────────
      '/api/admin-auth/login': {
        post: {
          tags: ['Admin Auth'],
          summary: 'Admin login step 1 — password',
          description: 'Validates credentials, sends OTP, returns a 5-minute step token.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['identifier', 'password'],
                  properties: {
                    identifier: { type: 'string', example: '00000001', description: 'National ID, email, or phone' },
                    password: { type: 'string', example: 'Admin@1234' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Step token issued — proceed to verify-otp or webauthn-verify',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          stepToken: { type: 'string' },
                          contactHint: { type: 'string', example: 'ad***@iebc.go.ke' },
                          hasWebAuthn: { type: 'boolean' },
                          mockCode: { type: 'string', description: 'Development only — OTP code' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '403': { description: 'Not an ADMIN account' },
          },
        },
      },
      '/api/admin-auth/verify-otp': {
        post: {
          tags: ['Admin Auth'],
          summary: 'Admin login step 2a — OTP',
          description: 'Validates step token + 6-digit OTP → issues full session JWT with staff fields.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['stepToken', 'code'],
                  properties: {
                    stepToken: { type: 'string' },
                    code: { type: 'string', pattern: '^\\d{6}$', example: '123456' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Full session JWT issued' },
            '401': { description: 'Step token expired or invalid OTP' },
          },
        },
      },
      // ── Auth (Voter OTP login) ──────────────────────────────────
      '/api/auth/login': {
        post: {
          tags: ['Voters'],
          summary: 'Password login (voter or admin)',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['identifier', 'password'],
                  properties: {
                    identifier: { type: 'string', example: '12345678' },
                    password: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'JWT token issued' } },
        },
      },
      '/api/auth/request-otp': {
        post: {
          tags: ['Voters'],
          summary: 'Request OTP for login or contact verification',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['nationalId'],
                  properties: {
                    nationalId: { type: 'string', example: '12345678', description: 'National ID, passport, or synthetic ID (E-xxxxxxxxxxxxxxxx)' },
                    purpose: { type: 'string', enum: ['LOGIN', 'CONTACT_VERIFY', 'CREDENTIAL_RESET'], default: 'LOGIN' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'OTP sent to voter contact' },
            '404': { description: 'Voter not found' },
          },
        },
      },
      '/api/auth/verify-otp': {
        post: {
          tags: ['Voters'],
          summary: 'Verify OTP — issues JWT (LOGIN) or marks contact verified',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['nationalId', 'code'],
                  properties: {
                    nationalId: { type: 'string' },
                    code: { type: 'string', pattern: '^\\d{6}$' },
                    purpose: { type: 'string', enum: ['LOGIN', 'CONTACT_VERIFY', 'CREDENTIAL_RESET'], default: 'LOGIN' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'JWT issued or contact verified' } },
        },
      },
      // ── Voter registration ──────────────────────────────────────
      '/api/voters/mock-verify': {
        post: {
          tags: ['Voters'],
          summary: 'Simulate Persona KYC completion (mock mode only)',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['inquiryId'],
                  properties: { inquiryId: { type: 'string' } },
                },
              },
            },
          },
          responses: { '200': { description: 'KYC simulated' }, '403': { description: 'Only available in mock mode' } },
        },
      },
      '/api/voters/registration-status/{inquiryId}': {
        get: {
          tags: ['Voters'],
          summary: 'Poll Persona KYC status',
          parameters: [{ name: 'inquiryId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Registration status and optional setupToken' } },
        },
      },
      '/api/voters/set-pin': {
        post: {
          tags: ['Voters'],
          summary: 'Set voter PIN (normal 4-digit PIN)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['pin'],
                  properties: {
                    pin: { type: 'string', pattern: '^\\d{4}$', example: '7391' },
                    distressPin: { type: 'string', pattern: '^\\d{4}$', description: 'Optional distress PIN (server generates one if not supplied)' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'PIN set successfully' } },
        },
      },
      '/api/voters/complete-contact-verification': {
        post: {
          tags: ['Voters'],
          summary: 'Complete contact verification → REGISTERED status + setupToken',
          description: 'Called after OTP verify for non-KYC elections. Optionally auto-enrolls voter in the election.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['voterId'],
                  properties: {
                    voterId: { type: 'string', format: 'uuid' },
                    electionId: { type: 'string', format: 'uuid', description: 'If provided, auto-enrolls voter in this non-GOVERNMENT election' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Voter registered with setupToken for PIN/WebAuthn setup' } },
        },
      },
      // ── Elections (public + admin) ──────────────────────────────
      '/api/elections/public': {
        get: {
          tags: ['Elections'],
          summary: 'List public elections (non-DRAFT, public fields only)',
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['NOMINATIONS', 'ACTIVE', 'CLOSED', 'TALLIED', 'ARCHIVED'] } },
          ],
          responses: { '200': { description: 'Public election list' } },
        },
      },
      '/api/elections/public/{id}': {
        get: {
          tags: ['Elections'],
          summary: 'Get a single public election with positions/candidates',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Public election detail' }, '404': { $ref: '#/components/responses/NotFound' } },
        },
      },
      '/api/elections': {
        get: {
          tags: ['Elections'],
          summary: 'List all elections (admin)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { $ref: '#/components/parameters/PageParam' },
            { $ref: '#/components/parameters/LimitParam' },
            { name: 'type', in: 'query', schema: { type: 'string', enum: ['GOVERNMENT', 'INSTITUTIONAL', 'CORPORATE', 'CUSTOM'] } },
            { name: 'status', in: 'query', schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Paginated election list' } },
        },
        post: {
          tags: ['Elections'],
          summary: 'Create election (commission tier only)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'type'],
                  properties: {
                    name: { type: 'string', example: 'General Election 2027' },
                    type: { type: 'string', enum: ['GOVERNMENT', 'INSTITUTIONAL', 'CORPORATE', 'CUSTOM'] },
                    authMethod: { type: 'string', enum: ['PERSONA_KYC', 'EMAIL_DOMAIN', 'OTP_ONLY'], default: 'OTP_ONLY' },
                    allowedDomains: { type: 'array', items: { type: 'string' }, example: ['uon.ac.ke'] },
                    startDate: { type: 'string', format: 'date-time' },
                    endDate: { type: 'string', format: 'date-time' },
                    eligibilityNote: { type: 'string' },
                    countryCode: { type: 'string', example: 'KE' },
                  },
                },
              },
            },
          },
          responses: { '201': { description: 'Election created' } },
        },
      },
      '/api/elections/{id}': {
        get: {
          tags: ['Elections'],
          summary: 'Get election detail with positions and candidates (admin)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Election detail' } },
        },
        patch: {
          tags: ['Elections'],
          summary: 'Update election metadata (commission only)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Updated election' } },
        },
        delete: {
          tags: ['Elections'],
          summary: 'Delete election (commission only, DRAFT status required unless force=true)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'force', in: 'query', schema: { type: 'boolean', default: false } },
          ],
          responses: { '200': { description: 'Election deleted' } },
        },
      },
      '/api/elections/{id}/status': {
        patch: {
          tags: ['Elections'],
          summary: 'Transition election status (commission only)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['status'],
                  properties: { status: { type: 'string', enum: ['DRAFT', 'NOMINATIONS', 'ACTIVE', 'CLOSED', 'TALLIED', 'ARCHIVED'] } },
                },
              },
            },
          },
          responses: { '200': { description: 'Status updated' } },
        },
      },
      // ── Staff ────────────────────────────────────────────────────
      '/api/staff': {
        get: {
          tags: ['Staff'],
          summary: 'List IEBC staff (admin)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'staffRole', in: 'query', schema: { type: 'string' } },
            { name: 'jurisdictionLevel', in: 'query', schema: { type: 'string', enum: ['NATIONAL', 'COUNTY', 'CONSTITUENCY', 'WARD', 'POLLING_STATION'] } },
            { name: 'jurisdictionValue', in: 'query', schema: { type: 'string' } },
            { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
          ],
          responses: { '200': { description: 'Staff list' } },
        },
        post: {
          tags: ['Staff'],
          summary: 'Create staff record (commission or field officers for subordinate roles)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['nationalId', 'staffRole', 'jurisdictionLevel'],
                  properties: {
                    nationalId: { type: 'string', example: '12345678' },
                    staffRole: { type: 'string', example: 'COUNTY_RO' },
                    jurisdictionLevel: { type: 'string', enum: ['NATIONAL', 'COUNTY', 'CONSTITUENCY', 'WARD', 'POLLING_STATION'] },
                    jurisdictionValue: { type: 'string', example: 'Nairobi' },
                    department: { type: 'string', example: 'ICT' },
                    pollingStationId: { type: 'string', format: 'uuid' },
                  },
                },
              },
            },
          },
          responses: { '201': { description: 'Staff created' } },
        },
      },
      '/api/staff/me': {
        get: {
          tags: ['Staff'],
          summary: 'Get current user\'s staff record',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Staff record or null if not a staff member' } },
        },
      },
      '/api/staff/dashboard': {
        get: {
          tags: ['Staff'],
          summary: 'Role-scoped dashboard data for logged-in staff',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Dashboard data filtered to officer\'s jurisdiction' } },
        },
      },
      '/api/staff/{id}': {
        get: {
          tags: ['Staff'],
          summary: 'Get staff record by ID',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Staff record' }, '404': { $ref: '#/components/responses/NotFound' } },
        },
        patch: {
          tags: ['Staff'],
          summary: 'Update staff role/jurisdiction',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Updated' } },
        },
        delete: {
          tags: ['Staff'],
          summary: 'Deactivate staff member',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Deactivated' } },
        },
      },
      // ── Declarations ─────────────────────────────────────────────
      '/api/declarations/public/{electionId}': {
        get: {
          tags: ['Declarations'],
          summary: 'Get public declared results for an election',
          parameters: [{ name: 'electionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'DECLARED declarations with tally snapshots' } },
        },
      },
      '/api/declarations': {
        get: {
          tags: ['Declarations'],
          summary: 'List declarations (admin)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'electionId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'positionId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['DRAFT', 'DECLARED', 'CONTESTED', 'ANNULLED'] } },
          ],
          responses: { '200': { description: 'Declaration list' } },
        },
        post: {
          tags: ['Declarations'],
          summary: 'Create draft declaration (RO roles)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['electionId', 'positionId'],
                  properties: {
                    electionId: { type: 'string', format: 'uuid' },
                    positionId: { type: 'string', format: 'uuid' },
                    tallySnapshot: { type: 'object', additionalProperties: { type: 'number' }, example: { 'Alice Wanjiku': 1547, 'John Kamau': 1203 } },
                  },
                },
              },
            },
          },
          responses: { '201': { description: 'Draft declaration created' } },
        },
      },
      '/api/declarations/{id}/declare': {
        post: {
          tags: ['Declarations'],
          summary: 'Formally declare results (RO roles)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Declaration formally declared' } },
        },
      },
      // ── Paper Ballots ────────────────────────────────────────────
      '/api/paper-ballots/manifest/{electionId}': {
        get: {
          tags: ['Paper Ballots'],
          summary: 'Generate Form 34A-style ballot manifest for printing',
          description: 'Returns blockchain-verified vote commitments and declared results. Scoped to officer\'s jurisdiction.',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'electionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': {
              description: 'Ballot manifest with blockchain verification section',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          election: { type: 'object' },
                          officer: { type: 'object' },
                          voteStats: { type: 'object' },
                          blockchainVerification: { type: 'object' },
                          positions: { type: 'array' },
                          formReference: { type: 'string', example: 'VV-E9013500-NATIONAL-1773933234755' },
                          generatedAt: { type: 'string', format: 'date-time' },
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
      '/api/paper-ballots/print-log': {
        post: {
          tags: ['Paper Ballots'],
          summary: 'Record a manifest print event (persisted to audit log)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['electionId', 'formReference'],
                  properties: {
                    electionId: { type: 'string', format: 'uuid' },
                    formReference: { type: 'string', example: 'VV-E9013500-NATIONAL-1773933234755' },
                    pageCount: { type: 'integer', default: 1 },
                    blockchainVerifiedCount: { type: 'integer', default: 0 },
                  },
                },
              },
            },
          },
          responses: { '201': { description: 'Print log created' } },
        },
      },
      '/api/paper-ballots/print-logs/{electionId}': {
        get: {
          tags: ['Paper Ballots'],
          summary: 'List manifest print events for an election',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'electionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Print log list' } },
        },
      },
      // ── Election-specific station endpoints ─────────────────────
      '/api/elections/{id}/stations': {
        get: {
          tags: ['Elections', 'Stations'],
          summary: 'Get polling stations linked to this election\'s jurisdiction tree',
          description: 'Returns stations that have been explicitly linked to jurisdiction nodes via pollingStationId. Supports geographic filtering.',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Election ID' },
            { name: 'county', in: 'query', schema: { type: 'string' }, description: 'Filter by county name' },
            { name: 'constituency', in: 'query', schema: { type: 'string' }, description: 'Filter by constituency name' },
            { name: 'lat', in: 'query', schema: { type: 'number' }, description: 'Latitude for proximity filter' },
            { name: 'lng', in: 'query', schema: { type: 'number' }, description: 'Longitude for proximity filter' },
            { name: 'radius', in: 'query', schema: { type: 'number', default: 10 }, description: 'Search radius in km (default: 10)' },
          ],
          responses: {
            '200': {
              description: 'Linked stations with hierarchy path',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            stationId:    { type: 'string', format: 'uuid' },
                            stationCode:  { type: 'string', example: 'NAI-WL-001' },
                            stationName:  { type: 'string', example: 'Westlands Primary School' },
                            county:       { type: 'string', example: 'Nairobi' },
                            constituency: { type: 'string', example: 'Westlands' },
                            ward:         { type: 'string', example: 'Parklands/Highridge' },
                            latitude:     { type: 'number', nullable: true, example: -1.26 },
                            longitude:    { type: 'number', nullable: true, example: 36.80 },
                            nodeId:       { type: 'string', format: 'uuid' },
                            nodePath:     { type: 'array', items: { type: 'string' }, example: ['Kenya', 'Nairobi', 'Westlands', 'Westlands Primary School'] },
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
      },
      '/api/elections/{id}/jurisdictions/{nodeId}/link-station': {
        patch: {
          tags: ['Elections'],
          summary: 'Link a physical polling station to a jurisdiction node',
          description: 'Explicitly links a PollingStation record to a jurisdiction node so that voters at that station receive the correct ballot via ancestor traversal. A station can only be linked to one node per election.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Election ID' },
            { name: 'nodeId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Jurisdiction node ID' },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['pollingStationId'],
                  properties: {
                    pollingStationId: { type: 'string', format: 'uuid', description: 'ID of the PollingStation to link' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Node updated with station link' },
            '400': { $ref: '#/components/responses/BadRequest' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
            '404': { $ref: '#/components/responses/NotFound' },
            '409': { description: 'Station is already linked to another node in this election' },
          },
        },
      },
      // ── Ballot (voter) ───────────────────────────────────────────
      '/api/ballot/active': {
        get: {
          tags: ['Votes'],
          summary: 'List active elections this voter is eligible for',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Active elections list' } },
        },
      },
      '/api/ballot/{electionId}': {
        get: {
          tags: ['Votes'],
          summary: 'Get personalised ballot for voter (positions + eligible candidates)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'electionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Voter\'s personalised ballot' } },
        },
      },
      // ── Tally ────────────────────────────────────────────────────
      '/api/tally/start': {
        post: {
          tags: ['Admin'],
          summary: 'Run decryption ceremony for an election (admin only)',
          description: 'Decrypts all CONFIRMED votes for the election, tallies using DB positions/candidates, stores result in election.tallyResultJson, and transitions election to TALLIED.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['electionId'],
                  properties: { electionId: { type: 'string', format: 'uuid' } },
                },
              },
            },
          },
          responses: { '200': { description: 'Tally result with per-position candidate tallies and ceremony log' }, '400': { description: 'electionId missing or election not in CLOSED/ACTIVE state' } },
        },
      },
      '/api/tally/results/{electionId}': {
        get: {
          tags: ['Admin'],
          summary: 'Get cached tally results for an election (admin only)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'electionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Tally results' }, '404': { description: 'No tally run yet for this election' } },
        },
      },
      '/api/tally/publish': {
        post: {
          tags: ['Admin'],
          summary: 'Publish tally hash on-chain (admin only)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', required: ['electionId'], properties: { electionId: { type: 'string', format: 'uuid' } } },
              },
            },
          },
          responses: { '200': { description: 'Transaction hash + results hash' } },
        },
      },
      '/api/tally/audit-report/{electionId}': {
        get: {
          tags: ['Admin'],
          summary: 'Full audit report for an election (admin only)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'electionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Full tally data with NIRU compliance notes' }, '404': { description: 'No tally run yet' } },
        },
      },
      // ── AI Service ───────────────────────────────────────────────
      '/api/ai/health': {
        get: {
          tags: ['AI'],
          summary: 'AI fraud detection service health',
          responses: { '200': { description: 'AI service status and model loaded state' } },
        },
      },
      '/api/ai/analyze-voting-pattern': {
        post: {
          tags: ['AI'],
          summary: 'Analyze voting pattern for fraud detection (admin only)',
          description: 'All fields use snake_case. Values must be normalized 0.0–1.0 floats.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['station_code','voting_velocity','temporal_deviation','geographic_cluster_score','repeat_attempt_rate','distress_correlation'],
                  properties: {
                    station_code:             { type: 'string', description: 'IEBC polling station code', example: 'NBI-001' },
                    voting_velocity:          { type: 'number', minimum: 0, maximum: 1, description: 'Normalised votes/hour rate', example: 0.85 },
                    temporal_deviation:       { type: 'number', minimum: 0, maximum: 1, description: 'Deviation from expected voting time distribution', example: 0.3 },
                    geographic_cluster_score: { type: 'number', minimum: 0, maximum: 1, description: 'Geographic clustering anomaly score', example: 0.6 },
                    repeat_attempt_rate:      { type: 'number', minimum: 0, maximum: 1, description: 'Rate of repeated authentication attempts', example: 0.1 },
                    distress_correlation:     { type: 'number', minimum: 0, maximum: 1, description: 'Correlation with distress PIN usage', example: 0.0 },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Anomaly score, alert level, triggered rules and LLM explanation' }, '503': { description: 'AI service unavailable' } },
        },
      },
      '/api/ai/reports/fraud': {
        get: {
          tags: ['AI'],
          summary: 'Fraud activity report (admin only)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'hours', in: 'query', schema: { type: 'integer', default: 24, maximum: 168 } }],
          responses: { '200': { description: 'Fraud report' } },
        },
      },
      '/api/ai/reports/integrity': {
        get: {
          tags: ['AI'],
          summary: 'Blockchain vs tally integrity report (admin only)',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Integrity report' } },
        },
      },
      // ── Geo ──────────────────────────────────────────────────────
      '/api/geo/counties': {
        get: {
          tags: ['Stations'],
          summary: 'List all 47 counties (admin)',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Array of county names' } },
        },
      },
      '/api/geo/constituencies': {
        get: {
          tags: ['Stations'],
          summary: 'List constituencies (admin)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'county', in: 'query', schema: { type: 'string' } }],
          responses: { '200': { description: 'Constituencies with county' } },
        },
      },
      '/api/geo/wards': {
        get: {
          tags: ['Stations'],
          summary: 'List wards (admin)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'county', in: 'query', schema: { type: 'string' } },
            { name: 'constituency', in: 'query', schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Wards with county and constituency' } },
        },
      },
    },
  },
  apis: [], // Using inline paths above, not JSDoc scanning
};
