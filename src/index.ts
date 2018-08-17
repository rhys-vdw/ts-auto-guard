import Project, { InterfaceDeclaration, PropertySignature, Type, TypeGuards, JSDoc } from 'ts-simple-ast'

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
    conditions.push(...types
        .map(type => typeConditions(varName, type))
        .filter((v) => v !== null) as string[]
    )
    return parens(ors(...conditions))
}

function parens(code: string) {
    return `(\n${indent(code, 1)}\n)`
}

function arrayCondition(varName: string, arrayType: Type): string {
    if (arrayType.getText() === "never") return ands(
            `Array.isArray(${varName})`,
            eq(`${varName}.length`, '0'),
    )
    return ands (
        `Array.isArray(${varName})`,
        `${varName}.every(e => ${typeConditions("e", arrayType)})`
    )
}

function typeConditions(varName: string, type: Type, isOptional: boolean = false): string | null {
    if (type.getText() === "any") {
        return null
    }
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
        return arrayCondition(varName, type.getArrayType()!)
    }
    if (isReadonlyArrayType(type)) {
        return arrayCondition(varName, getReadonlyArrayType(type)!)
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

function propertyConditions(property: PropertySignature): string | null {
    const varName = `obj.${property.getName()}`;
    return typeConditions(varName, property.getType(), property.hasQuestionToken())
}

function propertiesConditions(properties: ReadonlyArray<PropertySignature>): string[] {
    return properties.map(propertyConditions).filter(v => v !== null) as string[]
}

const isInterfaceFunctionNames = new WeakMap<Type, string>()

function generateTypeGuard(functionName: string, iface: InterfaceDeclaration): string {
    const type = iface.getType();
    isInterfaceFunctionNames.set(type, functionName);

    // TODO: Assert object interface

    const conditions: string[] = [
        typeOf('obj', "object"),
        ...propertiesConditions(iface.getProperties())
    ]

    return `
export function ${functionName}(obj: any): obj is ${iface.getName()} {
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

function getTypeGuardName(jsDocs: JSDoc[]): string | null {
    for (const doc of jsDocs) {
        for (const line of doc.getInnerText().split("\n")) {
            const match = line.trim().match(/@see\s+{([a-zA-Z]+)}\s+ts-auto-guard:([a-z-]+)/)
            if (match !== null) {
                const [, typeGuardName, command] = match
                if (command !== "type-guard") {
                    console.error(`ERROR: command ${command} is not supported!`)
                    return null
                }
                return typeGuardName;
            }
        }
    }
    return null
}


project.getSourceFiles().forEach(sourceFile => {
    const interfaces = sourceFile.getInterfaces()
    let defaultImport: InterfaceDeclaration | undefined
    const imports: InterfaceDeclaration[] = []
    const functions = interfaces.reduce((acc, iface) => {
        const typeGuardName = getTypeGuardName(iface.getJsDocs());
        if (typeGuardName !== null) {
            if (iface.isExported()) {
                if (iface.isDefaultExport()) {
                    defaultImport = iface
                } else {
                    imports.push(iface)
                }
                acc.push(generateTypeGuard(typeGuardName, iface))
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
