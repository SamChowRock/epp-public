import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { parseInput } from './input-validation.js';

export class SchemaPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T>) {}

  transform(value: unknown): T {
    return parseInput(this.schema, value);
  }
}
