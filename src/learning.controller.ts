import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { LearningQueries } from './learning.queries.js';
import { LearningQuerySchema, StarMapQuerySchema, LearningListSchema, LearningDetailSchema, StarMapSchema } from './learning-contract.js';
import type { LearningQuery } from './learning-contract.js';
import { EmptyObjectSchema } from './candidate-contract.js';
import { SchemaPipe } from './schema.pipe.js';
import { ResponseSchemaInterceptor } from './response-schema.interceptor.js';

@Controller()
export class LearningController {
  constructor(private readonly queries: LearningQueries) {}

  @Get('learning-records')
  @UseInterceptors(new ResponseSchemaInterceptor(LearningListSchema))
  list(@Query(new SchemaPipe(LearningQuerySchema)) query: LearningQuery) {
    return this.queries.list(query);
  }
  @Get('learning-records/:id')
  @UseInterceptors(new ResponseSchemaInterceptor(LearningDetailSchema))
  detail(@Param('id') id: string, @Query(new SchemaPipe(EmptyObjectSchema)) _query: object) {
    return this.queries.detail(id);
  }
  @Get('star-map')
  @UseInterceptors(new ResponseSchemaInterceptor(StarMapSchema))
  starMap(@Query(new SchemaPipe(StarMapQuerySchema)) query: Omit<LearningQuery, 'expressionId'>) {
    return this.queries.starMap(query);
  }
}
