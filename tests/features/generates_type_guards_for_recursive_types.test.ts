import { testProcessProject } from '../generate'

testProcessProject(
  'generates type guards for recursive types',
  {
    'test.ts': `
   /** @see {isBranch1} ts-auto-guard:type-guard */
   export type Branch1 = Branch1[] | string;

   /** @see {isBranch2} ts-auto-guard:type-guard */
   export type Branch2 = { branches: Branch2[] } | string;

   /** @see {isBranch3} ts-auto-guard:type-guard */
   export type Branch3 = { branches: Branch3[] } | {branches: Branch3 }[] | string;
    `,
  },
  {
    'test.ts': null,
    'test.guard.ts': `
    import type { Branch1, Branch2, Branch3 } from "./test";

    export function isBranch1(obj: unknown): obj is Branch1 {
        const typedObj = obj as Branch1
        return (
            (typeof typedObj === "string" ||
                Array.isArray(typedObj) &&
                typedObj.every((e: any) =>
                    isBranch1(e) as boolean
                ))
        )
    }

    export function isBranch2(obj: unknown): obj is Branch2 {
        const typedObj = obj as Branch2
        return (
            (typeof typedObj === "string" ||
            (typedObj !== null &&
                  typeof typedObj === "object" ||
                  typeof typedObj === "function") &&
                Array.isArray(typedObj["branches"]) &&
                typedObj["branches"].every((e: any) =>
                    isBranch2(e) as boolean
                ))
        )
    }

    export function isBranch3(obj: unknown): obj is Branch3 {
        const typedObj = obj as Branch3
        return (
            (typeof typedObj === "string" ||
                (typedObj !== null &&
                  typeof typedObj === "object" ||
                  typeof typedObj === "function") &&
                Array.isArray(typedObj["branches"]) &&
                typedObj["branches"].every((e: any) =>
                    isBranch3(e) as boolean
                ) ||
                Array.isArray(typedObj) &&
                typedObj.every((e: any) =>
                    (e !== null &&
                      typeof e === "object" ||
                      typeof e === "function")  &&
                    isBranch3(e["branches"]) as boolean
                ))
        )
    }`,
  }
)
