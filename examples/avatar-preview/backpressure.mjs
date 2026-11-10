import { once } from 'node:events';
import { Writable } from 'node:stream';
import { finished } from 'node:stream/promises';

async function measure(waitForDrain) {
  const blockBytes = 16 * 1024;
  let consumed = 0;
  const sink = new Writable({
    highWaterMark: 2 * blockBytes,
    write(block, _encoding, done) {
      setTimeout(() => {
        consumed += block.length;
        done();
      }, 4);
    },
  });
  let peakQueued = 0;
  for (let i = 0; i < 32; i++) {
    const ready = sink.write(Buffer.alloc(blockBytes));
    peakQueued = Math.max(peakQueued, sink.writableLength);
    if (!ready && waitForDrain) await once(sink, 'drain');
  }
  sink.end();
  await finished(sink);
  return { consumed, peakQueued };
}

console.log('wait for drain', await measure(true));
console.log('keep writing', await measure(false));
