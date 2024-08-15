import { test, expect, mock } from "bun:test";

import { convertTypeToSchema } from "../src/libs/ts_json_schema";
import { Project } from "ts-morph";

test("ast-jsonSchema-test", async () => {
  const T1 = `
  type SubT1 = {
    s1: {
      s11: number
    },
    s2: string
  }

  type T1 = {
    a: string,
    b: number,
    c: string[],
    d: number[],
    e: {
      e1: string,
      e2: 'e2_a' | 'e2_b'
    }
    f: SubT1
    g: SubT1[]
  }`;

  const project = new Project({});
  const file = project.createSourceFile("code.ts", T1);

  const typeAlias = file.getTypeAliasOrThrow("T1");
  const typeChecker = project.getTypeChecker();
  const type = typeChecker.getTypeAtLocation(typeAlias.getNameNode());

  const jsonSchema = convertTypeToSchema(type, typeAlias.getNameNode());
  expect(jsonSchema).toMatchSnapshot();
});
