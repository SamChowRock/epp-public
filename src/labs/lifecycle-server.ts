import { ConfigError, loadConfig } from '../config.js';
import { AppLogger } from '../app-logger.js';
import { serve } from '../serve.js';
import { createLifecycleApp } from './lifecycle.js';

try {
  const mode = process.env.LAB_MODE ?? 'normal';
  if (mode !== 'normal' && mode !== 'init-fail' && mode !== 'close-hang') {
    throw new ConfigError('LAB_MODE');
  }
  const config = await loadConfig({ ...process.env, PORT: process.env.PORT ?? '3007' });
  const logger = new AppLogger(config.logLevel);
  await serve(config, logger, () => createLifecycleApp(config, logger, mode));
} catch (error) {
  new AppLogger('error').write('error', 'app.start_failed', {
    field: error instanceof ConfigError ? error.field : undefined,
    code: error instanceof ConfigError ? 'CONFIG_INVALID' : 'START_FAILURE',
  });
  process.exitCode = 1;
}
