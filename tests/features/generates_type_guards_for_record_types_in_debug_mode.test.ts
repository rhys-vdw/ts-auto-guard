import { testProcessProject } from '../generate'

testProcessProject(
  'generates type guards for Record types in debug mode',
  {
    'test.ts': `
      /** @see {isTestType} ts-auto-guard:type-guard */
      export type TestType = Record<string, string>
      `,
  },
  {
    'test.ts': null,
    'test.guard.ts': `
      import { TestType } from "./test";
  
      function evaluate(
        isCorrect: boolean,
        varName: string,
        expected: string,
        actual: any
      ): boolean {
        if (!isCorrect) {
          console.error(
            \`\${varName} type mismatch, expected: \${expected}, found:\`,
                        actual
            )
        }
        return isCorrect
      }

      export function isTestType(obj: unknown, argumentName: string = "testType"): obj is TestType {
          const typedObj = obj as TestType
          return (
              (typedObj !== null &&
                  typeof typedObj === "object" ||
                  typeof typedObj === "function") &&
              Object.entries<any>(typedObj)
                  .every(([key, value]) => (evaluate(typeof value === "string", \`\${argumentName}["\${key.toString().replace(/"/g, '\\\\"')}"]\`, "string", value) &&
                      evaluate(typeof key === "string", \`\${argumentName} (key: "\${key.toString().replace(/"/g, '\\\\"')}")\`, "string", key)))
          )
      }
      `,
  },
  {
    options: {
      debug: true
    }
  }
)