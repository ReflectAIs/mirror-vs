import {
	mirrorCliControlEventSchema,
	mirrorCliFinalOutputSchema,
	mirrorCliInputCommandSchema,
	mirrorCliStreamEventSchema,
} from "../cli.js"

describe("CLI types", () => {
	describe("mirrorCliInputCommandSchema", () => {
		it("validates a start command", () => {
			const result = mirrorCliInputCommandSchema.safeParse({
				command: "start",
				requestId: "req-1",
				prompt: "hello",
				taskId: "018f7fc8-7c96-7f7c-98aa-2ec4ff7f6d87",
				images: ["data:image/png;base64,abc"],
				configuration: {},
			})

			expect(result.success).toBe(true)
		})

		it("validates a message command with images", () => {
			const result = mirrorCliInputCommandSchema.safeParse({
				command: "message",
				requestId: "req-2a",
				prompt: "follow up",
				images: ["data:image/png;base64,xyz"],
			})

			expect(result.success).toBe(true)
		})

		it("rejects a message command without prompt", () => {
			const result = mirrorCliInputCommandSchema.safeParse({
				command: "message",
				requestId: "req-2",
			})

			expect(result.success).toBe(false)
		})

		it("rejects a start command with invalid taskId format", () => {
			const result = mirrorCliInputCommandSchema.safeParse({
				command: "start",
				requestId: "req-invalid-task-id",
				prompt: "hello",
				taskId: "task-123",
			})

			expect(result.success).toBe(false)
		})
	})

	describe("mirrorCliControlEventSchema", () => {
		it("validates a control done event", () => {
			const result = mirrorCliControlEventSchema.safeParse({
				type: "control",
				subtype: "done",
				requestId: "req-3",
				command: "start",
				success: true,
				code: "task_completed",
			})

			expect(result.success).toBe(true)
		})

		it("rejects control event without requestId", () => {
			const result = mirrorCliControlEventSchema.safeParse({
				type: "control",
				subtype: "ack",
			})

			expect(result.success).toBe(false)
		})
	})

	describe("mirrorCliStreamEventSchema", () => {
		it("accepts passthrough fields for forward compatibility", () => {
			const result = mirrorCliStreamEventSchema.safeParse({
				type: "assistant",
				id: 42,
				content: "partial",
				customField: "future",
			})

			expect(result.success).toBe(true)
		})
	})

	describe("mirrorCliFinalOutputSchema", () => {
		it("validates final json output shape", () => {
			const result = mirrorCliFinalOutputSchema.safeParse({
				type: "result",
				success: true,
				content: "done",
				events: [],
			})

			expect(result.success).toBe(true)
		})
	})
})
