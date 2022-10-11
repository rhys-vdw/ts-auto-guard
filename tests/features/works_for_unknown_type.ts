import {testProcessProject} from '../generate';

testProcessProject(
  'works for unknown type',
  {
    'test.ts': `export type A = unknown`,
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