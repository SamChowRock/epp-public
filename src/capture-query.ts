import { Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import type { CaptureListOptions } from './capture.js';
import { ListQuerySchema } from './capture-contract.js';
import { parseInput } from './input-validation.js';

@Injectable()
export class CaptureListQueryPipe implements PipeTransform<unknown, CaptureListOptions> {
  transform(value: unknown): CaptureListOptions {
    const parsed = parseInput(ListQuerySchema, value);
    return {
      text: parsed.q,
      limit: parsed.limit === undefined ? undefined : Number(parsed.limit),
    };
  }
}
