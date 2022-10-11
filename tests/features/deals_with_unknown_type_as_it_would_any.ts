import {testProcessProject} from '../generate';

testProcessProject(
  'Deals with unknown type as it would any',
  {
    'test.ts': `
      /** @see {isTestType} ts-auto-guard:type-guard */
      export interface TestType {
          [index: string]: unknown
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
              (typedObj !== null &&
                  typeof typedObj === "object" ||
                  typeof typedObj === "function") &&
              Object.entries<any>(typedObj)
                  .every(([key, _value]) => (typeof key === "string"))
          )
      }
      `,
  }
)