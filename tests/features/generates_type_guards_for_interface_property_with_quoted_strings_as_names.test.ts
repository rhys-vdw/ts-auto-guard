import { testProcessProject } from '../generate'

testProcessProject(
  'generates type guards for interface property with quoted strings as names',
  {
    'test.ts': `
    /** @see {isFoo} ts-auto-guard:type-guard */
    export interface Foo {
      'single-quoted': number
      "double-quoted": number
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
            typeof typedObj["single-quoted"] === "number" &&
            typeof typedObj["double-quoted"] === "number"
        )
    }`,
  }
)
