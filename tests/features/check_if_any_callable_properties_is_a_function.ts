import {testProcessProject} from '../generate';

testProcessProject(
  'Check if any callable properties is a function',
  // should also emit a warning about how it is not possible to check function type at runtime.
  {
    'test.ts': `
      /** @see {isTestType} ts-auto-guard:type-guard */
      export interface TestType {
        test: (() => void)
        // ts-auto-guard-suppress function-type
        test2(someArg: number): boolean
        // some other comments
        test3: {
          (someArg: string): number
          test3Arg: number;
        }
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
              typeof typedObj["test"] === "function" &&
              typeof typedObj["test3"] === "function" &&
              typeof typedObj["test3"]["test3Arg"] === "number" &&
              typeof typedObj["test2"] === "function"
          )
      }
    `,
  }
)