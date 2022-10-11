import {testProcessProject} from '../generate';

testProcessProject(
  'skips checking any type in array',
  {
    'test.ts': `export type A = any[]`,
  },
  {
    'test.ts': null,
    'test.guard.ts': `
    import { A } from "./test";

    export function isA(obj: unknown): obj is A {
        const typedObj = obj as A
        return (
          Array.isArray(typedObj)
        )
    }`,
  },
  { options: { exportAll: true } }
)