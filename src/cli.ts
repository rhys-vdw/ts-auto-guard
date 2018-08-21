#!/usr/bin/env node

import { generate } from './index'

const [, ...paths] = process.argv

if (paths.length === 0) {
  console.error(`specify some files`)
  process.exit(1)
}

generate(paths)
  .then(() => {
    console.log('Done!')
  })
  .catch(error => {
    console.error(error)
  })
