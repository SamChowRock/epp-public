import { ExternalStart } from './external-start.js';
import { MINI_PUBLIC_PATHS, MiniLoginSchema, MiniLinkSchema, MiniLoginResultSchema } from './mini-contract.js';
import { RECOVERY_PATHS, RecoveryRequestSchema, RecoveryConfirmSchema, RecoveryAcceptedSchema, RegistrationSchema } from './recovery-contract.js';
import { CsrfSchema, LoginSchema, ChangePasswordSchema, SessionIdentitySchema, SessionListSchema } from './auth-contract.js';
import { LearningQuerySchema, StarMapQuerySchema, LearningListSchema, LearningDetailSchema, StarMapSchema } from './learning-contract.js';
import { z } from 'zod';
import { AcceptCandidateSchema, AcceptanceSchema, CreateCandidateSchema, CandidateResponseSchema, CandidateListSchema, EmptyObjectSchema } from './candidate-contract.js';
import type { OpenAPIObject, SchemaObject, ResponseObject, ParameterObject } from '@nestjs/swagger';
import {
  AppendRevisionSchema, RevisionResponseSchema, RevisionPageSchema, RevisionQuerySchema,
  CreateCaptureSchema, UpdateCaptureIntentSchema, ListQuerySchema, CaptureResponseSchema,
  CaptureListResponseSchema, ProblemSchema,
} from './capture-contract.js';

function schema(value: z.ZodType, io: 'input' | 'output'): SchemaObject {
  return z.toJSONSchema(value, { target: 'openapi-3.0', io }) as SchemaObject;
}
function jsonResponse(name: string, description: string): ResponseObject {
  return { description, content: {
    'application/json': { schema: { $ref: `#/components/schemas/${name}` } },
  } };
}
function problem(description: string): ResponseObject {
  return { description, content: {
    'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } },
  } };
}

const etagHeaders = {
  ETag: { description: 'Validator for this representation; send back with If-None-Match.', schema: { type: 'string' as const } },
};
const ifNoneMatch: ParameterObject = {
  name: 'If-None-Match', in: 'header', required: false, schema: { type: 'string' },
  description: 'A matching ETag, or *, can produce 304 without a body. Use a stored response for that URL; omit this header if no cached response is available.',
};
const notModified: ResponseObject = {
  description: 'Not modified. No response body; reuse the cached representation.',
  headers: etagHeaders,
};

