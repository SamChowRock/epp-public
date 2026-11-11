import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { z } from 'zod';
import { AppLogger } from './app-logger.js';
import { parseDatabaseConfig } from './database-config.js';
import { DatabaseService } from './database.service.js';
import { CommandRefused, ManageWebAccess, type Action } from './manage-web-access.js';

function parse(argv: string[]) {
  const [expected, kind, userId, value, id] = argv;
  const uuid = z.uuid();
  let action: Action;
  if (kind === 'receipt' && argv.length === 4 && value && uuid.safeParse(value).success) {
    action = { kind, operationId: value };
  } else if (kind === 'preview' && argv.length === 4 && (value === 'on' || value === 'off')) {
    action = { kind, enabled: value === 'on' };
  } else if (kind === 'apply' && argv.length === 5 && (value === 'on' || value === 'off')
      && id && uuid.safeParse(id).success) {
    action = { kind, enabled: value === 'on', operationId: id };
  } else {
    throw new CommandRefused('Usage: DB preview USER on|off / DB apply USER on|off OP / DB receipt USER OP');
  }
  if (!expected?.trim() || !userId || !uuid.safeParse(userId).success) {
    throw new CommandRefused('Expected database name and user UUID');
  }
  return { expected, userId, action };
}

@Module({})
class AccountAdminModule {}

async function main() {
  const { expected, userId, action } = parse(process.argv.slice(2));
  const config = parseDatabaseConfig(process.env);
  const context = await NestFactory.createApplicationContext({
    module: AccountAdminModule,
    providers: [
      { provide: DatabaseService, useFactory: () => new DatabaseService(config, new AppLogger('error'), 'epp-admin') },
      { provide: ManageWebAccess, inject: [DatabaseService],
        useFactory: (db: DatabaseService) => new ManageWebAccess(db) },
    ],
  }, { logger: false, abortOnError: false });
  try {
    const response = await context.get(ManageWebAccess).run(expected, userId, action);
    console.log(JSON.stringify(response));
  } finally {
    await context.close();
  }
}

main().catch(error => {
  const refused = error instanceof CommandRefused;
  console.error(refused ? error.message : 'Command failed. Check configuration and database. For apply, query the receipt.');
  process.exitCode = refused ? 2 : 1;
});
