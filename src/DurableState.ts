import type {
  AuditLogEntry,
  DurableStateSystemEntry,
  StepHandler,
  DurableStateOpt,
  DurableStateIterator,
  DurableStateReturn,
  ExeOpt,
  Constructor,
} from "./type";

const SYSTEM_SEQ_KEY = "_seq";

export class DurableState<
  EStep = any,
  StateShape = Record<string, any>,
  ExtAuditLogType = "others"
> {
  private step!: EStep;
  private cache: Record<string, any> = {};
  private system: Record<string, DurableStateSystemEntry> = {};
  private logs: AuditLogEntry<ExtAuditLogType, EStep>[] = [];
  protected state: StateShape = {} as StateShape;
  protected stepHandler = new Map<EStep, StepHandler<EStep>>();

  constructor(defaultStep?: EStep, private opt?: DurableStateOpt) {
    if (defaultStep) {
      this.step = defaultStep;
      this.addLog({
        type: "init",
        values: {
          defaultStep,
        },
      });
    }
  }

  /** Current step */
  get currentStep() {
    return this.step;
  }

  /** Clone of audit logs */
  get auditLogs() {
    return [...this.logs];
  }

  /** Clone of current state */
  get currentState() {
    return { ...this.state };
  }

  /** Sequence number. It increa everytime state change */
  get stepSeq() {
    return this.cache[SYSTEM_SEQ_KEY] ?? 0;
  }

  /** Prefix for system and cache key - prevent conflict in case a step visit multiple times */
  protected get stepKeyPrefix() {
    return `${this.stepSeq}:${this.step}`;
  }

  getResume(resumeId: string) {
    const tmp = Object.values(this.system).find(
      (itm) => itm.resumeId === resumeId
    );
    if (!tmp) return null;
    return {
      ...tmp,
    } as DurableStateSystemEntry;
  }

  resolveResume(resumeId: string, payload?: any) {
    const tmp = Object.values(this.system).find(
      (itm) => itm.resumeId === resumeId
    );

    if (!tmp) throw new Error("resumeId not exists. Something wrong ?");
    tmp.responsePayload = payload;
    tmp.isDone = true;
    this.addLog({
      type: "interrupt_end",
      values: {
        resumeId,
      },
    });
  }

  async *exec(): AsyncGenerator<
    DurableStateIterator<EStep>,
    DurableStateReturn<StateShape> | null
  > {
    // Todo: showhow allow custom from outside
    const runId = Date.now().toString(32);

    try {
      let hasNext = true;
      const step = this.step;
      const handler = this.stepHandler.get(step);
      if (!handler) throw new Error(`missing stepHandler for ${step}`);
      let res = handler();
      this._debug(`start runId=${runId}`);
      while (hasNext) {
        const it = await res.next();
        if (it.done) {
          if (it.value.nextStep === null) break;

          // move to next step
          const prevStep = this.step;
          const step = it.value.nextStep;
          if (prevStep != step) {
            this._moveToStep(step);
            this.addLog({
              type: "transition",
              values: {
                from: prevStep,
                to: it.value.nextStep,
                stepSeq: this.stepSeq,
              },
            });
          }

          const handler = this.stepHandler.get(step);
          if (!handler) throw new Error(`missing stepHandler for ${step}`);
          res = handler();
        } else {
          yield it.value as DurableStateIterator<EStep>;
        }
      }

      return { isEnd: true, finalState: this.state };
    } catch (error) {
      throw error;
    } finally {
      this._debug(`end runId=${runId}`);
    }
  }

  private _moveToStep(step: EStep) {
    const numStep = this.stepSeq;
    this.cache[SYSTEM_SEQ_KEY] = numStep + 1;
    this.step = step;
  }

  protected async withAction<TRes = any>(
    key: string,
    action: () => Promise<any>,
    opt?: ExeOpt
  ): Promise<{
    it?: DurableStateIterator<EStep>;
    value: TRes | undefined;
  }> {
    const shouldUseCache = opt ? !opt.ignoreCache : true;
    const maxRetry = opt?.maxRetry ? opt.maxRetry : 0;
    const cacheKey = `${this.stepKeyPrefix}:${key}`;
    if (shouldUseCache) {
      const tmp = this.cache[cacheKey];
      if (tmp) {
        return {
          it: undefined,
          value: tmp,
        };
      }
    }

    let newVal;
    try {
      newVal = await action();
    } catch (error: any) {
      const res = this.canRetry(key, maxRetry);
      if (res.counter > 0) {
        this.addLog({
          type: "action_error",
          values: {
            key,
            errorMessage: error?.message,
            counter: res.counter,
            maxRetry,
          },
        });
        return {
          it: this.waitForMs(res.retryKey, 1000).it,
          value: undefined,
        };
      }

      throw error;
    }

    this.cache[cacheKey] = newVal;
    this.addLog({
      type: "cache",
      values: {
        key: cacheKey,
      },
    });
    return {
      it: { canContinue: true, activeStep: this.step },
      value: newVal,
    };
  }

  protected waitForMs(
    key: string,
    timeoutMs: number
  ): {
    it?: DurableStateIterator<EStep>;
    value: () => number | undefined;
  } {
    const cacheKey = `${this.stepKeyPrefix}:timer:${key}`;

    const tmp = this.system[cacheKey];
    if (tmp) {
      if (tmp?.type !== "timer") throw new Error("invalid system record");
      if (tmp.isDone) {
        return {
          it: undefined,
          value: () => tmp.resumeAfter,
        };
      }
    }

    const resumeAt = this.nowMs() + timeoutMs;
    const resumeId = this.genResumeId(key);
    this.system[cacheKey] = {
      type: "timer",
      isDone: false,
      resumeId,
      resumeAfter: resumeAt,
    };
    this.addLog({
      type: "interrupt_begin",
      values: {
        type: "time",
        resumeId,
      },
    });
    return {
      it: {
        canContinue: false,
        activeStep: this.step,
        resumeTrigger: {
          resumeId,
          type: "time",
          resumeAt,
        },
      },
      value: () => tmp.resumeAfter,
    };
  }

  protected waitForEvent<TRes = any>(
    key: string,
    requestPayload: any
  ): {
    it?: DurableStateIterator<EStep>;
    value: () => TRes | undefined;
  } {
    const cacheKey = `${this.stepKeyPrefix}:event:${key}`;

    const tmp = this.system[cacheKey];
    if (tmp) {
      if (tmp.type !== "event") throw new Error("invalid system record");
      if (tmp.isDone) {
        return {
          it: undefined,
          value: () => this.system[cacheKey]?.responsePayload,
        };
      }
    }

    const resumeId = this.genResumeId(key);
    this.system[cacheKey] = {
      type: "event",
      isDone: false,
      resumeId,
      requestPayload,
      responsePayload: null,
    };
    this.addLog({
      type: "interrupt_begin",
      values: {
        type: "event",
        resumeId,
      },
    });
    return {
      it: {
        canContinue: false,
        activeStep: this.step,
        resumeTrigger: {
          type: "event",
          resumeId,
        },
      },
      value: () => this.system[cacheKey]?.responsePayload,
    };
  }

  protected genResumeId(key: string) {
    return `${key}-${this.nowMs().toString(32)}`;
  }

  protected nowMs() {
    return Date.now();
  }

  protected addLog(itm: AuditLogEntry<ExtAuditLogType, EStep>) {
    if (this.opt?.withAuditLog) {
      itm._at = this.nowMs();
      itm._step = this.step;
      this.logs.push(itm);
    }
  }

  protected _debug(...args: any[]) {
    if (this.opt?.debug) console.log("[DurableState] ", ...args);
  }

  private canRetry(
    key: string,
    maxRetry: number
  ): {
    counter: number;
    retryKey: string;
  } {
    const cacheKey = `${this.stepKeyPrefix}:__retry__:${key}`;
    const val = this.cache[cacheKey] ?? maxRetry;
    this.cache[cacheKey] = val - 1;
    return {
      counter: this.cache[cacheKey],
      retryKey: cacheKey,
    };
  }

  toJSON() {
    const { step, state, cache, system, logs } = this;
    return { step, state, cache, system, logs };
  }

  static fromJSON<
    EStep,
    ShapeState,
    ExtAuditLogType,
    T extends DurableState<EStep, ShapeState, ExtAuditLogType>
  >(
    type: Constructor<T>,
    data: {
      step: EStep;
      state: ShapeState;
      cache?: Record<string, any>;
      system?: Record<string, DurableStateSystemEntry>;
      logs?: AuditLogEntry<ExtAuditLogType, EStep>[];
    },
    opt?: DurableStateOpt
  ): T {
    const ins = new type(undefined, opt);
    ins.step = data.step;
    ins.state = data.state;
    ins.cache = data.cache ?? {};
    ins.system = data.system ?? {};
    ins.logs = data.logs ?? [];
    return ins;
  }
}
