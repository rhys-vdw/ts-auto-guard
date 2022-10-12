import { testProcessProject } from '../generate'

testProcessProject(
  'generated type guards for numeric enums in optional records',
  {
    'test.ts': `
    export enum Types{
        TheGood = 1,
        TheBad,
        TheTypeSafe
    }
    export interface TestItem  {
      room: Partial<Record<Types, string>>>;
    }`,
  },
  {
    'test.ts': null,
    'test.guard.ts': `
      import { Types, TestItem } from "./test";

      export function isTypes(obj: unknown): obj is Types {
          const typedObj = obj as Types
          return (
              (typedObj === Types.TheGood ||
                  typedObj === Types.TheBad ||
                  typedObj === Types.TheTypeSafe)
          )
      }

      export function isTestItem(obj: unknown): obj is TestItem {
          const typedObj = obj as TestItem
          return (
              (typedObj !== null &&
                  typeof typedObj === "object" ||
                  typeof typedObj === "function") &&
              (typedObj["room"] !== null &&
                  typeof typedObj["room"] === "object" ||
                  typeof typedObj["room"] === "function") &&
              (typeof typedObj["room"]["1"] === "undefined" ||
                  typeof typedObj["room"]["1"] === "string") &&
              (typeof typedObj["room"]["2"] === "undefined" ||
                  typeof typedObj["room"]["2"] === "string") &&
              (typeof typedObj["room"]["3"] === "undefined" ||
                  typeof typedObj["room"]["3"] === "string")
          )
      }`,
  },
  { options: { exportAll: true } }
)
