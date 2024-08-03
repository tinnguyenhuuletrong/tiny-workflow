import { test, expect, mock } from "bun:test";
import {
  DurableState,
  type DurableStateIterator,
  type DurableStateReturn,
  type StepHandler,
  type StepIt,
} from "../src";
import * as TestHelper from "./helper";

enum EStep {
  step_begin = "step_begin",
  step_play = "step_play",
  step_end = "step_end",
}
type TStateShape = {
  number: number;
  answer?: number[];
};
type EAuditLog = "log";

class GuessGameState extends DurableState<EStep, TStateShape, EAuditLog> {
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

  private async *step_begin(): StepIt<EStep, EStep.step_play> {
    return { nextStep: EStep.step_play };
  }

  private async *step_play(): StepIt<EStep, EStep.step_end> {
    let count = 0;
    let question = `number between 0-100`;
    let answer = [];
    const guessNum = this.state.number;
    while (true) {
      const tmp = this.waitForEvent(`event_ask_${count++}`, {
        question,
      });
      if (tmp.it) yield tmp.it;
      const last_answer = tmp.value();
      answer.push(last_answer);

      if (last_answer === guessNum) {
        break;
      } else if (last_answer < guessNum) {
        question = `${last_answer} lesser than the answer - number between 0-100`;
      } else {
        question = `${last_answer} gretter than the answer - number between 0-100`;
      }
    }
    this.state.answer = answer;

    return { nextStep: EStep.step_end };
  }

  private async *step_end(): StepIt<EStep, null> {
    return { nextStep: null };
  }
}

test("guess_game_one_run", async () => {
  const ins = DurableState.fromJSON<
    EStep,
    TStateShape,
    EAuditLog,
    GuessGameState
  >(GuessGameState, {
    step: EStep.step_begin,
    state: {
      number: 15,
    },
  });

  TestHelper.mockResumeIdSeq(ins);
  const it = ins.exec();
  let tmp;

  tmp = await testHelperRunUntilResume({ it });
  testHelperResolveEvent("round_1", ins, tmp, 5);
  tmp = await testHelperRunUntilResume({ it });
  testHelperResolveEvent("round_2", ins, tmp, 20);
  tmp = await testHelperRunUntilResume({ it });
  testHelperResolveEvent("round_3", ins, tmp, 10);
  tmp = await testHelperRunUntilResume({ it });
  testHelperResolveEvent("round_4", ins, tmp, 15);
  tmp = await testHelperRunUntilResume({ it });
  expect(tmp.done).toBe(true);

  // snapshot check
  let snapshot = TestHelper.removeProps(ins.toJSON(), [
    "_at",
    "resumeAt",
    "resumeAfter",
  ]);
  expect(snapshot).toMatchSnapshot("guess_game_one_run");
});

test("guess_game_save_load_run", async () => {
  let ins = DurableState.fromJSON<
    EStep,
    TStateShape,
    EAuditLog,
    GuessGameState
  >(GuessGameState, {
    step: EStep.step_begin,
    state: {
      number: 95,
    },
  });

  let mockedResumeId = 0;
  TestHelper.mockResumeIdSeq(
    ins,
    mockedResumeId,
    (val: number) => (mockedResumeId = val)
  );
  let it = ins.exec();
  let tmp;

  async function simulateSaveLoad() {
    if (it) {
      await it.return(null);
      console.log("destroy");
    }

    console.log("re-create");
    ins = TestHelper.simulateSaveAndLoad(GuessGameState, ins);
    TestHelper.mockResumeIdSeq(
      ins,
      mockedResumeId,
      (val: number) => (mockedResumeId = val)
    );
    it = ins.exec();
  }

  let ctx = { it, maxIter: Number.MAX_VALUE, actualRunIter: 0 };
  tmp = await testHelperRunUntilResume(ctx);
  testHelperResolveEvent("round_1", ins, tmp, 5);

  await simulateSaveLoad();

  ctx = { it, maxIter: Number.MAX_VALUE, actualRunIter: 0 };
  tmp = await testHelperRunUntilResume(ctx);
  testHelperResolveEvent("round_2", ins, tmp, 45);

  await simulateSaveLoad();

  ctx = { it, maxIter: Number.MAX_VALUE, actualRunIter: 0 };
  tmp = await testHelperRunUntilResume(ctx);
  testHelperResolveEvent("round_3", ins, tmp, 75);
  expect(ctx.actualRunIter).toMatchSnapshot("round_3_runinfo");

  await simulateSaveLoad();

  ctx = { it, maxIter: Number.MAX_VALUE, actualRunIter: 0 };
  tmp = await testHelperRunUntilResume(ctx);
  testHelperResolveEvent("round_4", ins, tmp, 99);
  expect(ctx.actualRunIter).toMatchSnapshot("round_4_runinfo");

  await simulateSaveLoad();

  ctx = { it, maxIter: Number.MAX_VALUE, actualRunIter: 0 };
  tmp = await testHelperRunUntilResume(ctx);
  testHelperResolveEvent("round_5", ins, tmp, 95);
  expect(ctx.actualRunIter).toMatchSnapshot("round_5_runinfo");

  ctx = { it, maxIter: Number.MAX_VALUE, actualRunIter: 0 };
  tmp = await testHelperRunUntilResume(ctx);
  expect(tmp.done).toBe(true);

  // // snapshot check
  let snapshot = TestHelper.removeProps(ins.toJSON(), [
    "_at",
    "resumeAt",
    "resumeAfter",
  ]);
  expect(snapshot).toMatchSnapshot("guess_game_save_load_run");
});

// --------------------------------------------------------------------
//  Helper
// --------------------------------------------------------------------

async function testHelperRunUntilResume(ctx: {
  it: AsyncGenerator<
    DurableStateIterator<EStep>,
    DurableStateReturn<TStateShape> | null,
    unknown
  >;
  maxIter?: number;
  actualRunIter?: number;
}) {
  if (!ctx.maxIter) ctx.maxIter = Number.MAX_VALUE;
  ctx.actualRunIter = 0;
  while (++ctx.actualRunIter < ctx.maxIter) {
    let tmp = await ctx.it.next();
    if (tmp.done) return tmp;
    if (!tmp.done && tmp.value.resumeTrigger) return tmp;
  }

  throw new Error("OoO. Can not finished within maxRounds");
}

function testHelperResolveEvent(
  hint: string,
  ins: GuessGameState,
  tmp: IteratorResult<
    DurableStateIterator<EStep>,
    DurableStateReturn<TStateShape> | null
  >,
  answer: number
) {
  if (tmp.done) {
    throw new Error("OoO");
  }
  if (!tmp.value.resumeTrigger) throw new Error("Missing resume trigger");
  const resumeId = tmp.value.resumeTrigger.resumeId;
  ins.resolveResume(resumeId, answer);
  expect(ins.getResume(resumeId)).toMatchSnapshot(hint);
}
