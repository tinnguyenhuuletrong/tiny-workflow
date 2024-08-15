export type TWFMetaSourceScanResult = {
  className: string;
  eSteps: string[];
  transitions: {
    step: string;
    transitionTo: string[];
  }[];
  typeShapeJsonSchema: any;
  stepDetail: {
    [k: string]: {
      actionKeys: string[];
      waitMsKeys: string[];
      waitEventKeys: string[];
    };
  };
};
