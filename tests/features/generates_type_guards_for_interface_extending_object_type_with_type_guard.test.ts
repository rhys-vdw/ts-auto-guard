import { testProcessProject } from '../generate'

testProcessProject(
  'generates type guards for interface extending object type with type guard',
  {
    'test.ts': `
    /** @see {isBar} ts-auto-guard:type-guard */
    export type Bar = {
      bar: number
    }

    /** @see {isFoo} ts-auto-guard:type-guard */
    export interface Foo extends Bar {
      foo: number
    }`,
  },
  {
    'test.ts': null,
    'test.guard.ts': `
    import type { Bar, Foo } from "./test";

    export function isBar(obj: unknown): obj is Bar {
        const typedObj = obj as Bar
        return (
            (typedObj !== null &&
              typeof typedObj === "object" ||
              typeof typedObj === "function") &&
            typeof typedObj["bar"] === "number"
        )
    }

    export function isFoo(obj: unknown): obj is Foo {
        const typedObj = obj as Foo
        return (
            isBar(typedObj) as boolean &&
            typeof typedObj["foo"] === "number"
        )
    }`,
  }
)
