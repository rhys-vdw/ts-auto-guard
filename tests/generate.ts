import test from 'tape'
import { Project } from 'ts-morph'
import { minify, MinifyOptions } from 'uglify-js'
import { IProcessOptions, processProject } from '../src'

function createProject(): Project {
  return new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { strict: true },
    useInMemoryFileSystem: true,
  })
}

interface ITestOptions {
  skip?: boolean
  only?: boolean
  minifyOptions?: MinifyOptions
  options?: IProcessOptions
  throws?: RegExp | typeof Error
}

export function testProcessProject(
  typeDescription: string,
  input: { readonly [filename: string]: string },
  output: { readonly [filename: string]: string | null },
  { skip, only, options, minifyOptions, throws }: ITestOptions = {}
): void {
  const fn = skip ? test.skip : only ? test.only : test
  fn(typeDescription, t => {
    const project = createProject()
    Object.entries(input).forEach(([filePath, content]) => {
      project.createSourceFile(filePath, content)
    })
    project.saveSync()

    const expectedFilenames = new Set(Object.keys(output))

    if (throws) {
      t.throws(() => {
        processProject(project, options)
      }, throws)
      t.end()
      return
    }

    t.doesNotThrow(() => {
      processProject(project, options)
    })

    for (const sourceFile of project.getSourceFiles()) {
      const filePath = sourceFile.getFilePath().slice(1)
      const expectedRaw = output[filePath]
      if (expectedRaw === undefined) {
        t.fail(`unexpected file ${filePath}`)
      } else if (expectedRaw === null) {
        // This file is expected, but must not have been changed
        expectedFilenames.delete(filePath)
        const sourceText = sourceFile.getFullText()
        t.equal(sourceText, input[filePath], `${filePath} should not change`)
      } else {
        // This is a new file
        expectedFilenames.delete(filePath)
        const expectedFile = project.createSourceFile(
          `${filePath}.expected`,
          expectedRaw
        )
        let sourceText: string
        if (minifyOptions !== undefined) {
          const emitOutput = sourceFile.getEmitOutput()
          const result = minify(
            emitOutput.getOutputFiles()[0].getText(),
            minifyOptions
          )
          t.error(result.error, 'UglifyJS should succeed')
          sourceText = result.code
        } else {
          expectedFile.formatText()
          sourceText = sourceFile.getText()
        }

        const expectedText = expectedFile.getText()
        t.equal(sourceText, expectedText, `${filePath} should match`)
      }
    }
    for (const filePath of expectedFilenames) {
      t.fail(`${filePath} not found`)
    }
    t.end()
  })
}
