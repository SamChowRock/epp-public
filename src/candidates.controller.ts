import { Body, Controller, Get, HttpCode, Param, Post, Query, UseInterceptors } from '@nestjs/common';
import { CandidatesService } from './candidates.service.js';
import { CandidateListSchema, CandidateResponseSchema, CreateCandidateSchema, EmptyObjectSchema } from './candidate-contract.js';
import type { CreateCandidateInput } from './candidate-contract.js';
import { SchemaPipe } from './schema.pipe.js';
import { ResponseSchemaInterceptor } from './response-schema.interceptor.js';

@Controller()
export class CandidatesController {
  constructor(private readonly candidates: CandidatesService) {}

  @Post('revisions/:revisionId/candidates')
  @UseInterceptors(new ResponseSchemaInterceptor(CandidateResponseSchema))
  create(@Param('revisionId') revisionId: string,
    @Body(new SchemaPipe(CreateCandidateSchema)) input: CreateCandidateInput,
    @Query(new SchemaPipe(EmptyObjectSchema)) _query: object) {
    return this.candidates.create(revisionId, input);
  }
  @Get('revisions/:revisionId/candidates')
  @UseInterceptors(new ResponseSchemaInterceptor(CandidateListSchema))
  list(@Param('revisionId') revisionId: string,
    @Query(new SchemaPipe(EmptyObjectSchema)) _query: object) {
    return this.candidates.list(revisionId);
  }
  @Post('candidates/:id/discard')
  @HttpCode(200)
  @UseInterceptors(new ResponseSchemaInterceptor(CandidateResponseSchema))
  discard(@Param('id') id: string,
    @Body(new SchemaPipe(EmptyObjectSchema)) _input: object,
    @Query(new SchemaPipe(EmptyObjectSchema)) _query: object) {
    return this.candidates.discard(id);
  }
}
