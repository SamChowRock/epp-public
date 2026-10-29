import 'reflect-metadata';
import { Body, Controller, Get, HttpCode, Module, Post, Res } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Response } from 'express';

@Controller('responses')
class ResponsesController {
  @Get('automatic')
  async automatic() {
    return { mode: 'automatic' };
  }

  @Post('accepted')
  @HttpCode(202)
  accepted(@Body() body: unknown) {
    return { accepted: true, received: body };
  }

  @Get('manual')
  manual(@Res() response: Response) {
    response.status(200).json({ mode: 'manual' });
    console.log('manual: method continues after json');
  }

  @Get('passthrough')
  passthrough(@Res({ passthrough: true }) response: Response) {
    response.setHeader('X-Example', 'passthrough');
    return { mode: 'passthrough' };
  }

  @Get('forgotten')
  forgotten(@Res() _response: Response) {
    console.log('forgotten: method returns, no response sent');
    return { mode: 'forgotten' };
  }
}

@Module({ controllers: [ResponsesController] })
class ResponsesModule {}

export async function createResponseApp() {
  return NestFactory.create(ResponsesModule, { abortOnError: false });
}
