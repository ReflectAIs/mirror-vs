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

type Mood = "happy" | "curious" | "sleepy" | "excited"

const MOOD_CYCLE: Mood[] = ["happy", "curious", "sleepy", "excited"]

/**
 * An animated diamond mascot with facial expressions that react to model activity states.
 *
 * States:
 * - idle:    Neutral eyes, gentle smile, gentle floating
 * - reading: Squinting/concentrating eyes, straight mouth, scanning beam
 * - thinking: Eyes looking upward, wavy thoughtful mouth, rotating sparkles
 * - writing:  Wide excited eyes, open happy mouth, rapid sparkle bursts
 *
 * Interactivity:
 * - Hover: Triggers bounce animation, ground line appears, mood cycles
 * - Click: Brief "pop" pulse effect
 */
const MirrorHero = ({ activity = "idle", size = "normal" }: MirrorHeroProps) => {
    const [isHovered, setIsHovered] = useState(false)
    const [isClicked, setIsClicked] = useState(false)
    const [moodIndex, setMoodIndex] = useState(0)
    const clickTimerRef = useRef<ReturnType<typeof setTimeout>>()
    const moodCycleRef = useRef<ReturnType<typeof setInterval>>()

    // Mood cycling on hover while idle
    useEffect(() => {
        if (isHovered && activity === "idle") {
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

    const handleClick = useCallback(() => {
        setIsClicked(true)
        if (clickTimerRef.current) {
            clearTimeout(clickTimerRef.current)
        }
        clickTimerRef.current = setTimeout(() => {
            setIsClicked(false)
        }, 700)
    }, [])

    const diamondAnimation = () => {
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

    /**
     * Returns the eye shape configuration based on the current activity.
     * Each eye is an ellipse defined by center (cx,cy), radii (rx,ry),
     * and a pupil offset from center.
     */
    const getEye = (side: "left" | "right"): EyeShape => {
        const cx = side === "left" ? 31 : 65
        const baseCy = 37

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
                // One eye slightly narrower, looking to the side
                return {
                    cx,
                    cy: baseCy,
                    rx: side === "left" ? 3.5 : 3.5,
                    ry: side === "left" ? 4.5 : 3.5,
                    pupilOffsetX: side === "left" ? 0.5 : -0.5,
                    pupilOffsetY: 0,
                }
            case "sleepy":
                // Dmirrorpy/half-closed eyes
                return { cx, cy: baseCy + 1, rx: 3, ry: 1.5, pupilOffsetX: 0, pupilOffsetY: 0 }
            case "excited":
                // Wide bright eyes
                return { cx, cy: baseCy, rx: 4, ry: 5, pupilOffsetX: 0, pupilOffsetY: 0 }
            default:
                // Neutral / happy — normal rounded eyes
                return { cx, cy: baseCy, rx: 3.5, ry: 4.5, pupilOffsetX: 0, pupilOffsetY: 0 }
        }
    }

    /**
     * Returns an SVG path string for the mouth based on the current activity.
     */
    const getMouthPath = (): string => {
        if (isClicked) {
            // Big open curved smile!
            return "M 36 50 Q 48 65 60 50"
        }

        if (activity !== "idle") {
            switch (activity) {
                case "reading":
                    // Small straight line (concentrating)
                    return "M 42 58 L 54 58"
                case "thinking":
                    // Wavy thoughtful mouth
                    return "M 39 56 Q 44 52 48 56 Q 52 60 57 56"
                case "writing":
                    // Open / excited mouth
                    return "M 38 52 Q 48 68 58 52"
                default:
                    return "M 39 54 Q 48 62 57 54"
            }
        }

        // Idle state — mood-based mouths when hovered
        const mood = getIdleMood()
        switch (mood) {
            case "curious":
                // Small 'o' shape
                return "M 43 56 Q 48 53 53 56"
            case "sleepy":
                // Relaxed slight curve
                return "M 42 57 Q 48 59 54 57"
            case "excited":
                // Big open smile
                return "M 37 50 Q 48 66 59 50"
            default:
                // Gentle smile
                return "M 39 54 Q 48 62 57 54"
        }
    }

    const leftEye = getEye("left")
    const rightEye = getEye("right")
    const mouthPath = getMouthPath()

    if (size === "small") {
        return (
            <div className="cursor-pointer active:scale-95 transition-transform" onClick={handleClick}>
                <svg
                    viewBox="0 0 96 96"
                    className="h-8 w-auto block overflow-visible select-none"
                    role="presentation">
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
                <ellipse
                    cx="48"
                    cy="54"
                    rx="24"
                    ry="8"
                    fill="#f472b6"
                    opacity="0.35"
                />

                {/* Left eye — white */}
                <ellipse
                    cx={leftEye.cx}
                    cy={leftEye.cy}
                    rx={leftEye.rx}
                    ry={leftEye.ry}
                    fill="#ffffff"
                />
                {/* Left eye — pupil */}
                <circle
                    cx={leftEye.cx + leftEye.pupilOffsetX}
                    cy={leftEye.cy + leftEye.pupilOffsetY}
                    r={1.5}
                    fill="#1e293b"
                />

                {/* Right eye — white */}
                <ellipse
                    cx={rightEye.cx}
                    cy={rightEye.cy}
                    rx={rightEye.rx}
                    ry={rightEye.ry}
                    fill="#ffffff"
                />
                {/* Right eye — pupil */}
                <circle
                    cx={rightEye.cx + rightEye.pupilOffsetX}
                    cy={rightEye.cy + rightEye.pupilOffsetY}
                    r={1.5}
                    fill="#1e293b"
                />

                {/* Mouth */}
                <path
                    d={mouthPath}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                />
            </svg>
            </div>
        )
    }

    return (
        <div
            className="mb-4 relative forced-color-adjust-none group flex flex-col items-center w-30 pt-4 overflow-visible cursor-pointer"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={handleClick}
            role="img"
            aria-label={`Mirror VS mascot — ${activity} state`}
            style={{
                transform: isClicked ? "translateY(-12px) scale(1.25) rotate(360deg)" : undefined,
                transition: "transform 0.6s cubic-bezier(0.34, 1.6, 0.64, 1)",
            }}>
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

            {/* Main character */}
            <div
                className="relative"
                style={{
                    animation: diamondAnimation(),
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
                                    : isHovered
                                        ? "radial-gradient(circle, var(--vscode-foreground) 0%, transparent 55%)"
                                        : "radial-gradient(circle, var(--vscode-foreground) 0%, transparent 50%)",
                        opacity: isClicked ? 0.6 : isHovered ? 0.4 : 0.3,
                        animation:
                            activity === "idle" && !isClicked
                                ? "mirror-glow-pulse 2s ease-in-out infinite"
                                : activity === "thinking" && !isClicked
                                    ? "mirror-glow-pulse 1.5s ease-in-out infinite"
                                    : !isClicked
                                        ? "mirror-glow-pulse 0.8s ease-in-out infinite"
                                        : undefined,
                    }}
                />

                {/* SVG Character with facial expressions */}
                <svg
                    viewBox="0 0 96 96"
                    className="h-8 w-auto block"
                    role="presentation">
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

                    {/* Cheeks */}
                    <ellipse
                        cx="48"
                        cy="54"
                        rx="24"
                        ry="8"
                        fill="#f472b6"
                        opacity="0.35"
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
                    {/* Left eye — pupil */}
                    <circle
                        cx={leftEye.cx + leftEye.pupilOffsetX}
                        cy={leftEye.cy + leftEye.pupilOffsetY}
                        r={1.5}
                        fill="#1e293b"
                        className="transition-all duration-300 ease-in-out"
                    />

                    {/* Right eye — white */}
                    <ellipse
                        cx={rightEye.cx}
                        cy={rightEye.cy}
                        rx={rightEye.rx}
                        ry={rightEye.ry}
                        fill="#ffffff"
                        className="transition-all duration-300 ease-in-out"
                    />
                    {/* Right eye — pupil */}
                    <circle
                        cx={rightEye.cx + rightEye.pupilOffsetX}
                        cy={rightEye.cy + rightEye.pupilOffsetY}
                        r={1.5}
                        fill="#1e293b"
                        className="transition-all duration-300 ease-in-out"
                    />

                    {/* Mouth */}
                    <path
                        d={mouthPath}
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        className="transition-all duration-300 ease-in-out"
                    />
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
