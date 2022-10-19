import { testProcessProject } from '../generate'

testProcessProject(
  'generates type guards for string literals',
  {
    'test.ts': `
    /** @see {isEmail} ts-auto-guard:type-guard */
    export type Email = \`\${string}@\${string}.\${string}\``,
  },
  {
    'test.ts': null,
    'test.guard.ts': `
    import { Email } from "./test";

    export function isEmail(obj: any, _argumentName?: string): obj is Email {
    return (
        typeof obj === "string" && /.*@.*\\..*/.test('a@b.c')
    )
}`,
  }
)
