import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyMailFailure } from '../dist/src/mail-failure.js';

test('single-recipient RCPT refusals release the channel, including unlisted negative codes', () => {
  const error = (command, responseCode) => Object.assign(new Error(), {
    code: 'EENVELOPE', command, responseCode,
  });
  assert.equal(classifyMailFailure(error('RCPT TO', 455)), 'recipient-deferred');
  assert.equal(classifyMailFailure(error('RCPT TO', 552)), 'recipient-refused');
  for (const code of [undefined, 354, 599.5, 600]) {
    assert.equal(classifyMailFailure(error('RCPT TO', code)), 'unconfirmed');
  }
  assert.equal(classifyMailFailure(error('DATA', 552)), 'unconfirmed');
});
