// Deployment configuration is fixed when this process starts.
const mode = process.env.CAPTURE_INTENT_MODE ?? 'optional';
if (mode !== 'optional' && mode !== 'required') {
  throw new Error('CAPTURE_INTENT_MODE must be optional or required');
}

export function missingRequiredIntent(intent: unknown): boolean {
  return mode === 'required' && intent === null;
}
