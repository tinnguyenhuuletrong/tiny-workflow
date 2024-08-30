import { DurableState, type StepIt } from "tiny-workflow-core/src";

enum EStep {
  step_begin = "step_begin",
  step_compute = "step_compute",
  step_end = "step_end",
}
type TStateShape = Partial<{
  startHit: boolean;
  computed: number;
  endHit: boolean;
}>;

// additional audit log message
type EAuditLog = "start_hit" | "end_hit" | "computed_hit";

class SampleState extends DurableState<EStep, TStateShape, EAuditLog> {
  constructor() {
    super(EStep.step_begin, {
      withAuditLog: true,
      debug: true,
    });

    // collect and resgister all step handler
    Object.values(EStep).map((step) =>
      this.stepHandler.set(step, this[step].bind(this))
    );
  }

  private async *step_begin(): StepIt<EStep, EStep.step_compute> {
    this.state.startHit = true;
    this.addLog({
      type: "start_hit",
      values: {},
    });
    return { nextStep: EStep.step_compute };
  }

  private async *step_compute(): StepIt<EStep, EStep.step_end> {
    // with cached action with cache key 'cache_computed'
    // it prevent the action evalulate when step resume
    const { it, value } = await this.withAction("cache_computed", async () => {
      console.log("\t ... do heavy computed ... ");
      return Math.PI;
    });
    if (it) yield it;

    this.addLog({
      type: "computed_hit",
      values: {
        actionValue: value,
      },
    });
    this.state.computed = value;

    return { nextStep: EStep.step_end };
  }
  private async *step_end(): StepIt<EStep, null> {
    this.state.endHit = true;
    this.addLog({
      type: "end_hit",
      values: {},
    });
    return { nextStep: null };
  }
}

async function main() {
  let ins = new SampleState();

  console.log("begin");
  // 1st run
  {
    const tmp = ins.exec();
    await tmp.next();
    console.log(
      " ",
      "currentStep=",
      ins.currentStep,
      ",currentState=",
      ins.currentState
    );

    // terminate run
    await tmp.return(null);
  }

  console.log("---------- SAVE/LOAD ---------");
  // save to json
  const savedWorkflowData = ins.toJSON();
  // load from json
  ins = SampleState.fromJSON(SampleState, savedWorkflowData);

  {
    for await (const it of ins.exec()) {
    }
    console.log(
      " ",
      "currentStep=",
      ins.currentStep,
      ",currentState=",
      ins.currentState
    );
  }

  console.log("end");
  console.log("finalWorkflowData:", ins.toJSON());
}
main();
