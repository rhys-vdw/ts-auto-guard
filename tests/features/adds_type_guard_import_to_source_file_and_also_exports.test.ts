import { testProcessProject } from '../generate'

testProcessProject(
  'adds type guard import to source file and also exports',
  {
    // NOTE: This file is not automatically cleaned up with `formatText` after
    // being modified so it requires this funky indentation to ensure that it is
    // conforms to ts-morph's formatting.
    'test.ts': `
/** @see {isEmpty} ts-auto-guard:type-guard */
export interface Empty { }
`,
  },
  {
    'test.ts': `
    import * as CustomGuardAlias from "./test.guard";

    /** @see {isEmpty} ts-auto-guard:type-guard */
    export interface Empty {}
    export { CustomGuardAlias };`,
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
  { options: { importGuards: 'CustomGuardAlias' } }
)
