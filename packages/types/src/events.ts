import { z } from "zod"

import { mirrorMessageSchema, queuedMessageSchema, tokenUsageSchema } from "./message.js"
import { modelInfoSchema } from "./model.js"
import { toolNamesSchema, toolUsageSchema } from "./tool.js"

/**
 * MirrorVSEventName
 */

export enum MirrorVSEventName {
	// Task Provider Lifecycle
	TaskCreated = "taskCreated",

	// Task Lifecycle
	TaskStarted = "taskStarted",
	TaskCompleted = "taskCompleted",
	TaskAborted = "taskAborted",
	TaskFocused = "taskFocused",
	TaskUnfocused = "taskUnfocused",
	TaskActive = "taskActive",
	TaskInteractive = "taskInteractive",
	TaskResumable = "taskResumable",
	TaskIdle = "taskIdle",

	// Subtask Lifecycle
	TaskPaused = "taskPaused",
	TaskUnpaused = "taskUnpaused",
	TaskSpawned = "taskSpawned",
	TaskDelegated = "taskDelegated",
	TaskDelegationCompleted = "taskDelegationCompleted",
	TaskDelegationResumed = "taskDelegationResumed",

	// Task Execution
	Message = "message",
	TaskModeSwitched = "taskModeSwitched",
	TaskAskResponded = "taskAskResponded",
	TaskUserMessage = "taskUserMessage",
	QueuedMessagesUpdated = "queuedMessagesUpdated",

	// Task Analytics
	TaskTokenUsageUpdated = "taskTokenUsageUpdated",
	TaskToolFailed = "taskToolFailed",

	// Configuration Changes
	ModeChanged = "modeChanged",
	ProviderProfileChanged = "providerProfileChanged",

	// Query Responses
	CommandsResponse = "commandsResponse",
	ModesResponse = "modesResponse",
	ModelsResponse = "modelsResponse",
}

/**
 * MirrorVSEvents
 */

export const mirrorCodeEventsSchema = z.object({
	[MirrorVSEventName.TaskCreated]: z.tuple([z.string()]),

	[MirrorVSEventName.TaskStarted]: z.tuple([z.string()]),
	[MirrorVSEventName.TaskCompleted]: z.tuple([
		z.string(),
		tokenUsageSchema,
		toolUsageSchema,
		z.object({
			isSubtask: z.boolean(),
		}),
	]),
	[MirrorVSEventName.TaskAborted]: z.tuple([z.string()]),
	[MirrorVSEventName.TaskFocused]: z.tuple([z.string()]),
	[MirrorVSEventName.TaskUnfocused]: z.tuple([z.string()]),
	[MirrorVSEventName.TaskActive]: z.tuple([z.string()]),
	[MirrorVSEventName.TaskInteractive]: z.tuple([z.string()]),
	[MirrorVSEventName.TaskResumable]: z.tuple([z.string()]),
	[MirrorVSEventName.TaskIdle]: z.tuple([z.string()]),

	[MirrorVSEventName.TaskPaused]: z.tuple([z.string()]),
	[MirrorVSEventName.TaskUnpaused]: z.tuple([z.string()]),
	[MirrorVSEventName.TaskSpawned]: z.tuple([z.string(), z.string()]),
	[MirrorVSEventName.TaskDelegated]: z.tuple([
		z.string(), // parentTaskId
		z.string(), // childTaskId
	]),
	[MirrorVSEventName.TaskDelegationCompleted]: z.tuple([
		z.string(), // parentTaskId
		z.string(), // childTaskId
		z.string(), // completionResultSummary
	]),
	[MirrorVSEventName.TaskDelegationResumed]: z.tuple([
		z.string(), // parentTaskId
		z.string(), // childTaskId
	]),

	[MirrorVSEventName.Message]: z.tuple([
		z.object({
			taskId: z.string(),
			action: z.union([z.literal("created"), z.literal("updated")]),
			message: mirrorMessageSchema,
		}),
	]),
	[MirrorVSEventName.TaskModeSwitched]: z.tuple([z.string(), z.string()]),
	[MirrorVSEventName.TaskAskResponded]: z.tuple([z.string()]),
	[MirrorVSEventName.TaskUserMessage]: z.tuple([z.string()]),
	[MirrorVSEventName.QueuedMessagesUpdated]: z.tuple([z.string(), z.array(queuedMessageSchema)]),

	[MirrorVSEventName.TaskToolFailed]: z.tuple([z.string(), toolNamesSchema, z.string()]),
	[MirrorVSEventName.TaskTokenUsageUpdated]: z.tuple([z.string(), tokenUsageSchema, toolUsageSchema]),

	[MirrorVSEventName.ModeChanged]: z.tuple([z.string()]),
	[MirrorVSEventName.ProviderProfileChanged]: z.tuple([z.object({ name: z.string(), provider: z.string() })]),

	[MirrorVSEventName.CommandsResponse]: z.tuple([
		z.array(
			z.object({
				name: z.string(),
				source: z.enum(["global", "project", "built-in"]),
				filePath: z.string().optional(),
				description: z.string().optional(),
				argumentHint: z.string().optional(),
			}),
		),
	]),
	[MirrorVSEventName.ModesResponse]: z.tuple([z.array(z.object({ slug: z.string(), name: z.string() }))]),
	[MirrorVSEventName.ModelsResponse]: z.tuple([z.record(z.string(), modelInfoSchema)]),
})

