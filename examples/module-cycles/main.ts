import 'reflect-metadata';
import { forwardRef, Inject, Injectable, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

const mode = process.argv[2] ?? 'linked';
if (!['linked', 'hidden', 'eager'].includes(mode)) throw new Error('Unknown mode');

@Injectable()
class Left {
  readonly name = 'left';

  constructor(
    @Inject(forwardRef(() => Right)) readonly right: Pick<Right, 'name' | 'left'>,
  ) {
    if (mode === 'eager') console.log('early right:', this.right.name.toUpperCase());
  }
}

@Injectable()
class Right {
  readonly name = 'right';

  constructor(
    @Inject(forwardRef(() => Left)) readonly left: Pick<Left, 'name'>,
  ) {
    if (mode === 'eager') console.log('early left:', this.left.name.toUpperCase());
  }
}

@Module({
  imports: [forwardRef(() => RightModule)],
  providers: [Left],
  exports: [Left],
})
class LeftModule {}

@Module({
  imports: [forwardRef(() => LeftModule)],
  providers: [Right],
  exports: mode === 'hidden' ? [] : [Right],
})
class RightModule {}

@Module({ imports: [LeftModule, RightModule] })
class RootModule {}

try {
  const app = await NestFactory.createApplicationContext(RootModule, {
    logger: false, abortOnError: false,
  });
  try {
    const left = app.select(LeftModule).get(Left, { strict: true });
    const right = app.select(RightModule).get(Right, { strict: true });
    console.log('both linked:', left.right === right && right.left === left);
    console.log('ready names:', left.name, right.name);
    console.log('design type:', Reflect.getMetadata('design:paramtypes', Left)[0].name);
  } finally {
    await app.close();
  }
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
