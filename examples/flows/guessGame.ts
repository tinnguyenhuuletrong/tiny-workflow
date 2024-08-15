import { join } from "path";
import {
  DurableState,
  type EventSystemEntry,
  type StepHandler,
  type StepIt,
} from "tiny-workflow-core/src";

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
      withAuditLog: false,
      debug: true,
    });
    this._collectAndRegisterSteps();
  }

  private async *step_begin(): StepIt<EStep, EStep.step_play> {
    const res = await this.withAction("generate_num", async () => {
      return Math.round(Math.random() * 100);
    });
    if (res.it) yield res.it;
    this.state.number = res.value;
    return { nextStep: EStep.step_play };
  }

  private async *step_play(): StepIt<EStep, EStep.step_end> {
    let count = 0;
    let question = `number between 0-100. Empty for simulate save/load`;
    let answer = [];
    const guessNum = this.state.number;
    while (true) {
      const tmp = this.waitForEvent(`event_ask_${count++}`, {
        question: `${question}`,
      });
      if (tmp.it) yield tmp.it;
      const last_answer = tmp.value();
      answer.push(last_answer);

      if (last_answer === guessNum) {
        break;
      } else if (last_answer < guessNum) {
        question = `value ${last_answer} is < than the answer - number between 0-100`;
      } else {
        question = `value ${last_answer} is > than the answer - number between 0-100`;
      }
    }
    this.state.answer = answer;

    return { nextStep: EStep.step_end };
  }

  private async *step_end(): StepIt<EStep, null> {
    const tmp = this.waitForEvent(`event_congratulation`, {
      question: `You need ${this.state.answer?.length} rounds to guess the number ${this.state.number}. Congratulation!`,
    });
    if (tmp.it) yield tmp.it;

    return { nextStep: null };
  }
}

async function main() {
  let state = null;
  while (true) {
    state = await run(state);
    if (!state) return;
  }
}
main();

async function run(state?: any): Promise<Object | null> {
  let ins!: GuessGameState;
  if (!state) ins = new GuessGameState();
  else {
    console.log("----- resumed -----");
    ins = GuessGameState.fromJSON(GuessGameState, state, {
      withAuditLog: false,
      debug: true,
    });
  }
  for await (const it of ins.exec()) {
    if (it.resumeTrigger) {
      const resumeId = it.resumeTrigger.resumeId;
      const resumeEntry = ins.getResume(resumeId) as EventSystemEntry;
      const ans = prompt(`${resumeEntry.requestPayload.question}:`, "");
      // ignore on end
      if (it.activeStep === EStep.step_end) {
        break;
      }

      if (ans) {
        ins.resolveResume(resumeId, parseInt(ans as string));
      } else {
        console.log("----- saved -----");
        return ins.toJSON();
      }
    }
  }

  Bun.write(
    join(__dirname, "./tmp/state.json"),
    JSON.stringify(ins.toJSON(), null, " ")
  );
  return null;
}
