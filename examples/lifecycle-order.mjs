import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

class Resource {
  onModuleInit() { console.log('resource: init'); }
  onApplicationBootstrap() { console.log('resource: bootstrap'); }
  onModuleDestroy() { console.log('resource: destroy'); }
  beforeApplicationShutdown() { console.log('resource: before shutdown'); }
  onApplicationShutdown() { console.log('resource: after shutdown'); }
}
class Root {}
Module({ providers: [Resource] })(Root);
const app = await NestFactory.createApplicationContext(Root, { logger: false });
console.log('caller: context ready (no HTTP listener)');
await app.close();
console.log('caller: close complete');
