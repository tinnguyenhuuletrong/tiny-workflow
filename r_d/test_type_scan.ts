import { readFileSync } from "fs";
import { MethodDeclaration, Project } from "ts-morph";

// Load src -> create prj
const filePath = __dirname + "/../examples/guessGame.ts";
const code = readFileSync(filePath).toString();
const project = new Project({});
const file = project.createSourceFile("code.ts", code);

const cl = file.getClasses()[0];
console.log("name:", cl.getName());
const members = cl
  .getMembers()
  .filter((itm) => itm.getKindName() === "MethodDeclaration")
  .map((itm) => itm as MethodDeclaration);
console.log(
  "members:",
  members.map((itm) => itm.getName())
);

function parseStepTransition(method: MethodDeclaration) {
  const returnType = method
    .getReturnType()
    ?.compilerType?.aliasSymbol?.getName();
  if (returnType != "StepIt") return null;

  const returnTypeConstraint = method
    .getReturnType()
    .compilerType.aliasTypeArguments?.filter((itm) => itm.isTypeParameter)
    .filter((itm) => itm.symbol)
    .map((itm) => itm.symbol.name);

  // console.log("method: ", method.getName(), "->", returnTypeConstraint);

  return {
    step: method.getName(),
    transitionTo: returnTypeConstraint?.[1],
  };
}

// const tmp = members[3];
// doInspectReturnConstrain(tmp);
console.log(members.map(parseStepTransition).filter(Boolean));
