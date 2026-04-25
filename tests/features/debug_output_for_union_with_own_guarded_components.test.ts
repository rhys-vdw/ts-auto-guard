import test from 'tape'
import { Project } from 'ts-morph'
import { processProject } from '../../src'

test('debug output is not printed when a union of own-guarded components matches', t => {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      strict: true,
      target: 8 /* ES2021 */,
      module: 1 /* CommonJS */,
      esModuleInterop: true,
    },
    useInMemoryFileSystem: true,
  })

  project.createSourceFile(
    'test.ts',
    `
      /** @see {isFoo} ts-auto-guard:type-guard */
      export interface Foo {
        kind: 'foo'
        foo: number
      }

      /** @see {isBar} ts-auto-guard:type-guard */
      export interface Bar {
        kind: 'bar'
        bar: string
      }

      /** @see {isFooOrBar} ts-auto-guard:type-guard */
      export type FooOrBar = Foo | Bar
      `
  )

  processProject(project, { debug: true })

  const guardFile = project.getSourceFileOrThrow('test.guard.ts')
  const emittedJs = guardFile.getEmitOutput().getOutputFiles()[0].getText()

  const moduleObj: { exports: Record<string, unknown> } = { exports: {} }
  // Stub require: the imports from "./test" are type-only and erased.
  const requireStub = () => ({})
  new Function('exports', 'require', 'module', emittedJs)(
    moduleObj.exports,
    requireStub,
    moduleObj
  )

  const isFooOrBar = moduleObj.exports.isFooOrBar as (obj: unknown) => boolean

  const errors: unknown[][] = []
  const originalError = console.error
  console.error = (...args: unknown[]) => {
    errors.push(args)
  }
  try {
    const validBar: unknown = { kind: 'bar', bar: 'hello' }
    t.true(
      isFooOrBar(validBar),
      'isFooOrBar should return true for a valid Bar'
    )
    t.deepEqual(
      errors.splice(0),
      [],
      'no console.error output when isFooOrBar returns true for a Bar'
    )

    const validFoo: unknown = { kind: 'foo', foo: 42 }
    t.true(
      isFooOrBar(validFoo),
      'isFooOrBar should return true for a valid Foo'
    )
    t.deepEqual(
      errors.splice(0),
      [],
      'no console.error output when isFooOrBar returns true for a Foo'
    )
  } finally {
    console.error = originalError
  }
  t.end()
})

test('debug output is printed when a union of own-guarded components does not match', t => {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      strict: true,
      target: 8 /* ES2021 */,
      module: 1 /* CommonJS */,
      esModuleInterop: true,
    },
    useInMemoryFileSystem: true,
  })

  project.createSourceFile(
    'test.ts',
    `
      /** @see {isFoo} ts-auto-guard:type-guard */
      export interface Foo {
        kind: 'foo'
        foo: number
      }

      /** @see {isBar} ts-auto-guard:type-guard */
      export interface Bar {
        kind: 'bar'
        bar: string
      }

      /** @see {isFooOrBar} ts-auto-guard:type-guard */
      export type FooOrBar = Foo | Bar
      `
  )

  processProject(project, { debug: true })

  const guardFile = project.getSourceFileOrThrow('test.guard.ts')
  const emittedJs = guardFile.getEmitOutput().getOutputFiles()[0].getText()

  const moduleObj: { exports: Record<string, unknown> } = { exports: {} }
  const requireStub = () => ({})
  new Function('exports', 'require', 'module', emittedJs)(
    moduleObj.exports,
    requireStub,
    moduleObj
  )

  const isFooOrBar = moduleObj.exports.isFooOrBar as (obj: unknown) => boolean

  const errors: unknown[][] = []
  const originalError = console.error
  console.error = (...args: unknown[]) => {
    errors.push(args)
  }
  try {
    const notFooOrBar: unknown = { kind: 'baz', baz: true }
    t.false(
      isFooOrBar(notFooOrBar),
      'isFooOrBar should return false for a value matching neither branch'
    )
    const flat = errors.map(args =>
      args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
    )
    t.ok(
      flat.some(s => s.includes('"foo"')),
      'should surface the Foo branch failure (kind !== "foo")'
    )
    t.ok(
      flat.some(s => s.includes('"bar"')),
      'should surface the Bar branch failure (kind !== "bar")'
    )
    t.ok(
      flat.some(s => s.includes('Foo') && s.includes('Bar') && s.includes('|')),
      'should surface the union-level summary'
    )
  } finally {
    console.error = originalError
  }
  t.end()
})
