import { testProcessProject } from '../generate'

testProcessProject(
  'generates type guards for simple interface',
  {
    'test.ts': `
    /** @see {isFoo} ts-auto-guard:type-guard */
    export interface Foo {
      foo: number,
      bar: string
    }`,
  },
  {
    'test.ts': null,
    'test.guard.ts': `
    import type { Foo } from "./test";

    export function isFoo(obj: unknown): obj is Foo {
        const typedObj = obj as Foo
        return (
            (typedObj !== null &&
            typeof typedObj === "object" ||
            typeof typedObj === "function") &&
            typeof typedObj["foo"] === "number" &&
            typeof typedObj["bar"] === "string"
        )
    }`,
  }
)
