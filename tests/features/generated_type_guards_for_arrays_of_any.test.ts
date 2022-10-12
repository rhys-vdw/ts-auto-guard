import { testProcessProject } from '../generate'

testProcessProject(
  'generated type guards for arrays of any',
  {
    'test.ts': `
      export interface Foo {
        value: any[]
      }
      `,
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
              Array.isArray(typedObj["value"])
          )
      }`,
  },
  { options: { exportAll: true } }
)
