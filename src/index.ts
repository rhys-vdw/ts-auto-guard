/* eslint-disable @typescript-eslint/no-non-null-assertion */

import {
  EnumDeclaration,
  ExportableNode,
  ImportDeclarationStructure,
  InterfaceDeclaration,
  Node,
  Project,
  SourceFile,
  StructureKind,
  Type,
  TypeAliasDeclaration,
} from 'ts-morph'

const GENERATED_WARNING = 'WARNING: Do not manually change this file.'

// -- Helpers --

function reportError(message: string, ...args: unknown[]) {
  console.error(`ERROR: ${message}`, ...args)
}

function lowerFirst(s: string): string {
  const first_code_point = s.codePointAt(0)
  if (first_code_point === undefined) return s
  const first_letter = String.fromCodePoint(first_code_point)
  return first_letter.toLowerCase() + s.substr(first_letter.length)
}

function findExportableNode(type: Type): (ExportableNode & Node) | null {
  const symbol = type.getSymbol()
  if (symbol === undefined) {
    return null
  }

  return (
    symbol
      .getDeclarations()
      .reduce<Node[]>((acc, node) => [...acc, node, ...node.getAncestors()], [])
      .filter(Node.isExportableNode)
      .find(n => n.isExported()) || null
  )
}

function typeToDependency(type: Type, addDependency: IAddDependency): void {
  const exportable = findExportableNode(type)
  if (exportable === null) {
    return
  }

  const sourceFile = exportable.getSourceFile()
  const name = exportable.getSymbol()!.getName()
  const isDefault = exportable.isDefaultExport()

  if (!exportable.isExported()) {
    reportError(`${name} is not exported from ${sourceFile.getFilePath()}`)
  }

  addDependency(sourceFile, name, isDefault)
}

function outFilePath(sourcePath: string, guardFileName: string) {
  const outPath = sourcePath.replace(
    /\.(ts|tsx|d\.ts)$/,
    `.${guardFileName}.ts`
  )
  if (outPath === sourcePath)
    throw new Error(
      'Internal Error: sourcePath and outFilePath are identical: ' + outPath
    )
  return outPath
}

function deleteGuardFile(sourceFile: SourceFile) {
  if (sourceFile.getFullText().indexOf(GENERATED_WARNING) >= 0) {
    sourceFile.delete()
  } else {
    console.warn(
      `${sourceFile.getFilePath()} is named like a guard file, but does not contain the generated header. Consider removing or renaming the file, or change the guardFileName setting.`
    )
  }
}

// https://github.com/dsherret/ts-simple-ast/issues/108#issuecomment-342665874
function isClassType(type: Type): boolean {
  if (type.getConstructSignatures().length > 0) {
    return true
  }

  const symbol = type.getSymbol()
  if (symbol == null) {
    return false
  }

  for (const declaration of symbol.getDeclarations()) {
    if (Node.isClassDeclaration(declaration)) {
      return true
    }
    if (
      Node.isVariableDeclaration(declaration) &&
      declaration.getType().getConstructSignatures().length > 0
    ) {
      return true
    }
  }

  return false
}

function isReadonlyArrayType(type: Type): boolean {
  const symbol = type.getSymbol()
  if (symbol === undefined) {
    return false
  }
  return (
    symbol.getName() === 'ReadonlyArray' && type.getTypeArguments().length === 1
  )
}

function getReadonlyArrayType(type: Type): Type | undefined {
  return type.getTypeArguments()[0]
}

