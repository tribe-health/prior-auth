#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { API, SymbolFlags } from "typescript/unstable/sync";
import {
  isAsExpression,
  isBinaryExpression,
  isBindingElement,
  isCallExpression,
  isConditionalExpression,
  isFunctionDeclaration,
  isIdentifier,
  isImportSpecifier,
  isNamespaceImport,
  isNonNullExpression,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isSatisfiesExpression,
  isShorthandPropertyAssignment,
  isTypeAssertion,
  isVariableDeclaration,
  SyntaxKind,
} from "typescript/unstable/ast";

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value === undefined) {
      throw new Error("arguments must use --name value pairs");
    }
    values.set(flag.slice(2), value);
  }
  for (const required of ["root", "symbol", "definition"]) {
    if (!values.has(required)) throw new Error(`missing --${required}`);
  }
  return Object.fromEntries(values);
}

function isTestModule(fileName) {
  const name = path.basename(fileName);
  return name.includes(".test.") || name.includes(".spec.") || name.endsWith(".d.ts");
}

function main() {
  const args = parseArguments(process.argv.slice(2));
  const root = path.resolve(args.root);
  const sourceRoot = path.join(root, "web", "src");
  const configPath = path.join(root, "web", "tsconfig.json");
  const result = {
    definitions: [],
    construction_sites: [],
    imports: [],
    references: [],
    source_root_exists: fs.existsSync(sourceRoot),
  };
  if (!result.source_root_exists) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (!fs.existsSync(configPath)) throw new Error(`TypeScript config is absent: ${configPath}`);

  const api = new API({ cwd: root });
  try {
    const snapshot = api.updateSnapshot({ openProjects: [configPath] });
    const project = snapshot.getProject(configPath);
    if (!project) throw new Error(`TypeScript project did not open: ${configPath}`);
    const checker = project.checker;
    const definitionPath = path.resolve(root, args.definition);

    function location(node) {
      const sourceFile = node.getSourceFile();
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      return {
        path: path.relative(root, sourceFile.fileName).split(path.sep).join("/"),
        line: position.line + 1,
      };
    }

    function isTargetDeclaration(declaration) {
      return (
        declaration !== undefined &&
        isFunctionDeclaration(declaration) &&
        declaration.name?.text === args.symbol &&
        path.resolve(declaration.getSourceFile().fileName) === definitionPath
      );
    }

    function resolvedDeclarations(symbol) {
      if (!symbol) return [];
      let resolved = symbol;
      const seen = new Set();
      while ((resolved.flags & SymbolFlags.Alias) !== 0 && !seen.has(resolved.id)) {
        seen.add(resolved.id);
        resolved = checker.getAliasedSymbol(resolved);
      }
      return (resolved.declarations ?? [])
        .map((handle) => handle.resolve(project))
        .filter((node) => node !== undefined);
    }

    function expressionResolvesToTarget(expression, seenSymbols = new Set(), seenNodes = new Set()) {
      if (!expression || seenNodes.has(expression)) return false;
      seenNodes.add(expression);
      if (
        isParenthesizedExpression(expression) ||
        isAsExpression(expression) ||
        isTypeAssertion(expression) ||
        isNonNullExpression(expression) ||
        isSatisfiesExpression(expression)
      ) {
        return expressionResolvesToTarget(expression.expression, seenSymbols, seenNodes);
      }
      if (isBinaryExpression(expression) && expression.operatorToken.kind === SyntaxKind.CommaToken) {
        return expressionResolvesToTarget(expression.right, seenSymbols, seenNodes);
      }
      if (isConditionalExpression(expression)) {
        return (
          expressionResolvesToTarget(expression.whenTrue, new Set(seenSymbols), new Set(seenNodes)) ||
          expressionResolvesToTarget(expression.whenFalse, new Set(seenSymbols), new Set(seenNodes))
        );
      }
      if (
        isPropertyAccessExpression(expression) &&
        ["call", "apply", "bind"].includes(expression.name.text) &&
        expressionResolvesToTarget(expression.expression, seenSymbols, seenNodes)
      ) {
        return true;
      }
      const symbol = checker.getSymbolAtLocation(
        isPropertyAccessExpression(expression) ? expression.name : expression,
      );
      if (!symbol || seenSymbols.has(symbol.id)) return false;
      seenSymbols.add(symbol.id);
      for (const declaration of resolvedDeclarations(symbol)) {
        if (isTargetDeclaration(declaration)) return true;
        if (isVariableDeclaration(declaration) && declaration.initializer) {
          if (expressionResolvesToTarget(declaration.initializer, seenSymbols, seenNodes)) return true;
        }
        if (isBindingElement(declaration) && declaration.initializer) {
          if (expressionResolvesToTarget(declaration.initializer, seenSymbols, seenNodes)) return true;
        }
        if (isPropertyAssignment(declaration)) {
          if (expressionResolvesToTarget(declaration.initializer, seenSymbols, seenNodes)) return true;
        }
        if (isShorthandPropertyAssignment(declaration)) {
          const value = checker.getShorthandAssignmentValueSymbol(declaration);
          for (const valueDeclaration of resolvedDeclarations(value)) {
            if (isTargetDeclaration(valueDeclaration)) return true;
            if (
              isVariableDeclaration(valueDeclaration) &&
              valueDeclaration.initializer &&
              expressionResolvesToTarget(valueDeclaration.initializer, seenSymbols, seenNodes)
            ) {
              return true;
            }
          }
        }
      }
      return false;
    }

    function callResolvesToTarget(node) {
      const signature = checker.getResolvedSignature(node);
      const declaration = signature?.declaration?.resolve(project);
      return isTargetDeclaration(declaration) || expressionResolvesToTarget(node.expression);
    }

    function visit(node) {
      if (
        isFunctionDeclaration(node) &&
        node.name?.text === args.symbol &&
        path.resolve(node.getSourceFile().fileName) === definitionPath
      ) {
        result.definitions.push(location(node.name));
      }
      if (isImportSpecifier(node) && (node.propertyName ?? node.name).text === args.symbol) {
        result.imports.push(location(node));
      }
      if (isNamespaceImport(node)) result.imports.push(location(node));
      if (isIdentifier(node) && node.text === args.symbol) result.references.push(location(node));
      if (isCallExpression(node) && !isTestModule(node.getSourceFile().fileName) && callResolvesToTarget(node)) {
        result.construction_sites.push(location(node.expression));
      }
      node.forEachChild(visit);
    }

    for (const fileName of project.program.getSourceFileNames()) {
      const absolute = path.resolve(fileName);
      if (absolute !== sourceRoot && !absolute.startsWith(`${sourceRoot}${path.sep}`)) continue;
      const sourceFile = project.program.getSourceFile(fileName);
      if (sourceFile) visit(sourceFile);
    }
  } finally {
    api.close();
  }

  for (const key of ["definitions", "construction_sites", "imports", "references"]) {
    result[key].sort((left, right) => left.path.localeCompare(right.path) || left.line - right.line);
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
}
