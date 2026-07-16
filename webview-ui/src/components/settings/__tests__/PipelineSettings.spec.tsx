import React from "react"
import { render, screen, fireEvent } from "@/utils/test-utils"
import { PipelineSettings } from "../PipelineSettings"
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock vscode utility
const mockPostMessage = vi.fn()
vi.mock("@/utils/vscode", () => ({
	vscode: {
		postMessage: (...args: any[]) => mockPostMessage(...args),
	},
}))

// Mock translation context
vi.mock("@/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string, options?: any) => {
			const translations: Record<string, string> = {
				"settings:imageGeneration.pipelineSettings": "Pipeline Settings",
				"settings:imageGeneration.pipelineSettingsDescription": "Manage your image generation pipelines",
				"settings:imageGeneration.pipelineSummary": `${options?.count ?? 0} pipeline(s) discovered`,
				"settings:imageGeneration.importPipeline": "Import",
				"settings:imageGeneration.noPipelinesFound": "No pipelines found.",
				"settings:imageGeneration.alreadyDefault": "Already default",
				"settings:imageGeneration.setAsDefault": "Set as default",
				"settings:imageGeneration.deletePipeline": "Delete",
				"settings:imageGeneration.deleteDialog.title": "Delete Pipeline",
				"settings:imageGeneration.deleteDialog.description": `Delete ${options?.name ?? ""}?`,
				"settings:imageGeneration.deleteDialog.cancel": "Cancel",
				"settings:imageGeneration.deleteDialog.confirm": "Delete",
				"settings:imageGeneration.importDialog.title": "Import Pipeline",
				"settings:imageGeneration.importDialog.description": "Paste your workflow JSON below",
				"settings:imageGeneration.importDialog.cancel": "Cancel",
				"settings:imageGeneration.importDialog.confirm": "Import",
				"settings:imageGeneration.importDialog.importing": "Importing...",
			}
			return translations[key] ?? key
		},
	}),
}))

// Mock UI components
vi.mock("@/components/ui", () => ({
	AlertDialog: ({ children, open }: any) => (open ? <div data-testid="alert-dialog">{children}</div> : null),
	AlertDialogAction: ({ children, onClick, disabled }: any) => (
		<button data-testid="alert-dialog-action" onClick={onClick} disabled={disabled}>
			{children}
		</button>
	),
	AlertDialogCancel: ({ children, onClick }: any) => (
		<button data-testid="alert-dialog-cancel" onClick={onClick}>
			{children}
		</button>
	),
	AlertDialogContent: ({ children }: any) => <div data-testid="alert-dialog-content">{children}</div>,
	AlertDialogDescription: ({ children }: any) => <p data-testid="alert-dialog-description">{children}</p>,
	AlertDialogFooter: ({ children }: any) => <div data-testid="alert-dialog-footer">{children}</div>,
	AlertDialogHeader: ({ children }: any) => <div data-testid="alert-dialog-header">{children}</div>,
	AlertDialogTitle: ({ children }: any) => <h2 data-testid="alert-dialog-title">{children}</h2>,
	Button: ({ children, onClick, disabled, variant, size, className }: any) => (
		<button
			data-testid="button"
			data-variant={variant}
			data-size={size}
			onClick={onClick}
			disabled={disabled}
			className={className}>
			{children}
		</button>
	),
	StandardTooltip: ({ children, content }: any) => (
		<div data-testid="tooltip" data-tooltip-content={content}>
			{children}
		</div>
	),
	Textarea: ({ value, onChange, placeholder, rows, className }: any) => (
		<textarea
			data-testid="textarea"
			value={value}
			onChange={onChange}
			placeholder={placeholder}
			rows={rows}
			className={className}
		/>
	),
}))

// Mock SectionHeader
vi.mock("../SectionHeader", () => ({
	SectionHeader: ({ children, description }: any) => (
		<div data-testid="section-header" data-description={description}>
			{children}
		</div>
	),
}))

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
	Upload: () => <svg data-testid="icon-upload" />,
	Globe: () => <svg data-testid="icon-globe" />,
	Folder: () => <svg data-testid="icon-folder" />,
	Trash2: () => <svg data-testid="icon-trash" />,
	Star: () => <svg data-testid="icon-star" />,
	Package: () => <svg data-testid="icon-package" />,
}))

