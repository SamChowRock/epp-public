import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
export async function readPrivate(file) {
  const h = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const s = await h.stat();
    if (!s.isFile() || (s.mode & 0o777) !== 0o600 || s.uid !== process.getuid() || s.size > 65536) throw Error('PRIVATE_FILE_REQUIRED');
    const b = Buffer.alloc(65537), {bytesRead} = await h.read(b, 0, b.length, 0);
    if (bytesRead > 65536) throw Error('PRIVATE_FILE_REQUIRED');
    return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(b.subarray(0, bytesRead)));
  } finally { await h.close(); }
}
export async function writePrivate(file, value) {
  const h = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await h.writeFile(JSON.stringify(value,null,2)+'\n'); } finally { await h.close(); }
}
export function localRequest(port, mode) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || !['accepted','lost','early'].includes(mode)) throw Error('LOCAL_PEER_REQUIRED');
  return async (url, init) => {
    if (url !== 'https://api.resend.com/emails') throw Error('OFFICIAL_ENDPOINT_REQUIRED');
    if (init?.method !== 'POST' || init.redirect !== 'error') throw Error('ADAPTER_REQUEST_REQUIRED');
    const headers = new Headers(init.headers);
    headers.set('X-EPP-Local-Mode',mode);
    return fetch(`http://127.0.0.1:${port}/emails`, {...init, headers});
  };
}

export async function replacePrivate(file, value) {
  const h = await open(file, constants.O_WRONLY | constants.O_NOFOLLOW);
  try {
    const s = await h.stat();
    if (!s.isFile() || (s.mode & 0o777) !== 0o600 || s.uid !== process.getuid()) throw Error('PRIVATE_FILE_REQUIRED');
    await h.truncate(0); await h.writeFile(JSON.stringify(value,null,2)+'\n');
  } finally { await h.close(); }
}
export async function saveResponse(file, eventId, status) {
  if(typeof eventId!=='string'||!eventId.length||eventId.length>200||!Number.isInteger(status)||status<100||status>599) throw Error('SAFE_RESPONSE_REQUIRED');
  const value={eventId,status};
  try{await writePrivate(file,value);}catch(e){if(e.code!=='EEXIST')throw e;await replacePrivate(file,value);}
}
