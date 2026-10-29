import { createResponseApp } from './app.js';

const app = await createResponseApp();
try {
  await app.listen(3005, '127.0.0.1');
  console.log('Response examples: http://127.0.0.1:3005/responses/automatic');
} catch (error: unknown) {
  await app.close();
  throw error;
}
