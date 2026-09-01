/**
 * Post-Run Analyzer
 *
 * Takes a ConversationTrace and produces a structured performance report.
 */
import type { ConversationTrace, TurnTrace } from "./harness"
import type { ToolInvocation } from "./mock-tools"

export interface PerformanceReport {
	scenarioName: string
	model: string

	// Turn efficiency
	totalTurns: number
	wastedTurns: number // Turns with no useful tool calls or redundant reads
	turnsToCompletion: number

	// Token audit
	totalInputTokens: number
	totalOutputTokens: number
	avgInputTokensPerTurn: number
	avgOutputTokensPerTurn: number
	tokenEfficiency: number // outputTokens / inputTokens ratio

	// Tool accuracy
	totalToolCalls: number
	uniqueToolsUsed: string[]
	toolCallBreakdown: Record<string, number>
	redundantReads: number // Reading same file multiple times
	wrongToolAttempts: number // Tool calls that returned errors

	// Latency
	totalLatencyMs: number
	avgLatencyPerTurnMs: number
	fastestTurnMs: number
	slowestTurnMs: number

	// Cost estimate
	estimatedCost: number

	// Completion status
	completed: boolean
	error?: string

	// Reasoning analysis
	totalReasoningChars: number
	turnsWithReasoning: number
	avgReasoningCharsPerTurn: number

	// Behavioral signals
	signals: string[]
}

// DeepSeek V4 Flash pricing (approximate)
const PRICE_PER_INPUT_TOKEN = 0.0000001 // $0.1 per 1M tokens
const PRICE_PER_OUTPUT_TOKEN = 0.0000003 // $0.3 per 1M tokens

export function analyzeTrace(trace: ConversationTrace): PerformanceReport {
	const turns = trace.turns
	const allToolCalls = turns.flatMap((t) => t.toolCalls)

	// Tool call breakdown
	const toolCallBreakdown: Record<string, number> = {}
	for (const tc of allToolCalls) {
		toolCallBreakdown[tc.name] = (toolCallBreakdown[tc.name] || 0) + 1
	}

	// Redundant reads: same file read more than once
	const readFiles: string[] = []
	let redundantReads = 0
	for (const tc of allToolCalls) {
		if (tc.name === "read_file") {
			const filePath = String(tc.args.path || "")
			if (readFiles.includes(filePath)) {
				redundantReads++
			} else {
				readFiles.push(filePath)
			}
		}
	}

	// Wrong tool attempts: tool calls that returned errors
	const wrongToolAttempts = allToolCalls.filter((tc) => tc.result.startsWith("Error:")).length

	// Wasted turns: turns with no tool calls, or only redundant reads
	const wastedTurns = turns.filter((t) => {
		if (t.toolCalls.length === 0 && !t.isCompletion) return true
		// All tool calls in this turn are redundant reads
		if (
			t.toolCalls.length > 0 &&
			t.toolCalls.every(
				(tc) =>
					tc.name === "read_file" &&
					readFiles.indexOf(String(tc.args.path)) < readFiles.lastIndexOf(String(tc.args.path)),
			)
		) {
			return true
		}
		return false
	}).length

	// Latency stats
	const latencies = turns.map((t) => t.latencyMs)
	const fastestTurnMs = latencies.length > 0 ? Math.min(...latencies) : 0
	const slowestTurnMs = latencies.length > 0 ? Math.max(...latencies) : 0

	// Reasoning analysis
	const turnsWithReasoning = turns.filter((t) => t.reasoningText.length > 0).length
	const totalReasoningChars = turns.reduce((sum, t) => sum + t.reasoningText.length, 0)

	// Cost estimate
	const estimatedCost =
		trace.totalInputTokens * PRICE_PER_INPUT_TOKEN + trace.totalOutputTokens * PRICE_PER_OUTPUT_TOKEN

	// Behavioral signals
	const signals: string[] = []

	if (redundantReads > 0) {
		signals.push(`⚠️ Read the same file ${redundantReads} extra time(s) — wasted tokens`)
	}
	if (wrongToolAttempts > 0) {
		signals.push(`❌ ${wrongToolAttempts} tool call(s) returned errors`)
	}
	if (wastedTurns > 0) {
		signals.push(`🔄 ${wastedTurns} wasted turn(s) with no useful tool calls`)
	}
	if (turns.length > 0 && !trace.completed) {
		signals.push(`⏱️ Task did NOT complete within ${turns.length} turns`)
	}
	if (trace.completed && turns.length <= 3) {
		signals.push(`✅ Excellent turn efficiency — completed in ${turns.length} turn(s)`)
	}
	if (turnsWithReasoning === 0 && turns.length > 0) {
		signals.push(`🧠 No reasoning detected — model may not be using thinking mode`)
	}

	// Check for unnecessary reads before edits
	const readThenEditSameFile = checkReadBeforeEdit(turns)
	if (readThenEditSameFile.length > 0) {
		signals.push(`📖 Read before edit pattern on: ${readThenEditSameFile.join(", ")}`)
	}

	// Check for parallel batching
	const turnsWithMultipleReads = turns.filter(
		(t) => t.toolCalls.filter((tc) => ["read_file", "search_files", "list_files"].includes(tc.name)).length > 1,
	).length
	if (turnsWithMultipleReads > 0) {
		signals.push(`⚡ ${turnsWithMultipleReads} turn(s) batched multiple read-only tools`)
	}

	return {
		scenarioName: trace.scenarioName,
		model: trace.config.model,
		totalTurns: turns.length,
		wastedTurns,
		turnsToCompletion: trace.completed ? turns.length : -1,
		totalInputTokens: trace.totalInputTokens,
		totalOutputTokens: trace.totalOutputTokens,
		avgInputTokensPerTurn: turns.length > 0 ? Math.round(trace.totalInputTokens / turns.length) : 0,
		avgOutputTokensPerTurn: turns.length > 0 ? Math.round(trace.totalOutputTokens / turns.length) : 0,
		tokenEfficiency:
			trace.totalInputTokens > 0
				? Math.round((trace.totalOutputTokens / trace.totalInputTokens) * 1000) / 1000
				: 0,
		totalToolCalls: allToolCalls.length,
		uniqueToolsUsed: [...new Set(allToolCalls.map((tc) => tc.name))],
		toolCallBreakdown,
		redundantReads,
		wrongToolAttempts,
		totalLatencyMs: Math.round(trace.totalLatencyMs),
		avgLatencyPerTurnMs: turns.length > 0 ? Math.round(trace.totalLatencyMs / turns.length) : 0,
		fastestTurnMs: Math.round(fastestTurnMs),
		slowestTurnMs: Math.round(slowestTurnMs),
		estimatedCost: Math.round(estimatedCost * 100000) / 100000,
		completed: trace.completed,
		error: trace.error,
		totalReasoningChars,
		turnsWithReasoning,
		avgReasoningCharsPerTurn: turns.length > 0 ? Math.round(totalReasoningChars / turns.length) : 0,
		signals,
	}
}

