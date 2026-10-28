console.log(JSON.stringify({
  pid: process.pid,
  cwd: process.cwd(),
  node: process.version,
  execPath: process.execPath,
  execArgv: process.execArgv,
  args: process.argv.slice(2),
  port: process.env.PORT ?? '(unset)',
  stdinIsTTY: process.stdin.isTTY === true,
  stdoutIsTTY: process.stdout.isTTY === true,
}, null, 2));
