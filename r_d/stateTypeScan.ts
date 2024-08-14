import { readFileSync } from "fs";
import {
  ClassDeclaration,
  MethodDeclaration,
  Project,
  SourceFile,
  SyntaxKind,
} from "ts-morph";
import type { UnionType } from "typescript";
import { convertTypeToSchema } from "./ts_json_schema";
import { scan_expression_call } from "./ts_function_scan";

// Visual TS node 😀
// /../examples/guessGame.ts
// https://ts-ast-viewer.com/#code/FAYwNghgzlAEDiBXApjeEC2yDKAXCuysyAHoQHYAmcAIogE4QBGYO+hAPAKJ7IAOAGlgAVPARwALCH2RCuAQUSUAlrgAyAewDmAPlgBvYLFgB6EyICeM2NggAzZFsQR6lWADJYi3Btj1HylCE9EawfPTKAG7isAD6QQTKIAAUANbIFgBcsDyEfACU2bx8ABIQVKz03MV6hsbG-rgM5LC4EoEA2ukWALoA3KEAvqHhUTGxIBpgrCC48lQASgFByPTFUMn5BqHGAPJMAFbIswB00WAoG7n8+ScY0snJKwWwALw6O-VtgSfPZRWrX7IXBPPJCb5QE7xdhJUE3E5MZRUZIQ-L5T75AbGYbGSbkIL0RCzDT0TbbeqwKCIGSk658X55WJMALkIR1CmwADuqgkihU6m02TsEDAUFkn2MlGQTEQWmyuEJ4opg0xnwhUMm02Oc0Wy2C602WNgwxGEWihFg0As5BAsAAVM8mSzNkU8gBJXDVME5YoM-ixPiQCy1T54oJ+VBvS2ciCqVrtSHctryWbKDTkZIAIi0yHIq3EsXIiAwmaEVptsDJ73JHMazVgAFkCBITvQNIhkU22q3ypQNBgyXbYABGAAMo9Vysn9WUdkr-khqi2FmUyDAbgXJ1URuM6oShBORYwzPoUc35xQO4jTXoLX0sDzZGK2Tpfr4AaDxqNJuMo3NRHLW0HUZQMIAsF0bHdT06TkX1HVzSgQwpVhcFgSYO1Q15YFHK8UNgABHS5cDTFosIAAyPE9YGZXBOWQXNsIAWjHUcThyDA+FwCxYDsElKWUDBEEgC0oAgSJkBMMANAgSgyNw4FLXxOjTywjp+lDdNwycVAoAAOWLKM93YZBD2LE8r05dpWErBUUC2dkKTDVDcA4wyExOGNVAAMRJLhxPIEEyOQfzcFiaBUliAASfR0ICgBqOLBjItkJXqQjUGI9NsjI6L0qCEikoEVKVSvYxZxsjit1wZdV3XVpKu3VKnNgSAgjCpTVkMyqL2QQ1UvKKBlJOPhECgCRkla0KBuU1VUvKiboCmjqVNeLDtJgfSMHs1LjCYfwIFSUrjWIUUiHmyb2sGzqOFgda9OLbaOTSoiSKjMietgaKLum1ZBlgQJYButpynjADltgRiHzMzqaLohjR2Y8c5OKk6xRrJ68sy0jYHekUUE+-RvuWv6Ab0YGWjaMGrtPSHKJh4E4ZaBGWORp6cXqdnd3c-cTJ+lTFOpgZPjrW8DAfUhcGfH08jfWIEK-IZgFNMYLUA+14ORQpIP4D0vX4IQi2mJD6maly+Dcn5PNwHz6D83NAuC+2JnTLRGCaYSSOS9HnoykjsoATXbcXkDcaKjPEE4+YAfhOVhyC0No-rbDtqFaXw7tBqHj06sPueM0zs-oQY2IAYRdt2hMSdMAEJks+ErPnms2qpqtc3GbxrheBet70fSW8myQ2wAV7FgEGIA

