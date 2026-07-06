/**
 * @module graph/topological
 * Computes execution layers from a DAG, enabling parallel execution
 * of tasks within the same layer.
 */

import { DAG } from './dag.js';

/**
 * Compute execution layers from a DAG.
 * Each layer contains nodes whose dependencies are all in preceding layers.
 * Nodes in the same layer can execute in parallel.
 *
 * Layer 0 = root nodes (no dependencies).
 * Layer 1 = nodes whose dependencies are all in layer 0.
 * And so on...
 *
 * @param dag - The DAG to compute layers for.
 * @returns A 2D array where each inner array is a layer of node IDs.
 */
export function getExecutionLayers(dag: DAG<unknown>): string[][] {
  const layers: string[][] = [];
  const processed = new Set<string>();

  // Compute in-degree relative to unprocessed nodes
  const getInDegree = (id: string): number => {
    const deps = dag.getDependencies(id);
    return deps.filter((d) => !processed.has(d)).length;
  };

  // Start with roots (in-degree 0)
  let currentLayer = dag.getRoots();

  while (currentLayer.length > 0) {
    layers.push([...currentLayer]);

    for (const id of currentLayer) {
      processed.add(id);
    }

    // Find next layer: nodes whose remaining in-degree is 0
    const nextLayer: string[] = [];
    const allNodeIds = dag.nodeIds();

    for (const id of allNodeIds) {
      if (processed.has(id)) {
        continue;
      }
      if (getInDegree(id) === 0) {
        nextLayer.push(id);
      }
    }

    currentLayer = nextLayer;
  }

  return layers;
}
