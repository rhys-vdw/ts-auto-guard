import { testProcessProject } from '../generate'

testProcessProject(
  'generated type guards for enums',
  {
    'test.ts': `
    export enum Types{
        TheGood,
        TheBad,
        TheTypeSafe
    }`,
  },
  {
    'test.ts': null,
    'test.guard.ts': `
    import type { Types } from "./test";

    export function isTypes(obj: unknown): obj is Types {
        const typedObj = obj as Types
        return (
            (typedObj === Types.TheGood ||
                typedObj === Types.TheBad ||
                typedObj === Types.TheTypeSafe)
        )
    }`,
  },
  { options: { exportAll: true } }
)
