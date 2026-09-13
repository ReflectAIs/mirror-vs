import { describe, it, expect, vi } from "vitest"
import { RECOVERY_STRATEGIES, StruggleLedger } from "../TaskMainLoop"

describe("RECOVERY_STRATEGIES - file_not_found", () => {
	it("skips auto-recovery for non-filesystem tools like ssh_session", async () => {
		const ledger = new StruggleLedger()
		const strategy = RECOVERY_STRATEGIES.file_not_found

		expect(strategy.pattern.test("bash: cd: /nonexistent: No such file or directory")).toBe(true)

		const result = await strategy.action(
			"bash: cd: /nonexistent: No such file or directory",
			"ssh_session",
			{ action: "execute", command: "echo CONNECTED && pwd" },
			ledger,
		)

		expect(result).toEqual({ type: "skip" })
		// Ledger should NOT have recorded an escalation or struggle entry
		expect(ledger.snapshot()).toHaveLength(0)
	})

	it("skips auto-recovery when toolArgs has no valid path parameter", async () => {
		const ledger = new StruggleLedger()
		const strategy = RECOVERY_STRATEGIES.file_not_found

		const result = await strategy.action("ENOENT: no such file or directory", "read_file", { path: "" }, ledger)

		expect(result).toEqual({ type: "skip" })
		expect(ledger.snapshot()).toHaveLength(0)
	})

	it("executes file_not_found recovery for read_file with a path", async () => {
		const ledger = new StruggleLedger()
		const strategy = RECOVERY_STRATEGIES.file_not_found

		const result = await strategy.action(
			"ENOENT: no such file or directory, open '/tmp/doesnotexist.txt'",
			"read_file",
			{ path: "/tmp/doesnotexist.txt" },
			ledger,
		)

		expect(result.type).toBe("retry")
		if (result.type === "retry") {
			expect(result.message).toContain('File "/tmp/doesnotexist.txt" not found')
		}
		expect(ledger.snapshot()).toHaveLength(1)
	})
})
