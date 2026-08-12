import { z } from "zod"

// Zod schema for RecordSource
export const recordSourceSchema = z.enum(["read_tool", "user_edited", "mirror_edited", "file_mentioned"])

// TypeScript type derived from the Zod schema
export type RecordSource = z.infer<typeof recordSourceSchema>

// Zod schema for FileMetadataEntry
export const fileMetadataEntrySchema = z.object({
	path: z.string(),
	record_state: z.enum(["active", "stale"]),
	record_source: recordSourceSchema,
	storage_tier: z.enum(["hot", "cold"]).optional(),
	mirror_read_date: z.number().nullable(),
	mirror_edit_date: z.number().nullable(),
	user_edit_date: z.number().nullable().optional(),
})

// TypeScript type derived from the Zod schema
export type FileMetadataEntry = z.infer<typeof fileMetadataEntrySchema>

// Zod schema for TaskMetadata
export const taskMetadataSchema = z.object({
	files_in_context: z.array(fileMetadataEntrySchema),
})

// TypeScript type derived from the Zod schema
export type TaskMetadata = z.infer<typeof taskMetadataSchema>
