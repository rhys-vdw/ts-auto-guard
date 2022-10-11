import { testProcessProject } from '../generate'

testProcessProject(
  'generates type guards for nested interface',
  {
    'test.ts': `
    interface Bar {
      bar: number
    }

    /** @see {isFoo} ts-auto-guard:type-guard */
    export interface Foo {
      foo: Bar,
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
            (typedObj["foo"] !== null &&
              typeof typedObj["foo"] === "object" ||
              typeof typedObj["foo"] === "function") &&
            typeof typedObj["foo"]["bar"] === "number"
        )
    }`,
  }
)
