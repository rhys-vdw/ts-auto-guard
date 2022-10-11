import {testProcessProject} from '../generate';

testProcessProject(
  'any and unknown work in interesction types',
  {
    'test.ts': `
    type anyType = any
    type unknownType = unknown

    export type AnyAndString = string & anyType
    export type UnknownAndString = string & unknownType
    export type AnyAndUnknownAndString = string & anyType & unknownType`,
  },
  {
    'test.ts': null,
    'test.guard.ts': `
    import { AnyAndString, UnknownAndString, AnyAndUnknownAndString } from "./test";

    export function isAnyAndString(obj: unknown): obj is AnyAndString {
        const typedObj = obj as AnyAndString
        return (
          true
        )
    }

    export function isUnknownAndString(obj: unknown): obj is UnknownAndString {
      const typedObj = obj as UnknownAndString
      return (
        typeof typedObj === "string"
      )
    }

    export function isAnyAndUnknownAndString(obj: unknown): obj is AnyAndUnknownAndString {
        const typedObj = obj as AnyAndUnknownAndString
        return (
          true
        )
    }`,
  },
  { options: { exportAll: true } }
)