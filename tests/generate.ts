import { each, pull } from "lodash"
import test from 'tape' // tslint:disable-line:no-implicit-dependencies
import Project from 'ts-simple-ast'
import { processProject } from '../src'

function ws(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function createProject(): Project {
  return new Project({
    addFilesFromTsConfig: false,
    compilerOptions: { strict: true },
    useVirtualFileSystem: true,
  })
}

function testProcessProject(
  typeDescription: string,
  input: { readonly [filename: string]: string },
  output: { readonly [filename: string]: string },
  { skip, only }: { skip?: boolean, only?: boolean } = {}
) {
  const fn = skip ? test.skip : only ? test.only : test
  fn(
    typeDescription,
    t => {
      const project = createProject()
      each(input, (content, filePath) => {
        project.createSourceFile(filePath, content)
      })
      project.saveSync()

      const expectedFilenames = Object.keys(output)

      t.doesNotThrow(() => {
        processProject(project)
      })

      for (const sourceFile of project.getSourceFiles()) {
        if (sourceFile.isSaved()) {
          continue
        }
        const filePath = sourceFile.getFilePath().slice(1)
        const content = output[filePath]
        if (content === undefined) {
          t.fail(`unexpected file ${filePath}`)
        } else {
          pull(expectedFilenames, filePath)
          if (sourceFile !== undefined) {
            const result = sourceFile.getText()
            t.equal(ws(result), ws(content), filePath)
          }
        }
      }
      for (const filePath of expectedFilenames) {
        t.fail(`${filePath} not found`)
      }
      t.end()
    }
  )
}

testProcessProject(
  'removes existing .guard.ts files',
  { 'test.guard.ts': `alert("hello")` },
  { }
)

testProcessProject(
  'generates type guards for empty object',
  { 'test.ts':
    `
    /** @see {isEmpty} ts-auto-guard:type-guard */
    export interface Empty {}`,
  },
  { 'test.guard.ts':
    `
    import { Empty } from "./test";

    export function isEmpty(obj: any): obj is Empty {
        return (
            typeof obj === "object"
        )
    }`
  }
)

testProcessProject(
  'generates type guards for boolean',
  { 'test.ts':
    `
    /** @see {isBool} ts-auto-guard:type-guard */
    export type Bool = boolean`,
  },
  { 'test.guard.ts':
    `
    import { Bool } from "./test";

    export function isBool(obj: any): obj is Bool {
        return (
            typeof obj === "boolean"
        )
    }`
  }
)

testProcessProject(
  'generates type guards for simple interface',
  { 'test.ts':
    `
    /** @see {isFoo} ts-auto-guard:type-guard */
    export interface Foo {
      foo: number,
      bar: string
    }`
  },
  { 'test.guard.ts':
    `
    import { Foo } from "./test";

    export function isFoo(obj: any): obj is Foo {
        return (
            typeof obj === "object" &&
            typeof obj.foo === "number" &&
            typeof obj.bar === "string"
        )
    }`
  }
)

testProcessProject(
  'generates type guards for interface with optional field',
  { 'test.ts':
    `
    /** @see {isFoo} ts-auto-guard:type-guard */
    export interface Foo {
      foo?: number,
      bar: number | undefined,
      baz?: number | undefined
    }`
  },
  { 'test.guard.ts':
    `
    import { Foo } from "./test";

    export function isFoo(obj: any): obj is Foo {
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
    }`
  }
)

testProcessProject(
  'generates type guards for nested interface',
  { 'test.ts':
    `
    interface Bar {
      bar: number
    }

    /** @see {isFoo} ts-auto-guard:type-guard */
    export interface Foo {
      foo: Bar,
    }`,
  },
  { 'test.guard.ts':
    `
    import { Foo } from "./test";

    export function isFoo(obj: any): obj is Foo {
        return (
            typeof obj === "object" &&
            typeof obj.foo === "object" &&
            typeof obj.foo.bar === "number"
        )
    }`
  }
)

testProcessProject(
  'generates type guards for nested interface with type guard',
  { 'test.ts':
    `
    /** @see {isBar} ts-auto-guard:type-guard */
    export interface Bar {
      bar: number
    }

    /** @see {isFoo} ts-auto-guard:type-guard */
    export interface Foo {
      foo: Bar,
    }`
  },
  { 'test.guard.ts':
    `
    import { Bar, Foo } from "./test";

    export function isBar(obj: any): obj is Bar {
        return (
            typeof obj === "object" &&
            typeof obj.bar === "number"
        )
    }

    export function isFoo(obj: any): obj is Foo {
        return (
            typeof obj === "object" &&
            isBar(obj.foo) as boolean
        )
    }`
  }
)
