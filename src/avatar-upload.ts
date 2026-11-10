import { createWriteStream } from 'node:fs';
import { lstat, mkdir, mkdtemp, rm } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { join, resolve } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { HttpError } from './http.js';

const maxBytes = 2 * 1024 * 1024;
let activeUploads = 0;
const tooLarge = () => new HttpError(413, 'Avatar exceeds 2 MiB', 'AVATAR_TOO_LARGE');
const interrupted = () => new HttpError(400, 'Upload interrupted', 'UPLOAD_INTERRUPTED');

async function privateDirectory(): Promise<string> {
  const root = resolve('.avatar-tmp');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const stat = await lstat(root);
  if (!stat.isDirectory() || (process.getuid &&
    (stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0))) {
    throw new Error('Avatar temp root must be a private directory owned by the API');
  }
  return mkdtemp(join(root, 'upload-'));
}

async function receive(request: IncomingMessage, filename: string, drain?: AbortSignal): Promise<void> {
  let count = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      count += chunk.length;
      if (count > maxBytes) callback(tooLarge());
      else callback(null, chunk);
    },
  });
  const onInterrupted = () => { meter.destroy(interrupted()); };
  const onClose = () => { if (!request.readableEnded) onInterrupted(); };
  const onDrain = () => { meter.destroy(new HttpError(503, 'Service is shutting down', 'SERVICE_DRAINING')); };
  const timer = setTimeout(() => {
    meter.destroy(new HttpError(408, 'Upload deadline exceeded', 'UPLOAD_TIMEOUT'));
  }, 10_000);
  drain?.addEventListener('abort', onDrain, { once: true });
  request.once('error', onInterrupted);
  request.once('close', onClose);
  try {
    // Keep the socket outside pipeline: an over-limit chunk must still get its Problem response.
    const complete = pipeline(meter, createWriteStream(filename, { flags: 'wx', mode: 0o600 }));
    if (drain?.aborted) onDrain();
    else if (request.destroyed) onInterrupted();
    else request.pipe(meter);
    await complete;
  } finally {
    clearTimeout(timer);
    drain?.removeEventListener('abort', onDrain);
    request.unpipe(meter);
    request.off('close', onClose);
    request.off('error', onInterrupted);
  }
}

type ReceiveFile = <T>(processFile: (filename: string, format: 'png' | 'jpeg') => Promise<T>) => Promise<T>;

export async function withAvatarUpload<T>(
  request: IncomingMessage,
  work: (receiveFile: ReceiveFile) => Promise<T>,
  drain?: AbortSignal,
): Promise<T> {
  const type = request.headers['content-type']?.toLowerCase();
  if ((type !== 'image/jpeg' && type !== 'image/png')
    || (request.headers['content-encoding'] ?? 'identity').toLowerCase() !== 'identity') {
    throw new HttpError(415, 'Send an uncompressed JPEG or PNG body', 'AVATAR_MEDIA_TYPE');
  }
  if (Number(request.headers['content-length']) > maxBytes) throw tooLarge();
  if (activeUploads >= 2) throw new HttpError(429, 'Avatar processor is busy', 'AVATAR_BUSY');
  activeUploads++;
  try {
    return await work(async processFile => {
      const directory = await privateDirectory();
      try {
        const filename = join(directory, 'input');
        await receive(request, filename, drain);
        return await processFile(filename, type === 'image/png' ? 'png' : 'jpeg');
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  } finally {
    activeUploads--;
  }
}
