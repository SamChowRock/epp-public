import { Prisma } from './generated/prisma/client.js';
import type { DatabaseService } from './database.service.js';
import { webAccessFailure } from './account-access.js';

export class CommandRefused extends Error {}
export type Action =
  | { kind: 'preview'; enabled: boolean }
  | { kind: 'apply'; enabled: boolean; operationId: string }
  | { kind: 'receipt'; operationId: string };

export class ManageWebAccess {
  constructor(private readonly database: DatabaseService) {}

  run(expected: string, userId: string, action: Action) {
    return this.database.client.$transaction(
      async (tx) => {
        const [target] = await tx.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
        if (target?.name !== expected) throw new CommandRefused('Database name mismatch');

        if (action.kind === 'receipt') {
          const receipt = await tx.webAccessReceipt.findUnique({
            where: {
              userId_operationId: { userId, operationId: action.operationId },
            },
          });
          if (!receipt) throw new CommandRefused('Receipt not found');
          return { database: expected, result: 'receipt', receipt };
        }

        const lock = action.kind === 'apply' ? Prisma.sql`FOR UPDATE` : Prisma.empty;
        const [account] = await tx.$queryRaw<{ status: string; webEnabled: boolean }[]>`
        SELECT status, web_enabled AS "webEnabled" FROM public.users
        WHERE id = ${userId}::uuid ${lock}`;
        if (!account) throw new CommandRefused('User not found');
        if (action.kind === 'preview') {
          const after = { status: account.status, webEnabled: action.enabled };
          return {
            database: expected,
            result: 'preview',
            userId,
            before: account,
            after,
            accessAfter: webAccessFailure(after) ?? 'allowed',
          };
        }

        const key = { userId, operationId: action.operationId };
        const prior = await tx.webAccessReceipt.findUnique({ where: { userId_operationId: key } });
        if (prior) {
          if (prior.requestedEnabled !== action.enabled)
            throw new CommandRefused('Operation ID conflict');
          return { database: expected, result: 'replayed', receipt: prior };
        }
        if (account.webEnabled !== action.enabled) {
          await tx.user.update({
            where: { id: userId },
            data: { webEnabled: action.enabled },
            select: { id: true },
          });
        }
        const receipt = await tx.webAccessReceipt.create({
          data: {
            ...key,
            beforeEnabled: account.webEnabled,
            requestedEnabled: action.enabled,
            accountStatus: account.status,
          },
        });
        return { database: expected, result: 'applied', receipt };
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }
}
