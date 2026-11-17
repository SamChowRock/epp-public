import { withVerifiedDatabase } from '../../scripts/verify-database.mjs';
const [expected, ...extra] = process.argv.slice(2);
if (extra.length) throw Error('EXPECTED_DATABASE_REQUIRED');
await withVerifiedDatabase(expected, async (client) => {
  await client.query('BEGIN');
  try {
    await client.query(
      "SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='5s'",
    );
    const locked = await client.query(
      'SELECT id FROM verification_mail_control WHERE id=1 FOR UPDATE',
    );
    if (locked.rowCount !== 1) throw Error('MAIL_CONTROL_MISSING');
    const result = await client.query(`WITH batch AS (
   SELECT id FROM verification_outbox WHERE status IN ('accepted','obsolete','dead')
   AND retain_from<statement_timestamp()-interval '30 days'
   AND NOT EXISTS(SELECT FROM verification_mail_control WHERE paused_by=verification_outbox.id)
   ORDER BY retain_from,id LIMIT 100 FOR UPDATE SKIP LOCKED)
   DELETE FROM verification_outbox o USING batch WHERE o.id=batch.id RETURNING o.id,o.status`);
    await client.query('COMMIT');
    console.log(JSON.stringify(result.rows));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
});