export const mirrorVSEventsSchema = mirrorCodeEventsSchema

export type MirrorVSEvents = z.infer<typeof mirrorCodeEventsSchema>

/**
 * TaskEvent
 */

export const taskEventSchema = z.discriminatedUnion("eventName", [
	// Task Provider Lifecycle
	z.object({
		eventName: z.literal(MirrorVSEventName.TaskCreated),
		payload: mirrorCodeEventsSchema.shape[MirrorVSEventName.TaskCreated],
		taskId: z.number().optional(),
	}),

	// Task Lifecycle
	z.object({
		eventName: z.literal(MirrorVSEventName.TaskStarted),
		payload: mirrorCodeEventsSchema.shape[MirrorVSEventName.TaskStarted],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(MirrorVSEventName.TaskCompleted),
		payload: mirrorCodeEventsSchema.shape[MirrorVSEventName.TaskCompleted],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(MirrorVSEventName.TaskAborted),
		payload: mirrorCodeEventsSchema.shape[MirrorVSEventName.TaskAborted],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(MirrorVSEventName.TaskFocused),
		payload: mirrorCodeEventsSchema.shape[MirrorVSEventName.TaskFocused],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(MirrorVSEventName.TaskUnfocused),
		payload: mirrorCodeEventsSchema.shape[MirrorVSEventName.TaskUnfocused],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(MirrorVSEventName.TaskActive),
		payload: mirrorCodeEventsSchema.shape[MirrorVSEventName.TaskActive],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(MirrorVSEventName.TaskInteractive),
		payload: mirrorCodeEventsSchema.shape[MirrorVSEventName.TaskInteractive],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(MirrorVSEventName.TaskResumable),
		payload: mirrorCodeEventsSchema.shape[MirrorVSEventName.TaskResumable],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(MirrorVSEventName.TaskIdle),
		payload: mirrorCodeEventsSchema.shape[MirrorVSEventName.TaskIdle],
		taskId: z.number().optional(),
	}),

	// Subtask Lifecycle
	z.object({
		eventName: z.literal(MirrorVSEventName.TaskPaused),
		payload: mirrorCodeEventsSchema.shape[MirrorVSEventName.TaskPaused],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(MirrorVSEventName.TaskUnpaused),
		payload: mirrorCodeEventsSchema.shape[MirrorVSEventName.TaskUnpaused],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(MirrorVSEventName.TaskSpawned),
		payload: mirrorCodeEventsSchema.shape[MirrorVSEventName.TaskSpawned],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(MirrorVSEventName.TaskDelegated),
		payload: mirrorCodeEventsSchema.shape[MirrorVSEventName.TaskDelegated],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(MirrorVSEventName.TaskDelegationCompleted),
		payload: mirrorCodeEventsSchema.shape[MirrorVSEventName.TaskDelegationCompleted],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(MirrorVSEventName.TaskDelegationResumed),
		payload: mirrorCodeEventsSchema.shape[MirrorVSEventName.TaskDelegationResumed],
		taskId: z.number().optional(),
	}),

	// Task Execution
	z.object({
		eventName: z.literal(MirrorVSEventName.Message),
		payload: mirrorCodeEventsSchema.shape[MirrorVSEventName.Message],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(MirrorVSEventName.TaskModeSwitched),
		payload: mirrorCodeEventsSchema.shape[MirrorVSEventName.TaskModeSwitched],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(MirrorVSEventName.TaskAskResponded),
		payload: mirrorCodeEventsSchema.shape[MirrorVSEventName.TaskAskResponded],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(MirrorVSEventName.QueuedMessagesUpdated),
		payload: mirrorCodeEventsSchema.shape[MirrorVSEventName.QueuedMessagesUpdated],
		taskId: z.number().optional(),
	}),

	// Task Analytics
	z.object({
		eventName: z.literal(MirrorVSEventName.TaskToolFailed),
		payload: mirrorCodeEventsSchema.shape[MirrorVSEventName.TaskToolFailed],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(MirrorVSEventName.TaskTokenUsageUpdated),
		payload: mirrorCodeEventsSchema.shape[MirrorVSEventName.TaskTokenUsageUpdated],
		taskId: z.number().optional(),
	}),

	// Query Responses
	z.object({
		eventName: z.literal(MirrorVSEventName.CommandsResponse),
		payload: mirrorCodeEventsSchema.shape[MirrorVSEventName.CommandsResponse],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(MirrorVSEventName.ModesResponse),
		payload: mirrorCodeEventsSchema.shape[MirrorVSEventName.ModesResponse],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(MirrorVSEventName.ModelsResponse),
		payload: mirrorCodeEventsSchema.shape[MirrorVSEventName.ModelsResponse],
		taskId: z.number().optional(),
	}),
])

export type TaskEvent = z.infer<typeof taskEventSchema>
