import type { Request } from 'express';
import { HttpError } from './http.js';

export const CURRENT_USER_ID = Symbol('CURRENT_USER_ID');
export type SessionIdentity = Readonly<{ userId: string; sessionId: string }>;
export type AuthenticatedRequest = Request & { auth?: SessionIdentity };
export function requireSession(request: AuthenticatedRequest): SessionIdentity {
  if (!request.auth) throw new HttpError(401, 'Authentication required', 'AUTH_REQUIRED');
  return request.auth;
}
