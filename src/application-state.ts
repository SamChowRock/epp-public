export class ApplicationState {
  draining = false;
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
