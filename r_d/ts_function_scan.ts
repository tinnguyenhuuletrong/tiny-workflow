import {
  MethodDeclaration,
  Project,
  PropertyAccessExpression,
  SyntaxKind,
} from "ts-morph";

export function scan_expression_call(
  methodDeclaration: MethodDeclaration,
  methodName: string
) {
  const callExpressions = methodDeclaration.getDescendantsOfKind(
    SyntaxKind.CallExpression
  );

  // Filter the call expressions to find those like `this.withAction`
  const withActionCalls = callExpressions.filter((callExpr) => {
    const expression = callExpr.getExpression();

    // Ensure that the expression is a PropertyAccessExpression
    if (expression.getKind() === SyntaxKind.PropertyAccessExpression) {
      const propertyAccess = expression as PropertyAccessExpression;

      // Check if the expression matches `this.withAction`
      return (
        // propertyAccess.getExpression().getText() === "this" &&
        propertyAccess.getName() === methodName
      );
    }

    return false;
  });

  return withActionCalls;
}

async function main() {
  // Initialize the project
  const project = new Project({
    tsConfigFilePath: "tsconfig.json",
  });

  // Get the source file where the type is defined
  const sourceFile = project.getSourceFileOrThrow("examples/userOnboarding.ts");

  // Get the class declaration by name
  const className = "UserOnboardingFlow";
  const classDeclaration = sourceFile.getClassOrThrow(className);

  // Get the method (function) by name within the class
  const methodName = "step_process";
  const methodDeclaration = classDeclaration.getMethodOrThrow(methodName);

  // Scan the method body for call expressions
  const withActionCalls = scan_expression_call(methodDeclaration, "withAction");

  console.log(withActionCalls.map((itm) => itm.getArguments()?.[0].getText()));
}
// main();
