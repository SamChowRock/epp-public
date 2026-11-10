import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

process.umask(0o077);
const dir = resolve('.chapter51-store');
// Refuse an existing directory: rerunning must never rotate live credentials.
await mkdir(dir, { mode: 0o700 });
await mkdir(resolve(dir, 'data'));
const config = resolve(dir, 'config');
await mkdir(config);
// mini looks up each TOML name separately. Give this lab its own metadata
// directory and local defaults even on a Mac with an existing SeaweedFS setup.
await writeFile(resolve(config, 'filer.toml'),
  '[leveldb2]\nenabled = true\ndir = "./data/filerldb2"\n', { flag: 'wx' });
for (const component of ['master', 'volume', 'security', 'admin', 'notification', 'replication', 'shell', 'credential']) {
  await writeFile(resolve(config, component + '.toml'), '# Use built-in defaults for this local lab.\n', { flag: 'wx' });
}
const identity = (name, actions) => ({
  name, actions, credentials: [{
    accessKey: randomBytes(12).toString('hex'),
    secretKey: randomBytes(32).toString('hex'),
  }],
});
const admin = identity('chapter51-admin', ['Admin', 'List', 'Read', 'Write']);
const app = identity('chapter51-api', ['Read:avatars', 'Write:avatars']);
await writeFile(resolve(dir, 's3.json'), JSON.stringify({ identities: [admin, app] }), { flag: 'wx' });
for (const [file, account] of [['admin.env', admin], ['app.env', app]]) {
  const { accessKey, secretKey } = account.credentials[0];
  await writeFile(resolve(dir, file), [
    'AVATAR_S3_ENDPOINT=http://127.0.0.1:18633', 'AVATAR_S3_BUCKET=avatars',
    'AVATAR_S3_ACCESS_KEY=' + accessKey, 'AVATAR_S3_SECRET_KEY=' + secretKey, '',
  ].join('\n'), { flag: 'wx' });
}
console.log('Created .chapter51-store with separate admin and API identities.');