// /../examples/guessGame_2.ts
// https://ts-ast-viewer.com/#code/FAYwNghgzlAEDiBXApjeEC2yDKAXCuysyAHoQHYAmcAIogE4QBGYO+hAPAKJ7IAOAGlgAVPARwALCH2RCuAQUSUAlrgAyAewDmAPlgBvYLFgB6EyICeM2NggAzZFsQR6lWADJYi3Btj1HylCE9EawfPTKAG7isAD6QQTKIAAUANbIFgBcsDyEfACU2bx8ABIQVKz03MV6hsbG-rgM5LC4EoEA2ukWALoA3KEAvqHhUTGxIBpgrCC48lQASgFByPTFUMn5BqHGAPJMAFbIswB00WAoG7n8+ScY0snJKwWwALw6O-VtgSfPZRWrX7IXBPPJCb5QE7xdhJUE3E5MZRUZIQ-L5T75AbGYbGSbkIL0RCzDT0TbbeqwKCIGSk658X55WJMALkIR1CmwADuqgkihU6m02TsEDAUFkn2MlGQTEQWmyuEJ4opg0xnwhUMm02Oc0Wy2C602WNgwxGEWihFg0As5BAsAAVM8mSzNkU8gBJXDVME5YoM-ixPiQCy1T54oJ+VBvS2ciCqVrtSHctryWbKDTkZIAIi0yHIq3EsXIiAwmaEVptsDJ73JHMazVgAFkCBITvQNIhkU22q3ypQNBgyXbYABGAAMo9Vysn9WUdkr-khqi2FmUyDAbgXJ1URuM6oShBORYwzPoUc35xQO4jTXoLX0sDzZGK2Tpfr4AaDxqNJuMo3NRHLW0HUZQMIAsF0bHdT06TkX1HVzSgQwpVhcFgSYO1Q15YFHK8UNgABHS5cDTFosIAAyPE9YGZXBOWQXNsIAWjHUcThyDA+FwCxYDsElKWUDBEEgC0oAgSJkBMMANAgSgyNw4FLXxOjTywjp+lDdNwycVAoAAOWLKM93YZBD2LE8r05dpWErBUUC2dkKTDVDcA4wyExOGNVAAMRJLhxPIEEyOQfzcFiaBUliAASfR0ICgBqOLBjItkJXqQjUGI9NsjI6L0qCEikoEVKVSvYxZxsjit1wZdV3XVpKu3VKnNgSAgjCpTVkMyqL2QQ1UvKKBlJOPhECgCRkla0KBuU1VUvKiboCmjqVNeLDtJgfSMHs1LjCYfwIFSUrjWIUUiHmyb2sGzqOFgda9OLbaOTSoiSKjMietgaKLum1ZBlgQJYButpynjADltgRiHzMzqaLohjR2Y8c5OKk6xRrJ68sy0jYHekUUE+-RvuWv6Ab0YGWjaMGrtPSHKJh4E4ZaBGWORp6cXqdnd3c-cTJ+lTFOpgZPjrW8DAfUhcGfH08jfWIEK-IZgFNMYLUA+14ORQpIP4D0vX4IQi2mJD6maly+Dcn5PNwHz6D83NAuC+2JnTLRGCaYSSOS9HnoykjsoATXbcXkDcaKjPEE4+YAfhOVhyC0No-rbDtqFaXw7tBqHj06sPueM0zs-oQY2IAYRdt2hMSdMAEJks+ErPnms2qpqtc3GbxrheBet70fSW8myQ2wAV7FgEGIA

function lookupStateClass(file: SourceFile) {
  const allClass = file.getClasses();
  let typeArgs: string[] = [];
  let candidate = allClass.find((itm) => {
    const durableState = itm.getHeritageClauses()?.[0]?.getTypeNodes()?.[0];
    if (!durableState) return false;
    const symbolName = durableState.getExpression().getSymbol();
    const isDurableState = symbolName?.compilerSymbol.name === "DurableState";
    if (!isDurableState) return false;

    typeArgs = durableState.getTypeArguments().map((itm) => itm.getText());
    return isDurableState;
  });

  return { candidateClass: candidate, candidateClassTypeArgs: typeArgs };
}

function parseEnum(file: SourceFile, enumName: string) {
  const typeIns = file.getEnum(enumName);
  return typeIns?.getStructure().members?.map((itm) => String(itm.name)) ?? [];
}

function parseTypeShape(
  project: Project,
  file: SourceFile,
  typeShapeName: string
) {
  const typeAlias = file.getTypeAliasOrThrow(typeShapeName);
  const typeChecker = project.getTypeChecker();
  const node = typeAlias.getNameNode();
  const type = typeChecker.getTypeAtLocation(typeAlias.getNameNode());
  return convertTypeToSchema(type, node);
}

function listAllActionKey(
  cl: ClassDeclaration,
  stepName: string,
  methodName: string
) {
  const methodDeclaration = cl.getMethodOrThrow(stepName);
  const allActionCall = scan_expression_call(methodDeclaration, methodName);
  const allActionKeys = allActionCall.map((itm) => {
    const tmp = itm.getArguments()?.[0];
    if (
      !(
        tmp &&
        [
          SyntaxKind.StringLiteral,
          SyntaxKind.TemplateExpression,
          SyntaxKind.NoSubstitutionTemplateLiteral,
        ].includes(tmp.getKind())
      )
    )
      throw new Error(
        `stepName=${stepName}, methodName=${methodName}, kind=${tmp?.getKindName()} expected 1st param is actionKey as string`
      );

    // remove string quote
    return tmp.getText().slice(1, -1);
  });

  return allActionKeys;
}

function doParseWorkflowMetadata(filePath: string) {
  const code = readFileSync(filePath).toString();
  const project = new Project({});
  const file = project.createSourceFile("code.ts", code);

  const { candidateClass: cl, candidateClassTypeArgs } = lookupStateClass(file);
  if (!cl) return;

  console.log("name:", cl.getName(), candidateClassTypeArgs);
  const members = cl
    .getMembers()
    .filter((itm) => itm.getKindName() === "MethodDeclaration")
    .map((itm) => itm as MethodDeclaration);

  const eSteps = parseEnum(file, candidateClassTypeArgs[0]);
  const stepDetail = Object.fromEntries(
    eSteps.map((stepName) => {
      return [
        stepName,
        {
          actionKeys: listAllActionKey(cl, stepName, "withAction"),
          waitMsKeys: listAllActionKey(cl, stepName, "waitForMs"),
          waitEventKeys: listAllActionKey(cl, stepName, "waitForEvent"),
        },
      ];
    })
  );

  return {
    className: cl.getName(),
    eSteps: parseEnum(file, candidateClassTypeArgs[0]),
    transitions: members.map(parseStepTransition).filter(Boolean),
    typeShapeStr: parseTypeShape(project, file, candidateClassTypeArgs[1]),
    stepDetail,
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
{
  const filePath = __dirname + "/../examples/userOnboarding.ts";
  console.log(filePath, "->", doParseWorkflowMetadata(filePath));
}
