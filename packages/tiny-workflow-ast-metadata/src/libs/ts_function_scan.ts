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
