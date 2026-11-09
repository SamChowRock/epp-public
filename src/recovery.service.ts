import { randomUUID } from 'node:crypto';
import { DatabaseService } from './database.service.js';
import { SessionService } from './session.service.js';
import { ApplicationState } from './application-state.js';
import { HttpError } from './http.js';
import { issueToken, tokenDigest } from './token.js';
import { hashPassword } from './password.js';
import type { RecoveryPurpose, RecoveryConfirm } from './recovery-contract.js';
import type { Prisma } from './generated/prisma/client.js';

const accepted = { message: 'Check your inbox. If no message arrives, wait one minute before trying again.' } as const;
const invalid = () => new HttpError(400, 'Verification is invalid or expired; request a new message', 'VERIFICATION_INVALID');

export class RecoveryService {
  private activeRequests = 0;
  constructor(private readonly database: DatabaseService, private readonly sessions: SessionService,
    private readonly state: ApplicationState) {}

  request(purpose: RecoveryPurpose, email: string) {
    if (this.activeRequests >= 2) throw new HttpError(429, 'Delivery service is busy', 'DELIVERY_BUSY');
    this.activeRequests++;
    return this.state.track(async () => {
      const generation = tokenDigest(issueToken());
      await this.database.run('issueVerification', () => this.database.client.$transaction(async tx => {
        const contact = purpose === 'reset' ? await tx.verifiedEmail.findUnique({
          where: { email }, include: { user: { select: { passwordCredential: { select: { version: true } } } } },
        }) : null;
        const credential = contact?.user.passwordCredential;
        const userId = credential ? contact!.userId : null;
        const version = credential?.version ?? null;
        // One row per purpose/address gives resend cooldown and replacement the same atomic boundary.
        const [issued] = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO public.verification_intents
            (id, purpose, email, token_digest, user_id, credential_version, issued_at, expires_at)
          VALUES (${randomUUID()}::uuid, ${purpose}, ${email}, ${generation}, ${userId}::uuid, ${version},
            clock_timestamp(), clock_timestamp() + interval '15 minutes')
          ON CONFLICT (purpose, email) DO UPDATE SET token_digest = EXCLUDED.token_digest,
            user_id = EXCLUDED.user_id, credential_version = EXCLUDED.credential_version,
            issued_at = clock_timestamp(), expires_at = clock_timestamp() + interval '15 minutes', consumed_at = NULL
          WHERE verification_intents.issued_at <= clock_timestamp() - interval '1 minute'
          RETURNING id
        `;
        if (issued) {
          await tx.verificationOutbox.create({ data: {
            id: randomUUID(), intentId: issued.id, generation, purpose, recipient: email,
          } });
        }
      }, { maxWait: 2000, timeout: 5000 }));
      return accepted;
    }).finally(() => { this.activeRequests--; });
  }

  private async lockIntent(tx: Prisma.TransactionClient, purpose: RecoveryPurpose, digest: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM public.verification_intents WHERE purpose = ${purpose} AND token_digest = ${digest} FOR UPDATE
    `;
    if (!rows[0]) return null;
    // Recheck the clock after the lock wait, not in the SELECT FOR UPDATE predicate.
    const active = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM public.verification_intents WHERE id = ${rows[0].id}::uuid
        AND token_digest = ${digest} AND consumed_at IS NULL AND expires_at > clock_timestamp()
    `;
    return active[0] ? tx.verificationIntent.findUnique({ where: { id: active[0].id } }) : null;
  }

  confirm(purpose: RecoveryPurpose, input: RecoveryConfirm) {
    return this.sessions.passwordWork(async () => {
      const digest = tokenDigest(input.token);
      const observed = await this.database.run('readVerification', () => this.database.client.verificationIntent.findUnique({
        where: { tokenDigest: digest },
      }));
      if (!observed || observed.purpose !== purpose) throw invalid();
      let passwordHash: string;
      try { passwordHash = await hashPassword(input.newPassword, { userId: observed.userId, email: observed.email }); }
      catch (error) {
        if (error instanceof Error && error.message === 'PASSWORD_BLOCKLISTED') {
          throw new HttpError(400, 'Choose a different password: this one is common or easy to guess', 'PASSWORD_BLOCKLISTED');
        }
        if (error instanceof Error && error.message === 'PASSWORD_INPUT_INVALID') {
          throw new HttpError(400, 'New password does not meet the input policy', 'PASSWORD_INPUT_INVALID');
        }
        throw error;
      }
      const result = await this.database.run('consumeVerification', () => this.database.client.$transaction(async tx => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '1s'`;
        if (purpose === 'register') {
          const intent = await this.lockIntent(tx, purpose, digest);
          if (!intent || await tx.verifiedEmail.findUnique({ where: { email: intent.email } })) return null;
          const userId = randomUUID();
          await tx.user.create({ data: { id: userId, passwordCredential: { create: { passwordHash } },
            verifiedEmail: { create: { email: intent.email } } } });
          await tx.verificationIntent.update({ where: { id: intent.id }, data: { consumedAt: new Date() } });
          return { userId };
        }
        if (!observed.userId) return null;
        const [user] = await tx.$queryRaw<{ status: string }[]>`
          SELECT status FROM public.users WHERE id = ${observed.userId}::uuid FOR UPDATE
        `;
        if (user?.status !== 'active') return null;
        const [credential] = await tx.$queryRaw<{ version: number }[]>`
          SELECT version FROM public.password_credentials WHERE user_id = ${observed.userId}::uuid FOR UPDATE
        `;
        const intent = await this.lockIntent(tx, purpose, digest);
        if (!intent || intent.userId !== observed.userId || !credential
          || credential.version !== intent.credentialVersion) return null;
        await tx.passwordCredential.update({ where: { userId: observed.userId },
          data: { passwordHash, version: { increment: 1 } } });
        await tx.session.deleteMany({ where: { userId: observed.userId } });
        await tx.verificationIntent.update({ where: { id: intent.id }, data: { consumedAt: new Date() } });
        return { userId: observed.userId };
      }, { maxWait: 2000, timeout: 5000 }));
      if (!result) throw invalid();
      return result;
    });
  }
}