function getTypeGuardName(
  child: Guardable,
  options: IProcessOptions
): string | null {
  const jsDocs = child.getJsDocs()
  for (const doc of jsDocs) {
    for (const line of doc.getInnerText().split('\n')) {
      const match = line
        .trim()
        .match(/@see\s+(?:{\s*(@link\s*)?(\w+)\s*}\s+)?ts-auto-guard:([^\s]*)/)
      if (match !== null) {
        const [, , typeGuardName, command] = match
        if (command !== 'type-guard') {
          reportError(`command ${command} is not supported!`)
          return null
        }
        return typeGuardName
      }
    }
  }
  if (options.exportAll) {
    const t = child.getType()
    const symbols = [child, t.getSymbol(), t.getAliasSymbol()]
    // type aliases have type __type sometimes
    const name = symbols
      .filter(x => x && x.getName() !== '__type')[0]
      ?.getName()
    const isPrimitive = [
      'undefined',
      'null',
      'boolean',
      'bigint',
      'string',
      'number',
    ].includes(t.getText())
    if (name && !isPrimitive) {
      return 'is' + name
    }
  }
  return null
}

// -- Main program --

function ors(...statements: string[]): string {
  return parens(statements.join(' || \n'))
}

function ands(...statements: string[]): string {
  return statements.join(' && \n')
}

function eq(a: string, b: string): string {
  return `${a} === ${b}`
}

function ne(a: string, b: string): string {
  return `${a} !== ${b}`
}

function typeOf(varName: string, type: string): string {
  return eq(`typeof ${varName}`, `"${type}"`)
}

function typeUnionConditions(
  varName: string,
  types: Type[],
  addDependency: IAddDependency,
  project: Project,
  path: string,
  arrayDepth: number,
  records: readonly IRecord[],
  outFile: SourceFile,
  options: IProcessOptions
): string {
  const conditions: string[] = []
  conditions.push(
    ...(types
      .map(type =>
        typeConditions(
          varName,
          type,
          addDependency,
          project,
          path,
          arrayDepth,
          true,
          records,
          outFile,
          options
        )
      )
      .filter(v => v !== null) as string[])
  )
  return ors(...conditions)
}

function typeIntersectionConditions(
  varName: string,
  types: Type[],
  addDependency: IAddDependency,
  project: Project,
  path: string,
  arrayDepth: number,
  records: readonly IRecord[],
  outFile: SourceFile,
  options: IProcessOptions
): string {
  const conditions: string[] = []
  conditions.push(
    ...(types
      .map(type =>
        typeConditions(
          varName,
          type,
          addDependency,
          project,
          path,
          arrayDepth,
          true,
          records,
          outFile,
          options
        )
      )
      .filter(v => v !== null) as string[])
  )
  return ands(...conditions)
}

function parens(code: string) {
  return `(${code})`
}

function arrayCondition(
  varName: string,
  arrayType: Type,
  addDependency: IAddDependency,
  project: Project,
  path: string,
  arrayDepth: number,
  records: readonly IRecord[],
  outFile: SourceFile,
  options: IProcessOptions
): string {
  if (arrayType.getText() === 'never') {
    return ands(`Array.isArray(${varName})`, eq(`${varName}.length`, '0'))
  }
  const indexIdentifier = `i${arrayDepth}`
  const elementPath = `${path}[\${${indexIdentifier}}]`
  const conditions = typeConditions(
    'e',
    arrayType,
    addDependency,
    project,
    elementPath,
    arrayDepth + 1,
    true,
    records,
    outFile,
    options
  )

  if (conditions === null) {
    return `Array.isArray(${varName})`
  }

  // Bit of a hack, just check if the second argument is used before actually
  // creating it. This avoids unused parameter errors.
  const secondArg = conditions.includes(elementPath)
    ? `, ${indexIdentifier}: number`
    : ''
  return ands(
    `Array.isArray(${varName})`,
    `${varName}.every((e: any${secondArg}) =>\n${conditions}\n)`
  )
}

function objectTypeCondition(varName: string, callable: boolean): string {
  return callable
    ? typeOf(varName, 'function')
    : ors(
        ands(ne(varName, 'null'), typeOf(varName, 'object')),
        typeOf(varName, 'function')
      )
}

