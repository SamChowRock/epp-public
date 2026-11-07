import { Body, Controller, HttpCode, Post, Query, UseInterceptors } from '@nestjs/common';
import { MiniService } from './mini.service.js';
import { MiniLoginSchema, MiniLinkSchema, MiniLoginResultSchema } from './mini-contract.js';
import type { MiniLogin, MiniLink } from './mini-contract.js';
import { EmptyObjectSchema } from './candidate-contract.js';
import { SchemaPipe } from './schema.pipe.js';
import { ResponseSchemaInterceptor } from './response-schema.interceptor.js';
@Controller('auth/mini')
export class MiniController {
  constructor(private readonly mini: MiniService) {}
  @Post('login')
  @HttpCode(200)
  @UseInterceptors(new ResponseSchemaInterceptor(MiniLoginResultSchema))
  login(@Body(new SchemaPipe(MiniLoginSchema)) input: MiniLogin,
    @Query(new SchemaPipe(EmptyObjectSchema)) _query: object) { return this.mini.login(input); }
  @Post('link')
  @HttpCode(200)
  @UseInterceptors(new ResponseSchemaInterceptor(MiniLoginResultSchema))
  link(@Body(new SchemaPipe(MiniLinkSchema)) input: MiniLink,
    @Query(new SchemaPipe(EmptyObjectSchema)) _query: object) { return this.mini.link(input); }
}
