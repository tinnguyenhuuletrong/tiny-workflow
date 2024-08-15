import { readFileSync } from "fs";
import {
  ClassDeclaration,
  MethodDeclaration,
  Project,
  SourceFile,
  SyntaxKind,
} from "ts-morph";
import type { UnionType } from "typescript";
import { scan_expression_call } from "./libs/ts_function_scan";
import { convertTypeToSchema } from "./libs/ts_json_schema";
import type { TWFMetaSourceScanResult } from "./type";

export function parseWorkflowMetadataFromFile(filePath: string) {
  const code = readFileSync(filePath).toString();
  return parseWorkflowMetadata(code);
}

export function parseWorkflowMetadata(code: string): TWFMetaSourceScanResult {
  const project = new Project({});
  const file = project.createSourceFile("code.ts", code);

  const { candidateClass: cl, candidateClassTypeArgs } = lookupStateClass(file);
  if (!cl)
    throw new Error(
      "Could not found Class which inherit DurableState. Please check it again"
    );

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
  const stepHandler = members.filter((itm) => eSteps.includes(itm.getName()));

  return {
    className: cl.getNameOrThrow(),
    eSteps,
    transitions: stepHandler.map(parseStepTransition).filter(Boolean),
    typeShapeJsonSchema: parseTypeShape(
      project,
      file,
      candidateClassTypeArgs[1]
    ),
    stepDetail,
  };
}

function parseStepTransition(method: MethodDeclaration) {
  const returnType = method
    .getReturnType()
    ?.compilerType?.aliasSymbol?.getName();

  if (returnType != "StepIt")
    throw new Error(`returnType=${returnType} is not StepIt`);

  const args = method.getReturnType().compilerType.aliasTypeArguments ?? [];

  const returnTypeConstraint = args
    .filter((itm) => itm.isTypeParameter || itm.isUnion())
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
