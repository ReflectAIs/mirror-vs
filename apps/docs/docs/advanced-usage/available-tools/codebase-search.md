---
description: Perform intelligent semantic searches across your codebase using AI embeddings to find relevant code by meaning, not just keywords.
keywords:
    - codebase_search
    - semantic search
    - AI embeddings
    - code search
    - Mirror VS tools
    - vector search
    - Qdrant
---

# codebase_search

:::info Setup Required
The `codebase_search` tool is part of the [Codebase Indexing](/features/codebase-indexing) feature. It needs an embedding provider and vector database configured first.
:::

This tool finds code by meaning, not just keywords. While [`search_files`](/advanced-usage/available-tools/search-files) matches exact text patterns, `codebase_search` understands what you're looking for conceptually — like having a librarian who doesn't just find books by title, but by what they're _about_.

---

## Parameters

- `query` (required): Natural language search query describing what you're looking for
- `path` (optional): Directory path to limit search scope

---

## What It Does

Searches your indexed codebase using semantic similarity. It finds code blocks that are conceptually related to your query, even if they don't contain the exact words you searched for. Results include file paths, line numbers, and similarity scores.

---

## When Is It Used?

- Finding code related to specific functionality across your project
- Looking for implementation patterns or similar code structures
- Searching for conceptual patterns (error handling, authentication, etc.)
- Exploring unfamiliar codebases
- Finding code affected by potential changes or refactoring

---

## Key Features

- **Semantic understanding** — finds by meaning, not exact matches
- **Cross-project search** — entire indexed codebase
- **Similarity scoring** — ranked by relevance (0-1 scale)
- **Scope filtering** — limit to specific directories
- **Syntax highlighting** — results displayed with navigation links

---

## Requirements

- Codebase Indexing configured in settings
- Embedding provider (OpenAI or Ollama)
- Qdrant instance running and accessible
- Codebase must be indexed

---

## Limitations

- Requires external services (embedding provider + Qdrant)
- Only searches indexed code blocks
- Maximum 50 results per search
- Minimum similarity threshold (default 0.4)
- Files over 1MB excluded

---

## How It Works

1. **Validates** that Codebase Indexing is configured and available
2. **Generates** an embedding vector from your query
3. **Searches** Qdrant for similar code embeddings using cosine similarity
4. **Filters** by path if specified
5. **Returns** results with scores, file paths, line ranges, and code snippets

---

## Usage Examples

```xml
<codebase_search>
<query>user authentication and password validation</query>
</codebase_search>
```

```xml
<codebase_search>
<query>database connection pool setup</query>
<path>src/data</path>
</codebase_search>
```

```xml
<codebase_search>
<query>HTTP error responses and exception handling</query>
<path>src/api</path>
</codebase_search>
```

### Similarity Score Interpretation

| Score     | Meaning                                           |
| --------- | ------------------------------------------------- |
| 0.8-1.0   | Highly relevant — exactly what you're looking for |
| 0.6-0.8   | Good matches with strong conceptual similarity    |
| 0.4-0.6   | Potentially relevant — worth reviewing            |
| Below 0.4 | Filtered out as too dissimilar                    |
