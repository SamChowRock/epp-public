// Loopback fault injector, one recipient per SMTP transaction. Never logs message content.
import { createServer } from 'node:net';
import { createInterface } from 'node:readline';

const [mode, port = '1045', ...extra] = process.argv.slice(2);
if (!['defer', 'reject', 'drop'].includes(mode) || !/^\d+$/.test(port) ||
    Number(port) < 1024 || Number(port) > 65535 || extra.length) {
  throw Error('Usage: node smtp-lab.mjs defer|reject|drop [port >= 1024]');
}
createServer(socket => {
  const lines = createInterface({ input: socket, crlfDelay: Infinity });
  let data = false;
  socket.on('error', () => socket.destroy());
  const reply = text => socket.write(text + '\r\n');
  reply('220 localhost chapter45');
  lines.on('line', line => {
    if (data) {
      if (line === '.') {
        console.log('end of DATA received; closing without final reply');
        socket.destroy();
      }
      return;
    }
    if (/^(EHLO|HELO|MAIL FROM:)/i.test(line)) reply('250 localhost');
    else if (/^RCPT TO:/i.test(line)) {
      if (mode === 'defer') reply('450 mailbox temporarily unavailable');
      else if (mode === 'reject') reply('550 mailbox unavailable');
      else reply('250 OK');
    } else if (line === 'DATA' && mode === 'drop') {
      data = true;
      reply('354 send data');
    } else if (line === 'QUIT') socket.end('221 bye\r\n');
    else reply('502 unsupported command');
  });
}).listen(Number(port), '127.0.0.1', () => console.log('SMTP lab ready', mode, port));
