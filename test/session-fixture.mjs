import { csrfToken } from '../dist/src/browser-security.js';
import { APP_CONFIG } from '../dist/src/config.js';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../dist/src/database.service.js';
import { DEVELOPMENT_USER_ID } from '../dist/src/database-config.js';
import { issueToken, tokenDigest } from '../dist/src/token.js';

// Existing business regressions use a real session row; authentication has its own HTTP tests.
export async function sessionFetch(t, app, userId = DEVELOPMENT_USER_ID) {
  const db = app.get(DatabaseService).client, id = randomUUID(), token = issueToken();
  await db.session.create({ data: { id, userId, tokenDigest: tokenDigest(token),
    label: 'Business regression', expiresAt: new Date(Date.now() + 3600000) } });
  t.after(() => db.session.deleteMany({ where: { id } }));
  const authenticatedFetch = (url, options = {}) => {
    const headers = new Headers(options.headers); headers.set('Cookie', 'epp_session=' + token);
    headers.set('X-EPP-Request', '1');
    headers.set('X-CSRF-Token', csrfToken(app.get(APP_CONFIG).cursorKey, id));
    return globalThis.fetch(url, { ...options, headers });
  };
  authenticatedFetch.cookie = 'epp_session=' + token;
  return authenticatedFetch;
}
