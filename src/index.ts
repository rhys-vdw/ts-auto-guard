import Project, { InterfaceDeclaration, PropertySignature, Type, TypeGuards } from 'ts-simple-ast'
import { flatMap } from "lodash"

// -- Helpers --

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

function typeUnionConditions(varName: string, types: Type[], isOptional: boolean): string {
    const conditions: string[] = []
    if (isOptional && types.findIndex(type => type.isUndefined()) === -1) {
        conditions.push(typeOf(varName, "undefined"))
    }
    conditions.push(...flatMap(types, type => typeConditions(varName, type)))
    return parens(ors(...conditions))
}

function parens(code: string) {
    return `(\n${indent(code, 1)}\n)`
}

function typeConditions(varName: string, type: Type, isOptional: boolean = false): string {
    if (type.getText() === "never") {
        return typeOf(varName, "undefined")
    }
    if (type.isUnion()) {
        return typeUnionConditions(varName, type.getUnionTypes(), isOptional)
    }
    if (type.isIntersection()) {
        return typeUnionConditions(varName, type.getIntersectionTypes(), isOptional)
    }
    if (isOptional) {
        return typeUnionConditions(varName, [type], isOptional)
    }
    if (type.isArray()) {
        return ands(
            `Array.isArray(${varName})`,
            ors(eq(`${varName}.length`, '0'), typeConditions(`${varName}[0]`, type.getArrayType()!)),
        )
    }
    if (isClassType(type)) {
        return `${varName} instanceof ${type.getText()}`
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

function propertyConditions(property: PropertySignature): string[] {
    const conditions: string[] = [];
    const varName = `obj.${property.getName()}`;

    conditions.push(typeConditions(varName, property.getType(), property.hasQuestionToken()))

    if (conditions.length === 0) {
        console.error(`WARNING: ${property.getName()} unsupported`)
    }

    return conditions
}

function propertiesConditions(properties: ReadonlyArray<PropertySignature>): string[] {
    return flatMap(properties, propertyConditions)
}

const isInterfaceFunctionNames = new WeakMap<Type, string>()

function processInterface(iface: InterfaceDeclaration): string {
    const interfaceName = iface.getName();
    const functionName = `is${interfaceName}`;

    const type = iface.getType();
    isInterfaceFunctionNames.set(type, functionName);

    // TODO: Assert object interface

    const conditions: string[] = [
        typeOf('obj', "object"),
        ...propertiesConditions(iface.getProperties())
    ]

    return `
export function ${functionName}(obj: any): obj is ${interfaceName} {
    return (
${indent(ands(...conditions), 2)}
    );
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

project.getSourceFiles().forEach(sourceFile => {
    const interfaces = sourceFile.getInterfaces()
    let defaultImport: InterfaceDeclaration | undefined
    const imports: InterfaceDeclaration[] = []
    const functions = interfaces.reduce((acc, iface) => {
        if (iface.isExported()) {
            if (iface.isDefaultExport()) {
                defaultImport = iface
            } else {
                imports.push(iface)
            }
            acc.push(processInterface(iface))
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

        outFile.addImportDeclaration({
            defaultImport: defaultImport && defaultImport.getName(),
            moduleSpecifier: sourceFile.getRelativePathAsModuleSpecifierTo(sourceFile),
            namedImports: imports.map(i => i.getName())
        })
    }
})

project.save().then(() => {
    console.log("Done!")
}).catch(error => {
    console.error(error)
})
