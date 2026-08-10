import { useState, useEffect, useCallback, useRef } from "react"

export type ModelActivity = "idle" | "reading" | "thinking" | "writing" | "error" | "completed" | "sleeping"

interface MirrorHeroProps {
	activity?: ModelActivity
	size?: "small" | "normal"
}

type EyeShape = {
	cx: number
	cy: number
	rx: number
	ry: number
	pupilOffsetX: number
	pupilOffsetY: number
}

type Mood = "happy" | "curious" | "sleepy" | "excited" | "silly" | "love" | "surprised" | "cool" | "cheeky"

const MOOD_CYCLE: Mood[] = ["happy", "curious", "sleepy", "excited", "silly", "love", "surprised", "cool", "cheeky"]

const FUNNY_DEVELOPER_QUOTES = [
	"I don't always test code, but when I do, I do it in prod! 😎",
	"Converting coffee into clean code... ☕",
	"It's not a bug, it's an undocumented feature! 🐛✨",
	"Did you try turning it off and on again? 🔌",
	"LGTM! (Let's Get This Money) 💸",
	"Remember to hydrate while debugging! 💧",
	"git commit -m 'fixed stuff' 🚀",
	"Zero errors, zero warnings... is this real life? 🌈",
	"Ctrl+C, Ctrl+V... peak software engineering! 🪄",
	"Works on my machine! 💻✨",
	"404: Sleep not found 🌙",
	"Reticulating splines... 🌀",
]

/**
 * An animated robotic screen mascot with glowing neon facial expressions that react to model activity states.
 */
