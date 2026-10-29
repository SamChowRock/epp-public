import { createMiniApp } from './framework.js';
import { MiniAppModule } from './app.js';

try {
  const app = createMiniApp(MiniAppModule);
  const server = app.listen(3004, '127.0.0.1', () => {
    console.log('Mini Nest listening on http://127.0.0.1:3004');
  });
  server.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
