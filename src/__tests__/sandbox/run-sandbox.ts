/**
 * Sandbox Test Runner
 *
 * CLI runner that executes all scenarios against DeepSeek V4 Flash,
 * captures traces, and generates a summary markdown report.
 *
 * Usage:
 *   npx tsx src/__tests__/sandbox/run-sandbox.ts
 *   SANDBOX_SCENARIO=simple_edit npx tsx src/__tests__/sandbox/run-sandbox.ts
 */
import fs from "fs"
import path from "path"

import { SandboxHarness, type ConversationTrace } from "./harness"
import { createSandboxProject, cleanupSandbox, type SandboxProject } from "./mock-tools"
import { analyzeTrace, formatReport, formatSummaryTable, type PerformanceReport } from "./analyzer"
import { ALL_SCENARIOS, type TestScenario } from "./scenarios"

// ────────────────────────────────────────────────────────────
//  Configuration
// ────────────────────────────────────────────────────────────

const API_KEY = process.env.DEEPSEEK_API_KEY || "sk-d49441223f704b11b6319a6ec0e75764"
const BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash"
const MAX_TURNS = parseInt(process.env.MAX_TURNS || "15", 10)

const OUTPUT_DIR = path.join(__dirname, "output")

// ────────────────────────────────────────────────────────────
//  Runner
// ────────────────────────────────────────────────────────────

async function runSingleScenario(
	harness: SandboxHarness,
	scenario: TestScenario,
): Promise<{ trace: ConversationTrace; report: PerformanceReport; project: SandboxProject }> {
	console.log(`\n${"─".repeat(60)}`)
	console.log(`▶ Running: ${scenario.name} — ${scenario.description}`)
	console.log(`  Expected max turns: ${scenario.expectedMaxTurns}`)
	console.log(`${"─".repeat(60)}`)

	const project = createSandboxProject(scenario.files)
	console.log(`  Sandbox: ${project.rootDir}`)

	try {
		const trace = await harness.runScenario(scenario.name, scenario.userPrompt, project)
		const report = analyzeTrace(trace)

		// Print live summary
		console.log(
			`  ✓ Turns: ${report.totalTurns} | Tools: ${report.totalToolCalls} | ` +
				`Tokens: ${report.totalInputTokens}in/${report.totalOutputTokens}out | ` +
				`Time: ${(report.totalLatencyMs / 1000).toFixed(1)}s | ` +
				`${report.completed ? "✅ Complete" : "❌ Incomplete"}`,
		)

		if (report.signals.length > 0) {
			console.log("  Signals:")
			for (const signal of report.signals) {
				console.log(`    ${signal}`)
			}
		}

		return { trace, report, project }
	} catch (e: any) {
		console.error(`  ❌ Error: ${e.message}`)
		throw e
	}
}

async function main() {
	console.log("╔══════════════════════════════════════════════════════════╗")
	console.log("║      Mirror VS — Sandbox Performance Test Suite        ║")
	console.log(`║  Model: ${MODEL.padEnd(47)}║`)
	console.log(`║  Max turns per scenario: ${String(MAX_TURNS).padEnd(32)}║`)
	console.log("╚══════════════════════════════════════════════════════════╝")

	// Create output directory
	fs.mkdirSync(OUTPUT_DIR, { recursive: true })

	const harness = new SandboxHarness({
		apiKey: API_KEY,
		baseUrl: BASE_URL,
		model: MODEL,
		maxTurns: MAX_TURNS,
		temperature: 0,
	})

	// Filter scenarios if env var is set
	const scenarioFilter = process.env.SANDBOX_SCENARIO
	const scenarios = scenarioFilter ? ALL_SCENARIOS.filter((s) => s.name === scenarioFilter) : ALL_SCENARIOS

	if (scenarios.length === 0) {
		console.error(`No scenario found matching "${scenarioFilter}"`)
		console.error(`Available: ${ALL_SCENARIOS.map((s) => s.name).join(", ")}`)
		process.exit(1)
	}

	const reports: PerformanceReport[] = []
	const projects: SandboxProject[] = []

	for (const scenario of scenarios) {
		try {
			const { trace, report, project } = await runSingleScenario(harness, scenario)
			reports.push(report)
			projects.push(project)

			// Save individual trace
			const traceFile = path.join(OUTPUT_DIR, `${scenario.name}_trace.json`)
			fs.writeFileSync(traceFile, JSON.stringify(trace, null, 2))

			// Save individual report
			const reportFile = path.join(OUTPUT_DIR, `${scenario.name}_report.md`)
			fs.writeFileSync(reportFile, formatReport(report))

			console.log(`  → Saved: ${traceFile}`)
		} catch (e: any) {
			reports.push({
				scenarioName: scenario.name,
				model: MODEL,
				totalTurns: 0,
				wastedTurns: 0,
				turnsToCompletion: -1,
				totalInputTokens: 0,
				totalOutputTokens: 0,
				avgInputTokensPerTurn: 0,
				avgOutputTokensPerTurn: 0,
				tokenEfficiency: 0,
				totalToolCalls: 0,
				uniqueToolsUsed: [],
				toolCallBreakdown: {},
				redundantReads: 0,
				wrongToolAttempts: 0,
				totalLatencyMs: 0,
				avgLatencyPerTurnMs: 0,
				fastestTurnMs: 0,
				slowestTurnMs: 0,
				estimatedCost: 0,
				completed: false,
				error: e.message,
				totalReasoningChars: 0,
				turnsWithReasoning: 0,
				avgReasoningCharsPerTurn: 0,
				signals: [`❌ Scenario crashed: ${e.message}`],
			})
		}
	}

	// Generate summary report
	const summaryFile = path.join(OUTPUT_DIR, "summary.md")
	const summaryContent = [formatSummaryTable(reports), "", "---", "", ...reports.map((r) => formatReport(r))].join(
		"\n\n",
	)

	fs.writeFileSync(summaryFile, summaryContent)
	console.log(`\n${"═".repeat(60)}`)
	console.log(`📊 Summary saved to: ${summaryFile}`)
	console.log(`${"═".repeat(60)}`)

	// Print summary table to console
	console.log("\n" + formatSummaryTable(reports))

	// Cleanup sandboxes
	for (const project of projects) {
		cleanupSandbox(project)
	}

	// Exit with error if any scenario failed
	const failed = reports.filter((r) => !r.completed)
	if (failed.length > 0) {
		console.log(`\n⚠️ ${failed.length}/${reports.length} scenario(s) did not complete.`)
	}
}

main().catch((e) => {
	console.error("Fatal error:", e)
	process.exit(1)
})
