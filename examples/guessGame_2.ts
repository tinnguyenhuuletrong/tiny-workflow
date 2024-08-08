import {
  DurableState,
  type EventSystemEntry,
  type StepHandler,
  type StepIt,
} from "../src";
import { join } from "path";

enum EStep {
  step_begin = "step_begin",
  step_ask = "step_ask",
  step_check = "step_check",
  step_end = "step_end",
}
type TStateShape = {
  number: number;
  hint: string;
  answer?: number[];
};
type EAuditLog = "log";

class GuessGame2State extends DurableState<EStep, TStateShape, EAuditLog> {
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

  private async *step_begin(): StepIt<EStep, EStep.step_ask> {
    const res = await this.withAction("generate_num", async () => {
      return Math.round(Math.random() * 100);
    });
    if (res.it) yield res.it;
    this.state.number = res.value;
    this.state.hint = `number between 0-100. Empty for simulate save/load`;
    return { nextStep: EStep.step_ask };
  }

  private async *step_ask(): StepIt<EStep, EStep.step_check> {
    let answer = this.state.answer ?? [];
    const hint = this.state.hint;
    const tmp = this.waitForEvent(`event_ask`, {
      question: hint,
    });
    if (tmp.it) yield tmp.it;
    const last_answer = tmp.value();
    answer.push(last_answer);
    this.state.answer = answer;

    return { nextStep: EStep.step_check };
  }

  private async *step_check(): StepIt<EStep, EStep.step_end | EStep.step_ask> {
    const guessNum = this.state.number;
    const last_answer = this.state.answer?.at(-1);
    if (!last_answer) throw new Error("OoO last_answer should not null");

    if (last_answer === guessNum) {
      return { nextStep: EStep.step_end };
    } else if (last_answer < guessNum) {
      this.state.hint = `value ${last_answer} is < than the answer - number between 0-100`;
    } else {
      this.state.hint = `value ${last_answer} is > than the answer - number between 0-100`;
    }
    return { nextStep: EStep.step_ask };
  }

  private async *step_end(): StepIt<EStep, null> {
    const tmp = this.waitForEvent(`event_congratulation`, {
      question: `You need ${this.state.answer?.length} rounds to guess the number ${this.state.number}. Congratulation!`,
    });
    if (tmp.it) yield tmp.it;

    return { nextStep: null };
  }
}

type SnapshotType = ReturnType<GuessGame2State["toJSON"]>;

async function main() {
  let state: SnapshotType | null = null;
  while (true) {
    state = await run(state);
    if (!state) return;
  }
}
main();

async function run(state?: SnapshotType | null): Promise<SnapshotType | null> {
  console.log("🤟 Wellcome to GuessGame_2 🤟");

  let ins!: GuessGame2State;
  if (!state) ins = new GuessGame2State();
  else {
    console.log("----- resumed -----");
    ins = GuessGame2State.fromJSON(GuessGame2State, state, {
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
    join(__dirname, "./state_2.json"),
    JSON.stringify(ins.toJSON(), null, " ")
  );
  return null;
}
