import { flatMap } from 'lodash'
import Project, {
  ExportableNode,
  JSDoc,
  Node,
  PropertySignature,
  SourceFile,
  Type,
  TypeGuards,
} from 'ts-simple-ast'

// -- Types --

interface IDependency {
  sourceFile: SourceFile
  name: string
  isDefault: boolean
}

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

function typeToDependency(type: Type): IDependency | null {
  const exportable = findExportableNode(type)
  if (exportable === null) {
    return null
  }

  const sourceFile = exportable.getSourceFile()
  const name = exportable.getSymbol()!.getName()
  const isDefault = exportable.isDefaultExport()

  if (!exportable.isExported()) {
    reportError(`${name} is not exported from ${sourceFile.getFilePath()}`)
  }

  return { sourceFile, name, isDefault }
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

function getTypeGuardName(jsDocs: JSDoc[]): string | null {
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
  isOptional: boolean,
  dependencies: IDependency[],
  project: Project
): string {
  const conditions: string[] = []
  if (isOptional && types.findIndex(type => type.isUndefined()) === -1) {
    conditions.push(typeOf(varName, 'undefined'))
  }
  conditions.push(
    ...(types
      .map(type => typeConditions(varName, type, false, dependencies, project))
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
  dependencies: IDependency[],
  project: Project
): string {
  if (arrayType.getText() === 'never') {
    return ands(`Array.isArray(${varName})`, eq(`${varName}.length`, '0'))
  }
  const conditions = typeConditions(
    'e',
    arrayType,
    false,
    dependencies,
    project
  )
  if (conditions === null) {
    reportError(
      `No conditions for ${varName}, with array type ${arrayType.getText()}`
    )
  }
  return ands(
    `Array.isArray(${varName})`,
    `${varName}.every(e =>\n${conditions}\n)`
  )
}

function typeConditions(
  varName: string,
  type: Type,
  isOptional: boolean,
  dependencies: IDependency[],
  project: Project,
  useGuard: boolean = true
): string | null {
  function addDependency(dependencyType: Type) {
    const dependency = typeToDependency(dependencyType)
    if (dependency !== null) {
      dependencies.push(dependency)
    }
  }
  if (type.isNull()) {
    return eq(varName, "null")
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
      addDependency(type)
    }
    return typeUnionConditions(
      varName,
      type.getUnionTypes(),
      isOptional,
      dependencies,
      project
    )
  }
  if (type.isIntersection()) {
    return typeUnionConditions(
      varName,
      type.getIntersectionTypes(),
      isOptional,
      dependencies,
      project
    )
  }
  if (isOptional) {
    return typeUnionConditions(
      varName,
      [type],
      isOptional,
      dependencies,
      project
    )
  }
  if (type.isArray()) {
    return arrayCondition(varName, type.getArrayType()!, dependencies, project)
  }
  if (isReadonlyArrayType(type)) {
    return arrayCondition(
      varName,
      getReadonlyArrayType(type)!,
      dependencies,
      project
    )
  }
  if (isClassType(type)) {
    addDependency(type)
    return `${varName} instanceof ${type.getSymbol()!.getName()}`
  }
  if (type.isObject()) {
    const conditions = [
      typeOf(varName, isFunctionType(type) ? 'function' : 'object'),
    ]

    if (type.isInterface()) {
      const declarations = type.getSymbol()!.getDeclarations()
      const docs = flatMap(
        declarations,
        d => (TypeGuards.isJSDocableNode(d) ? d.getJsDocs() : [])
      )
      const declaration = declarations.find(TypeGuards.isInterfaceDeclaration)
      if (declaration === undefined) {
        reportError(`Couldn't find declaration for type ${type.getText()}`)
        return null
      }

      const typeGuardName = getTypeGuardName(docs)
      if (useGuard && typeGuardName !== null) {
        // TODO: This line returns the path lower cased.
        // https://github.com/dsherret/ts-simple-ast/issues/394
        const sourcePath = declaration.getSourceFile()!.getFilePath()

        dependencies.push({
          isDefault: false,
          name: typeGuardName,
          sourceFile: findOrCreate(project, outFilePath(sourcePath)),
        })

        // NOTE: Cast to boolean to stop type guard property and prevent compile
        //       errors.
        return `${typeGuardName}(${varName}) as boolean`
      }

      if (!useGuard || typeGuardName === null) {
        declaration.getBaseTypes().forEach(baseType => {
          const condition = typeConditions(
            varName,
            baseType,
            false,
            dependencies,
            project
          )
          if (condition !== null) {
            conditions.push(condition)
          }
        })
        conditions.push(
          ...propertiesConditions(
            varName,
            declaration.getProperties(),
            dependencies,
            project
          )
        )
      }
    } else {
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
            dependencies,
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
  if (type.isTuple()) {
    const types = type.getTupleElements()
    const conditions = types.reduce(
      (acc, elementType, i) => {
        const condition = typeConditions(
          `${varName}[${i}]`,
          elementType,
          false,
          dependencies,
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
  if (type.isLiteral()) {
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
      addDependency(type)
    }
    return eq(varName, type.getText())
  }
  return typeOf(varName, type.getText())
}

function propertyConditions(
  objName: string,
  property: PropertySignature,
  dependencies: IDependency[],
  project: Project
): string | null {
  const varName = `${objName}.${property.getName()}`
  return typeConditions(
    varName,
    property.getType(),
    property.hasQuestionToken(),
    dependencies,
    project
  )
}

function propertiesConditions(
  varName: string,
  properties: ReadonlyArray<PropertySignature>,
  dependencies: IDependency[],
  project: Project
): string[] {
  return properties
    .map(prop => propertyConditions(varName, prop, dependencies, project))
    .filter(v => v !== null) as string[]
}

function generateTypeGuard(
  functionName: string,
  typeName: string,
  type: Type,
  dependencies: IDependency[],
  project: Project
): string {
  const conditions = typeConditions(
    'obj',
    type,
    false,
    dependencies,
    project,
    false
  )

  return `
        export function ${functionName}(obj: any): obj is ${typeName} {
            return (
                ${conditions}
            )
        }
    `
}

// -- Process project --

function findOrCreate(project: Project, path: string): SourceFile {
  let outFile = project.getSourceFile(path)
  if (outFile === undefined) {
    outFile = project.createSourceFile(path)
  }
  return outFile
}

function clearOrCreate(project: Project, path: string): SourceFile {
  return project.createSourceFile(path, '', { overwrite: true })
}

export function generate(paths: string[]) {
  const project = new Project()
  project.addExistingSourceFiles(paths)

  project.getSourceFiles().forEach(sourceFile => {
    const dependencies: IDependency[] = []
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
              return acc
            }
            acc.push(
              generateTypeGuard(
                typeGuardName,
                child.getName(),
                child.getType(),
                dependencies,
                project
              )
            )
            dependencies.push({
              isDefault: child.isDefaultExport(),
              name: child.getName(),
              sourceFile,
            })
          } else {
            reportError(`Unsupported:\n\n${child.getText()}\n`)
            return acc
          }
          return acc
        },
        [] as string[]
      )

    if (functions.length > 0) {
      const outPath = outFilePath(sourceFile.getFilePath())
      const outFile = clearOrCreate(project, outPath)

      // Dedupe imports
      const imports = dependencies.reduce(
        (acc, { sourceFile: dependencyFile, isDefault, name }) => {
          if (!acc.has(dependencyFile)) {
            acc.set(dependencyFile, {
              default: undefined,
              named: new Set<string>(),
            })
          }
          const element = acc.get(dependencyFile)!
          if (isDefault) {
            if (element.default !== undefined && element.default !== name) {
              reportError(
                `Conflicting default export for "${dependencyFile.getFilePath()}": "${name}" vs "${
                  element.default
                }"`
              )
            }
            element.default = name
          } else {
            element.named.add(name)
          }
          return acc
        },
        new Map<
          SourceFile,
          { default: string | undefined; named: Set<string> }
        >()
      )

      // Add import declarations
      for (const [
        importFile,
        { default: defaultImport, named },
      ] of imports.entries()) {
        // Don't self-import
        if (importFile !== outFile) {
          outFile.addImportDeclaration({
            defaultImport,
            moduleSpecifier: outFile.getRelativePathAsModuleSpecifierTo(
              importFile
            ),
            namedImports: Array.from(named),
          })
        }
      }

      outFile.addStatements(functions.join('\n'))

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
