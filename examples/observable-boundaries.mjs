import { defer, finalize, from, lastValueFrom, map, of, catchError, timeout } from 'rxjs';
import { setTimeout as delay } from 'node:timers/promises';

let writes = 0;
const work = defer(() => {
  writes++;
  console.log('execute:', writes);
  return of({ value: 'saved' });
});
console.log('before subscription:', writes);
await lastValueFrom(work);
await lastValueFrom(work);
console.log('after two subscriptions:', writes);

const recovered = await lastValueFrom(of({ value: 7 }).pipe(
  map(value => {
    if (typeof value.value !== 'string') throw new Error('invalid output');
    return value;
  }),
  catchError(() => of({ value: 'fallback' })),
  finalize(() => console.log('recovery stream finalized')),
));
console.log('recovered:', recovered);

let committed = false;
const result = await lastValueFrom(defer(() => from((async () => {
  await delay(40);
  committed = true;
  return 'saved';
})())).pipe(
  timeout({ first: 10 }),
  catchError(() => of('timeout')),
  finalize(() => console.log('timeout stream finalized')),
));
console.log('consumer result:', result);
await delay(60);
console.log('underlying work committed:', committed);
