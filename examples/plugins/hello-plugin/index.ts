/**
 * Hello Plugin — Example VoltSDK usage
 *
 * Demonstrates:
 * - Plugin lifecycle (activate/deactivate)
 * - Using the logger
 * - Publishing events
 * - Subscribing to events
 * - Health checks
 */

import type { VoltSDK, PluginEntryPoint } from '@volt-os/plugin-runtime';

let sdk: VoltSDK | null = null;

const entry: PluginEntryPoint = {
  async activate(sdkInstance: VoltSDK): Promise<void> {
    sdk = sdkInstance;
    sdk.logger.info('Hello Plugin activated');

    // Subscribe to events
    await sdk.events.subscribe('plugin.activated', (payload) => {
      sdk?.logger.info('Received activation event', payload);
    });

    // Publish a greeting event
    await sdk.events.publish('plugin.greeting', {
      message: 'Hello from the Hello Plugin!',
      timestamp: new Date().toISOString(),
    });
  },

  async deactivate(): Promise<void> {
    sdk?.logger.info('Hello Plugin deactivated');
    sdk = null;
  },

  async healthCheck() {
    return {
      status: sdk ? 'healthy' : 'unhealthy',
      details: sdk ? 'Plugin is active' : 'Plugin not initialized',
    };
  },
};

export default entry;
