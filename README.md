# ts-auto-guard

> Generate type guard functions from TypeScript interfaces

_Very early prototype_

A tool for automatically generating TypeScript [type guards](https://www.typescriptlang.org/docs/handbook/advanced-types.html#type-guards-and-differentiating-types) for interfaces in your code base.

This tool aims to allow developers to verify data from untyped sources to ensure it conforms to TypeScript types. For example when initializing a data store or receiving structured data in an AJAX response.

## Install

Not published yet

```sh
$ git clone git@github.com:rhys-vdw/ts-auto-guard.git
$ cd ts-auto-guard
$ npm link
```

## Usage

Annotate interfaces in your project. ts-auto-guard will generate guards only for interfaces with a `@see {name} ts-auto-guard:type-guard` property.

```ts
// my-project/Person.ts

/** @see {isPerson} ts-auto-guard:type-guard */
export interface Person {
    name: string,
    age?: number,
    children: Person[],
}
```

Run the CLI tool passing in the path to your project files.

```sh
$ ts-auto-guard ./my-project/**/*.ts
```

See generated files alongside your annotated files:

```ts
// my-project/Person.guard.ts

import { Person } from "./Person";

export function isPerson(obj: any): obj is Person {
    return (
        typeof obj === "object" &&
        typeof obj.name === "string" &&
        (
            typeof obj.age === "undefined" ||
            typeof obj.age === "number"
        ) &&
        Array.isArray(obj.children) &&
        obj.children.every(e => isPerson(e))
    );
}
```

Now use in your project:

```ts
// index.ts

import { Person } from "./Person"
import { isPerson } from "./Person.guard"

// Loading up an (untyped) JSON file
const person = require("./person.json")

if (isPerson(person)) {
    // Can trust the type system here because the object has been verified.
    console.log(`${person.name} has ${person.children.length} child(ren)`)
} else {
    console.error("Invalid person.json")
}
```
