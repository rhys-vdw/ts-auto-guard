import { testProcessProject } from '../generate'

testProcessProject(
  'generated type guards for discriminated unions',
  {
    'test.ts': `
    export type X = { type: 'a', value: number } | { type: 'b', value: string }
    `,
  },
  {
    'test.ts': null,
    'test.guard.ts': `
    import type { X } from "./test";

    export function isX(obj: unknown): obj is X {
        const typedObj = obj as X
        return (
            ((typedObj !== null &&
                  typeof typedObj === "object" ||
                  typeof typedObj === "function") &&
                typedObj["type"] === "a" &&
                typeof typedObj["value"] === "number" ||
                (typedObj !== null &&
                  typeof typedObj === "object" ||
                  typeof typedObj === "function") &&
                typedObj["type"] === "b" &&
                typeof typedObj["value"] === "string")
            )
    }`,
  },
  { options: { exportAll: true } }
)