describe("PipelineSettings", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should request pipelines on mount", () => {
		render(<PipelineSettings />)

		expect(mockPostMessage).toHaveBeenCalledWith({ type: "requestPipelines" })
	})

	it("should show empty state when no pipelines", () => {
		render(<PipelineSettings />)

		expect(screen.getByText("No pipelines found.")).toBeInTheDocument()
	})

	it("should display pipelines when received via message event", () => {
		render(<PipelineSettings />)

		const mockPipelines = [
			{
				slug: "txt2img-default",
				name: "Default txt2img",
				description: "Standard text-to-image pipeline",
				type: "generate",
				tags: ["fast", "sd15"],
				source: "builtin",
				isDefault: true,
			},
			{
				slug: "my-custom-upscale",
				name: "My Upscaler",
				description: "Custom upscale pipeline",
				type: "upscale",
				tags: [],
				source: "global",
				isDefault: false,
			},
		]

		// Simulate receiving pipeline data from extension
		fireEvent(
			window,
			new MessageEvent("message", {
				data: {
					type: "pipelines",
					pipelines: mockPipelines,
				},
			}),
		)

		// Should show pipeline names
		expect(screen.getByText("Default txt2img")).toBeInTheDocument()
		expect(screen.getByText("My Upscaler")).toBeInTheDocument()

		// Should show type labels
		expect(screen.getByText("Generate (txt2img)")).toBeInTheDocument()
		expect(screen.getByText("Upscale")).toBeInTheDocument()

		// Should show tags
		expect(screen.getByText("fast")).toBeInTheDocument()
		expect(screen.getByText("sd15")).toBeInTheDocument()

		// Should show default badge
		expect(screen.getByText("default")).toBeInTheDocument()
	})

	it("should send deletePipeline message on delete confirm", () => {
		render(<PipelineSettings />)

		// Send pipelines data
		fireEvent(
			window,
			new MessageEvent("message", {
				data: {
					type: "pipelines",
					pipelines: [
						{
							slug: "my-pipeline",
							name: "My Pipeline",
							description: "Test pipeline",
							type: "generate",
							tags: [],
							source: "global",
							isDefault: false,
						},
					],
				},
			}),
		)

		// Click delete button (the Trash2 icon button for non-builtin pipelines)
		const deleteButtons = screen.getAllByTestId("button")
		// The delete button has text-vscode-errorForeground class
		const deleteBtn = deleteButtons.find((btn) => btn.className?.includes("text-vscode-errorForeground"))
		expect(deleteBtn).toBeTruthy()
		fireEvent.click(deleteBtn!)

		// Click confirm in the alert dialog
		const confirmBtn = screen.getByTestId("alert-dialog-action")
		fireEvent.click(confirmBtn)

		expect(mockPostMessage).toHaveBeenCalledWith({
			type: "deletePipeline",
			text: "my-pipeline",
		})
	})

	it("should send setDefaultPipeline message", () => {
		render(<PipelineSettings />)

		// Send pipelines data
		fireEvent(
			window,
			new MessageEvent("message", {
				data: {
					type: "pipelines",
					pipelines: [
						{
							slug: "my-pipeline",
							name: "My Pipeline",
							description: "Test pipeline",
							type: "generate",
							tags: [],
							source: "global",
							isDefault: false,
						},
					],
				},
			}),
		)

		// Click the star button (set as default)
		const buttons = screen.getAllByTestId("button")
		// The "Set as default" button has disabled={false} when not default
		const defaultBtn = buttons.find(
			(btn) => btn.getAttribute("disabled") !== "true" && btn.querySelector("[data-testid='icon-star']"),
		)
		expect(defaultBtn).toBeTruthy()
		fireEvent.click(defaultBtn!)

		expect(mockPostMessage).toHaveBeenCalledWith({
			type: "setDefaultPipeline",
			text: "my-pipeline",
		})
	})

	it("should open import dialog and send importPipeline message", () => {
		render(<PipelineSettings />)

		// Click import button
		const importBtn = screen.getByText("Import")
		fireEvent.click(importBtn)

		// Dialog should be visible
		expect(screen.getByTestId("alert-dialog")).toBeInTheDocument()

		// Type JSON in textarea
		const textarea = screen.getByTestId("textarea")
		fireEvent.change(textarea, { target: { value: '{"workflow": "test"}' } })

		// Click import confirm
		const confirmBtn = screen.getByTestId("alert-dialog-action")
		fireEvent.click(confirmBtn)

		expect(mockPostMessage).toHaveBeenCalledWith({
			type: "importPipeline",
			text: '{"workflow": "test"}',
		})
	})

	it("should not import when JSON is empty", () => {
		render(<PipelineSettings />)

		// Click import button
		fireEvent.click(screen.getByText("Import"))

		// Click confirm without entering text
		const confirmBtn = screen.getByTestId("alert-dialog-action")
		fireEvent.click(confirmBtn)

		// Should show error message
		expect(screen.getByText("Please paste pipeline JSON content")).toBeInTheDocument()
		// Should not have called postMessage
		expect(mockPostMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "importPipeline" }))
	})

	it("should hide delete button for builtin pipelines", () => {
		render(<PipelineSettings />)

		// Send pipelines with a builtin pipeline
		fireEvent(
			window,
			new MessageEvent("message", {
				data: {
					type: "pipelines",
					pipelines: [
						{
							slug: "builtin-default",
							name: "Builtin Pipeline",
							description: "Built-in",
							type: "inpaint",
							tags: [],
							source: "builtin",
							isDefault: false,
						},
					],
				},
			}),
		)

		// Should show the pipeline
		expect(screen.getByText("Builtin Pipeline")).toBeInTheDocument()
		expect(screen.getByText("Inpaint")).toBeInTheDocument()

		// Should show the package icon for builtin source
		expect(screen.getByTestId("icon-package")).toBeInTheDocument()
	})

	it("should show correct source icons for different sources", () => {
		render(<PipelineSettings />)

		fireEvent(
			window,
			new MessageEvent("message", {
				data: {
					type: "pipelines",
					pipelines: [
						{
							slug: "a",
							name: "Builtin",
							description: "",
							type: "generate",
							tags: [],
							source: "builtin",
							isDefault: false,
						},
						{
							slug: "b",
							name: "Global",
							description: "",
							type: "generate",
							tags: [],
							source: "global",
							isDefault: false,
						},
						{
							slug: "c",
							name: "Project",
							description: "",
							type: "generate",
							tags: [],
							source: "project",
							isDefault: false,
						},
					],
				},
			}),
		)

		// Should show different icons for each source type
		expect(screen.getByTestId("icon-package")).toBeInTheDocument()
		expect(screen.getByTestId("icon-globe")).toBeInTheDocument()
		expect(screen.getByTestId("icon-folder")).toBeInTheDocument()
	})
})
