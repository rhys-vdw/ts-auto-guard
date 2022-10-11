import {testProcessProject} from '../generate';

testProcessProject(
  'generates type guards for nested interface with type guard',
  {
    'test.ts': `
    /** @see {isBar} ts-auto-guard:type-guard */
    export interface Bar {
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
    import { Bar, Foo } from "./test";

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
            (typedObj !== null &&
              typeof typedObj === "object" ||
              typeof typedObj === "function") &&
            isBar(typedObj["foo"]) as boolean
        )
    }`,
  }
)