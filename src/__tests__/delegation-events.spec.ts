// npx vitest run __tests__/delegation-events.spec.ts

import { MirrorVSEventName, mirrorVSEventsSchema, taskEventSchema } from "@mirror-vs/types"

describe("delegation event schemas", () => {
	test("mirrorVSEventsSchema validates tuples", () => {
		expect(() => (mirrorVSEventsSchema.shape as any)[MirrorVSEventName.TaskDelegated].parse(["p", "c"])).not.toThrow()
		expect(() =>
			(mirrorVSEventsSchema.shape as any)[MirrorVSEventName.TaskDelegationCompleted].parse(["p", "c", "s"]),
		).not.toThrow()
		expect(() =>
			(mirrorVSEventsSchema.shape as any)[MirrorVSEventName.TaskDelegationResumed].parse(["p", "c"]),
		).not.toThrow()

		// invalid shapes
		expect(() => (mirrorVSEventsSchema.shape as any)[MirrorVSEventName.TaskDelegated].parse(["p"])).toThrow()
		expect(() =>
			(mirrorVSEventsSchema.shape as any)[MirrorVSEventName.TaskDelegationCompleted].parse(["p", "c"]),
		).toThrow()
		expect(() => (mirrorVSEventsSchema.shape as any)[MirrorVSEventName.TaskDelegationResumed].parse(["p"])).toThrow()
	})

	test("taskEventSchema discriminated union includes delegation events", () => {
		expect(() =>
			taskEventSchema.parse({
				eventName: MirrorVSEventName.TaskDelegated,
				payload: ["p", "c"],
				taskId: 1,
			}),
		).not.toThrow()

		expect(() =>
			taskEventSchema.parse({
				eventName: MirrorVSEventName.TaskDelegationCompleted,
				payload: ["p", "c", "s"],
				taskId: 1,
			}),
		).not.toThrow()

		expect(() =>
			taskEventSchema.parse({
				eventName: MirrorVSEventName.TaskDelegationResumed,
				payload: ["p", "c"],
				taskId: 1,
			}),
		).not.toThrow()
	})
})
