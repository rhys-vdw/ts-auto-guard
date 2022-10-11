import {testProcessProject} from '../generate';

testProcessProject(
  'generated type guards for nested arrays',
  {
    'test.ts': `
      export type Foo = {
        value: Array<{
          value: Array<number>
        }>
      }
      `,
  },
  {
    'test.ts': null,
    'test.guard.ts': `
        import { Foo } from "./test";

        export function isFoo(obj: unknown): obj is Foo {
            const typedObj = obj as Foo
            return (
                (typedObj !== null &&
                    typeof typedObj === "object" ||
                    typeof typedObj === "function") &&
                Array.isArray(typedObj["value"]) &&
                typedObj["value"].every((e: any) =>
                    (e !== null &&
                        typeof e === "object" ||
                        typeof e === "function") &&
                    Array.isArray(e["value"]) &&
                    e["value"].every((e: any) =>
                        typeof e === "number"
                    )
                )
            )
        }`,
  },
  { options: { exportAll: true } }
)