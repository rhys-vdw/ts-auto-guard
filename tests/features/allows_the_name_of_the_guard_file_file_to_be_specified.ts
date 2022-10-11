import {testProcessProject} from '../generate';

testProcessProject(
  'allows the name of the guard file file to be specified',
  {
    'test.ts': `
    /** @see {isFoo} ts-auto-guard:type-guard */
    export interface Foo {
      foo: number,
      bar: string
    }`,
  },
  {
    'test.ts': null,
    'test.debug.ts': `
    import { Foo } from "./test";

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
  },
  {
    options: {
      guardFileName: 'debug',
    },
  }
)