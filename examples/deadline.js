import { performance } from 'node:perf_hooks';

export async function withDeadline(run, milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0 || milliseconds > 2_147_483_647) {
    throw new RangeError('Deadline must be a positive timer duration');
  }
  const controller = new AbortController();
  const deadline = performance.now() + milliseconds;
  const timeoutError = new Error('Operation deadline exceeded');
  timeoutError.name = 'TimeoutError';
  const timer = setTimeout(() => controller.abort(timeoutError), milliseconds);
  try {
    const result = await run(controller.signal);
    if (controller.signal.aborted || performance.now() >= deadline) throw timeoutError;
    return result;
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
