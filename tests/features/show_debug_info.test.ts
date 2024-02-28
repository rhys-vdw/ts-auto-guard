import { testProcessProject } from '../generate'

testProcessProject(
  'show debug info',
  {
    [`foo/bar/test.ts`]: `
    /** @see {isFoo} ts-auto-guard:type-guard */
    export interface Foo {
      foo: number,
      bar: Bar,
      bars: Array<Bar>
    }

    /** @see {isBar} ts-auto-guard:type-guard */
    export interface Bar {
      bar: number,
    }

    `,
  },
  {
    [`foo/bar/test.ts`]: null,
    [`foo/bar/test.guard.ts`]: `
    import type { Foo, Bar } from "./test";

    function evaluate(
      isCorrect: boolean,
      varName: string,
      expected: string,
      actual: any
    ): boolean {
      if (!isCorrect) {
        console.error(
          \`\${varName} type mismatch, expected: \${expected}, found:\`,
                      actual
          )
      }
      return isCorrect
    }

    export function isFoo(obj: unknown, argumentName: string = "foo"): obj is Foo {
      const typedObj = obj as Foo
      return (
        (typedObj !== null &&
          typeof typedObj === "object" ||
          typeof typedObj === "function") &&
          evaluate(typeof typedObj["foo"] === "number", \`\${argumentName}["foo"]\`, "number", typedObj["foo"]) &&
          evaluate(isBar(typedObj["bar"]) as boolean, \`\${argumentName}["bar"]\`, "import(\\"/foo/bar/test\\").Bar", typedObj["bar"]) &&
          evaluate(Array.isArray(typedObj["bars"]) &&
            typedObj["bars"].every((e: any) =>
              isBar(e) as boolean
            ), \`\${argumentName}["bars"]\`, "import(\\"/foo/bar/test\\").Bar[]", typedObj["bars"])
        )
    }

    export function isBar(obj: unknown, argumentName: string = "bar"): obj is Bar {
      const typedObj = obj as Bar
      return (
        (typedObj !== null &&
          typeof typedObj === "object" ||
          typeof typedObj === "function") &&
          evaluate(typeof typedObj["bar"] === "number", \`\${argumentName}["bar"]\`, "number", typedObj["bar"])
        )
    }
    `,
  },
  {
    options: {
      debug: true,
    },
  }
)
