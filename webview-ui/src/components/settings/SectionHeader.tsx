import { HTMLAttributes } from "react"

import { cn } from "@/lib/utils"

type SectionHeaderProps = HTMLAttributes<HTMLDivElement> & {
	children: React.ReactNode
	description?: string
}

export const SectionHeader = ({ description, children, className, ...props }: SectionHeaderProps) => {
	return (
		<div
			className={cn(
				"border-b border-vscode-editorGroup-border/50 pb-3 mb-2",
				className,
			)}
			{...props}>
			<h3 className="text-lg font-bold bg-gradient-to-r from-mirror-brand-from via-mirror-brand-via to-mirror-brand-to bg-clip-text text-transparent m-0">{children}</h3>
			{description && <p className="text-vscode-descriptionForeground text-xs mt-1 mb-0">{description}</p>}
		</div>
	)
}
