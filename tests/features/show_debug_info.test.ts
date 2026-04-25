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
    import { Foo, Bar } from "./test";

    let __evaluateBuffer: Array<unknown[]> | null = null
    function evaluate(isCorrect: boolean, varName: string, expected: string, actual: any): boolean {
      if (!isCorrect) {
        const args: unknown[] = [\`\${varName} type mismatch, expected: \${expected}, found:\`, actual]
        __evaluateBuffer ? __evaluateBuffer.push(args) : console.error(...args)
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
          evaluate(isBar(typedObj["bar"], \`\${argumentName}["bar"]\`) as boolean, \`\${argumentName}["bar"]\`, "import(\\"/foo/bar/test\\").Bar", typedObj["bar"]) &&
          evaluate(Array.isArray(typedObj["bars"]) &&
            typedObj["bars"].every((e: any, i0: number) =>
              isBar(e, \`\${argumentName}["bars"][\${i0}]\`) as boolean
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
