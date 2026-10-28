import legacy from './legacy.cjs';
import { label } from 'epp-module-demo';

console.log(legacy.prefix, label);
async function runMode() {
  const mode = process.argv[2];
  if (mode === 'private') await import('epp-module-demo/internal.js');
  if (mode === 'relative') console.log(await import('./internal.js'));
  if (mode === 'extensionless') await import('./entry');
  if (mode === 'require') {
    // Intentionally invalid in ESM: the experiment should throw.
    require('./legacy.cjs');
  }
}

runMode().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
