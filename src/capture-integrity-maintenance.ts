import pg from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { OriginalTextSchema, StoredChineseIntentSchema, ChunksSchema } from './capture-contract.js';
import { parseDatabaseConfig } from './database-config.js';

const uuid = z.uuid().regex(/^[0-9a-f-]+$/);
const stamp = z.iso.datetime({ precision: 3 });
const ParentSchema = z.object({ id: uuid, user_id: uuid, original_text: OriginalTextSchema,
  chinese_intent: StoredChineseIntentSchema.nullable(), created_at: stamp }).strict();
const RevisionSchema = z.object({ id: uuid, capture_id: uuid, revision_no: z.number().int().positive(),
  original_text: OriginalTextSchema, chinese_intent: StoredChineseIntentSchema.nullable(),
  input_source: z.enum(['manual', 'unknown']), chunks: ChunksSchema, created_at: stamp }).strict();
export const CaptureEvidenceSchema = z.object({ version: z.literal(1), sourceRef: z.string().trim().min(1).max(200),
  sourceDatabase: z.string().min(1).max(63), exportedAt: stamp, parent: ParentSchema,
  revisions: z.array(RevisionSchema).min(1).max(10000) }).strict().superRefine((e, ctx) => {
  if (e.revisions.some((r, i) => r.capture_id !== e.parent.id || r.revision_no !== i + 1)
    || new Set(e.revisions.map(r => r.id)).size !== e.revisions.length) {
    ctx.addIssue({ code: 'custom', message: 'Evidence must contain a contiguous complete history for one parent' });
  }
});
type Evidence = z.infer<typeof CaptureEvidenceSchema>;
export class MaintenanceRefused extends Error {}
const refuse = (message: string): never => { throw new MaintenanceRefused(message); };
export const evidenceDigest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const parentColumns = `id, user_id, original_text, chinese_intent,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at`;
const revisionColumns = `id, capture_id, revision_no, original_text, chinese_intent, input_source, chunks,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at`;

