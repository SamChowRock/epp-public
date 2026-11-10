import { z } from 'zod';
import { LearningQuerySchema } from './learning-contract.js';

export const NotificationQuery = z.object({
  limit: LearningQuerySchema.shape.limit, cursor: LearningQuerySchema.shape.cursor,
}).strict();
export const NotificationPage = z.object({
  items: z.array(z.object({
    id: z.uuid(), kind: z.enum(['registered','password-reset']),
    createdAt: z.iso.datetime(), readAt: z.iso.datetime().nullable(),
  })).max(100),
  nextCursor: z.string().nullable(),
});
export type InboxQuery = z.infer<typeof NotificationQuery>;
