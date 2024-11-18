import { testProcessProject } from '../generate'

testProcessProject(
  'generates type guards for a Pick<> type',
  {
    'test.ts': `
    interface Bar {
      foo: number,
      bar: number
    }

    /** @see {isFoo} ts-auto-guard:type-guard */
    export type Foo = Pick<Bar, "foo">`,
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
            typeof typedObj["foo"] === "number"
        )
    }`,
  }
)
