/**
 * Research Services — barrel export.
 *
 * Provides the unified search and research engine services:
 * - Memory: conversation-scoped research memory
 * - Cache: LRU cache with TTL for search results
 * - Planner: LLM-driven query decomposition
 * - Executor: parallel execution engine
 * - Fetcher: hybrid HTTP→Puppeteer URL fetching
 * - Parser: HTML→Markdown content cleanup
 * - Extractor: LLM-driven information extraction
 * - Ranking: source authority/freshness scoring
 * - Verifier: cross-source fact verification
 * - Graph: topic relationship tracking (E-1)
 * - LongTermMemory: cross-session research persistence (E-2)
 * - GapAnalyzer: pre-search context gap analysis (E-3)
 */

export { ResearchMemory } from "./memory"
export type { QueryRecord, FetchedPage, Fact, Citation } from "./memory"

export { SearchCache, normaliseQuery, globalSearchCache } from "./cache"

export { ResearchPlanner } from "./planner"
export type { ResearchPlan, ResearchSubQuery, LlmPlanner } from "./planner"
export { DEFAULT_PLANNER_SYSTEM_PROMPT } from "./planner"

export { ResearchExecutor } from "./executor"
export type { ExecutorResult, ExecutorOptions } from "./executor"

export { UrlFetcher } from "./fetcher"
export type { FetchOptions, FetchResult } from "./fetcher"

export { PageParser } from "./parser"
export type { ParsedPage, ParserOptions } from "./parser"

export { InformationExtractor } from "./extractor"
export type { ExtractedKnowledge, LlmExtractor } from "./extractor"
export { EXTRACTOR_SYSTEM_PROMPT } from "./extractor"

export { SourceRanker, rankSources } from "./ranking"
export type { RankedSource, ScoreBreakdown } from "./ranking"

export { VerificationEngine } from "./verifier"
export type { VerificationResult, Conflict, LlmVerifier } from "./verifier"

// ─── Stage E: Integration ──────────────────────────────────────────────────

export { ResearchGraph } from "./graph"
export type { GraphNode, GraphEdge, ResearchGraphSnapshot } from "./graph"

export { LongTermResearchMemory } from "./long-term-memory"
export type { StoredResearch, ResearchSearchOptions, ResearchSearchResult } from "./long-term-memory"

export { KnowledgeGapAnalyzer } from "./gap-analyzer"
export type { GapAnalysisOptions, KnowledgeGap, KnownFact, GapAnalysisResult } from "./gap-analyzer"
