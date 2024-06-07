import { testProcessProject } from '../generate'

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
    'test.ts': null,
    'test.guard.ts': `"use strict";function isFoo(o){return!0}Object.defineProperty(exports,"__esModule",{value:!0}),exports.isFoo=void 0,exports.isFoo=isFoo;`,
  },
  {
    minifyOptions: {
      compress: { global_defs: { DEBUG: true } },
    },
    options: { shortCircuitCondition: 'DEBUG', debug: false },
  }
)
