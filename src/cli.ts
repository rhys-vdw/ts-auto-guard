#!/usr/bin/env node

/* tslint:disable:no-console */

import { FileNotFoundError } from "ts-simple-ast"
import { generate } from './index'

const [, , ...paths] = process.argv

generate(paths)
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
