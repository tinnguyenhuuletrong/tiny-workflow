export class MicroTaskRunner {
  private pendingTasks: Promise<any>[] = [];
  private resolved: PromiseSettledResult<any>[] = [];

  public addTask(task: Promise<any>) {
    this.pendingTasks.push(task);
  }

  reset() {
    this.pendingTasks.length = 0;
    this.resolved.length = 0;
  }

  stats() {
    return {
      total: this.pendingTasks.length,
      done: this.resolved.length,
    };
  }

  async idle() {
    while (this.resolved.length != this.pendingTasks.length) {
      this.resolved = await Promise.allSettled(this.pendingTasks);
    }
  }
}
