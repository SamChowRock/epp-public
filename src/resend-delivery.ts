import type {
  VerificationDelivery,
  DeliveryReceipt,
  DeliveryContext,
} from './verification-delivery.js';
import type { RecoveryPurpose } from './recovery-contract.js';
export const providerUuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** UUID spelling must not create a second Resend message identity. */
export function canonicalResendMessageId(value: string): string {
  if (!providerUuid.test(value)) throw Error('RESEND_MESSAGE_ID_INVALID');
  return value.toLowerCase();
}

export class ResendDelivery implements VerificationDelivery {
  readonly provider = 'resend' as const;
  readonly providerScope: string;
  constructor(
    private readonly config: {
      apiKey: string;
      from: string;
      providerScope: string;
    },
    private readonly request: typeof fetch = fetch,
  ) {
    this.providerScope = config.providerScope;
  }
  async send(
    recipient: string,
    purpose: RecoveryPurpose,
    token: string,
    issuedAt: Date,
    expiresAt: Date,
    context: DeliveryContext,
  ): Promise<DeliveryReceipt> {
    try {
      const response = await this.request('https://api.resend.com/emails', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
        headers: {
          Authorization: 'Bearer ' + this.config.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.config.from,
          to: [recipient],
          subject:
            purpose === 'register'
              ? 'EPP registration verification'
              : 'EPP password recovery',
          text: `Purpose: ${purpose}\nVerification token: ${token}\nRequested (UTC): ${issuedAt.toISOString()}\nExpires (UTC): ${expiresAt.toISOString()} Use the token for your latest request.\nIf you did not request this, ignore it. This message does not confirm an account exists.`,
          headers: { 'X-EPP-Attempt-ID': context.attemptId },
          tags: [{ name: 'attempt_id', value: context.attemptId }],
        }),
      });
      if (!response.ok || !response.body) throw Error();
      const reader = response.body.getReader();
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > 65536) throw Error();
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      const result: unknown = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
      );
      if (
        !result ||
        typeof result !== 'object' ||
        !('id' in result) ||
        typeof result.id !== 'string' ||
        !providerUuid.test(result.id)
      )
        throw Error();
      return { providerMessageId: canonicalResendMessageId(result.id) };
    } catch {
      throw Error('RESEND_UNCONFIRMED');
    }
  }
}
