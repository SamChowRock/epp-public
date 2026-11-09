import { z } from 'zod';

export const scanPagePath = '/auth/scan';
export const browserActions = ['start', 'status', 'cancel', 'consume'] as const;
export const phoneActions = ['inspect', 'confirm'] as const;
export const browserPaths = browserActions.map(action => scanPagePath + '/' + action);
export const phonePaths = phoneActions.map(action => scanPagePath + '/' + action);
export const SceneInput = z.object({ scene: z.uuidv4() }).strict();
export type SceneBody = z.infer<typeof SceneInput>;
