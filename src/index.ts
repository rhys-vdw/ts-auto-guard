import { flatMap } from 'lodash'
import Project, {
  ExportableNode,
  ImportDeclarationStructure,
  JSDoc,
  JSDocableNode,
  Node,
  PropertySignature,
  SourceFile,
  SyntaxKind,
  Type,
  TypeGuards,
} from 'ts-simple-ast'

// -- Helpers --

function reportError(message: string, ...args: any[]) {
  // tslint:disable-next-line:no-console
  console.error(`ERROR: ${message}`, ...args)
}

function findExportableNode(type: Type): ExportableNode & Node | null {
  const symbol = type.getSymbol()
  if (symbol === undefined) {
    return null
  }

  return (
    flatMap(symbol.getDeclarations(), d => [d, ...d.getAncestors()])
      .filter(TypeGuards.isExportableNode)
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
    if (TypeGuards.isClassDeclaration(declaration)) {
      return true
    }
    if (
      TypeGuards.isVariableDeclaration(declaration) &&
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

function getTypeGuardName(jsDocs: ReadonlyArray<JSDoc>): string | null {
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
  project: Project
): string {
  const conditions: string[] = []
  conditions.push(
    ...(types
      .map(type => typeConditions(varName, type, addDependency, project))
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
  project: Project
): string {
  if (arrayType.getText() === 'never') {
    return ands(`Array.isArray(${varName})`, eq(`${varName}.length`, '0'))
  }
  const conditions = typeConditions('e', arrayType, addDependency, project)
  if (conditions === null) {
    reportError(
      `No conditions for ${varName}, with array type ${arrayType.getText()}`
    )
  }
  return ands(
    `Array.isArray(${varName})`,
    `${varName}.every((e: any) =>\n${conditions}\n)`
  )
}

function objectTypeCondition(varName: string, type: Type): string {
  return typeOf(varName, isFunctionType(type) ? 'function' : 'object')
}

function objectCondition(
  varName: string,
  type: Type,
  addDependency: IAddDependency,
  useGuard: boolean,
  project: Project
): string | null {
  const conditions: string[] = []

  const declarations = type.getSymbol()!.getDeclarations()

  // TODO: https://github.com/rhys-vdw/ts-auto-guard/issues/29
  const declaration = declarations[0]

  if (declaration === undefined) {
    reportError(`Couldn't find declaration for type ${type.getText()}`)
    return null
  }

  // JSDoc is attached to the type alias rather than the object literal in the
  // case of eg. `type Foo = { x: number }`
  const docNode: JSDocableNode | null = TypeGuards.isJSDocableNode(declaration)
    ? declaration
    : declaration.getParentIfKind(SyntaxKind.TypeAliasDeclaration) || null

  const typeGuardName =
    docNode === null ? null : getTypeGuardName(docNode.getJsDocs())

  if (useGuard && typeGuardName !== null) {
    const sourcePath = declaration.getSourceFile()!.getFilePath()

    addDependency(
      findOrCreate(project, outFilePath(sourcePath)),
      typeGuardName,
      false
    )

    // NOTE: Cast to boolean to stop type guard property and prevent compile
    //       errors.
    return `${typeGuardName}(${varName}) as boolean`
  }

  if (type.isInterface()) {
    if (!useGuard || typeGuardName === null) {
      if (!TypeGuards.isInterfaceDeclaration(declaration)) {
        throw new TypeError(
          'Extected declaration to be an interface delcaration!'
        )
      }
      declaration.getBaseTypes().forEach(baseType => {
        const condition = typeConditions(
          varName,
          baseType,
          addDependency,
          project
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
          declaration.getProperties(),
          addDependency,
          project
        )
      )
    }
  } else {
    conditions.push(objectTypeCondition(varName, type))
    // Get object literal properties...
    try {
      const properties = type.getProperties()
      const propertySignatures = properties.map(
        p => p.getDeclarations()[0] as PropertySignature
      )
      conditions.push(
        ...propertiesConditions(
          varName,
          propertySignatures,
          addDependency,
          project
        )
      )
    } catch (error) {
      if (error instanceof TypeError) {
        // see https://github.com/dsherret/ts-simple-ast/issues/397
        reportError(
          `ERROR: Internal ts-simple-ast error for ${type.getText()}`,
          error
        )
      }
    }
  }
  return ands(...conditions)
}

function tupleCondition(
  varName: string,
  type: Type,
  addDependency: IAddDependency,
  project: Project
): string {
  const types = type.getTupleElements()
  const conditions = types.reduce(
    (acc, elementType, i) => {
      const condition = typeConditions(
        `${varName}[${i}]`,
        elementType,
        addDependency,
        project
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
      .find(TypeGuards.isEnumMember)!
      .getParent()
    if (node === undefined) {
      reportError("Couldn't find enum literal parent")
      return null
    }
    if (!TypeGuards.isEnumDeclaration(node)) {
      reportError('Enum literal parent was not an enum declaration')
      return null
    }
    typeToDependency(type, addDependency)
  }
  return eq(varName, type.getText())
}

function typeConditions(
  varName: string,
  type: Type,
  addDependency: IAddDependency,
  project: Project,
  useGuard: boolean = true
): string | null {
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
      project
    )
  }
  if (type.isIntersection()) {
    return typeUnionConditions(
      varName,
      type.getIntersectionTypes(),
      addDependency,
      project
    )
  }
  if (type.isArray()) {
    return arrayCondition(varName, type.getArrayType()!, addDependency, project)
  }
  if (isReadonlyArrayType(type)) {
    return arrayCondition(
      varName,
      getReadonlyArrayType(type)!,
      addDependency,
      project
    )
  }
  if (isClassType(type)) {
    typeToDependency(type, addDependency)
    return `${varName} instanceof ${type.getSymbol()!.getName()}`
  }
  if (type.isObject()) {
    return objectCondition(varName, type, addDependency, useGuard, project)
  }
  if (type.isTuple()) {
    return tupleCondition(varName, type, addDependency, project)
  }
  if (type.isLiteral()) {
    return literalCondition(varName, type, addDependency)
  }
  return typeOf(varName, type.getText())
}

function propertyConditions(
  objName: string,
  property: PropertySignature,
  addDependency: IAddDependency,
  project: Project
): string | null {
  const varName = `${objName}.${property.getName()}`
  return typeConditions(varName, property.getType(), addDependency, project)
}

function propertiesConditions(
  varName: string,
  properties: ReadonlyArray<PropertySignature>,
  addDependency: IAddDependency,
  project: Project
): string[] {
  return properties
    .map(prop => propertyConditions(varName, prop, addDependency, project))
    .filter(v => v !== null) as string[]
}

function generateTypeGuard(
  functionName: string,
  typeName: string,
  type: Type,
  addDependency: IAddDependency,
  project: Project,
  shortCircuitCondition: string | undefined
): string {
  const conditions = typeConditions('obj', type, addDependency, project, false)

  return `
    export function ${functionName}(obj: any): obj is ${typeName} {
        return (
            ${
              shortCircuitCondition ? `${shortCircuitCondition} ||\n` : ''
            }${conditions}
        )
    }`
}

// -- Process project --

function findOrCreate(project: Project, path: string): SourceFile {
  let outFile = project.getSourceFile(path)
  if (outFile === undefined) {
    outFile = project.createSourceFile(path)
  }
  return outFile
}

interface Imports {
  [exportName: string]: string
}
type Dependencies = Map<SourceFile, Imports>
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
  shortCircuitCondition?: string
}

export interface IGenerateOptions {
  paths?: ReadonlyArray<string>
  project: string
  processOptions: Readonly<IProcessOptions>
}

export async function generate({
  paths = [],
  project: tsConfigFilePath,
  processOptions,
}: Readonly<IGenerateOptions>): Promise<void> {
  const project = new Project({
    addFilesFromTsConfig: paths.length === 0,
    tsConfigFilePath,
  })
  project.addExistingSourceFiles(paths)
  processProject(project, processOptions)
  return project.save()
}

export function processProject(
  project: Project,
  options: Readonly<IProcessOptions> = {}
) {
  // Delete previously generated guard.
  project
    .getSourceFiles('./**/*.guard.ts')
    .forEach(sourceFile => sourceFile.delete())

  // Generate new guard files.
  project.getSourceFiles().forEach(sourceFile => {
    const dependencies: Dependencies = new Map()
    const addDependency = createAddDependency(dependencies)
    const functions = sourceFile
      .getChildAtIndex(0)
      .getChildren()
      .reduce(
        (acc, child) => {
          if (!TypeGuards.isJSDocableNode(child)) {
            return acc
          }
          const typeGuardName = getTypeGuardName(child.getJsDocs())
          if (typeGuardName === null) {
            return acc
          }
          if (!TypeGuards.isExportableNode(child)) {
            reportError(`Must be exportable:\n\n${child.getText()}\n`)
            return acc
          }
          if (
            TypeGuards.isEnumDeclaration(child) ||
            TypeGuards.isInterfaceDeclaration(child) ||
            TypeGuards.isTypeAliasDeclaration(child)
          ) {
            if (!child.isExported()) {
              reportError(`Node must be exported:\n\n${child.getText()}\n`)
            }
            acc.push(
              generateTypeGuard(
                typeGuardName,
                child.getName(),
                child.getType(),
                addDependency,
                project,
                options.shortCircuitCondition
              )
            )
            const exportName = child.getName()
            addDependency(sourceFile, exportName, child.isDefaultExport())
          } else {
            reportError(`Unsupported:\n\n${child.getText()}\n`)
            return acc
          }
          return acc
        },
        [] as string[]
      )

    if (functions.length > 0) {
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
            const namedImports = Object.entries(imports).map(
              ([alias, name]) => (alias === name ? name : { name, alias })
            )
            structures.push({
              defaultImport,
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
