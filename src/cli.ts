#!/usr/bin/env node

/* tslint:disable:no-console */

import commandLineArgs from 'command-line-args'
import { defaults } from 'lodash'
import { FileNotFoundError } from 'ts-simple-ast'
import { generate } from './index'

const options = defaults(
  commandLineArgs([
    { name: 'shortcircuit', type: String },
    { name: 'paths', type: String, multiple: true, defaultOption: true },
  ]),
  { paths: [] }
)

generate(options.paths, { shortCircuitCondition: options.shortcircuit })
  .then(() => {
    console.log('Done!')
  })
  .catch(error => {
    if (error instanceof FileNotFoundError) {
      console.error(error.message)
    } else {
      throw error
    }
  })
