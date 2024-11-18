/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { FileUtils } from '@ts-morph/common'
import {
  EnumDeclaration,
  ExportableNode,
  ImportDeclarationStructure,
  InterfaceDeclaration,
  MethodSignature,
  Node,
  Project,
  PropertySignature,
  SourceFile,
  StructureKind,
  Type,
  TypeAliasDeclaration,
} from 'ts-morph'

const GENERATED_WARNING = 'WARNING: Do not manually change this file.'

/** Matches the supported file extensions of this project. */
const fileExtensionRegex = /\.(ts|mts|cts|tsx|d\.ts)$/iu

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
      .filter(Node.isExportable)
      .find(n => n.isExported()) || null
  )
}

function propertyName(signature: PropertySignature | MethodSignature): string {
  return (
    signature.getNameNode().getSymbol()?.compilerSymbol.escapedName ??
    signature.getName()
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

/**
 * Computes the file name of the generated type guard.
 * @param sourcePath Path of the file that is being analyzed for type information.
 * @param guardFileName Suffix to append to the source file name to prevent conflict.
 * @returns Computed file name of the newly generated type guard.
 */
function outFilePath(sourcePath: string, guardFileName: string): string {
  /** Flag that indicates if Common JS module mode was specified. */
  const cjsModuleMode = sourcePath.endsWith('cts')

  /** Flag that indicates if ECMAScript Module mode was specified. */
  const esmModuleMode = sourcePath.endsWith('mts')

  /** Name of the file to output the generated type guard. */
  const outPath = sourcePath.replace(
    fileExtensionRegex,
    `.${guardFileName}.${cjsModuleMode ? 'cts' : esmModuleMode ? 'mts' : 'ts'}`
  )

  // Ensure that the new file name is not the same as the original file to prevent overwrite
  if (outPath === sourcePath) {
    throw new Error(
      'Internal Error: sourcePath and outFilePath are identical: ' + outPath
    )
  }

  // Return the output path to the caller
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
): { kind: 'generated' | 'custom'; typeGuardName: string } | null {
  const jsDocs = child.getJsDocs()
  for (const doc of jsDocs) {
    for (const line of doc.getInnerText().split('\n')) {
      const match = line
        .trim()
        .match(/@see\s+(?:{\s*(@link\s*)?(\w+)\s*}\s+)?ts-auto-guard:([^\s]*)/)
      if (match !== null) {
        const [, , typeGuardName, command] = match
        if (command === 'custom') {
          return { kind: 'custom', typeGuardName }
        }
        if (command === 'type-guard') {
          return { kind: 'generated', typeGuardName }
        }
        reportError(`command ${command} is not supported!`)
        return null
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
    if (name) {
      return { kind: 'generated', typeGuardName: 'is' + name }
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

function indexKeyTypeToString(type: Type): IndexKeyType {
  switch (true) {
    case type.isString():
      return 'string'
    case type.isNumber():
      return 'number'
    case type.isAny():
      return 'any'
    default:
      throw new Error(
        `Invalid type for index key: ${type.getText()}. Only string or number are expected.`
      )
  }
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
    ].map(p => ({
      name: propertyName(p),
      type: p.getType(),
    }))
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
          indexSignatures.map(x => ({
            keyType: indexKeyTypeToString(x.keyType),
            type: x.type,
          })),
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
      const stringIndexType = type.getStringIndexType()
      if (stringIndexType) {
        conditions.push(
          indexSignaturesCondition(
            varName,
            [{ keyType: 'string', type: stringIndexType }],
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

      const numberIndexType = type.getNumberIndexType()
      if (numberIndexType) {
        conditions.push(
          indexSignaturesCondition(
            varName,
            [{ keyType: 'number', type: numberIndexType }],
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
  const propertyName = property.name

  const strippedName = propertyName.replace(/"/g, '')
  const varName = `${objName}["${strippedName}"]`
  const propertyPath = `${path}["${strippedName}"]`

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
      const standardizedCwd = FileUtils.standardizeSlashes(process.cwd())
      expectedType = expectedType.replace(standardizedCwd, '.')
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function assertNever<T>(_: never): T {
  throw new Error('should be unreachable.')
}

function signatureKeyConditions(
  keyType: IndexKeyType,
  varName: string
): string | null {
  if (keyType === 'string') {
    return typeOf(varName, 'string')
  } else if (keyType === 'number') {
    return `(+${varName}).toString() === ${varName}`
  } else if (keyType === 'any') {
    return null
  } else {
    return assertNever(keyType)
  }
}

function indexSignatureConditions(
  objName: string,
  keyName: string,
  valueUsed: () => void,
  keyUsed: () => void,
  index: { keyType: IndexKeyType; type: Type },
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
  const keyConditions = signatureKeyConditions(index.keyType, keyName)
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
        index.keyType
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

type IndexKeyType = 'string' | 'number' | 'any'

function indexSignaturesCondition(
  varName: string,
  indexSignatures: ReadonlyArray<{ keyType: IndexKeyType; type: Type }>,
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
  const signatureObjName = 'obj'
  const innerObjName = 'typedObj'
  const conditions = typeConditions(
    innerObjName,
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
    ? `, argumentName: string = "${defaultArgumentName}"`
    : ''
  const signature = `export function ${functionName}(${signatureObjName}: unknown${secondArgument}): ${signatureObjName} is ${typeName} {\n`
  const shortCircuit = shortCircuitCondition
    ? `if (${shortCircuitCondition}) return true\n`
    : ''

  const functionBody = `const ${innerObjName} = ${signatureObjName} as ${typeName}\nreturn (\n${
    conditions || true
  }\n)\n}\n`

  return [signature, shortCircuit, functionBody].join('')
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
  importExtension?: string
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

function isGuardable(value: Node): value is Guardable {
  return (
    Node.isTypeAliasDeclaration(value) ||
    Node.isInterfaceDeclaration(value) ||
    Node.isEnumDeclaration(value)
  )
}

interface IRecord {
  guardName: string
  typeDeclaration: Guardable
  outFile: SourceFile
}

export function processProject(
  project: Project,
  options: Readonly<IProcessOptions> = { debug: false }
): void {
  const importExtension = options.importExtension
    ? `.${options.importExtension}`
    : ''
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
      .flat()
      .filter(ex => ex.getSourceFile() === sourceFile)

    const allTypesDeclarations = exports.filter(isGuardable)

    const outFile = project.createSourceFile(
      outFilePath(sourceFile.getFilePath(), guardFileName),
      '',
      { overwrite: true }
    )

    for (const typeDeclaration of allTypesDeclarations) {
      const rule = getTypeGuardName(typeDeclaration, options)
      if (rule !== null) {
        const { kind, typeGuardName } = rule
        if (kind === 'custom') {
          records.push({
            guardName: typeGuardName,
            typeDeclaration,
            outFile: sourceFile,
          })
        } else if (kind === 'generated') {
          records.push({ guardName: typeGuardName, typeDeclaration, outFile })
        }
      }
    }

    for (const typeDeclaration of allTypesDeclarations) {
      const rule = getTypeGuardName(typeDeclaration, options)
      if (rule !== null) {
        const { kind, typeGuardName } = rule
        if (kind === 'generated') {
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

            let moduleSpecifier =
              outFile.getRelativePathAsModuleSpecifierTo(importFile) +
              importExtension

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
            .replace(fileExtensionRegex, '')
        const importStatement = `import * as ${options.importGuards} from "${relativeOutPath}${importExtension}";`
        const exportStatement = `export { ${options.importGuards} };`
        const { hasImport, hasExport, statements } = sourceFile
          .getStatements()
          .reduce(
            (reduced, node) => {
              const nodeText = node.getText().replace(/\s{2,}/g, ' ')
              reduced.hasImport ||= nodeText.includes(
                `import * as ${options.importGuards}${importExtension}`
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
