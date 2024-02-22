import { testProcessProject } from '../generate'

testProcessProject(
  'adds extension to import statements',
  {
    'test.ts': `
      /** @see {isTestType} ts-auto-guard:type-guard */
      export interface TestType {
          someKey: string | number
      }
      `,
    'test-list.ts': `
      import { TestType } from './test.js'

      /** @see {isTestTypeList} ts-auto-guard:type-guard */
      export type TestTypeList = Array<TestType>
      `,
  },
  {
    'test.ts': null,
    'test-list.ts': null,
    'test-list.guard.ts': `
      import { isTestType } from "./test.guard.js";
      import { TestTypeList } from "./test-list.js";

      export function isTestTypeList(obj: unknown): obj is TestTypeList {
          const typedObj = obj as TestTypeList
          return (
              Array.isArray(typedObj) &&
              typedObj.every((e: any) =>
                  isTestType(e) as boolean
              )
          )
      }
      `,
    'test.guard.ts': `
        import { TestType } from "./test.js";

        export function isTestType(obj: unknown): obj is TestType {
            const typedObj = obj as TestType
            return (
                (typedObj !== null &&
                    typeof typedObj === "object" ||
                    typeof typedObj === "function") &&
                (typeof typedObj["someKey"] === "string" ||
                    typeof typedObj["someKey"] === "number")
            )
        }
        `,
  },
  { options: { importExtension: 'js' } }
)
