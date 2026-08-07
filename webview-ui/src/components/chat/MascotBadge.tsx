import React, { useState, useEffect } from "react"
import { cn } from "@src/lib/utils"

export type MascotStatus = "idle" | "streaming" | "interactive" | "completed" | "error"

interface MascotBadgeProps {
	status?: MascotStatus
	className?: string
}

interface MascotExpression {
	expressions: string[]
	funnyQuotes: string[]
	label: string
	dotClass: string
	badgeClass: string
}

const MASCOT_EXPRESSIONS: Record<MascotStatus, MascotExpression> = {
	streaming: {
		expressions: ["(•̀ᴗ•́)⚡", "(🔥_🔥)", "(⚙️‿⚙️)", "(๑•̀ㅂ•́)و", "(⚡‿⚡)", "(•_•)ᕗ", "(🚀_🚀)"],
		funnyQuotes: [
			"Cooking code... 👨‍🍳",
			"Brewing logic... ☕",
			"Reticulating splines... 🌀",
			"Zooming through files! 🚀",
			"Big brain energy 🧠⚡",
			"Synthesizing magic... ✨",
		],
		label: "Working",
		dotClass: "bg-mirror-brand-via animate-pulse shadow-[0_0_10px_rgba(168,85,247,0.8)]",
		badgeClass: "border-purple-500/40 bg-purple-500/15 text-purple-200 shadow-purple-900/20",
	},
	interactive: {
		expressions: ["(•_•;)", "(👉👈)", "(🥺)", "(👀)", "(🤔)", "(,,>_<,,)", "(😳)"],
		funnyQuotes: [
			"Your turn! 👉👈",
			"Permission please? 🥺",
			"Waiting for master... 👑",
			"Is it a YES? 😳",
			"Shall we proceed? 🤔",
		],
		label: "Waiting",
		dotClass: "bg-yellow-400 animate-ping shadow-[0_0_10px_rgba(250,204,21,0.8)]",
		badgeClass: "border-yellow-500/40 bg-yellow-500/15 text-yellow-200 shadow-yellow-900/20",
	},
	completed: {
		expressions: ["(★‿★)", "(٩(ˊᗜˋ*)و)", "(✿◠‿◠)", "(🎉‿🎉)", "(✨▽✨)", "(⌐■_■)"],
		funnyQuotes: [
			"Nailed it! 🎯",
			"Clean sweep! ✨",
			"Ez pz lemon squeezy 🍋",
			"Ta-da! 🪄",
			"Mission accomplished 🫡",
			"Zero bugs detected! 🌈",
		],
		label: "Completed",
		dotClass: "bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.8)]",
		badgeClass: "border-green-500/40 bg-green-500/15 text-green-200 shadow-green-900/20",
	},
	error: {
		expressions: ["(x_x)", "(╥﹏╥)", "(꒪ o ꒪)", "(╯°□°)╯", "(⊙_⊙;)", "(😿)"],
		funnyQuotes: [
			"Oof! 💥",
			"My code hit a snag 🙈",
			"BRB, weeping 😿",
			"Minor hiccup! 🩹",
			"Did not see that coming 😵",
		],
		label: "Error",
		dotClass: "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]",
		badgeClass: "border-red-500/40 bg-red-500/15 text-red-200 shadow-red-900/20",
	},
	idle: {
		expressions: ["(•‿•)", "( ˘▽˘ )", "(◕‿◕✿)", "(^-^*)", "(⊃‿⊂)", "(｡♥‿♥｡)"],
		funnyQuotes: [
			"Ready when you are! ☕",
			"Dreaming of clean code ☁️",
			"Feed me prompts 🍪",
			"Standing by 🫡",
			"100% charged and ready! 🔋",
		],
		label: "Ready",
		dotClass: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]",
		badgeClass: "border-vscode-panel-border/50 bg-vscode-badge-background/20 text-vscode-foreground",
	},
}

export const MascotBadge: React.FC<MascotBadgeProps> = ({ status = "idle", className }) => {
	const info = MASCOT_EXPRESSIONS[status] || MASCOT_EXPRESSIONS.idle
	const [expressionIndex, setExpressionIndex] = useState(0)
	const [quoteIndex, setQuoteIndex] = useState(0)

	// Cycle expressions periodically while active
	useEffect(() => {
		const intervalMs = status === "streaming" ? 2500 : status === "interactive" ? 3000 : 5000
		const timer = setInterval(() => {
			setExpressionIndex((prev) => (prev + 1) % info.expressions.length)
			setQuoteIndex((prev) => (prev + 1) % info.funnyQuotes.length)
		}, intervalMs)

		return () => clearInterval(timer)
	}, [status, info.expressions.length, info.funnyQuotes.length])

	const currentExpression = info.expressions[expressionIndex % info.expressions.length] || info.expressions[0]
	const currentQuote = info.funnyQuotes[quoteIndex % info.funnyQuotes.length] || info.funnyQuotes[0]

	return (
		<div
			className={cn(
				"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono tracking-tight border transition-all duration-300 select-none shadow-sm cursor-pointer hover:scale-105 active:scale-95",
				info.badgeClass,
				className,
			)}
			title={`${info.label} • ${currentQuote}`}>
			<span className={cn("w-2 h-2 rounded-full shrink-0 transition-all", info.dotClass)} />
			<span className="font-semibold leading-none text-xs">{currentExpression}</span>
		</div>
	)
}
