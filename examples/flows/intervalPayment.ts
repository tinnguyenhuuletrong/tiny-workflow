import { join } from "path";
import {
  DurableState,
  type SnapshotType,
  type StepHandler,
  type StepIt,
} from "tiny-workflow-core/src";
import {
  WorkflowRuntime,
  type IStorage,
  type WorkflowRunResult,
  type WorkflowRuntimeOpt,
} from "tiny-workflow-core/src/helper/WorkflowRuntime";

enum EStep {
  step_begin = "step_begin",
  step_wait = "step_wait",
  step_send_receipt = "step_send_receipt",
  step_cancel = "step_cancel",
  step_end = "step_end",
}

type UsageItem = {
  item: string;
  amount: number;
};
type ReceiptItem = {
  cycle: number;
  createdAt: number;
  usages: UsageItem[];
  deliveryId?: string;
};
type TStateShape = {
  userEmail: string;
  paymentIntervalMs: number;

  _cycle: number;
  _nextPaymentAt: number;

  status: "active" | "cancel";
  currentUsages: UsageItem[];

  receipts: Array<ReceiptItem>;
};
type EAuditLog = "set_param" | "add_usage" | "bill_sent" | "cancel";

class IntervalPaymentFlow extends DurableState<EStep, TStateShape, EAuditLog> {
  // Type Safeguard & Auto register
  private _static(key: EStep): StepHandler<EStep> {
    return this[key];
  }
  private _collectAndRegisterSteps() {
    Object.values(EStep).map((step) =>
      this.stepHandler.set(step, this._static(step).bind(this))
    );
  }
  constructor() {
    super(EStep.step_begin, {
      withAuditLog: false,
      debug: true,
    });
    this._collectAndRegisterSteps();
  }

  setParam(tmp: Pick<TStateShape, "userEmail" | "paymentIntervalMs">) {
    this.state = { ...this.state, ...tmp };

    this.addLog({
      type: "set_param",
      values: {
        ...tmp,
      },
    });
  }

  addUsage(usageItem: UsageItem) {
    if (this.state.status != "active")
      throw new Error("status is not active. can not process");

    this.state.currentUsages.push({ ...usageItem });
    this.addLog({
      type: "add_usage",
      values: {
        ...usageItem,
      },
    });
  }

  cancel() {
    if (this.state.status != "active")
      throw new Error("status is not active. can not process");

    this.state.status = "cancel";

    this.addLog({
      type: "cancel",
      values: {},
    });
  }

  private async *step_begin(): StepIt<EStep, EStep.step_wait> {
    this.state = {
      ...this.state,
      ...{
        status: "active",
        _cycle: 0,
        _nextPaymentAt: Date.now() + this.state.paymentIntervalMs,
        currentUsages: [],
        receipts: [],
      },
    };
    return { nextStep: EStep.step_wait };
  }

  private async *step_wait(): StepIt<
    EStep,
    EStep.step_cancel | EStep.step_send_receipt
  > {
    while (this.state.status === "active") {
      const cycle_no = this.state._cycle;
      const needToWaitMs = this.state._nextPaymentAt - Date.now();
      const res = this.waitForMs(
        `wait_for_end_cycle_${cycle_no}`,
        needToWaitMs
      );
      if (res.it) {
        this._debug("wait for cycle_no=", cycle_no);
        yield res.it;
      }

      if (this.state.status !== "active") {
        return { nextStep: EStep.step_cancel };
      }

      this.state._cycle = this.state._cycle + 1;
      this.state._nextPaymentAt = Date.now() + this.state.paymentIntervalMs;
      this._debug(
        "inc cycle_no=",
        this.state._cycle,
        "nextCheck=",
        this.state._nextPaymentAt
      );

      // have any usage
      if (this.state.currentUsages.length > 0) {
        const receipt: ReceiptItem = {
          cycle: cycle_no,
          createdAt: Date.now(),
          usages: [...this.state.currentUsages],
        };
        this.state.receipts.push(receipt);
        this.state.currentUsages = [];

        return { nextStep: EStep.step_send_receipt };
      }
    }

    return { nextStep: EStep.step_cancel };
  }

  private async *step_send_receipt(): StepIt<
    EStep,
    EStep.step_wait | EStep.step_end
  > {
    const lastReceipt = this.state.receipts.at(-1);
    const cycle_no = lastReceipt?.cycle;
    if (!lastReceipt) throw new Error("lastReceipt is null");

    const res = await this.withAction<string>(
      `send_receipt_email_${cycle_no}`,
      async () => {
        const deliveryId = Date.now().toString(32);
        this._debug(
          `Send bill for cycle_no=${cycle_no} to email=${
            this.state.userEmail
          }, receipt=${JSON.stringify(lastReceipt)}`
        );

        this.addLog({
          type: "bill_sent",
          values: {
            receipt: { ...lastReceipt },
          },
        });
        return deliveryId;
      }
    );

    if (res.it) {
      yield res.it;
    }
    if (res.value) lastReceipt.deliveryId = res.value;

    if (this.state.status === "active") return { nextStep: EStep.step_wait };
    else return { nextStep: EStep.step_end };
  }

