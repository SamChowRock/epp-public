import { z } from 'zod';

export const PublishedAvatar = z.strictObject({ avatarId: z.uuid() });
export const AvatarLink = PublishedAvatar.extend({ url: z.url(), expiresIn: z.literal(30) });
export const AvatarVisibility = z.strictObject({ visible: z.boolean() });
