# ts-auto-guard

[![Greenkeeper badge](https://badges.greenkeeper.io/usabilityhub/ts-auto-guard.svg)](https://greenkeeper.io/)

> Generate type guard functions from TypeScript interfaces

A tool for automatically generating TypeScript [type guards](https://www.typescriptlang.org/docs/handbook/advanced-types.html#type-guards-and-differentiating-types) for interfaces in your code base.

This tool aims to allow developers to verify data from untyped sources to ensure it conforms to TypeScript types. For example when initializing a data store or receiving structured data in an AJAX response.

## Install

### Yarn

```
$ yarn add -D ts-auto-guard
```

### npm

```
$ npm install --save-dev ts-auto-guard
```

## Usage

Specify which types to process (see below) and run the CLI tool in the same folder as your project's `tsconfig.json` (optionally passing in paths to the files you'd like it to parse).

```sh
$ ts-auto-guard ./my-project/Person.ts
```

See generated files alongside your annotated files:

```ts
// my-project/Person.guard.ts

import { Person } from './Person'

export function isPerson(obj: any): obj is Person {
  return (
    typeof obj === 'object' &&
    typeof obj.name === 'string' &&
    (typeof obj.age === 'undefined' || typeof obj.age === 'number') &&
    Array.isArray(obj.children) &&
    obj.children.every(e => isPerson(e))
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

Annotate interfaces in your project. ts-auto-guard will generate guards only for interfaces with a `@see {name} ts-auto-guard:type-guard` JSDoc tag.

```ts
// my-project/Person.ts

/** @see {isPerson} ts-auto-guard:type-guard */
export interface Person { // !do not forget to export - only exported types are processed
  name: string
  age?: number
  children: Person[]
}
```
### Process all types
Use `--export-all` parameter to process all exported types:
```
$ ts-auto-guard --export-all 'src/domain/*.ts'
```

## Debug mode

Use debug mode to help work out why your type guards are failing in development. This will change the output type guards to log the path, expected type and value of failing guards.

```
$ ts-auto-guard --debug
```

```ts
isPerson({ name: 20, age: 20 })
// stderr: "person.name type mismatch, expected: string, found: 20"
```

## Short circuiting

ts-auto-guard also supports a `shortcircuit` flag that will cause all guards
to always return `true`.

```
$ ts-auto-guard --shortcircuit="process.env.NODE_ENV === 'production'"
```

This will result in the following:

```ts
// my-project/Person.guard.ts

import { Person } from './Person'

export function isPerson(obj: any): obj is Person {
  if (process.env.NODE_ENV === 'production') {
    return true
  }
  return (
    typeof obj === 'object' &&
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
$ ts-auto-guard --import-guards="Guards"
```

Will result in the following being added to your source code.
```ts
// my-project/Person.ts

import * as Guards from './Person.guard'

/** The rest of your source code */

export { Guards }
```
