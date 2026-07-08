// npx vitest run src/__tests__/index.test.ts

import { generatePackageJson } from "../index.js"

describe("generatePackageJson", () => {
	it("should be a test", () => {
		const generatedPackageJson = generatePackageJson({
			packageJson: {
				name: "mirror-vs",
				displayName: "%extension.displayName%",
				description: "%extension.description%",
				publisher: "ReflectAI",
				version: "3.17.2",
				icon: "assets/icons/icon.png",
				contributes: {
					viewsContainers: {
						activitybar: [
							{
								id: "mirror-vs-ActivityBar",
								title: "%views.activitybar.title%",
								icon: "assets/icons/icon.svg",
							},
						],
					},
					views: {
						"mirror-vs-ActivityBar": [
							{
								type: "webview",
								id: "mirror-vs.SidebarProvider",
								name: "",
							},
						],
					},
					commands: [
						{
							command: "mirror-vs.plusButtonClicked",
							title: "%command.newTask.title%",
							icon: "$(edit)",
						},
						{
							command: "mirror-vs.openInNewTab",
							title: "%command.openInNewTab.title%",
							category: "%configuration.title%",
						},
					],
					menus: {
						"editor/context": [
							{
								submenu: "mirror-vs.contextMenu",
								group: "navigation",
							},
						],
						"mirror-vs.contextMenu": [
							{
								command: "mirror-vs.addToContext",
								group: "1_actions@1",
							},
						],
						"editor/title": [
							{
								command: "mirror-vs.plusButtonClicked",
								group: "navigation@1",
								when: "activeWebviewPanelId == mirror-vs.TabPanelProvider",
							},
							{
								command: "mirror-vs.settingsButtonClicked",
								group: "navigation@6",
								when: "activeWebviewPanelId == mirror-vs.TabPanelProvider",
							},
							{
								command: "mirror-vs.accountButtonClicked",
								group: "navigation@6",
								when: "activeWebviewPanelId == mirror-vs.TabPanelProvider",
							},
						],
					},
					submenus: [
						{
							id: "mirror-vs.contextMenu",
							label: "%views.contextMenu.label%",
						},
						{
							id: "mirror-vs.terminalMenu",
							label: "%views.terminalMenu.label%",
						},
					],
					configuration: {
						title: "%configuration.title%",
						properties: {
							"mirror-vs.allowedCommands": {
								type: "array",
								items: {
									type: "string",
								},
								default: ["npm test", "npm install", "tsc", "git log", "git diff", "git show"],
								description: "%commands.allowedCommands.description%",
							},
							"mirror-vs.customStoragePath": {
								type: "string",
								default: "",
								description: "%settings.customStoragePath.description%",
							},
						},
					},
				},
				scripts: {
					lint: "eslint **/*.ts",
				},
			},
			overrideJson: {
				name: "mirror-code-nightly",
				displayName: "Mirror VS Nightly",
				publisher: "ReflectAI",
				version: "0.0.1",
				icon: "assets/icons/icon-nightly.png",
				scripts: {},
			},
			substitution: ["mirror-vs", "mirror-code-nightly"],
		})

		expect(generatedPackageJson).toStrictEqual({
			name: "mirror-code-nightly",
			displayName: "Mirror VS Nightly",
			description: "%extension.description%",
			publisher: "ReflectAI",
			version: "0.0.1",
			icon: "assets/icons/icon-nightly.png",
			contributes: {
				viewsContainers: {
					activitybar: [
						{
							id: "mirror-code-nightly-ActivityBar",
							title: "%views.activitybar.title%",
							icon: "assets/icons/icon.svg",
						},
					],
				},
				views: {
					"mirror-code-nightly-ActivityBar": [
						{
							type: "webview",
							id: "mirror-code-nightly.SidebarProvider",
							name: "",
						},
					],
				},
				commands: [
					{
						command: "mirror-code-nightly.plusButtonClicked",
						title: "%command.newTask.title%",
						icon: "$(edit)",
					},
					{
						command: "mirror-code-nightly.openInNewTab",
						title: "%command.openInNewTab.title%",
						category: "%configuration.title%",
					},
				],
				menus: {
					"editor/context": [
						{
							submenu: "mirror-code-nightly.contextMenu",
							group: "navigation",
						},
					],
					"mirror-code-nightly.contextMenu": [
						{
							command: "mirror-code-nightly.addToContext",
							group: "1_actions@1",
						},
					],
					"editor/title": [
						{
							command: "mirror-code-nightly.plusButtonClicked",
							group: "navigation@1",
							when: "activeWebviewPanelId == mirror-code-nightly.TabPanelProvider",
						},
						{
							command: "mirror-code-nightly.settingsButtonClicked",
							group: "navigation@6",
							when: "activeWebviewPanelId == mirror-code-nightly.TabPanelProvider",
						},
						{
							command: "mirror-code-nightly.accountButtonClicked",
							group: "navigation@6",
							when: "activeWebviewPanelId == mirror-code-nightly.TabPanelProvider",
						},
					],
				},
				submenus: [
					{
						id: "mirror-code-nightly.contextMenu",
						label: "%views.contextMenu.label%",
					},
					{
						id: "mirror-code-nightly.terminalMenu",
						label: "%views.terminalMenu.label%",
					},
				],
				configuration: {
					title: "%configuration.title%",
					properties: {
						"mirror-code-nightly.allowedCommands": {
							type: "array",
							items: {
								type: "string",
							},
							default: ["npm test", "npm install", "tsc", "git log", "git diff", "git show"],
							description: "%commands.allowedCommands.description%",
						},
						"mirror-code-nightly.customStoragePath": {
							type: "string",
							default: "",
							description: "%settings.customStoragePath.description%",
						},
					},
				},
			},
			scripts: {},
		})
	})
})
