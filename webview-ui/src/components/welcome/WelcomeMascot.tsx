import React, { useState, useEffect, useRef, useCallback } from "react"

import { useExtensionState } from "@/context/ExtensionStateContext"
import { cn } from "@/lib/utils"

type ExpressionType = "happy" | "sparkle" | "wink" | "cat" | "curious" | "love"

const EXPRESSIONS: ExpressionType[] = ["happy", "sparkle", "wink", "cat", "curious", "love"]

export const WelcomeMascot: React.FC<{ className?: string }> = ({ className }) => {
	const { mascotTheme = "cyberpunk" } = useExtensionState()

	const [expressionIndex, setExpressionIndex] = useState(0)
	const [isBlinking, setIsBlinking] = useState(false)
	const [isJiggling, setIsJiggling] = useState(false)
	const [isHovered, setIsHovered] = useState(false)

	const jiggleTimeoutRef = useRef<ReturnType<typeof setTimeout>>()

	// Natural blinking
	useEffect(() => {
		let blinkTimer: ReturnType<typeof setTimeout>
		const scheduleBlink = () => {
			const delay = Math.random() * 3200 + 2200
			blinkTimer = setTimeout(() => {
				setIsBlinking(true)
				setTimeout(() => {
					setIsBlinking(false)
					scheduleBlink()
				}, 160)
			}, delay)
		}
		scheduleBlink()
		return () => clearTimeout(blinkTimer)
	}, [])

	// Click to cycle cute expressions with a playful squish
	const handleClick = useCallback(() => {
		setIsJiggling(true)
		setExpressionIndex((prev) => (prev + 1) % EXPRESSIONS.length)

		if (jiggleTimeoutRef.current) clearTimeout(jiggleTimeoutRef.current)
		jiggleTimeoutRef.current = setTimeout(() => {
			setIsJiggling(false)
		}, 450)
	}, [])

	// Theme color palette for crisp glowing accents
	const colors = {
		cyberpunk: {
			rimStart: "#38bdf8",
			rimMid: "#818cf8",
			rimEnd: "#f43f5e",
			glow: "#38bdf8",
			blush: "#f43f5e",
			ear: "#818cf8",
		},
		synthwave: {
			rimStart: "#ec4899",
			rimMid: "#a855f7",
			rimEnd: "#38bdf8",
			glow: "#f472b6",
			blush: "#fb7185",
			ear: "#ec4899",
		},
		retro: {
			rimStart: "#10b981",
			rimMid: "#34d399",
			rimEnd: "#f59e0b",
			glow: "#34d399",
			blush: "#f59e0b",
			ear: "#10b981",
		},
		solar: {
			rimStart: "#f59e0b",
			rimMid: "#f97316",
			rimEnd: "#ef4444",
			glow: "#fbbf24",
			blush: "#ea580c",
			ear: "#f59e0b",
		},
	}[mascotTheme] || {
		rimStart: "#38bdf8",
		rimMid: "#818cf8",
		rimEnd: "#f43f5e",
		glow: "#38bdf8",
		blush: "#f43f5e",
		ear: "#818cf8",
	}

	const currentExpression = EXPRESSIONS[expressionIndex]

	const renderEyesAndMouth = () => {
		if (isBlinking && currentExpression !== "wink") {
			return (
				<>
					<line
						x1="23"
						y1="36"
						x2="31"
						y2="36"
						stroke={colors.glow}
						strokeWidth="2.8"
						strokeLinecap="round"
					/>
					<line
						x1="41"
						y1="36"
						x2="49"
						y2="36"
						stroke={colors.glow}
						strokeWidth="2.8"
						strokeLinecap="round"
					/>
					<path
						d="M 33 42 Q 36 44 39 42"
						fill="none"
						stroke={colors.glow}
						strokeWidth="2"
						strokeLinecap="round"
					/>
				</>
			)
		}

		switch (currentExpression) {
			case "sparkle":
				return (
					<>
						{/* Starry anime eyes */}
						<g transform="translate(27, 36)">
							<path
								d="M 0 -5 L 1.5 -1.5 L 5 0 L 1.5 1.5 L 0 5 L -1.5 1.5 L -5 0 L -1.5 -1.5 Z"
								fill={colors.glow}
							/>
							<circle cx="2" cy="-2" r="1" fill="#ffffff" />
						</g>
						<g transform="translate(45, 36)">
							<path
								d="M 0 -5 L 1.5 -1.5 L 5 0 L 1.5 1.5 L 0 5 L -1.5 1.5 L -5 0 L -1.5 -1.5 Z"
								fill={colors.glow}
							/>
							<circle cx="2" cy="-2" r="1" fill="#ffffff" />
						</g>
						{/* Open cheerful mouth */}
						<path
							d="M 33 41 Q 36 46 39 41"
							fill={colors.glow}
							stroke={colors.glow}
							strokeWidth="1.5"
							strokeLinecap="round"
						/>
					</>
				)

			case "wink":
				return (
					<>
						{/* Left happy curved eye */}
						<path
							d="M 23 37 Q 27 31 31 37"
							fill="none"
							stroke={colors.glow}
							strokeWidth="2.8"
							strokeLinecap="round"
						/>
						{/* Right winking eye */}
						<path d="M 41 36 L 49 36" stroke={colors.glow} strokeWidth="2.8" strokeLinecap="round" />
						{/* Cute wry smile */}
						<path
							d="M 33 42 Q 37 45 40 42"
							fill="none"
							stroke={colors.glow}
							strokeWidth="2"
							strokeLinecap="round"
						/>
					</>
				)

			case "cat":
				return (
					<>
						{/* Anime squint cat eyes > < */}
						<path
							d="M 24 33 L 30 36 L 24 39"
							fill="none"
							stroke={colors.glow}
							strokeWidth="2.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
						<path
							d="M 48 33 L 42 36 L 48 39"
							fill="none"
							stroke={colors.glow}
							strokeWidth="2.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
						{/* Cat 3 mouth */}
						<path
							d="M 32 41 Q 34 44 36 42 Q 38 44 40 41"
							fill="none"
							stroke={colors.glow}
							strokeWidth="2"
							strokeLinecap="round"
						/>
					</>
				)

			case "curious":
				return (
					<>
						{/* Big round sparkly anime eyes */}
						<g transform="translate(27, 36)">
							<ellipse cx="0" cy="0" rx="4.5" ry="5.5" fill={colors.glow} />
							<circle cx="-1.5" cy="-2" r="1.8" fill="#ffffff" />
							<circle cx="1.5" cy="1.8" r="1" fill="#ffffff" />
						</g>
						<g transform="translate(45, 36)">
							<ellipse cx="0" cy="0" rx="4.5" ry="5.5" fill={colors.glow} />
							<circle cx="-1.5" cy="-2" r="1.8" fill="#ffffff" />
							<circle cx="1.5" cy="1.8" r="1" fill="#ffffff" />
						</g>
						{/* Cute small dot/o mouth */}
						<ellipse cx="36" cy="43" rx="1.5" ry="2" fill={colors.glow} />
					</>
				)

			case "love":
				return (
					<>
						{/* Glowing heart eyes */}
						<g transform="translate(27, 36)">
							<path
								d="M 0 -1.5 C -1.5 -4.5 -5 -3 -5 0 C -5 3 0 5.5 0 6 C 0 5.5 5 3 5 0 C 5 -3 1.5 -4.5 0 -1.5 Z"
								fill={colors.blush}
							/>
						</g>
						<g transform="translate(45, 36)">
							<path
								d="M 0 -1.5 C -1.5 -4.5 -5 -3 -5 0 C -5 3 0 5.5 0 6 C 0 5.5 5 3 5 0 C 5 -3 1.5 -4.5 0 -1.5 Z"
								fill={colors.blush}
							/>
						</g>
						{/* Big sweet smile */}
						<path
							d="M 32 42 Q 36 47 40 42"
							fill="none"
							stroke={colors.glow}
							strokeWidth="2.2"
							strokeLinecap="round"
						/>
					</>
				)

			case "happy":
			default:
				return (
					<>
						{/* Gentle happy curved anime eyes (^ ‿ ^) */}
						<path
							d="M 23 37 Q 27 30 31 37"
							fill="none"
							stroke={colors.glow}
							strokeWidth="2.8"
							strokeLinecap="round"
						/>
						<path
							d="M 41 37 Q 45 30 49 37"
							fill="none"
							stroke={colors.glow}
							strokeWidth="2.8"
							strokeLinecap="round"
						/>
						{/* Sweet curved smile */}
						<path
							d="M 33 42 Q 36 45 39 42"
							fill="none"
							stroke={colors.glow}
							strokeWidth="2.2"
							strokeLinecap="round"
						/>
					</>
				)
		}
	}

	return (
		<div
			className={cn(
				"relative inline-flex items-center justify-center select-none cursor-pointer group mx-auto my-1",
				className,
			)}
			onClick={handleClick}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			role="button"
			tabIndex={0}
			title="Click to change expression!"
			aria-label={`Mirror VS Companion Mascot — ${currentExpression} expression`}
			data-testid="welcome-mascot">
			<style>{`
				@keyframes mascot-chibi-float {
					0%, 100% {
						transform: translateY(0px);
					}
					50% {
						transform: translateY(-4px);
					}
				}
				@keyframes mascot-chibi-jiggle {
					0% { transform: scale(1, 1); }
					25% { transform: scale(1.12, 0.88); }
					50% { transform: scale(0.92, 1.1); }
					75% { transform: scale(1.04, 0.97); }
					100% { transform: scale(1, 1); }
				}
			`}</style>

			{/* Chibi Head Container */}
			<div
				className="w-18 h-18 relative transition-transform duration-200"
				style={{
					animation: isJiggling
						? "mascot-chibi-jiggle 0.45s ease-out"
						: isHovered
							? "mascot-chibi-float 1.8s ease-in-out infinite"
							: "mascot-chibi-float 3s ease-in-out infinite",
				}}>
				<svg viewBox="0 0 72 72" className="w-full h-full block" role="presentation">
					<defs>
						{/* Crisp Head Rim Gradient */}
						<linearGradient id="chibi-rim" x1="0%" y1="0%" x2="100%" y2="100%">
							<stop offset="0%" stopColor={colors.rimStart} />
							<stop offset="50%" stopColor={colors.rimMid} />
							<stop offset="100%" stopColor={colors.rimEnd} />
						</linearGradient>

						{/* Sleek Dark OLED Screen */}
						<linearGradient id="chibi-screen" x1="0%" y1="0%" x2="0%" y2="100%">
							<stop offset="0%" stopColor="#1e1b4b" />
							<stop offset="60%" stopColor="#0f0728" />
							<stop offset="100%" stopColor="#080318" />
						</linearGradient>
					</defs>

					{/* Cute Cyber Ear Fins */}
					{/* Left Ear */}
					<path d="M 18 25 C 15 14 22 10 26 18 Z" fill={colors.ear} opacity="0.9" />
					{/* Right Ear */}
					<path d="M 54 25 C 57 14 50 10 46 18 Z" fill={colors.ear} opacity="0.9" />

					{/* Chibi Rounded Squircle Bezel */}
					<rect
						x="8"
						y="16"
						width="56"
						height="48"
						rx="22"
						ry="22"
						fill="#181825"
						stroke="url(#chibi-rim)"
						strokeWidth="2.5"
					/>

					{/* Inner Visor Display */}
					<rect x="11" y="19" width="50" height="42" rx="19" ry="19" fill="url(#chibi-screen)" />

					{/* Curved Glossy Glass Highlight Arc */}
					<path d="M 17 28 C 24 23 48 23 55 28 C 48 25 24 25 17 28 Z" fill="#ffffff" opacity="0.22" />

					{/* Rosy Cheek Blush */}
					<ellipse cx="21" cy="42" rx="3.5" ry="2" fill={colors.blush} opacity="0.45" />
					<ellipse cx="51" cy="42" rx="3.5" ry="2" fill={colors.blush} opacity="0.45" />

					{/* Eyes and Mouth */}
					{renderEyesAndMouth()}
				</svg>
			</div>
		</div>
	)
}

export default WelcomeMascot
