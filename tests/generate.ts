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

        const expectedText = expectedFile.getText()
        t.equal(sourceText, expectedText, filePath)
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
              (obj !== null &&
              typeof obj === "object" ||
              typeof obj === "function")
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
            (obj !== null &&
              typeof obj === "object" ||
              typeof obj === "function")
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
            (obj !== null && 
            typeof obj === "object" ||
            typeof obj === "function") &&
            typeof obj.foo === "number" &&
            typeof obj.bar === "string"
        )
    }`,
  }
)

testProcessProject(
  'generates type guards for properties with spaces',
  {
    'test.ts': `
    /** @see {isFoo} ts-auto-guard:type-guard */
    export interface Foo {
      "foo 1": number,
      "bar 2": string
    }`,
  },
  {
    'test.guard.ts': `
    import { Foo } from "./test";

    export function isFoo(obj: any, _argumentName?: string): obj is Foo {
        return (
            (obj !== null && 
            typeof obj === "object" ||
            typeof obj === "function") &&
            typeof obj["foo 1"] === "number" &&
            typeof obj["bar 2"] === "string"
        )
    }`,
  }
)

testProcessProject(
  'generates type guards for properties with spaces in types instead of interfaces',
  {
    'test.ts': `
    /** @see {isFoo} ts-auto-guard:type-guard */
    export type Foo = {
      "foo 1": number,
      "bar 2": string
    }`,
  },
  {
    'test.guard.ts': `
    import { Foo } from "./test";

    export function isFoo(obj: any, _argumentName?: string): obj is Foo {
        return (
            (obj !== null && 
            typeof obj === "object" ||
            typeof obj === "function") &&
            typeof obj["foo 1"] === "number" &&
            typeof obj["bar 2"] === "string"
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
            (obj !== null &&
              typeof obj === "object" ||
              typeof obj === "function") &&
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
            (obj !== null &&
              typeof obj === "object" ||
              typeof obj === "function") &&
            ( typeof obj.foo === "undefined" ||
              typeof obj.foo === "number" ) &&
            ( typeof obj.bar === "undefined" ||
              typeof obj.bar === "number" ) &&
            ( typeof obj.baz === "undefined" ||
              typeof obj.baz === "number" )
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
            (obj !== null &&
              typeof obj === "object" ||
              typeof obj === "function") &&
            (obj.foo !== null &&
              typeof obj.foo === "object" ||
              typeof obj.foo === "function") &&
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
            (obj !== null &&
              typeof obj === "object" ||
              typeof obj === "function") &&
            typeof obj.bar === "number"
        )
    }

    export function isFoo(obj: any, _argumentName?: string): obj is Foo {
        return (
            (obj !== null &&
              typeof obj === "object" ||
              typeof obj === "function") &&
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
            (obj !== null &&
              typeof obj === "object" ||
              typeof obj === "function") &&
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
            (obj !== null &&
              typeof obj === "object" ||
              typeof obj === "function") &&
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
            (obj !== null &&
              typeof obj === "object" ||
              typeof obj === "function") &&
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
            (obj !== null &&
              typeof obj === "object" ||
              typeof obj === "function") &&
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
            (obj !== null &&
              typeof obj === "object" ||
              typeof obj === "function") &&
            typeof obj.foo === "number"
        )
    }`,
  }
)

testProcessProject(
  'generates type guards for a Pick<> type',
  {
    'test.ts': `
    interface Bar {
      foo: number,
      bar: number
    }

    /** @see {isFoo} ts-auto-guard:type-guard */
    export type Foo = Pick<Bar, "foo">`,
  },
  {
    'test.guard.ts': `
    import { Foo } from "./test";

    export function isFoo(obj: any, _argumentName?: string): obj is Foo {
        return (
            (obj !== null &&
              typeof obj === "object" ||
              typeof obj === "function") &&
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
            (obj !== null &&
              typeof obj === "object" ||
              typeof obj === "function") &&
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

testProcessProject(
  'generates type guards for mapped types',
  {
    'test.ts': `
    /** @see {isPropertyValueType} ts-auto-guard:type-guard */
    export type PropertyValueType = {value: string};
    
    /** @see {isPropertyName} ts-auto-guard:type-guard */
    export type PropertyName = 'name' | 'value'; 
    
    /** @see {isFoo} ts-auto-guard:type-guard */
    export type Foo = {
      [key in PropertyName]: PropertyValueType
    }`,
  },
  {
    'test.guard.ts': `
     import { PropertyValueType, PropertyName, Foo } from "./test";
    
     export function isPropertyValueType(obj: any, _argumentName?: string): obj is PropertyValueType {
        return (
            (obj !== null &&
              typeof obj === "object" ||
              typeof obj === "function") &&
          typeof obj.value === "string"
          )
      }
      
     export function isPropertyName(obj: any, _argumentName?: string): obj is PropertyName {
       return (
         (obj === "name" ||
           obj === "value")
       )
     }
      
     export function isFoo(obj: any, _argumentName?: string): obj is Foo {
       return (
         (obj !== null &&
              typeof obj === "object" ||
              typeof obj === "function") &&
         isPropertyValueType(obj.name) as boolean && 
         isPropertyValueType(obj.value) as boolean
       )
     }
    `,
  }
)

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
    'test.guard.ts': `
    import { Branch1, Branch2, Branch3 } from "./test";
    
    export function isBranch1(obj: any, _argumentName?: string): obj is Branch1 {
        return (
            (typeof obj === "string" ||
                Array.isArray(obj) &&
                obj.every((e: any) =>
                    isBranch1(e) as boolean
                ))
        )
    }
    
    export function isBranch2(obj: any, _argumentName?: string): obj is Branch2 {
        return (
            (typeof obj === "string" ||
            (obj !== null &&
                  typeof obj === "object" ||
                  typeof obj === "function") &&
                Array.isArray(obj.branches) &&
                obj.branches.every((e: any) =>
                    isBranch2(e) as boolean
                ))
        )
    }
    
    export function isBranch3(obj: any, _argumentName?: string): obj is Branch3 {
        return (
            (typeof obj === "string" ||
                (obj !== null &&
                  typeof obj === "object" ||
                  typeof obj === "function") &&
                Array.isArray(obj.branches) &&
                obj.branches.every((e: any) =>
                    isBranch3(e) as boolean
                ) ||
                Array.isArray(obj) &&
                obj.every((e: any) =>
                    (e !== null &&
                      typeof e === "object" ||
                      typeof e === "function")  &&
                    isBranch3(e.branches) as boolean
                ))
        )
    }`,
  }
)

