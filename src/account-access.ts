import { HttpError } from './http.js';

export type AccountAccess = Readonly<{ status: string; webEnabled: boolean }>;
export function webAccessFailure(account: AccountAccess) {
  if (account.status !== 'active') return 'ACCOUNT_DISABLED' as const;
  if (!account.webEnabled) return 'WEB_ACCESS_DENIED' as const;
  return undefined;
}
export function requireWebAccess(account: AccountAccess): void {
  const code = webAccessFailure(account);
  if (code) throw new HttpError(403, 'Account is not permitted to use this service', code);
}
