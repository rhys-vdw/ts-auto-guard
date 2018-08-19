import Project, { InterfaceDeclaration, PropertySignature, Type, TypeGuards, SymbolFlags, JSDoc, ExportableNode, Node, SourceFile } from 'ts-simple-ast'
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
    ).find(TypeGuards.isExportableNode) || null
}

function typeToDependency(type: Type): Dependency | null {
    const exportable = findExportableNode(type)
    if (exportable === null) {
        return exportable
    }

    const sourceFile = exportable.getAncestors().find(node => {
        const symbol = node.getSymbol()
        return symbol !== undefined && (symbol.getFlags() & SymbolFlags.Module) !== 0
    }) as SourceFile

    if (sourceFile === undefined) {
        // This is a global (I think).
        return null
    }

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

const tab = `    `;
const indentPrefix = [
    ``,
    `${tab}`,
    `${tab}${tab}`,
    `${tab}${tab}${tab}`,
]

function indent(code: string, tabCount: number) {
    if (tabCount >= indentPrefix.length) {
        throw new TypeError(`tabCount >= ${indentPrefix.length}`)
    }
    const result = code.split("\n").map(line =>
        line.trim().length === 0
            ? ""
            : `${indentPrefix[tabCount]}${line}`
    ).join('\n')
    return result
}

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

function typeUnionConditions(varName: string, types: Type[], isOptional: boolean, dependencies: Dependency[]): string {
    const conditions: string[] = []
    if (isOptional && types.findIndex(type => type.isUndefined()) === -1) {
        conditions.push(typeOf(varName, "undefined"))
    }
    conditions.push(...types
        .map(type => typeConditions(varName, type, false, dependencies))
        .filter((v) => v !== null) as string[]
    )
    return parens(ors(...conditions))
}

function parens(code: string) {
    return `(\n${indent(code, 1)}\n)`
}

function arrayCondition(varName: string, arrayType: Type, dependencies: Dependency[]): string {
    if (arrayType.getText() === "never") return ands(
            `Array.isArray(${varName})`,
            eq(`${varName}.length`, '0'),
    )
    return ands (
        `Array.isArray(${varName})`,
        `${varName}.every(e => ${typeConditions("e", arrayType, false, dependencies)})`
    )
}

function typeConditions(varName: string, type: Type, isOptional: boolean = false, dependencies: Dependency[]): string | null {
    const dependency = typeToDependency(type)
    if (dependency !== null) {
        dependencies.push(dependency)
    }
    if (type.getText() === "any") {
        return null
    }
    if (type.getText() === "never") {
        return typeOf(varName, "undefined")
    }
    if (type.isUnion()) {
        return typeUnionConditions(varName, type.getUnionTypes(), isOptional, dependencies)
    }
    if (type.isIntersection()) {
        return typeUnionConditions(varName, type.getIntersectionTypes(), isOptional, dependencies)
    }
    if (isOptional) {
        return typeUnionConditions(varName, [type], isOptional, dependencies)
    }
    if (type.isArray()) {
        return arrayCondition(varName, type.getArrayType()!, dependencies)
    }
    if (isReadonlyArrayType(type)) {
        return arrayCondition(varName, getReadonlyArrayType(type)!, dependencies)
    }
    if (isClassType(type)) {
        return `${varName} instanceof ${type.getSymbol()!.getName()}`
    }
    if (type.isInterface()) {
        return `${isInterfaceFunctionNames.get(type)}(${varName})`
    }
    if (type.isObject()) {
        return typeOf(varName, "object")
    }
    if (type.isLiteral()) {
        return eq(varName, type.getText())
    }
    return typeOf(varName, type.getText())
}

function propertyConditions(property: PropertySignature, dependencies: Dependency[]): string | null {
    const varName = `obj.${property.getName()}`;
    return typeConditions(varName, property.getType(), property.hasQuestionToken(), dependencies)
}

function propertiesConditions(properties: ReadonlyArray<PropertySignature>, dependencies: Dependency[]): string[] {
    return properties.map(prop => propertyConditions(prop, dependencies)).filter(v => v !== null) as string[]
}

const isInterfaceFunctionNames = new WeakMap<Type, string>()

function generateTypeGuard(functionName: string, iface: InterfaceDeclaration, dependencies: Dependency[]): string {
    const type = iface.getType();
    isInterfaceFunctionNames.set(type, functionName);

    // TODO: Assert object interface

    const conditions: string[] = [
        typeOf('obj', "object"),
        ...propertiesConditions(iface.getProperties(), dependencies)
    ]

    return `
export function ${functionName}(obj: any): obj is ${iface.getName()} {
    return (
${indent(ands(...conditions), 2)}
    );
}
`
}

// -- Process project --

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
                    acc.push(generateTypeGuard(typeGuardName, iface, dependencies))
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
            let outFile = project.getSourceFile(outPath)
            if (outFile) {
                outFile.removeText()
            } else {
                outFile = project.createSourceFile(outPath)
            }
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

            imports.forEach((value, path) => {
                outFile!.addImportDeclaration({
                    defaultImport: value.default,
                    moduleSpecifier: sourceFile.getRelativePathAsModuleSpecifierTo(path),
                    namedImports: Array.from(value.named),
                })
            })
        }
    })

    return project.save()
}
