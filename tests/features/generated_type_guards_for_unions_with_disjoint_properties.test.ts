import { testProcessProject } from '../generate'

testProcessProject(
  'generated type guards for unions with disjoint properties',
  {
    'test.ts': `
    export type X = { key1: string } | { key2: number }
    `,
  },
  {
    'test.ts': null,
    'test.guard.ts': `
    import { X } from "./test";

    export function isX(obj: unknown): obj is X {
      const typedObj = obj as X
      return (
        ((typedObj !== null &&
            typeof typedObj === "object" ||
            typeof typedObj === "function") &&
            "key1" in typedObj &&
            typeof typedObj["key1"] === "string" ||
            (typedObj !== null &&
                typeof typedObj === "object" ||
                typeof typedObj === "function") &&
            "key2" in typedObj &&
            typeof typedObj["key2"] === "number")
      )
    }`,
  },
  { options: { exportAll: true } }
)
