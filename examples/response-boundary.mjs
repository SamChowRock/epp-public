import { CapturesService } from '../dist/src/captures.service.js';
import { MemoryCaptureStore } from '../dist/src/memory-capture.store.js';
import { toCaptureResponse } from '../dist/src/capture-contract.js';
import { httpFailure } from '../dist/src/http.js';

const captures = new CapturesService(new MemoryCaptureStore());
const saved = await captures.create('Do not expose internal fields.');
const internal = { ...saved, internalNote: 'internal-only' };
console.log('public keys:', Object.keys(toCaptureResponse(internal)));
try {
  toCaptureResponse({ ...saved, createdAt: 'not-a-date' });
} catch (error) {
  const failure = httpFailure(error);
  console.log('invalid output:', failure.statusCode, failure.body.code);
}
console.log('stored count after output failure:', (await captures.list()).length);
console.log('unexpected failure:', httpFailure(new Error('private implementation detail')).body);
