import { testProcessProject } from '../generate'

testProcessProject(
  'generates tuples',
  {
    'test.ts': `
    export interface A {
      b: [number]
    }`,
  },
  {
    'test.ts': null,
    'test.guard.ts': `
    import { A } from "./test";

    export function isA(obj: unknown): obj is A {
        const typedObj = obj as A
        return (
            (typedObj !== null &&
                typeof typedObj === "object" ||
                typeof typedObj === "function") &&
            Array.isArray(typedObj["b"]) &&
            typeof typedObj["b"][0] === "number"
        )
    }`,
  },
  { options: { exportAll: true } }
)
