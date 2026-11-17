import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ResendDelivery } from '../dist/src/resend-delivery.js';
for (const [name, response] of [
  ['5xx', () => new Response('{}', { status: 503 })],
  ['redirect', () => new Response('', { status: 302 })],
  ['missing id', () => new Response('{}')],
  ['truncated', () => new Response('{')],
  ['oversize', () => new Response('x'.repeat(65537))],
])
  test('Resend ' + name + ' is unconfirmed', async () => {
    const d = new ResendDelivery(
      {
        apiKey: 'fictional',
        from: 'test@example.test',
        providerScope: 'practice',
      },
      async () => response(),
    );
    await assert.rejects(
      d.send('a@example.test', 'register', 'secret', new Date(), new Date(), {
        attemptId: randomUUID(),
      }),
      /RESEND_UNCONFIRMED/,
    );
  });
test('complete Resend receipt binds UUID and fixed endpoint metadata', async () => {
  const id = randomUUID(),
    attemptId = randomUUID();
  let calls = 0;
  const d = new ResendDelivery(
    {
      apiKey: 'fictional',
      from: 'test@example.test',
      providerScope: 'practice',
    },
    async (url, options) => {
      calls++;
      assert.equal(url, 'https://api.resend.com/emails');
      assert.equal(options.redirect, 'error');
      const body = JSON.parse(options.body);
      assert.deepEqual(body.to, ['a@example.test']);
      assert.equal(body.headers['X-EPP-Attempt-ID'], attemptId);
      return new Response(JSON.stringify({ id }));
    },
  );
  assert.deepEqual(
    await d.send(
      'a@example.test',
      'register',
      'secret',
      new Date(),
      new Date(),
      { attemptId },
    ),
    { providerMessageId: id },
  );
  assert.equal(calls, 1);
});

test('uppercase Resend response UUID returns canonical lowercase identity', async () => {
  const messageId = randomUUID(),
    delivery = new ResendDelivery(
      {
        apiKey: 'fictional',
        from: 'a@example.test',
        providerScope: 'practice',
      },
      async () => new Response(JSON.stringify({ id: messageId.toUpperCase() })),
    );
  assert.equal(
    (
      await delivery.send(
        'a@example.test',
        'register',
        'secret',
        new Date(),
        new Date(),
        { attemptId: randomUUID() },
      )
    ).providerMessageId,
    messageId,
  );
});
