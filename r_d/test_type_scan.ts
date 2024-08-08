import { readFileSync } from "fs";
import { MethodDeclaration, Project } from "ts-morph";
import type { UnionType } from "typescript";

// Visual TS node 😀
// /../examples/guessGame.ts
// https://ts-ast-viewer.com/#code/FAYwNghgzlAEDiBXApjeEC2yDKAXCuysyAHoQHYAmcAIogE4QBGYO+hAPAKJ7IAOAGlgAVPARwALCH2RCuAQUSUAlrgAyAewDmAPlgBvYLFgB6EyICeM2NggAzZFsQR6lWADJYi3Btj1HylCE9EawfPTKAG7isAD6QQTKIAAUANbIFgBcsDyEfACU2bx8ABIQVKz03MV6hsbG-rgM5LC4EoEA2ukWALoA3KEAvqHhUTGxIBpgrCC48lQASgFByPTFUMn5BqHGAPJMAFbIswB00WAoG7n8+ScY0snJKwWwALw6O-VtgSfPZRWrX7IXBPPJCb5QE7xdhJUE3E5MZRUZIQ-L5T75AbGYbGSbkIL0RCzDT0TbbeqwKCIGSk658X55WJMALkIR1CmwADuqgkihU6m02TsEDAUFkn2MlGQTEQWmyuEJ4opg0xnwhUMm02Oc0Wy2C602WNgwxGEWihFg0As5BAsAAVM8mSzNkU8gBJXDVME5YoM-ixPiQCy1T54oJ+VBvS2ciCqVrtSHctryWbKDTkZIAIi0yHIq3EsXIiAwmaEVptsDJ73JHMazVgAFkCBITvQNIhkU22q3ypQNBgyXbYABGAAMo9Vysn9WUdkr-khqi2FmUyDAbgXJ1URuM6oShBORYwzPoUc35xQO4jTXoLX0sDzZGK2Tpfr4AaDxqNJuMo3NRHLW0HUZQMIAsF0bHdT06TkX1HVzSgQwpVhcFgSYO1Q15YFHK8UNgABHS5cDTFosIAAyPE9YGZXBOWQXNsIAWjHUcThyDA+FwCxYDsElKWUDBEEgC0oAgSJkBMMANAgSgyNw4FLXxOjTywjp+lDdNwycVAoAAOWLKM93YZBD2LE8r05dpWErBUUC2dkKTDVDcA4wyExOGNVAAMRJLhxPIEEyOQfzcFiaBUliAASfR0ICgBqOLBjItkJXqQjUGI9NsjI6L0qCEikoEVKVSvYxZxsjit1wZdV3XVpKu3VKnNgSAgjCpTVkMyqL2QQ1UvKKBlJOPhECgCRkla0KBuU1VUvKiboCmjqVNeLDtJgfSMHs1LjCYfwIFSUrjWIUUiHmyb2sGzqOFgda9OLbaOTSoiSKjMietgaKLum1ZBlgQJYButpynjADltgRiHzMzqaLohjR2Y8c5OKk6xRrJ68sy0jYHekUUE+-RvuWv6Ab0YGWjaMGrtPSHKJh4E4ZaBGWORp6cXqdnd3c-cTJ+lTFOpgZPjrW8DAfUhcGfH08jfWIEK-IZgFNMYLUA+14ORQpIP4D0vX4IQi2mJD6maly+Dcn5PNwHz6D83NAuC+2JnTLRGCaYSSOS9HnoykjsoATXbcXkDcaKjPEE4+YAfhOVhyC0No-rbDtqFaXw7tBqHj06sPueM0zs-oQY2IAYRdt2hMSdMAEJks+ErPnms2qpqtc3GbxrheBet70fSW8myQ2wAV7FgEGIA

