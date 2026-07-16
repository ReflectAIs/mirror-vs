/**
 * E-1: Research Graph
 *
 * Tracks topic relationships discovered during research:
 * - What queries were made (nodes)
 * - Which URLs were fetched from each query (edges)
 * - How topics relate to each other (parent/child/sibling)
 * - Which facts were derived from which sources
 *
 * Used to provide context-aware research that avoids redundant work
 * and surfaces how conclusions were reached.
 */

import { ResearchMemory, Fact, FetchedPage, QueryRecord, Citation } from "./memory"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GraphNode {
	id: string
	type: "query" | "page" | "fact" | "topic"
	label: string
	metadata: Record<string, any>
	createdAt: string
}

export interface GraphEdge {
	from: string
	to: string
	type: "produced" | "references" | "derived_from" | "related_to" | "confirms" | "contradicts"
	label?: string
}

export interface ResearchGraphSnapshot {
	nodes: GraphNode[]
	edges: GraphEdge[]
	statistics: {
		nodeCount: number
		edgeCount: number
		queryCount: number
		pageCount: number
		factCount: number
		topicCount: number
	}
}

// ─── Research Graph ──────────────────────────────────────────────────────────

export class ResearchGraph {
	private nodes = new Map<string, GraphNode>()
	private edges: GraphEdge[] = []

	// ─── Node Management ───────────────────────────────────────────────────

	addNode(node: GraphNode): void {
		this.nodes.set(node.id, node)
	}

	getNode(id: string): GraphNode | undefined {
		return this.nodes.get(id)
	}

	hasNode(id: string): boolean {
		return this.nodes.has(id)
	}

	getAllNodes(): GraphNode[] {
		return Array.from(this.nodes.values())
	}

	getNodesByType(type: GraphNode["type"]): GraphNode[] {
		return this.getAllNodes().filter((n) => n.type === type)
	}

	// ─── Edge Management ───────────────────────────────────────────────────

	addEdge(edge: GraphEdge): void {
		// Avoid duplicate edges
		const exists = this.edges.some((e) => e.from === edge.from && e.to === edge.to && e.type === edge.type)
		if (!exists) {
			this.edges.push(edge)
		}
	}

	getEdgesFrom(nodeId: string): GraphEdge[] {
		return this.edges.filter((e) => e.from === nodeId)
	}

	getEdgesTo(nodeId: string): GraphEdge[] {
		return this.edges.filter((e) => e.to === nodeId)
	}

	getEdgesBetween(fromId: string, toId: string): GraphEdge[] {
		return this.edges.filter((e) => e.from === fromId && e.to === toId)
	}

	getAllEdges(): GraphEdge[] {
		return [...this.edges]
	}

	// ─── Relationship Queries ──────────────────────────────────────────────

	/**
	 * Get all nodes that are directly connected (via any edge) to the given node.
	 */
	getConnectedNodes(nodeId: string): GraphNode[] {
		const connectedIds = new Set<string>()
		for (const edge of this.edges) {
			if (edge.from === nodeId) connectedIds.add(edge.to)
			if (edge.to === nodeId) connectedIds.add(edge.from)
		}
		return Array.from(connectedIds)
			.map((id) => this.nodes.get(id))
			.filter(Boolean) as GraphNode[]
	}

	/**
	 * Find the shortest path between two nodes (BFS).
	 */
	findPath(fromId: string, toId: string): GraphNode[] {
		if (fromId === toId) {
			const node = this.nodes.get(fromId)
			return node ? [node] : []
		}

		const visited = new Set<string>()
		const queue: string[][] = [[fromId]]

		while (queue.length > 0) {
			const path = queue.shift()!
			const current = path[path.length - 1]

			if (current === toId) {
				return path.map((id) => this.nodes.get(id)).filter(Boolean) as GraphNode[]
			}

			if (!visited.has(current)) {
				visited.add(current)
				for (const edge of this.edges) {
					const next = edge.from === current ? edge.to : edge.to === current ? edge.from : null
					if (next && !visited.has(next)) {
						queue.push([...path, next])
					}
				}
			}
		}

		return [] // No path found
	}

	// ─── Build from ResearchMemory ─────────────────────────────────────────

