/**
 * Memory Plugin — Example of memory operations through VoltSDK
 *
 * Demonstrates:
 * - Memory permissions (read + write)
 * - SDK memory API usage
 * - Permission enforcement
 */

import type { VoltSDK, PluginEntryPoint } from '@volt-os/plugin-runtime';

let sdk: VoltSDK | null = null;

const entry: PluginEntryPoint = {
  async activate(sdkInstance: VoltSDK): Promise<void> {
    sdk = sdkInstance;
    sdk.logger.info('Memory Plugin activated');

    // Write to memory
    await sdk.memory.write('last-check', new Date().toISOString());

    // Read from memory
    const lastCheck = await sdk.memory.read('last-check');
    sdk.logger.info('Last check time', { lastCheck });
  },

  async deactivate(): Promise<void> {
    sdk?.logger.info('Memory Plugin deactivated');
    sdk = null;
  },

  async healthCheck() {
    return {
      status: sdk ? 'healthy' : 'unhealthy',
    };
  },
};

export default entry;
