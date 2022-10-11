import {testProcessProject} from '../generate';

testProcessProject(
  'generates type guards with a short circuit',
  {
    'test.ts': `
    /** @see {isFoo} ts-auto-guard:type-guard */
    export type Foo = {
      foo: number
    }`,
  },
  {
    'test.ts': null,
    'test.guard.ts': `
    import { Foo } from "./test";

    export function isFoo(obj: unknown): obj is Foo {
        if (DEBUG) return true
        const typedObj = obj as Foo
        return (
            (typedObj !== null &&
              typeof typedObj === "object" ||
              typeof typedObj === "function") &&
            typeof typedObj["foo"] === "number"
        )
    }`,
  },
  {
    options: { shortCircuitCondition: 'DEBUG', debug: false },
  }
)