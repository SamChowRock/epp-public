import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { errorCode, errorMessage } from './errors.js';

const host = '127.0.0.1';

async function start(): Promise<void> {
  const { port } = await loadConfig();
  const app = await createApp();
  try {
    await app.listen(port, host);
    console.log(`EPP listening on http://${host}:${port} (pid=${process.pid})`);
  } catch (error: unknown) {
    await app.close();
    throw error;
  }
}

start().catch((error: unknown) => {
  if (errorCode(error) === 'EADDRINUSE') {
    console.error('Cannot start EPP: address already in use');
  } else {
    console.error(`Cannot start EPP: ${errorMessage(error)}`);
  }
  process.exitCode = 1;
});
