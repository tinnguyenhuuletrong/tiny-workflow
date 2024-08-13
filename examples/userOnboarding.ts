import { DurableState, type StepHandler, type StepIt } from "../src";
import { join } from "path";
import {
  WorkflowRuntime,
  type IStorage,
  type SnapshotType,
  type WorkflowRuntimeOpt,
} from "../src/helper/WorkflowRuntime";

enum EStep {
  step_begin = "step_begin",
  step_wellcome_email = "step_wellcome_email",
  step_promotion_1 = "step_promotion_1",
  step_end = "step_end",
}
type TStateShape = {
  userEmail: string;
  waitBeforePromotionEmail: number;
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

  private async *step_begin(): StepIt<EStep, EStep.step_wellcome_email> {
    return { nextStep: EStep.step_wellcome_email };
  }

  private async *step_wellcome_email(): StepIt<EStep, EStep.step_promotion_1> {
    const res = await this.withAction("send_email", async () => {
      const deliveryId = Date.now().toString(32);
      this._debug(`Send wellcome email to ${this.state.userEmail}`);
      return deliveryId;
    });
    if (res.it) yield res.it;
    this.addLog({ type: "email_sent", values: { deliveryId: res.value } });
    this.state.waitBeforePromotionEmail = Math.round(Math.random() * 5000);

    return { nextStep: EStep.step_promotion_1 };
  }

  private async *step_promotion_1(): StepIt<EStep, EStep.step_end> {
    // waiting for 5sec -> send promotion email -> end
    const waitRes = this.waitForMs(
      "wait_before_promotion_email",
      this.state.waitBeforePromotionEmail
    );
    if (waitRes.it) yield waitRes.it;

    const res = await this.withAction("send_email", async () => {
      const deliveryId = Date.now().toString(32);
      this._debug(`Send promotion email to ${this.state.userEmail}`);
      return deliveryId;
    });
    if (res.it) yield res.it;
    this.addLog({ type: "email_sent", values: { deliveryId: res.value } });

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

  const job = async (email: string) => {
    let tmp = await workflowRuntime.run(createWork(email));
    if (tmp.status === "need_resume") {
      if (tmp.resumeEntry.type === "timer") {
        await Bun.sleep(tmp.resumeEntry.resumeAfter - Date.now());
        await workflowRuntime.resume(tmp.runId, UserOnboardingFlow, {
          resumeId: tmp.resumeEntry.resumeId,
          resumePayload: undefined,
        });
      }
    }
  };

  const jobs = [];
  for (let i = 0; i < 10; i++) {
    jobs.push(job(`email_${i}@abc.com`));
  }
  await Promise.allSettled(jobs);

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
    const savePath = join(__dirname, "./userOnboarding_db.json");
    Bun.write(savePath, JSON.stringify([...this.db.entries()], null, " "));
  }
}
