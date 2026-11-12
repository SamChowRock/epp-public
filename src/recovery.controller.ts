import { Body, Controller, HttpCode, Post, Query, UseInterceptors } from '@nestjs/common';
import { RecoveryService } from './recovery.service.js';
import { RecoveryRequestSchema, RecoveryConfirmSchema, RecoveryAcceptedSchema, RegistrationSchema } from './recovery-contract.js';
import type { RecoveryConfirm } from './recovery-contract.js';
import { EmptyObjectSchema } from './candidate-contract.js';
import { SchemaPipe } from './schema.pipe.js';
import { ResponseSchemaInterceptor } from './response-schema.interceptor.js';

@Controller('auth')
export class RecoveryController {
  constructor(private readonly recovery: RecoveryService) {}

  @Post('register/request')
  @HttpCode(202)
  @UseInterceptors(new ResponseSchemaInterceptor(RecoveryAcceptedSchema))
  registerRequest(@Body(new SchemaPipe(RecoveryRequestSchema)) input: { email: string },
    @Query(new SchemaPipe(EmptyObjectSchema)) _query: object) {
    return this.recovery.request('register', input.email);
  }
  @Post('register/confirm')
  @HttpCode(201)
  @UseInterceptors(new ResponseSchemaInterceptor(RegistrationSchema))
  async registerConfirm(@Body(new SchemaPipe(RecoveryConfirmSchema)) input: RecoveryConfirm,
    @Query(new SchemaPipe(EmptyObjectSchema)) _query: object) {
    const result = await this.recovery.confirm('register', input);
    return { ...result, webEnabled: false as const };
  }
}
