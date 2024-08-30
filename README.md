# tiny-workflow

## Overview

**tiny-workflow** is heavily inspired by [Temporal](https://temporal.io/), but it aims to provide a simpler, more portable solution that only requires basic components to run.

### Key Features

- **Code-Driven**: Workflows can be executed, paused, and resumed multiple times.
  - Logic is defined in a single TypeScript class with multiple steps.
  - **State-Centric**: The state can be modified by step logic or external actions (see [doc/example_intervalPayment.md](doc/example_intervalPayment.md)).
- **Data Persistence**: Workflow data is stored as JSON, which can be saved in any database.
- **TypeScript-Based**: Written entirely in TypeScript.

### Workflow Structure

A workflow consists of steps, state data, and logs:

- **Steps**: Workflows can be broken down into multiple steps.
  - Steps can be revisited.
  - Steps may contain multiple actions.
    - Results are cached to prevent re-execution on resume.
    - Automatically retries on failure.
- **Lifecycle**: A workflow progresses through different states:
  - **Create** -> **Run** (using a generator that yields) -> **Pause** when awaiting a specific condition.
    - **Events**: Waiting for user input, triggers, etc.
    - **Timers**: Resume after a specified duration.

### Basic Helper

- **Runtime**: Manages the creation and execution of multiple workflows (see in /examples/flows ).

## Basic Example

Here's a simple computed workflow [examples/simple.ts](examples/flows/simple.ts)

```typescript
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

// Additional audit log messages
type EAuditLog = "start_hit" | "end_hit" | "computed_hit";

class SampleState extends DurableState<EStep, TStateShape, EAuditLog> {
  constructor() {
    super(EStep.step_begin, {
      withAuditLog: true,
    });

    // Register all step handlers
    Object.values(EStep).forEach((step) =>
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
    // Cached action to prevent re-evaluation when the step resumes
    const { it, value } = await this.withAction("cache_computed", async () => {
      return Math.PI;
    });
    if (it) yield it;

    this.addLog({
      type: "computed_hit",
      values: { actionValue: value },
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
```

To run this workflow:

```ts
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

// resume and run till end
{
  const tmp = ins.exec();
  for await (const it of ins.exec()) {}
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
```

Console output:

```sh
>bun examples/flows/simple.ts
begin
[DurableState][1i6h2retd][step_begin] start
	 ... do heavy computed ...
  currentStep= step_compute ,currentState= {
  startHit: true,
}
[DurableState][1i6h2retd][step_compute] end
---------- SAVE/LOAD ---------
[DurableState][1i6h2retj][step_compute] start
[DurableState][1i6h2retj][step_end] end
  currentStep= step_end ,currentState= {
  startHit: true,
  computed: 3.141592653589793,
  endHit: true,
}
end
finalWorkflowData: {
  step: "step_end",
  state: {
    startHit: true,
    computed: 3.141592653589793,
    endHit: true,
  },
  cache: {
    _seq: 2,
    "1:step_compute:cache_computed": 3.141592653589793,
  },
  system: {},
  logs: [
    #  omit
  ],
}
```

## More examples:

- [Guess My Number Game](examples/flows/guessGame_2.ts) -  Play the "Guess My Number" game in the terminal.

```sh
> bun run examples/flows/guessGame_2.ts

🤟 Wellcome to GuessGame_2 🤟
[DurableState][1i6h4ac2q][step_begin] start
number between 0-100. Empty for simulate save/load: [] 50
value 50 is < than the answer - number between 0-100: []
----- saved -----
[DurableState][1i6h4ac2q][step_ask] end
🤟 Wellcome to GuessGame_2 🤟
----- resumed -----
[DurableState][1i6h4afb2][step_ask] start
value 50 is < than the answer - number between 0-100: [] 75
value 75 is > than the answer - number between 0-100: []
----- saved -----
[DurableState][1i6h4afb2][step_ask] end
🤟 Wellcome to GuessGame_2 🤟
----- resumed -----
[DurableState][1i6h4ap6b][step_ask] start
value 75 is > than the answer - number between 0-100: [] 60
value 60 is < than the answer - number between 0-100: [] 80
value 80 is > than the answer - number between 0-100: [] 73
You need 5 rounds to guess the number 73. Congratulation!: []
[DurableState][1i6h4ap6b][step_end] end
```

- [User Onboarding email](examples/flows/userOnboarding.ts) -  Manage multiple asynchronous workflows (one workflow per user).

```sh
> bun run examples/flows/userOnboarding.ts
 [ 🔒 ] - r_0
 [ 🔒 ] - r_1
[DurableState][r_0][step_begin] start
[DurableState][r_1][step_begin] start
[DurableState][r_0][step_process] Send wellcome email to email_0@abc.com, deliveryId=m.uca8etk1cs
[DurableState][r_1][step_process] Send wellcome email to email_1@abc.com, deliveryId=n.38ddch8ric
[DurableState][r_0][step_process] Wait for 692ms
[DurableState][r_1][step_process] Wait for 4244ms
[DurableState][r_0][step_process] end
[DurableState][r_1][step_process] end
 [ 🗝️ ] - r_0
 [ 🗝️ ] - r_1
 [ 🔒 ] - r_0
[DurableState][r_0][step_process] start
[DurableState][r_0][step_process] Send promotion email to email_0@abc.com, deliveryId=mh.buious91k
[DurableState][r_0][step_process] Wait for 1434ms
[DurableState][r_0][step_process] end
 [ 🗝️ ] - r_0
 [ 🔒 ] - r_0
[DurableState][r_0][step_process] start
[DurableState][r_0][step_end] end
 [ 🗝️ ] - r_0
 [ 🔒 ] - r_1
[DurableState][r_1][step_process] start
[DurableState][r_1][step_process] Send promotion email to email_1@abc.com, deliveryId=45f.62q3im0g
[DurableState][r_1][step_process] Wait for 690ms
[DurableState][r_1][step_process] end
 [ 🗝️ ] - r_1
 [ 🔒 ] - r_1
[DurableState][r_1][step_process] start
[DurableState][r_1][step_end] end
 [ 🗝️ ] - r_1
all done!
```

## Development

To install dependencies:

```bash
bun install
```

To test:

```bash
bun test
```

Examples:

```bash
bun run examples/guessGame.ts
```

To build node compatible:

```bash
bun run build:npm
```

## TODO

- web component to display worflow
  - steps transition, state base on auditLog

## Research Topics

- TS AST step transition parse

  - check [bun ast discuss](https://github.com/oven-sh/bun/discussions/3763)
  - play at `r_d/test_type_scan.ts`
