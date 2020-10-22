#!/usr/bin/env node

/* tslint:disable:no-console */

import { errors } from '@ts-morph/common'
import commandLineArgs from 'command-line-args'
import commandLineUsage from 'command-line-usage'
import { defaults } from 'lodash'
import * as TsConfig from 'tsconfig'
import { generate } from './index'

interface ICliOptions {
  shortcircuit: string | undefined
  paths: ReadonlyArray<string>
  project: string | undefined
  help: boolean
  debug: boolean
  'export-all': boolean
}

const optionList = [
  {
    description:
      'A JavaScript condition used to automatically return `true` from guard functions, bypassing checks. eg. `process.env.DEBUG === "production"`.',
    name: 'shortcircuit',
    type: String,
    typeLabel: '{underline javascript}',
  },
  {
    defaultOption: true,
    description:
      'File(s) to generate guard for. If excluded this will process {italic all} project files.',
    multiple: true,
    name: 'paths',
    type: String,
    typeLabel: '{underline file[]} ...',
  },
  {
    description:
      'Generate checks for all exported types, even those not marked with comment',
    name: 'export-all',
    type: Boolean,
  },
  {
    description: 'Path to `tsconfig.json`.',
    name: 'project',
    type: String,
    typeLabel: '{underline file}',
  },
  {
    alias: 'h',
    description: 'Print this usage guide.',
    name: 'help',
    type: Boolean,
  },
  {
    alias: 'd',
    description: 'Include debug logs in generated type guards.',
    name: 'debug',
    type: Boolean,
  },
]

const options: ICliOptions = defaults(
  commandLineArgs(optionList) as ICliOptions,
  { paths: [] as ReadonlyArray<string>, help: false }
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
        debug: options.debug,
        exportAll: options['export-all'],
        shortCircuitCondition: options.shortcircuit,
      },
      project,
    })
    console.log('Done!')
  } catch (error) {
    if (error instanceof errors.FileNotFoundError) {
      console.error(error.message)
    } else {
      throw error
    }
  }
}

if (options.help) {
  // tslint:disable-next-line:no-var-requires
  const { name, version, description } = require('../package.json')

  // tslint:disable:object-literal-sort-keys
  console.log(
    commandLineUsage([
      {
        header: `${name} ${version}`,
        content: description,
      },
      {
        header: 'Options',
        optionList,
      },
    ])
  )
  // tslint:enable:object-literal-sort-keys
} else {
  run()
}