function objectCondition(
  varName: string,
  type: Type,
  addDependency: IAddDependency,
  project: Project,
  path: string,
  arrayDepth: number,
  records: readonly IRecord[],
  outFile: SourceFile,
  options: IProcessOptions
): string | null {
  const conditions: string[] = []

  const symbol = type.getSymbol()
  if (symbol === undefined) {
    // I think this is happening when the type is declare in a node module.

    // tslint:disable-next-line:no-console
    console.error(`Unable to get symbol for type ${type.getText()}`)
    return typeOf(varName, 'object')
  }

  const declarations = symbol.getDeclarations()

  // TODO: https://github.com/rhys-vdw/ts-auto-guard/issues/29
  const declaration = declarations[0]

  if (declaration === undefined) {
    reportError(`Couldn't find declaration for type ${type.getText()}`)
    return null
  }

  const callable = type.getCallSignatures().length !== 0

  if (callable) {
    // emit warning
    const suppressComment = 'ts-auto-guard-suppress function-type'
    const commentsBefore = declaration.getLeadingCommentRanges()
    const commentBefore = commentsBefore[commentsBefore.length - 1]
    if (
      commentBefore === undefined ||
      !commentBefore.getText().includes(suppressComment)
    ) {
      console.warn(
        `
It seems that ${varName} has a function type.
Note that it is impossible to check if a function has the correct signature and return type at runtime.
To disable this warning, put comment "${suppressComment}" before the declaration.
`
      )
    }
  }

  if (type.isInterface()) {
    if (!Node.isInterfaceDeclaration(declaration)) {
      throw new TypeError(
        'Extected declaration to be an interface declaration!'
      )
    }
    declaration.getBaseTypes().forEach(baseType => {
      const condition = typeConditions(
        varName,
        baseType,
        addDependency,
        project,
        path,
        arrayDepth,
        true,
        records,
        outFile,
        options
      )
      if (condition !== null) {
        conditions.push(condition)
      }
    })
    if (conditions.length === 0) {
      conditions.push(objectTypeCondition(varName, callable))
    }

    // getProperties does not include methods like `foo(): void`
    const properties = [
      ...declaration.getProperties(),
      ...declaration.getMethods(),
    ].map(p => ({ name: p.getName(), type: p.getType() }))
    conditions.push(
      ...propertiesConditions(
        varName,
        properties,
        addDependency,
        project,
        path,
        arrayDepth,
        records,
        outFile,
        options
      )
    )
    const indexSignatures = declaration
      .getIndexSignatures()
      .map(p => ({ keyType: p.getKeyType(), type: p.getReturnType() }))
    if (indexSignatures.length) {
      conditions.push(
        indexSignaturesCondition(
          varName,
          indexSignatures,
          properties,
          addDependency,
          project,
          path,
          arrayDepth,
          records,
          outFile,
          options
        )
      )
    }
  } else {
    conditions.push(objectTypeCondition(varName, callable))
    // Get object literal properties...
    try {
      const properties = type.getProperties()
      const typeDeclarations = type.getSymbol()?.getDeclarations()

      const propertySignatures = properties.map(p => {
        const propertyDeclarations = p.getDeclarations()
        const typeAtLocation =
          propertyDeclarations.length !== 0
            ? p.getTypeAtLocation(propertyDeclarations[0])
            : p.getTypeAtLocation((typeDeclarations || [])[0])
        return {
          name: p.getName(),
          type: typeAtLocation,
        }
      })
      conditions.push(
        ...propertiesConditions(
          varName,
          propertySignatures,
          addDependency,
          project,
          path,
          arrayDepth,
          records,
          outFile,
          options
        )
      )

      const typeArguments = type.getAliasTypeArguments()
      if (
        type.getAliasSymbol()?.getName() === 'Record' &&
        typeArguments.length === 2
      ) {
        conditions.push(
          indexSignaturesCondition(
            varName,
            [{ keyType: typeArguments[0], type: typeArguments[1] }],
            propertySignatures,
            addDependency,
            project,
            path,
            arrayDepth,
            records,
            outFile,
            options
          )
        )
      }
    } catch (error) {
      if (error instanceof TypeError) {
        // see https://github.com/dsherret/ts-simple-ast/issues/397
        reportError(`Internal ts-simple-ast error for ${type.getText()}`, error)
      }
    }
  }
  return ands(...conditions)
}

