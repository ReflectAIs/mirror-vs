import { z } from "zod"

import { mirrorCodeSettingsSchema } from "./global-settings.js"

/**
 * Mirror CLI stdin commands
 */

export const mirrorCliCommandNames = ["start", "message", "cancel", "ping", "shutdown"] as const

export const mirrorCliCommandNameSchema = z.enum(mirrorCliCommandNames)

export type MirrorCliCommandName = z.infer<typeof mirrorCliCommandNameSchema>

export const mirrorCliCommandBaseSchema = z.object({
	command: mirrorCliCommandNameSchema,
	requestId: z.string().min(1),
})

export type MirrorCliCommandBase = z.infer<typeof mirrorCliCommandBaseSchema>

const mirrorCliSessionIdSchema = z
	.string()
	.trim()
	.regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)

export const mirrorCliStartCommandSchema = mirrorCliCommandBaseSchema.extend({
	command: z.literal("start"),
	prompt: z.string(),
	taskId: mirrorCliSessionIdSchema.optional(),
	images: z.array(z.string()).optional(),
	configuration: mirrorCodeSettingsSchema.optional(),
})

export type MirrorCliStartCommand = z.infer<typeof mirrorCliStartCommandSchema>

export const mirrorCliMessageCommandSchema = mirrorCliCommandBaseSchema.extend({
	command: z.literal("message"),
	prompt: z.string(),
	images: z.array(z.string()).optional(),
})

export type MirrorCliMessageCommand = z.infer<typeof mirrorCliMessageCommandSchema>

export const mirrorCliCancelCommandSchema = mirrorCliCommandBaseSchema.extend({
	command: z.literal("cancel"),
})

export type MirrorCliCancelCommand = z.infer<typeof mirrorCliCancelCommandSchema>

export const mirrorCliPingCommandSchema = mirrorCliCommandBaseSchema.extend({
	command: z.literal("ping"),
})

export type MirrorCliPingCommand = z.infer<typeof mirrorCliPingCommandSchema>

export const mirrorCliShutdownCommandSchema = mirrorCliCommandBaseSchema.extend({
	command: z.literal("shutdown"),
})

export type MirrorCliShutdownCommand = z.infer<typeof mirrorCliShutdownCommandSchema>

export const mirrorCliInputCommandSchema = z.discriminatedUnion("command", [
	mirrorCliStartCommandSchema,
	mirrorCliMessageCommandSchema,
	mirrorCliCancelCommandSchema,
	mirrorCliPingCommandSchema,
	mirrorCliShutdownCommandSchema,
])

export type MirrorCliInputCommand = z.infer<typeof mirrorCliInputCommandSchema>

/**
 * Mirror CLI stream-json output
 */

export const mirrorCliOutputFormats = ["text", "json", "stream-json"] as const

export const mirrorCliOutputFormatSchema = z.enum(mirrorCliOutputFormats)

export type MirrorCliOutputFormat = z.infer<typeof mirrorCliOutputFormatSchema>

export const mirrorCliEventTypes = [
	"system",
	"control",
	"queue",
	"assistant",
	"user",
	"tool_use",
	"tool_result",
	"thinking",
	"error",
	"result",
] as const

export const mirrorCliEventTypeSchema = z.enum(mirrorCliEventTypes)

export type MirrorCliEventType = z.infer<typeof mirrorCliEventTypeSchema>

export const mirrorCliControlSubtypes = ["ack", "done", "error"] as const

export const mirrorCliControlSubtypeSchema = z.enum(mirrorCliControlSubtypes)

export type MirrorCliControlSubtype = z.infer<typeof mirrorCliControlSubtypeSchema>

export const mirrorCliQueueItemSchema = z.object({
	id: z.string().min(1),
	text: z.string().optional(),
	imageCount: z.number().optional(),
	timestamp: z.number().optional(),
})

export type MirrorCliQueueItem = z.infer<typeof mirrorCliQueueItemSchema>

export const mirrorCliToolUseSchema = z.object({
	name: z.string(),
	input: z.record(z.unknown()).optional(),
})

export type MirrorCliToolUse = z.infer<typeof mirrorCliToolUseSchema>

export const mirrorCliToolResultSchema = z.object({
	name: z.string(),
	output: z.string().optional(),
	error: z.string().optional(),
	exitCode: z.number().optional(),
})

export type MirrorCliToolResult = z.infer<typeof mirrorCliToolResultSchema>

export const mirrorCliCostSchema = z.object({
	totalCost: z.number().optional(),
	inputTokens: z.number().optional(),
	outputTokens: z.number().optional(),
	cacheWrites: z.number().optional(),
	cacheReads: z.number().optional(),
})

export type MirrorCliCost = z.infer<typeof mirrorCliCostSchema>

export const mirrorCliStreamEventSchema = z
	.object({
		type: mirrorCliEventTypeSchema.optional(),
		subtype: z.string().optional(),
		requestId: z.string().optional(),
		command: mirrorCliCommandNameSchema.optional(),
		taskId: z.string().optional(),
		code: z.string().optional(),
		content: z.string().optional(),
		success: z.boolean().optional(),
		id: z.number().optional(),
		done: z.boolean().optional(),
		queueDepth: z.number().optional(),
		queue: z.array(mirrorCliQueueItemSchema).optional(),
		schemaVersion: z.number().optional(),
		protocol: z.string().optional(),
		capabilities: z.array(z.string()).optional(),
		tool_use: mirrorCliToolUseSchema.optional(),
		tool_result: mirrorCliToolResultSchema.optional(),
		cost: mirrorCliCostSchema.optional(),
	})
	.passthrough()

export type MirrorCliStreamEvent = z.infer<typeof mirrorCliStreamEventSchema>

export const mirrorCliControlEventSchema = mirrorCliStreamEventSchema.extend({
	type: z.literal("control"),
	subtype: mirrorCliControlSubtypeSchema,
	requestId: z.string().min(1),
})

export type MirrorCliControlEvent = z.infer<typeof mirrorCliControlEventSchema>

export const mirrorCliFinalOutputSchema = z.object({
	type: z.literal("result"),
	success: z.boolean(),
	content: z.string().optional(),
	cost: mirrorCliCostSchema.optional(),
	events: z.array(mirrorCliStreamEventSchema),
})

export type MirrorCliFinalOutput = z.infer<typeof mirrorCliFinalOutputSchema>