export async function withMaintenanceDatabase<T>(expected: string, work: (client: pg.Client) => Promise<T>): Promise<T> {
  if (!expected || !expected.trim()) refuse('Pass the independently recorded expected database name');
  const client = new pg.Client({ connectionString: parseDatabaseConfig(process.env).url,
    connectionTimeoutMillis: 3000, statement_timeout: 30000, application_name: 'epp-integrity-maintenance' });
  try {
    await client.connect();
    if ((await client.query('SELECT current_database() AS name')).rows[0].name !== expected) {
      refuse('Database differs from the expected name');
    }
    return await work(client);
  } finally { await client.end(); }
}
async function transaction<T>(client: pg.Client, work: () => Promise<T>, readOnly = false): Promise<T> {
  await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '2s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '10s'");
    const result = await work(); await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
}
export async function startCaptureScan(client: pg.Client, scanId: string) {
  uuid.parse(scanId);
  return transaction(client, async () => {
    await client.query(`INSERT INTO public.capture_integrity_scans(id, database_name, upper_id)
      SELECT $1, current_database(), (SELECT id FROM public.captures ORDER BY id DESC LIMIT 1)
      ON CONFLICT (id) DO NOTHING`, [scanId]);
    return (await client.query('SELECT * FROM public.capture_integrity_scans WHERE id=$1', [scanId])).rows[0];
  });
}
export async function scanCaptureBatch(client: pg.Client, scanId: string, take: number) {
  uuid.parse(scanId); z.number().int().min(1).max(1000).parse(take);
  return transaction(client, async () => {
    const scan = (await client.query(`SELECT * FROM public.capture_integrity_scans WHERE id=$1 FOR UPDATE`, [scanId])).rows[0];
    if (!scan) refuse('Scan does not exist');
    if (scan.database_name !== (await client.query('SELECT current_database() AS name')).rows[0].name) refuse('Scan belongs to another database');
    if (scan.finished_at) return { scanId, scanned: scan.scanned, finished: true, findings: [] };
    const rows = (await client.query(`SELECT c.id,
      NOT EXISTS (SELECT FROM public.capture_revisions r WHERE r.capture_id=c.id) AS missing
      FROM public.captures c WHERE c.id <= $1::uuid AND ($2::uuid IS NULL OR c.id > $2::uuid)
      ORDER BY c.id LIMIT $3`, [scan.upper_id, scan.after_id, take])).rows;
    const findings = [];
    for (const row of rows.filter(r => r.missing)) {
      // A repair may have committed since the batch observation. Serialize on the
      // parent, then take a new READ COMMITTED snapshot before recording a case.
      const parent = await client.query('SELECT id FROM public.captures WHERE id=$1 FOR UPDATE', [row.id]);
      if (!parent.rowCount || (await client.query(
        'SELECT 1 FROM public.capture_revisions WHERE capture_id=$1 LIMIT 1', [row.id])).rowCount) continue;
      // Findings and the checkpoint commit together; a repeated batch cannot replace first_seen_at.
      const item = (await client.query(`INSERT INTO public.capture_integrity_cases(id,capture_id)
        VALUES($1,$2) ON CONFLICT (capture_id) WHERE state <> 'repaired'
        DO UPDATE SET last_seen_at=statement_timestamp()
        RETURNING id,capture_id,state,first_seen_at,last_seen_at`, [randomUUID(), row.id])).rows[0];
      findings.push(item);
    }
    const finished = rows.length < take || rows.at(-1)?.id === scan.upper_id;
    const progress = (await client.query(`UPDATE public.capture_integrity_scans
      SET after_id=COALESCE($2,after_id), scanned=scanned+$3,
        finished_at=CASE WHEN $4 THEN statement_timestamp() ELSE NULL END
      WHERE id=$1 RETURNING scanned`, [scanId, rows.at(-1)?.id ?? null, rows.length, finished])).rows[0];
    return { scanId, scanned: progress.scanned, finished, findings };
  });
}
async function lockCase(client: pg.Client, caseId: string) {
  // Consistent parent -> case lock order; readers keep normal MVCC snapshots.
  const found = (await client.query('SELECT capture_id FROM public.capture_integrity_cases WHERE id=$1', [caseId])).rows[0];
  if (!found) refuse('Case does not exist');
  const parent = (await client.query(`SELECT ${parentColumns} FROM public.captures WHERE id=$1 FOR UPDATE`, [found.capture_id])).rows[0];
  if (!parent) refuse('Parent is missing');
  const issue = (await client.query('SELECT * FROM public.capture_integrity_cases WHERE id=$1 FOR UPDATE', [caseId])).rows[0];
  return { parent, issue };
}
export async function quarantineCapture(client: pg.Client, caseId: string) {
  uuid.parse(caseId);
  return transaction(client, async () => {
    const { parent, issue } = await lockCase(client, caseId);
    if (issue.state === 'repaired') refuse('This case was repaired; a new incident needs a new scan');
    if ((await client.query('SELECT 1 FROM public.capture_revisions WHERE capture_id=$1 LIMIT 1', [parent.id])).rowCount) {
      refuse('Revisions exist; this rule cannot quarantine this capture');
    }
    await client.query(`UPDATE public.capture_integrity_cases SET state='quarantined',
      quarantined_at=COALESCE(quarantined_at,statement_timestamp()) WHERE id=$1`, [caseId]);
    return { caseId, captureId: parent.id, state: 'quarantined' };
  });
}
export async function exportCaptureEvidence(client: pg.Client, captureId: string, sourceRef: string): Promise<Evidence> {
  uuid.parse(captureId);
  return transaction(client, async () => {
    const parent = (await client.query(`SELECT ${parentColumns} FROM public.captures WHERE id=$1`, [captureId])).rows[0];
    const revisions = (await client.query(`SELECT ${revisionColumns} FROM public.capture_revisions
      WHERE capture_id=$1 ORDER BY revision_no LIMIT 10001`, [captureId])).rows;
    const sourceDatabase = (await client.query('SELECT current_database() AS name')).rows[0].name;
    return CaptureEvidenceSchema.parse({ version: 1, sourceRef, sourceDatabase, exportedAt: new Date().toISOString(), parent, revisions });
  }, true);
}
export async function repairCapture(client: pg.Client, caseId: string, bytes: Buffer, expectedSha256: string) {
  uuid.parse(caseId);
  if (bytes.length > 8 * 1024 * 1024 || !/^[0-9a-f]{64}$/.test(expectedSha256) || evidenceDigest(bytes) !== expectedSha256) {
    refuse('Evidence size or approved digest does not match');
  }
  const evidence = CaptureEvidenceSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  return transaction(client, async () => {
    const { parent, issue } = await lockCase(client, caseId);
    if (parent.id !== evidence.parent.id || JSON.stringify(parent) !== JSON.stringify(evidence.parent)) {
      refuse('Current parent differs from the approved evidence');
    }
    const existing = (await client.query(`SELECT ${revisionColumns} FROM public.capture_revisions
      WHERE capture_id=$1 ORDER BY revision_no LIMIT 10001`, [parent.id])).rows;
    if (issue.state === 'repaired') {
      const receipt = (await client.query('SELECT evidence_sha256 FROM public.capture_integrity_repairs WHERE case_id=$1', [caseId])).rows[0];
      // Later normal appends are allowed; the restored prefix must still be identical.
      if (receipt?.evidence_sha256 !== expectedSha256 || existing.length < evidence.revisions.length
        || JSON.stringify(existing.slice(0, evidence.revisions.length)) !== JSON.stringify(evidence.revisions)) {
        refuse('Repair replay conflicts with its receipt or restored history');
      }
      return { caseId, captureId: parent.id, state: 'repaired', replay: true };
    }
    if (issue.state !== 'quarantined' || existing.length) refuse('Expected a quarantined parent with no revisions');
    for (const revision of evidence.revisions) {
      await client.query(`INSERT INTO public.capture_revisions
        (id,capture_id,revision_no,original_text,chinese_intent,input_source,chunks,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::timestamptz)`,
      [revision.id, revision.capture_id, revision.revision_no, revision.original_text, revision.chinese_intent,
        revision.input_source, revision.chunks === null ? null : JSON.stringify(revision.chunks), revision.created_at]);
    }
    await client.query(`INSERT INTO public.capture_integrity_repairs(case_id,source_ref,evidence_sha256,evidence)
      VALUES($1,$2,$3,$4::jsonb)`, [caseId, evidence.sourceRef, expectedSha256, JSON.stringify(evidence)]);
    await client.query("UPDATE public.capture_integrity_cases SET state='repaired',repaired_at=statement_timestamp() WHERE id=$1", [caseId]);
    return { caseId, captureId: parent.id, state: 'repaired', replay: false };
  });
}