function tupleCondition(
  varName: string,
  type: Type,
  addDependency: IAddDependency,
  project: Project,
  path: string,
  arrayDepth: number,
  records: readonly IRecord[],
  outFile: SourceFile,
  options: IProcessOptions
): string {
  const types = type.getTupleElements()
  const conditions = types.reduce(
    (acc, elementType, i) => {
      const condition = typeConditions(
        `${varName}[${i}]`,
        elementType,
        addDependency,
        project,
        path,
        arrayDepth,
        true,
        records,
        outFile,
        options
      )
      if (condition !== null) {
        acc.push(condition)
      }
      return acc
    },
    [`Array.isArray(${varName})`]
  )
  return ands(...conditions)
}

function literalCondition(
  varName: string,
  type: Type,
  addDependency: IAddDependency
): string | null {
  if (type.isEnumLiteral()) {
    const node = type
      .getSymbol()!
      .getDeclarations()
      .find(Node.isEnumMember)!
      .getParent()
    if (node === undefined) {
      reportError("Couldn't find enum literal parent")
      return null
    }
    if (!Node.isEnumDeclaration(node)) {
      reportError('Enum literal parent was not an enum declaration')
      return null
    }
    typeToDependency(type, addDependency)
    // type.getText() returns incorrect module name for some reason
    return eq(
      varName,
      `${node.getSymbol()!.getName()}.${type.getSymbol()!.getName()}`
    )
  }
  return eq(varName, type.getText())
}

function reusedCondition(
  type: Type,
  records: readonly IRecord[],
  outFile: SourceFile,
  addDependency: IAddDependency,
  varName: string
): string | null {
  const record = records.find(x => x.typeDeclaration.getType() === type)
  if (record) {
    if (record.outFile !== outFile) {
      addDependency(record.outFile, record.guardName, false)
    }
    return `${record.guardName}(${varName}) as boolean`
  }
  return null
}

function typeConditions(
  varName: string,
  type: Type,
  addDependency: IAddDependency,
  project: Project,
  path: string,
  arrayDepth: number,
  useGuard: boolean,
  records: readonly IRecord[],
  outFile: SourceFile,
  options: IProcessOptions
): string | null {
  const reused = reusedCondition(type, records, outFile, addDependency, varName)
  if (useGuard && reused) {
    return reused
  }
  if (type.isNull()) {
    return eq(varName, 'null')
  }
  if (type.getText() === 'any' || type.getText() === 'unknown') {
    return null
  }
  if (type.getText() === 'never') {
    return typeOf(varName, 'undefined')
  }
  if (type.isBoolean()) {
    return typeOf(varName, 'boolean')
  }
  if (type.isUnion()) {
    // Seems to be bug here where enums can only be detected with enum
    // literal + union check... odd.
    if (type.isEnumLiteral()) {
      typeToDependency(type, addDependency)
    }
    return typeUnionConditions(
      varName,
      type.getUnionTypes(),
      addDependency,
      project,
      path,
      arrayDepth,
      records,
      outFile,
      options
    )
  }
  if (type.isIntersection()) {
    return typeIntersectionConditions(
      varName,
      type.getIntersectionTypes(),
      addDependency,
      project,
      path,
      arrayDepth,
      records,
      outFile,
      options
    )
  }
  if (type.isArray()) {
    return arrayCondition(
      varName,
      type.getArrayElementType()!,
      addDependency,
      project,
      path,
      arrayDepth,
      records,
      outFile,
      options
    )
  }
  if (isReadonlyArrayType(type)) {
    return arrayCondition(
      varName,
      getReadonlyArrayType(type)!,
      addDependency,
      project,
      path,
      arrayDepth,
      records,
      outFile,
      options
    )
  }
  if (isClassType(type)) {
    typeToDependency(type, addDependency)
    return `${varName} instanceof ${type.getSymbol()!.getName()}`
  }
  if (type.isTuple()) {
    return tupleCondition(
      varName,
      type,
      addDependency,
      project,
      path,
      arrayDepth,
      records,
      outFile,
      options
    )
  }
  if (type.isObject()) {
    return objectCondition(
      varName,
      type,
      addDependency,
      project,
      path,
      arrayDepth,
      records,
      outFile,
      options
    )
  }
  if (type.isLiteral()) {
    return literalCondition(varName, type, addDependency)
  }
  return typeOf(varName, type.getText())
}

