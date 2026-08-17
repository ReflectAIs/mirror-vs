import { getObjectiveSection } from "../objective"

describe("getObjectiveSection", () => {
	it("should include proper numbered structure", () => {
		const objective = getObjectiveSection()

		// Check that all numbered items are present
		expect(objective).toContain("1. Analyze the task, set achievable goals, and prioritize them.")
		expect(objective).toContain("2. Work through each goal methodically, using one tool at a time.")
		expect(objective).toContain("3. Before calling a tool, examine environment_details for context.")
		expect(objective).toContain("4. Use attempt_completion to present the final result once done.")
		expect(objective).toContain(
			"5. User feedback may be incorporated, but do not end responses with questions or further offers.",
		)
	})

	it("should include iterative-work guidance", () => {
		const objective = getObjectiveSection()

		expect(objective).toContain(
			"Work iteratively: break tasks into clear steps, prioritize logically, and complete them sequentially.",
		)
		expect(objective).toContain("Outcomes of each step inform the next.")
	})

	it("should include parameter inference guidance", () => {
		const objective = getObjectiveSection()

		expect(objective).toContain(
			"Pick the most relevant tool and verify all required parameters can be inferred from available information",
		)
		expect(objective).toContain("If any required parameter is missing, DO NOT invoke the tool")
		expect(objective).toContain("use ask_followup_question instead")
		expect(objective).toContain("Never request optional params")
	})

	it("should include guidance about not engaging in back and forth conversations", () => {
		const objective = getObjectiveSection()

		expect(objective).toContain("do not end responses with questions or further offers")
	})

	it("should include the OBJECTIVE header", () => {
		const objective = getObjectiveSection()

		expect(objective).toContain("OBJECTIVE")
		expect(objective).toContain("Work iteratively")
	})
})
