/**
 * @module model-api
 * Model API implementation for the VOLT OS Developer SDK.
 *
 * Pure delegation to the ModelRouter subsystem — no business logic.
 */

import { randomUUID } from 'node:crypto';
import type {
  ModelRequest as _ModelRequest,
  ModelResponse as _ModelResponse,
} from '@volt-os/model-router';
import type { ModelAPI } from '../types.js';

/**
 * Minimal interface for an IModelProvider.
 */
interface IModelProvider {
  readonly id: string;
  readonly type: string;
}

/**
 * Minimal interface for the parts of ModelRouter the SDK needs.
 */
interface ModelRouterLike {
  route(request: _ModelRequest): Promise<_ModelResponse>;
  getAvailableProviders(): IModelProvider[];
  getBudgetStatus(): { costUsd: number; tokens: number; requestCount: number };
}

/**
 * ModelAPI implementation that delegates to the ModelRouter.
 *
 * @example
 * ```ts
 * const api = new ModelAPIImpl(modelRouter);
 * const response = await api.request({
 *   agentId: 'researcher',
 *   messages: [{ role: 'user', content: 'Explain VOLT OS' }],
 * });
 * ```
 */
export class ModelAPIImpl implements ModelAPI {
  /**
   * Create a new ModelAPIImpl.
   * @param router - The ModelRouter subsystem.
   */
  constructor(private readonly router: ModelRouterLike) {}

  /**
   * Send a model request and get a response.
   * @param modelRequest - The model request (id is auto-generated).
   * @returns The model response.
   * @throws If no providers are available or budget is exceeded.
   */
  async request(modelRequest: Omit<_ModelRequest, 'id'>): Promise<_ModelResponse> {
    const fullRequest: _ModelRequest = {
      ...modelRequest,
      id: randomUUID(),
    };
    return this.router.route(fullRequest);
  }

  /**
   * List all configured model providers.
   * @returns Array of provider summaries.
   */
  listProviders(): Array<{ id: string; name: string; enabled: boolean }> {
    const providers = this.router.getAvailableProviders();
    return providers.map((p) => ({
      id: p.id,
      name: p.type,
      enabled: true,
    }));
  }

  /**
   * Get current budget usage and remaining quota.
   * @returns Budget status with spent and remaining amounts.
   */
  async getBudget(): Promise<{ spent: number; remaining: number }> {
    const status = this.router.getBudgetStatus();
    return {
      spent: status.costUsd,
      remaining: Math.max(0, 1.0 - status.costUsd),
    };
  }
}
