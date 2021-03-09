#!/usr/bin/env node

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
  'import-guards': string
  'prevent-export-imported': boolean
  'guard-file-name': string
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
    description:
      'Adds TypeGuard import to source file, to also export TypeGuard from source use with --import-guards. Optionally accepts a string to choose custom import alias.',
    name: 'import-guards',
    typeLabel: '{underline TypeGuard}',
    type: String,
  },
  {
    description:
      'Allows customisation of the filename for the generated guards file',
    name: 'guard-file-name',
    type: String,
    typeLabel: '{underline extension}',
  },
  {
    description:
      'Overrides the default behavior for --import-guards by skipping export from source.',
    name: 'prevent-export-imported',
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
  {
    paths: [] as ReadonlyArray<string>,
    help: false,
  }
)

async function run() {
  const project = await TsConfig.resolve(process.cwd(), options.project)
  if (project === undefined) {
    console.error('Could not find tsconfig')
    return
  }
  if ('import-guards' in options) {
    /** Checks if valid name passed as argument or replace with default if empty */
    if (!options['import-guards']) {
      options['import-guards'] = 'TypeGuards'
    }
    try {
      eval(`const ${options['import-guards']} = true`)
    } catch (error) {
      console.log('Please pass a valid import alias')
      throw error
    }
  }

  try {
    await generate({
      paths: options.paths,
      processOptions: {
        debug: options.debug,
        exportAll: options['export-all'],
        importGuards: options['import-guards'],
        preventExportImported: options['prevent-export-imported'],
        shortCircuitCondition: options.shortcircuit,
        guardFileName: options['guard-file-name'],
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
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { name, version, description } = require('../package.json')

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
} else {
  run()
}