export function createOpenApiDocument(cookieName = 'epp_session'): OpenAPIObject {
  const document: OpenAPIObject = {
    openapi: '3.0.3',
    info: {
      title: 'EPP Capture API', version: '0.18.0',
      description: 'PostgreSQL records belonging to the authenticated session user. Errors use Problem Details. Capture creation is not idempotent; candidate acceptance supports operation identity.',
    },
    security: [{ sessionCookie: [] }, { miniBearer: [] }],
    paths: {
      '/auth/login': { post: {
        operationId: 'login', summary: 'Use a verified email or existing user ID and password to create a session', security: [],
        description: 'A new random token is set only in an HttpOnly SameSite=Strict cookie. The database stores its SHA-256 digest. Absolute lifetime 8 hours; maximum 20 sessions per user. Labels are user supplied, not verified device identities. JSON only; no query parameters. Wrong and absent credentials share 401. Public origins require HTTPS. A lost response can leave an unused session; inspect the session list after signing in again.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Login' } } } },
        responses: { '200': jsonResponse('SessionIdentity', 'Session created; browser stores Set-Cookie'),
          '400': problem('Invalid input'), '401': problem('Credentials are invalid'), '429': problem('Attempt, concurrency or session limit') },
      } },
      '/auth/csrf': { get: { operationId: 'csrfToken', summary: 'Get a session-bound CSRF token',
        description: 'Requires a live session, including restricted accounts so they can sign out. Keep in memory, never URL or logs. Refetch after login or key rotation.',
        responses: { '200': jsonResponse('Csrf', 'CSRF token; private, no-store') } } },
      '/auth/me': { get: { operationId: 'currentSession', summary: 'Read authenticated user and public session IDs',
        responses: { '200': jsonResponse('SessionIdentity', 'Current identity') } } },
      '/auth/sessions': { get: { operationId: 'listSessions', summary: 'List up to 20 unexpired sessions owned by this user',
        description: 'Only public management ID, label, timestamps and current flag. Never includes the token or its digest.',
        responses: { '200': jsonResponse('SessionList', 'Live sessions') } } },
      '/auth/sessions/{id}': { delete: { operationId: 'revokeSession', summary: 'Revoke one owned session',
        description: 'No body or query parameters. Missing or foreign IDs have the same 204 result and cannot revoke another user. Revoking the current session also clears this cookie. Requests already authenticated may finish; later requests require a live session.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '204': { description: 'Revocation completed; no response body' }, '400': problem('Invalid ID or unexpected body') },
      } },
      '/auth/logout': { post: { operationId: 'logout', summary: 'Revoke the current session and clear its cookie', security: [],
        description: 'No cookie, expired cookie and already revoked cookie may repeat this request. JSON {} is required. A database failure is not reported as a successful revocation.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/EmptyObject' } } } },
        responses: { '204': { description: 'Signed out; no response body' }, '400': problem('Invalid body or cookie') },
      } },
      '/auth/password': { post: { operationId: 'changePassword', summary: 'Verify the old password, change it and revoke all sessions',
        description: 'Requires a live session and the current password. Password update and all-session deletion commit together; Login and password change lock the account before the credential row and recheck current Web eligibility. Success clears the cookie and requires a fresh login. No body/query identity override.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ChangePassword' } } } },
        responses: { '204': { description: 'Password changed and every session revoked; no response body' },
          '400': problem('Invalid password input'), '429': problem('Attempt or concurrency limit') },
      } },
      '/learning-records': {
        get: {
          operationId: 'listLearningRecords', summary: 'Read bounded acceptance sources',
          description: 'One item per learning record. Default limit 20, maximum 100; order by createdAt descending then UUID descending. Optional expressionId filters before limiting. Unknown or foreign expression filters return an empty list. No mode preserves the original response. mode=offset accepts offset 0..10000 and adds nextOffset (null at end or cap); mode=cursor adds nextCursor (null at end). Continuations bind resource, user, limit, expressionId, from and to. Invalid, changed-scope or expired cursors return 400 INVALID_CURSOR; traversal expires after 30 minutes. from inclusive / to exclusive require UTC ISO milliseconds in years 0001..9999, with from strictly before to, and filter learning creation time. Both modes read live data, not a snapshot. Unknown and repeated query keys are rejected. No userId parameter; ownership comes from the session.',
          parameters: [ifNoneMatch, ...['limit', 'expressionId', 'mode', 'offset', 'cursor', 'from', 'to'].map(name => ({ name, in: 'query', required: false,
            schema: schema(LearningQuerySchema.shape[name as keyof typeof LearningQuerySchema.shape].unwrap(), 'input'),
          } as ParameterObject))],
          responses: { '200': { ...jsonResponse('LearningList', 'Bounded sources'), headers: etagHeaders },
            '304': notModified, '400': problem('Invalid query'), '500': problem('Unexpected failure') },
        },
      },
      '/learning-records/{id}': {
        get: {
          operationId: 'findLearningRecord', summary: 'Read one source with its original revision',
          description: 'Returns saved source revision and candidate content, not the latest capture. Missing, malformed, percent-encoded or foreign IDs return 404. Query keys rejected. Internal owner, normalized keys and receipts are excluded.',
          parameters: [ifNoneMatch, { name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { ...jsonResponse('LearningDetail', 'Saved source detail'), headers: etagHeaders },
            '304': notModified, '400': problem('Invalid query'), '404': problem('Learning record not found; code LEARNING_RECORD_NOT_FOUND'), '500': problem('Unexpected failure') },
        },
      },
      '/star-map': {
        get: {
          operationId: 'readStarMap', summary: 'Read bounded expression nodes',
          description: 'One node per stored expression with an owned learning source, including retained historical duplicates. recordCount counts visible learning records for that node, not practice or mastery. Default limit 20, maximum 100; expression createdAt descending then UUID descending. hasMore is a bounded-read hint, not a total. Same mode/offset/cursor/time rules as learning-records; time filters expression creation, not source time. recordCount remains all visible sources. Cursor cannot cross resources. No semantic edges, ranking, coordinates or full-graph claim.',
          parameters: [ifNoneMatch, ...Object.entries(StarMapQuerySchema.shape).map(([name, value]) => ({ name, in: 'query', required: false, schema: schema(value.unwrap(), 'input') } as ParameterObject))],
          responses: { '200': { ...jsonResponse('StarMap', 'Expression nodes'), headers: etagHeaders },
            '304': notModified, '400': problem('Invalid query'), '500': problem('Unexpected failure') },
        },
      },
      '/revisions/{revisionId}/candidates': {
        get: {
          operationId: 'listCandidates', summary: 'Read candidates for one owned revision',
          description: 'All candidates, including discarded and accepted, ordered by candidateNo. At most five slots per revision. An existing empty revision returns items: []; missing or foreign revision returns 404. Historical revisions remain readable. Query parameters are rejected.',
          parameters: [ifNoneMatch, { name: 'revisionId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { ...jsonResponse('CandidateList', 'Revision candidates'), headers: etagHeaders },
            '304': notModified, '400': problem('Invalid query'), '404': problem('Revision not found; code CANDIDATE_NOT_FOUND'), '500': problem('Unexpected failure') },
        },
        post: {
          operationId: 'createCandidate', summary: 'Save one manually supplied candidate',
          description: 'Uses the exact revision ID, including historical revisions. candidateNo is an integer from 1 to 5, never reused, including after discard. Unknown fields and query parameters are rejected. Reusing a slot returns 409 even with identical content; no idempotency replay. No AI call. Body limit 16 KiB; valid UTF-8 JSON without BOM.',
          parameters: [{ name: 'revisionId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateCandidate' } } } },
          responses: { '201': jsonResponse('Candidate', 'Saved pending candidate'),
            '400': problem('Invalid input or query'), '404': problem('Revision not found; code CANDIDATE_NOT_FOUND'),
            '409': problem('Slot occupied; code CANDIDATE_CONFLICT'), '413': problem('Body exceeds 16 KiB'),
            '415': problem('Expected application/json'), '500': problem('Unexpected failure') },
        },
      },
      '/candidates/{id}/accept': {
        post: {
          operationId: 'acceptCandidate', summary: 'Accept one pending candidate atomically',
          description: 'Requires a lowercase UUID operationId and no query. Save it before the first send and reuse it for every retry of this exact candidate. Successful operations are scoped to the current user and retained without automatic expiry. Same identity and fingerprint replay the original 201 JSON; changed candidate returns OPERATION_CONFLICT. Failed attempts are not retained. Different operation identities on an accepted candidate return CANDIDATE_CONFLICT. Historical successes without receipts are not replayable. Business writes and the response snapshot commit in one transaction. Lock wait is limited to 1 second per acquisition; only P2034 is retried internally, at most 3 attempts. Within the current user, exact normalized English and meaning reuse an expression; normalization v1 uses NFC, ASCII whitespace folding and ASCII case folding. Each accepted candidate keeps its own learning record and source. Existing expression display text is preserved. No AI or similarity matching. On timeout or an unknown outcome, retry with the same identity and content after bounded backoff',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AcceptCandidate' } } } },
          responses: { '201': jsonResponse('Acceptance', 'Committed or replayed acceptance; same semantic JSON, not byte ordering or transport headers'),
            '400': problem('Expected operationId only and no query'), '404': problem('Candidate not found; code CANDIDATE_NOT_FOUND'),
            '409': problem('Identity reused for different content: OPERATION_CONFLICT; candidate no longer pending: CANDIDATE_CONFLICT'), '413': problem('Body exceeds 16 KiB'),
            '415': problem('Expected application/json'), '500': problem('Unexpected failure'), '503': problem('Storage temporarily unavailable; outcome may be unknown') },
        },
      },
      '/candidates/{id}/discard': {
        post: {
          operationId: 'discardCandidate', summary: 'Discard a pending candidate',
          description: 'Requires JSON {}. Only pending -> discarded is implemented; repeated discard returns 409 and preserves the first discardedAt. Does not delete content, affect siblings, or create a revision. Query parameters are rejected. Accepted candidates cannot be discarded; no reopen endpoint.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/EmptyObject' } } } },
          responses: { '200': jsonResponse('Candidate', 'Discarded candidate'),
            '400': problem('Expected empty JSON object and no query'), '404': problem('Candidate not found; code CANDIDATE_NOT_FOUND'),
            '409': problem('Candidate is no longer pending; code CANDIDATE_CONFLICT'), '413': problem('Body exceeds 16 KiB'),
            '415': problem('Expected application/json'), '500': problem('Unexpected failure') },
        },
      },
      '/captures': {
        get: {
          operationId: 'listCaptures', summary: 'List captures',
          description: 'Latest revision content, createdAt ascending, then UUID ascending; q searches latest originalText only, filter before limit. No limit means all matching records. At most 1000 ampersand-separated query parts, including unknown keys and empty parts. Unknown query keys within that bound are ignored; repeated q or limit is rejected.',
          parameters: [ifNoneMatch, ...['q', 'limit'].map(name => ({
            name, in: 'query', required: false,
            schema: schema(name === 'q' ? ListQuerySchema.shape.q.unwrap() : ListQuerySchema.shape.limit.unwrap(), 'input'),
          } as ParameterObject))],
          responses: {
            '200': { ...jsonResponse('CaptureList', 'Matching records'), headers: etagHeaders },
            '304': notModified,
            '400': problem('Invalid query; code VALIDATION_ERROR or QUERY_TOO_LARGE'),
            '500': problem('Unexpected failure; code INTERNAL_ERROR'),
          },
        },
        post: {
          operationId: 'createCapture', summary: 'Create a capture',
          description: 'originalText and optional chineseIntent are used. Missing or null intent is stored as null. Extra properties, including id and createdAt, are ignored. Body limit: 16 KiB of bytes. Requires valid UTF-8 JSON without a BOM. URL query limit: 1000 ampersand-separated parts.',
          requestBody: { required: true, content: { 'application/json': {
            schema: { $ref: '#/components/schemas/CreateCapture' },
            example: { originalText: 'I want to explain this clearly.' },
          } } },
          responses: {
            '201': { ...jsonResponse('Capture', 'Saved record'), headers: {
              Location: { description: 'Relative URL of the new record', schema: { type: 'string' } },
            } },
            '400': problem('Malformed UTF-8/JSON or invalid input/query; code INVALID_JSON, VALIDATION_ERROR or QUERY_TOO_LARGE'),
            '413': problem('Body exceeds 16 KiB; code BODY_TOO_LARGE'),
            '415': problem('Expected application/json; code UNSUPPORTED_MEDIA_TYPE'),
            '500': problem('Unexpected failure; code INTERNAL_ERROR'),
          },
        },
      },
      '/captures/{id}/revisions': {
        get: {
          operationId: 'listCaptureRevisions', summary: 'Read revision history',
          description: 'Descending revision number. Default limit 20, maximum 100. Pass nextBefore as before to continue; before is exclusive. New appends do not move older revision numbers. Unknown/repeated query keys are rejected.',
          parameters: [ifNoneMatch,
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            ...['before', 'limit'].map(name => ({ name, in: 'query', required: false,
              schema: schema(name === 'before' ? RevisionQuerySchema.shape.before.unwrap() : RevisionQuerySchema.shape.limit.unwrap(), 'input'),
            } as ParameterObject))],
          responses: {
            '200': { ...jsonResponse('RevisionPage', 'History page; empty page is allowed'), headers: etagHeaders },
            '304': notModified,
            '400': problem('Invalid query'), '404': problem('Capture not found'), '500': problem('Unexpected failure'),
          },
        },
        post: {
          operationId: 'appendCaptureRevision', summary: 'Append a complete content snapshot',
          description: 'Requires originalText and chineseIntent (null clears it); inputSource defaults to manual, chunks defaults to null. Unknown properties rejected. Repeating creates a new revision; no idempotency or stale editor detection. Body limit 16 KiB; valid UTF-8 JSON without BOM.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AppendRevision' } } } },
          responses: {
            '201': jsonResponse('Revision', 'The snapshot committed by this request; later writers may already exist'),
            '400': problem('Invalid input'), '404': problem('Capture not found'),
            '409': problem('Revision number taken; code REVISION_CONFLICT. Read latest content before deciding to submit again.'),
            '413': problem('Body exceeds 16 KiB'), '415': problem('Expected application/json'), '500': problem('Unexpected failure'),
          },
        },
      },
      '/captures/{id}': {
        patch: {
          operationId: 'updateCaptureIntent', summary: 'Set or clear the intent',
          description: 'Requires chineseIntent: text sets it, null clears it; missing is invalid. Other properties are ignored. Does not edit originalText or createdAt. Appends a snapshot by copying the latest originalText, inputSource and chunks. Revision number contention returns 409; sequential stale edits are still accepted. Repeated requests create additional revisions. Body limit 16 KiB, valid UTF-8 JSON without BOM; query limit 1000 parts.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' },
            description: 'Literal ID returned by the API.' }],
          requestBody: { required: true, content: { 'application/json': {
            schema: { $ref: '#/components/schemas/UpdateCaptureIntent' },
            example: { chineseIntent: '我想把这件事解释清楚。' },
          } } },
          responses: {
            '200': jsonResponse('Capture', 'Snapshot committed by this request; later writers may already exist'),
            '409': problem('Revision number taken; code REVISION_CONFLICT'),
            '400': problem('Invalid JSON/input/query; code INVALID_JSON, VALIDATION_ERROR or QUERY_TOO_LARGE'),
            '404': problem('No such record; code CAPTURE_NOT_FOUND'),
            '413': problem('Body exceeds 16 KiB; code BODY_TOO_LARGE'),
            '415': problem('Expected application/json; code UNSUPPORTED_MEDIA_TYPE'),
            '500': problem('Unexpected failure; code INTERNAL_ERROR'),
          },
        },
        get: {
          operationId: 'findCapture', summary: 'Find a capture',
          parameters: [ifNoneMatch, { name: 'id', in: 'path', required: true, schema: { type: 'string' },
            description: 'Use the literal ID returned by creation. Unknown IDs return 404.' }],
          responses: {
            '200': { ...jsonResponse('Capture', 'Saved record'), headers: etagHeaders },
            '304': notModified,
            '400': problem('Query exceeds 1000 parts; code QUERY_TOO_LARGE'),
            '404': problem('No such record; code CAPTURE_NOT_FOUND'),
            '500': problem('Unexpected failure; code INTERNAL_ERROR'),
          },
        },
      },
    },
    components: { securitySchemes: { miniBearer: { type: 'http', scheme: 'bearer', description: 'Opaque mini-program session token; never use a Web token here.' }, sessionCookie: { type: 'apiKey', in: 'cookie', name: cookieName,
      description: 'Set by login; never paste a token into Swagger. Same-origin browser requests carry the HttpOnly cookie.' } }, schemas: {
      MiniLogin: schema(MiniLoginSchema, 'input'), MiniLink: schema(MiniLinkSchema, 'input'), MiniLoginResult: schema(MiniLoginResultSchema, 'output'),
      RecoveryRequest: schema(RecoveryRequestSchema, 'input'), RecoveryConfirm: schema(RecoveryConfirmSchema, 'input'),
      RecoveryAccepted: schema(RecoveryAcceptedSchema, 'output'), Registration: schema(RegistrationSchema, 'output'),
      Csrf: schema(CsrfSchema, 'output'),
      Login: schema(LoginSchema, 'input'), ChangePassword: schema(ChangePasswordSchema, 'input'),
      SessionIdentity: schema(SessionIdentitySchema, 'output'), SessionList: schema(SessionListSchema, 'output'),
      LearningList: schema(LearningListSchema, 'output'),
      LearningDetail: schema(LearningDetailSchema, 'output'),
      StarMap: schema(StarMapSchema, 'output'),
      CreateCandidate: schema(CreateCandidateSchema, 'input'),
      AcceptCandidate: schema(AcceptCandidateSchema, 'input'),
      Acceptance: schema(AcceptanceSchema, 'output'),
      Candidate: schema(CandidateResponseSchema, 'output'),
      CandidateList: schema(CandidateListSchema, 'output'),
      EmptyObject: schema(EmptyObjectSchema, 'input'),
      AppendRevision: schema(AppendRevisionSchema, 'input'),
      Revision: schema(RevisionResponseSchema, 'output'),
      RevisionPage: schema(RevisionPageSchema, 'output'),
      CreateCapture: schema(CreateCaptureSchema, 'input'),
      UpdateCaptureIntent: schema(UpdateCaptureIntentSchema, 'input'),
      Capture: schema(CaptureResponseSchema, 'output'),
      CaptureList: schema(CaptureListResponseSchema, 'output'),
      Problem: schema(ProblemSchema, 'output'),
    } },
  };
  for (const path of MINI_PUBLIC_PATHS) {
    document.paths[path] = { post: {
      operationId: path.endsWith('/link') ? 'linkMiniAccount' : 'loginMini', security: [],
      summary: 'Exchange a fresh platform code and create a mini-program session',
      description: 'The server fixes the AppID. Link additionally requires the existing local user ID and current password; it never merges two mapped accounts. First login records a disabled-by-default mini entry eligibility; 200 with userId and miniEnabled=false records a pending mapping without a token. Missing provider configuration returns 503. Obtain a new code after any lost response, inspect owned sessions after login, and revoke unused ones. No cookies are set; do not send Cookie with Authorization.',
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/' + (path.endsWith('/link') ? 'MiniLink' : 'MiniLogin') } } } },
      responses: { '200': jsonResponse('MiniLoginResult', 'Either a pending account identity without a token, or an opaque token returned once; do not log or synchronize'),
        '400': problem('Invalid input'), '401': problem('Password or platform code invalid'),
        '409': problem('Platform identity already belongs to another user, or user has another identity in this AppID'),
        '429': problem('Attempt, provider concurrency, password concurrency or session limit') },
    } };
  }
  for (const path of ['/auth/password', '/auth/csrf']) {
    const item = document.paths[path]!;
    (item.post ?? item.get)!.security = [{ sessionCookie: [] }];
  }
  for (const path of RECOVERY_PATHS) {
    const request = path.endsWith('/request'), registration = path === '/auth/register/confirm';
    document.paths[path] = { post: {
      operationId: path.slice(1).replaceAll('/', '_'), security: [],
      summary: request ? 'Request a verification email' : 'Consume a verification token once',
      description: request ? 'Always the same 202 for existing and absent accounts, cooldown, and unconfirmed SMTP delivery. Both receive local mail when not throttled. 15 minute expiry, one minute address cooldown. No durable delivery guarantee.'
        : 'Token belongs to the purpose in this path. Registration defaults to webEnabled=false. Reset checks credential version and active account, changes the password and revokes all sessions atomically; it never grants Web access or logs in.',
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/' + (request ? 'RecoveryRequest' : 'RecoveryConfirm') } } } },
      responses: { [request ? '202' : registration ? '201' : '204']: request ? jsonResponse('RecoveryAccepted', 'Request handled; not proof of delivery')
        : registration ? jsonResponse('Registration', 'Verified account created without a session') : { description: 'Password replaced and sessions revoked; no body' },
        '400': problem('Invalid input or VERIFICATION_INVALID; expired, replaced, consumed, wrong purpose or ineligible token'),
        '429': problem('AUTH_RATE_LIMIT, AUTH_BUSY or DELIVERY_BUSY'), '500': problem('Internal failure; result may be unknown') },
    } };
  }
  for (const [pathname, path] of Object.entries(document.paths)) {
    for (const operation of [path.get, path.post, path.patch, path.delete]) {
      if (!operation?.responses) continue;
      if (!RECOVERY_PATHS.includes(pathname)) operation.responses['401'] ??= problem('Missing, expired or revoked session; code AUTH_REQUIRED');
      if (!['/auth/logout', '/auth/csrf'].includes(pathname)) {
        operation.responses['403'] = problem('Account disabled or Web access denied; code ACCOUNT_DISABLED or WEB_ACCESS_DENIED. Write requests may also reject the Origin.');
      } else if (pathname === '/auth/logout') {
        operation.responses['403'] = problem('Request origin is not allowed; code ORIGIN_REJECTED');
      }
      if (operation === path.post || operation === path.patch || operation === path.delete) {
        operation.parameters = [...(operation.parameters ?? []),
          { name: 'X-EPP-Request', in: 'header', required: true, schema: { type: 'string', enum: ['1'] } },
          ...(pathname === '/auth/login' || RECOVERY_PATHS.includes(pathname) || MINI_PUBLIC_PATHS.includes(pathname) ? [] : [{ name: 'X-CSRF-Token', in: 'header' as const, required: pathname === '/auth/password', schema: { type: 'string' }, description: 'Required for a live Cookie session on writes; obtain from GET /auth/csrf. Bearer sessions do not use CSRF tokens.' }])];
        operation.responses['403'] = problem('Origin, explicit header, CSRF or account permission rejected; code ORIGIN_REJECTED, REQUEST_HEADER_REQUIRED, CSRF_REJECTED, ACCOUNT_DISABLED, WEB_ACCESS_DENIED, MINI_ACCESS_DENIED or SESSION_CHANNEL_DENIED');
      }
      if (RECOVERY_PATHS.includes(pathname)) operation.responses['403'] = problem('Origin or explicit request header rejected');
      operation.responses['503'] = problem('Draining, temporary storage or platform failure; code SERVICE_DRAINING, STORAGE_UNAVAILABLE, MINI_NOT_CONFIGURED or PLATFORM_UNAVAILABLE. Failed writes may have an unknown outcome; do not blindly retry writes, including revision POST and PATCH; retries can append duplicate snapshots.');
      if (operation.responses['429'] && !('$ref' in operation.responses['429'])) {
        operation.responses['429'].headers = { 'Retry-After': { schema: { type: 'string' }, description: 'Seconds for AUTH_RATE_LIMIT only; other limits require their own recovery.' } };
      }
      for (const response of Object.values(operation.responses)) {
        if (!response || '$ref' in response) continue;
        response.headers = { ...response.headers, 'Cache-Control': { schema: { type: 'string' }, description: 'private, no-store' }, 'X-Request-Id': {
          description: 'Server-generated correlation ID; not an idempotency key.',
          schema: { type: 'string', format: 'uuid' },
        } };
      }
    }
  }
  document.paths['/auth/oidc'] = { get: { security: [], summary: 'Open the same-origin login page', responses: { '200': { description: 'HTML' } } } };
  document.paths['/auth/oidc/start'] = { post: { security: [], summary: 'Start a login or prove the local account password for linking',
    parameters: [{ in:'header', name:'X-EPP-Request', required:true, schema:{ type:'string', enum:['1'] } }],
    requestBody: { required:true, content:{ 'application/json':{ schema:schema(ExternalStart,'input') } } },
    responses:{ '200': { description:'Temporary HttpOnly Lax cookie and a navigation URL', content:{ 'application/json':{ schema:{
      type:'object', required:['authorizationUrl'], properties:{authorizationUrl:{type:'string',format:'uri'}} } } } },
      '400':problem('Invalid mode or input'), '401':problem('Local password rejected'), '403':problem('Origin or header rejected'),
      '429':problem('Attempt limit'), '503':problem('Issuer not configured or unavailable') } } };
  document.paths['/auth/oidc/callback'] = { get: { security: [], summary:'Browser redirect; one-use transaction cookie required',
    parameters:['code','state','iss','error'].map(name=>({name,in:'query',required:name==='state',schema:{type:'string'}})),
    responses:{ '303':{description:'Return to the fixed EPP page; only eligible accounts receive a Web session cookie'},
      '400':problem('Wrong browser, expired or used state'), '401':problem('Exchange, claims or local proof rejected'),
      '403':problem('Cancelled or disabled account'), '409':problem('Mapping conflict'), '429':problem('Session or exchange limit'),
      '503':problem('Storage or provider unavailable') } } };
  for (const suffix of ['', '/start', '/callback']) {
    document.paths['/auth/wechat-web' + suffix] = structuredClone(document.paths['/auth/oidc' + suffix]!);
  }
  const callback = document.paths['/auth/wechat-web/callback']!.get!;
  callback.responses['401'] = problem('Website code or local password proof rejected');
  callback.responses['403'] = problem('Local account disabled');
  callback.parameters = ['code', 'state'].map(name => ({ name, in: 'query', required: true, schema: { type: 'string' } }));
  return document;
}
