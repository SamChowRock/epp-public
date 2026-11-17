import { createServer, type IncomingMessage } from 'node:http';
import { createHash } from 'node:crypto';
import { Webhook } from 'svix';
import { z } from 'zod';
import { EmailSchema } from './recovery-contract.js';
import { providerUuid, canonicalResendMessageId } from './resend-delivery.js';
import {
  recordMailEvent,
  ReceiptError,
  type MailEvent,
} from './mail-delivery-facts.js';
import type { DatabaseService } from './database.service.js';
const text = z.string().min(1).max(100);
const shape = z.object({
  type: text,
  created_at: z.string().datetime({ offset: true }),
  data: z.object({
    email_id: z.string().regex(providerUuid),
    to: z.array(z.string().max(320)).max(100).optional(),
    message_id: z.string().max(200).optional(),
    bounce: z
      .object({ type: text.optional(), subType: text.optional() })
      .optional(),
  }),
});
export function verifyMailEvent(
  body: Buffer,
  rawHeaders: string[],
  secret: string,
): MailEvent {
  const headers: Record<string, string> = {};
  for (const [name, limit] of [
    ['svix-id', 200],
    ['svix-timestamp', 12],
    ['svix-signature', 2048],
  ] as const) {
    const values = [];
    for (let i = 0; i < rawHeaders.length; i += 2)
      if (rawHeaders[i]?.toLowerCase() === name) values.push(rawHeaders[i + 1]);
    if (values.length !== 1 || !values[0] || values[0].length > limit)
      throw new ReceiptError(400, 'SIGNATURE_HEADER');
    headers[name] = values[0];
  }
  if (!/^\d+$/.test(headers['svix-timestamp']!))
    throw new ReceiptError(400, 'SIGNATURE_TIMESTAMP');
  try {
    new Webhook(secret).verify(body, headers);
  } catch {
    throw new ReceiptError(400, 'SIGNATURE_INVALID');
  }
  try {
    const data = shape.parse(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)),
    );
    const recipient =
      data.data.to?.length === 1
        ? EmailSchema.safeParse(data.data.to[0])
        : null;
    return {
      eventId: headers['svix-id']!,
      bodySha256: createHash('sha256').update(body).digest('hex'),
      eventType: data.type,
      providerMessageId: canonicalResendMessageId(data.data.email_id),
      recipient: recipient?.success ? recipient.data : null,
      occurredAt: new Date(data.created_at),
      messageId: data.data.message_id ?? null,
      bounceType: data.data.bounce?.type ?? null,
      bounceSubtype: data.data.bounce?.subType ?? null,
    };
  } catch {
    throw new ReceiptError(400, 'EVENT_INVALID');
  }
}
async function rawBody(req: IncomingMessage) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) throw new ReceiptError(413, 'BODY_LIMIT');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
export function createReceiptServer(
  database: DatabaseService,
  config: {
    secret: string;
    providerScope: string;
    endpointScope: string;
  },
) {
  const server = createServer(
    {
      maxHeaderSize: 8192,
      headersTimeout: 5000,
      requestTimeout: 10000,
      keepAliveTimeout: 1000,
    },
    async (req, res) => {
      try {
        if (req.url !== '/webhooks/resend')
          throw new ReceiptError(404, 'NOT_FOUND');
        if (req.method !== 'POST')
          throw new ReceiptError(405, 'METHOD_NOT_ALLOWED');
        if (
          !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
            req.headers['content-type'] ?? '',
          ) ||
          (req.headers['content-encoding'] ?? 'identity') !== 'identity'
        )
          throw new ReceiptError(415, 'MEDIA_TYPE');
        if (Number(req.headers['content-length']) > 65536)
          throw new ReceiptError(413, 'BODY_LIMIT');
        const body = await rawBody(req),
          event = verifyMailEvent(body, req.rawHeaders, config.secret);
        await recordMailEvent(
          database,
          config.providerScope,
          config.endpointScope,
          event,
        );
        res.writeHead(204);
        res.end();
      } catch (error) {
        if (error instanceof ReceiptError && error.code === 'EVENT_CAPACITY')
          console.error('receipts.EVENT_CAPACITY');
        res.writeHead(error instanceof ReceiptError ? error.status : 503, {
          Connection: 'close',
        });
        res.end();
        req.resume();
      }
    },
  );
  server.maxHeadersCount = 50;
  server.setTimeout(10000, (socket) => socket.destroy());
  return server;
}
