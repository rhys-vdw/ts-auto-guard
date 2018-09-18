# ts-auto-guard

[![Greenkeeper badge](https://badges.greenkeeper.io/usabilityhub/ts-auto-guard.svg)](https://greenkeeper.io/)

> Generate type guard functions from TypeScript interfaces

_**Early prototype** - this project is not very well tested and is not feature complete_

A tool for automatically generating TypeScript [type guards](https://www.typescriptlang.org/docs/handbook/advanced-types.html#type-guards-and-differentiating-types) for interfaces in your code base.

This tool aims to allow developers to verify data from untyped sources to ensure it conforms to TypeScript types. For example when initializing a data store or receiving structured data in an AJAX response.

## Install

Not published yet

```
$ git clone git@github.com:rhys-vdw/ts-auto-guard.git
$ cd ts-auto-guard
$ npm install && npm build
$ npm link
```

## Usage

Annotate interfaces in your project. ts-auto-guard will generate guards only for interfaces with a `@see {name} ts-auto-guard:type-guard` JSDoc tag.

```ts
// my-project/Person.ts

/** @see {isPerson} ts-auto-guard:type-guard */
export interface Person {
  name: string
  age?: number
  children: Person[]
}
```

Run the CLI tool in the same folder as your project's `tsconfig.json` (optionally passing in paths to the files you'd like it to parse).

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

## Short circuiting

`ts-auto-guard` also supports a `shortcircuit` flag that will cause all guards
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
