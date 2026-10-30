import { readA } from './esm-b.mjs';

export class A {}

console.log('after initialization:', readA().name);
