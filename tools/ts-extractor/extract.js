#!/usr/bin/env node
/**
 * extract.js - Minimal TypeScript/TSX graph extractor using ts-morph
 * Usage: node extract.js <directory-path>
 * Outputs: JSON { nodes: [...], edges: [...] } to STDOUT
 */

const { Project, SyntaxKind } = require("ts-morph");
const path = require("path");

const targetDir = process.argv[2];
if (!targetDir) {
  process.stderr.write("Usage: node extract.js <directory-path>\n");
  process.exit(1);
}

const project = new Project({
  compilerOptions: {
    allowJs: false,
    jsx: 2, // React
    target: 99, // ESNext
    moduleResolution: 100, // Bundler
    esModuleInterop: true,
  },
  skipAddingFilesFromTsConfig: true,
  skipFileDependencyResolution: true,
});

project.addSourceFilesAtPaths([
  path.join(targetDir, "**/*.ts"),
  path.join(targetDir, "**/*.tsx"),
  "!" + targetDir.replace(/\\/g, "/") + "/**/node_modules/**",
  "!" + targetDir.replace(/\\/g, "/") + "/**/*.d.ts",
]);

const nodes = [];
const edges = [];

function hasJsxReturn(node) {
  const jsxKinds = new Set([
    SyntaxKind.JsxElement,
    SyntaxKind.JsxSelfClosingElement,
    SyntaxKind.JsxFragment,
  ]);
  let found = false;
  node.forEachDescendant?.((child) => {
    if (jsxKinds.has(child.getKind())) {
      found = true;
    }
  });
  return found;
}

for (const sourceFile of project.getSourceFiles()) {
  const filePath = sourceFile.getFilePath();
  const fileId = `file:${filePath}`;
  nodes.push({ id: fileId, type: "File", path: filePath });

  for (const fn of sourceFile.getFunctions()) {
    const name = fn.getName();
    if (!name) continue;
    if (hasJsxReturn(fn)) {
      const compId = `component:${filePath}#${name}`;
      nodes.push({ id: compId, type: "Component", name, filePath });
      edges.push({ type: "DEFINES", from: fileId, to: compId });
    }
  }

  for (const varDecl of sourceFile.getVariableDeclarations()) {
    const name = varDecl.getName();
    const init = varDecl.getInitializer();
    if (!init) continue;
    const kind = init.getKind();
    const isArrowOrFn =
      kind === SyntaxKind.ArrowFunction ||
      kind === SyntaxKind.FunctionExpression;
    if (isArrowOrFn && hasJsxReturn(init)) {
      const compId = `component:${filePath}#${name}`;
      nodes.push({ id: compId, type: "Component", name, filePath });
      edges.push({ type: "DEFINES", from: fileId, to: compId });
    }
  }

  const defaultExport = sourceFile.getDefaultExportSymbol();
  if (defaultExport) {
    const declNode = defaultExport.getDeclarations()[0];
    if (declNode) {
      const name =
        declNode.getName?.() ||
        defaultExport.getName() ||
        path.basename(filePath, path.extname(filePath));
      const alreadyAdded = nodes.some(
        (n) =>
          n.type === "Component" &&
          n.filePath === filePath &&
          n.name === name
      );
      if (!alreadyAdded) {
        const compId = `component:${filePath}#${name}(default)`;
        nodes.push({
          id: compId,
          type: "Component",
          name: `${name}(default)`,
          filePath,
        });
        edges.push({ type: "DEFINES", from: fileId, to: compId });
      }
    }
  }

  for (const imp of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = imp.getModuleSpecifierValue();
    if (!moduleSpecifier.startsWith(".")) continue;
    const importedFile = imp.getModuleSpecifierSourceFile();
    if (importedFile) {
      const importedPath = importedFile.getFilePath();
      edges.push({
        type: "IMPORTS",
        from: fileId,
        to: `file:${importedPath}`,
        specifier: moduleSpecifier,
      });
    }
  }
}

process.stdout.write(JSON.stringify({ nodes, edges }, null, 2) + "\n");
