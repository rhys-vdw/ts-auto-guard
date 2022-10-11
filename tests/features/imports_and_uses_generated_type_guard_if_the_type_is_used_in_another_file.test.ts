import { testProcessProject } from '../generate'

testProcessProject(
  'imports and uses generated type guard if the type is used in another file',
  {
    'test.ts': `
      /** @see {isTestType} ts-auto-guard:type-guard */
      export interface TestType {
          someKey: string | number
      }
      `,
    'test-list.ts': `
      import { TestType } from './test'

      /** @see {isTestTypeList} ts-auto-guard:type-guard */
      export type TestTypeList = Array<TestType>
      `,
  },
  {
    'test.ts': null,
    'test-list.ts': null,
    'test-list.guard.ts': `
      import { isTestType } from "./test.guard";
      import { TestTypeList } from "./test-list";

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
        import { TestType } from "./test";

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
  }
)
