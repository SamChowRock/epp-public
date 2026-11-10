import { z } from 'zod';
import { UserIdSchema } from './auth-contract.js';
import { isPostgresText } from './postgres-text.js';

const graphemes = new Intl.Segmenter('und', { granularity: 'grapheme' });
const Nickname = z.string()
  .refine(value => isPostgresText(value) && !/\p{Cc}/u.test(value), 'Invalid nickname text')
  .transform(value => value.normalize('NFC').trim())
  .refine(value => Buffer.byteLength(value, 'utf8') <= 192, 'Nickname exceeds 192 UTF-8 bytes')
  .refine(value => {
    const count = Array.from(graphemes.segment(value)).length;
    return count >= 1 && count <= 24;
  }, 'Nickname must contain 1 to 24 graphemes');

export const ProfilePatch = z.strictObject({
  nickname: Nickname.optional(),
  nicknameVisible: z.boolean().optional(),
}).refine(input => input.nickname !== undefined || input.nicknameVisible !== undefined, 'Provide a profile field');

export const PublicProfile = z.strictObject({ userId: UserIdSchema, nickname: z.string().nullable() });
export const OwnProfile = PublicProfile.extend({ nicknameVisible: z.boolean() });
export type ProfileInput = z.infer<typeof ProfilePatch>;
export type Profile = z.infer<typeof OwnProfile>;
