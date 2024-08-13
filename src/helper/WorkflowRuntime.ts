import { DurableState } from "../DurableState";
import type { Constructor, DurableStateSystemEntry } from "../type";

export type SnapshotType<T extends DurableState> = ReturnType<T["toJSON"]>;
export type WorkflowRuntimeOpt<T extends DurableState> = {
  storage: IStorage<T>;
  genRunId: () => Promise<string>;
};

export interface IStorage<T extends DurableState> {
  save(runId: string, snapshotData: SnapshotType<T>): Promise<void>;
  load(runId: string): Promise<SnapshotType<T> | null>;
}

type WorkflowRunResult =
  | {
      runId: string;
      status: "need_resume";
      resumeEntry: DurableStateSystemEntry;
    }
  | {
      runId: string;
      status: "finished";
    };

export class WorkflowRuntime<T extends DurableState> {
  constructor(private opts: WorkflowRuntimeOpt<T>) {}

  async run(ins: T, runId?: string): Promise<WorkflowRunResult> {
    if (!runId) runId = await this.opts.genRunId();

    for await (const it of ins.exec(runId)) {
      if (it.resumeTrigger) {
        const resumeId = it.resumeTrigger.resumeId;
        const resumeEntry = ins.getResume(resumeId);
        if (!resumeEntry)
          throw new Error(`ResumeEntry not found resumeId=${resumeId}`);

        const data = ins.toJSON() as SnapshotType<T>;
        await this.opts.storage.save(runId, data);

        return {
          runId,
          status: "need_resume",
          resumeEntry,
        };
      }
    }

    const data = ins.toJSON() as SnapshotType<T>;
    await this.opts.storage.save(runId, data);
    return { runId, status: "finished" };
  }

  async resume(
    runId: string,
    Cons: Constructor<T>,
    {
      resumeId,
      resumePayload,
    }: {
      resumeId: string;
      resumePayload?: any;
    }
  ) {
    const ins = await this.getInsByRunId(runId, Cons);
    ins.resolveResume(resumeId, resumePayload);
    return this.run(ins, runId);
  }

  async getInsByRunId(runId: string, Cons: Constructor<T>) {
    const data = await this.opts.storage.load(runId);
    if (!data) throw new Error(`snapshotData not found for runId=${runId}`);
    const ins = DurableState.fromJSON(Cons, data) as T;
    return ins;
  }
}
