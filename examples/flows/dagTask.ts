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

type TStateShape = Partial<{
  chain: TaskInfo[];
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
    const chain = this.state.chain ?? [];

    // any processing -> process
    const itmProcessing = chain.find((itm) => itm.status === "processing");
    if (itmProcessing) {
      while (true) {
        const nextStatus = await this.logicHandler.pollStatus(itmProcessing);
        itmProcessing.status = nextStatus;
        if (nextStatus === "end") {
          this.addLog({
            type: "end_hit",
            values: {
              id: itmProcessing.id,
            },
          });
          break;
        }

        yield {
          canContinue: true,
          activeStep: EStep.step_process,
        };
      }
    }

    // find a new one to start
    const nextItm = chain.find(
      (itm) => itm.status === "waiting" || itm.status === undefined
    );
    if (nextItm) {
      await this.logicHandler.doStart(nextItm);
      nextItm.status = "processing";
      this.addLog({
        type: "start_hit",
        values: {
          id: nextItm.id,
        },
      });

      return { nextStep: EStep.step_process };
    }

    return { nextStep: EStep.step_end };
  }

  private async *step_end(): StepIt<EStep, null> {
    return { nextStep: null };
  }
}

async function main() {
  const taskState: TStateShape = {
    chain: [
      {
        id: "t1",
        ctx: {
          _doneAt: Date.now() + 1000,
        },
      },
      {
        id: "t2",
        ctx: {
          _doneAt: Date.now() + 2000,
        },
      },
      {
        id: "t3",
        ctx: {
          _doneAt: Date.now() + 3000,
        },
      },
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
    await setTimeout(breakTime);
  }

  console.dir(ins.toJSON(), { depth: 10 });
}

main();
