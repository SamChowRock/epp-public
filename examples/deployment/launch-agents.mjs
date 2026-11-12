import { launchPlist } from './launch-plist.mjs';
import { closeSync, openSync, mkdirSync, realpathSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function generate(root, database) {
  for (const directory of ['work', 'logs']) {
    if (!statSync(join(root, directory)).isDirectory()) {
      throw new Error(`Expected a directory: ${directory}`);
    }
  }

  const roles = {
    api: ['server.js'],
    mail: ['mail-worker.js', database],
    notifications: ['mail-worker.js', database, 'notifications'],
  };
  const files = new Map();
  for (const [role, [entry, ...args]] of Object.entries(roles)) {
    const script = join(root, 'release', 'dist', 'src', entry);
    const envFile = join(root, 'config', role + '.env');
    const config = statSync(envFile);
    if (!statSync(script).isFile() || !config.isFile()) {
      throw new Error(`Expected a release file and configuration file for ${role}`);
    }
    if (config.mode & 0o077) throw new Error(`${role}.env must be private`);

    const label = 'local.epp.ch57.' + role;
    const job = {
      Label: label,
      ProgramArguments: ['/usr/bin/env', '-i', process.execPath, '--env-file=' + envFile, script, ...args],
      WorkingDirectory: join(root, 'work'),
      StandardOutPath: join(root, 'logs', role + '.log'),
      StandardErrorPath: join(root, 'logs', role + '.err'),
      Umask: 0o077,
      ExitTimeOut: 40,
      RunAtLoad: role !== 'mail',
    };
    if (role !== 'mail') {
      job.KeepAlive = { SuccessfulExit: false };
      job.ThrottleInterval = 10;
    }
    files.set(label + '.plist', launchPlist(job));
  }

  const destination = join(root, 'agents');
  mkdirSync(destination, { mode: 0o700 });
  const written = [];
  try {
    for (const [name, plist] of files) {
      const file = join(destination, name);
      const fd = openSync(file, 'wx', 0o600);
      written.push(file);
      try {
        writeFileSync(fd, plist);
      } finally {
        closeSync(fd);
      }
    }
  } catch (error) {
    for (const file of written) unlinkSync(file);
    rmdirSync(destination);
    throw error;
  }
}

try {
  const [root, database, ...extra] = process.argv.slice(2);
  if (!root || !database || extra.length || !/^[A-Za-z_][A-Za-z_0-9]*$/.test(database)) {
    throw new Error('Usage: node launch-agents.mjs DEPLOY_ROOT EXPECTED_DATABASE (simple database name)');
  }
  generate(realpathSync(root), database);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
