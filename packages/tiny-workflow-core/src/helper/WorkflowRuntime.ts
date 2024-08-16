import { DurableState } from "../DurableState";
import type {
  Constructor,
  DurableStateSystemEntry,
  SnapshotType,
} from "../type";

export type WorkflowRuntimeOpt<T extends DurableState> = {
  ctx: IRuntimeContext<T>;
  genRunId: () => Promise<string>;
  InstanceClass: Constructor<T>;
};

export interface IRuntimeContext<T extends DurableState> {
  attachRuntime(runtime: WorkflowRuntime<T>): void;

  save(runId: string, snapshotData: SnapshotType<T>): Promise<void>;
  load(runId: string): Promise<SnapshotType<T> | null>;

  lock(runId: string): Promise<void>;
  unlock(runId: string): Promise<void>;
}

export type WorkflowRunResult =
  | {
      runId: string;
      status: "need_resume";
      resumeEntry: DurableStateSystemEntry;
    }
  | {
      runId: string;
      status: "finished";
    }
  | {
      runId: string;
      status: "error";
      error?: any;
    };

export class WorkflowRuntime<T extends DurableState> {
  constructor(private opts: WorkflowRuntimeOpt<T>) {
    this.opts.ctx.attachRuntime(this);
  }

  get ctx() {
    return this.opts.ctx;
  }

  async run(ins: T, runId?: string): Promise<WorkflowRunResult> {
    if (!runId) runId = await this.opts.genRunId();

    try {
      await this.ctx.lock(runId);

      for await (const it of ins.exec(runId)) {
        if (it.resumeTrigger) {
          const resumeId = it.resumeTrigger.resumeId;
          const resumeEntry = ins.getResume(resumeId);
          if (!resumeEntry)
            throw new Error(`ResumeEntry not found resumeId=${resumeId}`);

          const data = ins.toJSON() as SnapshotType<T>;
          await this.opts.ctx.save(runId, data);

          return {
            runId,
            status: "need_resume",
            resumeEntry,
          };
        }
      }

      const data = ins.toJSON() as SnapshotType<T>;
      await this.opts.ctx.save(runId, data);
      return { runId, status: "finished" };
    } catch (error) {
      return { runId, status: "error", error };
    } finally {
      await this.ctx.unlock(runId);
    }
  }

  async resume(
    runId: string,
    {
      resumeId,
      resumePayload,
    }: {
      resumeId: string;
      resumePayload?: any;
    }
  ) {
    const ins = await this.createInstanceByRunId(
      runId,
      this.opts.InstanceClass
    );
    ins.resolveResume(resumeId, resumePayload);
    return this.run(ins, runId);
  }

  async createInstanceByRunId(runId: string, Cons: Constructor<T>) {
    const data = await this.opts.ctx.load(runId);
    if (!data) throw new Error(`snapshotData not found for runId=${runId}`);
    const ins = DurableState.fromJSON(Cons, data) as T;
    return ins;
  }
}
