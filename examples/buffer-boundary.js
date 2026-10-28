import { Buffer } from 'node:buffer';
import { StringDecoder } from 'node:string_decoder';

const bytes = Buffer.from('我', 'utf8');
const first = bytes.subarray(0, 1);
const second = bytes.subarray(1);

console.log('字符串长度:', '我'.length);
console.log('UTF-8 字节数:', bytes.length);
console.log('十六进制:', bytes.toString('hex'));
console.log('逐块解码:', first.toString('utf8') + second.toString('utf8'));
console.log('合并后解码:', Buffer.concat([first, second]).toString('utf8'));

const decoder = new StringDecoder('utf8');
console.log('第一次解码:', JSON.stringify(decoder.write(first)));
console.log('第二次解码:', decoder.write(second));
console.log('结束解码:', JSON.stringify(decoder.end()));
