import { describe, it, expect, beforeEach } from "vitest"
import { ResearchGraph } from "../graph"
import type { GraphNode, GraphEdge } from "../graph"
import { ResearchMemory } from "../memory"
import type { Fact, FetchedPage, QueryRecord, Citation } from "../memory"

describe("ResearchGraph", () => {
	let graph: ResearchGraph

	beforeEach(() => {
		graph = new ResearchGraph()
	})

	// ─── Node Management ───────────────────────────────────────────────────

	describe("node management", () => {
		it("should add and retrieve nodes", () => {
			const node: GraphNode = {
				id: "query:test",
				type: "query",
				label: "test query",
				metadata: {},
				createdAt: new Date().toISOString(),
			}
			graph.addNode(node)
			expect(graph.getNode("query:test")).toEqual(node)
			expect(graph.hasNode("query:test")).toBe(true)
		})

		it("should return undefined for missing nodes", () => {
			expect(graph.getNode("nonexistent")).toBeUndefined()
			expect(graph.hasNode("nonexistent")).toBe(false)
		})

		it("should return all nodes", () => {
			graph.addNode({ id: "q1", type: "query", label: "q1", metadata: {}, createdAt: "" })
			graph.addNode({ id: "q2", type: "query", label: "q2", metadata: {}, createdAt: "" })
			expect(graph.getAllNodes()).toHaveLength(2)
		})

		it("should filter nodes by type", () => {
			graph.addNode({ id: "q1", type: "query", label: "q1", metadata: {}, createdAt: "" })
			graph.addNode({ id: "t1", type: "topic", label: "t1", metadata: {}, createdAt: "" })
			graph.addNode({ id: "p1", type: "page", label: "p1", metadata: {}, createdAt: "" })

			expect(graph.getNodesByType("query")).toHaveLength(1)
			expect(graph.getNodesByType("topic")).toHaveLength(1)
			expect(graph.getNodesByType("page")).toHaveLength(1)
		})
	})

	// ─── Edge Management ───────────────────────────────────────────────────

	describe("edge management", () => {
		it("should add and query edges", () => {
			graph.addNode({ id: "a", type: "query", label: "a", metadata: {}, createdAt: "" })
			graph.addNode({ id: "b", type: "page", label: "b", metadata: {}, createdAt: "" })

			graph.addEdge({ from: "a", to: "b", type: "produced" })
			expect(graph.getEdgesFrom("a")).toHaveLength(1)
			expect(graph.getEdgesTo("b")).toHaveLength(1)
			expect(graph.getEdgesBetween("a", "b")).toHaveLength(1)
		})

		it("should deduplicate identical edges", () => {
			graph.addNode({ id: "a", type: "query", label: "a", metadata: {}, createdAt: "" })
			graph.addNode({ id: "b", type: "page", label: "b", metadata: {}, createdAt: "" })

			graph.addEdge({ from: "a", to: "b", type: "produced" })
			graph.addEdge({ from: "a", to: "b", type: "produced" })
			expect(graph.getAllEdges()).toHaveLength(1)
		})

		it("should allow edges with different types between same nodes", () => {
			graph.addNode({ id: "a", type: "query", label: "a", metadata: {}, createdAt: "" })
			graph.addNode({ id: "b", type: "page", label: "b", metadata: {}, createdAt: "" })

			graph.addEdge({ from: "a", to: "b", type: "produced" })
			graph.addEdge({ from: "a", to: "b", type: "references" })
			expect(graph.getAllEdges()).toHaveLength(2)
		})
	})

	// ─── Connected Nodes ──────────────────────────────────────────────────

	describe("getConnectedNodes", () => {
		it("should return nodes connected via any edge", () => {
			graph.addNode({ id: "a", type: "query", label: "a", metadata: {}, createdAt: "" })
			graph.addNode({ id: "b", type: "page", label: "b", metadata: {}, createdAt: "" })
			graph.addNode({ id: "c", type: "page", label: "c", metadata: {}, createdAt: "" })

			graph.addEdge({ from: "a", to: "b", type: "produced" })
			graph.addEdge({ from: "a", to: "c", type: "produced" })

			const connected = graph.getConnectedNodes("a")
			expect(connected).toHaveLength(2)
		})
	})

	// ─── Path Finding ──────────────────────────────────────────────────────

	describe("findPath (BFS)", () => {
		it("should find the shortest path between two nodes", () => {
			graph.addNode({ id: "a", type: "query", label: "a", metadata: {}, createdAt: "" })
			graph.addNode({ id: "b", type: "page", label: "b", metadata: {}, createdAt: "" })
			graph.addNode({ id: "c", type: "fact", label: "c", metadata: {}, createdAt: "" })

			graph.addEdge({ from: "a", to: "b", type: "produced" })
			graph.addEdge({ from: "b", to: "c", type: "derived_from" })

			const path = graph.findPath("a", "c")
			expect(path).toHaveLength(3)
			expect(path[0].id).toBe("a")
			expect(path[2].id).toBe("c")
		})

		it("should return empty array when no path exists", () => {
			graph.addNode({ id: "a", type: "query", label: "a", metadata: {}, createdAt: "" })
			graph.addNode({ id: "z", type: "page", label: "z", metadata: {}, createdAt: "" })

			expect(graph.findPath("a", "z")).toEqual([])
		})

		it("should return single node path when from and to are the same", () => {
			graph.addNode({ id: "a", type: "query", label: "a", metadata: {}, createdAt: "" })
			const path = graph.findPath("a", "a")
			expect(path).toHaveLength(1)
			expect(path[0].id).toBe("a")
		})
	})

	// ─── buildFromMemory ──────────────────────────────────────────────────

	describe("buildFromMemory", () => {
		it("should populate graph from a ResearchMemory instance", () => {
			const memory = new ResearchMemory()

			memory.addQuery({
				query: "React hooks",
				normalized: "react hooks",
				results: [{ url: "https://react.dev", title: "React", snippet: "React docs" }],
				timestamp: "2025-01-01T00:00:00.000Z",
				durationMs: 100,
				provider: "DuckDuckGo",
			})

			memory.addPage({
				url: "https://react.dev",
				title: "React Documentation",
				rawContent: "<html></html>",
				cleanContent: "React docs content",
				contentType: "text/html",
				fetchedAt: "2025-01-01T00:00:00.000Z",
				durationMs: 200,
				success: true,
			})

			memory.addFact({
				id: "fact-1",
				statement: "React uses a virtual DOM",
				sourceUrls: ["https://react.dev"],
				confidence: "high",
				category: "rendering",
				extractedAt: "2025-01-01T00:00:00.000Z",
			})

			memory.addCitation({
				url: "https://react.dev",
				title: "React Docs",
				snippet: "Virtual DOM explanation",
				referencedBy: ["fact-1"],
			})

			graph.buildFromMemory(memory)

			expect(graph.getNodesByType("query").length).toBeGreaterThanOrEqual(1)
			expect(graph.getNodesByType("page").length).toBeGreaterThanOrEqual(1)
			expect(graph.getNodesByType("fact").length).toBeGreaterThanOrEqual(1)
			expect(graph.getNodesByType("topic").length).toBeGreaterThanOrEqual(1)
			expect(graph.getAllEdges().length).toBeGreaterThanOrEqual(1)
		})
	})

	// ─── Merge ─────────────────────────────────────────────────────────────

	describe("merge", () => {
		it("should merge another graph into this one", () => {
			graph.addNode({ id: "a", type: "query", label: "a", metadata: {}, createdAt: "" })

			const other = new ResearchGraph()
			other.addNode({ id: "b", type: "page", label: "b", metadata: {}, createdAt: "" })
			other.addEdge({ from: "a", to: "b", type: "produced" })

			graph.merge(other)

			expect(graph.getNode("b")).toBeDefined()
			expect(graph.getAllEdges()).toHaveLength(1)
		})
	})

	// ─── Snapshot ──────────────────────────────────────────────────────────

	describe("snapshot", () => {
		it("should return correct statistics", () => {
			graph.addNode({ id: "q1", type: "query", label: "q1", metadata: {}, createdAt: "" })
			graph.addNode({ id: "p1", type: "page", label: "p1", metadata: {}, createdAt: "" })
			graph.addNode({ id: "f1", type: "fact", label: "f1", metadata: {}, createdAt: "" })
			graph.addNode({ id: "t1", type: "topic", label: "t1", metadata: {}, createdAt: "" })
			graph.addEdge({ from: "q1", to: "p1", type: "produced" })

			const snap = graph.snapshot()
			expect(snap.statistics.nodeCount).toBe(4)
			expect(snap.statistics.queryCount).toBe(1)
			expect(snap.statistics.pageCount).toBe(1)
			expect(snap.statistics.factCount).toBe(1)
			expect(snap.statistics.topicCount).toBe(1)
			expect(snap.statistics.edgeCount).toBe(1)
		})
	})

	// ─── toSummary ─────────────────────────────────────────────────────────

	describe("toSummary", () => {
		it("should produce a human-readable summary", () => {
			graph.addNode({ id: "t1", type: "topic", label: "Web Development", metadata: {}, createdAt: "" })
			graph.addNode({ id: "q1", type: "query", label: "React hooks", metadata: {}, createdAt: "" })

			const summary = graph.toSummary()
			expect(summary).toContain("Research Graph Summary")
			expect(summary).toContain("Web Development")
			expect(summary).toContain("React hooks")
		})
	})
})
