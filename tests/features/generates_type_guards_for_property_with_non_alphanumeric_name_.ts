// characters that are currently not supported include double quotes, backslashes and newlines
import { testProcessProject } from '../generate'

const nonAlphanumericCharacterPropertyNames = [
  '\0',
  ' ',
  '-',
  '+',
  '*',
  '/',
  '.',
  'foo bar',
  'foo-bar',
  'foo+bar',
  'foo*bar',
  'foo/bar',
  'foo.bar',
  "'foobar'",
  '#hashtag',
  '1337_leadingNumbers',
]

for (const propertyName of nonAlphanumericCharacterPropertyNames) {
  testProcessProject(
    `generates type guards for interface property with non-alphanumeric name '${propertyName}'`,
    {
      'test.ts': `
    /** @see {isFoo} ts-auto-guard:type-guard */
    export interface Foo {
      "${propertyName}": number
    }`,
    },
    {
      'test.ts': null,
      'test.guard.ts': `
    import { Foo } from "./test";

    export function isFoo(obj: unknown): obj is Foo {
        const typedObj = obj as Foo
        return (
            (typedObj !== null &&
            typeof typedObj === "object" ||
            typeof typedObj === "function") &&
            typeof typedObj["${propertyName}"] === "number"
        )
    }`,
    }
  )

  testProcessProject(
    `generates type guards for type property with non-alphanumeric name '${propertyName}'`,
    {
      'test.ts': `
    /** @see {isFoo} ts-auto-guard:type-guard */
    export type Foo = {
      "${propertyName}": number
    }`,
    },
    {
      'test.ts': null,
      'test.guard.ts': `
    import { Foo } from "./test";

    export function isFoo(obj: unknown): obj is Foo {
        const typedObj = obj as Foo
        return (
            (typedObj !== null &&
            typeof typedObj === "object" ||
            typeof typedObj === "function") &&
            typeof typedObj["${propertyName}"] === "number"
        )
    }`,
    }
  )
}
