import { testProcessProject } from '../generate'

testProcessProject(
  'generates type guards for dynamic object keys, including when mixed with static keys',
  {
    'test.ts': `
      /** @see {isTestType} ts-auto-guard:type-guard */
      export interface TestType {
          someKey: "some" | "key"
          [index: string]: "dynamic" | "string"
          [index: number]: "also-dynamic" | "number"
      }
      `,
  },
  {
    'test.ts': null,
    'test.guard.ts': `
      import type { TestType } from "./test";

      export function isTestType(obj: unknown): obj is TestType {
          const typedObj = obj as TestType
          return (
              (typedObj !== null &&
                  typeof typedObj === "object" ||
                  typeof typedObj === "function") &&
              (typedObj["someKey"] === "some" ||
                  typedObj["someKey"] === "key") &&
              Object.entries<any>(typedObj)
                  .filter(([key]) => !["someKey"].includes(key))
                  .every(([key, value]) => ((value === "string" ||
                      value === "dynamic") &&
                      typeof key === "string" ||
                      (value === "number" ||
                          value === "also-dynamic") &&
                      (+key).toString() === key))
          )
      }
      `,
  }
)
