import { open, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { withMaintenanceDatabase, startCaptureScan, scanCaptureBatch, quarantineCapture,
  exportCaptureEvidence, repairCapture, evidenceDigest, MaintenanceRefused } from './capture-integrity-maintenance.js';
import { databaseFailure } from './database-errors.js';

// No target is inferred from a default database name or an API user identity.
const [command, expected, id, ...args] = process.argv.slice(2);
process.umask(0o077);
try {
  if (!expected || !id) throw new MaintenanceRefused('Usage: <start|scan|quarantine|export|repair> <expected-database> <scan/case/capture-uuid> [arguments]');
  const result = await withMaintenanceDatabase(expected, async client => {
    if (command === 'start' && args.length === 0) return startCaptureScan(client, id);
    if (command === 'scan' && args.length === 1 && /^(?:[1-9][0-9]{0,2}|1000)$/.test(args[0]!)) return scanCaptureBatch(client, id, Number(args[0]));
    if (command === 'quarantine' && args.length === 0) return quarantineCapture(client, id);
    if (command === 'export' && args.length === 2) {
      const evidence = await exportCaptureEvidence(client, id, args[0]!);
      const bytes = Buffer.from(JSON.stringify(evidence, null, 2) + '\n');
      if (bytes.length > 8 * 1024 * 1024) throw new MaintenanceRefused('Evidence exceeds 8 MiB; use a reviewed larger recovery procedure');
      await writeFile(args[1]!, bytes, { flag: 'wx', mode: 0o600 });
      return { captureId: id, revisions: evidence.revisions.length, sha256: evidenceDigest(bytes) };
    }
    if (command === 'repair' && args.length === 2) {
      const file = await open(args[0]!, 'r');
      let bytes: Buffer;
      try {
        if ((await file.stat()).size > 8 * 1024 * 1024) throw new MaintenanceRefused('Evidence exceeds 8 MiB');
        bytes = await file.readFile();
      } finally { await file.close(); }
      return repairCapture(client, id, bytes, args[1]!);
    }
    throw new MaintenanceRefused('Invalid command or arguments');
  });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(JSON.stringify({ status: 'refused', code: error instanceof z.ZodError ? 'INVALID_EVIDENCE_OR_ID'
    : error instanceof MaintenanceRefused ? 'MAINTENANCE_REFUSED' : databaseFailure(error).code,
    ...(error instanceof MaintenanceRefused ? { reason: error.message } : {}) }));
  process.exitCode = 1;
}
