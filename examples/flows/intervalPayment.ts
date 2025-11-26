// visualize
// https://tinnguyenhuuletrong.github.io/tiny-flow-in-json/index.html?a=1&flow_v1=eJzFV21v2zYQ_u5fwRnD-qVSRFLUS4FuyLoWC7ABw4JhH4YioCXaZitRnkQl8Yr89x0l2dGrrSQFigBGTB7vnnt4dw_9ZYHQ8vsi2oqUL9-g5VbrXfHm4kJLpTblXqhtWSZC55na2Bupt-XKlpnZ3VvrJLuzpLI-FZm6qD1cJFyLQl-YLdusL18b_zI2rqXSIr_libXj-1QoXTu4xbWN4qkwVleNFfqjtkI_oJ9lkki1Qe_2USJq61uRFxLcwwFsO7ZTr26SbMWTaw0grg8ZfYEN2NL7XeU-W30Ska7MYXWXZzuRaymKoyWsloXI36dcJq3FlotC54CmcVHtrLM85drsiepYs_NwMFk2GR9y-70Y96zKdCXy4fGbqMr81JkWmliseZkYOM7QkxL3umH2Uj8NRQG8lhPIh5wIcAM7_xxXYI1HWt6KlhWsRVxF4kgZQh9HMzkcHYCKyjyHXP4q-EZMYON5zvdtaFKLtGs7VSCH6xsrk5azweqQmc72w-uuD55mpdKnvHTvpPGyGPv_YUBRLiIhd_qbsDMs3DmJ9eiJcgEdHV8-naGeo1gkUET5_ip-8o2d5nrRigZ8_1vKXMSt6m-NlH47VV8_LprjsCp2xfHkcSTVE9Rs3qzERqpHN4e5CVMv1-gDjNTHvUNGvSOp0DzmmncL4h6-YmoHnud4LAyo41PG3FZh7MGAEs8OScCIH3guC4JgjIEeaqmkljyR_wnL5CyG2K-OFuiXuuWLYRKaF5_P5RCLIsqh1htpuBa6QDXPSGeoniGIqxhFPInKSqyQmYioGdBIy7Q9nypSqEttShjGLqOu7zqU9UnBxHa9gABrmJrPGaRUV3nHpR6y8TesIpCUlt69mAiZNtnqrUAmrNFT6FqZxVUos1wREXViNgz4YWD7vkfdgGLm-l4wIAAYYlA4LiW-6_r-DAJAn6PPVtMEw4oo0GV1Wz8N849FJCvxn1PQxCE2oYxgz8MOI7Rf0CRkduDCH8Y09GkYzoZe1pIzgP4rL1AtRy_F7voB1BVzABxjoe_1oIeQGcCnLKAuc5k3B3pVdoVQ8U2jCiODBHbRn_Uu6s2sp5RgPU9YCCnALAlp6FEP91vHMgbEDcMgJB7GIZ6TxC4rtGWSsKqbGKbwLlNQ4KVAl2t4cCGT0UvvIghcm_q-z6APiIMdOkjEZzYmYeDjwMWYOZjOvY7mBTTMwiSHPkgFj2HzBH5-Br1p8Fu2kRFa51mKWgDeoIpNJNfozgwDEZuZaWhGmRIo4YVGqzaMhhqCXdeG9nEwA-XwSeCPjEfTfD4YedTMj7nMQOwhLe8B0LjMdcyn7xK0CwARz_Nglnsgc_3GsigJbMcjMMx9GH0AuQt40bxSl1GmFDyHgNZJyY5wS_GzMo_ENWR2NSnnoOIboR9tBuJ5ai6R6VjTItyP-KhMp0LRM2l1pa0fozP8T4Vxrd5vhkG0cR0ZD9gf2XB_sTx0RUWL3bwW3r5Fr-rIr07iY1a_e5-Hb3QQTMP7biY8z9rywup07QTAPjWjAMeFYwRm51eZnQi10Vv0I3JOgvUtlX09rN0CnIsR7v00yOBM3Y9T1EfYV7BTEUMrauRsOvSkIj6Pmic2AXagvrPd14LXGeMv7wGMrbXR0Kq0LKNrIj5zif1G_AbNgIkFD3GuLHHfvqznwz3H6rl2MKK3ePgfm3Uh-A

