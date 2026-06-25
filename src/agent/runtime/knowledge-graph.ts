export interface GraphNode {
  id: string;
  type: 'file' | 'symbol';
}

export interface GraphEdge {
  from: string;
  to: string;
  type: 'imports' | 'exports' | 'references' | 'tests';
}

export class KnowledgeGraph {
  private _nodes = new Map<string, GraphNode>();
  private _edges: GraphEdge[] = [];

  public addNode(id: string, type: 'file' | 'symbol'): void {
    if (!this._nodes.has(id)) {
      this._nodes.set(id, { id, type });
    }
  }

  public addEdge(from: string, to: string, type: 'imports' | 'exports' | 'references' | 'tests'): void {
    const edgeExists = this._edges.some(
      (e) => e.from === from && e.to === to && e.type === type
    );
    if (!edgeExists) {
      this._edges.push({ from, to, type });
    }
  }

  public getAffectedFiles(filePath: string): string[] {
    const affected = new Set<string>();
    const queue: string[] = [filePath];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const importers = this._edges
        .filter((e) => e.to === current && e.type === 'imports')
        .map((e) => e.from);

      for (const imp of importers) {
        if (!affected.has(imp)) {
          affected.add(imp);
          queue.push(imp);
        }
      }
    }

    return Array.from(affected);
  }

  public findRelatedTests(filePath: string): string[] {
    const relatedTests = new Set<string>();
    
    this._edges
      .filter((e) => e.from === filePath && e.type === 'tests')
      .forEach((e) => relatedTests.add(e.to));

    const affected = this.getAffectedFiles(filePath);
    for (const aff of affected) {
      this._edges
        .filter((e) => e.from === aff && e.type === 'tests')
        .forEach((e) => relatedTests.add(e.to));
    }

    return Array.from(relatedTests);
  }

  public clear(): void {
    this._nodes.clear();
    this._edges = [];
  }
}
