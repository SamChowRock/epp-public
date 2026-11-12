import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import type { AppConfig } from './config.js';
import { AppLogger } from './app-logger.js';
import { ApplicationState } from './application-state.js';

export async function serve(
  config: AppConfig,
  logger: AppLogger,
  create: () => Promise<INestApplication>,
): Promise<void> {
  let app: INestApplication | undefined;
  let stopping = false;
  let closing: Promise<void> | undefined;
  let boot: Promise<void>;
  const stop = (signal: string): Promise<void> => {
    if (closing) return closing;
    stopping = true;
    if (app) app.get(ApplicationState).beginDrain();
    logger.write('info', 'app.draining', { signal });
    const deadline = setTimeout(() => {
      logger.write('error', 'app.stop_timeout', { active: app?.get(ApplicationState).active });
      (app?.getHttpServer() as Server | undefined)?.closeAllConnections();
      // The hard deadline covers hung work AND hung resource cleanup.
      process.exit(1);
    }, config.shutdownTimeoutMs);
    closing = (async () => {
      await boot.catch(() => {});
      if (app) {
        const state = app.get(ApplicationState);
        state.beginDrain();
        const server = app.getHttpServer() as Server;
        await new Promise<void>((resolve, reject) => {
          server.close(error => {
            if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
            else resolve();
          });
        });
        // A disconnected HTTP client does not cancel an accepted store operation.
        await state.whenIdle();
        await app.close();
      }
      logger.write('info', 'app.stopped', { signal });
    })().catch(() => {
      logger.write('error', 'app.stop_failed');
      (app?.getHttpServer() as Server | undefined)?.closeAllConnections();
      process.exit(1);
    }).finally(() => {
      clearTimeout(deadline);
      process.off('SIGINT', onInt);
      process.off('SIGTERM', onTerm);
    });
    return closing;
  };
  const onInt = () => { void stop('SIGINT'); };
  const onTerm = () => { void stop('SIGTERM'); };
  process.on('SIGINT', onInt);
  process.on('SIGTERM', onTerm);
  boot = (async () => {
    app = await create();
    if (stopping) return;
    await app.init();
    if (stopping) return;
    await app.listen(config.port, config.listenHost);
    if (!stopping) logger.write('info', 'app.ready', { port: config.port });
  })();
  try { await boot; }
  catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    logger.write('error', 'app.start_failed', { code: code === 'EADDRINUSE' ? code : 'START_FAILURE' });
    process.exitCode = 1;
    await stop('startup-failure');
  }
}
