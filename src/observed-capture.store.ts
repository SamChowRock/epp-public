import type { CaptureStore } from './capture-store.js';
import type { Capture, CaptureListOptions } from './capture.js';
import { AppLogger } from './app-logger.js';
import { ApplicationState } from './application-state.js';

export class ObservedCaptureStore implements CaptureStore {
  constructor(
    private readonly inner: CaptureStore,
    private readonly logger: AppLogger,
    private readonly state: ApplicationState,
  ) {}
  private async call<T>(operation: string, work: () => Promise<T>): Promise<T> {
    const started = performance.now();
    return this.state.track(async () => {
      try {
        const value = await work();
        this.logger.write('debug', 'store.completed', {
          operation, durationMs: Math.round(performance.now() - started),
        });
        return value;
      } catch (error) {
        this.logger.write('error', 'store.failed', {
          operation, code: 'STORE_FAILURE', durationMs: Math.round(performance.now() - started),
        });
        throw error;
      }
    });
  }
  insert(capture: Capture): Promise<void> {
    return this.call('insert', () => this.inner.insert(capture));
  }
  list(options: CaptureListOptions): Promise<Capture[]> {
    return this.call('list', () => this.inner.list(options));
  }
  updateIntent(id: string, chineseIntent: string | null): Promise<Capture | undefined> {
    return this.call('updateIntent', () => this.inner.updateIntent(id, chineseIntent));
  }
  find(id: string): Promise<Capture | undefined> {
    return this.call('find', () => this.inner.find(id));
  }
}
