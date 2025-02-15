import { DurableState, type StepIt } from "tiny-workflow-core/src";
import { setTimeout } from "node:timers/promises";

enum EStep {
  step_begin = "step_begin",
  step_process = "step_process",
  step_end = "step_end",
}

type TaskInfo = {
  id: string;
  status?: "waiting" | "processing" | "end";
  ctx?: Record<string, any>;
};

type TaskSequence = TaskInfo[];

type TStateShape = Partial<{
  sequences: TaskSequence[];
}>;

// additional audit log message
type EAuditLog = "start_hit" | "end_hit";

type TaskDagHandler = {
  doStart: (itm: TaskInfo) => Promise<void>;
  pollStatus: (itm: TaskInfo) => Promise<TaskInfo["status"]>;
};

class DagTaskEngine extends DurableState<EStep, TStateShape, EAuditLog> {
  constructor(private logicHandler: TaskDagHandler) {
    super(EStep.step_begin, {
      withAuditLog: true,
      debug: true,
    });

    // collect and resgister all step handler
    Object.values(EStep).map((step) =>
      this.stepHandler.set(step, this[step].bind(this))
    );
  }

  setState(state: TStateShape) {
    this.state = state;
  }

  private async *step_begin(): StepIt<EStep, EStep.step_process> {
    return { nextStep: EStep.step_process };
  }

  private async *step_process(): StepIt<
    EStep,
    EStep.step_end | EStep.step_process
  > {
    const sequences = this.state.sequences ?? [];

    const tasks = sequences.map((chain) => this._processOneChain(chain));

    while (!this.allDone) {
      await Promise.allSettled(tasks.map((itm) => itm.next()));

      yield {
        canContinue: false,
        activeStep: EStep.step_process,
      };
    }

    return { nextStep: EStep.step_end };
  }

  private async *step_end(): StepIt<EStep, null> {
    return { nextStep: null };
  }

  private async *_processOneChain(chain: TaskInfo[]) {
    for (let i = 0; i < chain.length; i++) {
      const itm = chain[i];
      if (itm.status === "end") continue;

      const isWaiting = itm.status === "waiting" || itm.status === undefined;
      if (isWaiting) {
        await this.logicHandler.doStart(itm);
        this.addLog({
          type: "start_hit",
          values: {
            id: itm.id,
          },
        });
        yield;
      }

      // poll
      const nextStatus = await this.logicHandler.pollStatus(itm);
      itm.status = nextStatus;
      if (nextStatus === "end") {
        this.addLog({
          type: "end_hit",
          values: {
            id: itm.id,
          },
        });
        continue;
      }

      yield;
      i--;
    }
  }

  public get allDone() {
    const sequences = this.state.sequences ?? [];
    return sequences.every(this.isOneChainDone);
  }

  private isOneChainDone(chain: TaskInfo[]) {
    return chain.every((itm) => itm.status === "end");
  }
}

async function main() {
  const taskState: TStateShape = {
    sequences: [
      // c1
      [
        {
          id: "t1_1",
          ctx: {
            _doneAt: Date.now() + 1000,
          },
        },
        {
          id: "t1_2",
          ctx: {
            _doneAt: Date.now() + 2000,
          },
        },
        {
          id: "t1_3",
          ctx: {
            _doneAt: Date.now() + 3000,
          },
        },
      ],

      // c2
      [
        {
          id: "t2_1",
          ctx: {
            _doneAt: Date.now() + 2000,
          },
        },
      ],
    ],
  };

  const handler: TaskDagHandler = {
    doStart: async (itm: TaskInfo) => {
      // do nothing
    },
    pollStatus: async (itm: TaskInfo) => {
      const _doneAt = itm.ctx?.["_doneAt"] ?? 0;
      if (Date.now() > _doneAt) return "end";
      return "processing";
    },
  };

  const ins = new DagTaskEngine(handler);
  ins.setState(taskState);

  for await (const it of ins.exec()) {
    const breakTime = 500;
    console.log(`\t take a break. poll again after ${breakTime} ms`);
    console.dir(ins.currentState.sequences, { depth: 10 });
    await setTimeout(breakTime);
  }

  console.log("allDone:", ins.allDone);
  console.dir(ins.toJSON(), { depth: 10 });
}

main();