// /../examples/guessGame_2.ts
// https://ts-ast-viewer.com/#code/FAYwNghgzlAEDiBXApjeEC2yDKAXCuysyAHoQHYAmcAIogE4QBGYO+hAPAKJ7IAOAGlgAVPARwALCH2RCuAQUSUAlrgAyAewDmAPlgBvYLFgB6EyICeM2NggAzZFsQR6lWADJYi3Btj1HylCE9EawfPTKAG7isAD6QQTKIAAUANbIFgBcsDyEfACU2bx8ABIQVKz03MV6hsbG-rgM5LC4EoEA2ukWALoA3KEAvqHhUTGxIBpgrCC48lQASgFByPTFUMn5BqHGAPJMAFbIswB00WAoG7n8+ScY0snJKwWwALw6O-VtgSfPZRWrX7IXBPPJCb5QE7xdhJUE3E5MZRUZIQ-L5T75AbGYbGSbkIL0RCzDT0TbbeqwKCIGSk658X55WJMALkIR1CmwADuqgkihU6m02TsEDAUFkn2MlGQTEQWmyuEJ4opg0xnwhUMm02Oc0Wy2C602WNgwxGEWihFg0As5BAsAAVM8mSzNkU8gBJXDVME5YoM-ixPiQCy1T54oJ+VBvS2ciCqVrtSHctryWbKDTkZIAIi0yHIq3EsXIiAwmaEVptsDJ73JHMazVgAFkCBITvQNIhkU22q3ypQNBgyXbYABGAAMo9Vysn9WUdkr-khqi2FmUyDAbgXJ1URuM6oShBORYwzPoUc35xQO4jTXoLX0sDzZGK2Tpfr4AaDxqNJuMo3NRHLW0HUZQMIAsF0bHdT06TkX1HVzSgQwpVhcFgSYO1Q15YFHK8UNgABHS5cDTFosIAAyPE9YGZXBOWQXNsIAWjHUcThyDA+FwCxYDsElKWUDBEEgC0oAgSJkBMMANAgSgyNw4FLXxOjTywjp+lDdNwycVAoAAOWLKM93YZBD2LE8r05dpWErBUUC2dkKTDVDcA4wyExOGNVAAMRJLhxPIEEyOQfzcFiaBUliAASfR0ICgBqOLBjItkJXqQjUGI9NsjI6L0qCEikoEVKVSvYxZxsjit1wZdV3XVpKu3VKnNgSAgjCpTVkMyqL2QQ1UvKKBlJOPhECgCRkla0KBuU1VUvKiboCmjqVNeLDtJgfSMHs1LjCYfwIFSUrjWIUUiHmyb2sGzqOFgda9OLbaOTSoiSKjMietgaKLum1ZBlgQJYButpynjADltgRiHzMzqaLohjR2Y8c5OKk6xRrJ68sy0jYHekUUE+-RvuWv6Ab0YGWjaMGrtPSHKJh4E4ZaBGWORp6cXqdnd3c-cTJ+lTFOpgZPjrW8DAfUhcGfH08jfWIEK-IZgFNMYLUA+14ORQpIP4D0vX4IQi2mJD6maly+Dcn5PNwHz6D83NAuC+2JnTLRGCaYSSOS9HnoykjsoATXbcXkDcaKjPEE4+YAfhOVhyC0No-rbDtqFaXw7tBqHj06sPueM0zs-oQY2IAYRdt2hMSdMAEJks+ErPnms2qpqtc3GbxrheBet70fSW8myQ2wAV7FgEGIA

function doParseWorkflowMetadata(filePath: string) {
  const code = readFileSync(filePath).toString();
  const project = new Project({});
  const file = project.createSourceFile("code.ts", code);

  const cl = file.getClasses()[0];
  // console.log("name:", cl.getName());
  const members = cl
    .getMembers()
    .filter((itm) => itm.getKindName() === "MethodDeclaration")
    .map((itm) => itm as MethodDeclaration);

  // console.log(
  //   "members:",
  //   members.map((itm) => itm.getName())
  // );

  return {
    className: cl.getName(),
    transitions: members.map(parseStepTransition).filter(Boolean),
  };
}

function parseStepTransition(method: MethodDeclaration) {
  const returnType = method
    .getReturnType()
    ?.compilerType?.aliasSymbol?.getName();
  if (returnType != "StepIt") return null;

  const returnTypeConstraint = method
    .getReturnType()
    .compilerType.aliasTypeArguments?.filter(
      (itm) => itm.isTypeParameter || itm.isUnion()
    )
    .map((itm) => {
      if (itm.isUnion()) {
        const ins = itm as UnionType;
        return ins.types.map((itm) => itm.symbol?.name).filter(Boolean);
      } else return [itm.symbol?.name].filter(Boolean);
    });

  // console.log("method: ", method.getName(), "->", returnTypeConstraint);

  return {
    step: method.getName(),
    transitionTo: returnTypeConstraint?.[1],
  };
}

// Load src -> create prj
{
  const filePath = __dirname + "/../examples/guessGame.ts";
  console.log(filePath, "->", doParseWorkflowMetadata(filePath));
}
{
  const filePath = __dirname + "/../examples/guessGame_2.ts";
  console.log(filePath, "->", doParseWorkflowMetadata(filePath));
}
