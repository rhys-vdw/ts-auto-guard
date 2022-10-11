import {testProcessProject} from '../generate';

testProcessProject(
  'generates type guards for interface extending other interface',
  {
    'test.ts': `
    interface Bar {
      bar: number
    }

    /** @see {isFoo} ts-auto-guard:type-guard */
    export interface Foo extends Bar {
      foo: number,
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
            typeof typedObj["bar"] === "number" &&
            typeof typedObj["foo"] === "number"
        )
    }`,
  }
)