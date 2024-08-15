import type { DurableState } from "./DurableState";

export type ContinueTrigger =
  | {
      type: "time";
      resumeId: string;
      resumeAt: number;
    }
  | {
      type: "event";
      resumeId: string;
    };
export type DurableStateIterator<T> = {
  canContinue: boolean;
  activeStep: T;
  resumeTrigger?: ContinueTrigger;
};
export type DurableStateReturn<StateShape> = {
  isEnd: boolean;
  finalState: StateShape;
};
export type ExeOpt = {
  ignoreCache?: boolean;
  maxRetry?: number;
};
export type TimerSystemEntry = {
  type: "timer";
  resumeId: string;
  isDone: boolean;
  resumeAfter: number;
  responsePayload?: any;
};
export type EventSystemEntry = {
  type: "event";
  resumeId: string;
  isDone: boolean;
  requestPayload?: any;
  responsePayload?: any;
};
export type DurableStateSystemEntry = TimerSystemEntry | EventSystemEntry;

export type StepIt<EStep, MoveToStep> = AsyncIterator<
  DurableStateIterator<EStep>,
  { nextStep: MoveToStep | null }
>;
export type StepHandler<EStep> = () => StepIt<EStep, EStep>;
export type AuditLogEntry<S, EStep> = {
  type:
    | "init"
    | "cache"
    | "transition"
    | "interrupt_begin"
    | "interrupt_end"
    | "action_error"
    | S;
  values: Record<string, any>;
  _at?: number;
  _step?: EStep;
};
export const SystemAuditLogType = [
  "init",
  "cache",
  "transition",
  "interrupt_begin",
  "interrupt_end",
];
export type DurableStateOpt = {
  withAuditLog: boolean;
  debug?: boolean;
};
export type Constructor<T> = new (...args: any[]) => T;
export type SnapshotType<T extends DurableState> = ReturnType<T["toJSON"]>;
