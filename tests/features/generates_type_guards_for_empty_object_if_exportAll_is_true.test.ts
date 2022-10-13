import { testProcessProject } from '../generate'

testProcessProject(
  'generates type guards for empty object if exportAll is true',
  {
    'test.ts': `
    export interface Empty {}`,
  },
  {
    'test.ts': null,
    'test.guard.ts': `
    import type { Empty } from "./test";

    export function isEmpty(obj: unknown): obj is Empty {
        const typedObj = obj as Empty
        return (
            (typedObj !== null &&
              typeof typedObj === "object" ||
              typeof typedObj === "function")
        )
    }`,
  },
  { options: { exportAll: true, debug: false } }
)
