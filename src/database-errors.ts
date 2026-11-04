export class StorageUnavailableError extends Error {
  constructor() { super('Storage is temporarily unavailable; write outcome may be unknown'); }
}
export class StorageFailureError extends Error {
  constructor() { super('Storage operation failed'); }
}
const object = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
const transientCodes = new Set([
  'P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2034', 'P2037', '55P03',
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND',
  '53300', '57014', '57P01', '57P02', '57P03', '08000', '08003', '08006',
]);
// pg 8.16.3 pool acquisition errors have messages but no stable code.
const acquisitionMessages = new Set([
  'timeout exceeded when trying to connect',
  'Connection terminated due to connection timeout',
]);
export function databaseFailure(error: unknown): { code: string; unavailable: boolean } {
  const root = object(error);
  const meta = object(root.meta);
  const adapterCause = object(object(meta.driverAdapterError).cause);
  const directCause = object(root.cause);
  const codes = [root.code, meta.code, adapterCause.originalCode, adapterCause.code,
    directCause.originalCode, directCause.code].filter((v): v is string => typeof v === 'string');
  const unavailable = codes.some(code => transientCodes.has(code))
    || [root, directCause].some(value => acquisitionMessages.has(String(value.message)));
  // Do not log messages, metadata, parameter values, stack or connection URL.
  const code = codes.includes('DEV_USER_MISSING') ? 'DEV_USER_MISSING'
    : codes.includes('COMMAND_CONSTRAINT_MISSING') ? 'COMMAND_CONSTRAINT_MISSING'
    : codes.includes('ACCEPTANCE_CONSTRAINT_MISSING') ? 'ACCEPTANCE_CONSTRAINT_MISSING'
    : codes.includes('55P03') ? '55P03' : codes.find(value => /^(?:P[0-9]{4}|[0-9A-Z]{5}|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND)$/.test(value))
    ?? (unavailable ? 'POOL_TIMEOUT' : 'DATABASE_FAILURE');
  return { code, unavailable };
}
