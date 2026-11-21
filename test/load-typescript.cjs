const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

module.exports = function loadTypeScript(file, overrides = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  const resolve = (name) => Object.hasOwn(overrides, name) ? overrides[name]
    : name.startsWith("@/") ? module.exports(`${name.slice(2)}${fs.existsSync(path.join(__dirname, "..", `${name.slice(2)}.ts`)) ? ".ts" : ".tsx"}`, overrides) : require(name);
  new Function("require", "module", "exports", compiled)(resolve, loaded, loaded.exports);
  return loaded.exports;
};
