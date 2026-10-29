import 'reflect-metadata';
import { Injectable, Module, Scope } from '@nestjs/common';
import { ContextIdFactory, NestFactory } from '@nestjs/core';

@Injectable()
class SharedCounter {
  count = 0;
}

@Injectable({ scope: Scope.REQUEST })
class RequestCounter {
  count = 0;
}

@Injectable()
class RequestReader {
  constructor(readonly counter: RequestCounter) {}
}

@Injectable({ scope: Scope.TRANSIENT })
class Stamp {}

@Injectable()
class FirstConsumer {
  constructor(readonly stamp: Stamp) {}
}

@Injectable()
class SecondConsumer {
  constructor(readonly stamp: Stamp) {}
}

@Module({
  providers: [SharedCounter, RequestCounter, RequestReader, Stamp,
    FirstConsumer, SecondConsumer],
})
class ScopeModule {}

const app = await NestFactory.createApplicationContext(ScopeModule, {
  logger: false, abortOnError: false,
});
try {
  app.get(SharedCounter).count++;
  console.log('shared count:', app.get(SharedCounter).count);
  const firstContext = ContextIdFactory.create();
  const secondContext = ContextIdFactory.create();
  const first = await app.resolve(RequestReader, firstContext);
  first.counter.count++;
  const again = await app.resolve(RequestReader, firstContext);
  const second = await app.resolve(RequestReader, secondContext);
  console.log('same context reader:', first === again);
  console.log('another context reader:', first === second);
  console.log('request counts:', again.counter.count, second.counter.count);
  const a = app.get(FirstConsumer);
  const b = app.get(SecondConsumer);
  console.log('different consumers share stamp:', a.stamp === b.stamp);
  console.log('same consumer keeps stamp:', a.stamp === app.get(FirstConsumer).stamp);
} finally {
  await app.close();
}