  private async *step_cancel(): StepIt<
    EStep,
    EStep.step_end | EStep.step_send_receipt
  > {
    const cycle_no = this.state._cycle;

    // any usage ?
    if (this.state.currentUsages.length > 0) {
      const receipt: ReceiptItem = {
        cycle: cycle_no,
        createdAt: Date.now(),
        usages: [...this.state.currentUsages],
      };
      this.state.receipts.push(receipt);
      this.state.currentUsages = [];

      return { nextStep: EStep.step_send_receipt };
    }

    return { nextStep: EStep.step_end };
  }

  private async *step_end(): StepIt<EStep, null> {
    return { nextStep: null };
  }
}

async function main() {
  const storage = new MemStorage();
  let count = 0;
  const opt: WorkflowRuntimeOpt<IntervalPaymentFlow> = {
    genRunId: async () => `r_${count++}`,
    storage,
  };

  const workflowRuntime = new WorkflowRuntime<IntervalPaymentFlow>(opt);
  workflowRuntime.runner.reset();

  const ins = new IntervalPaymentFlow();
  ins.setParam({
    userEmail: "info@company.com",
    paymentIntervalMs: 10_000,
  });

  const runId = `run_${ins.currentState.userEmail}`;
  workflowRuntime.runner.addTask(runBackground(runId, workflowRuntime, ins));
  workflowRuntime.runner.addTask(runFrontend(runId, storage, workflowRuntime));

  await workflowRuntime.runner.idle();
  console.log("all done");
}
main();

async function scheduleNextRun(
  runId: string,
  workflowRuntime: WorkflowRuntime<IntervalPaymentFlow>,
  tmp: WorkflowRunResult
) {
  switch (tmp.status) {
    case "need_resume":
      {
        if (tmp.resumeEntry.type === "timer") {
          await Bun.sleep(tmp.resumeEntry.resumeAfter - Date.now());
          const res = await workflowRuntime.resume(runId, IntervalPaymentFlow, {
            resumeId: tmp.resumeEntry.resumeId,
            resumePayload: undefined,
          });
          if (res.status === "error") {
            console.error(`error runId=${runId} - detail=`, res);
            return;
          }
          workflowRuntime.runner.addTask(
            scheduleNextRun(runId, workflowRuntime, res)
          );
        }
      }
      break;
    default:
      break;
  }
}

async function runBackground(
  runId: string,
  workflowRuntime: WorkflowRuntime<IntervalPaymentFlow>,
  ins: IntervalPaymentFlow
) {
  let tmp = await workflowRuntime.run(ins, runId);
  if (tmp.status === "error") {
    console.error(`error runId=${tmp.runId} - detail=`, tmp);
    return;
  }
  workflowRuntime.runner.addTask(scheduleNextRun(runId, workflowRuntime, tmp));
  return runId;
}

async function runFrontend(
  runId: string,
  storage: MemStorage,
  workflowRuntime: WorkflowRuntime<IntervalPaymentFlow>
) {
  const usage = `
  /state:         print state as json
  /add [num]:     add a random usage. default num=1
  /save:          save storage to file
  /cancel:        cancel
  /exit:          exit
  `;
  console.log("🤟 Wellcome to IntervalPayment 🤟");
  console.log(usage);

  type cmdType = "/state" | "/add" | "/save" | "/exit" | "/cancel";

  for await (const line of console) {
    const tmp = line.trim().split(" ");
    const cmd = tmp[0] as cmdType;
    const args = tmp.slice(1);

    switch (cmd) {
      case "/state":
        {
          const ins = await workflowRuntime.createInstanceByRunId(
            runId,
            IntervalPaymentFlow
          );
          console.log({
            step: ins.currentStep,
            state: ins.currentState,
            runtimeUsage: workflowRuntime.runner.stats(),
          });
        }
        continue;
      case "/add": {
        {
          const ins = await workflowRuntime.createInstanceByRunId(
            runId,
            IntervalPaymentFlow
          );
          const sample = parseInt(args[0] ?? "1");

          for (let i = 0; i < sample; i++) {
            const item = `id_${Math.round(Math.random() * 100)}`;
            const amount = Math.round(Math.random() * 10);
            ins.addUsage({
              item,
              amount,
            });
            console.log(`add usage ${item} - ${amount}`);
          }
        }
        continue;
      }

      case "/save":
        {
          storage.syncToFile();
          console.log("saved");
        }
        continue;

      case "/cancel":
        {
          const ins = await workflowRuntime.createInstanceByRunId(
            runId,
            IntervalPaymentFlow
          );
          ins.cancel();
          console.log("canceled");
        }
        return;

      case "/exit":
        console.log("exit!");
        process.exit(0);

      default:
        console.log(usage);
    }
  }
}

class MemStorage implements IStorage<IntervalPaymentFlow> {
  private db = new Map<string, SnapshotType<IntervalPaymentFlow>>();

  async save(runId: string, snapshotData: SnapshotType<IntervalPaymentFlow>) {
    this.db.set(runId, snapshotData);
  }
  async load(runId: string) {
    const tmp = this.db.get(runId);
    if (!tmp) return null;
    return tmp;
  }

  async syncToFile() {
    const savePath = join(__dirname, "./tmp/intervalPayment_db.json");
    Bun.write(savePath, JSON.stringify([...this.db.entries()], null, " "));
  }
}
