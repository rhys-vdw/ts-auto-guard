import {testProcessProject} from '../generate';

testProcessProject(
  'generated type guards for intersection type',
  {
    'test.ts': `
    export type X = { foo: number } & { bar: string }
    `,
  },
  {
    'test.ts': null,
    'test.guard.ts': `
    import { X } from "./test";

    export function isX(obj: unknown): obj is X {
        const typedObj = obj as X
        return (
            (typedObj !== null &&
                  typeof typedObj === "object" ||
                  typeof typedObj === "function") &&
                typeof typedObj["foo"] === "number" &&
                (typedObj !== null &&
                  typeof typedObj === "object" ||
                  typeof typedObj === "function") &&
                typeof typedObj["bar"] === "string"
            )
    }`,
  },
  { options: { exportAll: true } }
)