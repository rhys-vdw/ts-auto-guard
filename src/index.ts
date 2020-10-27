import { flatMap, lowerFirst } from 'lodash'
import {
  EnumDeclaration,
  ExportableNode,
  ImportDeclarationStructure,
  InterfaceDeclaration,
  JSDocableNode,
  Node,
  Project,
  SourceFile,
  StructureKind,
  Type,
  TypeAliasDeclaration,
} from 'ts-morph'
import ts from 'typescript'

// -- Helpers --

function reportError(message: string, ...args: any[]) {
  // tslint:disable-next-line:no-console
  console.error(`ERROR: ${message}`, ...args)
}

function findExportableNode(type: Type): (ExportableNode & Node) | null {
  const symbol = type.getSymbol()
  if (symbol === undefined) {
    return null
  }

  return (
    flatMap(symbol.getDeclarations(), d => [d, ...d.getAncestors()])
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

function outFilePath(sourcePath: string) {
  return sourcePath.replace(/\.(ts|tsx|d\.ts)$/, '.guard.ts')
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

function isFunctionType(type: Type): boolean {
  return type.getCallSignatures().length > 0
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
  child: JSDocableNode & Node<ts.Node>,
  options: IProcessOptions
): string | null {
  const jsDocs = child.getJsDocs()
  for (const doc of jsDocs) {
    for (const line of doc.getInnerText().split('\n')) {
      const match = line
        .trim()
        .match(/@see\s+(?:{\s*(\w+)\s*}\s+)?ts-auto-guard:([^\s]*)/)
      if (match !== null) {
        const [, typeGuardName, command] = match
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
    const symbol = t.getSymbol() || t.getAliasSymbol()
    const name = symbol?.getName()
    if (name) {
      return 'is' + name
    }
  }
  return null
}

// -- Main program --

function ors(...statements: string[]): string {
  return statements.join(' || \n')
}

function ands(...statements: string[]): string {
  return statements.join(' && \n')
}

function eq(a: string, b: string): string {
  return `${a} === ${b}`
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
  records: IRecord[],
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
          options
        )
      )
      .filter(v => v !== null) as string[])
  )
  return parens(ors(...conditions))
}

function parens(code: string) {
  return `(\n${code}\n)`
}

function arrayCondition(
  varName: string,
  arrayType: Type,
  addDependency: IAddDependency,
  project: Project,
  path: string,
  arrayDepth: number,
  records: IRecord[],
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
    options
  )

  if (conditions === null) {
    reportError(
      `No conditions for ${varName}, with array type ${arrayType.getText()}`
    )
    // TODO: Or `null`???
    return 'true'
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

function objectTypeCondition(varName: string, type: Type): string {
  return typeOf(varName, isFunctionType(type) ? 'function' : 'object')
}

function objectCondition(
  varName: string,
  type: Type,
  addDependency: IAddDependency,
  project: Project,
  path: string,
  arrayDepth: number,
  records: IRecord[],
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

  if (type.isInterface()) {
    if (!Node.isInterfaceDeclaration(declaration)) {
      throw new TypeError(
        'Extected declaration to be an interface delcaration!'
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
        options
      )
      if (condition !== null) {
        conditions.push(condition)
      }
    })
    if (conditions.length === 0) {
      conditions.push(objectTypeCondition(varName, type))
    }
    conditions.push(
      ...propertiesConditions(
        varName,
        declaration
          .getProperties()
          .map(p => ({ name: p.getName(), type: p.getType() })),
        addDependency,
        project,
        path,
        arrayDepth,
        records,
        options
      )
    )
  } else {
    conditions.push(objectTypeCondition(varName, type))
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
          options
        )
      )
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
  records: IRecord[],
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
  records: IRecord[],
  varName: string
): string | null {
  const record = records.find(x => x.typeDeclaration.getType() === type)
  if (record) {
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
  records: IRecord[],
  options: IProcessOptions
): string | null {
  const reused = reusedCondition(type, records, varName)
  if (useGuard && reused) {
    return reused
  }
  if (type.isNull()) {
    return eq(varName, 'null')
  }
  if (type.getText() === 'any') {
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
      options
    )
  }
  if (type.isIntersection()) {
    return typeUnionConditions(
      varName,
      type.getIntersectionTypes(),
      addDependency,
      project,
      path,
      arrayDepth,
      records,
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
      options
    )
  }
  if (isClassType(type)) {
    typeToDependency(type, addDependency)
    return `${varName} instanceof ${type.getSymbol()!.getName()}`
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
      options
    )
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
  records: IRecord[],
  options: IProcessOptions
): string | null {
  const { debug } = options
  const propertyName = property.name

  const varName = `${objName}.${propertyName}`
  const propertyPath = `${path}.${propertyName}`
  const expectedType = property.type.getText()
  const conditions = typeConditions(
    varName,
    property.type,
    addDependency,
    project,
    propertyPath,
    arrayDepth,
    true,
    records,
    options
  )
  if (debug) {
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
  records: IRecord[],
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
        options
      )
    )
    .filter(v => v !== null) as string[]
}

function generateTypeGuard(
  functionName: string,
  typeDeclaration: Guardable,
  addDependency: IAddDependency,
  project: Project,
  records: IRecord[],
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
  shortCircuitCondition?: string
  debug?: boolean
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
    addFilesFromTsConfig: paths.length === 0,
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
}

export function processProject(
  project: Project,
  options: Readonly<IProcessOptions> = { debug: false }
) {
  // Delete previously generated guard.
  project
    .getSourceFiles('./**/*.guard.ts')
    .forEach(sourceFile => sourceFile.delete())

  // Generate new guard files.
  project.getSourceFiles().forEach(sourceFile => {
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

    const records: IRecord[] = []

    for (const typeDeclaration of allTypesDeclarations) {
      const typeGuardName = getTypeGuardName(typeDeclaration, options)
      if (typeGuardName !== null) {
        records.push({ guardName: typeGuardName, typeDeclaration })
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

      const outFile = project.createSourceFile(
        outFilePath(sourceFile.getFilePath()),
        functions.join('\n'),
        { overwrite: true }
      )

      outFile.addImportDeclarations(
        Array.from(dependencies.entries()).reduce(
          (structures, [importFile, imports]) => {
            if (outFile === importFile) {
              return structures
            }
            const moduleSpecifier = outFile.getRelativePathAsModuleSpecifierTo(
              importFile
            )
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
          ` * WARNING: Do not manually change this file.`,
          ` */`,
        ].join('\n')
      )

      outFile.formatText()
    }
  })

  return project.save()
}
