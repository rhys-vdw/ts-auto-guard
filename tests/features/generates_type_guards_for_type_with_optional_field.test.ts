import { testProcessProject } from '../generate'

testProcessProject(
  'generates type guards for interface with optional field',
  {
    'test.ts': `
    /** @see {isFoo} ts-auto-guard:type-guard */
    export type Foo {
      foo?: number,
      bar: number | undefined,
      baz?: number | undefined
    }`,
  },
  {
    'test.ts': null,
    'test.guard.ts': `
    import { Foo } from "./test";

    export function isFoo(obj: unknown): obj is Foo {
      const typedObj = obj as Foo
      return (
        (typedObj !== null &&
            typeof typedObj === "object" ||
            typeof typedObj === "function") &&
        (!("foo" in typedObj) ||
            "foo" in typedObj &&
            (typeof typedObj["foo"] === "undefined" ||
                typeof typedObj["foo"] === "number")) &&
        "bar" in typedObj &&
        (typeof typedObj["bar"] === "undefined" ||
            typeof typedObj["bar"] === "number") &&
        (!("baz" in typedObj) ||
            "baz" in typedObj &&
            (typeof typedObj["baz"] === "undefined" ||
                typeof typedObj["baz"] === "number"))
      )
    }`,
  }
)
