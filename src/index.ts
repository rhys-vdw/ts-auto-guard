import Project, { InterfaceDeclaration, PropertySignature, Type } from 'ts-simple-ast'
import { camelCase, upperFirst, flatMap, endsWith } from "lodash"
import Path from "path"
import { BaseError } from "make-error"

// -- Error types --

class UnsupportedPropertyError extends BaseError {
    property: PropertySignature

    constructor(property: PropertySignature) {
        super(`Unsupported property: ${property.getName()}`)
        this.property = property;
    }
}

// -- Helpers --

function trimExtension(path: string): string {
    const match = path.match(/^[^\.]+/)
    if (match === null) {
        throw new TypeError(`Could not trim extenstion from path "${path}"`)
    }
    return match[0]
}

function interfaceToName(iface: InterfaceDeclaration): string {
    if (iface.isDefaultExport) {
        const fileName = trimExtension(Path.basename(iface.getSourceFile().getFilePath()));
        return upperFirst(camelCase(fileName))
    }
    return iface.getName()
}

function outFilePath(sourcePath: string) {
    return sourcePath.replace(/\.(ts|tsx|d\.ts)$/, "\.guard.ts")
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

function getTypeOfResult(type: Type): string {
    if (type.isBoolean()) return "boolean"
    if (type.isNumber()) return "number"
    if (type.isString()) return "string"
    if (type.isNull()) return "null"
    if (type.isUndefined()) return "null"
    if (type.isObject()) return "object"
    throw new TypeError("Unexpected Type")
}

function not(a: string, b: string): string {
    return `${a} !== ${b}`
}

function notTypeOf(varName: string, type: string): string {
    return not(`typeof ${varName}`, `"${type}"`)
}

function isNotValueTypeConditions(varName: string, type: Type): string[] {
    const conditions: string[] = [];
    if (type.isBoolean()) {
        conditions.push(notTypeOf(varName, "boolean"))
    }
    if (type.isNumber()) {
        conditions.push(notTypeOf(varName, "number"))
    }
    if (type.isString()) {
        conditions.push(notTypeOf(varName, "string"))
    }
    if (type.isStringLiteral()) {
        conditions.push(not(varName, type.getText()))
    }
    return conditions
}

function isNotTypesConditions(varName: string, types: ReadonlyArray<Type>): string[] {
    return flatMap(types, type => isNotTypeConditions(varName, type))
}

function isNotTypeConditions(varName: string, type: Type): string[] {
    if (type.isUnion()) {
        type.getUnionTypes()
        return isNotTypesConditions(varName, type.getUnionTypes())
    }
    if (type.isIntersection()) {
        return isNotTypesConditions(varName, type.getIntersectionTypes())
    }
    if (type.isArray()) {
        return [
            `!Array.isArray(${varName})`,
            `${varName}.length > 0`,
            ...isNotTypeConditions(`${varName}[0]`, type.getArrayType()!),
        ]
    }
    if (type.isInterface()) {
        return [`!${isInterfaceFunctionNames.get(type)}(${varName})`]
    }
    return isNotValueTypeConditions(varName, type)
}

function isPropertyIfStatement(property: PropertySignature): string {
    const conditions: string[] = [];
    const type = property.getType();
    const name = property.getName();
    const varName = `obj.${name}`;
    if (property.hasQuestionToken()) {
        conditions.push(notTypeOf(varName, "undefined"))
    }

    conditions.push(...isNotTypeConditions(varName, property.getType()))

    if (conditions.length === 0) {
        throw new UnsupportedPropertyError(property);
    }
    return `
    if (
${indent(ands(...conditions), 2)}
    ) {
        return false;
    }
`;
}

const isInterfaceFunctionNames = new WeakMap<Type, string>()

function processInterface(iface: InterfaceDeclaration): string {
    const statements: string[] = []
    const interfaceName = interfaceToName(iface);
    const functionName = `is${interfaceName}`;
    isInterfaceFunctionNames.set(iface.getType(), functionName);
    for (const property of iface.getProperties()) {
        try {
            statements.push(isPropertyIfStatement(property))
        } catch (error) {
            if (error instanceof UnsupportedPropertyError) {
                console.error(`WARNING: ${interfaceName}.${property.getName()} unsupported`)
                continue;
            }
            throw error
        }
    }
    return `
function ${functionName}(obj: any): obj is ${interfaceName} {
    ${statements.join("\n")}
    return true;
}
`
}

// -- Process input --

const paths = process.argv.slice(2)
if (paths.length === 0) {
    console.error(`specify some files`)
    process.exit(1);
}

// -- Process project --

const project = new Project()
project.addExistingSourceFiles(paths)

const sourceFiles = project.getSourceFiles()

console.log(`${sourceFiles.length} source files found`);

for (const sourceFile of sourceFiles) {
    const interfaces = sourceFile.getInterfaces()
    const functions = interfaces.reduce((acc, iface) => {
        if (iface.isExported()) {
            acc.push(processInterface(iface))
        }
        return acc
    }, [] as string[])

    if (functions.length > 0) {
        project.createSourceFile(
            outFilePath(sourceFile.getFilePath()),
            functions.join('\n')
        );
    }
}

project.save()
