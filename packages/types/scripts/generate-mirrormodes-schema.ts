/**
 * Generates the JSON Schema for .mirrormodes configuration files from the Zod
 * schemas defined in packages/types/src/mode.ts.
 *
 * This ensures the schema stays in sync with the TypeScript types. Run via:
 *   pnpm --filter @mirror-vs/types generate:schema
 *
 * The output is written to schemas/mirrormodes.json at the repository root.
 */

import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"

import { generateMirrormodesJsonSchema } from "../src/mirrormodes-schema.js"

const jsonSchema = generateMirrormodesJsonSchema()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoMirrort = path.resolve(__dirname, "../../..")
const outPath = path.join(repoMirrort, "schemas", "mirrormodes.json")
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(jsonSchema, null, "\t") + "\n", "utf-8")

console.log(`Generated ${path.relative(repoMirrort, outPath)}`)
