import { testProcessProject } from '../generate'

testProcessProject(
  'guards should only be generated for types that are declared, exported, and annotated in the current file',
  {
    'custom.ts': `
    /** @see {isColor} ts-auto-guard:type-guard */
    export type Color = 'red' | 'blue' | 'green'`,
    'index.ts': `
    export { Color } from './custom'`,
  },
  {
    'custom.ts': null,
    'index.ts': null,
    'custom.guard.ts': `
    /*
    * Generated type guards for "custom.ts".
    * WARNING: Do not manually change this file.
    */
    import { Color } from "./custom";

    export function isColor(obj: unknown): obj is Color {
        const typedObj = obj as Color
        return (
            (typedObj === "red" ||
                typedObj === "blue" ||
                typedObj === "green")
        )
    }`,
  }
)

testProcessProject(
  'in exportAll mode, guards should only be generated for types that are declared and exported in the current file',
  {
    'custom.ts': `
    export type Color = 'red' | 'blue' | 'green'`,
    'index.ts': `
    export { Color } from './custom'`,
  },
  {
    'custom.ts': null,
    'index.ts': null,
    'custom.guard.ts': `
    /*
    * Generated type guards for "custom.ts".
    * WARNING: Do not manually change this file.
    */
    import { Color } from "./custom";

    export function isColor(obj: unknown): obj is Color {
        const typedObj = obj as Color
        return (
            (typedObj === "red" ||
                typedObj === "blue" ||
                typedObj === "green")
        )
    }`,
  },
  { options: { exportAll: true } }
)
