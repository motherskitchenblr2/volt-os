/**
 * @module graph/dag
 * Generic Directed Acyclic Graph implementation.
 * Uses adjacency lists for efficient traversal and supports cycle detection,
 * topological sorting, and subgraph extraction.
 */

/** Node color used in DFS-based cycle detection. */
const WHITE = 0;
const GRAY = 1;
const BLACK = 2;

/**
 * A generic Directed Acyclic Graph.
 * Stores nodes with associated data and edges representing dependency relationships.
 *
 * @typeParam T - The type of data stored in each node.
 */
export class DAG<T> {
  /** Map of node ID to stored data. */
  private readonly nodes: Map<string, T> = new Map();
  /** Forward adjacency: node → set of dependents (nodes that depend on this one). */
  private readonly edges: Map<string, Set<string>> = new Map();
  /** Reverse adjacency: node → set of dependencies (nodes this one depends on). */
  private readonly reverseEdges: Map<string, Set<string>> = new Map();

  /**
   * Add a node to the graph.
   * @param id - Unique identifier for the node.
   * @param data - Data to associate with the node.
   * @throws {Error} If a node with the same ID already exists.
   */
  addNode(id: string, data: T): void {
    if (this.nodes.has(id)) {
      throw new Error(`Node "${id}" already exists in the DAG`);
    }
    this.nodes.set(id, data);
    if (!this.edges.has(id)) {
      this.edges.set(id, new Set());
    }
    if (!this.reverseEdges.has(id)) {
      this.reverseEdges.set(id, new Set());
    }
  }

  /**
   * Add a directed edge from one node to another.
   * Means `from` must complete before `to` can start.
   * @param from - The prerequisite node ID.
   * @param to - The dependent node ID.
   * @throws {Error} If either node doesn't exist, or if the edge would create a cycle.
   */
  addEdge(from: string, to: string): void {
    if (!this.nodes.has(from)) {
      throw new Error(`Source node "${from}" does not exist`);
    }
    if (!this.nodes.has(to)) {
      throw new Error(`Target node "${to}" does not exist`);
    }
    if (from === to) {
      throw new Error(`Self-loop detected on node "${from}"`);
    }

    // Tentatively add edge and check for cycles
    const forwardSet = this.edges.get(from)!;
    const reverseSet = this.reverseEdges.get(to)!;

    if (forwardSet.has(to)) {
      return; // Edge already exists, no-op
    }

    forwardSet.add(to);
    reverseSet.add(from);

    if (this.hasCycle()) {
      // Rollback
      forwardSet.delete(to);
      reverseSet.delete(from);
      throw new Error(`Adding edge "${from}" → "${to}" would create a cycle`);
    }
  }

  /**
   * Get the data associated with a node.
   * @param id - Node ID.
   * @returns The node data, or `undefined` if not found.
   */
  getNode(id: string): T | undefined {
    return this.nodes.get(id);
  }

  /**
   * Get all nodes that depend on the given node (forward dependents).
   * @param id - Node ID.
   * @returns Array of dependent node IDs.
   */
  getDependents(id: string): string[] {
    const set = this.edges.get(id);
    return set ? Array.from(set) : [];
  }

  /**
   * Get all nodes that the given node depends on (reverse dependencies).
   * @param id - Node ID.
   * @returns Array of dependency node IDs.
   */
  getDependencies(id: string): string[] {
    const set = this.reverseEdges.get(id);
    return set ? Array.from(set) : [];
  }

