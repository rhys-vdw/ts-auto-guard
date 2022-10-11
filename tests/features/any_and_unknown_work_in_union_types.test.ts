import { testProcessProject } from '../generate'

testProcessProject(
  'any and unknown work in union types',
  {
    'test.ts': `
    type anyType = any
    type unknownType = unknown

    export type AnyOrString = string | anyType
    export type UnknownOrString = string | unknownType
    export type AnyOrUnknownOrString = string | anyType | unknownType`,
  },
  {
    'test.ts': null,
    'test.guard.ts': `
    import { AnyOrString, UnknownOrString, AnyOrUnknownOrString } from "./test";

    export function isAnyOrString(obj: unknown): obj is AnyOrString {
        const typedObj = obj as AnyOrString
        return (
          true
        )
    }

    export function isUnknownOrString(obj: unknown): obj is UnknownOrString {
      const typedObj = obj as UnknownOrString
      return (
        true
      )
    }

    export function isAnyOrUnknownOrString(obj: unknown): obj is AnyOrUnknownOrString {
        const typedObj = obj as AnyOrUnknownOrString
        return (
          true
        )
    }`,
  },
  { options: { exportAll: true } }
)
