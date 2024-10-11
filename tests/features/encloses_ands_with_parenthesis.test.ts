import { testProcessProject } from '../generate'

testProcessProject(
  'Encloses AND groups with parenthesis',
  {
    'test.ts': `
      /** @see {isTestType} ts-auto-guard:type-guard */
      export interface TestType {
          val: boolean|number
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
              (((typedObj !== null &&
                  typeof typedObj === "object") ||
                  typeof typedObj === "function") &&
              (typeof typedObj["val"] === "number" || 
              typedObj["val"] === false || 
              typedObj["val"] === true ))
          )
      }
      `,
  }
)
