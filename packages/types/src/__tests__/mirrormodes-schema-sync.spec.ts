import { describe, it, expect } from "vitest"
import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"

import { generateMirrormodesJsonSchema } from "../mirrormodes-schema.js"

/**
 * This test verifies that the checked-in schemas/mirrormodes.json matches what
 * would be generated from the current Zod schemas. If this test fails, run:
 *
 *   pnpm --filter @mirror-vs/types generate:schema
 *
 * to regenerate the schema file.
 */
describe("mirrormodes schema sync", () => {
	it("should match the dynamically generated schema from Zod types", () => {
		const __dirname = path.dirname(fileURLToPath(import.meta.url))
		const schemaPath = path.resolve(__dirname, "../../../../schemas/mirrormodes.json")
		const checkedIn = JSON.parse(fs.readFileSync(schemaPath, "utf-8"))

		const generated = generateMirrormodesJsonSchema()

		expect(checkedIn).toEqual(generated)
	})
})
