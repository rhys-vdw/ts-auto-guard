import {testProcessProject} from '../generate';

testProcessProject(
  'generates type guards for JSDoc @see with @link tag',
  {
    'test.ts': `
    /** @see {@link isBool} ts-auto-guard:type-guard */
    export type Bool = boolean`,
  },
  {
    'test.ts': null,
    'test.guard.ts': `
    import { Bool } from "./test";

    export function isBool(obj: unknown): obj is Bool {
        const typedObj = obj as Bool
        return (
            typeof typedObj === "boolean"
        )
    }`,
  }
)