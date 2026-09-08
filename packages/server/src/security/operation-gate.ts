export class OperationGate {
  private writer = false;
  private readers = 0;
  private queue: Array<{ write: boolean; resolve: () => void }> = [];
  private idleWaiters: Array<() => void> = [];

  snapshot() {
    return { writer: this.writer, readers: this.readers, queued: this.queue.length };
  }

  private drain(): void {
    if (this.writer) return;

    while (this.queue.length) {
      const first = this.queue[0]!;
      if (first.write) {
        if (this.readers) return;
        this.queue.shift();
        this.writer = true;
        first.resolve();
        return;
      }
      this.queue.shift();
      this.readers++;
      first.resolve();
    }

    if (!this.readers) {
      for (const resolve of this.idleWaiters.splice(0)) resolve();
    }
  }

  async idle(): Promise<void> {
    if (!this.writer && !this.readers && !this.queue.length) return;
    await new Promise<void>(resolve => this.idleWaiters.push(resolve));
  }

  async run<T>(write: boolean, operation: () => Promise<T>): Promise<T> {
    await new Promise<void>(resolve => {
      this.queue.push({ write, resolve });
      this.drain();
    });
    try {
      return await operation();
    } finally {
      if (write) this.writer = false;
      else this.readers--;
      this.drain();
    }
  }
}
