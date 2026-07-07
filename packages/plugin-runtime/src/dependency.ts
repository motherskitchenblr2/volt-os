/**
 * @module dependency
 * Plugin dependency resolver — builds a dependency graph from manifests,
 * detects circular dependencies, finds missing dependencies, and produces
 * a topological load order.
 */

import type {
  PluginManifest,
  DependencyResolutionResult,
} from './types.js';

/**
 * Resolves plugin dependency graphs to determine safe load order.
 */
export class DependencyResolver {
  /**
   * Resolve the dependency graph for a set of plugin manifests.
   * @param manifests - All available plugin manifests.
   * @returns Resolution result with validity, load order, and any errors.
   */
  resolve(manifests: PluginManifest[]): DependencyResolutionResult {
    const manifestMap = new Map<string, PluginManifest>();
    for (const m of manifests) {
      manifestMap.set(m.id, m);
    }

    const errors: string[] = [];

    // Check for missing dependencies
    for (const manifest of manifests) {
      const missing = this.findMissingDeps(manifest, manifestMap);
      if (missing.length > 0) {
        errors.push(
          `Plugin "${manifest.id}" has missing dependencies: ${missing.join(', ')}`,
        );
      }
    }

    // Check for circular dependencies
    const cycles = this.hasCircularDeps(manifests);
    if (cycles.length > 0) {
      for (const cycle of cycles) {
        errors.push(`Circular dependency detected: ${cycle}`);
      }
    }

    // If there are errors, return early
    if (errors.length > 0) {
      return { valid: false, loadOrder: [], errors };
    }

    // Compute topological order
    const loadOrder = this.topologicalSort(manifests);

    return { valid: true, loadOrder, errors: [] };
  }

  /**
   * Find missing dependencies for a single manifest.
   * @param manifest - The manifest to check.
   * @param available - Map of available plugin manifests.
   * @returns Array of missing dependency ids.
   */
  findMissingDeps(
    manifest: PluginManifest,
    available: Map<string, PluginManifest>,
  ): string[] {
    if (!manifest.dependencies) return [];

    const missing: string[] = [];
    for (const depId of Object.keys(manifest.dependencies)) {
      if (!available.has(depId)) {
        missing.push(depId);
      }
    }
    return missing;
  }

  /**
   * Detect circular dependencies in the manifest set using DFS.
   * @param manifests - All plugin manifests.
   * @returns Array of cycle descriptions (empty if no cycles).
   */
  hasCircularDeps(manifests: PluginManifest[]): string[] {
    const adj = new Map<string, string[]>();
    for (const m of manifests) {
      adj.set(m.id, Object.keys(m.dependencies ?? {}));
    }

    const WHITE = 0; // unvisited
    const GRAY = 1; // in progress
    const BLACK = 2; // done

    const color = new Map<string, number>();
    for (const m of manifests) {
      color.set(m.id, WHITE);
    }

    const cycles: string[] = [];

    const dfs = (node: string, path: string[]): void => {
      color.set(node, GRAY);
      path.push(node);

      for (const neighbor of adj.get(node) ?? []) {
        if (!color.has(neighbor)) continue; // skip unknown deps (handled separately)
        const nc = color.get(neighbor);
        if (nc === GRAY) {
          // Found a cycle — extract cycle path
          const cycleStart = path.indexOf(neighbor);
          const cyclePath = path.slice(cycleStart).concat(neighbor);
          cycles.push(cyclePath.join(' → '));
        } else if (nc === WHITE) {
          dfs(neighbor, path);
        }
      }

      path.pop();
      color.set(node, BLACK);
    };

    for (const m of manifests) {
      if (color.get(m.id) === WHITE) {
        dfs(m.id, []);
      }
    }

    return cycles;
  }

  /**
   * Topological sort using Kahn's algorithm.
   * @param manifests - All plugin manifests.
   * @returns Ordered array of plugin ids.
   */
  private topologicalSort(manifests: PluginManifest[]): string[] {
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const m of manifests) {
      inDegree.set(m.id, 0);
      adj.set(m.id, []);
    }

    // Build adjacency list and in-degree counts
    for (const m of manifests) {
      for (const depId of Object.keys(m.dependencies ?? {})) {
        if (adj.has(depId)) {
          adj.get(depId)!.push(m.id);
          inDegree.set(m.id, (inDegree.get(m.id) ?? 0) + 1);
        }
      }
    }

    // Start with nodes that have no dependencies
    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const order: string[] = [];
    while (queue.length > 0) {
      const node = queue.shift()!;
      order.push(node);

      for (const neighbor of adj.get(node) ?? []) {
        const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) {
          queue.push(neighbor);
        }
      }
    }

    return order;
  }
}
