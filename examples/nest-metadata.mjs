import 'reflect-metadata';
import { MemoryCaptureStore } from '../dist/src/memory-capture.store.js';
import { CapturesController } from '../dist/src/captures.controller.js';
import { CapturesService } from '../dist/src/captures.service.js';

const types = Reflect.getMetadata('design:paramtypes', CapturesController);
console.log('constructor dependency:', types?.map((type) => type.name));
console.log('same runtime class:', types?.[0] === CapturesService);

const captures = new CapturesService(new MemoryCaptureStore());
const created = await captures.create('  I want to explain this clearly.  ');
created.originalText = 'changed outside';
console.log('stored original:', (await captures.find(created.id)).originalText);
try {
  await captures.create('   ');
} catch (error) {
  console.log('rejected:', error.message);
}
console.log('count after rejection:', (await captures.list()).length);
console.log('another instance count:', (await new CapturesService(new MemoryCaptureStore()).list()).length);