const MirrorHero = ({ activity = "idle", size = "normal" }: MirrorHeroProps) => {
	const [isHovered, setIsHovered] = useState(false)
	const [isClicked, setIsClicked] = useState(false)
	const [isDoubleClicked, setIsDoubleClicked] = useState(false)
	const [isBlinking, setIsBlinking] = useState(false)
	const [moodIndex, setMoodIndex] = useState(0)
	const [quoteIndex, setQuoteIndex] = useState(0)
	const clickTimerRef = useRef<ReturnType<typeof setTimeout>>()
	const clickCountRef = useRef(0)
	const moodCycleRef = useRef<ReturnType<typeof setInterval>>()
	const blinkTimerRef = useRef<ReturnType<typeof setTimeout>>()
	const containerRef = useRef<HTMLDivElement>(null)
	const [pupilOffset, setPupilOffset] = useState({ x: 0, y: 0 })

	const [isSleeping, setIsSleeping] = useState(false)
	const lastActivityTimeRef = useRef<number>(Date.now())

	const resetSleepTimer = useCallback(() => {
		setIsSleeping(false)
		lastActivityTimeRef.current = Date.now()
	}, [])

	// Mood cycling on hover while idle
	useEffect(() => {
		if (isHovered && activity === "idle") {
			setQuoteIndex(Math.floor(Math.random() * FUNNY_DEVELOPER_QUOTES.length))
			moodCycleRef.current = setInterval(() => {
				setMoodIndex((prev) => (prev + 1) % MOOD_CYCLE.length)
			}, 2000)
		} else {
			if (moodCycleRef.current) {
				clearInterval(moodCycleRef.current)
				moodCycleRef.current = undefined
			}
			setMoodIndex(0)
		}

		return () => {
			if (moodCycleRef.current) {
				clearInterval(moodCycleRef.current)
			}
		}
	}, [isHovered, activity])

	// Auto-blinking every 4-5 seconds
	useEffect(() => {
		const scheduleBlink = () => {
			const delay = 4000 + Math.random() * 2000
			blinkTimerRef.current = setTimeout(() => {
				setIsBlinking(true)
				setTimeout(() => setIsBlinking(false), 150)
				scheduleBlink()
			}, delay)
		}
		scheduleBlink()

		return () => {
			if (blinkTimerRef.current) {
				clearTimeout(blinkTimerRef.current)
			}
		}
	}, [])

	// Face tracking (entire face group slides in response to mouse movement)
	useEffect(() => {
		const container = containerRef.current
		if (!container) return

		const handleMouseMove = (e: MouseEvent) => {
			resetSleepTimer()
			const rect = container.getBoundingClientRect()
			const centerX = rect.left + rect.width / 2
			const centerY = rect.top + rect.height / 2
			const dxRaw = e.clientX - centerX
			const dyRaw = e.clientY - centerY
			const distance = Math.sqrt(dxRaw * dxRaw + dyRaw * dyRaw)

			const maxOffset = size === "small" ? 1.5 : 3.0
			const scale = Math.min(maxOffset, distance / 40)

			const dx = distance > 0 ? (dxRaw / distance) * scale : 0
			const dy = distance > 0 ? (dyRaw / distance) * scale : 0

			setPupilOffset({ x: dx, y: dy })
		}

		window.addEventListener("mousemove", handleMouseMove)
		return () => window.removeEventListener("mousemove", handleMouseMove)
	}, [size, resetSleepTimer])

	// Sleep timer logic (sleep after 5 mins of idle)
	useEffect(() => {
		if (activity !== "idle") {
			setIsSleeping(false)
			lastActivityTimeRef.current = Date.now()
			return
		}

		const checkSleep = () => {
			const idleTime = Date.now() - lastActivityTimeRef.current
			if (idleTime >= 300000) {
				setIsSleeping(true)
			} else {
				const remaining = 300000 - idleTime
				sleepTimeout = setTimeout(checkSleep, remaining)
			}
		}

		let sleepTimeout = setTimeout(checkSleep, 300000)
		return () => clearTimeout(sleepTimeout)
	}, [activity])

	const handleClick = useCallback(() => {
		resetSleepTimer()
		clickCountRef.current += 1

		if (clickCountRef.current === 1) {
			setIsClicked(true)
			if (clickTimerRef.current) {
				clearTimeout(clickTimerRef.current)
			}
			clickTimerRef.current = setTimeout(() => {
				setIsClicked(false)
				clickCountRef.current = 0
			}, 700)
		} else if (clickCountRef.current >= 2) {
			setIsDoubleClicked(true)
			setIsClicked(false)
			if (clickTimerRef.current) {
				clearTimeout(clickTimerRef.current)
			}
			clickTimerRef.current = setTimeout(() => {
				setIsDoubleClicked(false)
				clickCountRef.current = 0
			}, 1200)
		}

		setTimeout(() => {
			clickCountRef.current = 0
		}, 300)
	}, [resetSleepTimer])

	const activeState = activity === "sleeping" || isSleeping ? "sleeping" : activity

	const diamondAnimation = () => {
		if (isDoubleClicked) {
			return "mirror-celebrate 0.8s ease-out"
		}
		if (isClicked) {
			return "mirror-click-pop 0.3s ease-out"
		}
		switch (activeState) {
			case "reading":
				return "mirror-read 1.5s ease-in-out infinite"
			case "thinking":
				return "mirror-think 2s ease-in-out infinite"
			case "writing":
				return "mirror-write 0.8s ease-in-out infinite"
			case "sleeping":
				return "mirror-float 4s ease-in-out infinite"
			default:
				return "mirror-float 3s ease-in-out infinite"
		}
	}

	const sparkleCount = activeState === "writing" ? 8 : activeState === "thinking" ? 4 : 0

	const getIdleMood = (): Mood => {
		if (!isHovered) return "happy"
		return MOOD_CYCLE[moodIndex]
	}

	const currentMood = getIdleMood()

	const getMouthPath = (): string => {
		if (isDoubleClicked) {
			return "M 34 48 Q 48 70 62 48"
		}
		if (isClicked) {
			return "M 36 50 Q 48 65 60 50"
		}
		if (activeState === "error") {
			return "M 42 56 Q 48 50 54 56"
		}
		if (activeState === "completed") {
			return "M 36 50 Q 48 68 60 50"
		}
		if (activeState === "sleeping") {
			return "M 44 54 L 52 54"
		}
		if (activeState !== "idle") {
			switch (activeState) {
				case "reading":
					return "M 42 56 L 54 56"
				case "thinking":
					return "M 40 56 Q 48 52 56 56"
				case "writing":
					return "M 38 52 Q 48 66 58 52"
				default:
					return "M 41 54 Q 48 60 55 54"
			}
		}

		const mood = getIdleMood()
		switch (mood) {
			case "curious":
				return "M 43 56 Q 48 53 53 56"
			case "sleepy":
				return "M 44 55 Q 48 57 52 55"
			case "excited":
				return "M 37 50 Q 48 66 59 50"
			case "silly":
				return "M 39 54 Q 45 66 57 56"
			case "love":
				return "M 38 52 Q 48 64 58 52"
			case "surprised":
				return "M 42 54 Q 48 48 54 54 Q 48 60 42 54"
			default:
				return "M 41 54 Q 48 60 55 54"
		}
	}

	const mouthPath = getMouthPath()

	// Cheeks blush opacity
	const getBlushOpacity = (): number => {
		if (isDoubleClicked) return 0.65
		if (isClicked) return 0.5
		const mood = getIdleMood()
		switch (mood) {
			case "love":
				return 0.6
			case "excited":
				return 0.55
			case "silly":
				return 0.5
			case "surprised":
				return 0.45
			default:
				return 0.4
		}
	}

	const blushOpacity = getBlushOpacity()

	// Visor / Face elements for rendering
	const renderVisorFace = () => {
		const leftCx = 31
		const rightCx = 65
		const cy = 37

		if (isBlinking) {
			return (
				<>
					<path
						d={`M ${leftCx - 5} ${cy} L ${leftCx + 5} ${cy}`}
						stroke="#22d3ee"
						strokeWidth="4.5"
						strokeLinecap="round"
						filter="url(#neon-glow)"
					/>
					<path
						d={`M ${rightCx - 5} ${cy} L ${rightCx + 5} ${cy}`}
						stroke="#22d3ee"
						strokeWidth="4.5"
						strokeLinecap="round"
						filter="url(#neon-glow)"
					/>
				</>
			)
		}

		if (activeState === "error") {
			return (
				<>
					<path
						d={`M ${leftCx - 4.5} ${cy - 4.5} L ${leftCx + 4.5} ${cy + 4.5} M ${leftCx + 4.5} ${cy - 4.5} L ${leftCx - 4.5} ${cy + 4.5}`}
						stroke="#f87171"
						strokeWidth="4.5"
						strokeLinecap="round"
						filter="url(#neon-glow)"
					/>
					<path
						d={`M ${rightCx - 4.5} ${cy - 4.5} L ${rightCx + 4.5} ${cy + 4.5} M ${rightCx + 4.5} ${cy - 4.5} L ${rightCx - 4.5} ${cy + 4.5}`}
						stroke="#f87171"
						strokeWidth="4.5"
						strokeLinecap="round"
						filter="url(#neon-glow)"
					/>
				</>
			)
		}

		if (activeState === "completed" || activeState === "sleeping") {
			const isSleepingState = activeState === "sleeping"
			const strokeColor = isSleepingState ? "#38bdf8" : "#22d3ee"
			return (
				<>
					<path
						d={
							isSleepingState
								? `M ${leftCx - 5} ${cy - 1.5} Q ${leftCx} ${cy + 3.5} ${leftCx + 5} ${cy - 1.5}`
								: `M ${leftCx - 5} ${cy + 1.5} Q ${leftCx} ${cy - 3.5} ${leftCx + 5} ${cy + 1.5}`
						}
						fill="none"
						stroke={strokeColor}
						strokeWidth="4"
						strokeLinecap="round"
						filter="url(#neon-glow)"
					/>
					<path
						d={
							isSleepingState
								? `M ${rightCx - 5} ${cy - 1.5} Q ${rightCx} ${cy + 3.5} ${rightCx + 5} ${cy - 1.5}`
								: `M ${rightCx - 5} ${cy + 1.5} Q ${rightCx} ${cy - 3.5} ${rightCx + 5} ${cy + 1.5}`
						}
						fill="none"
						stroke={strokeColor}
						strokeWidth="4"
						strokeLinecap="round"
						filter="url(#neon-glow)"
					/>
				</>
			)
		}

		// Double clicked / click triggers starry arches
		if (isDoubleClicked || isClicked) {
			return (
				<>
					<path
						d={`M ${leftCx - 5.5} ${cy + 1.5} Q ${leftCx} ${cy - 4.5} ${leftCx + 5.5} ${cy + 1.5}`}
						fill="none"
						stroke="#22d3ee"
						strokeWidth="4.5"
						strokeLinecap="round"
						filter="url(#neon-glow)"
					/>
					<path
						d={`M ${rightCx - 5.5} ${cy + 1.5} Q ${rightCx} ${cy - 4.5} ${rightCx + 5.5} ${cy + 1.5}`}
						fill="none"
						stroke="#22d3ee"
						strokeWidth="4.5"
						strokeLinecap="round"
						filter="url(#neon-glow)"
					/>
				</>
			)
		}

		// Non-idle model activities
		if (activeState !== "idle") {
			switch (activeState) {
				case "reading":
					// concentrated slits
					return (
						<>
							<ellipse cx={leftCx} cy={cy} rx="5.5" ry="2.2" fill="#22d3ee" filter="url(#neon-glow)" />
							<ellipse cx={rightCx} cy={cy} rx="5.5" ry="2.2" fill="#22d3ee" filter="url(#neon-glow)" />
						</>
					)
				case "thinking":
					// looking slightly upward
					return (
						<>
							<circle cx={leftCx} cy={cy - 2} r="5" fill="#38bdf8" filter="url(#neon-glow)" />
							<circle cx={rightCx} cy={cy - 2} r="5" fill="#38bdf8" filter="url(#neon-glow)" />
						</>
					)
				case "writing":
					// sparkly ovals
					return (
						<>
							<ellipse cx={leftCx} cy={cy} rx="5.5" ry="7" fill="#22d3ee" filter="url(#neon-glow)" />
							<ellipse cx={rightCx} cy={cy} rx="5.5" ry="7" fill="#22d3ee" filter="url(#neon-glow)" />
						</>
					)
			}
		}

		// Idle mood states (curious, love, excited, etc.)
		const mood = getIdleMood()
		switch (mood) {
			case "curious":
				return (
					<>
						<ellipse cx={leftCx} cy={cy} rx="5.5" ry="7.5" fill="#22d3ee" filter="url(#neon-glow)" />
						<ellipse cx={rightCx} cy={cy} rx="5.5" ry="4.5" fill="#22d3ee" filter="url(#neon-glow)" />
					</>
				)
			case "sleepy":
				return (
					<>
						<ellipse cx={leftCx} cy={cy + 1.5} rx="5" ry="2.2" fill="#38bdf8" filter="url(#neon-glow)" />
						<ellipse cx={rightCx} cy={cy + 1.5} rx="5" ry="2.2" fill="#38bdf8" filter="url(#neon-glow)" />
					</>
				)
			case "excited":
				return (
					<>
						<circle cx={leftCx} cy={cy} r="6.2" fill="#22d3ee" filter="url(#neon-glow)" />
						<circle cx={rightCx} cy={cy} r="6.2" fill="#22d3ee" filter="url(#neon-glow)" />
					</>
				)
			case "silly":
				// wink left eye, normal right eye
				return (
					<>
						<path
							d={`M ${leftCx - 5} ${cy} L ${leftCx + 5} ${cy}`}
							stroke="#22d3ee"
							strokeWidth="4.5"
							strokeLinecap="round"
							filter="url(#neon-glow)"
						/>
						<ellipse cx={rightCx} cy={cy} rx="5.5" ry="7.5" fill="#22d3ee" filter="url(#neon-glow)" />
					</>
				)
			case "love":
				// glowing pink hearts
				return (
					<>
						<path
							d={`M ${leftCx} ${cy + 2.5} L ${leftCx - 3.5} ${cy - 1} Q ${leftCx - 6} ${cy - 5} ${leftCx - 3} ${cy - 5} Q ${leftCx} ${cy - 2} ${leftCx} ${cy - 2.5} Q ${leftCx} -2 ${leftCx + 3} ${cy - 5} Q ${leftCx + 6} ${cy - 5} ${leftCx + 3} ${cy - 1} Z`}
							fill="#f472b6"
							filter="url(#neon-glow)"
						/>
						<path
							d={`M ${rightCx} ${cy + 2.5} L ${rightCx - 3.5} ${cy - 1} Q ${rightCx - 6} ${cy - 5} ${rightCx - 3} ${cy - 5} Q ${rightCx} ${cy - 2} ${rightCx} ${cy - 2.5} Q ${rightCx} -2 ${rightCx + 3} ${cy - 5} Q ${rightCx + 6} ${cy - 5} ${rightCx + 3} ${cy - 1} Z`}
							fill="#f472b6"
							filter="url(#neon-glow)"
						/>
					</>
				)
			case "surprised":
				return (
					<>
						<circle cx={leftCx} cy={cy} r="6.5" fill="#22d3ee" filter="url(#neon-glow)" />
						<circle cx={rightCx} cy={cy} r="6.5" fill="#22d3ee" filter="url(#neon-glow)" />
					</>
				)
			default:
				// normal happy ovals
				return (
					<>
						<ellipse cx={leftCx} cy={cy} rx="5.5" ry="7" fill="#22d3ee" filter="url(#neon-glow)" />
						<ellipse cx={rightCx} cy={cy} rx="5.5" ry="7" fill="#22d3ee" filter="url(#neon-glow)" />
					</>
				)
		}
	}

	if (size === "small") {
		return (
			<div
				ref={containerRef}
				className="relative cursor-pointer active:scale-95 transition-transform"
				onClick={handleClick}>
				<style>{`
					@keyframes mirror-float-z {
						0% { transform: translateY(0px) scale(0.6); opacity: 0; }
						50% { opacity: 0.8; }
						100% { transform: translateY(-12px) scale(1); opacity: 0; }
					}
					.animate-float-z {
						animation: mirror-float-z 2s ease-in-out infinite;
					}
				`}</style>
				{activeState === "sleeping" && (
					<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
						<span
							className="absolute text-[5px] font-bold text-vscode-foreground opacity-0 animate-float-z"
							style={{ animationDelay: "0s", transform: "translate(10px, -10px)" }}>
							Z
						</span>
						<span
							className="absolute text-[7px] font-bold text-vscode-foreground opacity-0 animate-float-z"
							style={{ animationDelay: "0.6s", transform: "translate(14px, -15px)" }}>
							Z
						</span>
						<span
							className="absolute text-[9px] font-bold text-vscode-foreground opacity-0 animate-float-z"
							style={{ animationDelay: "1.2s", transform: "translate(18px, -20px)" }}>
							Z
						</span>
					</div>
				)}
				<svg viewBox="0 0 96 96" className="h-8 w-auto block overflow-visible select-none" role="presentation">
					<defs>
						<linearGradient id="mirror-gradient-small" x1="0%" y1="0%" x2="100%" y2="100%">
							<stop offset="0%" stopColor="var(--mirror-brand-from, #10b981)" />
							<stop offset="50%" stopColor="var(--mirror-brand-via, #14b8a6)" />
							<stop offset="100%" stopColor="var(--mirror-brand-to, #06b6d4)" />
						</linearGradient>
						<filter id="neon-glow" x="-30%" y="-30%" width="160%" height="160%">
							<feGaussianBlur stdDeviation="1.5" result="blur" />
							<feMerge>
								<feMergeNode in="blur" />
								<feMergeNode in="SourceGraphic" />
							</feMerge>
						</filter>
					</defs>

					{/* Visor head */}
					<circle
						cx="48"
						cy="48"
						r="38"
						fill="#0f0f23"
						stroke="url(#mirror-gradient-small)"
						strokeWidth="3.0"
					/>

					{/* Inner Visor Frame Highlight */}
					<circle cx="48" cy="48" r="36" fill="none" stroke="#ffffff" strokeWidth="0.75" opacity={0.15} />

					{/* Face group shifting in response to cursor */}
					<g transform={`translate(${pupilOffset.x}, ${pupilOffset.y})`}>
						<ellipse cx="48" cy="54" rx="24" ry="8" fill="#f472b6" opacity={0.35} />
						{renderVisorFace()}
						<path
							d={mouthPath}
							fill="none"
							stroke={activeState === "error" ? "#f87171" : "#22d3ee"}
							strokeWidth="3.5"
							strokeLinecap="round"
							filter="url(#neon-glow)"
						/>
					</g>
				</svg>
			</div>
		)
	}

	const showHearts = getIdleMood() === "love" && activeState === "idle" && isHovered
	const mainAnimation = diamondAnimation()

	return (
		<div
			ref={containerRef}
			className="mb-4 relative forced-color-adjust-none group flex flex-col items-center w-30 pt-4 overflow-visible cursor-pointer"
			onMouseEnter={() => {
				setIsHovered(true)
				setQuoteIndex(Math.floor(Math.random() * FUNNY_DEVELOPER_QUOTES.length))
			}}
			onMouseLeave={() => {
				setIsHovered(false)
				setPupilOffset({ x: 0, y: 0 })
			}}
			onClick={handleClick}
			role="img"
			aria-label={`Mirror VS mascot — ${activeState} state`}
			style={{
				transform: isDoubleClicked
					? "translateY(-8px) scale(1.15)"
					: isClicked
						? "translateY(-12px) scale(1.25) rotate(360deg)"
						: undefined,
				transition: "transform 0.6s cubic-bezier(0.34, 1.6, 0.64, 1)",
				animation:
					currentMood === "surprised" && activeState === "idle" && isHovered
						? "mirror-shake 0.5s ease-in-out"
						: undefined,
			}}>
			<style>{`
				@keyframes mirror-float-z {
					0% {
						transform: translateY(0px) scale(0.6);
						opacity: 0;
					}
					50% {
						opacity: 0.8;
					}
					100% {
						transform: translateY(-15px) scale(1);
						opacity: 0;
					}
				}
				.animate-float-z {
					animation: mirror-float-z 2s ease-in-out infinite;
				}
			`}</style>

			{isHovered && size === "normal" && (
				<div className="absolute -top-7 left-1/2 -translate-x-1/2 z-50 pointer-events-none whitespace-nowrap bg-purple-900/90 text-purple-100 text-[10.5px] font-mono px-3 py-1 rounded-full shadow-xl border border-purple-400/40 animate-bounce">
					{FUNNY_DEVELOPER_QUOTES[quoteIndex % FUNNY_DEVELOPER_QUOTES.length]}
				</div>
			)}

			{sparkleCount > 0 && (
				<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
					{Array.from({ length: sparkleCount }).map((_, i) => (
						<div
							key={i}
							className="absolute size-1.5 rounded-full"
							style={{
								backgroundColor: "var(--vscode-foreground)",
								opacity: 0.6,
								animation: `mirror-sparkle-${activeState} ${activeState === "writing" ? "0.6s" : "1.2s"} ease-in-out infinite`,
								animationDelay: `${i * (activeState === "writing" ? 0.075 : 0.3)}s`,
								transform: `rotate(${(360 / sparkleCount) * i}deg) translateX(${activeState === "writing" ? "28px" : "22px"})`,
								transformOrigin: "center",
							}}
						/>
					))}
				</div>
			)}

			{showHearts && (
				<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
					{[0, 1, 2].map((i) => (
						<div
							key={i}
							className="absolute text-pink-400 select-none"
							style={{
								fontSize: "14px",
								animation: `mirror-heart-float ${1.2 + i * 0.3}s ease-out infinite`,
								animationDelay: `${i * 0.4}s`,
								transform: `translateX(${(i - 1) * 12}px)`,
							}}>
							♥
						</div>
					))}
				</div>
			)}

			{activeState === "sleeping" && (
				<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
					<span
						className="absolute text-[8px] font-bold text-vscode-foreground opacity-0 animate-float-z"
						style={{ animationDelay: "0s", transform: "translate(22px, -20px)" }}>
						Z
					</span>
					<span
						className="absolute text-[10px] font-bold text-vscode-foreground opacity-0 animate-float-z"
						style={{ animationDelay: "0.6s", transform: "translate(28px, -28px)" }}>
						Z
					</span>
					<span
						className="absolute text-[12px] font-bold text-vscode-foreground opacity-0 animate-float-z"
						style={{ animationDelay: "1.2s", transform: "translate(34px, -36px)" }}>
						Z
					</span>
				</div>
			)}

			<div
				className="relative"
				style={{
					animation: mainAnimation,
				}}>
				<div
					className="absolute -inset-3 rounded-full opacity-30 blur-md transition-all duration-300"
					style={{
						background:
							activeState === "writing"
								? "radial-gradient(circle, var(--vscode-foreground) 0%, transparent 70%)"
								: activeState === "thinking"
									? "radial-gradient(circle, var(--vscode-foreground) 0%, transparent 60%)"
									: isDoubleClicked
										? "radial-gradient(circle, #f472b6 0%, transparent 70%)"
										: isHovered
											? "radial-gradient(circle, var(--vscode-foreground) 0%, transparent 55%)"
											: "radial-gradient(circle, var(--vscode-foreground) 0%, transparent 50%)",
						opacity: isDoubleClicked ? 0.7 : isClicked ? 0.6 : isHovered ? 0.4 : 0.3,
						animation:
							activeState === "idle" && !isClicked && !isDoubleClicked
								? "mirror-glow-pulse 2s ease-in-out infinite"
								: activeState === "thinking" && !isClicked && !isDoubleClicked
									? "mirror-glow-pulse 1.5s ease-in-out infinite"
									: !isClicked && !isDoubleClicked
										? "mirror-glow-pulse 0.8s ease-in-out infinite"
										: undefined,
					}}
				/>

				<svg viewBox="0 0 96 96" className="h-8 w-auto block overflow-visible" role="presentation">
					<defs>
						<linearGradient id="mirror-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
							<stop offset="0%" stopColor="var(--mirror-brand-from, #10b981)" />
							<stop offset="50%" stopColor="var(--mirror-brand-via, #14b8a6)" />
							<stop offset="100%" stopColor="var(--mirror-brand-to, #06b6d4)" />
						</linearGradient>
						<filter id="neon-glow" x="-30%" y="-30%" width="160%" height="160%">
							<feGaussianBlur stdDeviation="1.5" result="blur" />
							<feMerge>
								<feMergeNode in="blur" />
								<feMergeNode in="SourceGraphic" />
							</feMerge>
						</filter>
					</defs>

					{/* Visor head */}
					<circle cx="48" cy="48" r="38" fill="#0f0f23" stroke="url(#mirror-gradient)" strokeWidth="3.0" />

					{/* Inner Visor Frame Highlight */}
					<circle cx="48" cy="48" r="36" fill="none" stroke="#ffffff" strokeWidth="0.75" opacity={0.15} />

					{/* Face group shifting in response to cursor */}
					<g transform={`translate(${pupilOffset.x}, ${pupilOffset.y})`}>
						<ellipse cx="48" cy="54" rx="24" ry="8" fill="#f472b6" opacity={blushOpacity} />
						{renderVisorFace()}
						<path
							d={mouthPath}
							fill="none"
							stroke={activeState === "error" ? "#f87171" : "#22d3ee"}
							strokeWidth="3.5"
							strokeLinecap="round"
							filter="url(#neon-glow)"
						/>
					</g>
				</svg>
			</div>

			{activeState === "reading" && (
				<div className="absolute top-0 left-0 right-0 h-full pointer-events-none overflow-hidden">
					<div
						className="absolute w-full h-0.5 opacity-30"
						style={{
							backgroundColor: "var(--vscode-foreground)",
							animation: "mirror-scan 1.5s ease-in-out infinite",
						}}
					/>
				</div>
			)}

			<div className="z-4 bg-gradient-to-r from-transparent to-vscode-sideBar-background absolute top-0 right-0 bottom-0 w-10 opacity-100" />
			<div className="z-3 bg-gradient-to-l from-transparent to-vscode-sideBar-background absolute top-0 left-0 bottom-0 w-10 opacity-100" />
		</div>
	)
}

export default MirrorHero
