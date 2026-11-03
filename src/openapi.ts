import { z } from 'zod';
import { CreateCandidateSchema, CandidateResponseSchema, CandidateListSchema, EmptyObjectSchema } from './candidate-contract.js';
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

export function createOpenApiDocument(): OpenAPIObject {
  const document: OpenAPIObject = {
    openapi: '3.0.3',
    info: {
      title: 'EPP Capture API', version: '0.7.0',
      description: 'PostgreSQL records for one fixed development user; no authentication. Errors use Problem Details. Repeated POSTs create separate records.',
    },
    paths: {
      '/revisions/{revisionId}/candidates': {
        get: {
          operationId: 'listCandidates', summary: 'Read candidates for one owned revision',
          description: 'All candidates, including discarded, ordered by candidateNo. At most five slots per revision. An existing empty revision returns items: []; missing or foreign revision returns 404. Historical revisions remain readable. Query parameters are rejected.',
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
      '/candidates/{id}/discard': {
        post: {
          operationId: 'discardCandidate', summary: 'Discard a pending candidate',
          description: 'Requires JSON {}. Only pending -> discarded is implemented; repeated discard returns 409 and preserves the first discardedAt. Does not delete content, affect siblings, or create a revision. Query parameters are rejected. No accept or reopen endpoint.',
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
    components: { schemas: {
      CreateCandidate: schema(CreateCandidateSchema, 'input'),
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
  for (const path of Object.values(document.paths)) {
    for (const operation of [path.get, path.post, path.patch]) {
      if (!operation?.responses) continue;
      operation.responses['503'] = problem('Draining or temporary storage failure; code SERVICE_DRAINING or STORAGE_UNAVAILABLE. Failed writes may have an unknown outcome; do not blindly retry writes, including revision POST and PATCH; retries can append duplicate snapshots.');
      for (const response of Object.values(operation.responses)) {
        if (!response || '$ref' in response) continue;
        response.headers = { ...response.headers, 'X-Request-Id': {
          description: 'Server-generated correlation ID; not an idempotency key.',
          schema: { type: 'string', format: 'uuid' },
        } };
      }
    }
  }
  return document;
}
