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
  step_process = "step_process",
  step_end = "step_end",
}
type TStateShape = {
  userEmail: string;
  waitBeforePromotionEmail: number;
  waitBeforeEnd: number;
};
type EAuditLog = "email_sent" | "email_updated";

class UserOnboardingFlow extends DurableState<EStep, TStateShape, EAuditLog> {
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
      withAuditLog: true,
      debug: true,
    });
    this._collectAndRegisterSteps();
  }

  setEmail(email: string) {
    this.addLog({
      type: "email_updated",
      values: {
        oldValue: this.state.userEmail,
        newValue: email,
      },
    });
    this.state.userEmail = email;
  }

  private async *step_begin(): StepIt<EStep, EStep.step_process> {
    return { nextStep: EStep.step_process };
  }

  private async *step_process(): StepIt<EStep, EStep.step_end> {
    // Send wellcome email
    {
      const res = await this.withAction("send_email_wellcome", async () => {
        const deliveryId = performance.now().toString(32);

        this._debug(
          `Send wellcome email to ${this.state.userEmail}, deliveryId=${deliveryId}`
        );
        this.addLog({ type: "email_sent", values: { deliveryId } });
        this.state.waitBeforePromotionEmail = Math.round(Math.random() * 5000);

        return deliveryId;
      });
      if (res.it) yield res.it;
    }

    {
      // waiting for x sec -> send promotion email
      const waitRes = this.waitForMs(
        "wait_before_promotion_email",
        this.state.waitBeforePromotionEmail
      );
      if (waitRes.it) {
        this._debug(`Wait for ${this.state.waitBeforePromotionEmail}ms`);
        yield waitRes.it;
      }
    }

    {
      const res = await this.withAction("send_email_promotion", async () => {
        const deliveryId = performance.now().toString(32);

        this._debug(
          `Send promotion email to ${this.state.userEmail}, deliveryId=${deliveryId}`
        );
        this.addLog({ type: "email_sent", values: { deliveryId } });
        this.state.waitBeforeEnd = Math.round(Math.random() * 2000);

        return deliveryId;
      });
      if (res.it) yield res.it;
    }

    {
      // waiting for x sec -> end
      const waitRes = this.waitForMs(
        "wait_before_end",
        this.state.waitBeforeEnd
      );
      if (waitRes.it) {
        this._debug(`Wait for ${this.state.waitBeforeEnd}ms`);
        yield waitRes.it;
      }
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
  const opt: WorkflowRuntimeOpt<UserOnboardingFlow> = {
    genRunId: async () => `r_${count++}`,
    storage,
  };
  const workflowRuntime = new WorkflowRuntime<UserOnboardingFlow>(opt);
  workflowRuntime.runner.reset();

  const scheduleNextRun = async (tmp: WorkflowRunResult) => {
    switch (tmp.status) {
      case "need_resume":
        {
          if (tmp.resumeEntry.type === "timer") {
            await Bun.sleep(tmp.resumeEntry.resumeAfter - Date.now());
            const res = await workflowRuntime.resume(
              tmp.runId,
              UserOnboardingFlow,
              {
                resumeId: tmp.resumeEntry.resumeId,
                resumePayload: undefined,
              }
            );
            workflowRuntime.runner.addTask(scheduleNextRun(res));
          }
        }
        break;
      default:
        break;
    }
  };

  const job = async (email: string) => {
    let tmp = await workflowRuntime.run(createWork(email));
    if (tmp.status === "error") {
      console.error(`error runId=${tmp.runId} - detail=`, tmp);
      return;
    }
    workflowRuntime.runner.addTask(scheduleNextRun(tmp));
  };

  for (let i = 0; i < 10; i++) {
    workflowRuntime.runner.addTask(job(`email_${i}@abc.com`));
  }

  await workflowRuntime.runner.idle();
  console.log("all done!");
  await storage.syncToFile();
}

main();

function createWork(email: string) {
  const ins = new UserOnboardingFlow();
  ins.setEmail(email);
  return ins;
}

class MemStorage implements IStorage<UserOnboardingFlow> {
  private db = new Map<string, SnapshotType<UserOnboardingFlow>>();

  async save(runId: string, snapshotData: SnapshotType<UserOnboardingFlow>) {
    this.db.set(runId, snapshotData);
  }
  async load(runId: string) {
    const tmp = this.db.get(runId);
    if (!tmp) return null;
    return tmp;
  }

  async syncToFile() {
    const savePath = join(__dirname, "./tmp/userOnboarding_db.json");
    Bun.write(savePath, JSON.stringify([...this.db.entries()], null, " "));
  }
}
