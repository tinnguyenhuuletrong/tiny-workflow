import { DurableState, type Constructor } from "../src";

export function removeProps(obj: any, keys: string[]) {
  if (Array.isArray(obj)) {
    obj.forEach(function (item) {
      removeProps(item, keys);
    });
    return obj;
  } else if (typeof obj === "object" && obj != null) {
    Object.getOwnPropertyNames(obj).forEach(function (key) {
      if (keys.indexOf(key) !== -1) delete obj[key];
      else removeProps(obj[key], keys);
    });
    return obj;
  }
}

export function mockResumeIdSeq(
  ins: DurableState<any, any, any>,
  startWith = 0,
  onGen?: Function
) {
  let fcount = startWith;
  (ins as any).genResumeId = (k: string) => {
    const nextId = `${k}-${fcount++}`;
    onGen?.(fcount);
    return nextId;
  };
}

export function simulateSaveAndLoad<T extends DurableState<any, any, any>>(
  ClassName: Constructor<T>,
  ins: T
) {
  const state = JSON.parse(JSON.stringify(ins.toJSON()));
  return DurableState.fromJSON(ClassName as any, state) as T;
}
