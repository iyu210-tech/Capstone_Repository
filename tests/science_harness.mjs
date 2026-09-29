// Runs the pure maths from docs/demos.js under node, so the Python tests can
// compare the browser port with the real .py scripts.
//
// demos.js is one big closure with no exports, and its structure belongs to
// the page, not to the tests. So this loads it into a sandbox with a stub
// `window`, and splices one line in before the closing "})();": a lookup that
// can read any name inside the closure. Nothing that touches the DOM runs at
// load time, so the stub never has to pretend to be a browser.
//
// Usage: echo '[{"fn": "bestAngle", "args": [40, 0.0013]}]' | node tests/science_harness.mjs
// Prints a JSON array with one result per call.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = fileURLToPath(new URL(".", import.meta.url));
const src = readFileSync(here + "../docs/demos.js", "utf8");

const end = src.lastIndexOf("})();");
if (end < 0) throw new Error("demos.js no longer ends with '})();' - update the harness");
const patched =
  src.slice(0, end) +
  "globalThis.__lookup = function (name) { return eval(name); };\n" +
  src.slice(end);

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(patched, sandbox, { filename: "demos.js" });

const calls = JSON.parse(readFileSync(0, "utf8"));
const out = calls.map(function (c) {
  const f = sandbox.__lookup(c.fn);
  if (typeof f !== "function") throw new Error("demos.js has no function " + c.fn);
  // JSON round trip: the sandbox has its own Object/Array, and plain data is
  // all the Python side needs anyway.
  return JSON.parse(JSON.stringify(f.apply(null, c.args || [])));
});
process.stdout.write(JSON.stringify(out));
