import { each, pull } from 'lodash'
import test from 'tape'
import { Project } from 'ts-morph'
import { minify, MinifyOptions } from 'uglify-js'
import { IProcessOptions, processProject } from '../src'

function createProject(): Project {
  return new Project({
    addFilesFromTsConfig: false,
    compilerOptions: { strict: true },
    useInMemoryFileSystem: true,
  })
}

interface ITestOptions {
  skip?: boolean
  only?: boolean
  minifyOptions?: MinifyOptions
  options?: IProcessOptions
}

function testProcessProject(
  typeDescription: string,
  input: { readonly [filename: string]: string },
  output: { readonly [filename: string]: string },
  { skip, only, options, minifyOptions }: ITestOptions = {}
) {
  const fn = skip ? test.skip : only ? test.only : test
  fn(typeDescription, t => {
    const project = createProject()
    each(input, (content, filePath) => {
      project.createSourceFile(filePath, content)
    })
    project.saveSync()

    const expectedFilenames = Object.keys(output)

    t.doesNotThrow(() => {
      processProject(project, options)
    })

    for (const sourceFile of project.getSourceFiles()) {
      if (sourceFile.isSaved()) {
        continue
      }
      const filePath = sourceFile.getFilePath().slice(1)
      const expectedRaw = output[filePath]
      if (expectedRaw === undefined) {
        t.fail(`unexpected file ${filePath}`)
      } else {
        pull(expectedFilenames, filePath)
        if (sourceFile !== undefined) {
          const expectedFile = project.createSourceFile(
            `${filePath}.expected`,
            expectedRaw
          )
          let sourceText: string
          if (minifyOptions !== undefined) {
            const emitOutput = sourceFile.getEmitOutput()
            const result = minify(
              emitOutput.getOutputFiles()[0].getText(),
              minifyOptions
            )
            t.error(result.error, 'UglifyJS should succeed')
            sourceText = result.code
          } else {
            expectedFile.formatText()
            sourceText = sourceFile.getText()
          }

          t.equal(sourceText, expectedFile.getText(), filePath)
        }
      }
    }
    for (const filePath of expectedFilenames) {
      t.fail(`${filePath} not found`)
    }
    t.end()
  })
}

testProcessProject(
  'removes existing .guard.ts files',
  { 'test.guard.ts': `alert("hello")` },
  {}
)

testProcessProject(
  'generates type guards for empty object',
  {
    'test.ts': `
    /** @see {isEmpty} ts-auto-guard:type-guard */
    export interface Empty {}`,
  },
  {
    'test.guard.ts': `
    import { Empty } from "./test";

    export function isEmpty(obj: any, _argumentName?: string): obj is Empty {
        return (
            typeof obj === "object"
        )
    }`,
  }
)

testProcessProject(
  'generates type guards for empty object if exportAll is true',
  {
    'test.ts': `
    export interface Empty {}`,
  },
  {
    'test.guard.ts': `
    import { Empty } from "./test";

    export function isEmpty(obj: any, _argumentName?: string): obj is Empty {
        return (
            typeof obj === "object"
        )
    }`,
  },
  { options: { exportAll: true, debug: false } }
)

testProcessProject(
  'generates type guards for boolean',
  {
    'test.ts': `
    /** @see {isBool} ts-auto-guard:type-guard */
    export type Bool = boolean`,
  },
  {
    'test.guard.ts': `
    import { Bool } from "./test";

    export function isBool(obj: any, _argumentName?: string): obj is Bool {
        return (
            typeof obj === "boolean"
        )
    }`,
  }
)

testProcessProject(
  'generates type guards for simple interface',
  {
    'test.ts': `
    /** @see {isFoo} ts-auto-guard:type-guard */
    export interface Foo {
      foo: number,
      bar: string
    }`,
  },
  {
    'test.guard.ts': `
    import { Foo } from "./test";

    export function isFoo(obj: any, _argumentName?: string): obj is Foo {
        return (
            typeof obj === "object" &&
            typeof obj.foo === "number" &&
            typeof obj.bar === "string"
        )
    }`,
  }
)

testProcessProject(
  'correctly handles default export',
  {
    'test.ts': `
    /** @see {isFoo} ts-auto-guard:type-guard */
    interface Foo {
      foo: number,
      bar: string
    }

    export default Foo`,
  },
  {
    'test.guard.ts': `
    import Foo from "./test";

    export function isFoo(obj: any, _argumentName?: string): obj is Foo {
        return (
            typeof obj === "object" &&
            typeof obj.foo === "number" &&
            typeof obj.bar === "string"
        )
    }`,
  }
)

testProcessProject(
  'generates type guards for interface with optional field',
  {
    'test.ts': `
    /** @see {isFoo} ts-auto-guard:type-guard */
    export interface Foo {
      foo?: number,
      bar: number | undefined,
      baz?: number | undefined
    }`,
  },
  {
    'test.guard.ts': `
    import { Foo } from "./test";

    export function isFoo(obj: any, _argumentName?: string): obj is Foo {
        return (
            typeof obj === "object" &&
            (
              typeof obj.foo === "undefined" ||
              typeof obj.foo === "number"
            ) &&
            (
              typeof obj.bar === "undefined" ||
              typeof obj.bar === "number"
            ) &&
            (
              typeof obj.baz === "undefined" ||
              typeof obj.baz === "number"
            )
        )
    }`,
  }
)

