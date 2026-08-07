import { useState, useEffect, useCallback, useRef } from "react"

export type ModelActivity = "idle" | "reading" | "thinking" | "writing"

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
 * An animated diamond mascot with facial expressions that react to model activity states.
 *
 * States:
 * - idle:    Neutral eyes, gentle smile, gentle floating
 * - reading: Squinting/concentrating eyes, straight mouth, scanning beam
 * - thinking: Eyes looking upward, wavy thoughtful mouth, rotating sparkles
 * - writing:  Wide excited eyes, open happy mouth, rapid sparkle bursts
 *
 * Moods (hover + idle):
 * - happy:    Normal rounded eyes, gentle smile
 * - curious:  One eye narrower, small 'o' mouth
 * - sleepy:   Half-closed eyes, relaxed slight smile
 * - excited:  Wide bright eyes, big open smile
 * - silly:    Wink + tongue out
 * - love:     Heart eyes with floating hearts
 * - surprised: Wide O mouth, shake animation
 *
 * Interactivity:
 * - Hover: Triggers bounce animation, ground line appears, mood cycles, pupil tracking
 * - Click: Brief "pop" pulse effect
 * - Double-click: Celebration animation with sparkles
 * - Auto-blink: Eyes close momentarily every 3-4 seconds
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

	// Auto-blinking every 3-4 seconds
	useEffect(() => {
		const scheduleBlink = () => {
			const delay = 3000 + Math.random() * 2000 // 3-5 seconds
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

	// Pupil tracking on hover (normal size only)
	useEffect(() => {
		if (size !== "normal" || !isHovered) {
			setPupilOffset({ x: 0, y: 0 })
			return
		}

		const container = containerRef.current
		if (!container) return

		const handleMouseMove = (e: MouseEvent) => {
			const rect = container.getBoundingClientRect()
			const centerX = rect.left + rect.width / 2
			const centerY = rect.top + rect.height / 2
			// Map mouse position relative to center, clamp to max 2px offset
			const dx = Math.max(-2, Math.min(2, (e.clientX - centerX) / 30))
			const dy = Math.max(-1.5, Math.min(1.5, (e.clientY - centerY) / 40))
			setPupilOffset({ x: dx, y: dy })
		}

		window.addEventListener("mousemove", handleMouseMove)
		return () => window.removeEventListener("mousemove", handleMouseMove)
	}, [isHovered, size])

	const handleClick = useCallback(() => {
		clickCountRef.current += 1

		if (clickCountRef.current === 1) {
			// Single click
			setIsClicked(true)
			if (clickTimerRef.current) {
				clearTimeout(clickTimerRef.current)
			}
			clickTimerRef.current = setTimeout(() => {
				setIsClicked(false)
				clickCountRef.current = 0
			}, 700)
		} else if (clickCountRef.current >= 2) {
			// Double click — celebration!
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

		// Reset double-click detection after a short window
		setTimeout(() => {
			clickCountRef.current = 0
		}, 300)
	}, [])

	const diamondAnimation = () => {
		if (isDoubleClicked) {
			return "mirror-celebrate 0.8s ease-out"
		}
		if (isClicked) {
			return "mirror-click-pop 0.3s ease-out"
		}
		switch (activity) {
			case "reading":
				return "mirror-read 1.5s ease-in-out infinite"
			case "thinking":
				return "mirror-think 2s ease-in-out infinite"
			case "writing":
				return "mirror-write 0.8s ease-in-out infinite"
			default:
				return "mirror-float 3s ease-in-out infinite"
		}
	}

	const sparkleCount = activity === "writing" ? 8 : activity === "thinking" ? 4 : 0

	/**
	 * Returns the current mood for idle state when hovered.
	 */
	const getIdleMood = (): Mood => {
		if (!isHovered) return "happy"
		return MOOD_CYCLE[moodIndex]
	}

	const currentMood = getIdleMood()

	/**
	 * Returns the eye shape configuration based on the current activity and mood.
	 */
	const getEye = (side: "left" | "right"): EyeShape => {
		const cx = side === "left" ? 31 : 65
		const baseCy = 37

		// Blink takes priority — eyes close
		if (isBlinking) {
			return { cx, cy: baseCy, rx: 3.5, ry: 0.5, pupilOffsetX: 0, pupilOffsetY: 0 }
		}

		if (isDoubleClicked) {
			// Starry happy squint
			return { cx, cy: baseCy, rx: 5, ry: 4, pupilOffsetX: 0, pupilOffsetY: 0 }
		}

		if (isClicked) {
			// Wide excited happy starry-like eyes
			return { cx, cy: baseCy, rx: 5.5, ry: 5.5, pupilOffsetX: 0, pupilOffsetY: 0 }
		}

		if (activity !== "idle") {
			switch (activity) {
				case "reading":
					// Squinting / concentrating eyes
					return { cx, cy: baseCy, rx: 4, ry: 2, pupilOffsetX: 0, pupilOffsetY: 0 }
				case "thinking":
					// Looking upward, slightly narrowed
					return { cx, cy: baseCy - 1, rx: 3.5, ry: 2.5, pupilOffsetX: 0, pupilOffsetY: -1.5 }
				case "writing":
					// Wide excited eyes
					return { cx, cy: baseCy, rx: 4.5, ry: 5.5, pupilOffsetX: 0, pupilOffsetY: 0 }
				default:
					return { cx, cy: baseCy, rx: 3.5, ry: 4.5, pupilOffsetX: 0, pupilOffsetY: 0 }
			}
		}

		// Idle state — mood-based expressions when hovered
		const mood = getIdleMood()
		switch (mood) {
			case "curious":
				return {
					cx,
					cy: baseCy,
					rx: side === "left" ? 3.5 : 3.5,
					ry: side === "left" ? 4.5 : 3.5,
					pupilOffsetX: side === "left" ? 0.5 : -0.5,
					pupilOffsetY: 0,
				}
			case "sleepy":
				return { cx, cy: baseCy + 1, rx: 3, ry: 1.5, pupilOffsetX: 0, pupilOffsetY: 0 }
			case "excited":
				return { cx, cy: baseCy, rx: 4, ry: 5, pupilOffsetX: 0, pupilOffsetY: 0 }
			case "silly":
				// Left eye wink (narrow), right eye normal
				return {
					cx,
					cy: baseCy,
					rx: side === "left" ? 4 : 3.5,
					ry: side === "left" ? 1 : 4.5,
					pupilOffsetX: side === "left" ? 0 : 0.5,
					pupilOffsetY: 0,
				}
			case "love":
				// Heart-shaped eyes - wider, rounder
				return { cx, cy: baseCy - 1, rx: 4.5, ry: 5, pupilOffsetX: 0, pupilOffsetY: 0 }
			case "surprised":
				// Wide round eyes
				return { cx, cy: baseCy, rx: 5, ry: 5.5, pupilOffsetX: 0, pupilOffsetY: 0 }
			default:
				// Neutral / happy — normal rounded eyes
				return { cx, cy: baseCy, rx: 3.5, ry: 4.5, pupilOffsetX: 0, pupilOffsetY: 0 }
		}
	}

	/**
	 * Returns an SVG path string for the mouth based on the current activity and mood.
	 */
	const getMouthPath = (): string => {
		if (isDoubleClicked) {
			// Huge happy open smile
			return "M 34 48 Q 48 70 62 48"
		}

		if (isClicked) {
			// Big open curved smile!
			return "M 36 50 Q 48 65 60 50"
		}

		if (activity !== "idle") {
			switch (activity) {
				case "reading":
					return "M 42 58 L 54 58"
				case "thinking":
					return "M 39 56 Q 44 52 48 56 Q 52 60 57 56"
				case "writing":
					return "M 38 52 Q 48 68 58 52"
				default:
					return "M 39 54 Q 48 62 57 54"
			}
		}

		const mood = getIdleMood()
		switch (mood) {
			case "curious":
				return "M 43 56 Q 48 53 53 56"
			case "sleepy":
				return "M 42 57 Q 48 59 54 57"
			case "excited":
				return "M 37 50 Q 48 66 59 50"
			case "silly":
				// Slightly crooked smile
				return "M 39 56 Q 45 68 57 58"
			case "love":
				// Soft curved smile
				return "M 38 52 Q 48 64 58 52"
			case "surprised":
				// Open "O" shape
				return "M 40 54 Q 48 46 56 54 Q 48 62 40 54"
			default:
				return "M 39 54 Q 48 62 57 54"
		}
	}

	/**
	 * Returns eyebrows SVG paths based on mood.
	 */
	const getEyebrows = (): { left: string; right: string } | null => {
		if (size === "small") return null

		const mood = getIdleMood()
		switch (mood) {
			case "surprised":
				return {
					left: "M 22 25 Q 31 18 38 25",
					right: "M 58 25 Q 65 18 74 25",
				}
			case "sleepy":
				return {
					left: "M 22 28 Q 31 30 38 28",
					right: "M 58 28 Q 65 30 74 28",
				}
			case "silly":
				return {
					left: "M 22 24 Q 31 20 38 24",
					right: "M 58 24 Q 65 28 74 24",
				}
			case "curious":
				return {
					left: "M 22 25 Q 31 22 38 25",
					right: "M 58 25 Q 65 22 74 25",
				}
			default:
				return null
		}
	}

	const leftEye = getEye("left")
	const rightEye = getEye("right")
	const mouthPath = getMouthPath()
	const eyebrows = getEyebrows()

	// Blush opacity varies by mood
	const getBlushOpacity = (): number => {
		if (isDoubleClicked) return 0.65
		if (isClicked) return 0.5
		const mood = getIdleMood()
		switch (mood) {
			case "love":
				return 0.55
			case "excited":
				return 0.5
			case "silly":
				return 0.45
			case "surprised":
				return 0.4
			default:
				return 0.35
		}
	}

	const blushOpacity = getBlushOpacity()

	if (size === "small") {
		return (
			<div className="cursor-pointer active:scale-95 transition-transform" onClick={handleClick}>
				<svg viewBox="0 0 96 96" className="h-8 w-auto block overflow-visible select-none" role="presentation">
					<defs>
						<linearGradient id="mirror-gradient-small" x1="0%" y1="0%" x2="100%" y2="100%">
							<stop offset="0%" stopColor="var(--mirror-brand-from, #10b981)" />
							<stop offset="50%" stopColor="var(--mirror-brand-via, #14b8a6)" />
							<stop offset="100%" stopColor="var(--mirror-brand-to, #06b6d4)" />
						</linearGradient>
					</defs>
					{/* Base head circle */}
					<circle
						cx="48"
						cy="48"
						r="38"
						fill="var(--vscode-sideBar-background)"
						stroke="url(#mirror-gradient-small)"
						strokeWidth="2.5"
					/>

					{/* Cheeks */}
					<ellipse cx="48" cy="54" rx="24" ry="8" fill="#f472b6" opacity={blushOpacity} />

					{/* Left eye — white */}
					<ellipse cx={leftEye.cx} cy={leftEye.cy} rx={leftEye.rx} ry={leftEye.ry} fill="#ffffff" />
					{/* Left eye — pupil + catchlight */}
					<circle
						cx={leftEye.cx + leftEye.pupilOffsetX}
						cy={leftEye.cy + leftEye.pupilOffsetY}
						r={1.5}
						fill="#1e293b"
					/>
					{leftEye.ry > 1.5 && (
						<circle
							cx={leftEye.cx + leftEye.pupilOffsetX - 0.8}
							cy={leftEye.cy + leftEye.pupilOffsetY - 0.8}
							r={0.6}
							fill="#ffffff"
							opacity={0.9}
						/>
					)}

					{/* Right eye — white */}
					<ellipse cx={rightEye.cx} cy={rightEye.cy} rx={rightEye.rx} ry={rightEye.ry} fill="#ffffff" />
					{/* Right eye — pupil + catchlight */}
					<circle
						cx={rightEye.cx + rightEye.pupilOffsetX}
						cy={rightEye.cy + rightEye.pupilOffsetY}
						r={1.5}
						fill="#1e293b"
					/>
					{rightEye.ry > 1.5 && (
						<circle
							cx={rightEye.cx + rightEye.pupilOffsetX - 0.8}
							cy={rightEye.cy + rightEye.pupilOffsetY - 0.8}
							r={0.6}
							fill="#ffffff"
							opacity={0.9}
						/>
					)}

					{/* Mouth */}
					<path d={mouthPath} fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />

					{/* Tongue for silly mood */}
					{getIdleMood() === "silly" && activity === "idle" && (
						<path d="M 46 62 Q 48 68 52 60" fill="#f472b6" opacity={0.7} />
					)}
				</svg>
			</div>
		)
	}

	// Hearts for love mood
	const showHearts = getIdleMood() === "love" && activity === "idle" && isHovered

	// Surprised shake
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
			aria-label={`Mirror VS mascot — ${activity} state`}
			style={{
				transform: isDoubleClicked
					? "translateY(-8px) scale(1.15)"
					: isClicked
						? "translateY(-12px) scale(1.25) rotate(360deg)"
						: undefined,
				transition: "transform 0.6s cubic-bezier(0.34, 1.6, 0.64, 1)",
				animation:
					currentMood === "surprised" && activity === "idle" && isHovered
						? "mirror-shake 0.5s ease-in-out"
						: undefined,
			}}>
			{/* Funny developer quote speech bubble on hover */}
			{isHovered && size === "normal" && (
				<div className="absolute -top-7 left-1/2 -translate-x-1/2 z-50 pointer-events-none whitespace-nowrap bg-purple-900/90 text-purple-100 text-[10.5px] font-mono px-3 py-1 rounded-full shadow-xl border border-purple-400/40 animate-bounce">
					{FUNNY_DEVELOPER_QUOTES[quoteIndex % FUNNY_DEVELOPER_QUOTES.length]}
				</div>
			)}

			{/* Orbiting sparkles for thinking/writing states */}
			{sparkleCount > 0 && (
				<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
					{Array.from({ length: sparkleCount }).map((_, i) => (
						<div
							key={i}
							className="absolute size-1.5 rounded-full"
							style={{
								backgroundColor: "var(--vscode-foreground)",
								opacity: 0.6,
								animation: `mirror-sparkle-${activity} ${activity === "writing" ? "0.6s" : "1.2s"} ease-in-out infinite`,
								animationDelay: `${i * (activity === "writing" ? 0.075 : 0.3)}s`,
								transform: `rotate(${(360 / sparkleCount) * i}deg) translateX(${activity === "writing" ? "28px" : "22px"})`,
								transformOrigin: "center",
							}}
						/>
					))}
				</div>
			)}

			{/* Floating hearts for love mood */}
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

			{/* Main character */}
			<div
				className="relative"
				style={{
					animation: mainAnimation,
				}}>
				{/* Glow effect behind character — enhanced on hover/click */}
				<div
					className="absolute -inset-3 rounded-full opacity-30 blur-md transition-all duration-300"
					style={{
						background:
							activity === "writing"
								? "radial-gradient(circle, var(--vscode-foreground) 0%, transparent 70%)"
								: activity === "thinking"
									? "radial-gradient(circle, var(--vscode-foreground) 0%, transparent 60%)"
									: isDoubleClicked
										? "radial-gradient(circle, #f472b6 0%, transparent 70%)"
										: isHovered
											? "radial-gradient(circle, var(--vscode-foreground) 0%, transparent 55%)"
											: "radial-gradient(circle, var(--vscode-foreground) 0%, transparent 50%)",
						opacity: isDoubleClicked ? 0.7 : isClicked ? 0.6 : isHovered ? 0.4 : 0.3,
						animation:
							activity === "idle" && !isClicked && !isDoubleClicked
								? "mirror-glow-pulse 2s ease-in-out infinite"
								: activity === "thinking" && !isClicked && !isDoubleClicked
									? "mirror-glow-pulse 1.5s ease-in-out infinite"
									: !isClicked && !isDoubleClicked
										? "mirror-glow-pulse 0.8s ease-in-out infinite"
										: undefined,
					}}
				/>

				{/* SVG Character with facial expressions */}
				<svg viewBox="0 0 96 96" className="h-8 w-auto block" role="presentation">
					<defs>
						<linearGradient id="mirror-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
							<stop offset="0%" stopColor="var(--mirror-brand-from, #10b981)" />
							<stop offset="50%" stopColor="var(--mirror-brand-via, #14b8a6)" />
							<stop offset="100%" stopColor="var(--mirror-brand-to, #06b6d4)" />
						</linearGradient>
					</defs>
					{/* Base head circle */}
					<circle
						cx="48"
						cy="48"
						r="38"
						fill="var(--vscode-sideBar-background)"
						stroke="url(#mirror-gradient)"
						strokeWidth="2.5"
					/>

					{/* Eyebrows */}
					{eyebrows && (
						<>
							<path
								d={eyebrows.left}
								fill="none"
								stroke="#ffffff"
								strokeWidth="2"
								strokeLinecap="round"
								opacity={0.6}
								className="transition-all duration-300 ease-in-out"
							/>
							<path
								d={eyebrows.right}
								fill="none"
								stroke="#ffffff"
								strokeWidth="2"
								strokeLinecap="round"
								opacity={0.6}
								className="transition-all duration-300 ease-in-out"
							/>
						</>
					)}

					{/* Cheeks with blush pulse animation */}
					<ellipse
						cx="48"
						cy={getIdleMood() === "surprised" ? 56 : 54}
						rx="24"
						ry="8"
						fill="#f472b6"
						opacity={blushOpacity}
						className={isHovered && activity === "idle" ? undefined : undefined}
						style={
							isHovered &&
							activity === "idle" &&
							(getIdleMood() === "love" || getIdleMood() === "excited")
								? { animation: "mirror-blush-pulse 1.5s ease-in-out infinite" }
								: undefined
						}
					/>

					{/* Left eye — white */}
					<ellipse
						cx={leftEye.cx}
						cy={leftEye.cy}
						rx={leftEye.rx}
						ry={leftEye.ry}
						fill="#ffffff"
						className="transition-all duration-300 ease-in-out"
					/>
					{/* Left eye — pupil + catchlight */}
					<circle
						cx={leftEye.cx + leftEye.pupilOffsetX + (isHovered && activity === "idle" ? pupilOffset.x : 0)}
						cy={leftEye.cy + leftEye.pupilOffsetY + (isHovered && activity === "idle" ? pupilOffset.y : 0)}
						r={1.5}
						fill="#1e293b"
						className="transition-all duration-300 ease-in-out"
					/>
					{/* Catchlight (specular highlight) */}
					{leftEye.ry > 1.5 && (
						<circle
							cx={
								leftEye.cx +
								leftEye.pupilOffsetX +
								(isHovered && activity === "idle" ? pupilOffset.x : 0) -
								0.8
							}
							cy={
								leftEye.cy +
								leftEye.pupilOffsetY +
								(isHovered && activity === "idle" ? pupilOffset.y : 0) -
								0.8
							}
							r={0.6}
							fill="#ffffff"
							opacity={0.9}
						/>
					)}

					{/* Right eye — white */}
					<ellipse
						cx={rightEye.cx}
						cy={rightEye.cy}
						rx={rightEye.rx}
						ry={rightEye.ry}
						fill="#ffffff"
						className="transition-all duration-300 ease-in-out"
					/>
					{/* Right eye — pupil + catchlight */}
					<circle
						cx={
							rightEye.cx + rightEye.pupilOffsetX + (isHovered && activity === "idle" ? pupilOffset.x : 0)
						}
						cy={
							rightEye.cy + rightEye.pupilOffsetY + (isHovered && activity === "idle" ? pupilOffset.y : 0)
						}
						r={1.5}
						fill="#1e293b"
						className="transition-all duration-300 ease-in-out"
					/>
					{/* Catchlight (specular highlight) */}
					{rightEye.ry > 1.5 && (
						<circle
							cx={
								rightEye.cx +
								rightEye.pupilOffsetX +
								(isHovered && activity === "idle" ? pupilOffset.x : 0) -
								0.8
							}
							cy={
								rightEye.cy +
								rightEye.pupilOffsetY +
								(isHovered && activity === "idle" ? pupilOffset.y : 0) -
								0.8
							}
							r={0.6}
							fill="#ffffff"
							opacity={0.9}
						/>
					)}

					{/* Mouth */}
					<path
						d={mouthPath}
						fill={
							getIdleMood() === "surprised" && activity === "idle" && isHovered
								? "rgba(255,255,255,0.15)"
								: "none"
						}
						stroke="#ffffff"
						strokeWidth="2.5"
						strokeLinecap="round"
						className="transition-all duration-300 ease-in-out"
					/>

					{/* Tongue for silly mood */}
					{getIdleMood() === "silly" && activity === "idle" && isHovered && (
						<path
							d="M 44 62 Q 48 70 54 60"
							fill="#f472b6"
							opacity={0.75}
							className="transition-all duration-300 ease-in-out"
						/>
					)}
				</svg>
			</div>

			{/* Scanning beam for reading state */}
			{activity === "reading" && (
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

			{/* Side gradients */}
			<div className="z-4 bg-gradient-to-r from-transparent to-vscode-sideBar-background absolute top-0 right-0 bottom-0 w-10 opacity-100" />
			<div className="z-3 bg-gradient-to-l from-transparent to-vscode-sideBar-background absolute top-0 left-0 bottom-0 w-10 opacity-100" />
		</div>
	)
}

export default MirrorHero
