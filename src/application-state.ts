export class ApplicationState {
  private stopping = false;
  private readonly drainListeners = new Set<() => void>();
  get draining(): boolean { return this.stopping; }
  beginDrain(): void {
    this.stopping = true;
    for (const close of this.drainListeners) close();
    this.drainListeners.clear();
  }
  onDrain(close: () => void): () => void {
    this.drainListeners.add(close);
    return () => { this.drainListeners.delete(close); };
  }
  private pending = 0;
  private readonly waiters = new Set<() => void>();
  get active(): number { return this.pending; }

  async track<T>(work: () => Promise<T>): Promise<T> {
    this.pending++;
    try { return await work(); }
    finally {
      this.pending--;
      if (this.pending === 0) {
        for (const resolve of this.waiters) resolve();
        this.waiters.clear();
      }
    }
  }
  whenIdle(): Promise<void> {
    if (this.pending === 0) return Promise.resolve();
    return new Promise(resolve => this.waiters.add(resolve));
  }
}
