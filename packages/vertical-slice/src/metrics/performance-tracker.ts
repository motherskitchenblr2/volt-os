/**
 * @module metrics/performance-tracker
 * Lightweight in-process performance metrics tracker.
 *
 * Records numeric metric samples and computes summary statistics
 * (avg, min, max, count) for each metric name. Used throughout the
 * vertical slice to measure agent execution times, token usage,
 * and workflow step durations.
 */

/** Summary statistics for a single metric. */
export interface MetricSummary {
  /** Arithmetic mean of all recorded values. */
  avg: number;
  /** Minimum recorded value. */
  min: number;
  /** Maximum recorded value. */
  max: number;
  /** Total number of recorded values. */
  count: number;
  /** Sum of all recorded values. */
  total: number;
}

/**
 * Tracks named numeric metrics and computes summaries.
 *
 * @example
 * ```ts
 * const tracker = new PerformanceTracker();
 * tracker.record('agent.research.durationMs', 142);
 * tracker.record('agent.architect.durationMs', 198);
 * console.log(tracker.getSummary());
 * ```
 */
export class PerformanceTracker {
  /** Map from metric name → accumulated samples. */
  private readonly metrics: Map<string, number[]> = new Map();

  /**
   * Record a sample value for a named metric.
   * @param metric - The metric name (e.g. "agent.research.durationMs").
   * @param value - The numeric value to record.
   */
  record(metric: string, value: number): void {
    const existing = this.metrics.get(metric);
    if (existing) {
      existing.push(value);
    } else {
      this.metrics.set(metric, [value]);
    }
  }

  /**
   * Compute summary statistics for a single metric.
   * @param metric - The metric name.
   * @returns The summary, or `null` if the metric has no samples.
   */
  getMetricSummary(metric: string): MetricSummary | null {
    const values = this.metrics.get(metric);
    if (!values || values.length === 0) {
      return null;
    }
    return computeSummary(values);
  }

  /**
   * Compute summary statistics for all recorded metrics.
   * @returns A record mapping metric names to their summaries.
   */
  getSummary(): Record<string, MetricSummary> {
    const summary: Record<string, MetricSummary> = {};

    for (const [metric, values] of this.metrics) {
      summary[metric] = computeSummary(values);
    }

    return summary;
  }

  /**
   * Get all metric names that have been recorded.
   * @returns Array of metric names.
   */
  getMetricNames(): string[] {
    return Array.from(this.metrics.keys());
  }

  /**
   * Get the raw sample values for a metric.
   * @param metric - The metric name.
   * @returns A copy of the sample array, or an empty array if no samples exist.
   */
  getSamples(metric: string): number[] {
    return [...(this.metrics.get(metric) ?? [])];
  }

  /**
   * Get the total number of samples across all metrics.
   * @returns Total sample count.
   */
  totalCount(): number {
    let count = 0;
    for (const values of this.metrics.values()) {
      count += values.length;
    }
    return count;
  }

  /**
   * Reset all recorded metrics.
   */
  reset(): void {
    this.metrics.clear();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute summary statistics for an array of numeric values.
 * @param values - Non-empty array of values.
 * @returns The computed summary.
 */
function computeSummary(values: number[]): MetricSummary {
  let total = 0;
  let min = Infinity;
  let max = -Infinity;

  for (const v of values) {
    total += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }

  return {
    avg: total / values.length,
    min,
    max,
    count: values.length,
    total,
  };
}
