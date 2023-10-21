import { testProcessProject } from '../generate'

testProcessProject(
  'generated type guards for number keys',
  {
    'test.ts': `
      export interface Foo {
        [numberKey: number]: number
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
            Object.entries<any>(typedObj)
                .every(([key, value]) => (typeof value === "number" &&
                    (+key).toString() === key))
        )
      }`,
  },
  { options: { exportAll: true } }
)
