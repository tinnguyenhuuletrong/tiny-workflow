import { test, expect, mock } from "bun:test";

import { scan_expression_call } from "../src/libs/ts_function_scan";
import { Project } from "ts-morph";

test("ast-jsonSchema-test", async () => {
  const code = `
class A {
  async fun_1() {
    this.withAction('k1', async () => {})
    this.withNoAction('k2', async () => {})
    this.withAction('k3', async () => {})
  }
}
  `;

  const project = new Project({});
  const sourceFile = project.createSourceFile("code.ts", code);

  // Get the class declaration by name
  const classDeclaration = sourceFile.getClassOrThrow("A");

  // Get the method (function) by name within the class
  const methodDeclaration = classDeclaration.getMethodOrThrow("fun_1");

  // Scan the method body for call expressions
  const withActionCalls = scan_expression_call(methodDeclaration, "withAction");

  const allActionKeys = withActionCalls.map((itm) =>
    itm.getArguments()?.[0].getText().slice(1, -1)
  );
  expect(allActionKeys).toMatchSnapshot();
});
