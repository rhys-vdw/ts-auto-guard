import { testProcessProject } from '../generate'

testProcessProject(
  'type that is an alias to an interface has a different typeguard name',
  {
    'test.ts': `
      export interface TestType {
          [index: any]: string
      }
      export type SecondaryTestType = TestType
      `,
  },
  {
    'test.ts': null,
    'test.guard.ts': `
      import { TestType, SecondaryTestType } from "./test";

      export function isTestType(obj: unknown): obj is TestType {
          const typedObj = obj as TestType
          return (
              (typedObj !== null &&
                  typeof typedObj === "object" ||
                  typeof typedObj === "function") &&
              Object.entries<any>(typedObj)
                  .every(([_key, value]) => (typeof value === "string"))
          )
      }

      export function isSecondaryTestType(obj: unknown): obj is SecondaryTestType {
        const typedObj = obj as SecondaryTestType
        return (
            (typedObj !== null &&
                typeof typedObj === "object" ||
                typeof typedObj === "function") &&
            Object.entries<any>(typedObj)
                .every(([_key, value]) => (typeof value === "string"))
        )
      }
      `,
  },
  { options: { exportAll: true } }
)
