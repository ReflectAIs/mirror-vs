import { memo, useMemo, useState, useEffect } from "react"
import { Text } from "ink"

// Native spinner frames — no @inkjs/ui dependency needed
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
const SPINNER_INTERVAL_MS = 80

const THINKING_PHRASES = [
	"Thinking",
	"Pondering",
	"Contemplating",
	"Reticulating",
	"Marinating",
	"Actualizing",
	"Crunching",
	"Untangling",
	"Summoning",
	"Conjuring",
	"Materializing",
	"Synthesizing",
	"Assembling",
	"Percolating",
	"Brewing",
	"Manifesting",
	"Cogitating",
]

interface LoadingTextProps {
	children?: React.ReactNode
}

function LoadingText({ children }: LoadingTextProps) {
	const [frameIndex, setFrameIndex] = useState(0)

	useEffect(() => {
		const timer = setInterval(() => {
			setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length)
		}, SPINNER_INTERVAL_MS)
		return () => clearInterval(timer)
	}, [])

	const randomPhrase = useMemo(() => {
		const randomIndex = Math.floor(Math.random() * THINKING_PHRASES.length)
		return THINKING_PHRASES[randomIndex]
	}, [])

	const childrenStr = children ? String(children) : ""
	const useRandomPhrase = !children || childrenStr === "Thinking"
	const label = useRandomPhrase ? `${randomPhrase}...` : `${childrenStr}...`
	const frame = SPINNER_FRAMES[frameIndex] ?? SPINNER_FRAMES[0]

	return (
		<Text>
			<Text color="cyan">{frame} </Text>
			<Text color="gray">{label}</Text>
		</Text>
	)
}

export default memo(LoadingText)