	/**
	 * Populate the graph from a ResearchMemory instance.
	 * Creates nodes for each query, page, and fact, then connects them.
	 */
	buildFromMemory(memory: ResearchMemory): void {
		const queries = memory.getAllQueries()
		const pages = memory.getAllPages()
		const facts = memory.getAllFacts()
		const citations = memory.getAllCitations()

		// Create topic nodes from fact categories
		const topics = new Set<string>()
		for (const fact of facts) {
			if (fact.category) topics.add(fact.category)
		}
		for (const topic of topics) {
			this.addNode({
				id: `topic:${topic}`,
				type: "topic",
				label: topic,
				metadata: {},
				createdAt: new Date().toISOString(),
			})
		}

		// Create query nodes and connect to topics
		for (const query of queries) {
			this.addNode({
				id: `query:${query.normalized}`,
				type: "query",
				label: query.query,
				metadata: {
					normalized: query.normalized,
					resultCount: query.results.length,
					durationMs: query.durationMs,
					provider: query.provider,
				},
				createdAt: query.timestamp,
			})
		}

		// Create page nodes and connect to queries
		for (const page of pages) {
			this.addNode({
				id: `page:${page.url}`,
				type: "page",
				label: page.title || page.url,
				metadata: {
					url: page.url,
					contentType: page.contentType,
					success: page.success,
				},
				createdAt: page.fetchedAt,
			})

			// Find which query produced this page (heuristic: check if query results contain this URL)
			for (const query of queries) {
				if (query.results.some((r) => r.url === page.url)) {
					this.addEdge({
						from: `query:${query.normalized}`,
						to: `page:${page.url}`,
						type: "produced",
					})
				}
			}
		}

		// Create fact nodes and connect to pages and topics
		for (const fact of facts) {
			this.addNode({
				id: `fact:${fact.id}`,
				type: "fact",
				label: fact.statement.slice(0, 100),
				metadata: {
					confidence: fact.confidence,
					category: fact.category,
					statement: fact.statement,
				},
				createdAt: fact.extractedAt,
			})

			// Connect fact to source pages
			for (const url of fact.sourceUrls) {
				if (this.hasNode(`page:${url}`)) {
					this.addEdge({
						from: `page:${url}`,
						to: `fact:${fact.id}`,
						type: "derived_from",
					})
				}
			}

			// Connect fact to its category topic
			if (fact.category && this.hasNode(`topic:${fact.category}`)) {
				this.addEdge({
					from: `fact:${fact.id}`,
					to: `topic:${fact.category}`,
					type: "related_to",
				})
			}
		}

		// Cross-reference citations
		for (const citation of citations) {
			for (const factId of citation.referencedBy) {
				if (this.hasNode(`fact:${factId}`)) {
					this.addEdge({
						from: `page:${citation.url}`,
						to: `fact:${factId}`,
						type: "references",
						label: citation.snippet.slice(0, 200),
					})
				}
			}
		}
	}

	// ─── Merge ─────────────────────────────────────────────────────────────

	/**
	 * Merge another ResearchGraph into this one.
	 * Nodes and edges from `other` take precedence on conflicts.
	 */
	merge(other: ResearchGraph): void {
		for (const node of other.getAllNodes()) {
			this.nodes.set(node.id, node)
		}
		for (const edge of other.getAllEdges()) {
			this.addEdge(edge)
		}
	}

	// ─── Serialisation ─────────────────────────────────────────────────────

	snapshot(): ResearchGraphSnapshot {
		const nodes = this.getAllNodes()
		const edges = this.getAllEdges()

		return {
			nodes,
			edges,
			statistics: {
				nodeCount: nodes.length,
				edgeCount: edges.length,
				queryCount: nodes.filter((n) => n.type === "query").length,
				pageCount: nodes.filter((n) => n.type === "page").length,
				factCount: nodes.filter((n) => n.type === "fact").length,
				topicCount: nodes.filter((n) => n.type === "topic").length,
			},
		}
	}

	/**
	 * Get a human-readable summary of the graph for LLM context.
	 */
	toSummary(): string {
		const allNodes = this.getAllNodes()
		const snap = this.snapshot()
		const parts: string[] = [
			`## Research Graph Summary`,
			``,
			`**Nodes**: ${snap.statistics.nodeCount} total`,
			`- Queries: ${snap.statistics.queryCount}`,
			`- Pages: ${snap.statistics.pageCount}`,
			`- Facts: ${snap.statistics.factCount}`,
			`- Topics: ${snap.statistics.topicCount}`,
			`**Edges**: ${snap.statistics.edgeCount}`,
			``,
		]

		// List topics with their fact counts
		const topicNodes = allNodes.filter((n: GraphNode) => n.type === "topic")
		if (topicNodes.length > 0) {
			parts.push(`### Topics Explored`)
			for (const topic of topicNodes) {
				const connectedFacts = this.getConnectedNodes(topic.id).filter((n: GraphNode) => n.type === "fact")
				parts.push(`- **${topic.label}**: ${connectedFacts.length} facts`)
			}
			parts.push(``)
		}

		// List top-level queries
		const queryNodes = allNodes.filter((n: GraphNode) => n.type === "query")
		if (queryNodes.length > 0) {
			parts.push(`### Search Queries`)
			for (const q of queryNodes.slice(0, 10)) {
				const pages = this.getConnectedNodes(q.id).filter((n: GraphNode) => n.type === "page")
				parts.push(`- "${q.label}" → ${pages.length} pages`)
			}
			if (queryNodes.length > 10) {
				parts.push(`- ... and ${queryNodes.length - 10} more queries`)
			}
			parts.push(``)
		}

		return parts.join("\n")
	}
}
