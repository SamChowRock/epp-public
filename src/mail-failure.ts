export function classifyMailFailure(error: unknown) {
  if (!(error instanceof Error)) return 'unconfirmed';
  const smtp = error as Error & {
    command?: string; code?: string; originalCode?: string; syscall?: string; responseCode?: number;
  };
  if (smtp.command === 'CONN' && smtp.code === 'ESOCKET' &&
      smtp.originalCode === 'ECONNREFUSED' && smtp.syscall === 'connect') return 'connect-refused';
  // The delivery adapter sends to exactly one envelope recipient.
  const reply = smtp.responseCode;
  if (smtp.code === 'EENVELOPE' && smtp.command === 'RCPT TO' &&
      typeof reply === 'number' && Number.isInteger(reply)) {
    if (reply >= 400 && reply < 500) return 'recipient-deferred';
    if (reply >= 500 && reply < 600) return 'recipient-refused';
  }
  return 'unconfirmed';
}
