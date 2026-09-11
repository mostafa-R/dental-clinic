// Regenerates server/audit/openapi.yaml from the runtime swagger spec.
// Part of the API contract pipeline (see audit/contract/CONTRACT_FREEZE.md §3):
//   node dump-swagger.mjs        → server/audit/openapi.yaml
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { swaggerSpec } from "../swagger.js";

const out = path.resolve(process.cwd(), "audit", "openapi.yaml");
fs.writeFileSync(out, yaml.dump(swaggerSpec, { lineWidth: -1 }));
const ops = Object.values(swaggerSpec.paths || {}).reduce(
  (sum, item) => sum + Object.keys(item).filter((k) => ["get", "post", "put", "patch", "delete"].includes(k)).length,
  0,
);
console.log(`wrote ${out}`);
console.log(`paths: ${Object.keys(swaggerSpec.paths || {}).length}, operations: ${ops}`);