import { join } from "path";
import {
  DurableState,
  SimpleContext,
  WorkflowRuntime,
  type StepHandler,
  type StepIt,
  type WorkflowRuntimeOpt,
} from "tiny-workflow-core/src";

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

  actionAddUsage(usageItem: UsageItem) {
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

  actionCancel() {
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

class MemContext<T extends DurableState> extends SimpleContext<T> {
  async lock(runId: string) {
    await super.lock(runId);
    console.info("\x1b[34m", `[ 🔒 ] - ${runId}`, "\x1b[0m");
  }

  async unlock(runId: string) {
    await super.unlock(runId);
    console.info("\x1b[34m", `[ 🗝️ ] - ${runId}`, "\x1b[0m");
  }

  async shutdown() {
    await super.shutdown();
    await this.syncDBToFile();
  }

  async syncDBToFile() {
    const savePath = join(__dirname, "./tmp/intervalPayment_db.json");
    Bun.write(savePath, JSON.stringify([...this.db.entries()], null, " "));
    console.log("db synced: ", savePath);
  }
}

async function main() {
  const ctx = new MemContext<IntervalPaymentFlow>();
  let count = 0;
  const opt: WorkflowRuntimeOpt<IntervalPaymentFlow> = {
    ctx,
    genRunId: async () => `r_${count++}`,
    InstanceClass: IntervalPaymentFlow,
  };
  new WorkflowRuntime<IntervalPaymentFlow>(opt);
  await ctx.start();

  const ins = new IntervalPaymentFlow();
  ins.setParam({
    userEmail: "info@company.com",
    paymentIntervalMs: 10_000,
  });

  // Unique runId per user
  const runId = `run_${ins.currentState.userEmail}`;

  // Workflow run on server side
  await ctx.runner.addTask(runBackground(runId, ctx, ins), {
    runId,
  });

  // User terminal interface
  ctx.runner.addTask(runFrontend(runId, ctx), {
    runId,
  });

  await ctx.runner.idle();
  console.log("all done");

  await ctx.shutdown();
}
main();

async function runBackground(
  runId: string,
  ctx: MemContext<IntervalPaymentFlow>,
  ins: IntervalPaymentFlow
) {
  let tmp = await ctx.runtime.run(ins, runId);
  ctx.runner.addTask(ctx.scheduleNextRun(runId, tmp), {
    runId,
  });
  return runId;
}

async function runFrontend(
  runId: string,
  ctx: MemContext<IntervalPaymentFlow>
) {
  const usage = `
  /state:         print state as json
  /add [num]:     add a random usage. default num=1
  /save:          save storage to file
  /cancel:        cancel
  /exit:          exit
  `;
  console.log(`🤟 Wellcome ${"info@company.com"} to IntervalPayment 🤟`);
  console.log(usage);

  type cmdType = "/state" | "/add" | "/save" | "/exit" | "/cancel";

  for await (const line of console) {
    const tmp = line.trim().split(" ");
    const cmd = tmp[0] as cmdType;
    const args = tmp.slice(1);

    switch (cmd) {
      case "/state":
        {
          const ins = await ctx.runtime.createInstanceByRunId(
            runId,
            IntervalPaymentFlow
          );
          console.log({
            step: ins.currentStep,
            state: ins.currentState,
            runtimeUsage: ctx.runner.stats(),
          });
        }
        continue;
      case "/add": {
        {
          const sample = parseInt(args[0] ?? "1");

          ctx.withTransaction(runId, async () => {
            const ins = await ctx.runtime.createInstanceByRunId(
              runId,
              IntervalPaymentFlow
            );
            for (let i = 0; i < sample; i++) {
              const item = `id_${Math.round(Math.random() * 100)}`;
              const amount = Math.round(Math.random() * 10);
              ins.actionAddUsage({
                item,
                amount,
              });
              console.log(`add usage ${item} - ${amount}`);
            }
          });
        }
        continue;
      }

      case "/save":
        {
          ctx.syncDBToFile();
          console.log("saved");
        }
        continue;

      case "/cancel":
        {
          ctx.withTransaction(runId, async () => {
            const ins = await ctx.runtime.createInstanceByRunId(
              runId,
              IntervalPaymentFlow
            );
            ins.actionCancel();
            console.log("canceled");
          });
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
