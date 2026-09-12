/**
 * Sandbox Test Runner
 *
 * CLI runner that executes all scenarios against any OpenAI-compatible API,
 * captures traces, and generates summary markdown + HTML reports.
 *
 * Usage:
 *   npx tsx src/__tests__/sandbox/run-sandbox.ts
 *   SANDBOX_SCENARIO=simple_edit npx tsx src/__tests__/sandbox/run-sandbox.ts
 *
 * Env variables:
 *   API_KEY        - API key (default: Fireworks GLM Flash key)
 *   BASE_URL       - API base URL (default: Fireworks AI)
 *   MODEL          - Model name (default: GLM Flash)
 *   MAX_TURNS      - Max turns per scenario (default: 15)
 *   SANDBOX_SCENARIO - Run only this scenario name
 *   SANDBOX_TAG    - Run only scenarios with this tag
 */
import fs from "fs"
import path from "path"

import { SandboxHarness, type ConversationTrace } from "./harness"
import { createSandboxProject, cleanupSandbox, type SandboxProject } from "./mock-tools"
import { analyzeTrace, formatReport, formatSummaryTable, generateHtmlReport, type PerformanceReport } from "./analyzer"
import { ALL_SCENARIOS, type TestScenario } from "./scenarios"
import { MIRROR_VS_SCENARIOS } from "./scenarios-mirror-vs"

// Combine all scenarios (mirror-vs real-project scenarios run separately via SANDBOX_TAG=mirror-vs)
const EXTENDED_SCENARIOS: TestScenario[] = [...ALL_SCENARIOS, ...MIRROR_VS_SCENARIOS]

// ────────────────────────────────────────────────────────────
//  Configuration
// ────────────────────────────────────────────────────────────

const API_KEY = process.env.API_KEY || "fw_QFKmUeeh2qWuvgymSrpbbV"
const BASE_URL = process.env.BASE_URL || "https://api.fireworks.ai/inference/v1"
const MODEL = process.env.MODEL || "accounts/fireworks/models/glm-5p3-flash"
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
	const modelShort = MODEL.split("/").pop() || MODEL
	console.log("╔══════════════════════════════════════════════════════════╗")
	console.log("║      Mirror VS — Sandbox Performance Test Suite        ║")
	console.log(`║  Model: ${modelShort.slice(0, 47).padEnd(47)}║`)
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

	// Filter scenarios by name or tag
	const scenarioFilter = process.env.SANDBOX_SCENARIO
	const tagFilter = process.env.SANDBOX_TAG
	let scenarios = EXTENDED_SCENARIOS
	if (scenarioFilter) {
		scenarios = scenarios.filter((s) => s.name === scenarioFilter)
	}
	if (tagFilter) {
		scenarios = scenarios.filter((s) => (s as any).tags?.includes(tagFilter))
	}

	if (scenarios.length === 0) {
		console.error(`No scenario found matching filter: scenario="${scenarioFilter}" tag="${tagFilter}"`)
		console.error(`Available scenarios: ${EXTENDED_SCENARIOS.map((s) => s.name).join(", ")}`)
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

	// Generate HTML report
	const htmlFile = path.join(OUTPUT_DIR, "report.html")
	fs.writeFileSync(htmlFile, generateHtmlReport(reports, MODEL))

	console.log(`\n${"═".repeat(60)}`)
	console.log(`📊 Markdown summary : ${summaryFile}`)
	console.log(`🌐 HTML dashboard   : ${htmlFile}`)
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
