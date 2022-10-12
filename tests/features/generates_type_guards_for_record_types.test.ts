import { testProcessProject } from '../generate'

testProcessProject(
  'generates type guards for Record types',
  {
    'test.ts': `
      /** @see {isTestType} ts-auto-guard:type-guard */
      export type TestType = Record<string, "dynamic" | "string">
      `,
  },
  {
    'test.ts': null,
    'test.guard.ts': `
      import { TestType } from "./test";

      export function isTestType(obj: unknown): obj is TestType {
          const typedObj = obj as TestType
          return (
              (typedObj !== null &&
                  typeof typedObj === "object" ||
                  typeof typedObj === "function") &&
              Object.entries<any>(typedObj)
                  .every(([key, value]) => ((value === "string" ||
                      value === "dynamic") &&
                      typeof key === "string"))
          )
      }
      `,
  }
)
