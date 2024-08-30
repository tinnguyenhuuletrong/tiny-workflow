import { setTimeout as waitMs } from "node:timers/promises";
import type { DurableState } from "../DurableState";
import type { SnapshotType } from "../type";
import { MicroTaskRunner } from "./MicroTaskRunner";
import type {
  IRuntimeContext,
  WorkflowRuntime,
  WorkflowRunResult,
} from "./WorkflowRuntime";

export class MemoryLock {
  readonly promise: Promise<void>;
  private resolve!: Function;

  constructor() {
    this.promise = new Promise<void>((resolve) => {
      this.resolve = resolve;
    });
  }

  unlock() {
    this.resolve();
  }

  async wait() {
    return this.promise;
  }
}

export class SimpleContext<T extends DurableState>
  implements IRuntimeContext<T>
{
  readonly runner = new MicroTaskRunner();
  runtime!: WorkflowRuntime<T>;

  db = new Map<string, SnapshotType<T>>();
  dbLock = new Map<string, MemoryLock>();

  attachRuntime(runtime: WorkflowRuntime<T>) {
    if (this.runtime)
      throw new Error("can not re-attach. Something wrong here");
    this.runtime = runtime;
  }

  async lock(runId: string) {
    const tmp = this.dbLock.get(runId);
    if (tmp) await tmp.wait();

    const ins = new MemoryLock();
    this.dbLock.set(runId, ins);
  }

  async unlock(runId: string) {
    const tmp = this.dbLock.get(runId);
    if (tmp) {
      tmp.unlock();
      this.dbLock.delete(runId);
    }
  }

  async save(runId: string, snapshotData: SnapshotType<T>) {
    this.db.set(runId, snapshotData);
  }

  async load(runId: string) {
    const tmp = this.db.get(runId);
    if (!tmp) return null;
    return tmp;
  }

  async start() {
    this.runner.reset();
  }

  async shutdown() {
    for (const it of this.dbLock.entries()) {
      it[1].unlock();
    }
  }

  async withTransaction(runId: string, action: () => Promise<void>) {
    try {
      await this.lock(runId);
      await action();
    } catch (error) {
      throw error;
    } finally {
      await this.unlock(runId);
    }
  }

  async scheduleNextRun(runId: string, result: WorkflowRunResult) {
    switch (result.status) {
      case "need_resume":
        {
          switch (result.resumeEntry.type) {
            case "timer":
              {
                await waitMs(result.resumeEntry.resumeAfter - Date.now());
                const res = await this.runtime.resume(runId, {
                  resumeId: result.resumeEntry.resumeId,
                  resumePayload: undefined,
                });

                this.runner.addTask(this.scheduleNextRun(runId, res), {
                  runId,
                });
              }
              break;

            default:
              throw new Error(
                `can not handle resumeType=${result.resumeEntry.type}. consider to extend this class to add more logic`
              );
          }
        }
        break;

      case "error": {
        console.error(`error runId=${runId} - detail=`, result);
        return;
      }
      default:
        break;
    }
  }
}
