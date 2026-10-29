import { Module } from '@nestjs/common';
import { CapturesController } from './captures.controller.js';
import { CapturesService } from './captures.service.js';

@Module({
  controllers: [CapturesController],
  providers: [CapturesService],
})
export class AppModule {}
