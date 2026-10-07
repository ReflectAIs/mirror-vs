import React from "react"

import { render, screen } from "@/utils/test-utils"

import Announcement from "../Announcement"

vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

vi.mock("@shared/package", () => ({
	Package: {
		version: "0.5.0",
	},
}))

vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeLink: ({ children, href, onClick, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
		<a href={href} onClick={onClick} {...props}>
			{children}
		</a>
	),
}))

vi.mock("react-i18next", () => ({
	Trans: ({ i18nKey, components }: { i18nKey: string; components?: Record<string, React.ReactElement> }) => {
		if (i18nKey === "chat:announcement.feedback" || i18nKey === "chat:announcement.beta.feedback") {
			return (
				<span>
					If you encounter any issues or have suggestions, please let us know on{" "}
					{components?.githubLink && React.cloneElement(components.githubLink, {}, "GitHub")}.
				</span>
			)
		}

		return <span>{i18nKey}</span>
	},
}))

vi.mock("@src/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string, options?: { version?: string }) => {
			const translations: Record<string, string> = {
				"chat:announcement.title": "Mirror VS {{version}}",
				"chat:announcement.intro":
					"Welcome to Mirror VS — an intelligent AI pair programmer that transforms your development workflow. This is our official 1.0.0 release and we hope you love it!",
			}

			if (key === "chat:announcement.title") {
				return `Mirror VS 1.0.0`
			}

			return translations[key] ?? key
		},
	}),
}))

describe("Announcement", () => {
	it("renders the 1.0.0 official release announcement", () => {
		render(<Announcement hideAnnouncement={vi.fn()} />)

		expect(screen.getByText("Mirror VS 1.0.0")).toBeInTheDocument()
		expect(
			screen.getByText(
				"Welcome to Mirror VS — an intelligent AI pair programmer that transforms your development workflow. This is our official 1.0.0 release and we hope you love it!",
			),
		).toBeInTheDocument()
	})

	it("renders the GitHub feedback link", () => {
		render(<Announcement hideAnnouncement={vi.fn()} />)

		expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute(
			"href",
			"https://github.com/ReflectAIs/mirror-vs/issues",
		)
	})

	it("does not render final release links", () => {
		render(<Announcement hideAnnouncement={vi.fn()} />)

		expect(screen.queryByText("Happy coding!")).not.toBeInTheDocument()
		expect(screen.queryByText("ZooCode")).not.toBeInTheDocument()
		expect(screen.queryByText("Mirror")).not.toBeInTheDocument()
	})
})
