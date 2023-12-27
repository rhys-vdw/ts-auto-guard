import { testProcessProject } from '../generate'

testProcessProject(
  'generates type guards for interfaces with constant keys',
  {
    'test.ts': `
    const Bar = "bar-value";

    /** @see {isFoo} ts-auto-guard:type-guard */
    export interface Foo {
      [Bar]: string;
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
          typeof typedObj["bar-value"] === "string"
        )
    }`,
  }
)
