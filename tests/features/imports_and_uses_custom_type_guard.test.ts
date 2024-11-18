import { testProcessProject } from '../generate'

testProcessProject(
  'imports and uses custom type guard',
  {
    'test.ts': `
    /** @see {isFoo} ts-auto-guard:custom */
    export type Foo = string & { brand: true };

    export function isFoo(x: unknown): x is string {
      return typeof x === "string";
    }

    /** @see {isBar} ts-auto-guard:type-guard */
    export type Bar = {
      foo: Foo,
      str: string
    }`,
  },
  {
    'test.ts': null,
    'test.guard.ts': `
    import { isFoo, Bar } from "./test";

    export function isBar(obj: unknown): obj is Bar {
        const typedObj = obj as Bar
        return (
            (typedObj !== null &&
              typeof typedObj === "object" ||
              typeof typedObj === "function")&&
              isFoo(typedObj["foo"]) as boolean &&
              typeof typedObj["str"] === "string"
        )
    }`,
  }
)
