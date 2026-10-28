import { request } from 'node:http';
import { performance } from 'node:perf_hooks';

const start = performance.now();
let finishUpload;
try {
  await new Promise((resolve, reject) => {
    const upload = request('http://127.0.0.1:3000/captures', {
      method: 'POST',
      agent: false,
      headers: { 'Content-Type': 'application/json' },
    }, (response) => {
      response.setEncoding('utf8');
      response.on('data', (chunk) => process.stdout.write(chunk));
      response.on('error', reject);
      response.on('end', () => {
        console.log(`\nstatus=${response.statusCode}, elapsed=${Math.round(performance.now() - start)} ms`);
        if (response.statusCode === 201) resolve();
        else reject(new Error(`Unexpected HTTP status ${response.statusCode}`));
      });
    });
    upload.on('error', reject);
    upload.setTimeout(5000, () => upload.destroy(new Error('Upload idle timeout')));
    upload.write('{"originalText":"I enjoy');
    console.log('First part sent; finishing the body in 1500 ms.');
    finishUpload = setTimeout(() => upload.end(' learning English."}'), 1500);
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  clearTimeout(finishUpload);
}
