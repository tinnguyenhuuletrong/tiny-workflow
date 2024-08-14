import { type Type, type Node, Project } from "ts-morph";

export function convertTypeToSchema(type: Type, node: Node): any {
  const schema: any = {};

  if (type.isString()) {
    schema.type = "string";
  } else if (type.isNumber()) {
    schema.type = "number";
  } else if (type.isBoolean()) {
    schema.type = "boolean";
  } else if (type.isArray()) {
    schema.type = "array";
    schema.items = convertTypeToSchema(type.getArrayElementTypeOrThrow(), node);
  } else if (type.isObject()) {
    schema.type = "object";
    schema.properties = {};
    const properties = type.getProperties();
    for (const prop of properties) {
      const propType = prop.getTypeAtLocation(node);
      schema.properties[prop.getName()] = convertTypeToSchema(propType, node);
    }
  } else {
    schema.type = "unknown";
  }

  return schema;
}

async function main() {
  // Initialize the project
  const project = new Project({
    tsConfigFilePath: "tsconfig.json",
  });

  // Get the source file where the type is defined
  const sourceFile = project.getSourceFileOrThrow("examples/userOnboarding.ts");

  // Assuming you have a type alias like `type MyType = ...;`
  const typeAlias = sourceFile.getTypeAliasOrThrow("TStateShape");

  // Get the type from the alias
  const typeChecker = project.getTypeChecker();
  const type = typeChecker.getTypeAtLocation(typeAlias.getNameNode());

  const jsonSchema = convertTypeToSchema(type, typeAlias.getNameNode());
  console.log(JSON.stringify(jsonSchema, null, 2));
}

// main();
