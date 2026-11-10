export function classifyMailFailure(error: unknown) {
  if (!(error instanceof Error)) return 'unconfirmed';
  const smtp = error as Error & {
    command?: string; code?: string; originalCode?: string; syscall?: string; responseCode?: number;
  };
  if (smtp.command === 'CONN' && smtp.code === 'ESOCKET' &&
      smtp.originalCode === 'ECONNREFUSED' && smtp.syscall === 'connect') return 'connect-refused';
  if (smtp.code === 'EENVELOPE' && smtp.command === 'RCPT TO') {
    switch (smtp.responseCode) {
      case 450: case 451: case 452: return 'recipient-deferred';
      case 550: case 551: case 553: return 'recipient-refused';
    }
  }
  return 'unconfirmed';
}