function propertyConditions(
  objName: string,
  property: { name: string; type: Type },
  addDependency: IAddDependency,
  project: Project,
  path: string,
  arrayDepth: number,
  records: readonly IRecord[],
  outFile: SourceFile,
  options: IProcessOptions
): string | null {
  const { debug } = options
  const hasSpaces =
    (property.name || '').includes(' ') &&
    [`'`, `"`].every(quote => !(propertyName || '').includes(quote))
  const propertyName = property.name

  const isIdentifier =
    propertyName[0] !== '"' &&
    propertyName[0] !== "'" &&
    !hasSpaces &&
    isNaN(parseInt(propertyName))
  const strippedName = propertyName.replace(/"/g, '')
  const varName = isIdentifier
    ? `${objName}.${propertyName}`
    : `${objName}["${strippedName}"]`
  const propertyPath = isIdentifier
    ? `${path}.${propertyName}`
    : `${path}["${strippedName}"]`

  let expectedType = property.type.getText()
  const conditions = typeConditions(
    varName,
    property.type,
    addDependency,
    project,
    propertyPath,
    arrayDepth,
    true,
    records,
    outFile,
    options
  )
  if (debug) {
    if (expectedType.indexOf('import') > -1) {
      expectedType = expectedType.replace(process.cwd(), '.')
    }
    return (
      conditions &&
      `evaluate(${conditions}, \`${propertyPath}\`, ${JSON.stringify(
        expectedType
      )}, ${varName})`
    )
  }
  return conditions
}

function propertiesConditions(
  varName: string,
  properties: ReadonlyArray<{ name: string; type: Type }>,
  addDependency: IAddDependency,
  project: Project,
  path: string,
  arrayDepth: number,
  records: readonly IRecord[],
  outFile: SourceFile,
  options: IProcessOptions
): string[] {
  return properties
    .map(prop =>
      propertyConditions(
        varName,
        prop,
        addDependency,
        project,
        path,
        arrayDepth,
        records,
        outFile,
        options
      )
    )
    .filter(v => v !== null) as string[]
}

function indexSignatureConditions(
  objName: string,
  keyName: string,
  valueUsed: () => void,
  keyUsed: () => void,
  index: { keyType: Type; type: Type },
  addDependency: IAddDependency,
  project: Project,
  path: string,
  arrayDepth: number,
  records: readonly IRecord[],
  outFile: SourceFile,
  options: IProcessOptions
): string | null {
  const { debug } = options
  const expectedType = index.type.getText()
  const expectedKeyType = index.keyType.getText()
  const conditions = typeConditions(
    objName,
    index.type,
    addDependency,
    project,
    `${path} ${objName}`,
    arrayDepth,
    true,
    records,
    outFile,
    options
  )
  const keyConditions = typeConditions(
    keyName,
    index.keyType,
    addDependency,
    project,
    `${path} ${keyName}`,
    arrayDepth,
    true,
    records,
    outFile,
    options
  )
  if (conditions) {
    valueUsed()
  }
  if (keyConditions) {
    keyUsed()
  }
  if (debug) {
    const cleanKeyReplacer = '${key.toString().replace(/"/g, \'\\\\"\')}'
    const evaluation =
      conditions &&
      `evaluate(${conditions}, \`${path}["${cleanKeyReplacer}"]\`, ${JSON.stringify(
        expectedType
      )}, ${objName})`
    const keyEvaluation =
      keyConditions &&
      `evaluate(${keyConditions}, \`${path} (key: "${cleanKeyReplacer}")\`, ${JSON.stringify(
        expectedKeyType
      )}, ${keyName})`
    if (evaluation || keyEvaluation) {
      keyUsed()
    }
    if (evaluation && keyEvaluation) {
      return ands(evaluation, keyEvaluation)
    }
    return evaluation || keyEvaluation
  }
  if (conditions && keyConditions) {
    return ands(conditions, keyConditions)
  }
  // If we don't have both try and return one, or null if neither
  return conditions || keyConditions
}

function indexSignaturesCondition(
  varName: string,
  indexSignatures: ReadonlyArray<{ keyType: Type; type: Type }>,
  properties: ReadonlyArray<{ name: string; type: Type }>,
  addDependency: IAddDependency,
  project: Project,
  path: string,
  arrayDepth: number,
  records: readonly IRecord[],
  outFile: SourceFile,
  options: IProcessOptions
): string {
  let valuePrefix = '_'
  const valueUsed = () => {
    valuePrefix = ''
  }
  let keyPrefix = '_'
  const keyUsed = () => {
    keyPrefix = ''
  }
  const conditions = ors(
    ...(indexSignatures
      .map(indexSignature =>
        indexSignatureConditions(
          'value',
          'key',
          valueUsed,
          keyUsed,
          indexSignature,
          addDependency,
          project,
          path,
          arrayDepth,
          records,
          outFile,
          options
        )
      )
      .filter(v => v !== null) as string[])
  )
  const staticKeysFilter = properties.length
    ? `
    .filter(([key]) => ![${properties
      .map(({ name }) => `"${name}"`)
      .join(',')}].includes(key))`
    : ''
  return `Object.entries<any>(${varName})${staticKeysFilter}
    .every(([${keyPrefix}key, ${valuePrefix}value]) => ${conditions})`
}

function generateTypeGuard(
  functionName: string,
  typeDeclaration: Guardable,
  addDependency: IAddDependency,
  project: Project,
  records: readonly IRecord[],
  outFile: SourceFile,
  options: IProcessOptions
): string {
  const { debug, shortCircuitCondition } = options
  const typeName = typeDeclaration.getName()
  const defaultArgumentName = lowerFirst(typeName)
  const conditions = typeConditions(
    'obj',
    typeDeclaration.getType(),
    addDependency,
    project,
    '${argumentName}', // tslint:disable-line:no-invalid-template-strings
    0,
    false,
    records,
    outFile,
    options
  )

  const secondArgument = debug
    ? `argumentName: string = "${defaultArgumentName}"`
    : `_argumentName?: string`
  const signature = `export function ${functionName}(obj: any, ${secondArgument}): obj is ${typeName} {\n`
  const shortCircuit = shortCircuitCondition
    ? `if (${shortCircuitCondition}) return true\n`
    : ''

  return [signature, shortCircuit, `return (\n${conditions}\n)\n}\n`].join('')
}

// -- Process project --

interface IImports {
  [exportName: string]: string
}

type Dependencies = Map<SourceFile, IImports>
type IAddDependency = (
  sourceFile: SourceFile,
  exportName: string,
  isDefault: boolean
) => void

function createAddDependency(dependencies: Dependencies): IAddDependency {
  return function addDependency(sourceFile, name, isDefault) {
    const alias = name
    if (isDefault) {
      name = 'default'
    }
    let imports = dependencies.get(sourceFile)
    if (imports === undefined) {
      imports = {}
      dependencies.set(sourceFile, imports)
    }

    const previousAlias = imports[name]
    if (previousAlias !== undefined && previousAlias !== alias) {
      reportError(
        `Conflicting export alias for "${sourceFile.getFilePath()}": "${alias}" vs "${previousAlias}"`
      )
    }

    imports[name] = alias
  }
}

export interface IProcessOptions {
  exportAll?: boolean
  importGuards?: string
  preventExportImported?: boolean
  shortCircuitCondition?: string
  debug?: boolean
  guardFileName?: string
}

export interface IGenerateOptions {
  paths?: ReadonlyArray<string>
  project: string
  processOptions: Readonly<IProcessOptions>
}

const evaluateFunction = `function evaluate(
  isCorrect: boolean,
  varName: string,
  expected: string,
  actual: any
): boolean {
  if (!isCorrect) {
    console.error(
      \`\${varName} type mismatch, expected: \${expected}, found:\`,
      actual
    )
  }
  return isCorrect
}\n`

export async function generate({
  paths = [],
  project: tsConfigFilePath,
  processOptions,
}: Readonly<IGenerateOptions>): Promise<void> {
  const project = new Project({
    skipAddingFilesFromTsConfig: paths.length !== 0,
    tsConfigFilePath,
  })
  project.addSourceFilesAtPaths(paths)
  processProject(project, processOptions)
  return project.save()
}

type Guardable = InterfaceDeclaration | TypeAliasDeclaration | EnumDeclaration

interface IRecord {
  guardName: string
  typeDeclaration: Guardable
  outFile: SourceFile
}

export function processProject(
  project: Project,
  options: Readonly<IProcessOptions> = { debug: false }
): void {
  const guardFileName = options.guardFileName || 'guard'
  if (guardFileName.match(/[*/]/))
    throw new Error('guardFileName must not contain special characters')

  // Delete previously generated guard.
  project
    .getSourceFiles(`./**/*.${guardFileName}.ts`)
    .forEach(sourceFile => deleteGuardFile(sourceFile))

  const sourceFiles = project.getSourceFiles()
  // Sort source files by dependencies - dependencies before dependants
  const orderedSourceFiles: SourceFile[] = []
  const orderSourceFileByDependencies = (
    sourceFile: SourceFile,
    visitedFiles: SourceFile[] = []
  ) => {
    // Ignore if already added as a dependency of another, or if we hit a cyclical import
    if (
      orderedSourceFiles.includes(sourceFile) ||
      visitedFiles.includes(sourceFile)
    ) {
      return
    }
    const childVisitedFiles = [...visitedFiles, sourceFile]
    // Add all dependencies to the ordered list first (if they have beeen specified and have not already been added)
    sourceFile.getImportDeclarations().forEach(importDeclaration => {
      const importSourceFile = importDeclaration.getModuleSpecifierSourceFile()
      if (
        importSourceFile &&
        sourceFiles.includes(importSourceFile) &&
        !orderedSourceFiles.includes(importSourceFile)
      ) {
        orderSourceFileByDependencies(importSourceFile, childVisitedFiles)
      }
    })
    // Add this one to the ordered list
    orderedSourceFiles.push(sourceFile)
  }
  sourceFiles.forEach(sourceFile => orderSourceFileByDependencies(sourceFile))

  // Generate new guard files.
  const records: IRecord[] = []
  orderedSourceFiles.forEach(sourceFile => {
    const dependencies: Dependencies = new Map()
    const addDependency = createAddDependency(dependencies)

    const functions = []
    const exports = Array.from(sourceFile.getExportedDeclarations().values())
    const allTypesDeclarations: Guardable[] = []
    for (const exp of exports) {
      for (const singleExport of exp) {
        if (
          Node.isTypeAliasDeclaration(singleExport) ||
          Node.isInterfaceDeclaration(singleExport) ||
          Node.isEnumDeclaration(singleExport)
        ) {
          allTypesDeclarations.push(singleExport)
        }
      }
    }

    const outFile = project.createSourceFile(
      outFilePath(sourceFile.getFilePath(), guardFileName),
      '',
      { overwrite: true }
    )

    for (const typeDeclaration of allTypesDeclarations) {
      const typeGuardName = getTypeGuardName(typeDeclaration, options)
      if (typeGuardName !== null) {
        records.push({ guardName: typeGuardName, typeDeclaration, outFile })
      }
    }

    for (const typeDeclaration of allTypesDeclarations) {
      const typeGuardName = getTypeGuardName(typeDeclaration, options)
      if (typeGuardName !== null) {
        functions.push(
          generateTypeGuard(
            typeGuardName,
            typeDeclaration,
            addDependency,
            project,
            records,
            outFile,
            options
          )
        )
        addDependency(
          sourceFile,
          typeDeclaration.getName(),
          typeDeclaration.isDefaultExport()
        )
      }
    }

    if (functions.length > 0) {
      if (options.debug) {
        functions.unshift(evaluateFunction)
      }

      outFile.addStatements(functions.join('\n'))

      // Memoize imports within local source file
      const importsMap = new Map<string, string>()
      for (const impDeclaration of sourceFile.getImportDeclarations()) {
        impDeclaration.getNamedImports().forEach(impSpecifier => {
          importsMap.set(
            impSpecifier.getText(),
            impDeclaration.getModuleSpecifierValue()
          )
        })
      }

      outFile.addImportDeclarations(
        Array.from(dependencies.entries()).reduce(
          (structures, [importFile, imports]) => {
            if (outFile === importFile) {
              return structures
            }

            let moduleSpecifier = outFile.getRelativePathAsModuleSpecifierTo(
              importFile
            )

            if (importFile.isInNodeModules()) {
              // Packages within node_modules should not be referenced via relative path
              for (const im in imports) {
                const importDeclaration = importsMap.get(im)
                if (importDeclaration) {
                  moduleSpecifier = importDeclaration
                }
              }
            }

            const defaultImport = imports.default
            delete imports.default
            const namedImports = Object.entries(imports).map(([alias, name]) =>
              alias === name ? name : { name, alias }
            )
            structures.push({
              defaultImport,
              kind: StructureKind.ImportDeclaration,
              moduleSpecifier,
              namedImports,
            })
            return structures
          },
          [] as ImportDeclarationStructure[]
        )
      )

      const path = outFile.getRelativePathTo(sourceFile)
      outFile.insertStatements(
        0,
        [
          `/*`,
          ` * Generated type guards for "${path}".`,
          ` * ${GENERATED_WARNING}`,
          ` */`,
        ].join('\n')
      )
      if (options.importGuards) {
        const relativeOutPath =
          './' +
          outFile
            .getFilePath()
            .split('/')
            .reverse()[0]
            .replace(/\.(ts|tsx|d\.ts)$/, '')
        const importStatement = `import * as ${options.importGuards} from "${relativeOutPath}";`
        const exportStatement = `export { ${options.importGuards} };`
        const {
          hasImport,
          hasExport,
          statements,
        } = sourceFile.getStatements().reduce(
          (reduced, node) => {
            const nodeText = node.getText().replace(/\s{2,}/g, ' ')
            reduced.hasImport ||= nodeText.includes(
              `import * as ${options.importGuards}`
            )
            reduced.hasExport ||= nodeText.includes(
              `export { ${options.importGuards} }`
            )
            reduced.statements += 1
            return reduced
          },
          { hasImport: false, hasExport: false, statements: 0 }
        )
        if (!hasImport) {
          sourceFile.insertStatements(0, importStatement)
        }
        if (!hasExport && !options.preventExportImported) {
          sourceFile.insertStatements(
            !hasImport ? statements + 1 : statements,
            exportStatement
          )
        }
      }

      outFile.formatText()
    } else {
      // This guard file is empty. We did not know that until after the file was created, but at least we can clean it up.
      outFile.delete()
    }
  })
}
