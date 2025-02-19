import { DurableState, type StepIt } from "tiny-workflow-core/src";
import { setTimeout } from "node:timers/promises";
import assert from "node:assert";

enum EStep {
  step_begin = "step_begin",
  step_process = "step_process",
  step_end = "step_end",
}

type TaskInfo<T = Record<string, any>> = {
  id: string;
  status?: "waiting" | "processing" | "end";
  ctx?: T;
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
      withAuditLog: false,
      debug: false,
    });

    // collect and resgister all step handler
    Object.values(EStep).map((step) =>
      this.stepHandler.set(step, this[step].bind(this))
    );
  }

  updateLogicHandler(logicHandler: TaskDagHandler) {
    this.logicHandler = logicHandler;
  }

  setState(state: TStateShape) {
    this.state = state;
  }

  override exec(runId?: string) {
    if (!this.logicHandler) throw new Error("missing logicHandler");

    return super.exec();
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
        itm.status = "processing";
        this.addLog({
          type: "start_hit",
          values: {
            id: itm.id,
          },
        });
      } else {
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

function buildSequence() {
  const sequence: TaskSequence = [];
  const ins = {
    build() {
      return sequence;
    },
    next(taskInfo: TaskInfo) {
      sequence.push(taskInfo);
      return ins;
    },
  };
  return ins;
}

async function main() {
  /*
    Simulate sequence task

    t1_1 -> t1_2 -> t1_3
    t2_1
    t3_1 -> t3_2 -> t3_3

    Should finish when all tasks done
  */
  const taskState: TStateShape = {
    sequences: [
      // c1
      buildSequence()
        .next({
          id: "t1_1",
          ctx: {
            _doneAt: Date.now() + 1000,
          },
        })
        .next({
          id: "t1_2",
          ctx: {
            _doneAt: Date.now() + 2000,
          },
        })
        .next({
          id: "t1_3",
          ctx: {
            _doneAt: Date.now() + 3000,
          },
        })
        .build(),

      // c2
      buildSequence()
        .next({
          id: "t2_1",
          ctx: {
            _doneAt: Date.now() + 2000,
          },
        })
        .build(),
      // c3
      buildSequence()
        .next({
          id: "t3_1",
          ctx: {
            _doneAt: Date.now() + 1000,
          },
        })
        .next({
          id: "t3_2",
          ctx: {
            _doneAt: Date.now() + 5000,
          },
        })
        .build(),
    ],
  };

  // simulate pool workflow
  const handler: TaskDagHandler = {
    doStart: async (itm: TaskInfo) => {
      // do nothing
      console.info("start task ", itm.id);
    },
    pollStatus: async (itm: TaskInfo) => {
      const _doneAt = itm.ctx?.["_doneAt"] ?? 0;
      let status: TaskInfo["status"] = "processing";
      if (Date.now() > _doneAt) {
        status = "end";
      }

      console.info("pool task ", itm.id, "->", status);
      return status;
    },
  };

  async function _runMaxIter(ins: DagTaskEngine, maxIter: number) {
    for await (const it of ins.exec()) {
      maxIter--;
      if (maxIter <= 0) return false;

      const breakTime = 500;
      console.log(`\t take a break. poll again after ${breakTime} ms`);
      // console.dir(ins.currentState.sequences, { depth: 10 });
      await setTimeout(breakTime);
    }
    return true;
  }

  let ins: DagTaskEngine;
  let data;

  // 1st run. only 2 iter
  console.log("------------------------");
  console.log("Run only 2 iter");
  console.log("------------------------");

  {
    ins = new DagTaskEngine(handler);
    ins.setState(taskState);
    await _runMaxIter(ins, 2);
    data = ins.toJSON();
  }

  console.log("------------------------");
  console.log("SIMULATE SAVE / LOAD");
  console.log("Resume after 5 sec");
  console.log("------------------------");

  await setTimeout(5000);

  // load and resume
  {
    ins = DagTaskEngine.fromJSON(DagTaskEngine, data);
    ins.updateLogicHandler(handler);

    const res = await _runMaxIter(ins, 1000);

    assert(res === true, "Something wrong");
  }

  console.log("allDone:", ins.allDone);
  console.dir(ins.toJSON(), { depth: 10 });
}

main();
