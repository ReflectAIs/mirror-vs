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
		expressions: [
			"(•̀ᴗ•́)⚡",
			"(๑•̀ㅂ•́)و✧",
			"(🔥_🔥)",
			"(づ｡◕‿‿◕｡)づ",
			"(⚙️‿⚙️)",
			"(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧",
			"(⚡‿⚡)",
			"(•_•)ᕗ",
			"(🚀_🚀)",
			"٩(◕‿◕｡)۶",
			"(ง •̀_•́)ง",
			"(✧ω✧)",
			"(•̀ᴗ•́)و",
			"(⚡w⚡)",
		],
		funnyQuotes: [
			"Cooking code... 👨‍🍳",
			"Brewing logic... ☕",
			"Casting syntax spells ✨",
			"Zooming through files! 🚀",
			"Big brain energy 🧠⚡",
			"Synthesizing magic... ✨",
			"Optimizing reality 🔮",
			"Compiling brilliance... 🪄",
			"Speedrunning algorithms 🏎️💨",
		],
		label: "Working",
		dotClass: "bg-mirror-brand-via animate-pulse shadow-[0_0_10px_rgba(168,85,247,0.8)]",
		badgeClass: "border-purple-500/40 bg-purple-500/15 text-purple-200 shadow-purple-900/20",
	},
	interactive: {
		expressions: [
			"(•_•;)",
			"(◕ᴗ◕✿)?",
			"(👉👈)",
			"(🥺)",
			"( ｡• ᵕ •｡ )",
			"(⁄ ⁄>⁄ ▽ ⁄<⁄ ⁄)",
			"(👀)",
			"(🤔)",
			"(,,>_<,,)",
			"(😳)",
			"(👉ﾟヮﾟ)👉",
			"(人 •͈ᴗ•͈)",
			"(•_•?)",
			"(つ≧▽≦)つ",
		],
		funnyQuotes: [
			"Your turn! 👉👈",
			"Permission please? 🥺",
			"Awaiting your wisdom 👑",
			"Is it a YES? 😳",
			"Shall we proceed? 🤔",
			"Ready for feedback! 💌",
			"You hold the keys 🔑",
			"What say you, boss? 🫡",
		],
		label: "Waiting",
		dotClass: "bg-amber-400 shadow-[0_0_8px_rgba(250,204,21,0.5)]",
		badgeClass: "border-yellow-500/40 bg-yellow-500/15 text-yellow-200 shadow-yellow-900/20",
	},
	completed: {
		expressions: [
			"(★‿★)v",
			"(٩(ˊᗜˋ*)و)",
			"(✿◠‿◠)",
			"( ˘ ³˘)♥",
			"(ノ^∇^)ノ",
			"(🎉‿🎉)",
			"(✨▽✨)",
			"(⌐■_■)",
			"(★ω★)",
			"(っ˘ڡ˘ς)",
			"(ﾉ´ヮ`)ﾉ*: ･ﾟ",
			"( •̀ ω •́ )✧",
		],
		funnyQuotes: [
			"Nailed it! 🎯",
			"Clean sweep! ✨",
			"Ez pz lemon squeezy 🍋",
			"Ta-da! 🪄",
			"Mission accomplished 🫡",
			"Zero bugs detected! 🌈",
			"High five! ✋✨",
			"Deploy with confidence! 🚀",
			"Pure engineering gold ⭐",
		],
		label: "Completed",
		dotClass: "bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.8)]",
		badgeClass: "border-green-500/40 bg-green-500/15 text-green-200 shadow-green-900/20",
	},
	error: {
		expressions: [
			"(x_x)",
			"(っ- ‸ - ς)",
			"(╥﹏╥)",
			"(；￣Д￣)",
			"(꒪ o ꒪)",
			"(╯°□°)╯",
			"(⊙_⊙;)",
			"(😿)",
			"(ノ_<。)",
			"(╯°□°)╯︵ ┻━┻",
		],
		funnyQuotes: [
			"Oof! 💥",
			"My code hit a snag 🙈",
			"BRB, weeping 😿",
			"Minor hiccup! 🩹",
			"Let's fix this together 🤝",
			"Did not see that coming 😵",
			"Debugging mode activated 🔍",
		],
		label: "Error",
		dotClass: "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]",
		badgeClass: "border-red-500/40 bg-red-500/15 text-red-200 shadow-red-900/20",
	},
	idle: {
		expressions: [
			"(•‿•)",
			"(◕‿◕✿)",
			"(｡♥‿♥｡)",
			"( ˘▽˘ )",
			"(^-^*)",
			"(⊃‿⊂)",
			"(づ◡﹏◡)づ",
			"(⌒‿⌒)",
			"(¬‿¬)",
			"(★ω★)",
			"(＾▽＾)",
			"(≧◡≦)",
			"( •̀ ω •́ )✧",
		],
		funnyQuotes: [
			"Ready when you are! ☕",
			"Dreaming of clean code ☁️",
			"Feed me prompts 🍪",
			"Standing by 🫡",
			"100% charged and ready! 🔋",
			"What are we building today? 🚀",
			"Ctrl+S is my love language 💾",
			"Click me for good vibes ✨",
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
	const [hovered, setHovered] = useState(false)
	const [animate, setAnimate] = useState(false)

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

	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation()
		setAnimate(true)
		setExpressionIndex((prev) => (prev + 1) % info.expressions.length)
		setQuoteIndex((prev) => (prev + 1) % info.funnyQuotes.length)
		setTimeout(() => setAnimate(false), 400)
	}

	return (
		<div className="relative inline-block select-none">
			<div
				onMouseEnter={() => setHovered(true)}
				onMouseLeave={() => setHovered(false)}
				onClick={handleClick}
				className={cn(
					"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono tracking-tight border transition-all duration-300 cursor-pointer hover:scale-105 active:scale-95 shadow-sm",
					animate && "animate-bounce scale-110",
					info.badgeClass,
					className,
				)}
				title={`${info.label} • ${currentQuote}`}>
				<span className={cn("w-2 h-2 rounded-full shrink-0 transition-all", info.dotClass)} />
				<span className="font-semibold leading-none text-xs">{currentExpression}</span>
			</div>

			{hovered && (
				<div className="absolute z-[9999] bottom-full left-1/2 -translate-x-1/2 mb-2.5 w-44 p-2 rounded-md border border-vscode-panel-border bg-vscode-sideBarSticky-background text-vscode-foreground shadow-xl text-[10px] text-center leading-normal animate-in fade-in-0 zoom-in-95 duration-100">
					<div className="font-bold text-purple-400 mb-0.5 tracking-wide">{info.label}</div>
					<div className="italic text-vscode-descriptionForeground">{currentQuote}</div>
					{/* Speech bubble tail */}
					<div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 rotate-45 border-r border-b border-vscode-panel-border bg-vscode-sideBarSticky-background" />
				</div>
			)}
		</div>
	)
}
