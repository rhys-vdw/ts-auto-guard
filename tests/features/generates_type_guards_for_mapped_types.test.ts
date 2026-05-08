import { testProcessProject } from '../generate'

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
    'test.ts': null,
    'test.guard.ts': `
     import type { PropertyValueType, PropertyName, Foo } from "./test";

     export function isPropertyValueType(obj: unknown): obj is PropertyValueType {
        const typedObj = obj as PropertyValueType
        return (
            (typedObj !== null &&
              typeof typedObj === "object" ||
              typeof typedObj === "function") &&
          typeof typedObj["value"] === "string"
          )
      }

     export function isPropertyName(obj: unknown): obj is PropertyName {
       const typedObj = obj as PropertyName
       return (
         (typedObj === "name" ||
           typedObj === "value")
       )
     }

     export function isFoo(obj: unknown): obj is Foo {
       const typedObj = obj as Foo
       return (
         (typedObj !== null &&
              typeof typedObj === "object" ||
              typeof typedObj === "function") &&
         isPropertyValueType(typedObj["name"]) as boolean &&
         isPropertyValueType(typedObj["value"]) as boolean
       )
     }
    `,
  }
)