testProcessProject(
  'generated type guards for discriminated unions',
  {
    'test.ts': `
    export type X = { type: 'a', value: number } | { type: 'b', value: string }
    `,
  },
  {
    'test.guard.ts': `
    import { X } from "./test";

    export function isX(obj: any, _argumentName?: string): obj is X {
        return (
            ((obj !== null &&
                  typeof obj === "object" ||
                  typeof obj === "function") &&
                obj.type === "a" &&
                typeof obj.value === "number" ||
                (obj !== null &&
                  typeof obj === "object" ||
                  typeof obj === "function") &&
                obj.type === "b" &&
                typeof obj.value === "string")
            )
    }`,
  },
  { options: { exportAll: true } }
)

testProcessProject(
  'generated type guards for enums',
  {
    'test.ts': `
    export enum Types{
        TheGood,
        TheBad,
        TheTypeSafe
    }`,
  },
  {
    'test.guard.ts': `
    import { Types } from "./test";
    
    export function isTypes(obj: any, _argumentName?: string): obj is Types {
        return (
            (obj === Types.TheGood ||
                obj === Types.TheBad ||
                obj === Types.TheTypeSafe)
        )
    }`,
  },
  { options: { exportAll: true } }
)

testProcessProject(
  'generated type guards for arrays of any',
  {
    'test.ts': `
      export interface Foo {
        value: any[]
      }
      `,
  },
  {
    'test.guard.ts': `
      import { Foo } from "./test";
      
      export function isFoo(obj: any, _argumentName?: string): obj is Foo {
          return (
              (obj !== null &&
                  typeof obj === "object" ||
                  typeof obj === "function") &&
              Array.isArray(obj.value)
          )
      }`,
  },
  { options: { exportAll: true } }
)

testProcessProject(
  'generated type guards for nested arrays',
  {
    'test.ts': `
      export type Foo = {
        value: Array<{
          value: Array<number>
        }>
      }
      `,
  },
  {
    'test.guard.ts': `
        import { Foo } from "./test";
        
        export function isFoo(obj: any, _argumentName?: string): obj is Foo {
            return (
                (obj !== null &&
                    typeof obj === "object" ||
                    typeof obj === "function") &&
                Array.isArray(obj.value) &&
                obj.value.every((e: any) =>
                    (e !== null &&
                        typeof e === "object" ||
                        typeof e === "function") &&
                    Array.isArray(e.value) &&
                    e.value.every((e: any) =>
                        typeof e === "number"
                    )
                )
            )
        }`,
  },
  { options: { exportAll: true } }
)

testProcessProject(
  'adds type guard import to source file and also exports',
  {
    // NOTE: This file is not automatically cleaned up with `formatText` after
    // being modified so it requires this funky indentation to ensure that it is
    // conforms to ts-morph's formatting.
    'test.ts': `
/** @see {isEmpty} ts-auto-guard:type-guard */
export interface Empty { }
`,
  },
  {
    'test.ts': `
    import * as CustomGuardAlias from "./test.guard";

    /** @see {isEmpty} ts-auto-guard:type-guard */
    export interface Empty {}

    export { CustomGuardAlias };`,
    'test.guard.ts': `
    import { Empty } from "./test";

    export function isEmpty(obj: any, _argumentName?: string): obj is Empty {
        return (
              (obj !== null &&
              typeof obj === "object" ||
              typeof obj === "function")
           )
    }`,
  },
  { options: { importGuards: 'CustomGuardAlias'} }
)

testProcessProject(
  'adds type guard import to source file and skips export',
  {
    'test.ts': `
    /** @see {isEmpty} ts-auto-guard:type-guard */
    export interface Empty {}`,
  },
  {
    'test.ts': `
    import * as CustomGuardAlias from "./test.guard";

    /** @see {isEmpty} ts-auto-guard:type-guard */
    export interface Empty {}`,
    'test.guard.ts': `
    import { Empty } from "./test";

    export function isEmpty(obj: any, _argumentName?: string): obj is Empty {
        return (
              (obj !== null &&
              typeof obj === "object" ||
              typeof obj === "function")
           )
    }`,
  },
  { options: { importGuards: 'CustomGuardAlias', preventExportImported: true } }
)
