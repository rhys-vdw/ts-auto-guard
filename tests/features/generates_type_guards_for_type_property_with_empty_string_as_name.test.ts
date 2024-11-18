import { testProcessProject } from '../generate'

testProcessProject(
  'generates type guards for type property with empty string as name',
  {
    'test.ts': `
    /** @see {isFoo} ts-auto-guard:type-guard */
    export type Foo = {
      "": number
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
            typeof typedObj[""] === "number"
        )
    }`,
  }
)
