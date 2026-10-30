import { createPipelineApp } from './request-pipeline.js';

const app = await createPipelineApp();
try {
  await app.listen(3006, '127.0.0.1');
  console.log('Pipeline lab: http://127.0.0.1:3006/pipeline');
} catch (error) {
  await app.close();
  throw error;
}
