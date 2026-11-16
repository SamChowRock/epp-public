// No DOM or network globals: the same state transitions run in the page and tests.
export const STORAGE_KEY = 'epp.pending-write.v1';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function validPath(path) {
  return path === '/captures' || /^\/captures\/[0-9a-f-]{36}\/revisions$/.test(path);
}
export class PendingWrite {
  constructor({ storage, identify, send, uuid, changed = () => {} }) {
    Object.assign(this, { storage, identify, send, uuid, changed });
    this.epoch = 0;
    this.state = { owner: null, pending: null, result: null, phase: 'checking' };
  }
  update(patch) { Object.assign(this.state, patch); this.changed(this.state); }
  remove() { this.storage.removeItem(STORAGE_KEY); }
  clearIdentity() {
    this.epoch++;
    this.controller?.abort();
    // Even if storage throws, forget all visible content and suppress late callbacks.
    this.update({ owner: null, pending: null, result: null, phase: 'signed-out' });
    try { this.remove(); return true; }
    catch { this.update({ phase: 'storage-error' }); return false; }
  }
  async checkIdentity(epoch) {
    const identity = await this.identify();
    if (epoch !== this.epoch) return false;
    if (!identity || typeof identity.userId !== 'string' || !identity.userId) {
      this.clearIdentity(); return false;
    }
    const owner = JSON.stringify([identity.userId, identity.sessionId ?? 'fixed-lab']);
    if (this.state.owner && this.state.owner !== owner) {
      if (this.clearIdentity()) this.update({ owner, phase: 'identity-changed' });
      return false;
    }
    this.update({ owner }); return true;
  }
  async verifyIdentity() {
    if (!this.state.owner || this.state.phase === 'unavailable') {
      await this.initialize();
      return ['ready', 'pending'].includes(this.state.phase);
    }
    const epoch = this.epoch;
    try {
      const matched = await this.checkIdentity(epoch);
      return matched || (this.epoch === epoch + 1 && this.state.phase === 'identity-changed');
    } catch { return false; }
  }
  async initialize() {
    const epoch = ++this.epoch;
    this.update({ owner: null, pending: null, result: null, phase: 'checking' });
    try {
      if (!await this.checkIdentity(epoch)) return;
      const raw = this.storage.getItem(STORAGE_KEY);
      let record = null;
      try { record = raw ? JSON.parse(raw) : null; } catch { this.remove(); }
      if (record && (record.owner !== this.state.owner || !uuidPattern.test(record.operationId)
        || !validPath(record.path) || typeof record.body !== 'string')) {
        this.remove(); record = null;
      }
      this.update({ pending: record, phase: record ? 'pending' : 'ready' });
    } catch { if (epoch === this.epoch) this.update({ phase: 'unavailable' }); }
  }
  async submit(path, body) {
    if (this.state.pending || !this.state.owner
      || !['ready', 'success', 'identity-changed', 'storage-error'].includes(this.state.phase)) return;
    if (!validPath(path)) throw Error('Unsupported write path');
    // Lock before awaiting identity, so a double click cannot allocate two intents.
    this.update({ result: null, phase: 'checking' });
    const epoch = this.epoch;
    try { if (!await this.checkIdentity(epoch)) return; }
    catch { if (epoch === this.epoch) this.update({ phase: 'unavailable' }); return; }
    const record = { owner: this.state.owner, operationId: this.uuid(), path, body: JSON.stringify(body) };
    try { this.storage.setItem(STORAGE_KEY, JSON.stringify(record)); }
    catch { this.update({ phase: 'storage-error' }); return; }
    this.update({ pending: record });
    await this.dispatch(record, epoch);
  }
  async retry() {
    if (!this.state.pending || ['sending', 'checking'].includes(this.state.phase)) return;
    const epoch = this.epoch;
    this.update({ result: null, phase: 'checking' });
    try { if (!await this.checkIdentity(epoch)) return; }
    catch { if (epoch === this.epoch) this.update({ phase: 'unavailable' }); return; }
    await this.dispatch(this.state.pending, epoch);
  }
  async dispatch(record, epoch) {
    this.update({ phase: 'sending' });
    const controller = new AbortController();
    this.controller = controller;
    try {
      const result = await this.send(record, { signal: controller.signal, isCurrent: () => epoch === this.epoch });
      if (epoch !== this.epoch) return;
      // Another tab may have logged out while this request was in flight.
      if (!await this.checkIdentity(epoch)) return;
      this.remove();
      this.update({ pending: null, result, phase: 'success' });
    } catch (error) {
      if (epoch !== this.epoch) return;
      if (error.status === 401) { this.clearIdentity(); return; }
      // A session mismatch can be reported as 403. Do not leave A's draft
      // visible after the trusted identity endpoint confirms B. Offline checks
      // preserve the original operation so connectivity loss is still recoverable.
      try { if (!await this.checkIdentity(epoch)) return; } catch { /* outcome remains unknown */ }
      if (epoch === this.epoch) this.update({ phase: 'uncertain' });
    }
  }
  clearPending() {
    this.epoch++;
    this.controller?.abort();
    this.update({ pending: null, result: null, phase: this.state.owner ? 'ready' : 'signed-out' });
    try { this.remove(); } catch { this.update({ owner: null, phase: 'storage-error' }); }
  }
}

// The session expectation comes from the persisted operation, never from a new
// /me or /csrf result. The server still authenticates the actual cookie and must
// reject a mismatch before executing the command (the header is not a credential).
export async function writeHeaders(owner, { sessionMode, csrfMode, request }) {
  const headers = { 'Content-Type': 'application/json' };
  if (sessionMode) {
    const [, sessionId] = JSON.parse(owner);
    if (typeof sessionId !== 'string' || !sessionId || sessionId === 'fixed-lab') throw Error('Missing session identity');
    headers['X-Expected-Session'] = sessionId;
  }
  if (csrfMode) {
    headers['X-EPP-Request'] = '1';
    const { csrfToken } = await request('/auth/csrf');
    if (typeof csrfToken !== 'string' || !csrfToken) throw Error('Invalid CSRF response');
    headers['X-CSRF-Token'] = csrfToken;
  }
  return headers;
}
function storedText(value, maxLength) {
  return typeof value === 'string' && value.length <= maxLength && /\S/.test(value)
    && !value.includes('\0') && value.isWellFormed();
}
function validSuccess(value, path) {
  if (!value || !uuidPattern.test(value.id) || !storedText(value.originalText, 2000)
    || !(value.chineseIntent === null || storedText(value.chineseIntent, 2000))
    || typeof value.createdAt !== 'string'
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value.createdAt)
    || !Number.isFinite(Date.parse(value.createdAt))) return false;
  if (path === '/captures') return true;
  return value.captureId === path.split('/')[2]
    && Number.isInteger(value.revisionNo) && value.revisionNo > 0 && value.revisionNo <= 2147483647
    && ['manual', 'unknown'].includes(value.inputSource)
    && (value.chunks === null || (Array.isArray(value.chunks) && value.chunks.length <= 25
      && value.chunks.every(chunk => chunk && storedText(chunk.text, 200))));
}
export async function sendPendingWrite(record, { request, sessionMode, csrfMode, signal, isCurrent }) {
  const headers = await writeHeaders(record.owner, { sessionMode, csrfMode, request });
  headers['Idempotency-Key'] = record.operationId;
  if (!isCurrent()) throw Error('Local identity cleared');
  const result = await request(record.path, { method: 'POST', headers, body: record.body, signal, expectedStatus: 201 });
  if (!validSuccess(result, record.path)) throw Error('Invalid success response');
  return result;
}
