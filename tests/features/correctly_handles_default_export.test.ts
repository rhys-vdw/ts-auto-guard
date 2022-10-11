import { testProcessProject } from '../generate'

testProcessProject(
  'correctly handles default export',
  {
    'test.ts': `
    /** @see {isFoo} ts-auto-guard:type-guard */
    interface Foo {
      foo: number,
      bar: string
    }

    export default Foo`,
  },
  {
    'test.ts': null,
    'test.guard.ts': `
    import Foo from "./test";

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
