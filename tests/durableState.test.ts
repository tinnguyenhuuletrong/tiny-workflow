import { test, expect, mock } from "bun:test";
import { DurableState, type StepHandler, type StepIt } from "../src";
import * as TestHelper from "./helper";

test("simple_durable_state", async () => {
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
  type EAuditLog = "start_hit" | "end_hit" | "computed_hit";

  class SampleState extends DurableState<EStep, TStateShape, EAuditLog> {
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
      });
      this._collectAndRegisterSteps();
    }

    private async *step_begin(): StepIt<EStep> {
      this.state.startHit = true;
      this.addLog({
        type: "start_hit",
        values: {},
      });
      return { nextStep: EStep.step_compute };
    }

    private async *step_compute(): StepIt<EStep> {
      // with cached action
      const { it, value } = await this.withAction(
        "cache_computed",
        async () => {
          return Math.PI;
        }
      );
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
    private async *step_end(): StepIt<EStep> {
      this.state.endHit = true;
      this.addLog({
        type: "end_hit",
        values: {},
      });
      return { nextStep: null };
    }
  }

  // Test
  const ins = DurableState.fromJSON<EStep, TStateShape, EAuditLog, SampleState>(
    SampleState,
    {
      step: EStep.step_begin,
      state: {
        computed: 0,
      },
    }
  );
  const it = ins.exec();
  for await (const v of it) {
  }
  expect(ins.currentState).toMatchSnapshot("final_state");
  expect(TestHelper.removeProps(ins.auditLogs, ["_at"])).toMatchSnapshot(
    "audit_logs"
  );
});