  /**
   * Detect whether the graph contains a cycle using DFS with white/gray/black coloring.
   * @returns `true` if a cycle exists, `false` otherwise.
   */
  hasCycle(): boolean {
    const color = new Map<string, number>();

    // Initialize all nodes as WHITE (unvisited)
    for (const id of this.nodes.keys()) {
      color.set(id, WHITE);
    }

    /** Recursive DFS helper. Returns `true` if a cycle is found. */
    const dfs = (node: string): boolean => {
      color.set(node, GRAY);

      const dependents = this.edges.get(node);
      if (dependents) {
        for (const neighbor of dependents) {
          const neighborColor = color.get(neighbor) ?? WHITE;
          if (neighborColor === GRAY) {
            return true; // Back edge → cycle
          }
          if (neighborColor === WHITE && dfs(neighbor)) {
            return true;
          }
        }
      }

      color.set(node, BLACK);
      return false;
    };

    for (const id of this.nodes.keys()) {
      if (color.get(id) === WHITE) {
        if (dfs(id)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Compute topological sort using Kahn's algorithm (BFS-based).
   * @returns Array of node IDs in a valid execution order.
   * @throws {Error} If the graph contains a cycle (should not happen if edges are validated).
   */
  topologicalSort(): string[] {
    // Compute in-degrees
    const inDegree = new Map<string, number>();
    for (const id of this.nodes.keys()) {
      inDegree.set(id, 0);
    }
    for (const [, targets] of this.edges) {
      for (const target of targets) {
        inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
      }
    }

    // Seed queue with nodes that have no incoming edges
    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    const result: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      const dependents = this.edges.get(current);
      if (dependents) {
        for (const dependent of dependents) {
          const newDegree = (inDegree.get(dependent) ?? 1) - 1;
          inDegree.set(dependent, newDegree);
          if (newDegree === 0) {
            queue.push(dependent);
          }
        }
      }
    }

    if (result.length !== this.nodes.size) {
      throw new Error('Graph contains a cycle; topological sort is impossible');
    }

    return result;
  }

  /**
   * Get root nodes — those with no incoming edges (no dependencies).
   * @returns Array of root node IDs.
   */
  getRoots(): string[] {
    const roots: string[] = [];
    for (const [id] of this.nodes) {
      const deps = this.reverseEdges.get(id);
      if (!deps || deps.size === 0) {
        roots.push(id);
      }
    }
    return roots;
  }

  /**
   * Get leaf nodes — those with no outgoing edges (no dependents).
   * @returns Array of leaf node IDs.
   */
  getLeaves(): string[] {
    const leaves: string[] = [];
    for (const [id] of this.nodes) {
      const deps = this.edges.get(id);
      if (!deps || deps.size === 0) {
        leaves.push(id);
      }
    }
    return leaves;
  }

  /**
   * Extract a subgraph containing only the specified nodes and the edges between them.
   * @param nodeIds - IDs of nodes to include.
   * @returns A new DAG containing the subset.
   */
  getSubgraph(nodeIds: string[]): DAG<T> {
    const subgraph = new DAG<T>();
    const idSet = new Set(nodeIds);

    for (const id of nodeIds) {
      const data = this.nodes.get(id);
      if (data !== undefined) {
        subgraph.addNode(id, data);
      }
    }

    for (const id of nodeIds) {
      const targets = this.edges.get(id);
      if (targets) {
        for (const target of targets) {
          if (idSet.has(target)) {
            // Add edge without cycle check since parent is acyclic
            const forwardSet = subgraph.edges.get(id)!;
            const reverseSet = subgraph.reverseEdges.get(target)!;
            forwardSet.add(target);
            reverseSet.add(id);
          }
        }
      }
    }

    return subgraph;
  }

  /**
   * Remove a node and all its associated edges from the graph.
   * @param id - Node ID to remove.
   */
  removeNode(id: string): void {
    if (!this.nodes.has(id)) {
      return;
    }

    // Remove edges FROM this node
    const targets = this.edges.get(id);
    if (targets) {
      for (const target of targets) {
        const reverseSet = this.reverseEdges.get(target);
        reverseSet?.delete(id);
      }
    }

    // Remove edges TO this node
    const sources = this.reverseEdges.get(id);
    if (sources) {
      for (const source of sources) {
        const forwardSet = this.edges.get(source);
        forwardSet?.delete(id);
      }
    }

    this.nodes.delete(id);
    this.edges.delete(id);
    this.reverseEdges.delete(id);
  }

  /**
   * Get the number of nodes in the graph.
   * @returns Node count.
   */
  size(): number {
    return this.nodes.size;
  }

  /**
   * Get all node IDs in the graph.
   * @returns Array of node IDs.
   */
  nodeIds(): string[] {
    return Array.from(this.nodes.keys());
  }
}
