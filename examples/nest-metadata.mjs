import 'reflect-metadata';
import { CapturesController } from '../dist/src/captures.controller.js';
import { CapturesService } from '../dist/src/captures.service.js';

const types = Reflect.getMetadata('design:paramtypes', CapturesController);
console.log('constructor dependency:', types?.map((type) => type.name));
console.log('same runtime class:', types?.[0] === CapturesService);

const captures = new CapturesService();
const created = captures.create('  I want to explain this clearly.  ');
created.originalText = 'changed outside';
console.log('stored original:', captures.find(created.id).originalText);
try {
  captures.create('   ');
} catch (error) {
  console.log('rejected:', error.message);
}
console.log('count after rejection:', captures.list().length);
console.log('another instance count:', new CapturesService().list().length);
