import Project, { InterfaceDeclaration, PropertySignature, Type, TypeGuards, JSDoc, ExportableNode, Node, SourceFile } from 'ts-simple-ast'
import { flatMap } from "lodash"

// -- Types --

interface Dependency {
    sourceFile: SourceFile,
    name: string,
    isDefault: boolean,
}

// -- Helpers --

function findExportableNode(type: Type): ExportableNode & Node | null {
    const symbol = type.getSymbol()
    if (symbol === undefined) {
        return null
    }

    return flatMap(
        symbol.getDeclarations(),
        d => [d, ...d.getAncestors()]
    ).filter(TypeGuards.isExportableNode).find(n => n.isExported()) || null
}

function typeToDependency(type: Type): Dependency | null {
    const exportable = findExportableNode(type)
    if (exportable === null) {
        return null
    }

    const sourceFile = exportable.getSourceFile()
    const name = exportable.getSymbol()!.getName()
    const isDefault = exportable.isDefaultExport()

    if (!exportable.isExported()) {
        console.error(`ERROR: ${name} is not exported from ${sourceFile.getFilePath()}`)
    }

    return { sourceFile, name, isDefault }
}

function outFilePath(sourcePath: string) {
    return sourcePath.replace(/\.(ts|tsx|d\.ts)$/, "\.guard.ts")
}

// https://github.com/dsherret/ts-simple-ast/issues/108#issuecomment-342665874
function isClassType(type: Type): boolean {
    if (type.getConstructSignatures().length > 0)
        return true;

    const symbol = type.getSymbol();
    if (symbol == null)
        return false;

    for (const declaration of symbol.getDeclarations()) {
        if (TypeGuards.isClassDeclaration(declaration))
            return true;
        if (TypeGuards.isVariableDeclaration(declaration) && declaration.getType().getConstructSignatures().length > 0)
            return true;
    }

    return false;
}

function isReadonlyArrayType(type: Type): boolean {
    const symbol = type.getSymbol()
    if (symbol === undefined) {
        return false
    }
    return symbol.getName() === "ReadonlyArray" && type.getTypeArguments().length === 1
}

function getReadonlyArrayType(type: Type): Type | undefined {
    return type.getTypeArguments()[0]
}

function getTypeGuardName(typeName: string, jsDocs: JSDoc[]): string | null {
    for (const doc of jsDocs) {
        for (const line of doc.getInnerText().split("\n")) {
            const match = line.trim().match(
                /@see\s+(?:{\s*(\w+)\s*}\s+)?ts-auto-guard:([^\s]*)/
            )
            if (match !== null) {
                const [, typeGuardName, command] = match
                if (command !== "type-guard") {
                    console.error(`ERROR: command ${command} is not supported!`)
                    return null
                }
                return typeGuardName || `is${typeName}`;
            }
        }
    }
    return null
}

// -- Main program --

function ors(...statements: string[]): string {
    return statements.join(" || \n")
}

function ands(...statements: string[]): string {
    return statements.join(" && \n")
}

function eq(a: string, b: string): string {
    return `${a} === ${b}`
}

function typeOf(varName: string, type: string): string {
    return eq(`typeof ${varName}`, `"${type}"`)
}

function typeUnionConditions(varName: string, types: Type[], isOptional: boolean, dependencies: Dependency[], project: Project): string {
    const conditions: string[] = []
    if (isOptional && types.findIndex(type => type.isUndefined()) === -1) {
        conditions.push(typeOf(varName, "undefined"))
    }
    conditions.push(...types
        .map(type => typeConditions(varName, type, false, dependencies, project))
        .filter((v) => v !== null) as string[]
    )
    return parens(ors(...conditions))
}

function parens(code: string) {
    return `(\n${code}\n)`
}

function arrayCondition(varName: string, arrayType: Type, dependencies: Dependency[], project: Project): string {
    if (arrayType.getText() === "never") return ands(
            `Array.isArray(${varName})`,
            eq(`${varName}.length`, '0'),
    )
    const conditions = typeConditions("e", arrayType, false, dependencies, project)
    if (conditions === null) {
        console.error(`ERROR: No conditions for ${varName}, with array type ${arrayType.getText()}`)
    }
    return ands(
        `Array.isArray(${varName})`,
        `${varName}.every(e =>\n${conditions}\n)`
    )
}

