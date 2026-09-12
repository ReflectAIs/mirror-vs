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

// ────────────────────────────────────────────────────────────
//  HTML Report Generator
// ────────────────────────────────────────────────────────────

export function generateHtmlReport(reports: PerformanceReport[], model: string): string {
	const totalScenarios = reports.length
	const passed = reports.filter((r) => r.completed).length
	const totalCost = reports.reduce((s, r) => s + r.estimatedCost, 0)
	const totalTokens = reports.reduce((s, r) => s + r.totalInputTokens + r.totalOutputTokens, 0)
	const totalLatencyS = (reports.reduce((s, r) => s + r.totalLatencyMs, 0) / 1000).toFixed(1)
	const modelShort = model.split("/").pop() || model

	const scenarioCards = reports
		.map((r) => {
			const statusColor = r.completed ? "#10b981" : "#ef4444"
			const signalHtml = r.signals.map((s) => `<div class="signal">${s}</div>`).join("")
			const toolBreakdownHtml = Object.entries(r.toolCallBreakdown)
				.sort(([, a], [, b]) => b - a)
				.map(([name, count]) => `<span class="tool-badge">${name}: ${count}</span>`)
				.join("")
			return `
<div class="card ${r.completed ? "card-pass" : "card-fail"}">
  <div class="card-header">
    <div>
      <div class="card-title">${r.scenarioName}</div>
      <div class="card-model">${r.model.split("/").pop()}</div>
    </div>
    <div class="status-badge" style="background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40">${r.completed ? "✅ Passed" : "❌ Failed"}</div>
  </div>
  ${r.error ? `<div class="error-box">⚠️ ${r.error}</div>` : ""}
  <div class="stats-grid">
    <div class="stat"><div class="stat-value">${r.totalTurns}</div><div class="stat-label">Turns</div></div>
    <div class="stat"><div class="stat-value">${r.totalToolCalls}</div><div class="stat-label">Tool Calls</div></div>
    <div class="stat"><div class="stat-value">${r.redundantReads}</div><div class="stat-label">Redundant Reads</div></div>
    <div class="stat"><div class="stat-value">${r.wrongToolAttempts}</div><div class="stat-label">Errors</div></div>
    <div class="stat"><div class="stat-value">${(r.totalLatencyMs / 1000).toFixed(1)}s</div><div class="stat-label">Time</div></div>
    <div class="stat"><div class="stat-value">$${r.estimatedCost.toFixed(5)}</div><div class="stat-label">Cost</div></div>
  </div>
  <div class="tokens-row">
    <span>🔢 ${r.totalInputTokens.toLocaleString()} in / ${r.totalOutputTokens.toLocaleString()} out</span>
    <span>Efficiency: ${r.tokenEfficiency}</span>
  </div>
  ${toolBreakdownHtml ? `<div class="tools-row">${toolBreakdownHtml}</div>` : ""}
  ${signalHtml ? `<div class="signals">${signalHtml}</div>` : ""}
</div>`
		})
		.join("\n")

	const tableRows = reports
		.map(
			(r) => `
<tr>
  <td style="font-family:monospace;color:#c4b5fd">${r.scenarioName}</td>
  <td>${r.completed ? '<span style="color:#10b981">✅</span>' : '<span style="color:#ef4444">❌</span>'}</td>
  <td>${r.totalTurns}</td>
  <td>${r.totalToolCalls}</td>
  <td>${r.wrongToolAttempts}</td>
  <td>${r.totalInputTokens.toLocaleString()}</td>
  <td>${r.totalOutputTokens.toLocaleString()}</td>
  <td>${(r.totalLatencyMs / 1000).toFixed(1)}s</td>
  <td>$${r.estimatedCost.toFixed(5)}</td>
</tr>`,
		)
		.join("")

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mirror VS — Sandbox Test Report</title>
<style>
:root{--bg:#0f0f13;--surface:#1a1a24;--surface2:#22222e;--border:#2a2a3a;--text:#e2e2f0;--muted:#888899;--accent:#7c6ff7;--pass:#10b981;--fail:#ef4444}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'Inter',system-ui,sans-serif;min-height:100vh}
.header{background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460);padding:40px 32px;border-bottom:1px solid var(--border)}
.header h1{font-size:28px;font-weight:700;background:linear-gradient(90deg,#a78bfa,#60a5fa);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.header .subtitle{color:var(--muted);margin-top:6px;font-size:14px}
.header .model-chip{display:inline-block;background:#7c6ff720;border:1px solid #7c6ff740;color:#a78bfa;padding:4px 12px;border-radius:20px;font-size:12px;margin-top:12px}
.summary-bar{display:flex;gap:20px;padding:20px 32px;background:var(--surface);border-bottom:1px solid var(--border);flex-wrap:wrap}
.summary-stat .val{font-size:24px;font-weight:700}
.summary-stat .lbl{font-size:12px;color:var(--muted);margin-top:2px}
.pass-val{color:var(--pass)}.fail-val{color:var(--fail)}
.progress-bar{height:6px;background:var(--border);overflow:hidden;margin:0 32px}
.progress-fill{height:100%;background:linear-gradient(90deg,var(--pass),#34d399)}
.section-title{padding:20px 32px 8px;font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:1px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:16px;padding:16px 32px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px}
.card-pass{border-left:3px solid var(--pass)}.card-fail{border-left:3px solid var(--fail)}
.card-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}
.card-title{font-size:15px;font-weight:600;font-family:monospace;color:#c4b5fd}
.card-model{font-size:11px;color:var(--muted);margin-top:3px}
.status-badge{font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px;white-space:nowrap}
.stats-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
.stat{background:var(--surface2);border-radius:8px;padding:10px;text-align:center}
.stat-value{font-size:18px;font-weight:700}
.stat-label{font-size:10px;color:var(--muted);margin-top:2px;text-transform:uppercase;letter-spacing:0.5px}
.tokens-row{display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-bottom:10px}
.tools-row{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.tool-badge{background:#3b82f620;border:1px solid #3b82f640;color:#93c5fd;font-size:11px;padding:2px 8px;border-radius:12px;font-family:monospace}
.signals{display:flex;flex-direction:column;gap:4px}
.signal{font-size:12px;color:var(--muted);padding:4px 8px;background:var(--surface2);border-radius:6px}
.error-box{background:#ef444415;border:1px solid #ef444440;color:#fca5a5;padding:8px 12px;border-radius:8px;font-size:12px;margin-bottom:12px}
table{width:calc(100% - 64px);margin:0 32px 32px;border-collapse:collapse;font-size:13px}
th{background:var(--surface);color:var(--muted);text-align:left;padding:10px 14px;border-bottom:1px solid var(--border);font-weight:500;font-size:11px;text-transform:uppercase;letter-spacing:0.5px}
td{padding:10px 14px;border-bottom:1px solid var(--border)}
tr:hover td{background:var(--surface2)}
.ts{color:var(--muted);font-size:11px;text-align:right;padding:16px 32px}
</style>
</head>
<body>
<div class="header">
  <h1>🔬 Mirror VS Sandbox Test Report</h1>
  <div class="subtitle">AI model performance across coding tasks — basic to advanced</div>
  <div class="model-chip">🤖 ${modelShort}</div>
</div>
<div class="summary-bar">
  <div class="summary-stat"><div class="val">${totalScenarios}</div><div class="lbl">Total Scenarios</div></div>
  <div class="summary-stat"><div class="val pass-val">${passed}</div><div class="lbl">Passed ✅</div></div>
  <div class="summary-stat"><div class="val fail-val">${totalScenarios - passed}</div><div class="lbl">Failed ❌</div></div>
  <div class="summary-stat"><div class="val">${Math.round((passed / totalScenarios) * 100)}%</div><div class="lbl">Pass Rate</div></div>
  <div class="summary-stat"><div class="val">${totalLatencyS}s</div><div class="lbl">Total Time</div></div>
  <div class="summary-stat"><div class="val">${(totalTokens / 1000).toFixed(0)}k</div><div class="lbl">Total Tokens</div></div>
  <div class="summary-stat"><div class="val">$${totalCost.toFixed(4)}</div><div class="lbl">Est. Cost</div></div>
</div>
<div class="progress-bar"><div class="progress-fill" style="width:${Math.round((passed / totalScenarios) * 100)}%"></div></div>
<div class="section-title">Scenario Results</div>
<div class="grid">${scenarioCards}</div>
<div class="section-title">Summary Table</div>
<table>
  <thead>
    <tr><th>Scenario</th><th>Status</th><th>Turns</th><th>Tools</th><th>Errors</th><th>Input Tok</th><th>Output Tok</th><th>Time</th><th>Cost</th></tr>
  </thead>
  <tbody>${tableRows}</tbody>
</table>
<div class="ts">Generated ${new Date().toISOString()} · Mirror VS Sandbox</div>
</body>
</html>`
}
