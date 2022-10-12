import { testProcessProject } from '../generate'

testProcessProject(
  'Check if callable interface is a function',
  // should also emit a warning about how it is not possible to check function type at runtime.
  {
    'test.ts': `
      /** @see {isTestType} ts-auto-guard:type-guard */
      export interface TestType {
        (someArg: string): number
        arg: number;
      }
    `,
  },
  {
    'test.ts': null,
    'test.guard.ts': `
      import { TestType } from "./test";

      export function isTestType(obj: unknown): obj is TestType {
          const typedObj = obj as TestType
          return (
              typeof typedObj === "function" &&
              typeof typedObj["arg"] === "number"
          )
      }
    `,
  }
)
