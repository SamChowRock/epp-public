import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';
import { AppLogger } from './app-logger.js';
import { serve } from './serve.js';

try {
  const config = await loadConfig();
  const logger = new AppLogger(config.logLevel);
  await serve(config, logger, () => createApp(config, logger));
} catch (error) {
  new AppLogger('error').write('error', 'app.start_failed', {
    field: error instanceof ConfigError ? error.field : undefined,
    code: error instanceof ConfigError ? 'CONFIG_INVALID' : 'START_FAILURE',
  });
  process.exitCode = 1;
}
