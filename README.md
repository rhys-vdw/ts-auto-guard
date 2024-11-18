# ts-auto-guard

[![NPM Version](https://img.shields.io/npm/v/ts-auto-guard)](https://www.npmjs.com/package/ts-auto-guard) [![Test](https://github.com/rhys-vdw/ts-auto-guard/actions/workflows/test.yml/badge.svg)](https://github.com/rhys-vdw/ts-auto-guard/actions/workflows/test.yml)

> Generate type guard functions from TypeScript interfaces

A tool for automatically generating TypeScript [type guards](https://www.typescriptlang.org/docs/handbook/advanced-types.html#type-guards-and-differentiating-types) for interfaces in your code base.

This tool aims to allow developers to verify data from untyped sources to ensure it conforms to TypeScript types. For example when initializing a data store or receiving structured data in an AJAX response.

## Install

### Yarn

```
yarn add -D ts-auto-guard
```

### npm

```
npm install --save-dev ts-auto-guard
```

## TypeScript configuration

It makes sense to use this library in `strict` mode. Make sure to turn on the [strict mode family](https://www.typescriptlang.org/tsconfig#strict) options by defining `"strict": true` in `tsconfig.json` under `compilerOptions`.
If you have any problems check that strict mode family options, such as `strictNullChecks`, are not explicitly set to false. Check [these](https://github.com/rhys-vdw/ts-auto-guard/issues/120) [issues](https://github.com/rhys-vdw/ts-auto-guard/issues/152) for more info.

## Usage

Specify which types to process (see below) and run the CLI tool in the same folder as your project's `tsconfig.json` (optionally passing in paths to the files you'd like it to parse).

```sh
ts-auto-guard ./my-project/Person.ts
```

See generated files alongside your annotated files:

```ts
// my-project/Person.guard.ts

import { Person } from './Person'

export function isPerson(obj: unknown): obj is Person {
  const typedObj = obj as Person
  return (
    typeof typedObj === 'object' &&
    typeof typedObj['name'] === 'string' &&
    (typeof typedObj['age'] === 'undefined' ||
      typeof typedObj['age'] === 'number') &&
    Array.isArray(typedObj['children']) &&
    typedObj['children'].every(e => isPerson(e))
  )
}
```

Now use in your project:

```ts
// index.ts

import { Person } from './Person'
import { isPerson } from './Person.guard'

// Loading up an (untyped) JSON file
const person = require('./person.json')

if (isPerson(person)) {
  // Can trust the type system here because the object has been verified.
  console.log(`${person.name} has ${person.children.length} child(ren)`)
} else {
  console.error('Invalid person.json')
}
```

## Specifying which types to process

### Specify with annotation

Annotate interfaces in your project. ts-auto-guard will generate guards only for interfaces with a `@see {name} ts-auto-guard:type-guard` [JSDoc @see tag](https://jsdoc.app/tags-see.html).

```ts
// my-project/Person.ts

/** @see {isPerson} ts-auto-guard:type-guard */
export interface Person {
  // !do not forget to export - only exported types are processed
  name: string
  age?: number
  children: Person[]
}
```

The [JSDoc @link tag](https://jsdoc.app/tags-link.html) is also supported: `@see {@link name} ts-auto-guard:type-guard`.

### Process all types

Use `--export-all` parameter to process all exported types:

```
ts-auto-guard --export-all 'src/domain/*.ts'
```

## Debug mode

Use debug mode to help work out why your type guards are failing in development. This will change the output type guards to log the path, expected type and value of failing guards.

```
ts-auto-guard --debug
```

```ts
isPerson({ name: 20, age: 20 })
// stderr: "person.name type mismatch, expected: string, found: 20"
```

## Short circuiting

ts-auto-guard also supports a `shortcircuit` flag that will cause all guards
to always return `true`.

```
ts-auto-guard --shortcircuit="process.env.NODE_ENV === 'production'"
```

This will result in the following:

```ts
// my-project/Person.guard.ts

import { Person } from './Person'

export function isPerson(obj: unknown): obj is Person {
  if (process.env.NODE_ENV === 'production') {
    return true
  }
  const typedObj = obj as Person
  return (
    typeof typedObj === 'object' &&
    // ...normal conditions
  )
}
```

Using the `shortcircuit` option in combination with [uglify-js's `dead_code` and `global_defs` options](https://github.com/mishoo/UglifyJS2#compress-options) will let you omit the long and complicated checks from your production code.

## Change Guard File Name

ts-auto-guard will create a `.guard.ts` file by default, but this can be overriden.

```
ts-auto-guard --guard-file-name="debug"
```

Will result in a guard file called `.debug.ts`.

## Add Import to Source File

ts-auto-guard supports an `ìmport-guards` flag. This flag will add an import statement at the top and a named export at the bottom of the source files for the generated type guards. The `ìmport-guards` flag also optionally accepts a custom name for the import alias, if none is passed then `TypeGuards` is used as a default.

If you would like to override the default behavior and not have the type guards exported from source use the `prevent-export-imported` flag with the `import-guards` flag.

```
ts-auto-guard --import-guards="Guards"
```

Will result in the following being added to your source code.

```ts
// my-project/Person.ts

import * as Guards from './Person.guard'

/** The rest of your source code */

export { Guards }
```

## Add Custom File Extension to Import Statements

By default, the import statements in generated files won't have any extension.
However, this doesn't work with ESM, which requires `.js` extension for import statements.

ts-auto-guard supports an `import-extension` flag to set a custom extension in import statements:

```
ts-auto-guard --import-extension="js"
```

This will result in the following:

```ts
// my-project/Person.guard.ts

import { Person } from './Person.js'

export function isPerson(obj: unknown): obj is Person {
  if (process.env.NODE_ENV === 'production') {
    return true
  }
  const typedObj = obj as Person
  return (
    typeof typedObj === 'object' &&
    // ...normal conditions
  )
}
```

## Use Custom Type-Guard Instead of Generating

ts-auto-guard cannot generate type-guards for all typescript types automatically. For instance a validator for string template literals or branded types cannot be automatically genetrated. If you want to use a type which cannot be validated automatically you can use the annotation `/** @see {name} ts-auto-guard:type-guard */`, where `name` is a function exported by the current file:

```ts
// my-project/Person.ts

/** @see {isPersonId} ts-auto-guard:custom */
export type PersonId = number & { brand: true };

export function isPersonId(x: unknown): x is string {
  return typeof x === "number";
  // or look up the identifier in a cache or database
}

/** @see {isPerson} ts-auto-guard:type-guard */
export type Person = {
  id: PersonId,
  name: string
}
```

in this example, the generated `isPerson` type-guard will delegate to the hand-written `isPersonId` for checking the type of the `id` field.