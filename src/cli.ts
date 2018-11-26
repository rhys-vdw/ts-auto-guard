#!/usr/bin/env node

/* tslint:disable:no-console */

import commandLineArgs from 'command-line-args'
import { defaults } from 'lodash'
import { FileNotFoundError } from 'ts-simple-ast'
import * as TsConfig from 'tsconfig'
import { generate } from './index'

const options = defaults(
  commandLineArgs([
    { name: 'shortcircuit', type: String },
    { name: 'paths', type: String, multiple: true, defaultOption: true },
    { name: 'project', type: String },
  ]),
  { paths: [] }
)

async function run() {
  const project = await TsConfig.resolve(process.cwd(), options.project)
  if (project === undefined) {
    console.error('Could not find tsconfig')
    return
  }
  try {
    await generate({
      paths: options.paths,
      processOptions: {
        shortCircuitCondition: options.shortcircuit,
      },
      project,
    })
    console.log('Done!')
  } catch (error) {
    if (error instanceof FileNotFoundError) {
      console.error(error.message)
    } else {
      throw error
    }
  }
}

run()
