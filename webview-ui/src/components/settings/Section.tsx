import { HTMLAttributes } from "react"

import { cn } from "@/lib/utils"

type SectionProps = HTMLAttributes<HTMLDivElement>

export const Section = ({ className, ...props }: SectionProps) => (
	<div className={cn("mirror-glass-card flex flex-col gap-5 m-4 p-5", className)} {...props} />
)