testProcessProject(
  'generates type guards for nested interface',
  {
    'test.ts': `
    interface Bar {
      bar: number
    }

    /** @see {isFoo} ts-auto-guard:type-guard */
    export interface Foo {
      foo: Bar,
    }`,
  },
  {
    'test.guard.ts': `
    import { Foo } from "./test";

    export function isFoo(obj: any, _argumentName?: string): obj is Foo {
        return (
            typeof obj === "object" &&
            typeof obj.foo === "object" &&
            typeof obj.foo.bar === "number"
        )
    }`,
  }
)

testProcessProject(
  'generates type guards for nested interface with type guard',
  {
    'test.ts': `
    /** @see {isBar} ts-auto-guard:type-guard */
    export interface Bar {
      bar: number
    }

    /** @see {isFoo} ts-auto-guard:type-guard */
    export interface Foo {
      foo: Bar,
    }`,
  },
  {
    'test.guard.ts': `
    import { Bar, Foo } from "./test";

    export function isBar(obj: any, _argumentName?: string): obj is Bar {
        return (
            typeof obj === "object" &&
            typeof obj.bar === "number"
        )
    }

    export function isFoo(obj: any, _argumentName?: string): obj is Foo {
        return (
            typeof obj === "object" &&
            isBar(obj.foo) as boolean
        )
    }`,
  }
)

testProcessProject(
  'generates type guards for interface extending other interface',
  {
    'test.ts': `
    interface Bar {
      bar: number
    }

    /** @see {isFoo} ts-auto-guard:type-guard */
    export interface Foo extends Bar {
      foo: number,
    }`,
  },
  {
    'test.guard.ts': `
    import { Foo } from "./test";

    export function isFoo(obj: any, _argumentName?: string): obj is Foo {
        return (
            typeof obj === "object" &&
            typeof obj.bar === "number" &&
            typeof obj.foo === "number"
        )
    }`,
  }
)

testProcessProject(
  'generates type guards for interface extending other interface with type guard',
  {
    'test.ts': `
    /** @see {isBar} ts-auto-guard:type-guard */
    export interface Bar {
      bar: number
    }

    /** @see {isFoo} ts-auto-guard:type-guard */
    export interface Foo extends Bar {
      foo: number
    }`,
  },
  {
    'test.guard.ts': `
    import { Bar, Foo } from "./test";

    export function isBar(obj: any, _argumentName?: string): obj is Bar {
        return (
            typeof obj === "object" &&
            typeof obj.bar === "number"
        )
    }

    export function isFoo(obj: any, _argumentName?: string): obj is Foo {
        return (
            isBar(obj) as boolean &&
            typeof obj.foo === "number"
        )
    }`,
  }
)

testProcessProject(
  'generates type guards for interface extending object type',
  {
    'test.ts': `
    export type Bar = {
      bar: number
    }

    /** @see {isFoo} ts-auto-guard:type-guard */
    export interface Foo extends Bar {
      foo: number
    }`,
  },
  {
    'test.guard.ts': `
    import { Foo } from "./test";

    export function isFoo(obj: any, _argumentName?: string): obj is Foo {
        return (
            typeof obj === "object" &&
            typeof obj.bar === "number" &&
            typeof obj.foo === "number"
        )
    }`,
  }
)

testProcessProject(
  'generates type guards for interface extending object type with type guard',
  {
    'test.ts': `
    /** @see {isBar} ts-auto-guard:type-guard */
    export type Bar = {
      bar: number
    }

    /** @see {isFoo} ts-auto-guard:type-guard */
    export interface Foo extends Bar {
      foo: number
    }`,
  },
  {
    'test.guard.ts': `
    import { Bar, Foo } from "./test";

    export function isBar(obj: any, _argumentName?: string): obj is Bar {
        return (
            typeof obj === "object" &&
            typeof obj.bar === "number"
        )
    }

    export function isFoo(obj: any, _argumentName?: string): obj is Foo {
        return (
            isBar(obj) as boolean &&
            typeof obj.foo === "number"
        )
    }`,
  }
)

testProcessProject(
  'generates type guards for an object literal type',
  {
    'test.ts': `
    /** @see {isFoo} ts-auto-guard:type-guard */
    export type Foo = {
      foo: number
    }`,
  },
  {
    'test.guard.ts': `
    import { Foo } from "./test";

    export function isFoo(obj: any, _argumentName?: string): obj is Foo {
        return (
            typeof obj === "object" &&
            typeof obj.foo === "number"
        )
    }`,
  }
)

testProcessProject(
  'generates type guards with a short circuit',
  {
    'test.ts': `
    /** @see {isFoo} ts-auto-guard:type-guard */
    export type Foo = {
      foo: number
    }`,
  },
  {
    'test.guard.ts': `
    import { Foo } from "./test";

    export function isFoo(obj: any, _argumentName?: string): obj is Foo {
        if (DEBUG) return true
        return (
            typeof obj === "object" &&
            typeof obj.foo === "number"
        )
    }`,
  },
  {
    options: { shortCircuitCondition: 'DEBUG', debug: false },
  }
)

testProcessProject(
  'generated type guards with a short circuit are correctly stripped by UglifyJS',
  {
    'test.ts': `
    /** @see {isFoo} ts-auto-guard:type-guard */
    export type Foo = {
      foo: number,
      bar: Foo | string | () => void,
      baz: "foo" | "bar"
    }`,
  },
  {
    'test.guard.ts': `"use strict";function isFoo(o,s){return!0}exports.__esModule=!0,exports.isFoo=void 0,exports.isFoo=isFoo;`,
  },
  {
    minifyOptions: {
      compress: { global_defs: { DEBUG: true } },
    },
    options: { shortCircuitCondition: 'DEBUG', debug: false },
  }
)