function typeConditions(varName: string, type: Type, isOptional: boolean, dependencies: Dependency[], project: Project): string | null {
    function addDependency(type: Type) {
        const dependency = typeToDependency(type)
        if (dependency !== null) {
            dependencies.push(dependency)
        }
    }
    if (type.getText() === "any") {
        return null
    }
    if (type.getText() === "never") {
        return typeOf(varName, "undefined")
    }
    if (type.isUnion()) {
        // Seems to be bug here where enums can only be detected with enum
        // literal + union check... odd.
        if (type.isEnumLiteral()) {
            addDependency(type)
        }
        return typeUnionConditions(varName, type.getUnionTypes(), isOptional, dependencies, project)
    }
    if (type.isIntersection()) {
        return typeUnionConditions(varName, type.getIntersectionTypes(), isOptional, dependencies, project)
    }
    if (isOptional) {
        return typeUnionConditions(varName, [type], isOptional, dependencies, project)
    }
    if (type.isArray()) {
        return arrayCondition(varName, type.getArrayType()!, dependencies, project)
    }
    if (isReadonlyArrayType(type)) {
        return arrayCondition(varName, getReadonlyArrayType(type)!, dependencies, project)
    }
    if (isClassType(type)) {
        addDependency(type)
        return `${varName} instanceof ${type.getSymbol()!.getName()}`
    }
    if (type.isInterface()) {
        const declarations = type.getSymbol()!.getDeclarations();
        const docs = flatMap(declarations, d =>
            TypeGuards.isJSDocableNode(d) ? d.getJsDocs() : []
        )
        const declaration = declarations.find(TypeGuards.isInterfaceDeclaration);
        if (declaration === undefined) {
            console.error(`ERROR: Couldn't find declaration for type ${type.getText()}`)
            return null
        }
        const typeGuardName = getTypeGuardName(declaration.getName(), docs)
        if (typeGuardName === null) {
            return objectConditions(varName, declaration.getProperties(), dependencies, project)
        }

        // TODO: This line returns the path lower cased.
        // https://github.com/dsherret/ts-simple-ast/issues/394
        const sourcePath = declaration.getSourceFile()!.getFilePath()

        dependencies.push({
            name: typeGuardName,
            sourceFile: findOrCreate(project, outFilePath(sourcePath)),
            isDefault: false
        })

        return `${typeGuardName}(${varName})`
    }
    if (type.isTuple()) {
        const types = type.getTupleElements()
        const conditions = types.reduce((acc, type, i) => {
            const condition = typeConditions(`${varName}[${i}]`, type, false, dependencies, project)
            if (condition !== null) acc.push(condition)
            return acc
        }, [`Array.isArray(${varName})`])
        return ands(...conditions)
    }
    if (type.isObject()) {
        const properties = type.getProperties().map(p => p.getDeclarations()[0] as PropertySignature)
        return objectConditions(varName, properties, dependencies, project)
    }
    if (type.isLiteral()) {
        return eq(varName, type.getText())
    }
    return typeOf(varName, type.getText())
}

function propertyConditions(objName: string, property: PropertySignature, dependencies: Dependency[], project: Project): string | null {
    const varName = `${objName}.${property.getName()}`;
    return typeConditions(varName, property.getType(), property.hasQuestionToken(), dependencies, project)
}

function propertiesConditions(varName: string, properties: ReadonlyArray<PropertySignature>, dependencies: Dependency[], project: Project): string[] {
    return properties.map(prop => propertyConditions(varName, prop, dependencies, project)).filter(v => v !== null) as string[]
}

function objectConditions(varName: string, properties: ReadonlyArray<PropertySignature>, dependencies: Dependency[], project: Project): string {
    return ands(
        typeOf(varName, "object"),
        ...propertiesConditions(varName, properties, dependencies, project)
    )
}

function generateTypeGuard(functionName: string, iface: InterfaceDeclaration, dependencies: Dependency[], project: Project): string {
    const conditions = objectConditions('obj', iface.getProperties(), dependencies, project)

    return `
        export function ${functionName}(obj: any): obj is ${iface.getName()} {
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
    return project.createSourceFile(path, "", { overwrite: true })
 }

export function generate(paths: string[]) {
    const project = new Project()
    project.addExistingSourceFiles(paths)

    project.getSourceFiles().forEach(sourceFile => {
        const interfaces = sourceFile.getInterfaces()
        const dependencies: Dependency[] = []
        const functions = interfaces.reduce((acc, iface) => {
            const typeGuardName = getTypeGuardName(iface.getName(), iface.getJsDocs());
            if (typeGuardName !== null) {
                if (iface.isExported()) {
                    dependencies.push({
                        name: iface.getName(),
                        isDefault: iface.isDefaultExport(),
                        sourceFile,
                    })
                    acc.push(generateTypeGuard(typeGuardName, iface, dependencies, project))
                } else {
                    console.error(
                        `ERROR: interface ${iface.getName()} is not exported, ` +
                        `generating ${typeGuardName} skipped`
                    )
                }
            }
            return acc
        }, [] as string[])

        if (functions.length > 0) {
            const outPath = outFilePath(sourceFile.getFilePath())
            const outFile = clearOrCreate(project, outPath)
            outFile.addStatements(functions.join('\n'))

            // Dedupe imports
            const imports = dependencies.reduce((acc, { sourceFile, isDefault, name }) => {
                if (!acc.has(sourceFile)) {
                    acc.set(sourceFile, { default: undefined, named: new Set<string>() })
                }
                const element = acc.get(sourceFile)!
                if (isDefault) {
                    if (element.default !== undefined && element.default !== name) {
                        console.error(`ERROR: Conflicting default export for "${sourceFile.getFilePath()}": "${name}" vs "${element.default}"`)
                    }
                    element.default = name
                } else {
                    element.named.add(name)
                }
                return acc
            }, new Map<SourceFile, { default: string | undefined, named: Set<string> }>())

            for (const [importFile, { default: defaultImport, named }] of imports.entries()) {
                // Don't self-import
                if (importFile !== outFile) {
                    outFile.addImportDeclaration({
                        defaultImport,
                        moduleSpecifier: sourceFile.getRelativePathAsModuleSpecifierTo(importFile),
                        namedImports: Array.from(named),
                    })
                }
            }

            outFile.formatText()
        }
    })

    return project.save()
}
