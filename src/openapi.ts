import { z } from 'zod';
import type { OpenAPIObject, SchemaObject, ResponseObject, ParameterObject } from '@nestjs/swagger';
import {
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
      title: 'EPP Capture API', version: '0.4.0',
      description: 'PostgreSQL records for one fixed development user; no authentication. Errors use Problem Details. Repeated POSTs create separate records.',
    },
    paths: {
      '/captures': {
        get: {
          operationId: 'listCaptures', summary: 'List captures',
          description: 'createdAt ascending, then UUID ascending; filter before limit. No limit means all matching records. At most 1000 ampersand-separated query parts, including unknown keys and empty parts. Unknown query keys within that bound are ignored; repeated q or limit is rejected.',
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
      '/captures/{id}': {
        patch: {
          operationId: 'updateCaptureIntent', summary: 'Set or clear the intent',
          description: 'Requires chineseIntent: text sets it, null clears it; missing is invalid. Other properties are ignored. Does not edit originalText or createdAt. Concurrent edits to this field use last-writer-wins; no conditional update or revision history. Body limit 16 KiB, valid UTF-8 JSON without BOM; query limit 1000 parts.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' },
            description: 'Literal ID returned by the API.' }],
          requestBody: { required: true, content: { 'application/json': {
            schema: { $ref: '#/components/schemas/UpdateCaptureIntent' },
            example: { chineseIntent: '我想把这件事解释清楚。' },
          } } },
          responses: {
            '200': jsonResponse('Capture', 'Record after this update'),
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
      operation.responses['503'] = problem('Draining or temporary storage failure; code SERVICE_DRAINING or STORAGE_UNAVAILABLE. Failed writes may have an unknown outcome; do not blindly retry writes, including PATCH that might overwrite an intervening edit.');
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
