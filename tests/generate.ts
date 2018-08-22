// tslint:disable-next-line:no-implicit-dependencies
import test from 'tape'
import Project from 'ts-simple-ast'
import { generateProject } from '../src'

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

function testGuard(
  typeDescription: string,
  input: string,
  output: string,
  { skip }: { skip: boolean } = { skip: false }
) {
  ;(skip ? test.skip : test)(
    `generates type guard for ${typeDescription}`,
    t => {
      const project = createProject()

      project.createSourceFile('./test.ts', input)
      t.doesNotThrow(() => {
        generateProject(project)
        const guardFile = project.getSourceFile('./test.guard.ts')
        t.ok(guardFile, 'no guard file emitted')
        if (guardFile !== undefined) {
          const result = guardFile.getText()
          t.equal(ws(result), ws(output))
        }
      })
      t.end()
    }
  )
}

testGuard(
  'empty object',
  `
  /** @see {isEmpty} ts-auto-guard:type-guard */
  export interface Empty {}`,
  `
  import { Empty } from "./test";

   export function isEmpty(obj: any): obj is Empty {
      return (
          typeof obj === "object"
      )
  }`
)

testGuard(
  'boolean',
  `
  /** @see {isBool} ts-auto-guard:type-guard */
  export type Bool = boolean`,
  `
  import { Bool } from "./test";

  export function isBool(obj: any): obj is Bool {
      return (
          typeof obj === "boolean"
      )
  }`
)

testGuard(
  'simple interface',
  `
  /** @see {isFoo} ts-auto-guard:type-guard */
  export interface Foo {
    foo: number,
    bar: string
  }`,
  `
  import { Foo } from "./test";

  export function isFoo(obj: any): obj is Foo {
      return (
          typeof obj === "object" &&
          typeof obj.foo === "number" &&
          typeof obj.bar === "string"
      )
  }`
)

testGuard(
  'interface with optional field',
  `
  /** @see {isFoo} ts-auto-guard:type-guard */
  export interface Foo {
    foo?: number,
    bar: number | undefined,
    baz?: number | undefined
  }`,
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
)

testGuard(
  'nested interface',
  `
  interface Bar {
    bar: number
  }

  /** @see {isFoo} ts-auto-guard:type-guard */
  export interface Foo {
    foo: Bar,
  }`,
  `
  import { Foo } from "./test";

  export function isFoo(obj: any): obj is Foo {
      return (
          typeof obj === "object" &&
          typeof obj.foo === "object" &&
          typeof obj.foo.bar === "number"
      )
  }`
)

testGuard(
  'nested interface with type guard',
  `
  /** @see {isBar} ts-auto-guard:type-guard */
  interface Bar {
    bar: number
  }

  /** @see {isFoo} ts-auto-guard:type-guard */
  export interface Foo {
    foo: Bar,
  }`,
  `
  import { Foo } from "./test";

  export function isFoo(obj: any): obj is Foo {
      return (
          typeof obj === "object" &&
          isBar(obj.foo) as boolean
      )
  }`,
  { skip: true }
)
