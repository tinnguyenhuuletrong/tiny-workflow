import { test, expect, mock } from "bun:test";
import {
  DurableState,
  type ContinueTrigger,
  type DurableStateIterator,
  type StepHandler,
  type StepIt,
} from "../src";
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

    private async *step_begin(): StepIt<EStep, EStep.step_compute> {
      this.state.startHit = true;
      this.addLog({
        type: "start_hit",
        values: {},
      });
      return { nextStep: EStep.step_compute };
    }

    private async *step_compute(): StepIt<EStep, EStep.step_end> {
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
    private async *step_end(): StepIt<EStep, null> {
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

test("step_durable_state", async () => {
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

    private async *step_begin(): StepIt<EStep, EStep.step_compute> {
      this.state.startHit = true;
      this.addLog({
        type: "start_hit",
        values: {},
      });
      return { nextStep: EStep.step_compute };
    }

    private async *step_compute(): StepIt<EStep, EStep.step_end> {
      let sum = 0;
      for (let i = 0; i < 3; i++) {
        // with cached action
        const { it, value } = await this.withAction(
          `cache_computed_${i}`,
          async () => {
            return Math.PI;
          }
        );
        if (it) yield it;
        sum += value;
      }

      this.addLog({
        type: "computed_hit",
        values: {
          actionValue: sum,
        },
      });
      this.state.computed = sum;

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

  // 1st run
  const it = ins.exec();
  let res = await it.next();
  expect(res.done).toBe(false);
  let snapshot = TestHelper.removeProps(ins.toJSON(), ["_at"]);
  expect(snapshot).toMatchSnapshot("run_part_1");

  // 2nd run
  res = await it.next();
  res = await it.next();
  res = await it.next();
  expect(res.done).toBe(true);
  snapshot = TestHelper.removeProps(ins.toJSON(), ["_at"]);
  expect(snapshot).toMatchSnapshot("run_part_2");
});

test("wait_ms_durable_state", async () => {
  enum EStep {
    step_begin = "step_begin",
    step_end = "step_end",
  }
  type TStateShape = Partial<{
    startHit: boolean;
    endHit: boolean;
  }>;
  type EAuditLog = "log";

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

    private async *step_begin(): StepIt<EStep, EStep.step_end> {
      this.state.startHit = true;
      const { it } = this.waitForMs("wait_for_1sec", 1000);
      if (it) yield it;
      this.addLog({
        type: "log",
        values: {
          msg: "after 1 sec",
        },
      });

      return { nextStep: EStep.step_end };
    }

    private async *step_end(): StepIt<EStep, null> {
      this.state.endHit = true;

      return { nextStep: null };
    }
  }

  // Test
  const ins = DurableState.fromJSON<EStep, TStateShape, EAuditLog, SampleState>(
    SampleState,
    {
      step: EStep.step_begin,
      state: {},
    }
  );

  (ins as any).genResumeId = (key: string) => `${key}-1`;
  const it = ins.exec();
  let res = await it.next();

  // not finish - have a continue trigger
  expect(res.done).toBe(false);
  const resume = (res.value as DurableStateIterator<EStep>)
    .resumeTrigger as ContinueTrigger;
  expect(resume).not.toBeNull();
  expect(TestHelper.removeProps(resume, ["resumeAt"])).toMatchSnapshot();

  // when time on
  ins.resolveResume(resume.resumeId, {});

  res = await it.next();
  expect(res.done).toBe(true);

  // snapshot check
  let snapshot = TestHelper.removeProps(ins.toJSON(), [
    "_at",
    "resumeAt",
    "resumeAfter",
  ]);
  expect(snapshot).toMatchSnapshot("durable_state_with_waiting");
});

test("wait_event_durable_state", async () => {
  enum EStep {
    step_begin = "step_begin",
    step_end = "step_end",
  }
  type TStateShape = Partial<{
    startHit: boolean;
    eventResponse: any;
    endHit: boolean;
  }>;
  type EAuditLog = "log";

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

    private async *step_begin(): StepIt<EStep, EStep.step_end> {
      this.state.startHit = true;
      const { it, value } = this.waitForEvent<number>("event_01", {
        question: "hey human. 1 + 1 = ?",
      });
      if (it) yield it;
      const answer = value();
      this.addLog({
        type: "log",
        values: {
          msg: "event_01 resolved with value",
          answer: answer,
        },
      });
      this.state.eventResponse = answer;

      return { nextStep: EStep.step_end };
    }

    private async *step_end(): StepIt<EStep, null> {
      this.state.endHit = true;

      return { nextStep: null };
    }
  }

  // Test
  const ins = DurableState.fromJSON<EStep, TStateShape, EAuditLog, SampleState>(
    SampleState,
    {
      step: EStep.step_begin,
      state: {},
    }
  );

  (ins as any).genResumeId = (key: string) => `${key}-1`;
  const it = ins.exec();
  let res = await it.next();

  // not finish - have a continue trigger
  expect(res.done).toBe(false);
  const resume = (res.value as DurableStateIterator<EStep>)
    .resumeTrigger as ContinueTrigger;
  expect(resume).not.toBeNull();
  expect(TestHelper.removeProps(resume, ["resumeAt"])).toMatchSnapshot();

  // when time on
  ins.resolveResume(resume.resumeId, 2);

  res = await it.next();
  expect(res.done).toBe(true);

  // snapshot check
  let snapshot = TestHelper.removeProps(ins.toJSON(), [
    "_at",
    "resumeAt",
    "resumeAfter",
  ]);
  expect(snapshot).toMatchSnapshot("durable_state_with_event");
});
