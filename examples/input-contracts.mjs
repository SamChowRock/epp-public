import { z } from 'zod';
import { CreateCaptureSchema, ListQuerySchema } from '../dist/src/capture-contract.js';

const source = { originalText: '  Keep my spaces.  ', id: 'client-id' };
console.log('parsed:', CreateCaptureSchema.parse(source));
console.log('source keeps id:', source.id);
console.log('strict accepts extra:', z.strictObject({ originalText: z.string() }).safeParse(source).success);
console.log('loose keeps id:', z.looseObject({ originalText: z.string() }).parse(source).id);

const optional = z.string().optional();
const nullable = z.string().nullable();
for (const value of [undefined, null, '']) {
  console.log('presence:', value, optional.safeParse(value).success, nullable.safeParse(value).success);
}
console.log('default missing:', z.string().default('fallback').parse(undefined));
console.log('default accepts null:', z.string().default('fallback').safeParse(null).success);
console.log('coerce empty number:', z.coerce.number().parse(''));
console.log('coerce false string:', z.coerce.boolean().parse('false'));
for (const value of ['10', '', '1e1', '01', ['1', '2']]) {
  console.log('limit:', JSON.stringify(value), ListQuerySchema.shape.limit.safeParse(value).success);
}

const NumberText = z.string().regex(/^[1-9]\d?$/).transform(Number).pipe(z.number().int());
console.log('converted type:', typeof NumberText.parse('12'));
console.log('input description:', z.toJSONSchema(NumberText, { io: 'input', target: 'openapi-3.0' }));
try {
  z.toJSONSchema(z.string().transform(text => text.length));
} catch {
  console.log('bare transform has no automatic JSON Schema output');
}
console.log('emoji code units:', '😀'.length, 'code points:', [...'😀'].length);
console.log('2000 emoji accepted:', CreateCaptureSchema.safeParse({ originalText: '😀'.repeat(2000) }).success);
