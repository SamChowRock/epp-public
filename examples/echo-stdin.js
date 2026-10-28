process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) {
  process.stdout.write(chunk);
}
console.error('stdin ended');
