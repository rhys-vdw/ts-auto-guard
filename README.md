# ts-auto-guard

> Generate type guard functions from TypeScript interfaces

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
// my-project/person.ts

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
// my-project/person.guard.ts

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
