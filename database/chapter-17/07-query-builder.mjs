import { pathToFileURL } from 'node:url';

// Isolated mechanism example: returns SQL + values, never opens a connection.
// userId must come from a trusted server identity, not an HTTP body field.
export function buildCaptureQuery({ userId, text, limit, offset = 0, sort = 'oldest' }) {
  if (typeof userId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    throw new TypeError('userId must be a UUID');
  }
  if (text !== undefined && (typeof text !== 'string' || !text.trim() ||
      text.length > 200 || !text.isWellFormed() || text.includes('\0'))) {
    throw new TypeError('text must be representable nonblank text, at most 200 UTF-16 units');
  }
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
    throw new TypeError('limit must be an integer from 1 to 100');
  }
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000) {
    throw new TypeError('offset must be an integer from 0 to 10000 in this example');
  }
  const orders = new Map([
    ['oldest', 'created_at ASC, id ASC'],
    ['newest', 'created_at DESC, id DESC'],
  ]);
  const order = orders.get(sort);
  if (order === undefined) throw new TypeError('unsupported sort');

  const values = [userId];
  const where = ['user_id = $1'];
  if (text !== undefined) {
    values.push(text);
    where.push(`strpos(original_text, $${values.length}) > 0`);
  }
  let sql = 'SELECT id, original_text, created_at FROM public.captures' +
    ` WHERE ${where.join(' AND ')} ORDER BY ${order}`;
  if (limit !== undefined) {
    values.push(limit);
    sql += ` LIMIT $${values.length}`;
  }
  values.push(offset);
  sql += ` OFFSET $${values.length}`;
  return { sql, values };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(buildCaptureQuery({
    userId: '10000000-0000-4000-8000-000000000001',
    text: "' OR true --", limit: 10, sort: 'oldest',
  }));
}
