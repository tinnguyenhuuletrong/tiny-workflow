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
  } else if (type.isUnion()) {
    const unionVal = type.getUnionTypes();
    schema.type = "string";
    schema.enum = unionVal.map((itm) => itm.getText().slice(1, -1));
  } else {
    schema.type = "unknown";
  }

  return schema;
}
