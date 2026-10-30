import { Module } from '@nestjs/common';
import { CapturesModule } from './captures.module.js';

@Module({
  imports: [CapturesModule],
})
export class AppModule {}
