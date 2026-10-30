import ts from 'typescript';
import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Keep development and production on the same TypeScript compiler settings.
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const format = {
  getCanonicalFileName: name => name,
  getCurrentDirectory: ts.sys.getCurrentDirectory,
  getNewLine: () => ts.sys.newLine,
};
const entry = process.argv[2] ?? '.dev/src/server.js';
const configFile = process.argv[3] ?? 'tsconfig.dev.json';

let child;
let revision = 0;
let compiled = false;
let stopping = false;
let pending = Promise.resolve();

async function stopServer() {
  const current = child;
  if (!current || current.exitCode !== null || current.signalCode !== null) return;
  await new Promise(resolve => {
    const deadline = setTimeout(() => current.kill('SIGKILL'), 35000);
    current.once('exit', () => { clearTimeout(deadline); resolve(); });
    current.kill('SIGTERM');
  });
}

function restart(ready) {
  const requested = ++revision;
  pending = pending.then(async () => {
    await stopServer();
    if (stopping || requested !== revision || !ready) return;
    mkdirSync('.dev/config', { recursive: true });
    copyFileSync('config/service.json', '.dev/config/service.json');
    const current = spawn(process.execPath, ['--inspect=127.0.0.1:9229', '--enable-source-maps', entry], {
      stdio: 'inherit',
    });
    child = current;
    current.on('error', error => console.error('[dev]', error.message));
    current.on('exit', (code, signal) => {
      if (child === current) child = undefined;
      console.log(`[dev] Server exited (${signal ?? code}); waiting for changes.`);
    });
    console.log(`[dev] Starting compiled server (pid=${current.pid}).`);
  }).catch(error => console.error('[dev]', error.message));
}

const host = ts.createWatchCompilerHost(
  configFile, { noEmitOnError: true }, ts.sys,
  ts.createEmitAndSemanticDiagnosticsBuilderProgram,
  diagnostic => {
    console.error(ts.formatDiagnostic(diagnostic, format));
    compiled = false;
    restart(false);
  },
  diagnostic => console.log(ts.formatDiagnostic(diagnostic, format)),
);
host.afterProgramCreate = program => {
  const diagnostics = [...ts.getPreEmitDiagnostics(program.getProgram()), ...program.emit().diagnostics];
  for (const diagnostic of diagnostics) console.error(ts.formatDiagnostic(diagnostic, format));
  compiled = !diagnostics.some(item => item.category === ts.DiagnosticCategory.Error);
  console.log(compiled ? '[dev] Build succeeded.' : '[dev] Build failed; server stopped until fixed.');
  restart(compiled);
};
const watcher = ts.createWatchProgram(host);
const assets = ts.sys.watchFile('config/service.json', () => restart(compiled), 250);

async function shutdown() {
  if (stopping) return;
  stopping = true;
  revision++;
  watcher.close();
  assets.close();
  await pending;
  await stopServer();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
