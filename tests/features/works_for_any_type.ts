import {testProcessProject} from '../generate';

testProcessProject(
  'works for any type',
  {
    'test.ts': `export type A = any`,
  },
  {
    'test.ts': null,
    'test.guard.ts': `
    import { A } from "./test";

    export function isA(obj: unknown): obj is A {
        const typedObj = obj as A
        return (
          true
        )
    }`,
  },
  { options: { exportAll: true } }
)