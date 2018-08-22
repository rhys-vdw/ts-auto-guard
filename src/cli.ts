#!/usr/bin/env node

/* tslint:disable:no-console */

import { generate } from './index'

const [, , ...paths] = process.argv

generate(paths)
  .then(() => {
    console.log('Done!')
  })
  .catch(error => {
    if (error.code === 'ENOENT') {
      console.error(error.message)
    } else {
      throw error
    }
  })