function checkReadBeforeEdit(turns: TurnTrace[]): string[] {
	const readFiles = new Set<string>()
	const editedAfterRead: string[] = []

	for (const turn of turns) {
		for (const tc of turn.toolCalls) {
			if (tc.name === "read_file") {
				readFiles.add(String(tc.args.path))
			}
			if (["apply_diff", "write_to_file", "search_replace", "edit_file"].includes(tc.name)) {
				const filePath = String(tc.args.path)
				if (readFiles.has(filePath)) {
					editedAfterRead.push(filePath)
				}
			}
		}
	}

	return [...new Set(editedAfterRead)]
}

// ────────────────────────────────────────────────────────────
//  Report Formatter
// ────────────────────────────────────────────────────────────

export function formatReport(report: PerformanceReport): string {
	const lines: string[] = [
		`# 📊 Sandbox Test Report: ${report.scenarioName}`,
		`**Model**: ${report.model}`,
		`**Status**: ${report.completed ? "✅ Completed" : "❌ Did not complete"}${report.error ? ` (${report.error})` : ""}`,
		"",
		"## Turn Efficiency",
		`| Metric | Value |`,
		`|--------|-------|`,
		`| Total Turns | ${report.totalTurns} |`,
		`| Wasted Turns | ${report.wastedTurns} |`,
		`| Turns to Completion | ${report.turnsToCompletion === -1 ? "N/A" : report.turnsToCompletion} |`,
		"",
		"## Token Usage",
		`| Metric | Value |`,
		`|--------|-------|`,
		`| Total Input Tokens | ${report.totalInputTokens.toLocaleString()} |`,
		`| Total Output Tokens | ${report.totalOutputTokens.toLocaleString()} |`,
		`| Avg Input/Turn | ${report.avgInputTokensPerTurn.toLocaleString()} |`,
		`| Avg Output/Turn | ${report.avgOutputTokensPerTurn.toLocaleString()} |`,
		`| Token Efficiency (out/in) | ${report.tokenEfficiency} |`,
		`| Estimated Cost | $${report.estimatedCost} |`,
		"",
		"## Tool Usage",
		`| Metric | Value |`,
		`|--------|-------|`,
		`| Total Tool Calls | ${report.totalToolCalls} |`,
		`| Unique Tools Used | ${report.uniqueToolsUsed.join(", ")} |`,
		`| Redundant Reads | ${report.redundantReads} |`,
		`| Failed Tool Calls | ${report.wrongToolAttempts} |`,
		"",
		"### Tool Call Breakdown",
		`| Tool | Count |`,
		`|------|-------|`,
		...Object.entries(report.toolCallBreakdown)
			.sort(([, a], [, b]) => b - a)
			.map(([name, count]) => `| ${name} | ${count} |`),
		"",
		"## Latency",
		`| Metric | Value |`,
		`|--------|-------|`,
		`| Total Latency | ${(report.totalLatencyMs / 1000).toFixed(1)}s |`,
		`| Avg per Turn | ${(report.avgLatencyPerTurnMs / 1000).toFixed(1)}s |`,
		`| Fastest Turn | ${(report.fastestTurnMs / 1000).toFixed(1)}s |`,
		`| Slowest Turn | ${(report.slowestTurnMs / 1000).toFixed(1)}s |`,
		"",
		"## Reasoning",
		`| Metric | Value |`,
		`|--------|-------|`,
		`| Turns with Reasoning | ${report.turnsWithReasoning} / ${report.totalTurns} |`,
		`| Avg Reasoning Chars/Turn | ${report.avgReasoningCharsPerTurn} |`,
		"",
		"## Behavioral Signals",
		...report.signals.map((s) => `- ${s}`),
	]

	return lines.join("\n")
}

export function formatSummaryTable(reports: PerformanceReport[]): string {
	const lines: string[] = [
		"# 📋 Sandbox Test Summary",
		"",
		`| Scenario | Turns | Tools | Redundant Reads | Errors | Input Tokens | Output Tokens | Cost | Status |`,
		`|----------|-------|-------|-----------------|--------|--------------|---------------|------|--------|`,
		...reports.map(
			(r) =>
				`| ${r.scenarioName} | ${r.totalTurns} | ${r.totalToolCalls} | ${r.redundantReads} | ${r.wrongToolAttempts} | ${r.totalInputTokens.toLocaleString()} | ${r.totalOutputTokens.toLocaleString()} | $${r.estimatedCost} | ${r.completed ? "✅" : "❌"} |`,
		),
	]

	return lines.join("\n")
}
