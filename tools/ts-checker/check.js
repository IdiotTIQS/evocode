#!/usr/bin/env node
/**
 * check.js - Minimal static type-checker using ts-morph (reused from ../ts-extractor)
 * Usage: node check.js <directory-path>
 * Outputs: JSON { passed, diagnostics: [{file, line, code, message}] } (ALL diagnostics, unfiltered)
 */
const path = require("path");
const TSM_DIR = path.join(__dirname, "..", "ts-extractor", "node_modules");
const { Project } = require(path.join(TSM_DIR, "ts-morph"));
const ts = require(path.join(TSM_DIR, "@ts-morph", "common", "dist", "typescript.js"));

const targetDir = process.argv[2];
if (!targetDir) {
  process.stderr.write("Usage: node check.js <directory-path>\n");
  process.exit(1);
}

const project = new Project({
  compilerOptions: {
    jsx: 2, target: 99, moduleResolution: 100,
    skipFileDependencyResolution: true, noEmit: true, strict: true,
  },
  skipAddingFilesFromTsConfig: true,
  skipFileDependencyResolution: true,
});

const dirFwd = targetDir.replace(/\\/g, "/");
project.addSourceFilesAtPaths([
  dirFwd + "/**/*.ts",
  dirFwd + "/**/*.tsx",
  "!" + dirFwd + "/**/node_modules/**",
  "!" + dirFwd + "/**/*.d.ts",
]);

const rawDiagnostics = project.getPreEmitDiagnostics();
const diagnostics = rawDiagnostics.map((d) => {
  const sourceFile = d.getSourceFile();
  const file = sourceFile ? sourceFile.getFilePath() : "<unknown>";
  let line = null;
  if (sourceFile) {
    const start = d.getStart();
    if (start != null) line = sourceFile.getLineAndColumnAtPos(start).line;
  }
  const code = d.getCode();
  const rawMsg = d.getMessageText();
  const message = typeof rawMsg === "string"
    ? rawMsg : ts.flattenDiagnosticMessageText(rawMsg, "\n");
  return { file, line, code, message };
});

process.stdout.write(JSON.stringify({ passed: diagnostics.length === 0, diagnostics }, null, 2) + "\n");
