/**
 * AST / Structural Skeleton Generator
 *
 * Generates compact outlines of source files showing class, interface, type,
 * function, and method signatures with their exact 1-based line ranges.
 * Drastically reduces token consumption (typically 80-95% reduction) when
 * exploring large files.
 */

export interface SkeletonResult {
	skeleton: string
	totalLines: number
	symbolCount: number
}

interface SymbolSpan {
	startLine: number
	endLine: number
	indent: string
	signature: string
	kind: "import" | "class" | "interface" | "type" | "enum" | "function" | "method" | "other"
}

/**
 * Extracts a concise structural skeleton from file content with line numbers.
 */
export function generateFileSkeleton(content: string, filePath?: string): SkeletonResult {
	const lines = content.split(/\r?\n/)
	const totalLines = lines.length

	if (totalLines === 0 || (totalLines === 1 && lines[0].trim() === "")) {
		return {
			skeleton: "(empty file)",
			totalLines: 0,
			symbolCount: 0,
		}
	}

	const ext = filePath ? filePath.split(".").pop()?.toLowerCase() || "" : ""
	const isPython = ext === "py"
	const isRust = ext === "rs"
	const isGo = ext === "go"

	const symbols: SymbolSpan[] = []
	let importStart = -1
	let importEnd = -1
	let symbolCount = 0

	for (let i = 0; i < totalLines; i++) {
		const rawLine = lines[i]
		const trimmed = rawLine.trim()
		const lineNum = i + 1

		if (
			!trimmed ||
			trimmed.startsWith("//") ||
			trimmed.startsWith("#") ||
			trimmed.startsWith("/*") ||
			trimmed.startsWith("*")
		) {
			continue
		}

		// Imports grouping
		const isImport =
			trimmed.startsWith("import ") ||
			trimmed.startsWith("from ") ||
			trimmed.startsWith("require(") ||
			(isGo && trimmed.startsWith("import")) ||
			(isRust && trimmed.startsWith("use "))

		if (isImport) {
			if (importStart === -1) {
				importStart = lineNum
			}
			importEnd = lineNum
			continue
		} else if (importStart !== -1) {
			symbols.push({
				startLine: importStart,
				endLine: importEnd,
				indent: "",
				signature: `// ... imports (${importEnd - importStart + 1} lines)`,
				kind: "import",
			})
			importStart = -1
			importEnd = -1
		}

		const indentMatch = rawLine.match(/^(\s*)/)
		const indent = indentMatch ? indentMatch[1] : ""

		// Check for signatures
		let matchedKind: SymbolSpan["kind"] | null = null

		if (isPython) {
			if (/^(?:async\s+)?def\s+/.test(trimmed)) {
				matchedKind = indent.length > 0 ? "method" : "function"
			} else if (/^class\s+/.test(trimmed)) {
				matchedKind = "class"
			}
		} else if (isGo) {
			if (/^func\s+/.test(trimmed)) {
				matchedKind =
					trimmed.includes(")") && trimmed.indexOf(")") < trimmed.indexOf("{") ? "method" : "function"
			} else if (/^type\s+\w+\s+(?:struct|interface)/.test(trimmed)) {
				matchedKind = "interface"
			}
		} else if (isRust) {
			if (/^(?:pub\s+)?(?:async\s+)?fn\s+/.test(trimmed)) {
				matchedKind = indent.length > 0 ? "method" : "function"
			} else if (/^(?:pub\s+)?(?:struct|enum|trait|impl)\s+/.test(trimmed)) {
				matchedKind = "class"
			}
		} else {
			// TypeScript / JavaScript / general C-like
			if (/^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+/.test(trimmed)) {
				matchedKind = "class"
			} else if (/^(?:export\s+)?interface\s+/.test(trimmed)) {
				matchedKind = "interface"
			} else if (/^(?:export\s+)?type\s+\w+/.test(trimmed)) {
				matchedKind = "type"
			} else if (/^(?:export\s+)?enum\s+/.test(trimmed)) {
				matchedKind = "enum"
			} else if (/^(?:export\s+)?(?:async\s+)?function\s+/.test(trimmed)) {
				matchedKind = "function"
			} else if (/^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/.test(trimmed)) {
				matchedKind = "function"
			} else if (
				/^(?:public|private|protected|static|readonly|async|\*)*\s*[\w$]+\s*\([^)]*\)\s*[:\w<>[\]\s]*\{?/.test(
					trimmed,
				) &&
				indent.length > 0
			) {
				// Method or property function
				matchedKind = "method"
			}
		}

		if (matchedKind) {
			symbolCount++
			// Clean signature: remove trailing { or : or implementation details
			let cleanSig = trimmed
			if (cleanSig.endsWith("{")) {
				cleanSig = cleanSig.slice(0, -1).trim()
			}
			if (cleanSig.endsWith(";")) {
				cleanSig = cleanSig.slice(0, -1).trim()
			}

			// Estimate block end line by looking for closing delimiter or indentation return
			let blockEndLine = lineNum
			if (isPython) {
				const currentIndentLen = indent.length
				for (let j = i + 1; j < totalLines; j++) {
					const nextRaw = lines[j]
					const nextTrim = nextRaw.trim()
					if (!nextTrim || nextTrim.startsWith("#")) continue
					const nextIndentMatch = nextRaw.match(/^(\s*)/)
					const nextIndentLen = nextIndentMatch ? nextIndentMatch[1].length : 0
					if (nextIndentLen <= currentIndentLen) {
						break
					}
					blockEndLine = j + 1
				}
			} else {
				// Brace-based language block scan
				let openBraces = (rawLine.match(/\{/g) || []).length - (rawLine.match(/\}/g) || []).length
				if (openBraces > 0) {
					for (let j = i + 1; j < totalLines; j++) {
						const nextRaw = lines[j]
						openBraces += (nextRaw.match(/\{/g) || []).length - (nextRaw.match(/\}/g) || []).length
						if (openBraces <= 0) {
							blockEndLine = j + 1
							break
						}
					}
				}
			}

			symbols.push({
				startLine: lineNum,
				endLine: blockEndLine,
				indent,
				signature: cleanSig,
				kind: matchedKind,
			})
		}
	}

	// Flush any pending imports at EOF
	if (importStart !== -1) {
		symbols.push({
			startLine: importStart,
			endLine: importEnd,
			indent: "",
			signature: `// ... imports (${importEnd - importStart + 1} lines)`,
			kind: "import",
		})
	}

	if (symbols.length === 0) {
		// Fallback: show first 30 lines and total count
		const preview = lines
			.slice(0, 30)
			.map((l, idx) => `${String(idx + 1).padStart(4, " ")} | ${l}`)
			.join("\n")
		return {
			skeleton: `// File has ${totalLines} lines (no structural classes or functions parsed):\n${preview}`,
			totalLines,
			symbolCount: 0,
		}
	}

	const formatted = symbols
		.map((s) => {
			const lineSpan = s.startLine === s.endLine ? `L${s.startLine}` : `L${s.startLine}-${s.endLine}`
			const spanPadded = lineSpan.padEnd(9, " ")
			const spanLines = s.endLine - s.startLine + 1
			const foldComment = s.kind !== "import" && spanLines > 3 ? ` /* ${spanLines} lines */` : ""
			return `${spanPadded} | ${s.indent}${s.signature}${foldComment}`
		})
		.join("\n")

	const header = `// ─── File Skeleton: ${filePath || "file"} (${totalLines} total lines, ${symbolCount} symbols) ───\n// Tip: Use read_file with offset and limit to read the exact implementation of any block.\n\n`

	return {
		skeleton: header + formatted,
		totalLines,
		symbolCount,
	}
}
